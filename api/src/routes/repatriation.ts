// Ethiopian Coffee Export Consortium Blockchain System (CECBS)
// Export Proceeds Repatriation API Routes

import express from 'express';
import { body, param } from 'express-validator';
import { validateRequest } from '../middleware/validation';
import { FabricService } from '../services/fabricService';
import { DatabaseService } from '../services/databaseService';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { logger } from '../utils/logger';
import { logAuditBestEffort } from '../utils/auditBestEffort';
import { fetchLedgerRepatriationMap, healRepatriationRow, backfillRepatriation } from '../utils/healLedger';
import { validateBankAccount, validateBIC } from '../utils/fieldValidation';
import notificationService from '../services/notificationService';

/** Field validation 2026-11-16: account must fit the named bank (CBE: 13 digits, 1000…). */
const bankAccountValidator = (bankField?: string) => (value: unknown, { req }: any) => {
  const result = validateBankAccount(bankField ? req?.body?.[bankField] : undefined, value);
  if (!result.valid) throw new Error(result.error || 'Invalid bank account number');
  return true;
};

const router = express.Router();
const fabricService = FabricService.getInstance();
const postgresDb = DatabaseService.getInstance();

/**
 * Ledger-read-back mirror for a repatriation chain move (2026-11-19,
 * pg-ledger-equality fix round). The initiation route inserts the PG
 * row and the verify route already mirrors (N4), but record / penalty /
 * waiver-approve wrote to the chain only — so PG stayed PENDING while
 * the ledger moved to PARTIAL / COMPLIED / OVERDUE / WAIVED (the 5
 * status diffs in the audit). After any chain move, read the ledger doc
 * back and mirror status + amounts + verification/waiver fields into
 * export_proceeds_repatriation. Best-effort: the chain write already
 * committed, so a mirror failure is logged, never failed — and a
 * missing PG row is reported (the resync endpoint backfills it).
 */
async function mirrorRepatriationFromLedger(
  repatriationId: string,
  actor: { username?: string; email?: string; organization?: string } | undefined | null,
): Promise<void> {
  try {
    const ledgerRecord = await fabricService.evaluateTransaction('ReadRepatriation', repatriationId);
    if (!ledgerRecord.success || !ledgerRecord.data) {
      logger.warn(`[REPATRIATION] Could not read back ${repatriationId} from the ledger to mirror:`, ledgerRecord.error);
      return;
    }
    const result = await healRepatriationRow(repatriationId, ledgerRecord.data, actor);
    if (!result.healed && result.reason === 'no PG row') {
      logger.warn(`[REPATRIATION] Mirror: no PG row for ${repatriationId} — ledger is ${ledgerRecord.data?.status || ledgerRecord.data?.Status} but Postgres has nothing to update (backfill via POST /repatriation/resync)`);
    }
  } catch (mirrorErr: any) {
    logger.warn(`[REPATRIATION] Could not mirror ${repatriationId} to Postgres:`, mirrorErr?.message || mirrorErr);
  }
}

// ==================== EXPORT PROCEEDS REPATRIATION ROUTES ====================

