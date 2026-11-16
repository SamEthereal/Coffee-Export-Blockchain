// Ethiopian Coffee Export Consortium Blockchain System (CECBS)
// Payment Settlement & Verification API Routes

import express, { Request, Response } from 'express';
import { FabricService } from '../services/fabricService';
import { DatabaseService } from '../services/databaseService';
import { PaymentService } from '../services/paymentService';
import { logger } from '../utils/logger';
import { logAuditBestEffort } from '../utils/auditBestEffort';
import notificationService from '../services/notificationService';
import { validateRequest } from '../middleware/validation';
import { body, param } from 'express-validator';
import { statusManager } from '../utils/statusManager';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { blockchainCache, CacheKeys, CacheInvalidation } from '../services/blockchainCacheService';
import { validateBankAccount, validateBIC } from '../utils/fieldValidation';

/** Field validation 2026-11-16: BIC must be 8/11 chars (ISO 9362). */
const bicValidator = (field: string, label: string) =>
  body(field)
    .notEmpty().withMessage(`${label} is required`).bail()
    .custom((value) => {
      const result = validateBIC(value, label);
      if (!result.valid) throw new Error(result.error || 'Invalid BIC');
      return true;
    });

/** Field validation 2026-11-16: account must fit the named bank (CBE: 13 digits, 1000…). */
const bankAccountValidator = (bankField: string) => (value: unknown, { req }: any) => {
  const result = validateBankAccount(req?.body?.[bankField], value);
  if (!result.valid) throw new Error(result.error || 'Invalid bank account number');
  return true;
};

const router = express.Router();
const fabricService = FabricService.getInstance();
const postgresDb = DatabaseService.getInstance();
const paymentService = PaymentService.getInstance();

// txId placement (release-endpoint pattern): every payment response
// carries the chain txId BOTH top-level and under data.txId, so a
// caller reading either place can verify the chain write. The
// chaincode payload is returned as data; when it is an object the
// txId is merged into it, otherwise data is left untouched and the
// top-level txId still carries the proof.
function withTxId(data: any, txId: string | null | undefined): any {
  if (data && typeof data === 'object' && !Array.isArray(data)) return { ...data, txId: txId || null };
  return data;
}

/**
 * Best-effort PG mirror of a payment's settlement-machine status.
 * Ledger-first: only called after the chaincode call succeeded, and a
 * PG failure never fails the response (same pattern as the initiate
 * mirror at POST /initiate and the settle mirror below). A no-op when
 * the payment has no PG row yet — e.g. LC-release-path payments are
 * chaincode-only (banking.ts ReleaseLCPayment writes no PG row), so
 * their mirrors affect 0 rows until a PG row exists.
 */
async function mirrorPaymentStatus(
  paymentID: string,
  status: string,
  swiftReference?: string,
): Promise<void> {
  try {
    if (swiftReference !== undefined) {
      await postgresDb.run(
        `UPDATE payments SET status = $1, swift_reference = $2 WHERE payment_id = $3`,
        [status, swiftReference, paymentID],
      );
    } else {
      await postgresDb.run(
        `UPDATE payments SET status = $1 WHERE payment_id = $2`,
        [status, paymentID],
      );
    }
  } catch (mirrorErr) {
    logger.warn(`[PAYMENT] Could not mirror ${status} of ${paymentID} to Postgres:`, mirrorErr);
  }
}

type SwiftSettleGuard =
  | { ok: true }
  | { ok: false; status: number; code: string; message: string };

/**
 * C1 guard for the settle handler: never settle against a REJECTED SWIFT
 * message. Chaincode SettlePayment (payment.go) never looks at any SWIFT
 * message — it only stores the supplied swiftReference — so the API must
 * check. swiftReference is a *field* on a SWIFT message (swift.go
 * QuerySWIFTMessagesByReference selects on `swiftReference`), not a
 * message ID, so resolve it two ways: by reference, and by the messages
 * linked to this payment (catches a caller supplying a fresh reference
 * to dodge a rejected one).
 *
 * Exact rule:
 * - Any collected message with status REJECTED → 400 SWIFT_MESSAGE_REJECTED.
 * - SWIFT_RECEIVED payments must be corroborated: the reference has to
 *   resolve to a SWIFT message (by reference or by payment link) OR match
 *   the reference the SWIFT flow itself recorded on the payment
 *   (payment.swiftDetails.swiftReference — InitiateSWIFTTransfer writes
 *   it there and creates no SWIFT message doc, so "no doc" alone must
 *   NOT block that flow; the missing-steps suite settles SWIFT_RECEIVED
 *   payments this way with SWIFT-$TS). Otherwise → 400
 *   SWIFT_MESSAGE_NOT_FOUND: the payment claims SWIFT was received yet
 *   the reference matches nothing the ledger knows.
 * - VERIFIED payments need no SWIFT message at all: SettlePayment
 *   accepts VERIFIED directly, and the crud suite settles VERIFIED
 *   payments with invented references (SWIFT-SETTLE-<ts>) that resolve
 *   to no message. Only a REJECTED message (above) blocks them.
 * - A failed SWIFT lookup itself (ledger error, not "no message") →
 *   503 SWIFT_LOOKUP_FAILED: fail closed, do not settle blind.
 */
async function checkSwiftForSettle(
  paymentID: string,
  swiftReference: string,
  paymentStatus: string,
  payment: any,
): Promise<SwiftSettleGuard> {
  const byReference = await fabricService.queryChaincode('QuerySWIFTMessagesByReference', [swiftReference]);
  if (!byReference.success) {
    return {
      ok: false,
      status: 503,
      code: 'SWIFT_LOOKUP_FAILED',
      message: `Could not verify SWIFT message for reference ${swiftReference} on the ledger: ${byReference.error || 'query failed'}`,
    };
  }
  const byPayment = await fabricService.queryChaincode('QuerySWIFTMessagesByPayment', [paymentID]);
  if (!byPayment.success) {
    return {
      ok: false,
      status: 503,
      code: 'SWIFT_LOOKUP_FAILED',
      message: `Could not verify SWIFT messages for payment ${paymentID} on the ledger: ${byPayment.error || 'query failed'}`,
    };
  }
  const messages: any[] = [
    ...(Array.isArray(byReference.data) ? byReference.data : []),
    ...(Array.isArray(byPayment.data) ? byPayment.data : []),
  ];
  const rejected = messages.find((m: any) => (m?.status || m?.Status) === 'REJECTED');
  if (rejected) {
    const rejectedId = rejected.messageId || rejected.MessageID || rejected.messageID || swiftReference;
    const reason = rejected.rejectionReason || rejected.RejectionReason;
    return {
      ok: false,
      status: 400,
      code: 'SWIFT_MESSAGE_REJECTED',
      message: `Cannot settle payment: SWIFT message ${rejectedId} (reference ${swiftReference}) is REJECTED${reason ? `: ${reason}` : ''}`,
    };
  }
  if (paymentStatus === 'SWIFT_RECEIVED') {
    const swiftDetails = payment?.swiftDetails || payment?.SWIFTDetails;
    const storedRef = swiftDetails?.swiftReference || swiftDetails?.SWIFTReference;
    if (messages.length === 0 && storedRef !== swiftReference) {
      return {
        ok: false,
        status: 400,
        code: 'SWIFT_MESSAGE_NOT_FOUND',
        message: `Cannot settle payment: no SWIFT message found for reference ${swiftReference} and it does not match the reference recorded on the payment`,
      };
    }
  }
  return { ok: true };
}

/**
 * @swagger
 * /api/v1/payments/initiate:
 *   post:
 *     summary: Initiate payment process
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - paymentID
 *               - contractID
 *               - exporterID
 *               - lcID
 *               - amount
 *               - currency
 *               - receivingBank
 *               - receivingBankBIC
 *               - beneficiaryName
 *               - beneficiaryAccount
 *               - paymentMethod
 *             properties:
 *               paymentID:
 *                 type: string
 *               contractID:
 *                 type: string
 *               exporterID:
 *                 type: string
 *               lcID:
 *                 type: string
 *               amount:
 *                 type: string
 *               currency:
 *                 type: string
 *               receivingBank:
 *                 type: string
 *               receivingBankBIC:
 *                 type: string
 *               beneficiaryName:
 *                 type: string
 *               beneficiaryAccount:
 *                 type: string
 *               paymentMethod:
 *                 type: string
 *     responses:
 *       201:
 *         description: Payment initiated successfully
 *       400:
 *         description: Invalid input data
 *       500:
 *         description: Internal server error
 */
router.post('/initiate',
  requireRole(['EXPORTER', 'BANKS', 'BANK_ADMIN']),
  [
    body('paymentID').notEmpty().withMessage('Payment ID is required'),
    body('contractID').notEmpty().withMessage('Contract ID is required'),
    body('exporterID').notEmpty().withMessage('Exporter ID is required'),
    body('lcID').notEmpty().withMessage('LC ID is required'),
    body('amount').notEmpty().withMessage('Amount is required'),
    body('currency').notEmpty().withMessage('Currency is required'),
    body('receivingBank').notEmpty().withMessage('Receiving bank is required'),
    bicValidator('receivingBankBIC', 'Receiving bank BIC'),
    body('beneficiaryName').notEmpty().withMessage('Beneficiary name is required'),
    body('beneficiaryAccount').notEmpty().withMessage('Beneficiary account is required').bail()
      .custom(bankAccountValidator('receivingBank')),
    body('paymentMethod').notEmpty().withMessage('Payment method is required'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const {
        paymentID,
        contractID,
        exporterID,
        lcID,
        amount,
        currency,
        receivingBank,
        receivingBankBIC,
        beneficiaryName,
        beneficiaryAccount,
        paymentMethod,
      } = req.body;

      logger.info(`[PAYMENT] Initiating payment: ${paymentID} with method: ${paymentMethod}`);

      // Connect as BanksMSP to initiate payment
      await fabricService.connectAsOrg('BanksMSP');

      // AUTO-MAPPING: Fetch LC, Contract, and Forex data to auto-populate payment fields
      let autoMappedData: any = {};
      try {
        // Get LC details
        const lcResult = await fabricService.queryChaincode('ReadLC', [lcID]);
        if (lcResult.success && lcResult.data) {
          const lc = lcResult.data;
          autoMappedData.amount = lc.Amount || lc.amount || '0';
          autoMappedData.currency = lc.Currency || lc.currency || 'USD';
          autoMappedData.contractID = lc.ContractID || lc.contractID || contractID;
          autoMappedData.issuingBank = lc.IssuingBank || lc.issuingBank || '';
          logger.info(`[PAYMENT] Auto-mapped from LC: amount=${autoMappedData.amount}, currency=${autoMappedData.currency}`);
        }
        
        // Get Contract details for exporter info
        const contractResult = await fabricService.queryChaincode('ReadSalesContract', [contractID || autoMappedData.contractID]);
        if (contractResult.success && contractResult.data) {
          const contract = contractResult.data;
          autoMappedData.exporterID = contract.ExporterID || contract.exporterID || exporterID;
          autoMappedData.exporterBank = contract.ExporterBank || contract.exporterBank || '';
          logger.info(`[PAYMENT] Auto-mapped from contract: exporterID=${autoMappedData.exporterID}, exporterBank=${autoMappedData.exporterBank}`);
        }
      } catch (error) {
        logger.warn('[PAYMENT] Could not fetch LC/Contract for auto-mapping:', error);
      }

      // Use provided values or auto-mapped values with smart defaults
      const finalContractID = contractID || autoMappedData.contractID || '';
      const finalExporterID = exporterID || autoMappedData.exporterID || '';
      const finalAmount = amount || autoMappedData.amount || '0';
      const finalCurrency = currency || autoMappedData.currency || 'USD';
      const finalReceivingBank = receivingBank || autoMappedData.exporterBank || 'Commercial Bank of Ethiopia';
      const finalReceivingBankBIC = receivingBankBIC || 'CBETETAA';
      const finalBeneficiaryName = beneficiaryName || finalExporterID;
      const finalBeneficiaryAccount = beneficiaryAccount || `${finalExporterID}-001`;
      const finalPaymentMethod = paymentMethod || 'LC';

      // LEG3 M-8a: do not trust the client-computed amount. Recompute it
      // server-side as shipment quantity x contract pricePerKg — the exact
      // formula the Exporter portal uses — and reject a provable mismatch.
      // Best-effort reads: if the shipment or contract cannot be read, the
      // check is skipped (logged) rather than blocking initiation; a
      // mismatch that CAN be proven is a 400.
      const shipmentIDForAmount = (req.body as any).shipmentID;
      if (shipmentIDForAmount) {
        try {
          const [shipRes, contractRes] = await Promise.all([
            fabricService.queryChaincode('ReadShipment', [shipmentIDForAmount]),
            fabricService.queryChaincode('ReadSalesContract', [finalContractID]),
          ]);
          const qty = Number(shipRes?.data?.Quantity ?? shipRes?.data?.quantity);
          const price = Number(contractRes?.data?.PricePerKg ?? contractRes?.data?.pricePerKg);
          if (Number.isFinite(qty) && Number.isFinite(price) && qty > 0 && price > 0) {
            const expectedAmount = Math.round(qty * price * 100) / 100;
            const suppliedAmount = Number(finalAmount);
            if (Number.isFinite(suppliedAmount) && Math.abs(suppliedAmount - expectedAmount) > 0.01) {
              return res.status(400).json({
                success: false,
                error: {
                  code: 'AMOUNT_MISMATCH',
                  message: `Payment amount ${suppliedAmount} does not match the shipment value ${expectedAmount} (${qty} kg x $${price}/kg)`,
                  expectedAmount,
                  suppliedAmount,
                },
                timestamp: new Date().toISOString(),
              });
            }
          }
        } catch (amountCheckErr) {
          logger.warn(`[PAYMENT] Could not verify initiate amount for ${paymentID}:`, amountCheckErr);
        }
      }

      // LEG3 M-8b: re-initiate is idempotent. paymentID is PAY-<shipmentId>,
      // so a re-click on the same shipment used to fail on-chain with a
      // duplicate-ID error. If the payment already exists, return it
      // (200, alreadyExists) instead of submitting a duplicate.
      try {
        const existingPayment = await fabricService.queryChaincode('ReadPayment', [paymentID]);
        if (existingPayment.success && existingPayment.data) {
          // Obs. 5 (2026-11-16): this idempotent re-initiate path
          // returned 200 with no txId, although the initiate tx is
          // stored on the PG row. Surface it (best-effort PG lookup)
          // the way the fresh-initiate 201 below does.
          let existingTxId: string | null = null;
          try {
            const pgRow: any = await postgresDb.get(
              `SELECT blockchain_tx_id FROM payments WHERE payment_id = $1`,
              [paymentID]
            );
            existingTxId = pgRow?.blockchain_tx_id || null;
          } catch (txLookupErr) {
            logger.warn(`[PAYMENT] Could not look up initiate txId for existing payment ${paymentID}:`, txLookupErr);
          }
          return res.status(200).json({
            success: true,
            alreadyExists: true,
            message: 'Payment already initiated for this shipment',
            data: withTxId(existingPayment.data, existingTxId),
            txId: existingTxId,
            blockchainTxId: existingTxId,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (existingErr) {
        logger.warn(`[PAYMENT] Could not check for existing payment ${paymentID}, proceeding:`, existingErr);
      }

      const result = await fabricService.invokeChaincode('InitiatePayment', [
        paymentID,
        finalContractID,
        finalExporterID,
        lcID,
        finalAmount.toString(),
        finalCurrency,
        finalReceivingBank,
        finalReceivingBankBIC,
        finalBeneficiaryName,
        finalBeneficiaryAccount,
        finalPaymentMethod,
      ]);

      if (result.success) {
        logger.info(`✅ [PAYMENT] Payment initiated successfully: ${paymentID} with auto-mapped data`);
        // Mirror into Postgres: without a row here, every downstream
        // mirror is a no-op — settle's UPDATE (below) affects 0 rows and
        // the payment is chaincode-only. Best-effort, ledger-first: the
        // initiation already committed on-chain; a PG failure must not
        // fail the response. Columns mirror POST /payments (same table).
        try {
          // LEG3 M-5: fill the retention-split columns, not just amount.
          // The old mirror left amount_usd / retention_amount /
          // release_amount NULL, so a release of an initiate-path payment
          // reported releaseAmount: null / totalAmount: null (the
          // notification said "released: null USD"). The NBE split is
          // 40% retention / 60% release — the same split recordPayment
          // (paymentService.ts) applies.
          const initiatedTotal = Number(finalAmount) || 0;
          const initiatedRetention = Math.round(initiatedTotal * 0.4 * 100) / 100;
          const initiatedRelease = Math.round((initiatedTotal - initiatedRetention) * 100) / 100;
          await postgresDb.run(
            `INSERT INTO payments (
              payment_id, lc_number, contract_id, shipment_id, exporter_id, amount, currency, payment_method, payment_date, blockchain_tx_id,
              amount_usd, retention_amount, release_amount, retention_status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            ON CONFLICT (payment_id) DO UPDATE SET
              amount_usd = EXCLUDED.amount_usd,
              retention_amount = EXCLUDED.retention_amount,
              release_amount = EXCLUDED.release_amount`,
            [paymentID, lcID || null, finalContractID, (req.body as any).shipmentID || null, finalExporterID, finalAmount, finalCurrency, finalPaymentMethod, new Date().toISOString(), result.txId || null,
             initiatedTotal, initiatedRetention, initiatedRelease, 'RECEIVED']
          );
        } catch (mirrorErr) {
          logger.warn(`[PAYMENT] Could not mirror initiation of ${paymentID} to Postgres:`, mirrorErr);
        }
        // Audit: this chain move never wrote an audit_trail row.
        // Best-effort — a failed audit write must not fail the move.
        await logAuditBestEffort(req, {
          entityType: 'PAYMENT',
          entityId: paymentID,
          action: 'INITIATE',
          blockchainTxId: result.txId || undefined,
          metadata: { lcID: lcID, contractID: finalContractID, exporterID: finalExporterID, amount: finalAmount, blockchainTxId: result.txId || null },
        }, `payment ${paymentID} initiate`);

        res.status(201).json({
          success: true,
          message: 'Payment initiated successfully',
          data: withTxId(result.data, result.txId),
          autoMapped: {
            contractID: finalContractID,
            exporterID: finalExporterID,
            amount: finalAmount,
            currency: finalCurrency,
            receivingBank: finalReceivingBank,
            receivingBankBIC: finalReceivingBankBIC,
            beneficiaryName: finalBeneficiaryName,
            beneficiaryAccount: finalBeneficiaryAccount,
            paymentMethod: finalPaymentMethod,
          },
          txId: result.txId,
          timestamp: new Date().toISOString(),
        });
      } else {
        logger.error(`❌ [PAYMENT] Failed to initiate payment: ${result.error}`);
        res.status(400).json({
          success: false,
          error: {
            code: 'INITIATION_FAILED',
            message: result.error || 'Failed to initiate payment',
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.error('[PAYMENT] Error initiating payment:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * @swagger
 * /api/v1/payments/record:
 *   post:
 *     summary: Record payment receipt
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - paymentID
 *               - shipmentID
 *               - lcNumber
 *               - amount
 *               - currency
 *               - paymentMethod
 *             properties:
 *               paymentID:
 *                 type: string
 *               shipmentID:
 *                 type: string
 *               lcNumber:
 *                 type: string
 *               amount:
 *                 type: number
 *               currency:
 *                 type: string
 *               paymentMethod:
 *                 type: string
 *               bankReference:
 *                 type: string
 *               swiftMessage:
 *                 type: string
 *               paymentProof:
 *                 type: string
 *     responses:
 *       201:
 *         description: Payment recorded successfully
 *       400:
 *         description: Invalid input data
 *       500:
 *         description: Internal server error
 */
router.post('/record',
  authMiddleware,
  requireRole(['BANKS', 'BANK_ADMIN']),
  [
    body('paymentID').notEmpty().withMessage('Payment ID is required'),
    body('contractID').notEmpty().withMessage('Contract ID is required'),
    body('shipmentID').notEmpty().withMessage('Shipment ID is required'),
    body('exporterID').notEmpty().withMessage('Exporter ID is required'),
    body('amountUSD').isNumeric().withMessage('Amount must be a number'),
    body('currency').notEmpty().withMessage('Currency is required'),
    body('paymentDate').notEmpty().withMessage('Payment date is required'),
    body('payerName').notEmpty().withMessage('Payer name is required'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const paymentData = {
        paymentID: req.body.paymentID,
        contractID: req.body.contractID,
        shipmentID: req.body.shipmentID,
        exporterID: req.body.exporterID,
        lcID: req.body.lcID,
        forexID: req.body.forexID,
        amountUSD: parseFloat(req.body.amountUSD),
        currency: req.body.currency,
        swiftReference: req.body.swiftReference,
        paymentDate: req.body.paymentDate,
        payerName: req.body.payerName,
        payerBank: req.body.payerBank,
        userId: user.username,
        userOrg: user.org
      };

      logger.info(`[PAYMENT] Recording payment: ${paymentData.paymentID} with 40% NBE retention`);

      // Use PaymentService with automatic 40% retention
      const result = await paymentService.recordPayment(paymentData);

      logger.info(`✅ [PAYMENT] Payment recorded: ${result.paymentID}, Total: $${result.totalAmount}, Retention: $${result.retentionAmount} (40%), Release: $${result.releaseAmount} (60%)`);
      // In-app notification (persisted feed + live WS broadcast).
      await notificationService.emitWorkflowEvent({
        type: 'payment_received',
        title: `Payment ${paymentData.paymentID} recorded`,
        message: `Payment ${paymentData.paymentID} was recorded for shipment ${paymentData.shipmentID} (USD ${Number(paymentData.amountUSD || 0).toLocaleString()}; 40% NBE retention applied).`,
        entityType: 'payment', entityId: paymentData.paymentID, severity: 'success',
        roles: ['BANKS', 'NBE'], exporterId: paymentData.exporterID,
        actionUrl: '/portals/exporter?tab=payments',
        actionUrls: { BANKS: '/portals/banks?tab=contracts', NBE: '/portals/nbe?tab=contracts' },
      });
      
      res.status(201).json({
        success: true,
        message: 'Payment recorded successfully with 40% NBE retention',
        data: {
          paymentID: result.paymentID,
          status: result.status,
          retentionStatus: result.retentionStatus,
          totalAmount: result.totalAmount,
          retentionAmount: result.retentionAmount,
          releaseAmount: result.releaseAmount,
          retentionRate: result.retentionRate,
          blockchainTxId: result.blockchainTxId
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('[PAYMENT] Error recording payment:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Internal server error',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * @swagger
 * /api/v1/payments/{paymentID}/documents:
 *   post:
 *     summary: Submit payment documents
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: paymentID
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - documents
 *             properties:
 *               documents:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Documents submitted successfully
 *       400:
 *         description: Invalid input data
 *       500:
 *         description: Internal server error
 */
router.post('/:paymentID/documents',
  requireRole(['BANKS', 'BANK_ADMIN']),
  [
    param('paymentID').notEmpty().withMessage('Payment ID is required'),
    body('documents').isArray().withMessage('Documents must be an array'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { paymentID } = req.params;
      const { documents } = req.body;

      logger.info(`[PAYMENT] Submitting documents for payment: ${paymentID}`);

      await fabricService.connectAsOrg('BanksMSP');

      // Chaincode expects documents as a JSON-stringified array of strings
      // Each document should be a JSON string within the array
      const documentStrings = documents.map((doc: any) => JSON.stringify(doc));
      
      const result = await fabricService.invokeChaincode('SubmitPaymentDocuments', [
        paymentID,
        JSON.stringify(documentStrings), // Pass array as single JSON string parameter
      ]);

      if (result.success) {
        logger.info(`✅ [PAYMENT] Documents submitted for: ${paymentID}`);
        // M4: mirror the intermediate state to PG (ledger-first,
        // best-effort — the chain call above already succeeded).
        await mirrorPaymentStatus(paymentID, 'DOCUMENTS_SUBMITTED');
        // Audit: this chain move never wrote an audit_trail row.
        // Best-effort — a failed audit write must not fail the move.
        await logAuditBestEffort(req, {
          entityType: 'PAYMENT',
          entityId: paymentID,
          action: 'SUBMIT_DOCUMENTS',
          newValue: 'DOCUMENTS_SUBMITTED',
          blockchainTxId: result.txId || undefined,
          metadata: { blockchainTxId: result.txId || null },
        }, `payment ${paymentID} submit-documents`);

        res.json({
          success: true,
          message: 'Payment documents submitted successfully',
          data: withTxId(result.data, result.txId),
          txId: result.txId,
          timestamp: new Date().toISOString(),
        });
      } else {
        logger.error(`❌ [PAYMENT] Failed to submit documents: ${result.error}`);
        res.status(400).json({
          success: false,
          error: {
            code: 'SUBMISSION_FAILED',
            message: result.error || 'Failed to submit documents',
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.error('[PAYMENT] Error submitting documents:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * @swagger
 * /api/v1/payments/{paymentID}/verify:
 *   post:
 *     summary: Verify payment documents
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: paymentID
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - verifiedBy
 *               - comments
 *             properties:
 *               verifiedBy:
 *                 type: string
 *               comments:
 *                 type: string
 *     responses:
 *       200:
 *         description: Documents verified successfully
 *       400:
 *         description: Invalid input data
 *       500:
 *         description: Internal server error
 */
// LEG3 M-9: comments is optional here, matching the banking route
// (POST /banking/payment/:id/verify-documents, the only UI caller) which
// requires only verifiedBy. Both routes call VerifyPaymentDocuments; the
// stricter requirement here made this route unusable without a comment
// for no functional reason.
router.post('/:paymentID/verify',
  requireRole(['BANKS', 'BANK_ADMIN']),
  [
    param('paymentID').notEmpty().withMessage('Payment ID is required'),
    body('verifiedBy').notEmpty().withMessage('Verified by is required'),
    body('comments').optional().isString(),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { paymentID } = req.params;
      const { verifiedBy, comments } = req.body;

      logger.info(`[PAYMENT] Verifying documents for payment: ${paymentID}`);

      await fabricService.connectAsOrg('BanksMSP');

      const result = await fabricService.invokeChaincode('VerifyPaymentDocuments', [
        paymentID,
        verifiedBy,
        comments || 'Documents verified against LC terms',
      ]);

      if (result.success) {
        logger.info(`✅ [PAYMENT] Documents verified for: ${paymentID}`);
        // M4: mirror the intermediate state to PG (ledger-first,
        // best-effort — the chain call above already succeeded).
        await mirrorPaymentStatus(paymentID, 'VERIFIED');
        // Audit: this chain move never wrote an audit_trail row.
        // Best-effort — a failed audit write must not fail the move.
        await logAuditBestEffort(req, {
          entityType: 'PAYMENT',
          entityId: paymentID,
          action: 'VERIFY_DOCUMENTS',
          newValue: 'VERIFIED',
          blockchainTxId: result.txId || undefined,
          metadata: { verifiedBy, comments, blockchainTxId: result.txId || null },
        }, `payment ${paymentID} verify-documents`);

        res.json({
          success: true,
          message: 'Payment documents verified successfully',
          data: withTxId(result.data, result.txId),
          txId: result.txId,
          timestamp: new Date().toISOString(),
        });
      } else {
        logger.error(`❌ [PAYMENT] Failed to verify documents: ${result.error}`);
        // M-9 probe fix: the chaincode reports a missing payment as
        // "VerifyPaymentDocuments: payment <id> does not exist"
        // (payment.go) — that is a 404, not a 400 chain failure.
        // The /does not exist/ match is the chaincode's own wording for
        // a missing ledger record, distinct from every other verify
        // failure (wrong status, validation), which stay 400.
        if (/does not exist/i.test(result.error || '')) {
          return res.status(404).json({
            success: false,
            error: {
              code: 'PAYMENT_NOT_FOUND',
              message: result.error || `Payment ${paymentID} does not exist`,
            },
            timestamp: new Date().toISOString(),
          });
        }
        res.status(400).json({
          success: false,
          error: {
            code: 'VERIFICATION_FAILED',
            message: result.error || 'Failed to verify documents',
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.error('[PAYMENT] Error verifying documents:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * @swagger
 * /api/v1/payments/{paymentID}/swift/initiate:
 *   post:
 *     summary: Initiate SWIFT transfer
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: paymentID
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - swiftReference
 *               - senderBIC
 *               - messageType
 *               - valueDate
 *               - charges
 *               - remittanceInfo
 *             properties:
 *               swiftReference:
 *                 type: string
 *               senderBIC:
 *                 type: string
 *               messageType:
 *                 type: string
 *               valueDate:
 *                 type: string
 *               intermediary1:
 *                 type: string
 *               intermediary2:
 *                 type: string
 *               charges:
 *                 type: string
 *               remittanceInfo:
 *                 type: string
 *     responses:
 *       200:
 *         description: SWIFT transfer initiated successfully
 *       400:
 *         description: Invalid input data
 *       500:
 *         description: Internal server error
 */
router.post('/:paymentID/swift/initiate',
  requireRole(['BANKS', 'BANK_ADMIN']),
  [
    param('paymentID').notEmpty().withMessage('Payment ID is required'),
    body('swiftReference').notEmpty().withMessage('SWIFT reference is required'),
    bicValidator('senderBIC', 'Sender BIC'),
    body('messageType').notEmpty().withMessage('Message type is required'),
    body('valueDate').notEmpty().withMessage('Value date is required'),
    body('charges').notEmpty().withMessage('Charges are required'),
    body('remittanceInfo').notEmpty().withMessage('Remittance info is required'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { paymentID } = req.params;
      const { swiftReference, senderBIC, messageType, valueDate, intermediary1, intermediary2, charges, remittanceInfo } = req.body;

      logger.info(`[PAYMENT] Initiating SWIFT transfer for payment: ${paymentID}`);

      await fabricService.connectAsOrg('BanksMSP');

      const result = await fabricService.invokeChaincode('InitiateSWIFTTransfer', [
        paymentID,
        swiftReference,
        senderBIC,
        messageType,
        valueDate,
        intermediary1 || '',
        intermediary2 || '',
        charges,
        remittanceInfo,
      ]);

      if (result.success) {
        logger.info(`✅ [PAYMENT] SWIFT transfer initiated: ${paymentID}`);
        // M4: mirror the intermediate state to PG (ledger-first,
        // best-effort). The reference is mirrored too: this is the first
        // point an initiate-path payment carries one (the initiate
        // mirror stores no swift_reference).
        await mirrorPaymentStatus(paymentID, 'SWIFT_INITIATED', swiftReference);
        // Audit: this chain move never wrote an audit_trail row.
        // Best-effort — a failed audit write must not fail the move.
        await logAuditBestEffort(req, {
          entityType: 'PAYMENT',
          entityId: paymentID,
          action: 'INITIATE_SWIFT_TRANSFER',
          newValue: 'SWIFT_INITIATED',
          blockchainTxId: result.txId || undefined,
          metadata: { swiftReference, blockchainTxId: result.txId || null },
        }, `payment ${paymentID} swift-initiate`);

        res.json({
          success: true,
          message: 'SWIFT transfer initiated successfully',
          data: result.data,
          txId: result.txId,
          timestamp: new Date().toISOString(),
        });
      } else {
        logger.error(`❌ [PAYMENT] Failed to initiate SWIFT: ${result.error}`);
        res.status(400).json({
          success: false,
          error: {
            code: 'SWIFT_INITIATION_FAILED',
            message: result.error || 'Failed to initiate SWIFT transfer',
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.error('[PAYMENT] Error initiating SWIFT:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * @swagger
 * /api/v1/payments/{paymentID}/swift/confirm:
 *   post:
 *     summary: Confirm SWIFT receipt
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: paymentID
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - receivedBy
 *             properties:
 *               receivedBy:
 *                 type: string
 *     responses:
 *       200:
 *         description: SWIFT receipt confirmed successfully
 *       400:
 *         description: Invalid input data
 *       500:
 *         description: Internal server error
 */
router.post('/:paymentID/swift/confirm',
  requireRole(['BANKS', 'BANK_ADMIN']),
  [
    param('paymentID').notEmpty().withMessage('Payment ID is required'),
    body('receivedBy').notEmpty().withMessage('Received by is required'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { paymentID } = req.params;
      const { receivedBy } = req.body;

      logger.info(`[PAYMENT] Confirming SWIFT receipt for payment: ${paymentID}`);

      await fabricService.connectAsOrg('BanksMSP');

      const result = await fabricService.invokeChaincode('ConfirmSWIFTReceipt', [
        paymentID,
        receivedBy,
      ]);

      if (result.success) {
        logger.info(`✅ [PAYMENT] SWIFT receipt confirmed: ${paymentID}`);
        // M4: mirror the intermediate state to PG (ledger-first,
        // best-effort — the chain call above already succeeded).
        await mirrorPaymentStatus(paymentID, 'SWIFT_RECEIVED');
        // Audit: this chain move never wrote an audit_trail row.
        // Best-effort — a failed audit write must not fail the move.
        await logAuditBestEffort(req, {
          entityType: 'PAYMENT',
          entityId: paymentID,
          action: 'CONFIRM_SWIFT_RECEIPT',
          newValue: 'SWIFT_RECEIVED',
          blockchainTxId: result.txId || undefined,
          metadata: { blockchainTxId: result.txId || null },
        }, `payment ${paymentID} swift-confirm`);

        res.json({
          success: true,
          message: 'SWIFT receipt confirmed successfully',
          data: result.data,
          txId: result.txId,
          timestamp: new Date().toISOString(),
        });
      } else {
        logger.error(`❌ [PAYMENT] Failed to confirm SWIFT receipt: ${result.error}`);
        res.status(400).json({
          success: false,
          error: {
            code: 'SWIFT_CONFIRMATION_FAILED',
            message: result.error || 'Failed to confirm SWIFT receipt',
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.error('[PAYMENT] Error confirming SWIFT receipt:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * @swagger
 * /api/v1/payments/{paymentID}/settle:
 *   post:
 *     summary: Settle payment with NBE retention
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: paymentID
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - exchangeRate
 *               - retentionRate
 *               - payingBank
 *               - payingBankBIC
 *               - swiftReference
 *               - nbeApprovalRef
 *             properties:
 *               exchangeRate:
 *                 type: string
 *               retentionRate:
 *                 type: string
 *               payingBank:
 *                 type: string
 *               payingBankBIC:
 *                 type: string
 *               swiftReference:
 *                 type: string
 *               nbeApprovalRef:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payment settled successfully
 *       400:
 *         description: Invalid input data
 *       500:
 *         description: Internal server error
 */
router.post('/:paymentID/settle',
  requireRole(['BANKS', 'BANK_ADMIN']),
  [
    param('paymentID').notEmpty().withMessage('Payment ID is required'),
    body('exchangeRate').isFloat({ gt: 0 }).withMessage('Exchange rate must be greater than 0'),
    body('retentionRate').isFloat({ gt: 0, max: 100 }).withMessage('Retention rate must be between 0 and 100'),
    body('payingBank').notEmpty().withMessage('Paying bank is required'),
    bicValidator('payingBankBIC', 'Paying bank BIC'),
    body('swiftReference').notEmpty().withMessage('SWIFT reference is required'),
    body('nbeApprovalRef').notEmpty().withMessage('NBE approval reference is required'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { paymentID } = req.params;
      const { exchangeRate, retentionRate, payingBank, payingBankBIC, swiftReference, nbeApprovalRef } = req.body;

      logger.info(`[PAYMENT] Settling payment: ${paymentID}`);

      // Get current payment status for validation
      const paymentData = await fabricService.queryChaincode('ReadPayment', [paymentID]);
      if (!paymentData.success) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Payment not found' },
          timestamp: new Date().toISOString(),
        });
      }
      
      const currentStatus = paymentData.data?.status || paymentData.data?.Status || 'PENDING';
      
      // Validate status transition
      const isValid = statusManager.validateTransition('PAYMENT', currentStatus, 'SETTLED');
      if (!isValid) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TRANSITION',
            message: `Cannot settle payment: Invalid status transition from ${currentStatus} to SETTLED`,
            allowedStatuses: statusManager.getNextStatuses('PAYMENT', currentStatus),
          },
          timestamp: new Date().toISOString(),
        });
      }

      await fabricService.connectAsOrg('BanksMSP'); // Banks settle payments

      // C1: refuse to settle against a REJECTED SWIFT message (see
      // checkSwiftForSettle above for the exact rule). This runs before
      // any chain write: SettlePayment itself never checks the message.
      const swiftGuard = await checkSwiftForSettle(paymentID, swiftReference, currentStatus, paymentData.data);
      if (!swiftGuard.ok) {
        return res.status(swiftGuard.status).json({
          success: false,
          error: {
            code: swiftGuard.code,
            message: swiftGuard.message,
          },
          timestamp: new Date().toISOString(),
        });
      }

      // Settle on-chain via the canonical helper (TEST-STATUS-MATRIX
      // §17 #14) — the same SettlePayment call releasePayment makes.
      const result = await paymentService.settleOnChain({
        paymentID,
        exchangeRate: exchangeRate.toString(),
        retentionRate: retentionRate.toString(),
        payingBank,
        payingBankBIC,
        swiftReference,
        nbeApprovalRef,
      });

      if (result.success) {
        // Update status with cascading effects (LC, Forex, Contract statuses)
        await statusManager.updateEntityStatus('PAYMENT', paymentID, currentStatus, 'SETTLED');

        // Mirror into Postgres: the old handler only updated the chain, so
        // the payments row kept its pre-settlement status. Best-effort —
        // the settlement already committed on-chain.
        // Obs. 2 (2026-11-16): the mirror updated status only, so the row
        // kept blockchain_tx_id from InitiatePayment even after settle.
        // Point it at the settle tx too (COALESCE keeps the old tx when
        // the settle result carries none) — the same way the initiate
        // handler sets it.
        try {
          await postgresDb.run(
            `UPDATE payments SET status = 'SETTLED', blockchain_tx_id = COALESCE($2, blockchain_tx_id) WHERE payment_id = $1`,
            [paymentID, result.txId || null]
          );
        } catch (mirrorErr) {
          logger.warn(`[PAYMENT] Could not mirror settlement of ${paymentID} to Postgres:`, mirrorErr);
        }

        // Mirror the LC cascade: SettlePayment advances a PAYMENT_RELEASED
        // LC to SETTLED on-chain, but nothing mirrored that into PG, so
        // letters_of_credit stayed PAYMENT_RELEASED while the ledger said
        // SETTLED (found live 2026-11-14 on PAY_LC-CONT-E2E-FULL-20261114).
        // Ledger-first: read the LC's actual status and mirror it, so a
        // settle that did NOT cascade (LC not PAYMENT_RELEASED) changes
        // nothing. Best-effort — the settlement already committed.
        try {
          const lcId = (paymentData.data as any)?.lcId || (paymentData.data as any)?.LCID || (paymentData.data as any)?.lcID;
          if (lcId) {
            const lcRead = await fabricService.queryChaincode('ReadLC', [lcId]);
            const lcStatus = lcRead.success && lcRead.data ? ((lcRead.data as any).status || (lcRead.data as any).Status) : null;
            if (lcStatus === 'SETTLED') {
              await postgresDb.run(
                `UPDATE letters_of_credit SET status = 'SETTLED', updated_at = NOW() WHERE lc_id = $1`,
                [lcId]
              );
              logger.info(`✅ [PAYMENT] Mirrored LC cascade: ${lcId} → SETTLED in Postgres`);
            }
          }
        } catch (lcMirrorErr) {
          logger.warn(`[PAYMENT] Could not mirror LC cascade for settlement of ${paymentID}:`, lcMirrorErr);
        }
        
        logger.info(`✅ [PAYMENT] Payment settled: ${paymentID} (${currentStatus} → SETTLED)`);
        // Leftover 2: the settle route's SettlePayment call never left
        // a blockchain_signatures row, unlike release/convert.
        // Record it best-effort (recordChainSignature catches
        // internally and dedupes by txId) so a failed PG write cannot
        // turn a committed settlement into a 500.
        await paymentService.recordSettleSignature({
          paymentID,
          txId: result.txId || null,
          signerUsername: (req as any).user?.username || 'bank_admin',
        });
        // Step 15: the settle route also never left an audit_trail row
        // (release/convert/initiate all log theirs), so a settled
        // payment had no audit row carrying the SettlePayment txId.
        // Best-effort like the signature above — auditService.log()
        // never throws, so a failed audit write cannot turn a
        // committed settlement into a 500.
        try {
          const { AuditService } = await import('../services/auditService');
          await AuditService.getInstance().log({
            entityType: 'PAYMENT',
            entityId: paymentID,
            action: 'SETTLE',
            performedBy: (req as any).user?.username || 'bank_admin',
            organization: (req as any).user?.organization || 'BANKS',
            performedByOrg: (req as any).user?.organization || 'BANKS',
            oldValue: currentStatus,
            newValue: 'SETTLED',
            reason: `Payment settled (${currentStatus} → SETTLED)`,
            // Shared audit contract: top-level operation txId — the
            // SettlePayment tx (metadata already carries it).
            blockchainTxId: result.txId || undefined,
            metadata: {
              status: 'SETTLED',
              exchangeRate,
              retentionRate,
              payingBank,
              payingBankBIC,
              swiftReference,
              blockchainTxId: result.txId || null,
            },
          });
        } catch (auditErr) {
          logger.warn(`[PAYMENT] Could not write settle audit row for ${paymentID}:`, auditErr);
        }
        // In-app notification (persisted feed + live WS broadcast).
        await notificationService.emitWorkflowEvent({
          type: 'payment_settled',
          title: `Payment ${paymentID} settled`,
          message: `Payment ${paymentID} has been settled (${currentStatus} → SETTLED).`,
          entityType: 'payment', entityId: paymentID, severity: 'success',
          roles: ['BANKS', 'NBE'],
          actionUrl: '/portals/exporter?tab=payments',
          actionUrls: { BANKS: '/portals/banks?tab=contracts', NBE: '/portals/nbe?tab=contracts' },
        });
        // Settling moves the payment INTO the pending-release set, so
        // drop the cached full payment list — otherwise the tab misses
        // it for up to 30s (same invalidation as the release path).
        CacheInvalidation.paymentsAll();
        // Leftover 2: carry blockchainTxId alongside txId, top-level
        // and under data, the way convert/release do — the old settle
        // response had no blockchainTxId anywhere.
        const settleData: any = withTxId(result.data, result.txId);
        if (settleData && typeof settleData === 'object' && !Array.isArray(settleData)) {
          settleData.blockchainTxId = result.txId || null;
        }
        res.json({
          success: true,
          message: 'Payment settled successfully',
          data: settleData,
          txId: result.txId,
          blockchainTxId: result.txId || null,
          timestamp: new Date().toISOString(),
        });
      } else {
        logger.error(`❌ [PAYMENT] Failed to settle payment: ${result.error}`);
        res.status(400).json({
          success: false,
          error: {
            code: 'SETTLEMENT_FAILED',
            message: result.error || 'Failed to settle payment',
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.error('[PAYMENT] Error settling payment:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * @swagger
 * /api/v1/payments/{paymentID}/confirm:
 *   put:
 *     summary: Confirm payment settlement
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: paymentID
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - confirmedBy
 *               - confirmationType
 *             properties:
 *               confirmedBy:
 *                 type: string
 *               confirmationType:
 *                 type: string
 *                 enum: [BANK_VERIFICATION, NBE_APPROVAL, FOREX_REPATRIATION]
 *               remarks:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payment confirmed successfully
 *       400:
 *         description: Invalid input data
 *       404:
 *         description: Payment not found
 *       500:
 *         description: Internal server error
 */
router.put('/:paymentID/confirm',
  requireRole(['BANKS', 'BANK_ADMIN']),
  [
    param('paymentID').notEmpty().withMessage('Payment ID is required'),
    body('confirmedBy').notEmpty().withMessage('Confirmed by is required'),
    body('confirmationType').notEmpty().withMessage('Confirmation type is required'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { paymentID } = req.params;
      const { confirmedBy, confirmationType, remarks } = req.body;

      logger.info(`[PAYMENT] Confirming payment: ${paymentID} by ${confirmedBy}`);

      // Connect as appropriate MSP based on confirmation type
      if (confirmationType === 'NBE_APPROVAL') {
        await fabricService.connectAsOrg('NBEMSP');
      } else {
        await fabricService.connectAsOrg('BanksMSP');
      }

      const result = await fabricService.invokeChaincode('ConfirmSettlement', [
        paymentID,
        confirmedBy,
        confirmationType,
        remarks || '',
      ]);

      if (result.success) {
        logger.info(`✅ [PAYMENT] Payment confirmed successfully: ${paymentID}`);
        // LEG3 F5: mirror the confirmation into PG. The old handler
        // wrote to the ledger only, so PG payments.status stayed
        // SETTLED while the ledger said CONFIRMED. The chain write
        // already landed, so a PG failure must not turn this into a
        // 500 (a retry would fail — only SETTLED payments can be
        // confirmed); log it loudly and flag it in the response.
        let pgMirrorFailed = false;
        try {
          await postgresDb.run(
            `UPDATE payments SET status = 'CONFIRMED' WHERE payment_id = $1`,
            [paymentID]
          );
        } catch (pgErr) {
          pgMirrorFailed = true;
          logger.error(`[PAYMENT] Confirm landed on-chain but the PG mirror failed for ${paymentID}:`, pgErr);
        }
        // Audit: this chain move never wrote an audit_trail row.
        // Best-effort — a failed audit write must not fail the move.
        await logAuditBestEffort(req, {
          entityType: 'PAYMENT',
          entityId: paymentID,
          action: 'CONFIRM',
          oldValue: 'SETTLED',
          newValue: 'CONFIRMED',
          blockchainTxId: result.txId || undefined,
          metadata: { confirmedBy, confirmationType, remarks, blockchainTxId: result.txId || null },
        }, `payment ${paymentID} confirm`);

        res.json({
          success: true,
          message: 'Payment settlement confirmed',
          data: withTxId(result.data, result.txId),
          txId: result.txId,
          ...(pgMirrorFailed ? { pgMirrorFailed: true } : {}),
          timestamp: new Date().toISOString(),
        });
      } else {
        logger.error(`❌ [PAYMENT] Failed to confirm payment: ${result.error}`);
        res.status(400).json({
          success: false,
          error: {
            code: 'CONFIRMATION_FAILED',
            message: result.error || 'Failed to confirm payment',
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.error('[PAYMENT] Error confirming payment:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/v1/payments/:paymentID/convert-retention
 * LEG3 M-5: convert the retained (NBE 40%) portion of a payment from USD
 * to Birr. PaymentService.convertRetention existed with NO route and NO
 * UI caller, so RETENTION_CONVERTED was unreachable — and its PG update
 * referenced columns that did not exist (migration 073) while the
 * chaincode function it called did not exist either (payment.go
 * ConvertRetention, seq 8). All three layers now exist.
 */
router.post('/:paymentID/convert-retention',
  authMiddleware,
  requireRole(['NBE', 'NBE_ADMIN', 'ADMIN']),
  [
    param('paymentID').notEmpty().withMessage('Payment ID is required'),
    body('exchangeRate').isFloat({ gt: 0 }).withMessage('Exchange rate must be greater than 0'),
    body('amountBirr').isFloat({ gt: 0 }).withMessage('Converted amount (Birr) must be greater than 0'),
    body('convertedBy').notEmpty().withMessage('Converted by is required'),
    body('conversionRef').notEmpty().withMessage('Conversion reference is required'),
    body('conversionDate').notEmpty().withMessage('Conversion date is required'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { paymentID } = req.params;
      const { exchangeRate, amountBirr, convertedBy, conversionRef, conversionDate } = req.body;
      const user = (req as any).user;

      logger.info(`[PAYMENT] Converting retention for payment: ${paymentID}`);

      const result = await paymentService.convertRetention({
        paymentID,
        exchangeRate: Number(exchangeRate),
        amountBirr: Number(amountBirr),
        convertedBy,
        conversionRef,
        conversionDate,
        userId: String(user?.userId || user?.sub || convertedBy),
        userOrg: user?.organization || user?.org || 'NBE',
      });

      res.json({
        success: true,
        message: 'Retention converted successfully',
        data: result,
        // N7: top-level txId, mirroring the release route — the convert
        // response used to carry no txId at all (the NBE portal's
        // "Blockchain TX" suffix was always empty for conversions).
        txId: (result as any).txId || null,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error('[PAYMENT] Error converting retention:', error);
      const message = error?.message || 'Internal server error';
      // F-8: client-state failures (not found, already converted, wrong
      // on-chain status) are 4xx, not 500.
      if (/not found/i.test(message)) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message },
          timestamp: new Date().toISOString(),
        });
      }
      if (/already converted/i.test(message) || /cannot have its retention converted/i.test(message)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_STATE', message },
          timestamp: new Date().toISOString(),
        });
      }
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * @swagger
 * /api/v1/payments:
 *   get:
 *     summary: Get all payments
 *     tags: [Payments]
 *     parameters:
 *       - in: query
 *         name: shipmentID
 *         schema:
 *           type: string
 *         description: Filter by shipment ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by payment status
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter from date
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter to date
 *     responses:
 *       200:
 *         description: List of payments retrieved successfully
 *       500:
 *         description: Internal server error
 */
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { shipmentID, status, dateFrom, dateTo, exporterID } = req.query;

    logger.info('[PAYMENT] 🔗 Fetching payments DIRECTLY from Hyperledger Fabric blockchain');
    logger.info('[PAYMENT] Filters:', { shipmentID, status, dateFrom, dateTo, exporterID });

    // Query blockchain first; fall back to the PostgreSQL mirror when the
    // ledger is unreachable (dev mode / no Fabric host). The mirror is the
    // same best-effort pattern used by GET /shipments and the customs
    // clear handler: honest source labelling, no fabricated tx ids.
    let result;
    if (shipmentID) {
      result = await fabricService.queryChaincode('GetPaymentsByShipment', [shipmentID as string]);
    } else {
      result = await fabricService.queryChaincode('QueryAllPayments', []);
    }

    let payments: any[] = [];
    let source = 'blockchain';
    if (!result.success) {
      logger.warn(`[PAYMENT] Blockchain query failed, falling back to PostgreSQL: ${result.error}`);
      try {
        const { DatabaseService } = await import('../services/databaseService');
        const db = DatabaseService.getInstance();
        const dbPayments = await db.all(`SELECT * FROM payments ORDER BY created_at DESC`);
        source = 'database';
        payments = dbPayments.map((p: any) => ({
          paymentId: p.payment_id,
          paymentID: p.payment_id,
          contractId: p.contract_id,
          exporterId: p.exporter_id,
          shipmentId: p.shipment_id,
          lcId: p.lc_id,
          lcNumber: p.lc_number,
          amount: p.amount != null ? parseFloat(p.amount) : 0,
          currency: p.currency,
          status: p.status,
          paymentTrackingStatus: p.payment_tracking_status,
          swiftReference: p.swift_reference,
          retentionRate: p.retention_rate != null ? parseFloat(p.retention_rate) : null,
          retainedAmount: p.retention_amount != null ? parseFloat(p.retention_amount) : null,
          releaseAmount: p.release_amount != null ? parseFloat(p.release_amount) : null,
          paymentMethod: p.payment_method,
          paymentDate: p.payment_date,
          blockchainTxId: p.blockchain_tx_id,
          notes: p.notes,
          createdAt: p.created_at,
        }));
        logger.info(`[PAYMENT] Loaded ${payments.length} payments from PostgreSQL (fallback)`);
      } catch (pgError: any) {
        logger.error(`[PAYMENT] PostgreSQL fallback failed: ${pgError.message}`);
        return res.status(500).json({
          success: false,
          error: {
            code: 'BLOCKCHAIN_QUERY_FAILED',
            message: result.error || 'Failed to query blockchain'
          },
          source: 'blockchain',
          timestamp: new Date().toISOString()
        });
      }
    } else {
      payments = result.data || [];
      logger.info(`[PAYMENT] ✅ Found ${payments.length} payments on blockchain (PURE BLOCKCHAIN, NO CACHE)`);
    }

    // ✅ ENRICH with buyer data from PostgreSQL
    try {
      const { default: dataEnrichmentService } = await import('../services/dataEnrichmentService');
      // Payments link to shipments which link to contracts, so enrich via shipments
      const enrichedPayments: any[] = [];
      for (const payment of payments) {
        const shipmentId = payment.shipmentId || payment.ShipmentID || payment.shipment_id;
        if (shipmentId) {
          const { DatabaseService } = await import('../services/databaseService');
          const db = DatabaseService.getInstance();
          const buyerData = await db.get(`
            SELECT c.buyer_id AS buyer_name, c.buyer_country
            FROM shipments s
            LEFT JOIN contracts c ON s.contract_id = c.contract_id
            WHERE s.shipment_id = $1
          `, [shipmentId]);
          
          if (buyerData) {
            enrichedPayments.push({
              ...payment,
              buyerName: buyerData.buyer_name,
              buyerCountry: buyerData.buyer_country,
            });
          } else {
            enrichedPayments.push(payment);
          }
        } else {
          enrichedPayments.push(payment);
        }
      }
      payments = enrichedPayments;
      logger.info(`[PAYMENT] ✅ Enriched ${payments.length} payments with buyer data`);
    } catch (enrichError) {
      logger.warn('[PAYMENT] ⚠️  Could not enrich payments with buyer data:', enrichError);
    }

    // ✅ NORMALIZE and CALCULATE fields
    const exchangeRateService = require('../services/exchangeRateService').exchangeRateService;
    const getPositiveRate = (value: any): number | null => {
      const rate = Number(value);
      return Number.isFinite(rate) && rate > 0 ? rate : null;
    };
    const needsLedgerRate = payments.some((payment: any) =>
      getPositiveRate(payment.exchangeRate ?? payment.ExchangeRate) === null &&
      payment.amountBirr == null && payment.AmountBirr == null
    );
    let ledgerUsdRate: number | null = null;
    if (needsLedgerRate) {
      try {
        ledgerUsdRate = await exchangeRateService.getCurrentRate('USD');
      } catch (rateError: any) {
        logger.warn('[PAYMENT] No active ledger USD rate; leaving unconverted amounts unset:', rateError.message);
      }
    }
    payments = payments.map((payment: any) => {
      const amount = payment.amount || 0;
      const exchangeRate = getPositiveRate(payment.exchangeRate ?? payment.ExchangeRate) ?? ledgerUsdRate;
      const retentionRate = payment.retentionRate || 0.10; // 10% default retention
      
      // Calculate derived fields if not already set
      const storedAmountBirr = payment.amountBirr ?? payment.AmountBirr;
      const amountBirr = storedAmountBirr ?? (exchangeRate === null ? null : amount * exchangeRate);
      const retainedAmount = payment.retainedAmount || (amount * retentionRate);
      const convertedAmount = payment.convertedAmount ?? payment.ConvertedAmount ?? amountBirr;
      const advancePercentage = payment.advancePercentage || 0;
      const advanceAmount = payment.advanceAmount || (amount * (advancePercentage / 100));
      const balanceAmount = payment.balanceAmount || (amount - advanceAmount);
      
      return {
        ...payment,
        exchangeRate,
        amountBirr,
        retainedAmount,
        convertedAmount,
        advanceAmount,
        balanceAmount,
        // Ensure shipmentId is populated
        shipmentId: payment.shipmentId || payment.ShipmentID || payment.shipment_id || '',
        // Ensure verifiedById is populated
        verifiedById: payment.verifiedById || payment.verifiedBy || '',
      };
    });

    // Apply blockchain-side filters (status, exporter, dates)
    if (status) {
      payments = payments.filter((p: any) => 
        (p.status || p.Status) === status
      );
    }

    if (exporterID) {
      payments = payments.filter((p: any) => 
        (p.exporterId || p.ExporterID || p.exporter_id) === exporterID
      );
    }

    if (dateFrom || dateTo) {
      payments = payments.filter((payment: any) => {
        const paymentDate = new Date(payment.paymentDate || payment.payment_date || payment.timestamp);
        if (dateFrom && paymentDate < new Date(dateFrom as string)) return false;
        if (dateTo && paymentDate > new Date(dateTo as string)) return false;
        return true;
      });
    }

    res.json({
      success: true,
      data: payments,
      count: payments.length,
      source, // 'blockchain' when the ledger answered, 'database' on PG fallback
      blockchainPowered: source === 'blockchain',
      enriched: true, // ✅ Flag showing data is enriched with PostgreSQL
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('[PAYMENT] Error retrieving payments:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Internal server error',
      },
      timestamp: new Date().toISOString(),
    });
  }
});

// ✅ NEW: Convenience endpoint for pending payment releases
router.get('/pending-release', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { exporterID, limit = '200' } = req.query;

    logger.info('[PAYMENT] Fetching pending release payments from blockchain');

    // QueryAllPayments is a chaincode evaluate over every payment
    // (~1.4–1.8s measured) for a work-queue tab that is re-read
    // constantly. Cache the raw list 30s: the release action itself
    // re-validates state at write time (ALREADY_RELEASED), so a stale
    // list can never cause a double release, and the release path
    // invalidates this entry the moment a payment leaves the set.
    // The PG exclusion lookup below still runs fresh on every call,
    // so a payment released in the last 30s is filtered out even
    // before the cache entry expires. PG cannot serve the whole list
    // instead: the tab's rows are ledger docs and PG has no release
    // flag of its own (only the retention_status mirror, which is
    // exactly the exclusion used here).
    const servedFromCache = blockchainCache.peek(CacheKeys.paymentsAll());
    let result: any;
    try {
      result = await blockchainCache.get(
        CacheKeys.paymentsAll(),
        async () => {
          const r = await fabricService.queryChaincode('QueryAllPayments', []);
          if (!r.success) throw new Error(r.error || 'Failed to query blockchain');
          return r;
        },
        30 * 1000
      );
    } catch (queryErr: any) {
      logger.error(`[PAYMENT] Blockchain query failed: ${queryErr.message}`);
      return res.status(500).json({
        success: false,
        error: {
          code: 'BLOCKCHAIN_QUERY_FAILED',
          message: queryErr.message || 'Failed to query blockchain'
        },
        timestamp: new Date().toISOString()
      });
    }

    let payments = result.data || [];
    
    // LEG3 F4: VERIFIED-only hid every payment that had already been
    // settled — the normal NBE order (settle, then release the 60%)
    // made the payment invisible in the Payment Release tab. A payment
    // is pending release while its ledger status is VERIFIED, SETTLED
    // or CONFIRMED and its retention has not been released yet.
    //
    // Released payments are excluded two ways, because either source
    // alone misses a state:
    //  - PG retention_status IN ('RELEASED', 'RETENTION_CONVERTED'):
    //    convert overwrites RELEASED with RETENTION_CONVERTED
    //    (paymentService.convertRetention), so the old '= RELEASED'
    //    check let every released+converted payment back into the
    //    list (found live 2026-11-14: PAY_LC-CONT-E2E-FULL-20261114,
    //    CONFIRMED + RETENTION_CONVERTED, still listed at index 3).
    //  - the ledger retentionReleased flag on the row itself: the
    //    source of truth (releasePayment's own guard reads it), so a
    //    PG-mirror lag cannot re-list a released payment either.
    // If the PG lookup fails, fall back to the ledger-only filter
    // rather than 500ing the tab.
    const releasableStatuses = new Set(['VERIFIED', 'SETTLED', 'CONFIRMED']);
    let releasedIds = new Set<string>();
    try {
      const releasedRows: any[] = await postgresDb.all(
        `SELECT payment_id FROM payments WHERE retention_status IN ('RELEASED', 'RETENTION_CONVERTED')`
      );
      releasedIds = new Set(releasedRows.map((r: any) => r.payment_id));
    } catch (pgErr) {
      logger.warn('[PAYMENT] Pending-release PG exclusion lookup failed, listing from ledger only:', pgErr);
    }
    payments = payments.filter((p: any) =>
      releasableStatuses.has(p.status || p.Status) &&
      !releasedIds.has(p.paymentId || p.PaymentID || p.payment_id || p.PaymentId) &&
      (p.retentionReleased ?? p.RetentionReleased) !== true
    );

    // Apply exporter filter if provided
    if (exporterID) {
      payments = payments.filter((p: any) => 
        (p.exporterId || p.ExporterID || p.exporter_id) === exporterID
      );
    }

    // Pending-release is a work queue: newest settlements first, so a
    // payment settled moments ago appears at the top immediately.
    // Before this, the list came back in CouchDB key order (oldest
    // first) and was sliced to 50, so a new settlement was invisible
    // once 50+ older unreleased payments existed. Sort key is the
    // ledger createdAt (RFC3339), falling back to paymentDate /
    // updatedAt; rows with no parseable timestamp sink to the bottom.
    // Tiebreak on paymentId for a deterministic order.
    const sortTime = (p: any): number => {
      for (const k of ['createdAt', 'paymentDate', 'updatedAt']) {
        const v = p[k] ?? p[k.charAt(0).toUpperCase() + k.slice(1)];
        if (v) {
          const t = Date.parse(String(v));
          if (!Number.isNaN(t)) return t;
        }
      }
      return 0;
    };
    const sortId = (p: any): string => String(p.paymentId || p.PaymentID || p.payment_id || '');
    payments.sort((a: any, b: any) => {
      const dt = sortTime(b) - sortTime(a);
      if (dt !== 0) return dt;
      return sortId(b).localeCompare(sortId(a));
    });

    // Apply limit (default 200, honoured from the query, capped at 500
    // so a work-queue tab cannot ask for an unbounded ledger dump).
    const limitNum = Math.min(Math.max(parseInt(limit as string) || 200, 1), 500);
    payments = payments.slice(0, limitNum);

    logger.info(`[PAYMENT] Found ${payments.length} pending release payments`);

    res.json({
      success: true,
      data: payments,
      count: payments.length,
      filter: 'pending-release',
      source: servedFromCache ? 'cache' : 'blockchain',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    logger.error('[PAYMENT] Error retrieving pending release payments:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @swagger
 * /api/v1/payments/{paymentID}:
 *   get:
 *     summary: Get payment details by ID
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: paymentID
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment ID
 *     responses:
 *       200:
 *         description: Payment details retrieved successfully
 *       404:
 *         description: Payment not found
 *       500:
 *         description: Internal server error
 */
router.get('/:paymentID',
  authMiddleware,
  [param('paymentID').notEmpty().withMessage('Payment ID is required')],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { paymentID } = req.params;

      logger.info(`[PAYMENT] Fetching payment details: ${paymentID}`);

      // Try database first (PostgreSQL)
      try {
        const payment = await postgresDb.get(
          'SELECT * FROM payments WHERE payment_id = $1',
          [paymentID]
        );

        if (payment) {
          return res.json({
            success: true,
            data: payment,
            source: 'database',
            timestamp: new Date().toISOString(),
          });
        }
      } catch (dbError) {
        logger.warn(`[PAYMENT] Database query failed, trying blockchain: ${dbError}`);
      }

      // Fallback to blockchain
      const result = await fabricService.queryChaincode('ReadPayment', [paymentID]);

      if (result.success) {
        res.json({
          success: true,
          data: result.data,
          source: 'blockchain',
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: result.error || 'Payment not found',
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.error('[PAYMENT] Error retrieving payment:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * @swagger
 * /api/v1/payments/{paymentID}/forex-repatriation:
 *   post:
 *     summary: Record forex repatriation for a payment
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: paymentID
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - repatriationAmount
 *               - repatriationCurrency
 *               - exchangeRate
 *             properties:
 *               repatriationAmount:
 *                 type: number
 *               repatriationCurrency:
 *                 type: string
 *               exchangeRate:
 *                 type: number
 *               swiftReference:
 *                 type: string
 *               nbeApprovalRef:
 *                 type: string
 *     responses:
 *       200:
 *         description: Forex repatriation recorded successfully
 *       400:
 *         description: Invalid input data
 *       404:
 *         description: Payment not found
 *       500:
 *         description: Internal server error
 */
router.post('/:paymentID/forex-repatriation',
  requireRole(['BANKS', 'BANK_ADMIN']),
  [
    param('paymentID').notEmpty().withMessage('Payment ID is required'),
    body('repatriationAmount').isNumeric().withMessage('Repatriation amount must be a number'),
    body('repatriationCurrency').notEmpty().withMessage('Currency is required'),
    body('exchangeRate').isNumeric().withMessage('Exchange rate must be a number'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { paymentID } = req.params;
      const {
        repatriationAmount,
        repatriationCurrency,
        exchangeRate,
        swiftReference,
        nbeApprovalRef,
      } = req.body;

      logger.info(`[PAYMENT] Recording forex repatriation for payment: ${paymentID}`);

      // Connect as NBEMSP for forex operations
      await fabricService.connectAsOrg('NBEMSP');

      const result = await fabricService.invokeChaincode('RecordForexRepatriation', [
        paymentID,
        repatriationAmount.toString(),
        repatriationCurrency,
        exchangeRate.toString(),
        swiftReference || '',
        nbeApprovalRef || '',
      ]);

      if (result.success) {
        logger.info(`✅ [PAYMENT] Forex repatriation recorded: ${paymentID}`);
        // Audit: this chain move never wrote an audit_trail row.
        // Best-effort — a failed audit write must not fail the move.
        await logAuditBestEffort(req, {
          entityType: 'PAYMENT',
          entityId: paymentID,
          action: 'RECORD_FOREX_REPATRIATION',
          blockchainTxId: result.txId || undefined,
          metadata: { blockchainTxId: result.txId || null },
        }, `payment ${paymentID} forex-repatriation`);

        res.json({
          success: true,
          message: 'Forex repatriation recorded successfully',
          data: result.data,
          txId: result.txId,
          timestamp: new Date().toISOString(),
        });
      } else {
        logger.error(`❌ [PAYMENT] Failed to record forex repatriation: ${result.error}`);
        res.status(400).json({
          success: false,
          error: {
            code: 'REPATRIATION_FAILED',
            message: result.error || 'Failed to record forex repatriation',
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.error('[PAYMENT] Error recording forex repatriation:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// ==================== ADVANCE PAYMENT METHODS ====================

/**
 * @swagger
 * /api/v1/payments/{paymentID}/advance:
 *   post:
 *     summary: Receive advance payment
 *     tags: [Payments]
 */
router.post('/:paymentID/advance',
  requireRole(['BANKS', 'BANK_ADMIN']),
  [
    param('paymentID').notEmpty().withMessage('Payment ID is required'),
    body('advancePercentage').notEmpty().withMessage('Advance percentage is required'),
    body('amountReceived').notEmpty().withMessage('Amount received is required'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { paymentID } = req.params;
      const { advancePercentage, amountReceived } = req.body;

      logger.info(`[PAYMENT] Receiving advance payment: ${paymentID}`);

      await fabricService.connectAsOrg('BanksMSP');

      const result = await fabricService.invokeChaincode('ReceiveAdvancePayment', [
        paymentID,
        advancePercentage.toString(),
        amountReceived.toString(),
      ]);

      if (result.success) {
        logger.info(`✅ [PAYMENT] Advance payment received: ${paymentID}`);
        // Audit: this chain move never wrote an audit_trail row.
        // Best-effort — a failed audit write must not fail the move.
        await logAuditBestEffort(req, {
          entityType: 'PAYMENT',
          entityId: paymentID,
          action: 'RECEIVE_ADVANCE_PAYMENT',
          blockchainTxId: result.txId || undefined,
          metadata: { blockchainTxId: result.txId || null },
        }, `payment ${paymentID} advance`);

        res.json({
          success: true,
          message: 'Advance payment received successfully',
          data: result.data,
          txId: result.txId,
          timestamp: new Date().toISOString(),
        });
      } else {
        logger.error(`❌ [PAYMENT] Failed to receive advance: ${result.error}`);
        res.status(400).json({
          success: false,
          error: {
            code: 'ADVANCE_FAILED',
            message: result.error || 'Failed to receive advance payment',
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.error('[PAYMENT] Error receiving advance:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * @swagger
 * /api/v1/payments/{paymentID}/balance:
 *   post:
 *     summary: Receive balance payment
 *     tags: [Payments]
 */
router.post('/:paymentID/balance',
  requireRole(['BANKS', 'BANK_ADMIN']),
  [
    param('paymentID').notEmpty().withMessage('Payment ID is required'),
    body('amountReceived').notEmpty().withMessage('Amount received is required'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { paymentID } = req.params;
      const { amountReceived } = req.body;

      logger.info(`[PAYMENT] Receiving balance payment: ${paymentID}`);

      await fabricService.connectAsOrg('BanksMSP');

      const result = await fabricService.invokeChaincode('ReceiveBalancePayment', [
        paymentID,
        amountReceived.toString(),
      ]);

      if (result.success) {
        logger.info(`✅ [PAYMENT] Balance payment received: ${paymentID}`);
        // Audit: this chain move never wrote an audit_trail row.
        // Best-effort — a failed audit write must not fail the move.
        await logAuditBestEffort(req, {
          entityType: 'PAYMENT',
          entityId: paymentID,
          action: 'RECEIVE_BALANCE_PAYMENT',
          blockchainTxId: result.txId || undefined,
          metadata: { blockchainTxId: result.txId || null },
        }, `payment ${paymentID} balance`);

        res.json({
          success: true,
          message: 'Balance payment received successfully',
          data: result.data,
          txId: result.txId,
          timestamp: new Date().toISOString(),
        });
      } else {
        logger.error(`❌ [PAYMENT] Failed to receive balance: ${result.error}`);
        res.status(400).json({
          success: false,
          error: {
            code: 'BALANCE_FAILED',
            message: result.error || 'Failed to receive balance payment',
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.error('[PAYMENT] Error receiving balance:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * @swagger
 * /api/v1/payments/{paymentID}/status:
 *   post:
 *     summary: Update payment status
 *     tags: [Payments]
 */
router.post('/:paymentID/status',
  requireRole(['BANKS', 'BANK_ADMIN']),
  [
    param('paymentID').notEmpty().withMessage('Payment ID is required'),
    body('status').notEmpty().withMessage('Status is required'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { paymentID } = req.params;
      const { status } = req.body;

      logger.info(`[PAYMENT] Updating payment status: ${paymentID} to ${status}`);

      await fabricService.connectAsOrg('BanksMSP');

      const result = await fabricService.invokeChaincode('UpdatePaymentStatus', [
        paymentID,
        status,
      ]);

      if (result.success) {
        logger.info(`✅ [PAYMENT] Status updated: ${paymentID}`);
        // Audit: this chain move never wrote an audit_trail row.
        // Best-effort — a failed audit write must not fail the move.
        await logAuditBestEffort(req, {
          entityType: 'PAYMENT',
          entityId: paymentID,
          action: 'UPDATE_STATUS',
          newValue: status,
          blockchainTxId: result.txId || undefined,
          metadata: { status, blockchainTxId: result.txId || null },
        }, `payment ${paymentID} status ${status}`);

        res.json({
          success: true,
          message: 'Payment status updated successfully',
          data: result.data,
          txId: result.txId,
          timestamp: new Date().toISOString(),
        });
      } else {
        logger.error(`❌ [PAYMENT] Failed to update status: ${result.error}`);
        res.status(400).json({
          success: false,
          error: {
            code: 'STATUS_UPDATE_FAILED',
            message: result.error || 'Failed to update payment status',
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.error('[PAYMENT] Error updating status:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// POST /payments - Record payment
router.post('/',
  authMiddleware,
  requireRole(['EXPORTER', 'BANKS', 'BANK_ADMIN']),
  [
    body('paymentID').notEmpty(),
    body('amount').isNumeric(),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { paymentID, lcNumber, contractID, exporterID, amount, currency, paymentMethod, paymentDate } = req.body;
      const user = (req as any).user;

      // Fetch bank details from LC or use defaults
      let receivingBank = 'Commercial Bank of Ethiopia';
      let receivingBankBIC = 'CBETETAA';  // Commercial Bank of Ethiopia BIC code (8 chars)
      let beneficiaryName = exporterID;  // Will be mapped from exporter record
      let beneficiaryAccount = 'TO_BE_MAPPED';  // Will be auto-mapped from LC/exporter

      // Try to fetch LC details for auto-mapping
      if (lcNumber) {
        try {
          const lcResult = await fabricService.queryChaincode('ReadLC', [lcNumber]);
          if (lcResult.success && lcResult.data) {
            const lc = lcResult.data;
            receivingBank = lc.advisingBank || lc.issuingBank || receivingBank;
            beneficiaryName = lc.beneficiaryName || lc.exporterID || beneficiaryName;
            beneficiaryAccount = lc.beneficiaryAccount || beneficiaryAccount;
            // Keep default BIC if not provided
          }
        } catch (err) {
          logger.warn('[PAYMENT] Could not fetch LC for auto-mapping, using defaults');
        }
      }

      // ✅ BLOCKCHAIN-FIRST: Call InitiatePayment chaincode BEFORE DB write
      const blockchainResult = await fabricService.invokeChaincode(
        'InitiatePayment',
        [
          paymentID,
          contractID || '',
          exporterID,
          lcNumber || '',
          String(amount),
          currency || 'USD',
          receivingBank,
          receivingBankBIC,  // Now uses valid 8-character BIC code
          beneficiaryName,
          beneficiaryAccount,
          paymentMethod || 'LC'
        ]
      );
      
      const blockchain_tx_id = blockchainResult?.txId || null;
      logger.info(`✅ Payment initiated on blockchain: ${paymentID}, TX: ${blockchain_tx_id}`);

      // Now persist to database with blockchain TX ID
      await postgresDb.run(
        `INSERT INTO payments (
          payment_id, lc_number, contract_id, shipment_id, exporter_id, amount, currency, payment_method, payment_date, blockchain_tx_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [paymentID, lcNumber || null, contractID, req.body.shipmentID || null, exporterID, amount, currency, paymentMethod, paymentDate, blockchain_tx_id]
      );
      // Audit: this chain move never wrote an audit_trail row.
      // Best-effort — a failed audit write must not fail the move.
      await logAuditBestEffort(req, {
        entityType: 'PAYMENT',
        entityId: paymentID,
        action: 'INITIATE',
        blockchainTxId: blockchain_tx_id || undefined,
        metadata: { lcNumber, contractID, exporterID, amount, blockchainTxId: blockchain_tx_id || null },
      }, `payment ${paymentID} initiate`);


      res.json({
        success: true,
        data: { paymentID, amount, currency, blockchain_tx_id },
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error('Payment creation error:', error);
      // F-8: re-creating an existing payment violates the
      // payments.payment_id UNIQUE constraint — a client error (409),
      // not a server error.
      if (/duplicate key/i.test(error?.message || '')) {
        return res.status(409).json({
          success: false,
          error: { code: 'PAYMENT_ALREADY_EXISTS', message: error.message },
          timestamp: new Date().toISOString()
        });
      }
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
        timestamp: new Date().toISOString()
      });
    }
  }
);

// Duplicate route removed - consolidated into single GET / above that queries BOTH databases

/**
 * @swagger
 * /api/v1/payments/{paymentID}/release:
 *   post:
 *     summary: Release payment to exporter (NBE approval)
 *     description: NBE releases payment to exporter after all compliance checks
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: paymentID
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - exporterID
 *               - amount
 *             properties:
 *               exporterID:
 *                 type: string
 *               amount:
 *                 type: number
 *                 description: The payment total in USD. Must equal the stored payment total — the release itself is 60% of this total. A mismatch is rejected with 400 AMOUNT_MISMATCH.
 *               releaseDate:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payment released successfully
 *       404:
 *         description: Payment not found
 *       500:
 *         description: Internal server error
 */
router.post('/:paymentID/release',
  authMiddleware,
  requireRole(['NBE', 'NBE_ADMIN', 'ADMIN']),
  [
    param('paymentID').notEmpty().withMessage('Payment ID is required'),
    body('exporterID').notEmpty().withMessage('Exporter ID is required'),
    body('amount').isNumeric().withMessage('Amount must be numeric'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { paymentID } = req.params;
      const { exporterID, amount, releaseDate } = req.body;
      const userId = (req as any).user?.userId || 'system';
      const userOrg = (req as any).user?.organization || 'NBE';

      logger.info(`[PAYMENTS] NBE releasing payment ${paymentID} to exporter ${exporterID}`);

      // Get payment details to validate — ledger-first resolution (see
      // PaymentService.resolvePayment): a payment with no PG row but a
      // ledger record resolves from the ledger instead of 404'ing. A
      // payment with a PG row resolves from PG exactly as before.
      const payment = await paymentService.resolvePayment(paymentID);

      if (!payment) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Payment not found: ${paymentID}`,
          },
          timestamp: new Date().toISOString(),
        });
      }

      // Check if payment is in correct status — the release guard reads
      // the RETENTION machine (retention_status), not the settlement
      // status: a settled payment whose retention was never released is
      // releasable, and a released one stays released even after the
      // settle mirror writes SETTLED (TEST-STATUS-MATRIX §17 #8).
      if (payment.retention_status === 'RELEASED') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'ALREADY_RELEASED',
            message: `Payment ${paymentID} has already been released`,
          },
          timestamp: new Date().toISOString(),
        });
      }

      // Leftover 3: `amount` used to be validated as numeric only and
      // then ignored — releasePayment always released 60% of the
      // stored total. The contract is now explicit: `amount` is the
      // PAYMENT TOTAL (what the NBE portal sends from its
      // pending-release rows, which are ledger docs carrying only the
      // total — there is no release-amount field on the ledger doc),
      // and it must equal the stored total. The release itself is
      // still 60% of that total. A mismatch 400s here, before any
      // chain write, with the expected total named.
      const storedTotal = payment.amount_usd != null
        ? Number(payment.amount_usd)
        : (payment.amount != null ? Number(payment.amount) : NaN);
      const storedRelease = payment.release_amount != null
        ? Number(payment.release_amount)
        : (Number.isFinite(storedTotal) ? Math.round(storedTotal * 0.6 * 100) / 100 : NaN);
      const toCents = (n: number) => Math.round(n * 100) / 100;
      if (!Number.isFinite(storedTotal) || !Number.isFinite(Number(amount)) || toCents(Number(amount)) !== toCents(storedTotal)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'AMOUNT_MISMATCH',
            message: `Release amount ${amount} does not match the payment total of ${Number.isFinite(storedTotal) ? storedTotal : 'unknown'} USD — the release is 60% of the payment total (${Number.isFinite(storedRelease) ? storedRelease : 'unknown'} USD)`,
          },
          timestamp: new Date().toISOString(),
        });
      }

      // Use PaymentService to handle the 60% release properly
      const result = await paymentService.releasePayment({
        paymentID,
        exporterAccount: `${exporterID}-001`, // Default account format
        releasedBy: (req as any).user?.username || 'NBE',
        releaseRef: `REL-${paymentID}-${Date.now()}`,
        releaseDate: releaseDate || new Date().toISOString(),
        userId: String(userId),
        userOrg
      });

      logger.info(`✅ Payment ${paymentID} released: ${result.releaseAmount} USD to exporter ${exporterID}`);
      // In-app notification (persisted feed + live WS broadcast).
      await notificationService.emitWorkflowEvent({
        type: 'payment_released',
        title: `Payment ${paymentID} released`,
        message: `Payment ${paymentID} was released: ${result.releaseAmount} USD to exporter ${exporterID} (60% NBE release).`,
        entityType: 'payment', entityId: paymentID, severity: 'success',
        roles: ['NBE'], exporterId: exporterID,
        actionUrl: '/portals/exporter?tab=payments',
        actionUrls: { NBE: '/portals/nbe?tab=contracts' },
      });

      res.json({
        success: true,
        message: 'Payment released successfully (60% of total)',
        data: {
          paymentID: result.paymentID,
          exporterID,
          status: result.status,
          retentionStatus: result.retentionStatus,
          totalAmount: result.totalAmount,
          releaseAmount: result.releaseAmount,
          retentionAmount: result.retentionAmount,
          releaseDate: releaseDate || new Date().toISOString(),
          // N7: the chain txId(s) that prove the release — the
          // retention-release tx (txId) plus the settle tx on the
          // settleable path (settleTxId, null when already settled).
          txId: (result as any).txId || null,
          blockchainTxId: (result as any).blockchainTxId || (result as any).txId || null,
          settleTxId: (result as any).settleTxId || null,
          retentionReleaseTxId: (result as any).retentionReleaseTxId || (result as any).txId || null,
        },
        txId: (result as any).txId || null,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error('[PAYMENTS] Error releasing payment:', error);
      const message = error?.message || 'Internal server error';
      // F-8: releasePayment throws client-state failures (payment not
      // found, already released, on-chain status not releasable) and a
      // missing-ledger-rate failure — those are 4xx/503, not 500. Only
      // genuine server failures stay 500.
      if (/not found/i.test(message)) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message },
          timestamp: new Date().toISOString(),
        });
      }
      if (/already released/i.test(message)) {
        // Plain message, not the raw chaincode error: the backstop
        // rejection (e.g. a race past the service guard) arrives as a
        // 6-peer Fabric dump, which is not a usable client error.
        return res.status(400).json({
          success: false,
          error: { code: 'ALREADY_RELEASED', message: `Payment ${req.params.paymentID} has already been released` },
          timestamp: new Date().toISOString(),
        });
      }
      if (/cannot be released/i.test(message)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_STATUS', message },
          timestamp: new Date().toISOString(),
        });
      }
      if (/no active .* exchange rate/i.test(message)) {
        return res.status(503).json({
          success: false,
          error: { code: 'NO_ACTIVE_EXCHANGE_RATE', message },
          timestamp: new Date().toISOString(),
        });
      }
      res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message,
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

export default router;


/**
 * @swagger
 * /api/v1/payments/{paymentID}/tracking-status:
 *   put:
 *     summary: Update payment document tracking status
 *     description: Update the document tracking status (PENDING → DOCUMENTS_SUBMITTED → VERIFIED → SWIFT_RECEIVED → SETTLED)
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: paymentID
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - trackingStatus
 *             properties:
 *               trackingStatus:
 *                 type: string
 *                 enum: [PENDING, DOCUMENTS_SUBMITTED, VERIFIED, SWIFT_INITIATED, SWIFT_RECEIVED, SETTLED]
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Tracking status updated successfully
 *       400:
 *         description: Invalid status value
 *       404:
 *         description: Payment not found
 *       500:
 *         description: Internal server error
 */
router.put('/:paymentID/tracking-status',
  authMiddleware,
  requireRole(['BANKS', 'BANK_ADMIN']),
  [
    param('paymentID').notEmpty().withMessage('Payment ID is required'),
    body('trackingStatus')
      .notEmpty()
      .withMessage('Tracking status is required')
      .isIn(['PENDING', 'DOCUMENTS_SUBMITTED', 'VERIFIED', 'SWIFT_INITIATED', 'SWIFT_RECEIVED', 'SETTLED'])
      .withMessage('Invalid tracking status value'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { paymentID } = req.params;
      const { trackingStatus, notes } = req.body;
      const userId = (req as any).user?.userId || 'system';
      const userOrg = (req as any).user?.organization || 'SYSTEM';

      logger.info(`[PAYMENTS] Updating tracking status for ${paymentID} to ${trackingStatus}`);

      const { DatabaseService } = await import('../services/databaseService');
      const { AuditService } = await import('../services/auditService');
      
      const db = DatabaseService.getInstance();
      const auditService = AuditService.getInstance();

      // Get current payment
      const payment = await db.get(
        'SELECT * FROM payments WHERE payment_id = $1',
        [paymentID]
      );

      if (!payment) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Payment not found: ${paymentID}`,
          },
          timestamp: new Date().toISOString(),
        });
      }

      // Update tracking status
      await db.run(
        `UPDATE payments 
         SET payment_tracking_status = $1 
         WHERE payment_id = $2`,
        [trackingStatus, paymentID]
      );

      // Log audit trail
      await auditService.log({
        entityType: 'PAYMENT',
        entityId: paymentID,
        action: 'UPDATE_TRACKING_STATUS',
        performedBy: userId,
        organization: userOrg,
        performedByOrg: userOrg,
        oldValue: payment.payment_tracking_status || 'PENDING',
        newValue: trackingStatus,
        reason: `Payment tracking status updated to ${trackingStatus}`,
        metadata: { notes },
      });

      logger.info(`✅ [PAYMENTS] Tracking status updated: ${paymentID} -> ${trackingStatus}`);

      res.json({
        success: true,
        data: {
          paymentID,
          trackingStatus,
        },
        message: `Payment tracking status updated to ${trackingStatus}`,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error(`[PAYMENTS] Error updating tracking status:`, error);
      
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message || 'Failed to update tracking status',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