// GET /api/v1/repatriation — Get all repatriations
router.get('/', authMiddleware, requireRole(['BANKS', 'BANK', 'BANK_ADMIN', 'BANK OFFICER', 'NBE', 'NBE_ADMIN', 'NBE OFFICER', 'EXPORTER']), async (req, res) => {
  try {
    logger.info('[REPATRIATION] 🔗 Querying all repatriations from blockchain...');
    const user = (req as any).user;
    const isExporter = String(user?.role || '').toUpperCase() === 'EXPORTER';
    const exporterId = String(user?.exporterId || user?.username || '');
    if (isExporter && !exporterId) {
      return res.status(403).json({ success: false, error: 'Exporter identity is not linked to this account' });
    }
    const result = isExporter
      ? await fabricService.evaluateTransaction('QueryRepatriationsByExporter', exporterId)
      : await fabricService.evaluateTransaction('QueryAllRepatriations');
    
    if (!result.success) {
      logger.error(`[REPATRIATION] ❌ Blockchain query failed: ${result.error}`);
      return res.status(500).json({ 
        success: false, 
        error: result.error,
        source: 'blockchain'
      });
    }

    const repatriations = result.data || [];
    logger.info(`[REPATRIATION] ✅ Retrieved ${repatriations.length} repatriations`);

    res.json({
      success: true,
      data: repatriations,
      count: repatriations.length,
      source: 'blockchain',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    logger.error('[REPATRIATION] ❌ Error fetching repatriations:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// GET /api/v1/repatriation/:id — Get specific repatriation
router.get('/:id', authMiddleware, requireRole(['BANKS', 'BANK', 'BANK_ADMIN', 'BANK OFFICER', 'NBE', 'NBE_ADMIN', 'NBE OFFICER', 'EXPORTER']), async (req, res) => {
  try {
    const { id } = req.params;
    logger.info(`[REPATRIATION] 🔍 Fetching repatriation: ${id}`);
    
    const result = await fabricService.evaluateTransaction('ReadRepatriation', id);
    
    if (!result.success) {
      logger.error(`[REPATRIATION] ❌ Failed to fetch: ${result.error}`);
      return res.status(404).json({ 
        success: false, 
        error: result.error 
      });
    }

    const user = (req as any).user;
    if (String(user?.role || '').toUpperCase() === 'EXPORTER' &&
        String(user?.exporterId || user?.username || '') !== String(result.data?.exporterId || result.data?.ExporterID || '')) {
      return res.status(403).json({ success: false, error: 'Exporters can only view their own repatriation records' });
    }

    res.json({
      success: true,
      data: result.data,
      source: 'blockchain'
    });
  } catch (error: any) {
    logger.error(`[REPATRIATION] ❌ Error fetching repatriation:`, error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// GET /api/v1/repatriation/exporter/:exporterId — Get by exporter
router.get('/exporter/:exporterId', authMiddleware, requireRole(['BANKS', 'BANK', 'BANK_ADMIN', 'BANK OFFICER', 'NBE', 'NBE_ADMIN', 'NBE OFFICER', 'EXPORTER']), async (req, res) => {
  try {
    const { exporterId } = req.params;
    const user = (req as any).user;
    if (String(user?.role || '').toUpperCase() === 'EXPORTER' &&
        String(user?.exporterId || user?.username || '') !== exporterId) {
      return res.status(403).json({ success: false, error: 'Exporters can only view their own repatriation records' });
    }
    logger.info(`[REPATRIATION] 🔍 Fetching repatriations for exporter: ${exporterId}`);
    
    const result = await fabricService.evaluateTransaction('QueryRepatriationsByExporter', exporterId);
    
    if (!result.success) {
      logger.error(`[REPATRIATION] ❌ Failed to fetch: ${result.error}`);
      return res.status(500).json({ 
        success: false, 
        error: result.error 
      });
    }

    const repatriations = result.data || [];
    
    res.json({
      success: true,
      data: repatriations,
      count: repatriations.length,
      source: 'blockchain'
    });
  } catch (error: any) {
    logger.error(`[REPATRIATION] ❌ Error:`, error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// GET /api/v1/repatriation/status/:status — Get by status
router.get('/status/:status', authMiddleware, requireRole(['BANKS', 'BANK', 'BANK_ADMIN', 'BANK OFFICER', 'NBE', 'NBE_ADMIN', 'NBE OFFICER']), async (req, res) => {
  try {
    const { status } = req.params;
    logger.info(`[REPATRIATION] 🔍 Fetching repatriations with status: ${status}`);
    
    const result = await fabricService.evaluateTransaction('QueryRepatriationsByStatus', status);
    
    if (!result.success) {
      logger.error(`[REPATRIATION] ❌ Failed to fetch: ${result.error}`);
      return res.status(500).json({ 
        success: false, 
        error: result.error 
      });
    }

    const repatriations = result.data || [];
    
    res.json({
      success: true,
      data: repatriations,
      count: repatriations.length,
      source: 'blockchain'
    });
  } catch (error: any) {
    logger.error(`[REPATRIATION] ❌ Error:`, error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// GET /api/v1/repatriation/overdue/all — Get overdue repatriations
router.get('/overdue/all', authMiddleware, requireRole(['BANKS', 'BANK', 'BANK_ADMIN', 'BANK OFFICER', 'NBE', 'NBE_ADMIN', 'NBE OFFICER']), async (req, res) => {
  try {
    logger.info('[REPATRIATION] 🔍 Fetching overdue repatriations');
    
    const result = await fabricService.evaluateTransaction('QueryOverdueRepatriations');
    
    if (!result.success) {
      logger.error(`[REPATRIATION] ❌ Failed to fetch: ${result.error}`);
      return res.status(500).json({ 
        success: false, 
        error: result.error 
      });
    }

    const repatriations = result.data || [];
    
    res.json({
      success: true,
      data: repatriations,
      count: repatriations.length,
      source: 'blockchain'
    });
  } catch (error: any) {
    logger.error(`[REPATRIATION] ❌ Error:`, error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Map an InitiateRepatriation chain failure to its client-error HTTP
// status (F-8). A duplicate initiate — the payment already has a
// repatriation record (composite-key + legacy uniqueness checks,
// repatriation.go) — is a client-side state conflict (409), not a server
// error; anything else stays 500.
function initiateFailureStatus(error: string): number | null {
  if (error.includes('already has a repatriation record')) return 409;
  return null;
}

// POST /api/v1/repatriation/initiate — Initiate new repatriation
// LEG3 M-11: this route had ZERO validation — an empty body reached
// submitTransactionAs and failed at the Fabric layer as a 500/409.
// Validation now rejects bad input up front (400 VALIDATION_ERROR, the
// codebase standard — see middleware/validation.ts — rather than a
// one-off 422). shipmentDate must be YYYY-MM-DD: the chaincode parses
// exactly that format (repatriation.go).
router.post('/initiate', authMiddleware, requireRole(['BANKS', 'BANK', 'BANK_ADMIN', 'BANK OFFICER']), [
  body('repatriationId').notEmpty().withMessage('Repatriation ID is required'),
  body('paymentId').notEmpty().withMessage('Payment ID is required'),
  body('contractId').notEmpty().withMessage('Contract ID is required'),
  body('shipmentId').notEmpty().withMessage('Shipment ID is required'),
  body('exporterId').notEmpty().withMessage('Exporter ID is required'),
  body('exportAmount').isFloat({ gt: 0 }).withMessage('Export amount must be greater than 0'),
  body('currency').notEmpty().withMessage('Currency is required'),
  body('fcyAccountNumber').notEmpty().withMessage('FCY account number is required').bail()
    .custom(bankAccountValidator('fcyBank')),
  body('fcyBank').notEmpty().withMessage('FCY bank is required'),
  body('fcyBankBIC').custom((value) => {
    const result = validateBIC(value, 'FCY bank BIC');
    if (!result.valid) throw new Error(result.error || 'Invalid BIC');
    return true;
  }),
  body('shipmentDate').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Shipment date must be YYYY-MM-DD'),
  body('swiftReference').optional().isString(),
  body('bankStatementRef').optional().isString(),
  body('notes').optional().isString(),
], validateRequest, async (req, res) => {
  try {
    const {
      repatriationId,
      paymentId,
      contractId,
      shipmentId,
      exporterId,
      exportAmount,
      currency,
      fcyAccountNumber,
      fcyBank,
      fcyBankBIC,
      shipmentDate,
      // LEG3 M-11: these three used to be silently discarded — the
      // dialog sent them and the handler destructured only the 11
      // chaincode args. They are now stored in the PG mirror below.
      swiftReference,
      bankStatementRef,
      notes
    } = req.body;

    logger.info(`[REPATRIATION] 📝 Initiating repatriation: ${repatriationId}`);

    // Pinned to BanksMSP: InitiateRepatriation enforces a bank MSP
    // (repatriation.go: isBankMSP) and the shared gateway otherwise signs
    // as whatever org the previous concurrent request connected as
    // (cb12f0b4 precedent). submitTransactionAs throws on chain failure,
    // exactly like submitTransaction did here.
    const result = await fabricService.submitTransactionAs('BanksMSP', 'InitiateRepatriation',
      repatriationId,
      paymentId,
      contractId,
      shipmentId,
      exporterId,
      String(exportAmount),
      currency,
      fcyAccountNumber,
      fcyBank,
      fcyBankBIC,
      shipmentDate
    );

    if (!result.success) {
      logger.error(`[REPATRIATION] ❌ Failed to initiate: ${result.error}`);
      const status = initiateFailureStatus(result.error || '');
      return res.status(status ?? 500).json({
        success: false,
        error: result.error
      });
    }

    logger.info(`[REPATRIATION] ✅ Initiated: ${repatriationId}`);

    // LEG3 M-11: mirror the initiation to Postgres, INCLUDING the three
    // form extras the old handler dropped (swiftReference -> the
    // swift_references evidence array, bankStatementRef -> bank
    // certificate, notes -> comments). Ledger-first and best-effort: the
    // chain write already committed; a mirror failure is logged, never
    // failed. compliance_deadline mirrors the chaincode's shipment date
    // + 120 days (repatriation.go); status PENDING matches the ledger.
    try {
      const deadline = new Date(`${shipmentDate}T00:00:00.000Z`);
      deadline.setUTCDate(deadline.getUTCDate() + 120);
      await postgresDb.run(
        `INSERT INTO export_proceeds_repatriation (
          repatriation_id, payment_id, contract_id, shipment_id, exporter_id,
          export_amount, currency, fcy_account_number, fcy_bank, fcy_bank_bic,
          shipment_date, compliance_deadline, status,
          swift_references, bank_certificate, comments
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'PENDING', $13, $14, $15)
        ON CONFLICT (repatriation_id) DO NOTHING`,
        [
          repatriationId, paymentId, contractId, shipmentId, exporterId,
          Number(exportAmount), currency, fcyAccountNumber, fcyBank, fcyBankBIC,
          shipmentDate, deadline.toISOString(),
          swiftReference ? JSON.stringify([swiftReference]) : '[]',
          bankStatementRef || null,
          notes || null,
        ]
      );
    } catch (mirrorErr) {
      logger.warn(`[REPATRIATION] Could not mirror initiation of ${repatriationId} to Postgres:`, mirrorErr);
    }
    // Audit: this chain move never wrote an audit_trail row.
    // Best-effort — a failed audit write must not fail the move.
    await logAuditBestEffort(req, {
      entityType: 'REPATRIATION',
      entityId: repatriationId,
      action: 'INITIATE',
      newValue: 'PENDING',
      blockchainTxId: result.transactionId || undefined,
      metadata: { paymentId, contractId, shipmentId, exporterId, blockchainTxId: result.transactionId || null },
    }, `repatriation ${repatriationId} initiate`);


    res.status(201).json({
      success: true,
      message: 'Repatriation initiated successfully',
      data: {
        repatriationId,
        swiftReference: swiftReference || undefined,
        bankStatementRef: bankStatementRef || undefined,
        notes: notes || undefined,
      },
      txId: result.transactionId
    });
  } catch (error: any) {
    logger.error('[REPATRIATION] ❌ Error initiating:', error);
    const status = initiateFailureStatus(error?.message || '');
    res.status(status ?? 500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/v1/repatriation/:id/record — Record actual repatriation
// LEG3 M-11 (same class as /initiate): no validation — an empty body
// failed at the Fabric layer as a 500.
// Map a RecordRepatriation / penalty / waiver-approve chain failure to
// its client-error HTTP status. submitTransactionAs throws on chain
// failure (fabricService.ts:2881-2889), so the classification must live in
// the catch as well as the !success branch — the earlier fix only changed
// the !success branch, and the throw path still returned 500 for a
// missing record or an over-remaining amount. A chaincode refusal is a
// client/state error, not a server error; anything unrecognised stays 500.
function repatFailureStatus(error: string): number | null {
  const e = (error || '').toLowerCase();
  if (e.includes('does not exist')) return 400;
  if (e.includes('exceed')) return 400;
  if (e.includes('required') || e.includes('must be') || e.includes('invalid') || e.includes('cannot be')) return 400;
  if (e.includes('already')) return 409;
  if (e.includes('not in') || e.includes('not ready') || e.includes('no pending waiver')) return 409;
  if (e.includes('only nbe') || e.includes('only banks') || e.includes('only exporter')) return 403;
  return null;
}

router.post('/:id/record', authMiddleware, requireRole(['BANKS', 'BANK', 'BANK_ADMIN', 'BANK OFFICER']), [
  param('id').notEmpty().withMessage('Repatriation ID is required'),
  body('repatriatedAmount').isFloat({ min: 0 }).withMessage('Repatriated amount must be 0 or greater'),
  body('convertedAmount').isFloat({ min: 0 }).withMessage('Converted amount must be 0 or greater'),
  // Chaincode RecordRepatriation accepts a partial entry (amounts
  // non-negative, at least one positive) — the old pair of gt:0
  // validators rejected a retention-only or conversion-only entry the
  // ledger accepts. Each amount must be >= 0 and at least one > 0.
  body('convertedAmount').custom((_, { req }) => {
    const rep = Number((req.body as any)?.repatriatedAmount);
    const conv = Number((req.body as any)?.convertedAmount);
    if (!(rep > 0 || conv > 0)) {
      throw new Error('At least one of repatriatedAmount or convertedAmount must be greater than 0');
    }
    return true;
  }),
  body('exchangeRate').isFloat({ gt: 0 }).withMessage('Exchange rate must be greater than 0'),
  body('swiftReference').optional().isString(),
  body('bankCertificate').optional().isString(),
], validateRequest, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      repatriatedAmount,
      convertedAmount,
      exchangeRate,
      swiftReference,
      bankCertificate
    } = req.body;

    logger.info(`[REPATRIATION] 💰 Recording repatriation: ${id}`);

    const result = await fabricService.submitTransactionAs('BanksMSP', 'RecordRepatriation',
      id,
      String(repatriatedAmount),
      String(convertedAmount),
      String(exchangeRate),
      swiftReference || '',
      bankCertificate || ''
    );

    if (!result.success) {
      logger.error(`[REPATRIATION] ❌ Failed to record: ${result.error}`);
      return res.status(repatFailureStatus(result.error || '') ?? 500).json({ 
        success: false, 
        error: result.error 
      });
    }

    logger.info(`[REPATRIATION] ✅ Recorded: ${id}`);
    // Audit: this chain move never wrote an audit_trail row.
    // Best-effort — a failed audit write must not fail the move.
    await logAuditBestEffort(req, {
      entityType: 'REPATRIATION',
      entityId: id,
      action: 'RECORD',
      blockchainTxId: result.transactionId || undefined,
      metadata: { repatriatedAmount, convertedAmount, exchangeRate, swiftReference, blockchainTxId: result.transactionId || null },
    }, `repatriation ${id} record`);


    // Mirror the record into Postgres: RecordRepatriation moves the
    // ledger to PARTIAL / COMPLIED (READY_FOR_VERIFICATION when the
    // split is recorded), but this route never mirrored it — PG stayed
    // PENDING. Ledger-read-back, best-effort (see
    // mirrorRepatriationFromLedger above).
    await mirrorRepatriationFromLedger(id, (req as any).user);

    // In-app notification (persisted feed + live WS broadcast).
    // Recording a repatriation previously emitted nothing, so another
    // NBE/bank user never heard about it live. Role-only rows: a
    // repatriation id resolves to no exporter on its own.
    await notificationService.emitWorkflowEvent({
      type: 'repatriation_recorded',
      title: `Repatriation ${id} recorded`,
      message: `Repatriation ${id} was recorded (repatriated ${repatriatedAmount}, converted ${convertedAmount}).`,
      entityType: 'repatriation', entityId: id, severity: 'success',
      roles: ['BANKS', 'NBE'],
      actionUrl: '/portals/exporter?tab=payments',
      actionUrls: { BANKS: '/portals/banks?tab=contracts', NBE: '/portals/nbe?tab=contracts' },
    });

    res.json({
      success: true,
      message: 'Repatriation recorded successfully',
      txId: result.transactionId
    });
  } catch (error: any) {
    logger.error('[REPATRIATION] ❌ Error recording:', error);
    res.status(repatFailureStatus(error.message || '') ?? 500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Map a VerifyRepatriation chain failure to its client-error HTTP status.
// submitTransaction throws on chain failure (fabricService.ts:2881-2889),
// so the classification must live in the catch as well as the !success
// branch: a missing record or a record in the wrong state (e.g. already
// COMPLIED) is a client-side state failure, not a server error (F-8).
// Non-existent -> 400, wrong state -> 409, missing reference -> 400,
// wrong signing MSP -> 403; anything else stays 500.
function verifyFailureStatus(error: string): number | null {
  if (error.includes('does not exist')) return 400;
  if (error.includes('not ready for compliance verification')) return 409;
  if (error.includes('verification reference is required')) return 400;
  if (error.includes('only NBE can verify')) return 403;
  return null;
}

// POST /api/v1/repatriation/:id/verify — NBE verify repatriation
router.post('/:id/verify', authMiddleware, requireRole(['NBE', 'NBE_ADMIN', 'NBE OFFICER']), async (req, res) => {
  try {
    const { id } = req.params;
    const { verificationRef, verificationNotes } = req.body;

    logger.info(`[REPATRIATION] ✅ NBE verifying: ${id}`);

    const result = await fabricService.submitTransactionAs('NBEMSP', 'VerifyRepatriation',
      id,
      verificationRef || '',
      verificationNotes || ''
    );

    if (!result.success) {
      logger.error(`[REPATRIATION] ❌ Failed to verify: ${result.error}`);
      const status = verifyFailureStatus(result.error || '');
      return res.status(status ?? 500).json({
        success: false,
        error: result.error
      });
    }

    logger.info(`[REPATRIATION] ✅ Verified: ${id}`);

    // N4: mirror the verification into Postgres, matching the ledger.
    // The old handler wrote to the chain only, so the PG row stayed
    // PENDING with NULL verification fields while the ledger was
    // COMPLIED. Ledger-first and best-effort: the chain write already
    // committed; a mirror failure is logged, never failed. The state
    // is read back from the ledger (COMPLIED or NON_COMPLIANT) rather
    // than assumed, so the mirror matches what the chain holds.
    try {
      const ledgerRecord = await fabricService.evaluateTransaction('ReadRepatriation', id);
      if (ledgerRecord.success && ledgerRecord.data) {
        const d: any = ledgerRecord.data;
        const mirrored = await postgresDb.run(
          `UPDATE export_proceeds_repatriation
           SET status = $1, verified_by = $2, verified_by_msp = $3,
               verification_date = $4, verification_ref = $5,
               verification_notes = $6, compliance_date = $7,
               is_overdue = $8, updated_at = CURRENT_TIMESTAMP
           WHERE repatriation_id = $9`,
          [
            d.status || d.Status || null,
            d.verifiedBy || d.VerifiedBy || null,
            d.verifiedByMsp || d.VerifiedByMSP || null,
            d.verificationDate || d.VerificationDate || null,
            d.verificationRef || d.VerificationRef || null,
            d.verificationNotes || d.VerificationNotes || null,
            d.complianceDate || d.ComplianceDate || null,
            d.isOverdue ?? d.IsOverdue ?? false,
            id,
          ]
        );
        if (!mirrored || mirrored.rowCount === 0) {
          logger.warn(`[REPATRIATION] Verify mirror: no PG row for ${id} — ledger is ${d.status || d.Status} but Postgres has nothing to update`);
        }
      } else {
        logger.warn(`[REPATRIATION] Could not read back ${id} from the ledger to mirror verification:`, ledgerRecord.error);
      }
    } catch (mirrorErr) {
      logger.warn(`[REPATRIATION] Could not mirror verification of ${id} to Postgres:`, mirrorErr);
    }
    // Audit: this chain move never wrote an audit_trail row.
    // Best-effort — a failed audit write must not fail the move.
    await logAuditBestEffort(req, {
      entityType: 'REPATRIATION',
      entityId: id,
      action: 'VERIFY',
      blockchainTxId: result.transactionId || undefined,
      metadata: { verificationRef, verificationNotes, blockchainTxId: result.transactionId || null },
    }, `repatriation ${id} verify`);


    res.json({
      success: true,
      message: 'Repatriation verified successfully',
      txId: result.transactionId
    });
  } catch (error: any) {
    logger.error('[REPATRIATION] ❌ Error verifying:', error);
    const status = verifyFailureStatus(error.message || '');
    res.status(status ?? 500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/v1/repatriation/:id/penalty — Apply penalty
router.post('/:id/penalty', authMiddleware, requireRole(['NBE', 'NBE_ADMIN', 'NBE OFFICER']), async (req, res) => {
  try {
    const { id } = req.params;
    const { penaltyAmount, penaltyCurrency, reason } = req.body;

    logger.info(`[REPATRIATION] ⚠️  Applying penalty: ${id}`);

    const result = await fabricService.submitTransactionAs('NBEMSP', 'ApplyNonCompliancePenalty',
      id,
      String(penaltyAmount),
      penaltyCurrency,
      reason
    );

    if (!result.success) {
      logger.error(`[REPATRIATION] ❌ Failed to apply penalty: ${result.error}`);
      // A chaincode refusal (bad amount, wrong state, missing record) is
      // a client/state error, not a server error — report 400, never 500.
      return res.status(repatFailureStatus(result.error || '') ?? 400).json({
        success: false,
        error: result.error
      });
    }

    logger.info(`[REPATRIATION] ✅ Penalty applied: ${id}`);
    // Mirror the penalty into Postgres: ApplyNonCompliancePenalty can
    // move the ledger to OVERDUE, but this route never mirrored it.
    // Ledger-read-back, best-effort (see mirrorRepatriationFromLedger).
    await mirrorRepatriationFromLedger(id, (req as any).user);
    // Audit: this chain move never wrote an audit_trail row.
    // Best-effort — a failed audit write must not fail the move.
    await logAuditBestEffort(req, {
      entityType: 'REPATRIATION',
      entityId: id,
      action: 'APPLY_PENALTY',
      blockchainTxId: result.transactionId || undefined,
      metadata: { penaltyAmount, penaltyCurrency, reason, blockchainTxId: result.transactionId || null },
    }, `repatriation ${id} penalty`);


    res.json({
      success: true,
      message: 'Penalty applied successfully',
      txId: result.transactionId
    });
  } catch (error: any) {
    logger.error('[REPATRIATION] ❌ Error applying penalty:', error);
    // submitTransactionAs throws on chain failure, so the same
    // classification must apply here (see repatFailureStatus above).
    res.status(repatFailureStatus(error.message || '') ?? 500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// POST /api/v1/repatriation/:id/waiver/request — Request waiver
router.post('/:id/waiver/request', authMiddleware, requireRole(['EXPORTER']), async (req, res) => {
  try {
    const { id } = req.params;
    const { waiverReason } = req.body;

    const record = await fabricService.evaluateTransaction('ReadRepatriation', id);
    const user = (req as any).user;
    if (!record.success || !record.data) {
      return res.status(404).json({ success: false, error: 'Repatriation record not found' });
    }
    if (String(user?.exporterId || user?.username || '') !== String(record.data.exporterId || record.data.ExporterID || '')) {
      return res.status(403).json({ success: false, error: 'Exporters can only request waivers for their own repatriation records' });
    }
    if (!String(waiverReason || '').trim()) {
      return res.status(400).json({ success: false, error: 'A waiver reason is required' });
    }

    logger.info(`[REPATRIATION] 📄 Requesting waiver: ${id}`);

    const result = await fabricService.submitTransactionAs('ECTAMSP', 'RequestWaiver',
      id,
      waiverReason
    );

    if (!result.success) {
      logger.error(`[REPATRIATION] ❌ Failed to request waiver: ${result.error}`);
      return res.status(500).json({ 
        success: false, 
        error: result.error 
      });
    }

    logger.info(`[REPATRIATION] ✅ Waiver requested: ${id}`);
    // Mirror the waiver request into Postgres (waiver_requested /
    // waiver_reason on the ledger doc), same read-back rule as the
    // other chain moves. Best-effort.
    await mirrorRepatriationFromLedger(id, (req as any).user);
    // Audit: this chain move never wrote an audit_trail row.
    // Best-effort — a failed audit write must not fail the move.
    await logAuditBestEffort(req, {
      entityType: 'REPATRIATION',
      entityId: id,
      action: 'REQUEST_WAIVER',
      blockchainTxId: result.transactionId || undefined,
      metadata: { waiverReason, blockchainTxId: result.transactionId || null },
    }, `repatriation ${id} waiver-request`);


    res.json({
      success: true,
      message: 'Waiver requested successfully',
      txId: result.transactionId
    });
  } catch (error: any) {
    logger.error('[REPATRIATION] ❌ Error requesting waiver:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// POST /api/v1/repatriation/:id/waiver/approve — Approve/reject waiver
router.post('/:id/waiver/approve', authMiddleware, requireRole(['NBE', 'NBE_ADMIN', 'NBE OFFICER']), async (req, res) => {
  try {
    const { id } = req.params;
    const { approved, reason } = req.body;

    logger.info(`[REPATRIATION] 📋 NBE approving waiver: ${id}`);

    const result = await fabricService.submitTransactionAs('NBEMSP', 'ApproveWaiver',
      id,
      String(approved),
      reason || ''
    );

    if (!result.success) {
      logger.error(`[REPATRIATION] ❌ Failed to approve waiver: ${result.error}`);
      // A chaincode refusal (no pending waiver, empty reason) is a
      // client/state error, not a server error — report 400, never 500.
      return res.status(repatFailureStatus(result.error || '') ?? 400).json({
        success: false,
        error: result.error
      });
    }

    logger.info(`[REPATRIATION] ✅ Waiver ${approved ? 'approved' : 'rejected'}: ${id}`);
    // Mirror the waiver decision into Postgres: ApproveWaiver moves
    // the ledger to WAIVED (REP-PROBE-20261115 went COMPLIED → WAIVED
    // with no PG update). Ledger-read-back, best-effort.
    await mirrorRepatriationFromLedger(id, (req as any).user);
    // Audit: this chain move never wrote an audit_trail row.
    // Best-effort — a failed audit write must not fail the move.
    await logAuditBestEffort(req, {
      entityType: 'REPATRIATION',
      entityId: id,
      action: approved ? 'APPROVE_WAIVER' : 'REJECT_WAIVER',
      blockchainTxId: result.transactionId || undefined,
      metadata: { approved, reason, blockchainTxId: result.transactionId || null },
    }, `repatriation ${id} waiver-approve`);


    res.json({
      success: true,
      message: `Waiver ${approved ? 'approved' : 'rejected'} successfully`,
      txId: result.transactionId
    });
  } catch (error: any) {
    logger.error('[REPATRIATION] ❌ Error approving waiver:', error);
    // submitTransactionAs throws on chain failure, so the same
    // classification must apply here (see repatFailureStatus above).
    res.status(repatFailureStatus(error.message || '') ?? 500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * POST /api/v1/repatriation/resync (2026-11-19, pg-ledger-equality fix round)
 *
 * Heal export_proceeds_repatriation from ledger truth, mirroring POST
 * /banking/lc/resync (ADMIN-only, idempotent). The audit found 5
 * status diffs (PG written PENDING at initiation, never updated when
 * the ledger moved to COMPLIED / PARTIAL / WAIVED) — healed here from
 * QueryAllRepatriations — and 4 ledger-only rows, backfilled here from
 * the ledger docs (INSERT-only, ON CONFLICT DO NOTHING). Two of the
 * backfilled rows (REP-FOREX-REPAT-TXID-20261115[-B]) have only a
 * partial PG echo in the wrong table — forex_repatriations rows with a
 * blank repatriation_id (the Nov-15 NBE forex-repatriation route wrote
 * there and synced to the chain but never inserted into
 * export_proceeds_repatriation). Those echo rows are LINKED to the
 * backfilled rows (repatriation_id set, no rows duplicated or
 * deleted): rows 4/5/7 → REP-FOREX-REPAT-TXID-20261115, row 6 → -B.
 * A repeat call heals 0 rows, backfills 0, links 0.
 */
router.post('/resync', authMiddleware, requireRole(['ADMIN']), async (req, res) => {
  try {
    const ledgerMap = await fetchLedgerRepatriationMap();
    if (!ledgerMap) {
      return res.status(502).json({
        success: false,
        error: { code: 'LEDGER_UNAVAILABLE', message: 'Could not read repatriations from the ledger (QueryAllRepatriations failed)' },
        timestamp: new Date().toISOString(),
      });
    }
    const actor = (req as any).user;
    const healed: Array<{ repatriationId: string; from: string; to: string }> = [];
    const backfilled: string[] = [];
    const skipped: Array<{ repatriationId: string; reason: string }> = [];
    for (const [repatriationId, doc] of ledgerMap) {
      const existing: any = await postgresDb.get(
        `SELECT repatriation_id FROM export_proceeds_repatriation WHERE repatriation_id = $1`,
        [repatriationId],
      );
      if (!existing) {
        const result = await backfillRepatriation(doc, actor);
        if (result.inserted) backfilled.push(repatriationId);
        else skipped.push({ repatriationId, reason: result.reason || 'backfill failed' });
        continue;
      }
      const result = await healRepatriationRow(repatriationId, doc, actor);
      if (result.healed) {
        healed.push({ repatriationId, from: String(result.oldStatus), to: String(result.newStatus) });
      } else if (result.reason && result.reason !== 'already equal' && !result.reason.startsWith('status already equal')) {
        skipped.push({ repatriationId, reason: result.reason });
      }
    }
    // Link the forex_repatriations echoes to the (now existing)
    // export_proceeds_repatriation rows: the echo's forex_allocation_id
    // is the repatriation id without its REP- prefix
    // (FOREX-REPAT-TXID-20261115 ↔ REP-FOREX-REPAT-TXID-20261115).
    // Only blank repatriation_id rows are linked; the triplicate rows
    // for one allocation all point at the same repatriation — that is
    // the honest shape of the Nov-15 test, not a new duplication.
    const linked: Array<{ forexRepatriationRow: number; repatriationId: string }> = [];
    for (const [repatriationId] of ledgerMap) {
      const forexAllocId = repatriationId.replace(/^REP-/, '');
      const echoRows: any[] = await postgresDb.all(
        `SELECT id FROM forex_repatriations WHERE forex_allocation_id = $1 AND (repatriation_id IS NULL OR repatriation_id = '')`,
        [forexAllocId],
      );
      for (const echo of echoRows) {
        await postgresDb.run(
          `UPDATE forex_repatriations SET repatriation_id = $1 WHERE id = $2`,
          [repatriationId, echo.id],
        );
        linked.push({ forexRepatriationRow: echo.id, repatriationId });
      }
    }
    const pgCount = await postgresDb.get(`SELECT COUNT(*)::int AS n FROM export_proceeds_repatriation`, []);
    res.json({
      success: true,
      data: {
        ledgerTotal: ledgerMap.size,
        pgTotal: (pgCount as any)?.n ?? null,
        healed,
        healedCount: healed.length,
        backfilled,
        backfilledCount: backfilled.length,
        linked,
        linkedCount: linked.length,
        skipped,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('[REPATRIATION] ❌ Resync error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message },
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
