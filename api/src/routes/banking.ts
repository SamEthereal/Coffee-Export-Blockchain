// Ethiopian Coffee Export Consortium Blockchain System (CECBS)
// Banking API Routes - Letter of Credit, Forex & Export Permits

import express, { Request, Response } from 'express';
import { FabricService, isRealPaymentRow } from '../services/fabricService';
import { LCService } from '../services/lcService';
import { ForexService } from '../services/forexService';
import { PaymentService } from '../services/paymentService';
import { BlockchainSignatureService } from '../services/blockchainSignatureService';
import { DatabaseService } from '../services/databaseService';
import { logger } from '../utils/logger';
import { logAuditBestEffort } from '../utils/auditBestEffort';
import notificationService from '../services/notificationService';
import { validateRequest } from '../middleware/validation';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { dedupeById, isValidLC } from '../utils/dataFilters';
import { body, param } from 'express-validator';
import { resolveDocumentPath } from '../utils/fileUtils';
import { validateBankAccount, validateBIC } from '../utils/fieldValidation';
import { cadRoutes, consignmentRoutes, lcDiscrepancyRoutes } from './banking/index';

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
const lcService = LCService.getInstance();
const forexService = ForexService.getInstance();
const paymentService = PaymentService.getInstance();
const signatureService = BlockchainSignatureService.getInstance();
const dbService = DatabaseService.getInstance();

// GET /api/v1/banking/payment-methods
router.get('/payment-methods', authMiddleware, async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: [
        { id: 'LC', name: 'Letter of Credit', description: 'Bank-guaranteed payment' },
        { id: 'DP', name: 'Documents against Payment', description: 'Payment on document presentation' },
        { id: 'DA', name: 'Documents against Acceptance', description: 'Deferred payment' },
        { id: 'TT', name: 'Telegraphic Transfer', description: 'Direct bank transfer' },
        { id: 'CAD', name: 'Cash Against Documents', description: 'Cash payment on delivery' }
      ],
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @swagger
 * /api/v1/banking/lc/request:
 *   post:
 *     summary: Request Letter of Credit
 *     tags: [Banking]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - lcID
 *               - contractID
 *               - exporterID
 *               - bankName
 *               - amount
 *               - currency
 *               - expiryDate
 *             properties:
 *               lcID:
 *                 type: string
 *               contractID:
 *                 type: string
 *               exporterID:
 *                 type: string
 *               bankName:
 *                 type: string
 *               amount:
 *                 type: string
 *               currency:
 *                 type: string
 *               expiryDate:
 *                 type: string
 *     responses:
 *       201:
 *         description: LC requested successfully
 */
router.post('/lc/request',
  authMiddleware,
  requireRole(['EXPORTER', 'ECTA', 'ECTA_ADMIN', 'ADMIN']),  // ✅ Exporters and ECTA admins can request LCs
  [
    body('lcID').notEmpty().withMessage('LC ID is required'),
    body('contractID').notEmpty().withMessage('Contract ID is required'),
    body('exporterID').notEmpty().withMessage('Exporter ID is required'),
    // Validation fix (2026-11-13): bankName is a legacy fallback for the
    // advising bank only — the Exporter portal sends advisingBank (and
    // issuingBank) and no bankName, so requiring it 400d every portal LC
    // request with 'Bank name is required'. The handler resolves the
    // advising bank from advisingBank / the contract / bankName, so an
    // omitted bankName is fine.
    body('bankName').optional().isString().withMessage('Bank name must be a string'),
    body('amount').notEmpty().withMessage('Amount is required'),
    body('currency').notEmpty().withMessage('Currency is required'),
    body('expiryDate').notEmpty().withMessage('Expiry date is required'),
    // LEG 1 (F6a): the remaining 10 fields of the exporter's 17-field
    // LC form. They were never declared here, so the API validated and
    // stored only 7 of them — and stored bankName (the ADVISING bank)
    // as issuing_bank. bankName is kept as a fallback for the advising
    // bank only; issuingBank is the buyer's bank.
    // E2E leg 1 (F16): issuingBank is required — the buyer's bank
    // that opens the LC. It used to be optional and silently auto-mapped
    // from the contract; the form now pre-fills it from the contract
    // (editable) and sends it explicitly.
    body('issuingBank').notEmpty().withMessage('Issuing bank is required'),
    body('advisingBank').optional().isString(),
    body('beneficiary').optional().isString(),
    body('terms').optional().isString(),
    body('transportMode').optional().isString(),
    body('portOfLoading').optional().isString(),
    body('portOfDischarge').optional().isString(),
    body('latestShipmentDate').optional().isISO8601().withMessage('Latest shipment date must be a valid ISO date'),
    body('partialShipment').optional().isBoolean(),
    body('transhipment').optional().isBoolean(),
    body('paymentTerms').optional().isString(),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const {
        lcID,
        contractID,
        exporterID,
        bankName,
        amount,
        currency,
        expiryDate,
        issuingBank,
        advisingBank,
        beneficiary,
        terms,
        transportMode,
        portOfLoading,
        portOfDischarge,
        latestShipmentDate,
        partialShipment,
        transhipment,
        paymentTerms,
      } = req.body;
      const requester = (req as any).user;
      if (String(requester?.role || '').toUpperCase() === 'EXPORTER' &&
          String(requester?.exporterId || requester?.username || '') !== String(exporterID)) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Exporters can request LCs only for their own exporter account' },
          timestamp: new Date().toISOString(),
        });
      }

      // AUTO-MAPPING: Fetch contract data to auto-populate LC fields
      let autoMappedData: any = {};
      // FAST-REJECT (fix/lc-fast-reject): the contract status read here
      // also drives the pre-invoke APPROVED check below. Null means the
      // read failed — then we proceed as before and let the chaincode
      // decide, instead of turning a transient query failure into a
      // false rejection.
      let contractStatus: string | null = null;
      try {
        const contractResult = await fabricService.queryChaincode('ReadSalesContract', [contractID]);
        if (contractResult.success && contractResult.data) {
          const contract = contractResult.data;
          contractStatus = String(contract.ContractStatus || contract.contractStatus || contract.status || '').toUpperCase() || null;
          autoMappedData.exporterID = contract.ExporterID || contract.exporterID || exporterID;
          autoMappedData.currency = contract.Currency || contract.currency || 'USD';
          // LEG 1 (F6a): the ledger auto-maps the banks from the
          // contract (buyer's bank issues, exporter's bank advises).
          // Mirror the same mapping here so the PG row stores the
          // correct issuing bank instead of bankName (the advising
          // bank the form puts in bankName).
          autoMappedData.issuingBank = contract.BuyerBank || contract.buyerBank || '';
          autoMappedData.advisingBank = contract.ExporterBank || contract.exporterBank || '';
          
          // Calculate LC amount from contract value if not provided
          const pricePerKg = parseFloat(contract.PricePerKg || contract.pricePerKg || '0');
          const quantity = parseFloat(contract.Quantity || contract.quantity || '0');
          autoMappedData.calculatedAmount = (pricePerKg * quantity).toFixed(2);
          
          logger.info(`[LC] Auto-mapped from contract: exporterID=${autoMappedData.exporterID}, amount=${autoMappedData.calculatedAmount}, currency=${autoMappedData.currency}`);
        }
      } catch (error) {
        logger.warn('[LC] Could not fetch contract for auto-mapping:', error);
      }

      // DUPLICATE CHECK: Ensure no LC already exists for this contract
      try {
        const allLCsResult = await fabricService.queryChaincode('QueryAllLCs', []);
        if (allLCsResult.success && allLCsResult.data) {
          const existingLC = allLCsResult.data.find((lc: any) => 
            (lc.contractId === contractID || lc.ContractID === contractID)
          );
          
          if (existingLC) {
            logger.warn(`[LC] Duplicate LC request blocked for contract ${contractID}. Existing LC: ${existingLC.lcId || existingLC.LCID}`);
            return res.status(409).json({
              success: false,
              error: {
                code: 'DUPLICATE_LC',
                message: `An LC already exists for contract ${contractID}`,
                existingLC: existingLC.lcId || existingLC.LCID,
                existingStatus: existingLC.status || existingLC.Status,
              },
              timestamp: new Date().toISOString(),
            });
          }
        }
      } catch (error) {
        logger.warn('[LC] Could not check for duplicate LCs:', error);
        // Continue anyway - if check fails, let chaincode handle it
      }

      // FAST REJECT (fix/lc-fast-reject): RequestLC requires an APPROVED
      // contract, and approval auto-creates the LC, so a manual request
      // for a non-APPROVED contract can never succeed. Reject here — two
      // cheap ledger queries in, before any invoke — instead of paying
      // the ~19 s endorse round-trip and surfacing a raw 6-peer error
      // dump (LC_REQUEST_FAILED) in the UI. The chaincode rule is
      // unchanged; this only surfaces it early. An unknown status
      // (contract read failed above) still falls through to the
      // chaincode, as before.
      if (contractStatus && contractStatus !== 'APPROVED') {
        logger.warn(`[LC] Fast-reject LC request for contract ${contractID}: status ${contractStatus}, must be APPROVED`);
        return res.status(400).json({
          success: false,
          error: {
            code: 'LC_CONTRACT_NOT_APPROVED',
            message: `Contract ${contractID} must be APPROVED before an LC can be requested (current status: ${contractStatus}). The LC is created automatically when ECTA approves the contract.`,
          },
          timestamp: new Date().toISOString(),
        });
      }

      // Use provided values or auto-mapped values
      const finalExporterID = exporterID || autoMappedData.exporterID || '';
      const finalAmount = amount || autoMappedData.calculatedAmount || '0';
      const finalCurrency = currency || autoMappedData.currency || 'USD';
      // LEG 1 (F6a): issuing bank = the buyer's bank (explicit, else
      // the contract's buyer bank). NEVER bankName: the form puts the
      // ADVISING bank there, and the old code stored it as
      // issuing_bank. Advising bank = explicit, else the contract's
      // exporter bank, else bankName as a last resort.
      // E2E leg 1 (F16): no silent auto-map — the validator above
      // already 400s a missing issuingBank. The contract-derived bank
      // remains only as a chaincode-level fallback for older callers.
      const finalIssuingBank = issuingBank || '';
      const finalAdvisingBank = advisingBank || autoMappedData.advisingBank || bankName || '';
      // Beneficiary is the exporter company. When the form omits it,
      // resolve the company name from PG; the chaincode also falls back
      // to the ledger exporter record, so the two never disagree by
      // more than a stale lookup.
      let finalBeneficiary = beneficiary || '';
      if (!finalBeneficiary) {
        try {
          const exporterRow = await dbService.get(
            `SELECT company_name FROM exporter_applications WHERE exporter_id = $1
             UNION ALL SELECT company_name FROM exporters WHERE exporter_id = $1 LIMIT 1`,
            [finalExporterID]
          );
          finalBeneficiary = exporterRow?.company_name || finalExporterID;
        } catch {
          finalBeneficiary = finalExporterID;
        }
      }
      const finalTerms = terms || paymentTerms || '';

      // 🔐 CRITICAL: Connect as ECTAMSP (exporters use ECTA as intermediary)
      // Exporters are NOT blockchain consortium members - they use the system through ECTA
      await fabricService.connectAsOrg('ECTAMSP');
      logger.info(`[LC REQUEST] Connected as ECTAMSP (ECTA facilitates exporter LC requests)`);

      const result = await fabricService.requestLC(
        lcID,
        contractID,
        finalExporterID,
        // Validation fix (2026-11-13): bankName is optional now (see the
        // validator above) — never pass undefined into the chaincode args;
        // the resolved advising bank is the fallback.
        bankName || finalAdvisingBank,
        finalAmount,
        finalCurrency,
        expiryDate,
        undefined,
        finalBeneficiary,
        finalTerms,
        // SEQ 9 (F6a fix): pass the resolved banks through so the ledger
        // records the same issuing/advising banks as the PG mirror and
        // the API response below (previously the chaincode always
        // derived them from the contract, diverging from both).
        finalIssuingBank,
        finalAdvisingBank,
        // SEQ 11 (E2E leg 1, F14): the four form fields that used to
        // live PG-only — now carried to the ledger.
        latestShipmentDate || '',
        portOfLoading || '',
        portOfDischarge || '',
        paymentTerms || ''
      );

      if (result.success) {
        logger.info(`✅ LC requested successfully: ${lcID} with auto-mapped data`);
        
        // ✅ STORE BLOCKCHAIN SIGNATURE
        try {
          const signatureId = `SIG-${Date.now()}-${require('crypto').randomBytes(8).toString('hex')}`;
          await dbService.run(
            `INSERT INTO blockchain_signatures (
              signature_id, blockchain_tx_id, entity_type, entity_id,
              chaincode_function, signer_org, signer_username,
              blockchain_timestamp, action_type, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, NOW())
            ON CONFLICT (signature_id) DO NOTHING`,
            [
              signatureId,
              result.txId,
              'LC',
              lcID,
              'RequestLC',
              (req as any).user?.org || 'ExportersMSP',
              (req as any).user?.username || 'exporter',
              'LC_REQUESTED'
            ]
          );
          logger.info(`✅ Blockchain signature stored: ${signatureId}`);
        } catch (sigErr) {
          logger.error(`⚠️ Failed to store blockchain signature:`, sigErr);
        }
        
        // ✅ Sync to PostgreSQL for fast queries
        // LEG 1 (F6a): store the resolved banks (issuing = buyer's
        // bank, advising = exporter's bank) and the remaining form
        // fields. The old insert stored bankName as issuing_bank and
        // dropped beneficiary/terms/shipping details entirely.
        try {
          await dbService.run(
            `INSERT INTO letters_of_credit (
              lc_id, lc_number, contract_id, exporter_id, issuing_bank, advising_bank,
              beneficiary, amount, currency, terms,
              latest_shipment_date, port_of_loading, port_of_discharge, payment_terms,
              partial_shipment, transhipment,
              status, expiry_date, request_date, created_at, updated_at
            ) VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'REQUESTED', $16, $17, NOW(), NOW())
            ON CONFLICT (lc_id) DO UPDATE SET
              contract_id = EXCLUDED.contract_id,
              exporter_id = EXCLUDED.exporter_id,
              issuing_bank = EXCLUDED.issuing_bank,
              advising_bank = EXCLUDED.advising_bank,
              beneficiary = EXCLUDED.beneficiary,
              amount = EXCLUDED.amount,
              currency = EXCLUDED.currency,
              terms = EXCLUDED.terms,
              latest_shipment_date = EXCLUDED.latest_shipment_date,
              port_of_loading = EXCLUDED.port_of_loading,
              port_of_discharge = EXCLUDED.port_of_discharge,
              payment_terms = EXCLUDED.payment_terms,
              partial_shipment = EXCLUDED.partial_shipment,
              transhipment = EXCLUDED.transhipment,
              status = EXCLUDED.status,
              expiry_date = EXCLUDED.expiry_date,
              request_date = EXCLUDED.request_date,
              updated_at = NOW()`,
            [lcID, contractID, finalExporterID, finalIssuingBank, finalAdvisingBank,
             finalBeneficiary, finalAmount, finalCurrency, finalTerms || null,
             latestShipmentDate || null, portOfLoading || null, portOfDischarge || null,
             paymentTerms || null, partialShipment === true || partialShipment === 'true',
             transhipment === true || transhipment === 'true',
             expiryDate, new Date().toISOString()]
          );
          logger.info(`✅ LC ${lcID} synced to PostgreSQL`);
          // Audit: this chain move never wrote an audit_trail row — the
          // audited lcService/forexService methods are never called here.
          // Best-effort — a failed audit write must not fail the move.
          await logAuditBestEffort(req, {
            entityType: 'LC',
            entityId: lcID,
            action: 'REQUEST',
            newValue: 'REQUESTED',
            blockchainTxId: result.txId || undefined,
            metadata: { contractID, exporterID: finalExporterID, amount: finalAmount, blockchainTxId: result.txId || null },
          }, `lc ${lcID} request`);

        } catch (syncErr) {
          logger.warn(`⚠️  Failed to sync LC to PostgreSQL:`, syncErr);
          // Non-fatal - blockchain is source of truth
        }
        
        res.status(201).json({
          success: true,
          data: {
            lcID: lcID,
            contractID: contractID,
            exporterID: finalExporterID,
            issuingBank: finalIssuingBank,
            advisingBank: finalAdvisingBank,
            beneficiary: finalBeneficiary,
            status: 'REQUESTED',
            latestShipmentDate: latestShipmentDate || null,
            portOfLoading: portOfLoading || null,
            portOfDischarge: portOfDischarge || null,
            paymentTerms: paymentTerms || null,
            ...result.data,
          },
          autoMapped: {
            exporterID: finalExporterID,
            amount: finalAmount,
            currency: finalCurrency,
          },
          txId: result.txId,
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(400).json({
          success: false,
          error: {
            code: 'LC_REQUEST_FAILED',
            message: result.error || 'Failed to request LC',
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.error('Error requesting LC:', error);
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
 * /api/v1/banking/lc/{lcID}/document-checklist:
 *   get:
 *     summary: Get LC document compliance checklist
 *     tags: [Banking]
 */
router.get('/lc/:lcID/document-checklist', authMiddleware, async (req, res) => {
  try {
    const { lcID } = req.params;
    const { stage } = req.query;

    // Get LC and contract info
    const lc = await dbService.get(
      'SELECT lc_id, contract_id, exporter_id, status FROM letters_of_credit WHERE lc_id = $1',
      [lcID]
    );

    if (!lc) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'LC not found' },
        timestamp: new Date().toISOString(),
      });
    }

    const { lcDocumentValidationService } = await import('../services/lcDocumentValidationService');

    // Determine stage based on LC status if not provided
    let validationStage: 'APPROVAL' | 'ISSUANCE' | 'PAYMENT_RELEASE' = 'APPROVAL';
    if (stage) {
      validationStage = String(stage).toUpperCase() as any;
    } else {
      // Auto-determine stage from LC status
      const lcStatus = String(lc.status).toUpperCase();
      if (lcStatus === 'REQUESTED') {
        validationStage = 'APPROVAL';
      } else if (lcStatus === 'APPROVED') {
        validationStage = 'ISSUANCE';
      } else if (lcStatus === 'ISSUED') {
        validationStage = 'PAYMENT_RELEASE';
      }
    }

    // Get document checklist
    const checklist = await lcDocumentValidationService.getDocumentChecklist(
      validationStage,
      lc.contract_id,
      lc.exporter_id,
      lcID
    );

    // Get validation status
    let validationStatus;
    if (validationStage === 'APPROVAL') {
      validationStatus = await lcDocumentValidationService.canApproveLCRequest(lcID, lc.contract_id);
    } else if (validationStage === 'ISSUANCE') {
      validationStatus = await lcDocumentValidationService.canIssueLCRequest(lcID, lc.contract_id, lc.exporter_id);
    }

    res.json({
      success: true,
      data: {
        lcId: lcID,
        contractId: lc.contract_id,
        currentStage: validationStage,
        lcStatus: lc.status,
        checklist,
        validation: validationStatus,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('[BANKING] Error getting LC document checklist:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * @swagger
 * /api/v1/banking/lc/{lcID}/approve:
 *   post:
 *     summary: Approve Letter of Credit
 *     tags: [Banking]
 */
router.post('/lc/:lcID/approve',
  authMiddleware,
  requireRole(['BANKS', 'BANK_ADMIN']),  // ✅ Only banks can approve LCs
  [
    param('lcID').notEmpty().withMessage('LC ID is required'),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { lcID } = req.params;
      
      // ✅ VALIDATE DOCUMENT REQUIREMENTS BEFORE APPROVAL
      const { lcDocumentValidationService } = await import('../services/lcDocumentValidationService');
      
      // Get LC and contract info for validation
      const lc = await dbService.get(
        'SELECT lc_id, contract_id, exporter_id, status FROM letters_of_credit WHERE lc_id = $1',
        [lcID]
      );

      if (!lc) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'LC not found' },
          timestamp: new Date().toISOString(),
        });
      }

      // Check if all required documents are available
      const documentValidation = await lcDocumentValidationService.canApproveLCRequest(lcID, lc.contract_id);
      
      if (!documentValidation.canApprove) {
        logger.warn(`[LC APPROVE] Cannot approve LC ${lcID}: ${documentValidation.reason}`);
        return res.status(400).json({
          success: false,
          error: {
            code: 'DOCUMENT_REQUIREMENTS_NOT_MET',
            message: documentValidation.reason || 'Required documents not available',
            missingDocuments: documentValidation.missingDocuments,
            details: documentValidation.validationDetails,
          },
          timestamp: new Date().toISOString(),
        });
      }

      logger.info(`[LC APPROVE] ✅ Document validation passed for LC ${lcID}`);
      
      // Get the logged-in user's bank organization
      const user = (req as any).user;
      if (!user || !user.org) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User organization not found',
          },
          timestamp: new Date().toISOString(),
        });
      }

      const issuingBank = user.org; // e.g., "Commercial Bank of Ethiopia"
      const advisingBank = issuingBank; // Same bank for now
      const beneficiary = req.body.beneficiary || 'Exporter'; // Get from exporter if available

      // 🔐 CRITICAL: Connect as BanksMSP so blockchain transaction is signed by bank identity
      await fabricService.connectAsOrg('BanksMSP');
      logger.info(`[LC APPROVE] Connected as BanksMSP for user ${user.username}`);

      logger.info(`[LC APPROVE] Calling approveLC with params:`, {
        lcID,
        issuingBank,
        advisingBank,
        beneficiary
      });

      const result = await fabricService.approveLC(
        lcID,
        issuingBank,
        advisingBank,
        beneficiary,
        'BanksMSP'
      );

      logger.info(`[LC APPROVE] Result received:`, {
        success: result.success,
        txId: result.txId,
        error: result.error,
        consensus: result.consensus
      });

      if (result.success) {
        logger.info(`LC approved successfully: ${lcID} by ${issuingBank}`);
        
        // 📋 STORE ENDORSEMENT DATA TO BLOCKCHAIN (CouchDB)
        // This writes the actual endorsers to CouchDB so they're part of the blockchain state
        if (result.endorsers && result.endorsers.length > 0 && result.txId) {
          try {
            logger.info(`💎 Storing ${result.endorsers.length} endorsers to blockchain CouchDB`, {
              txId: result.txId,
              endorsers: result.endorsers.map(e => e.mspId)
            });
            
            // Store each endorser as a signature record in CouchDB via chaincode
            // Key format: SIG_{EntityType}_{EntityID}_{MSP}
            for (const endorser of result.endorsers) {
              const signatureKey = `SIG_LC_${lcID}_${endorser.mspId}`;
              const signatureData = {
                entityType: 'LETTER_OF_CREDIT',
                entityId: lcID,
                transactionId: result.txId,
                chaincodeFunction: 'ApproveLC',
                endorserMsp: endorser.mspId,
                endorserEndpoint: endorser.endpoint,
                timestamp: new Date().toISOString(),
                actionType: 'LC_APPROVAL'
              };
              
              // Use PutState via a helper chaincode function or direct CouchDB write
              // For now, store in PostgreSQL and let the query combine them
              await dbService.run(
                `INSERT INTO blockchain_signatures (
                  signature_id, blockchain_tx_id, entity_type, entity_id, 
                  chaincode_function, signer_org, signer_username,
                  blockchain_timestamp, action_type
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                  signatureKey,
                  result.txId,
                  'LETTER_OF_CREDIT',
                  lcID,
                  'ApproveLC',
                  endorser.mspId,
                  user.username,
                  new Date().toISOString(),
                  'LC_APPROVAL'
                ]
              );
            }
            
            logger.info(`✅ Stored ${result.endorsers.length} endorsement records to PostgreSQL (blockchain cache)`);
          } catch (endorserErr) {
            logger.warn(`Failed to store endorsement data:`, endorserErr);
            // Don't fail the approval if endorsement storage fails
          }
        }
        
        // ✅ SIGN LC DOCUMENTS - Add cryptographic signature with bank officer's identity
        try {
          const { DatabaseService } = await import('../services/databaseService');
          const { persistDocumentLedgerProof, signDocumentFile } = await import('../services/documentSigningService');
          const db = DatabaseService.getInstance();
          
          // Get all LC-related documents
          const lcDocuments = await db.all(
            `SELECT document_id, file_path, file_hash, mime_type, file_name 
             FROM documents 
             WHERE entity_type = 'LC' 
               AND entity_id = $1 
               AND status = 'active'`,
            [lcID]
          );
          
          // Sign each document with bank officer's cryptographic identity
          for (const doc of lcDocuments) {
            const signatureId = `SIG-${doc.document_id}-${user.org}-${Date.now()}`;
            const timestamp = new Date().toISOString();
            
            // Resolve physical file path for visual signature
            const resolvedPath = resolveDocumentPath(doc.file_path, doc.file_name);
            const isPDF = doc.mime_type === 'application/pdf' || doc.file_name.toLowerCase().endsWith('.pdf');
            let visualSignatureAdded = false;
            let detachedSignatureCreated = false;
            let documentHash = doc.file_hash;
            
            if (resolvedPath) {
              try {
                // Get current signature count for positioning
                const sigCountResult = await db.get(
                  'SELECT COUNT(*) as count FROM document_signatures WHERE document_id = $1',
                  [doc.document_id]
                );
                const positionIndex = parseInt(sigCountResult?.count || '0');

                const proof = await signDocumentFile({
                  filePath: resolvedPath,
                  signerUsername: user.username || user.sub || 'bank_officer',
                  signerEmail: user.email,
                  organization: user.org || issuingBank,
                  reason: `Letter of Credit ${lcID} approved by ${issuingBank}`,
                  documentId: doc.document_id,
                  documentType: doc.document_type || 'LETTER_OF_CREDIT',
                  positionIndex,
                  isPDF,
                });
                documentHash = proof.documentHash;
                visualSignatureAdded = proof.visualSignatureAdded;
                detachedSignatureCreated = proof.detachedSignatureCreated;
                await db.run(
                  'UPDATE documents SET file_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE document_id = $2',
                  [documentHash, doc.document_id]
                );
              } catch (pdfError) {
                logger.warn(`Failed to add visual signature to PDF ${doc.document_id}:`, pdfError);
              }
            }
            
            // Store cryptographic signature in database
            await db.run(
              `INSERT INTO document_signatures (
                signature_id, document_id, signer_id, signer_org, signature_type,
                certificate_id, remarks, blockchain_tx_id, visual_signature_added
                , detached_signature_created, document_hash_signed
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
              [
                signatureId,
                doc.document_id,
                user.username || user.sub,
                user.org || issuingBank,
                'APPROVE',
                user.sub || null, // X.509 certificate ID
                `Letter of Credit ${lcID} approved by ${issuingBank}`,
                result.txId || null,
                visualSignatureAdded,
                detachedSignatureCreated,
                documentHash
              ]
            );
            
            // Sign document on blockchain
            try {
              if (fabricService.isConnected()) {
                if (!documentHash) throw new Error('Document content hash is unavailable');
                const blockchainSigResult = await fabricService.signDocument(
                  doc.document_id,
                  documentHash,
                  'APPROVE',
                  `LC ${lcID} approved by ${issuingBank}`
                );
                
                if (blockchainSigResult.success && blockchainSigResult.txId) {
                  await persistDocumentLedgerProof(
                    db,
                    signatureId,
                    doc.document_id,
                    documentHash,
                    detachedSignatureCreated,
                    blockchainSigResult.txId
                  );
                  logger.info(`✅ Blockchain signature recorded for LC document: ${doc.document_id}`);
                }
              }
            } catch (blockchainSigError) {
              logger.warn(`Blockchain document signature failed for ${doc.document_id}:`, blockchainSigError);
            }
            
            logger.info(`✅ LC document signed by ${user.username} (${user.org}): ${doc.document_id}`);
          }
          
          if (lcDocuments.length > 0) {
            logger.info(`✅ Signed ${lcDocuments.length} LC document(s) with bank officer's cryptographic identity`);
          }
        } catch (signError) {
          logger.error('Failed to sign LC documents:', signError);
          // Don't fail the LC approval if document signing fails
        }
        
        // ✅ Sync LC approval to PostgreSQL
        try {
          await dbService.run(
            `UPDATE letters_of_credit SET 
              status = $1, 
              approval_date = $2,
              approved_by = $3,
              approved_by_msp = $4,
              updated_at = NOW()
            WHERE lc_id = $5`,
            ['APPROVED', new Date().toISOString(), user.username, 'BanksMSP', lcID]
          );
          logger.info(`✅ LC ${lcID} approval synced to PostgreSQL`);
          // Audit: this chain move never wrote an audit_trail row — the
          // audited lcService/forexService methods are never called here.
          // Best-effort — a failed audit write must not fail the move.
          await logAuditBestEffort(req, {
            entityType: 'LC',
            entityId: lcID,
            action: 'APPROVE',
            oldValue: 'REQUESTED',
            newValue: 'APPROVED',
            blockchainTxId: result.txId || undefined,
            metadata: { issuingBank, advisingBank, beneficiary, blockchainTxId: result.txId || null },
          }, `lc ${lcID} approve`);

        } catch (syncErr) {
          logger.warn(`⚠️  Failed to sync LC approval to PostgreSQL:`, syncErr);
        }

        // M1 (2026-11-18, banks-tabs-status fix): the UCP 600 approval
        // gate (canApproveLCRequest) passes only when all 5 APPROVAL-stage
        // CONTRACT documents are present — and passing it IS the bank's
        // examination of those documents. Until now nothing ever marked
        // them verified, so they stayed `pending` forever and the
        // Payment Release tab's every-doc-verified gate (plus the exam
        // dialog's Mark Compliant button) could never pass for an LC
        // that went through the current flow. Mark them verified here,
        // tied to this approval: verification_status/verified on the
        // documents rows + a document_verifications row each, with the
        // ApproveLC tx id in notes so the verification traces to the
        // approval transaction. Shipping documents are NOT touched —
        // they are examined per-document in the exam dialog before
        // examine-documents. Best-effort: a failed marking must not
        // fail the approval (the chain move already landed).
        try {
          const { getRequiredDocuments } = await import('../config/lcDocumentRequirements');
          const approvalDocTypes = getRequiredDocuments('APPROVAL')
            .filter((d: any) => d.required)
            .map((d: any) => d.documentType);
          const approvalDocs: any[] = await dbService.all(
            `SELECT document_id FROM documents
             WHERE entity_type = 'CONTRACT' AND entity_id = $1
               AND status IN ('active', 'approved')
               AND document_type = ANY($2)
               AND COALESCE(verification_status, 'pending') <> 'verified'`,
            [lc.contract_id, approvalDocTypes]
          );
          const verifiedById = /^\d+$/.test(String((user as any)?.userId || ''))
            ? parseInt(String((user as any).userId), 10) : null;
          for (const doc of approvalDocs) {
            await dbService.run(
              `UPDATE documents SET verification_status = 'verified', verified = true WHERE document_id = $1`,
              [doc.document_id]
            );
            await dbService.run(
              `INSERT INTO document_verifications (document_id, verified_by, verification_date, status, notes)
               VALUES ($1, $2, NOW(), 'verified', $3)`,
              [doc.document_id, verifiedById,
               `Verified as part of LC ${lcID} approval (UCP 600 approval examination; approve tx: ${result.txId || 'unknown'})`]
            );
          }
          if (approvalDocs.length > 0) {
            logger.info(`[LC APPROVE] ✅ Marked ${approvalDocs.length} approval-stage documents verified for LC ${lcID}`);
          }
        } catch (markErr) {
          logger.warn(`⚠️  Failed to mark approval documents verified for LC ${lcID}:`, markErr);
        }

        // In-app notification (persisted feed + live WS broadcast).
        // LC approval previously emitted nothing, so another bank user
        // (or the exporter) never heard about it live.
        await notificationService.emitWorkflowEvent({
          type: 'lc_approved',
          title: `Letter of Credit ${lcID} approved`,
          message: `Letter of Credit ${lcID} has been approved.`,
          entityType: 'lc', entityId: lcID, severity: 'success',
          roles: ['BANKS'], exporterId: lc.exporter_id, lcId: lcID,
          actionUrl: '/portals/exporter?tab=contracts',
          actionUrls: { BANKS: '/portals/banks?tab=contracts' },
        });

        res.json({
          success: true,
          data: result.data,
          txId: result.txId,
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(400).json({
          success: false,
          error: {
            code: 'LC_APPROVAL_FAILED',
            message: result.error || 'Failed to approve LC',
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.error('Error approving LC:', error);
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
 * /api/v1/banking/lc/{lcID}/reject:
 *   post:
 *     summary: Reject Letter of Credit
 *     tags: [Banking]
 */
router.post('/lc/:lcID/reject',
  authMiddleware,
  requireRole(['BANKS', 'BANK_ADMIN']),
  [
    param('lcID').notEmpty().withMessage('LC ID is required'),
    body('rejectionReason').isString().trim().isLength({ min: 10, max: 500 })
      .withMessage('Rejection reason must be between 10 and 500 characters'),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { lcID } = req.params;
      const rejectionReason = String(req.body.rejectionReason).trim();
      
      // Get the logged-in user's bank organization
      const user = (req as any).user;
      if (!user || !user.org) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User organization not found',
          },
          timestamp: new Date().toISOString(),
        });
      }

      // Sign with the authenticated bank identity. Chaincode independently
      // checks the signer MSP and does not trust the organization in the body.
      await fabricService.connectAsOrg('BanksMSP');
      const result = await fabricService.invokeChaincode('RejectLC', [lcID, rejectionReason], 'BanksMSP');

      if (result.success) {
        logger.info(`LC rejected: ${lcID} by ${user.org}`);
        // Audit: this chain move never wrote an audit_trail row — the
        // audited lcService/forexService methods are never called here.
        // Best-effort — a failed audit write must not fail the move.
        await logAuditBestEffort(req, {
          entityType: 'LC',
          entityId: lcID,
          action: 'REJECT',
          newValue: 'REJECTED',
          blockchainTxId: result.txId || undefined,
          metadata: { rejectionReason, blockchainTxId: result.txId || null },
        }, `lc ${lcID} reject`);

        try {
          await dbService.run(
            `UPDATE letters_of_credit
             SET status = $1, rejection_reason = $2, rejected_by = $3,
                 rejected_by_msp = $4, rejection_date = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE lc_id = $5`,
            ['REJECTED', rejectionReason, user.username || user.sub || 'Bank Officer', 'BanksMSP', lcID]
          );
        } catch (syncError) {
          // The ledger is authoritative; report the successful on-chain result
          // even if the query-optimized PostgreSQL mirror needs reconciliation.
          logger.warn(`Failed to sync rejected LC ${lcID} to PostgreSQL`, syncError);
        }
        // In-app notification (persisted feed + live WS broadcast).
        // LC rejection previously emitted nothing, so another bank user
        // (or the exporter) never heard about it live.
        await notificationService.emitWorkflowEvent({
          type: 'lc_rejected',
          title: `Letter of Credit ${lcID} rejected`,
          message: `Letter of Credit ${lcID} was rejected: ${rejectionReason}`,
          entityType: 'lc', entityId: lcID, severity: 'warning',
          roles: ['BANKS'], lcId: lcID,
          actionUrl: '/portals/exporter?tab=contracts',
          actionUrls: { BANKS: '/portals/banks?tab=contracts' },
        });

        res.json({
          success: true,
          data: result.data,
          txId: result.txId,
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(400).json({
          success: false,
          error: {
            code: 'LC_REJECTION_FAILED',
            message: result.error || 'Failed to reject LC',
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.error('Error rejecting LC:', error);
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
 * /api/v1/forex/{forexID}/reject:
 *   post:
 *     summary: Reject Forex Allocation Request
 *     tags: [Forex]
 */
router.post('/forex/:forexID/reject',
  authMiddleware,
  // Previously auth-only: any authenticated user could reject a forex
  // request. Only the issuing bank may do that (LC approve/reject in
  // this file already require BANKS).
  requireRole(['BANKS', 'BANK_ADMIN']),
  [
    param('forexID').notEmpty().withMessage('Forex ID is required'),
    body('rejectionReason').isString().trim().isLength({ min: 10, max: 500 })
      .withMessage('Rejection reason must be between 10 and 500 characters'),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { forexID } = req.params;
      const { rejectionReason } = req.body;
      
      // Get the logged-in user's bank organization
      const user = (req as any).user;
      if (!user || !user.org) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User organization not found',
          },
          timestamp: new Date().toISOString(),
        });
      }

      // Ledger-first: RejectForex (REQUESTED/CONFIRMED -> REJECTED,
      // forex.go) must commit on-chain before anything is mirrored. The
      // old code returned success:true and wrote REJECTED to Postgres even
      // when the chain call failed, so the portal showed REJECTED while
      // the ledger still said REQUESTED (and the allocation stayed in the
      // NBE pending list on-chain). Fail honestly instead, like the
      // quality perform route (503 INSPECTION_PERFORM_FAILED) — a
      // rejected-on-paper forex is a phantom.
      let blockchainSynced = false;
      let blockchainWarning: string | undefined;
      let chainTxId: string | null = null;
      try {
        const chainResult = await fabricService.invokeChaincode('RejectForex', [
          forexID,
          rejectionReason,
          user.org,
        ], user.org);
        if (chainResult.success) {
          blockchainSynced = true;
          chainTxId = chainResult.txId || null;
        } else {
          blockchainWarning = `Chaincode RejectForex did not reject ${forexID}: ${chainResult.error || 'unknown error'}`;
          logger.warn(`[BANKING] ${blockchainWarning}`);
        }
      } catch (chainError: any) {
        blockchainWarning = `Could not reject ${forexID} on the ledger (no Fabric here?): ${chainError.message}`;
        logger.warn(`[BANKING] ${blockchainWarning}`);
      }

      if (!blockchainSynced) {
        return res.status(503).json({
          success: false,
          error: {
            code: 'FOREX_REJECT_FAILED',
            message: blockchainWarning || `Failed to reject forex request ${forexID} on the ledger; no status change was recorded.`,
          },
          timestamp: new Date().toISOString(),
        });
      }

      // Mirror the rejection to Postgres (REJECTED is in
      // chk_forex_allocations_status since migration 060) — only after
      // the ledger commit above.
      try {
        await dbService.run(`
          UPDATE forex_allocations
          SET status = 'REJECTED',
              updated_at = CURRENT_TIMESTAMP
          WHERE allocation_id = $1 OR forex_id = $1 OR CAST(id AS TEXT) = $1
        `, [forexID]);
      } catch (pgError: any) {
        logger.warn(`[BANKING] Forex rejection PG mirror failed for ${forexID}: ${pgError.message}`);
      }

      logger.info(`Forex request rejected: ${forexID} by ${user.org}. Reason: ${rejectionReason} (blockchainSynced: ${blockchainSynced})`);
      // Audit: this chain move never wrote an audit_trail row — the
      // audited lcService/forexService methods are never called here.
      // Best-effort — a failed audit write must not fail the move.
      await logAuditBestEffort(req, {
        entityType: 'FOREX',
        entityId: forexID,
        action: 'REJECT',
        newValue: 'REJECTED',
        blockchainTxId: chainTxId || undefined,
        metadata: { rejectionReason, blockchainSynced, blockchainTxId: chainTxId || null },
      }, `forex ${forexID} reject`);

      res.json({
        success: true,
        data: {
          forexId: forexID,
          status: 'REJECTED',
          rejectedBy: user.org,
          rejectionReason,
          blockchainSynced,
          blockchainWarning,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error rejecting forex request:', error);
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
 * /api/v1/banking/lc/issue:
 *   post:
 *     summary: Issue Letter of Credit (direct with body data)
 *     tags: [Banking]
 */
router.post('/lc/issue',
  authMiddleware,
  requireRole(['BANKS', 'BANK_ADMIN']),  // ✅ Only banks can issue LCs
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const {
        lcId, lcID,
        lcNumber,
        contractId, contractID,
        exporterId, exporterID,
        issuingBank,
        advisingBank,
        beneficiary,
        applicant,
        amount,
        currency,
        expiryDate,
        latestShipmentDate,
        portOfLoading,
        portOfDischarge,
        paymentTerms,
        partialShipment,
        transhipment,
        lcType,
        bankName,
        shippingTerms
      } = req.body;

      // Support both camelCase and uppercase ID variants
      const _lcId = lcId || lcID;
      const _contractId = contractId || contractID;
      const _exporterId = exporterId || exporterID;
      
      // Validate required fields
      if (!_lcId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'LC ID is required'
          },
          timestamp: new Date().toISOString()
        });
      }
      
      if (!amount || isNaN(Number(amount))) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Valid amount is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      logger.info('[BANKING] Issuing LC with auto-forex trigger:', { lcId: _lcId, contractId: _contractId, exporterId: _exporterId, amount, currency });

      // Use LCService which automatically triggers forex allocation
      const result = await lcService.issueLC({
        lcID: _lcId,
        lcNumber: lcNumber || _lcId,
        contractID: _contractId || '',
        exporterID: _exporterId || '',
        issuingBank: issuingBank || '',
        advisingBank: advisingBank || '',
        beneficiary: beneficiary || _exporterId || '',
        applicant: applicant || 'Buyer',
        amount: Number(amount),
        currency: currency || 'USD',
        expiryDate: expiryDate || '',
        latestShipmentDate: latestShipmentDate || expiryDate || '',
        portOfLoading: portOfLoading || '',
        portOfDischarge: portOfDischarge || '',
        paymentTerms: paymentTerms || 'Sight LC',
        partialShipment: partialShipment || false,
        transhipment: transhipment || false,
        userId: user.username,
        userOrg: user.org || 'BanksMSP'
      });

      logger.info(`✅ [BANKING] LC issued successfully: ${_lcId}, Forex auto-triggered: ${result.forexAutoCreated}`);
      
      // Forex auto-creation handled by LCService - check if successful
      // F1: on an AMENDED re-issue the forex request is REUSED (it already
      // exists from the first issue) — no new REQUEST happened in this
      // call, so no new signature row is recorded against the issue tx.
      try {
        if (result.forexAutoCreated && result.forexID && !result.forexReused) {
          const forexId = result.forexID;
          logger.info(`✅ Forex request auto-created on blockchain: ${forexId} for LC ${_lcId}`);
          
          // Record blockchain signature
          try {
            const user = (req as any).user;
            await signatureService.recordSignature({
              entityType: 'FOREX_ALLOCATION',
              entityId: forexId,
              actionType: 'REQUEST',
              signerUsername: user?.username || 'bank',
              signerOrg: user?.org || 'BanksMSP',
              signerRole: user?.role || 'BANKS',
              blockchainTxId: result.blockchainTxId || '',
              blockchainTimestamp: new Date(),
              chaincodeName: 'coffee',
              chaincodeFunction: 'RequestForex',
              transactionArgs: [forexId, _contractId || '', _exporterId || '', Number(amount).toString(), currency || 'USD'],
              metadata: {
                lcId: _lcId,
                contractId: _contractId,
                exporterId: _exporterId,
                amount: Number(amount),
                currency: currency || 'USD',
                autoCreated: true,
                createdBy: 'LC_ISSUANCE',
                status: 'REQUESTED'  // Mark as REQUESTED when created
              }
            });
          } catch (sigError) {
            logger.warn('Failed to record forex signature:', sigError);
          }
        } else {
          logger.warn(`⚠️ Forex auto-request failed for LC ${_lcId}`);
        }
      } catch (forexErr: any) {
        logger.warn(`⚠️ Forex auto-request error for LC ${_lcId}:`, forexErr);
        // Non-fatal — LC issuance already succeeded
      }

      // In-app notification (persisted feed + live WS broadcast).
      await notificationService.emitWorkflowEvent({
        type: 'lc_issued',
        title: `Letter of Credit ${_lcId} issued`,
        message: `Letter of Credit ${_lcId} has been issued for contract ${_contractId || ''} (${currency || 'USD'} ${Number(amount || 0).toLocaleString()}).`,
        entityType: 'lc', entityId: _lcId, severity: 'success',
        roles: ['BANKS'], exporterId: _exporterId, lcId: _lcId,
        actionUrl: '/portals/exporter?tab=contracts',
        actionUrls: { BANKS: '/portals/banks?tab=contracts' },
      });

      // LEG 1 (F6b): fail honestly when the auto-forex request did not
      // happen. The old code returned 201 success:true with
      // forexAutoCreated:false and a 'LC issued successfully' message,
      // so the bank never knew the forex leg was missing. The LC IS
      // issued (status + tx id are returned), but the caller must retry
      // the forex leg (POST /forex/request or /lc/:id/allocate-forex)
      // instead of assuming it exists.
      if (!result.forexAutoCreated) {
        return res.status(502).json({
          success: false,
          error: {
            code: 'FOREX_AUTO_CREATE_FAILED',
            message: `LC ${_lcId} was issued, but the automatic forex request could not be created. Request forex manually for this LC.`,
          },
          data: {
            lcID: _lcId,
            status: 'ISSUED',
            blockchainTxId: result.blockchainTxId,
            forexAutoCreated: false,
          },
          timestamp: new Date().toISOString(),
        });
      }
      res.status(201).json({
        success: true,
        data: {
          lcID: _lcId,
          status: 'ISSUED',
          blockchainTxId: result.blockchainTxId,
          forexAutoCreated: result.forexAutoCreated,
          forexID: result.forexID,
          // F1: re-issue of an AMENDED LC reuses the first issue's forex
          // request instead of failing on the duplicate (no 502).
          forexReused: !!result.forexReused,
          reissued: !!result.reissued,
        },
        message: result.forexAutoCreated
          ? (result.forexReused
              ? `LC re-issued and existing forex request ${result.forexID} reused`
              : `LC issued and forex request ${result.forexID} automatically created`)
          : 'LC issued successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error('[BANKING] Error issuing LC:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'LC_ISSUE_FAILED',
          message: error.message || 'Failed to issue LC'
        },
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * POST /api/v1/banking/lc/standby/issue
 * Issue Standby Letter of Credit (SBLC) - UCP 600 / ISP98
 * Used for performance guarantees, advance payment guarantees, bid bonds
 *
 * REGISTRATION ORDER IS LOAD-BEARING: this route MUST stay above
 * router.post('/lc/:lcID/issue') below. Express matches in registration
 * order, and '/lc/:lcID/issue' would otherwise swallow this path with
 * :lcID = "standby" — which is exactly what happened before this fix:
 * the standby handler was unreachable, the regular LC-issue validator
 * demanded `terms`, and with `terms` supplied the regular handler
 * failed on-chain with "LC standby does not exist".
 *
 * LEDGER-FIRST (seq 12): IssueStandbyLC now exists in the chaincode
 * and is called BEFORE the PG insert. A chaincode failure returns 500
 * with no PG row — the old code swallowed the chaincode error ("using
 * database only") and returned a PG-only 201 for an LC that did not
 * exist on the ledger. The PG mirror stores the chain tx id.
 */
router.post('/lc/standby/issue',
  authMiddleware,
  requireRole(['BANKS', 'BANK_ADMIN']),
  [
    body('standbyLCNumber').notEmpty().withMessage('Standby LC number is required'),
    body('contractId').notEmpty().withMessage('Contract ID is required'),
    body('amount').isNumeric().withMessage('Amount must be numeric'),
    body('currency').notEmpty().withMessage('Currency is required'),
    body('expiryDate').notEmpty().withMessage('Expiry date is required'),
    body('type').isIn(['PERFORMANCE', 'ADVANCE_PAYMENT', 'BID_BOND', 'FINANCIAL']).withMessage('Invalid standby LC type'),
    body('purpose').notEmpty().withMessage('Purpose is required'),
    body('beneficiary').notEmpty().withMessage('Beneficiary is required'),
    body('applicant').notEmpty().withMessage('Applicant is required'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const {
        standbyLCNumber,
        contractId,
        amount,
        currency,
        expiryDate,
        type,
        purpose,
        beneficiary,
        applicant,
        terms,
        issuingBank,
        advisingBank
      } = req.body;
      const user = (req as any).user;

      logger.info(`[BANKING] Issuing Standby LC: ${standbyLCNumber}`);

      const standbyId = `SBLC-${Date.now()}`;

      // Duplicate-number pre-check BEFORE the chain write: the PG
      // standby_lc_number UNIQUE constraint would otherwise fail only
      // after the ledger doc exists, leaving a ledger doc with no PG row.
      const existing = await dbService.get(
        `SELECT standby_lc_id FROM standby_letters_of_credit WHERE standby_lc_number = $1`,
        [standbyLCNumber]
      );
      if (existing) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'DUPLICATE_STANDBY_LC',
            message: `Standby LC number ${standbyLCNumber} already exists (${existing.standby_lc_id})`
          },
          timestamp: new Date().toISOString()
        });
      }

      // Ledger first, signed as BanksMSP (the chaincode enforces the
      // bank-MSP gate; the API pins the org the same way IssueLC does).
      await fabricService.connectAsOrg('BanksMSP');
      const chainResult = await fabricService.invokeChaincode('IssueStandbyLC', [
        standbyId,
        standbyLCNumber,
        contractId,
        amount.toString(),
        currency,
        expiryDate,
        type,
        purpose,
        beneficiary,
        applicant,
        terms || '',
        issuingBank || '',
        advisingBank || ''
      ], 'BanksMSP');

      if (!chainResult.success) {
        logger.error(`[BANKING] Standby LC chaincode issue failed for ${standbyLCNumber}: ${chainResult.error}`);
        return res.status(500).json({
          success: false,
          error: {
            code: 'STANDBY_LC_FAILED',
            message: chainResult.error || 'Failed to issue standby LC on the ledger'
          },
          timestamp: new Date().toISOString()
        });
      }

      // Mirror to Postgres only after the ledger write succeeded.
      await dbService.run(`
        INSERT INTO standby_letters_of_credit (
          standby_lc_id, standby_lc_number, contract_id, amount, currency,
          expiry_date, type, purpose, beneficiary, applicant, terms,
          issuing_bank, advising_bank, issued_by, issue_date,
          status, blockchain_tx_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, CURRENT_TIMESTAMP)
      `, [
        standbyId,
        standbyLCNumber,
        contractId,
        amount,
        currency,
        expiryDate,
        type,
        purpose,
        beneficiary,
        applicant,
        terms || 'Payable on first written demand with beneficiary statement',
        issuingBank || user.organization,
        advisingBank || '',
        user.username,
        new Date().toISOString(),
        'ISSUED',
        chainResult.txId || null
      ]);

      logger.info(`✅ [BANKING] Standby LC issued: ${standbyId} (tx ${chainResult.txId})`);
      // Audit: this chain move never wrote an audit_trail row — the
      // audited lcService/forexService methods are never called here.
      // Best-effort — a failed audit write must not fail the move.
      await logAuditBestEffort(req, {
        entityType: 'LC',
        entityId: standbyId,
        action: 'ISSUE_STANDBY_LC',
        newValue: 'ISSUED',
        blockchainTxId: chainResult.txId || undefined,
        metadata: { standbyLCNumber, blockchainTxId: chainResult.txId || null },
      }, `standby lc ${standbyId} issue`);


      res.status(201).json({
        success: true,
        data: {
          standbyLCId: standbyId,
          standbyLCNumber,
          type,
          amount,
          currency,
          beneficiary,
          applicant,
          status: 'ISSUED',
          issueDate: new Date().toISOString(),
          expiryDate,
          blockchainTxId: chainResult.txId
        },
        txId: chainResult.txId,
        message: 'Standby Letter of Credit issued successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      logger.error('[BANKING] Error issuing standby LC:', error);
      res.status(500).json({
        success: false,
        error: { code: 'STANDBY_LC_FAILED', message: error.message || 'Failed to issue standby LC' },
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * GET /api/v1/banking/lc/standby/:standbyId
 * Read a Standby LC — ledger first, PG mirror as fallback.
 * Registered here (above GET /lc/:lcID) for the same shadowing reason
 * as the POST route above: '/lc/:lcID' would otherwise swallow
 * '/lc/standby/<id>' with :lcID = "standby".
 */
router.get('/lc/standby/:standbyId',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { standbyId } = req.params;
      const ledger = await fabricService.getStandbyLC(standbyId);
      if (ledger.success && ledger.data) {
        return res.json({
          success: true,
          data: ledger.data,
          source: 'blockchain',
          timestamp: new Date().toISOString()
        });
      }
      const pgRow = await dbService.get(
        `SELECT * FROM standby_letters_of_credit WHERE standby_lc_id = $1 OR standby_lc_number = $1`,
        [standbyId]
      );
      if (!pgRow) {
        return res.status(404).json({
          success: false,
          error: { code: 'STANDBY_LC_NOT_FOUND', message: `Standby LC ${standbyId} does not exist` },
          timestamp: new Date().toISOString()
        });
      }
      return res.json({
        success: true,
        data: pgRow,
        source: 'database',
        ledgerError: ledger.error || undefined,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error('[BANKING] Error fetching standby LC:', error);
      res.status(500).json({
        success: false,
        error: { code: 'STANDBY_LC_FETCH_FAILED', message: error.message || 'Failed to fetch standby LC' },
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * @swagger
 * /api/v1/banking/lc/{lcID}/issue:
 *   post:
 *     summary: Issue Letter of Credit
 *     tags: [Banking]
 */
router.post('/lc/:lcID/issue',
  authMiddleware,
  requireRole(['BANKS', 'BANK_ADMIN']),  // ✅ Only banks can issue LCs
  [
    param('lcID').notEmpty().withMessage('LC ID is required'),
    body('terms').notEmpty().withMessage('LC terms are required'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { lcID } = req.params;
      const { terms, contractID, exporterID, amount, currency } = req.body;
      const user = (req as any).user; // Get authenticated user info

      // ✅ VALIDATE ISSUANCE REQUIREMENTS BEFORE ISSUING
      const { lcDocumentValidationService } = await import('../services/lcDocumentValidationService');
      
      // Get LC and contract info for validation
      const lc = await dbService.get(
        'SELECT lc_id, contract_id, exporter_id, status, port_of_loading, port_of_discharge, latest_shipment_date FROM letters_of_credit WHERE lc_id = $1',
        [lcID]
      );

      if (!lc) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'LC not found' },
          timestamp: new Date().toISOString(),
        });
      }

      // F1 (2026-11-19): an AMENDED LC can be re-issued. The ledger is the
      // source of truth for the pre-issue status (PG can lag it); if the
      // ledger says AMENDED, heal PG first so the validation below — which
      // reads PG — sees the same state. IssueLC itself only accepts
      // APPROVED, so a re-issue goes through UpdateLCStatus (AMENDED ->
      // ISSUED is a legal transition, banking.go:1081) which preserves the
      // LC's documents, amendments and amendment count on the ledger.
      // CreateAndIssueLC would overwrite all three with empty values.
      let preIssueStatus = String(lc.status || '').toUpperCase();
      try {
        const ledgerLc = await fabricService.getLC(lcID);
        if (ledgerLc?.success && ledgerLc.data) {
          preIssueStatus = String(
            (ledgerLc.data as any).status || (ledgerLc.data as any).Status || preIssueStatus
          ).toUpperCase();
        }
      } catch (ledgerErr: any) {
        logger.warn(`[LC ISSUE] Ledger read failed for ${lcID}, using PG status ${preIssueStatus}:`, ledgerErr?.message);
      }
      const isReissue = preIssueStatus === 'AMENDED';
      if (isReissue && String(lc.status || '').toUpperCase() !== 'AMENDED') {
        await autoHealLCStatus(lcID, 'AMENDED');
      }

      // Check if all requirements for issuance are met
      const issuanceValidation = await lcDocumentValidationService.canIssueLCRequest(
        lcID,
        lc.contract_id,
        lc.exporter_id,
        isReissue ? ['APPROVED', 'AMENDED'] : ['APPROVED']
      );
      
      if (!issuanceValidation.canIssue) {
        logger.warn(`[LC ISSUE] Cannot issue LC ${lcID}: ${issuanceValidation.reason}`);
        return res.status(400).json({
          success: false,
          error: {
            code: 'ISSUANCE_REQUIREMENTS_NOT_MET',
            message: issuanceValidation.reason || 'Requirements for LC issuance not met',
            missingRequirements: issuanceValidation.missingRequirements,
            details: issuanceValidation.validationDetails,
          },
          timestamp: new Date().toISOString(),
        });
      }

      logger.info(`[LC ISSUE] ✅ Issuance validation passed for LC ${lcID}`);

      // Log which organization (bank) is issuing the LC
      logger.info(`[${user?.org || 'BANKS'}] Issuing LC: ${lcID}`, {
        userId: user?.sub,
        organization: user?.org,
        role: user?.role,
      });

      // 🔐 CRITICAL: Connect as BanksMSP so blockchain transaction is signed by bank identity
      await fabricService.connectAsOrg('BanksMSP');
      logger.info(`[LC ISSUE] Connected as BanksMSP for issuing LC ${lcID}`);

      // F1: AMENDED re-issue uses UpdateLCStatus (preserves documents /
      // amendments); a first issue uses IssueLC (APPROVED -> ISSUED).
      const result = isReissue
        ? await fabricService.invokeChaincode('UpdateLCStatus', [lcID, 'ISSUED'], 'BanksMSP')
        : await fabricService.issueLC(lcID, terms, 'BanksMSP');

      if (result.success) {
        logger.info(`[${user?.org}] ✅ LC issued successfully: ${lcID}${isReissue ? ' (AMENDED re-issue)' : ''}`);

        // Auto-create a forex allocation request after LC issuance.
        // LEG 1 (F6b): the outcome is tracked and reported honestly.
        // The old code only logged a warning when the forex leg failed
        // (missing LC data, or getLC failing) while the LC still
        // returned success:true — the bank never knew forex was
        // missing. A failure now returns 502 with the issued LC's
        // status + tx id, so the caller retries the forex leg.
        let forexAutoCreated = false;
        let forexReused = false;
        let forexError = '';
        // Use LC data from request body (no need to read from blockchain with schema issues)
        try {
          // If LC data provided in request, use it; otherwise try reading from blockchain
          let lcContractID = contractID;
          let lcExporterID = exporterID;
          let lcAmount = amount;
          let lcCurrency = currency || 'USD';

          // If data not provided, try reading from blockchain
          if (!lcContractID || !lcExporterID || !lcAmount) {
            logger.info(`[LC ISSUE] LC data not in request, attempting to read from blockchain...`);
            const lcData = await fabricService.getLC(lcID);
            if (lcData.success && lcData.data) {
              const lc = lcData.data;
              lcContractID = lcContractID || lc.contractId || lc.ContractID || '';
              lcExporterID = lcExporterID || lc.exporterId || lc.ExporterID || '';
              lcAmount = lcAmount || lc.amount || lc.Amount || '0';
              lcCurrency = lcCurrency || lc.currency || lc.Currency || 'USD';
            } else {
              logger.warn(`⚠️ Could not read LC ${lcID}: ${lcData.error}`);
              forexError = `Could not read LC ${lcID} from the ledger: ${lcData.error || 'unknown error'}`;
            }
          }

          // Only create forex if we have required data
          if (lcContractID && lcExporterID && lcAmount) {
            // Use LC ID in forex ID for easy matching: FOREX_LC-CONTRACT123-456_REQUEST
            const forexId = `FOREX_${lcID}_REQUEST`;

            // F1 (2026-11-19): on an AMENDED re-issue the forex request
            // already exists from the first issue, and RequestForex
            // rejects duplicates ("forex request ... already exists") —
            // which used to surface as a misleading 502 even though the
            // LC was issued and the forex leg already existed. Ledger
            // first, PG mirror as fallback; reuse means no new chain
            // write and no duplicate PG/audit/signature rows below.
            let existingForex: any = null;
            try {
              const fxRead = await fabricService.getForex(forexId);
              if (fxRead?.success && fxRead.data) existingForex = fxRead.data;
            } catch { /* fall through to the PG check */ }
            if (!existingForex) {
              try {
                existingForex = await dbService.get(
                  'SELECT forex_id, status FROM forex_allocations WHERE forex_id = $1',
                  [forexId]
                );
              } catch { /* treat as not found; the create below decides */ }
            }
            if (existingForex) {
              forexAutoCreated = true;
              forexReused = true;
              logger.info(`🔁 [LC ISSUE] Forex request ${forexId} already exists (status ${existingForex.Status || existingForex.status || 'UNKNOWN'}) — reusing for LC ${lcID}`);
            }

            logger.info(`[LC ISSUE] Creating forex request ${forexId} with: contract=${lcContractID}, exporter=${lcExporterID}, amount=${lcAmount}, currency=${lcCurrency}`);

            // RequestForex takes 5 parameters: forexID, contractID, exporterID, amount, currency
            // NOTE: LC ID is NOT part of RequestForex parameters (linked during allocation).
            // Skipped when reusing an existing request (F1, see above).
            const forexResult = forexReused
              ? null
              : await fabricService.invokeChaincode('RequestForex', [
                forexId,
                lcContractID,
                lcExporterID,
                lcAmount.toString(),
                lcCurrency,
              ], 'BanksMSP');

            if (forexReused) {
              // Reused — already counted; nothing to create or sync.
            } else if (forexResult && forexResult.success) {
              logger.info(`✅ Forex request auto-created on blockchain: ${forexId} for LC ${lcID}`);
              forexAutoCreated = true;

              // Sync forex request to PostgreSQL
              try {
                // Generate a unique allocation_id
                const allocationId = `${forexId}-ALLOC`;

                // fix/forex-signature-trail: the INSERT used to omit
                // blockchain_tx_id, and neither an audit row nor a
                // signature row was written — so an LC-issue auto-created
                // forex had no REQUEST trail anywhere in PG (the txId
                // existed only on the ledger / in the API log). Persist
                // the operation txId and write both trail rows,
                // best-effort: a trail failure must not fail the issue.
                // Also set expiry_date to match LC expiry (90 days from now).
                const forexExpiryDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
                await dbService.run(
                  `INSERT INTO forex_allocations (
                    allocation_id, forex_id, lc_id, contract_id, exporter_id,
                    amount_usd, requested_amount, currency, status, expiry_date, blockchain_tx_id,
                    created_at, updated_at
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
                  ON CONFLICT (forex_id) DO NOTHING`,
                  [
                    allocationId,
                    forexId,
                    lcID,
                    lcContractID,
                    lcExporterID,
                    parseFloat(lcAmount.toString()),
                    parseFloat(lcAmount.toString()), // Also set requested_amount
                    lcCurrency,
                    'REQUESTED',
                    forexExpiryDate,
                    forexResult.txId || null
                  ]
                );
                logger.info(`✅ Forex request synced to PostgreSQL: ${forexId}`);
                try {
                  await dbService.run(
                    `INSERT INTO audit_trail (
                      entity_type, entity_id, action, performed_by,
                      performed_by_org, old_value, new_value, reason,
                      metadata, ip_address, blockchain_tx_id
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                    [
                      'FOREX',
                      forexId,
                      'REQUEST',
                      user?.username || 'SYSTEM',
                      'BanksMSP',
                      JSON.stringify({ status: '' }),
                      JSON.stringify({ status: 'REQUESTED' }),
                      'Forex auto-requested on LC issue',
                      JSON.stringify({ contractId: lcContractID, exporterId: lcExporterID, amount: lcAmount, currency: lcCurrency, lcId: lcID }),
                      '127.0.0.1',
                      forexResult.txId || null
                    ]
                  );
                } catch (auditErr: any) {
                  logger.warn(`⚠️ Failed to audit forex auto-request ${forexId}:`, auditErr?.message);
                }
                try {
                  await signatureService.recordSignature({
                    entityType: 'FOREX_ALLOCATION',
                    entityId: forexId,
                    actionType: 'REQUEST',
                    signerUsername: user?.username || 'SYSTEM',
                    signerOrg: 'BanksMSP',
                    blockchainTxId: forexResult.txId || undefined,
                    blockchainTimestamp: new Date(),
                    chaincodeName: 'coffee',
                    chaincodeFunction: 'RequestForex',
                    transactionArgs: [forexId, lcContractID, lcExporterID, lcAmount.toString(), lcCurrency],
                    metadata: { contractId: lcContractID, exporterId: lcExporterID, amount: lcAmount, currency: lcCurrency, lcId: lcID, autoCreatedOnLcIssue: true },
                  });
                } catch (sigErr: any) {
                  logger.warn(`⚠️ Failed to record forex auto-request signature ${forexId}:`, sigErr?.message);
                }
              } catch (syncErr) {
                logger.warn(`⚠️ Failed to sync forex request to PostgreSQL:`, syncErr);
              }
            } else {
              forexError = forexResult?.error || 'Forex auto-request was rejected by the ledger';
              logger.warn(`⚠️ Forex auto-request failed for LC ${lcID}: ${forexError}`);
            }
          } else {
            forexError = `Cannot create forex request - missing LC data (contract=${lcContractID}, exporter=${lcExporterID}, amount=${lcAmount})`;
            logger.warn(`⚠️ ${forexError}`);
          }
        } catch (forexErr: any) {
          forexError = forexErr?.message || 'Forex auto-request threw an unexpected error';
          logger.warn(`⚠️ Forex auto-request error for LC ${lcID}:`, forexErr);
        }
        
        // ✅ Sync LC issuance to PostgreSQL
        try {
          const user = (req as any).user;
          await dbService.run(
            `UPDATE letters_of_credit SET 
              status = $1, 
              issue_date = $2,
              issued_by = $3,
              issued_by_msp = $4,
              terms = $5,
              updated_at = NOW()
            WHERE lc_id = $6`,
            ['ISSUED', new Date().toISOString(), user?.username || 'Bank', 'BanksMSP', terms, lcID]
          );
          logger.info(`✅ LC ${lcID} issuance synced to PostgreSQL`);
          // Audit: this chain move never wrote an audit_trail row — the
          // audited lcService/forexService methods are never called here.
          // Best-effort — a failed audit write must not fail the move.
          await logAuditBestEffort(req, {
            entityType: 'LC',
            entityId: lcID,
            action: 'ISSUE',
            newValue: 'ISSUED',
            blockchainTxId: result.txId || undefined,
            metadata: { terms, blockchainTxId: result.txId || null },
          }, `lc ${lcID} issue`);

        } catch (syncErr) {
          logger.warn(`⚠️  Failed to sync LC issuance to PostgreSQL:`, syncErr);
        }

        // In-app notification (persisted feed + live WS broadcast).
        await notificationService.emitWorkflowEvent({
          type: 'lc_issued',
          title: `Letter of Credit ${lcID} issued`,
          message: `Letter of Credit ${lcID} has been issued for contract ${contractID || ''} (${currency || 'USD'} ${Number(amount || 0).toLocaleString()}).`,
          entityType: 'lc', entityId: lcID, severity: 'success',
          roles: ['BANKS'], exporterId: exporterID, lcId: lcID,
          actionUrl: '/portals/exporter?tab=contracts',
          actionUrls: { BANKS: '/portals/banks?tab=contracts' },
        });

        // ✅ AUTO-CREATE MT700 SWIFT MESSAGE when LC is issued
        // S3 (2026-11-18, banks-tabs-status fix): the auto-create is
        // best-effort (a failure warns, issue still succeeds), so the
        // UI success copy cannot state the outcome from a hardcoded
        // string. Capture it here and return it, so the UI reports
        // the real outcome (message id when created, false when not).
        let mt700AutoCreated = false;
        let mt700MessageId: string | null = null;
        try {
          logger.info(`[LC ISSUE] Auto-creating MT700 SWIFT message for LC ${lcID}...`);
          
          // Generate SWIFT message ID
          const messageID = `MT700-${lcID}-${Date.now()}`;
          const swiftReference = `${lcID.substring(0, 16)}-${Date.now().toString().substring(-8)}`;
          
          // Get LC and contract data for MT700 fields
          const lcData = lc; // Already loaded at the beginning
          const contract = await dbService.get(
            'SELECT buyer_id, buyer_country, exporter_bank, port_of_loading, port_of_destination FROM contracts WHERE contract_id = $1',
            [lcData.contract_id]
          );

          // B10: CreateMT700_IssueLC takes 13 params
          // (chaincodes/coffee/swift.go:402): messageID, lcID,
          // swiftRef, senderBIC, receiverBIC, applicant, beneficiary,
          // amountStr, currency, expiryDate, loadingPort,
          // dischargePort, latestShipDate. The old call sent 11 and
          // passed `terms` as the 11th arg — `terms` is not a
          // chaincode param at all — so every peer rejected it with
          // "Incorrect number of params. Expected 13, received 11".
          // Ports/dates come from the LC row, falling back to the
          // contract; all three are optional on-chain, so '' when
          // neither has them (same as the manual MT700 route).
          const latestShipDateRaw: any = (lcData as any).latest_shipment_date;
          const latestShipDate = latestShipDateRaw
            ? (latestShipDateRaw instanceof Date
                ? latestShipDateRaw.toISOString().slice(0, 10)
                : String(latestShipDateRaw).slice(0, 10))
            : '';
          // Create MT700 via chaincode
          const mt700Result = await fabricService.invokeChaincode('CreateMT700_IssueLC', [
            messageID,
            lcID,
            swiftReference,
            'CBEETAAAXXX', // Sender BIC (CBE Ethiopia)
            contract?.exporter_bank || 'UNKNOWN', // Receiver BIC (from contract)
            contract?.buyer_id || 'Buyer', // Applicant (buyer)
            exporterID || lcData.exporter_id, // Beneficiary (exporter)
            (amount || 0).toString(),
            currency || 'USD',
            new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), // Expiry: 90 days
            (lcData as any).port_of_loading || contract?.port_of_loading || '', // Loading port
            (lcData as any).port_of_discharge || contract?.port_of_destination || '', // Discharge port
            latestShipDate, // Latest shipment date
          ], 'BanksMSP');

          if (mt700Result.success) {
            mt700AutoCreated = true;
            mt700MessageId = messageID;
            logger.info(`✅ MT700 SWIFT message auto-created: ${messageID} for LC ${lcID}`);

            // Link the message to the LC (best-effort, like the
            // manual MT700 route in swift.ts).
            try {
              await fabricService.invokeChaincode('LinkSWIFTMessageToLC', [messageID, lcID], 'BanksMSP');
            } catch (linkErr: any) {
              logger.warn(`⚠️ Could not link MT700 ${messageID} to LC ${lcID}:`, linkErr?.message || linkErr);
            }

            // Log audit trail
            await logAuditBestEffort(req, {
              entityType: 'SWIFT',
              entityId: messageID,
              action: 'CREATE',
              blockchainTxId: mt700Result.txId || undefined,
              metadata: { messageType: 'MT700', lcID, swiftReference, autoCreated: true },
            }, `swift message ${messageID} auto-create MT700`);
          } else {
            logger.warn(`⚠️ MT700 auto-creation failed for LC ${lcID}: ${mt700Result.error}`);
          }
        } catch (swiftErr: any) {
          // Don't fail the LC issuance if SWIFT creation fails
          logger.warn(`⚠️ MT700 auto-creation error for LC ${lcID}:`, swiftErr?.message || swiftErr);
        }

        // LEG 1 (F6b): honest forex outcome — see the block above.
        if (!forexAutoCreated) {
          return res.status(502).json({
            success: false,
            error: {
              code: 'FOREX_AUTO_CREATE_FAILED',
              message: `LC ${lcID} was issued, but the automatic forex request could not be created (${forexError}). Request forex manually for this LC.`,
            },
            data: {
              lcID,
              status: 'ISSUED',
              txId: result.txId,
              forexAutoCreated: false,
            },
            timestamp: new Date().toISOString(),
          });
        }
        res.json({
          success: true,
          data: { ...result.data, forexAutoCreated: true, forexReused, reissued: isReissue, mt700AutoCreated, mt700MessageId },
          txId: result.txId,
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(400).json({
          success: false,
          error: {
            code: 'LC_ISSUE_FAILED',
            message: result.error || 'Failed to issue LC',
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.error('Error issuing LC:', error);
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
 * POST /api/v1/banking/lc/:lcID/allocate-forex
 * Allocate forex for an issued LC (NBE function)
 * Sets LC status to FOREX_ALLOCATED to enable shipment operations
 */
router.post('/lc/:lcID/allocate-forex',
  authMiddleware,
  requireRole(['NBE', 'NBE_ADMIN', 'BANKS', 'BANK_ADMIN', 'ADMIN']),
  [
    param('lcID').notEmpty().withMessage('LC ID is required'),
    body('exchangeRate').isNumeric().withMessage('Exchange rate must be numeric'),
    body('allocatedAmount').isNumeric().withMessage('Allocated amount must be numeric'),
    // E2E leg 1 (F16): the allocating officer is required — it used to
    // default silently to the caller, so a missing officer recorded an
    // allocation against whoever happened to hold the token. The
    // allocation dialog already requires it; the API now does too.
    body('officer').notEmpty().withMessage('Officer is required'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { lcID } = req.params;
      const { exchangeRate, allocatedAmount, forexID, forexId, forexAllocationId, approvalRef, retentionRate, expiryDate, officer } = req.body;
      const user = (req as any).user;

      logger.info(`[FOREX] Allocating forex for LC: ${lcID}`, {
        exchangeRate,
        allocatedAmount,
        user: user?.username,
        org: user?.org
      });

      // Connect as NBEMSP or BanksMSP
      const msp = user?.org === 'NBE' || user?.org === 'NBE_ADMIN' ? 'NBEMSP' : 'BanksMSP';
      logger.info(`[FOREX] Connecting as ${msp} to read LC ${lcID}`);
      await fabricService.connectAsOrg(msp);

      // Read the LC from the ledger with retry logic (no CouchDB fallback:
      // the ledger is authoritative — a CouchDB-only LC cannot allocate)
      let lcResult: any = null;
      let attempts = 0;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts && (!lcResult || !lcResult.success)) {
        attempts++;
        logger.info(`[FOREX] Attempting to read LC (attempt ${attempts}/${maxAttempts})...`);
        lcResult = await fabricService.getLC(lcID);
        
        if (!lcResult.success) {
          logger.warn(`[FOREX] Failed to read LC on attempt ${attempts}:`, lcResult.error);
          if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
          }
        }
      }
      
      if (!lcResult.success || !lcResult.data) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'LC_NOT_FOUND',
            message: `LC ${lcID} not found`,
          },
          timestamp: new Date().toISOString(),
        });
      }

      const lc = lcResult.data;

      // Resolve the REAL on-chain forex request for this LC — never invent
      // one. LC issue auto-creates it (lcService.triggerForexAutoRequest)
      // and requestForex mirrors it into forex_allocations with lc_id set.
      // Resolution order:
      //   1. explicit forexID / forexId / forexAllocationId in the body
      //      (test/scripts/test-forex-only.sh already sends forexAllocationId)
      //   2. latest REQUESTED/CONFIRMED/APPROVED row for this LC in Postgres
      //   3. on-chain QueryForexByContract for the LC's contract
      // If none resolves, fail honestly with 404 — no allocation recorded.
      let resolvedForexId: string | undefined =
        forexID || forexId || forexAllocationId || undefined;

      if (!resolvedForexId) {
        try {
          const row = await dbService.get(
            `SELECT forex_id FROM forex_allocations
             WHERE lc_id = $1 AND status IN ('REQUESTED', 'CONFIRMED', 'APPROVED')
             ORDER BY created_at DESC LIMIT 1`,
            [lcID]
          );
          resolvedForexId = row?.forex_id || undefined;
        } catch (pgErr: any) {
          logger.warn(`[FOREX] Postgres forex lookup failed for LC ${lcID}:`, pgErr?.message);
        }
      }

      if (!resolvedForexId) {
        // Last resort: the ledger itself. QueryForexByContract returns the
        // contract's forex requests; take the open one for this LC (LCID is
        // only linked at allocation time, so an unallocated request may
        // carry lcId "" — match on that too).
        try {
          const contractId = lc?.contractId || lc?.ContractID || lc?.contract_id;
          if (contractId) {
            const byContract: any = await fabricService.getForexByContract(contractId);
            const list = Array.isArray(byContract?.data) ? byContract.data : [];
            const open = list.find((f: any) => {
              const status = String(f?.status || f?.Status || '').toUpperCase();
              const fLcId = f?.lcId ?? f?.LCID ?? f?.lc_id ?? '';
              return ['REQUESTED', 'CONFIRMED', 'APPROVED'].includes(status) && (!fLcId || fLcId === lcID);
            });
            resolvedForexId = open?.forexId || open?.ForexID || open?.forex_id || undefined;
          }
        } catch (chainErr: any) {
          logger.warn(`[FOREX] On-chain forex lookup failed for LC ${lcID}:`, chainErr?.message);
        }
      }

      if (!resolvedForexId) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'FOREX_REQUEST_NOT_FOUND',
            message: `No open forex request found for LC ${lcID}; allocation requires a REQUESTED/CONFIRMED forex request (auto-created when the LC is issued)`,
          },
          timestamp: new Date().toISOString(),
        });
      }

      // Chaincode AllocateForex requires a non-empty approvalRef. Prefer
      // the caller's real NBE approval reference; fall back to a
      // deterministic reference derived from the REAL forex request ID
      // (the same NBE-APPR-<forexId> convention the E2E scripts use) —
      // never a timestamped fabrication.
      const resolvedApprovalRef =
        (typeof approvalRef === 'string' && approvalRef.trim()) || `NBE-APPR-${resolvedForexId}`;
      // Retention must match the active NBE COFFEE policy (40%); the
      // chaincode enforces the match and fails the allocation otherwise.
      const resolvedRetentionRate =
        retentionRate !== undefined && retentionRate !== null ? Number(retentionRate) : 40;
      const resolvedExpiryDate =
        expiryDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

      // LEDGER FIRST (same pattern as forexService.allocateForex and the
      // quality fix, commit 9a0673e9): AllocateForex on-chain, and only
      // then does the service mirror to Postgres. No direct CouchDB write
      // anywhere on this path — the old code wrote LC FOREX_ALLOCATED +
      // a fabricated FOREX doc straight to one peer's CouchDB and returned
      // 200 success with txId null without ever touching the ledger.
      // A chain failure throws with code FOREX_ALLOCATE_FAILED and nothing
      // is written to CouchDB or Postgres.
      let result: any;
      try {
        result = await forexService.allocateForex({
          forexID: resolvedForexId,
          lcID,
          amount: Number(allocatedAmount),
          exchangeRate: Number(exchangeRate),
          retentionRate: resolvedRetentionRate,
          officer: officer,
          approvalRef: resolvedApprovalRef,
          expiryDate: resolvedExpiryDate,
          userId: user?.username || user?.sub,
          userOrg: user?.org || 'BanksMSP',
        });
      } catch (allocErr: any) {
        if (allocErr?.code === 'FOREX_ALLOCATE_FAILED') {
          // F-8: a chain failure caused by the entity being in the wrong
          // state is a client state conflict (409), not a service outage
          // (503). The service surfaces the chaincode's own gate text
          // inside the message (AllocateForex, chaincodes/coffee/forex.go:
          // "forex cannot be allocated, current status: REJECTED",
          // "LC must be ISSUED or FOREX_REQUESTED, current status: ...",
          // "forex request is already linked to LC ..."), so match on it.
          // This is the path a REJECTED forex takes when Postgres still
          // says CONFIRMED (stale/polluted row): the service's PG-side
          // guard passes, the ledger refuses, and without this branch the
          // route reported 503 for a state conflict. Every other ledger
          // failure (unavailable, endorsement, timeout) keeps 503.
          if (/cannot be allocated, current status|LC must be .*current status|already linked to LC/i.test(allocErr?.message || '')) {
            return res.status(409).json({
              success: false,
              error: {
                code: 'FOREX_INVALID_STATUS',
                message: allocErr.message || 'Forex cannot be allocated from its current status',
              },
              timestamp: new Date().toISOString(),
            });
          }
          return res.status(503).json({
            success: false,
            error: {
              code: 'FOREX_ALLOCATE_FAILED',
              message: allocErr.message || 'Failed to allocate forex on the ledger; no allocation was recorded',
            },
            timestamp: new Date().toISOString(),
          });
        }
        if (/not found/i.test(allocErr?.message || '')) {
          return res.status(404).json({
            success: false,
            error: { code: 'FOREX_REQUEST_NOT_FOUND', message: allocErr.message },
            timestamp: new Date().toISOString(),
          });
        }
        if (/invalid status transition/i.test(allocErr?.message || '')) {
          return res.status(409).json({
            success: false,
            error: { code: 'FOREX_INVALID_STATUS', message: allocErr.message },
            timestamp: new Date().toISOString(),
          });
        }
        throw allocErr;
      }

      logger.info(`✅ Forex ${result.forexId} allocated on-chain for LC ${lcID}, tx ${result.txId}`);
      // In-app notification (persisted feed + live WS broadcast).
      await notificationService.emitWorkflowEvent({
        type: 'forex_allocated',
        title: `Forex allocated for LC ${lcID}`,
        message: `Forex ${result.forexId} has been allocated on-chain for LC ${lcID}.`,
        entityType: 'forex', entityId: result.forexId, severity: 'success',
        roles: ['BANKS', 'NBE'], exporterId: (lc as any)?.exporterId || (lc as any)?.ExporterID || (lc as any)?.exporter_id || undefined, lcId: lcID,
        actionUrl: '/portals/exporter?tab=contracts',
        actionUrls: { BANKS: '/portals/banks?tab=contracts', NBE: '/portals/nbe?tab=contracts' },
      });

      // Success response shape unchanged from before, except txId is now
      // the real ledger transaction id instead of null.
      res.json({
        success: true,
        message: 'Forex allocated successfully with retention policy',
        data: {
          forexID: result.forexId,
          lcID,
          retentionAmount: result.retentionAmount,
          releaseAmount: result.releaseAmount,
          txId: result.txId,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error allocating forex:', error);
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
 * POST /api/v1/banking/lc/:lcID/amend
 * Amend Letter of Credit (amount, expiry date, terms)
 * UCP 600 Article 10: LC Amendments
 */
router.post('/lc/:lcID/amend',
  authMiddleware,
  requireRole(['BANKS', 'BANK_ADMIN']),
  [
    param('lcID').notEmpty().withMessage('LC ID is required'),
    body('amendmentReason').notEmpty().withMessage('Amendment reason is required'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { lcID } = req.params;
      const { amendmentReason, newAmount, newExpiryDate, newTerms } = req.body;
      const user = (req as any).user;

      logger.info(`Amending LC ${lcID}`, {
        userId: user?.sub,
        organization: user?.org,
        reason: amendmentReason,
      });

      await fabricService.connectAsOrg('BanksMSP');
      const result = await fabricService.invokeChaincode('AmendLC', [
        lcID,
        amendmentReason,
        newAmount?.toString() || '',
        newExpiryDate || '',
        newTerms || '',
        user?.exporterId || user?.org || 'BANK',
      ]);

      if (result.success) {
        logger.info(`✅ LC amended successfully: ${lcID}`);
        // Amend mirror (2026-11-16, Fixer A finding): the ledger move to
        // AMENDED was never mirrored into letters_of_credit, so
        // GET /banking/lc kept showing ISSUED for amended LCs (verified
        // on LC-CONT-PROBE-20261115-C and LC-PROBE-1794506648) while the
        // detail endpoint — which reads the ledger first — showed
        // AMENDED. Mirror the status plus the amended fields AmendLC
        // applied (amount/expiry/terms, only when supplied), ledger-first
        // and best-effort like the approve/issue mirrors above: a failed
        // mirror must not fail the amendment that already committed.
        try {
          const sets: string[] = [`status = 'AMENDED'`, `updated_at = NOW()`];
          const params: any[] = [];
          const amendedAmount = newAmount !== undefined && newAmount !== null && String(newAmount).trim() !== '' ? Number(newAmount) : null;
          if (amendedAmount !== null && Number.isFinite(amendedAmount)) {
            params.push(amendedAmount);
            sets.push(`amount = $${params.length}`);
          }
          if (newExpiryDate) {
            params.push(newExpiryDate);
            sets.push(`expiry_date = $${params.length}`);
          }
          if (newTerms) {
            params.push(newTerms);
            sets.push(`terms = $${params.length}`);
          }
          params.push(lcID);
          await dbService.run(
            `UPDATE letters_of_credit SET ${sets.join(', ')} WHERE lc_id = $${params.length}`,
            params
          );
          logger.info(`✅ LC ${lcID} amendment synced to PostgreSQL`);
        } catch (syncErr) {
          logger.warn(`⚠️ Failed to sync LC amendment to PostgreSQL:`, syncErr);
        }
        // Audit: this chain move never wrote an audit_trail row — the
        // audited lcService/forexService methods are never called here.
        // Best-effort — a failed audit write must not fail the move.
        await logAuditBestEffort(req, {
          entityType: 'LC',
          entityId: lcID,
          action: 'AMEND',
          blockchainTxId: result.txId || undefined,
          metadata: { blockchainTxId: result.txId || null },
        }, `lc ${lcID} amend`);

        // In-app notification (persisted feed + live WS broadcast).
        // LC amendment previously emitted nothing, so another bank user
        // (or the exporter) never heard about it live. A re-issue of
        // an AMENDED LC goes through the issue route, whose lc_issued
        // emit already covers it — no second emit here.
        await notificationService.emitWorkflowEvent({
          type: 'lc_amended',
          title: `Letter of Credit ${lcID} amended`,
          message: `Letter of Credit ${lcID} was amended: ${amendmentReason}`,
          entityType: 'lc', entityId: lcID, severity: 'info',
          roles: ['BANKS'], lcId: lcID,
          actionUrl: '/portals/exporter?tab=contracts',
          actionUrls: { BANKS: '/portals/banks?tab=contracts' },
        });

        res.json({
          success: true,
          data: result.data,
          message: 'Letter of Credit amended successfully',
          txId: result.txId,
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(400).json({
          success: false,
          error: {
            code: 'LC_AMENDMENT_FAILED',
            message: result.error || 'Failed to amend LC',
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.error('Error amending LC:', error);
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
 * /api/v1/banking/lc:
 *   get:
 *     summary: Get all Letters of Credit
 *     tags: [Banking]
 */
router.get('/lc', async (req, res) => {
  try {
    let lcData: any[] = [];
    let source = 'postgresql';

    // ✅ PRIMARY SOURCE: Fetch from PostgreSQL (consistent with other portals)
    logger.info('[BANKING] 📊 Fetching LCs from PostgreSQL...');
    
    try {
      source = 'postgresql';
      
      try {
        const pgLCs = await dbService.all(`
          SELECT 
            lc.lc_id, lc.lc_number, lc.contract_id, lc.exporter_id, lc.amount, lc.currency,
            lc.status, lc.issue_date, lc.expiry_date, lc.request_date,
            lc.issuing_bank, lc.advising_bank, lc.terms,
            lc.rejection_reason, lc.rejected_by, lc.rejected_by_msp, lc.rejection_date,
            lc.document_rejection_reason, lc.document_rejected_by,
            lc.document_rejected_by_msp, lc.document_rejection_date,
            c.buyer_id, c.buyer_id AS buyer_name, c.buyer_country, c.buyer_bank
          FROM letters_of_credit lc
          LEFT JOIN contracts c ON lc.contract_id = c.contract_id
          ORDER BY lc.created_at DESC
        `, []);

        const pgDiscrepancies = await dbService.all(
          `SELECT * FROM lc_discrepancies ORDER BY reported_date ASC`,
          []
        );
        const discrepanciesByLC = new Map<string, any[]>();
        for (const row of pgDiscrepancies) {
          const list = discrepanciesByLC.get(row.lc_id) || [];
          list.push({
            discrepancyId: row.discrepancy_id,
            discrepancyType: row.discrepancy_type,
            severity: row.severity,
            document: row.document,
            issue: row.issue,
            affectedClauses: row.affected_clauses || '',
            recommendedAction: row.recommended_action || '',
            status: row.status,
            resolution: row.resolution || '',
            reportedBy: row.reported_by || '',
            reportedByMsp: row.reported_by_msp || '',
            reportedDate: row.reported_date,
            resolvedBy: row.resolved_by || '',
            resolvedByMsp: row.resolved_by_msp || '',
            resolvedDate: row.resolved_date || null,
            txId: row.blockchain_tx_id || '',
          });
          discrepanciesByLC.set(row.lc_id, list);
        }
        
        logger.info(`[BANKING] ✅ Loaded ${pgLCs.length} LCs from PostgreSQL`);

        // Documents per LC — same rule as the LC-detail endpoint
        // (GET /banking/lc/:lcID): active documents linked to the LC
        // itself (entity_type='LC'), to its contract
        // (entity_type='CONTRACT'), to any shipment of the contract
        // (entity_type='SHIPMENT'), or to a customs declaration of
        // the contract (entity_type='CUSTOMS_DECLARATION').
        // The old list query only fetched LC/CONTRACT rows and keyed
        // CONTRACT docs by entity_id alone, so an LC whose paperwork
        // lives on its shipment — the normal post-delivery case —
        // came back with `documents: []`. Live proof: LC-BVER's 3
        // verified SHIPMENT docs (BILL_OF_LADING, COMMERCIAL_INVOICE,
        // PACKING_LIST) show in the detail response but the list row
        // carried 0 documents, so the Payment Release tab (which
        // requires documents.length > 0 with every doc verified)
        // could never fill. SHIPMENT rows carry no contract_id, so
        // they are joined through shipments.shipment_id ->
        // contract_id, and CUSTOMS rows through
        // customs_declarations.declaration_number -> contract_id,
        // exactly like the detail query. CONTRACT docs are keyed by
        // both entity_id and contract_id, so a row whose entity_id
        // was never backfilled still attaches.
        // NOTE: the list stays PG-only on purpose — the detail's F-E
        // ledger merge (ledgerDocuments) is not replicated here
        // because a ledger-only ID carries no verification_status,
        // so it could never satisfy the tab's all-verified gate;
        // the rows that gate on are the PG rows attached below.
        const pgDocs = await dbService.all(
          `SELECT document_id, document_type, file_name, file_path, status,
                  verification_status, verified, uploaded_at, uploaded_by,
                  entity_type, entity_id, contract_id
           FROM documents
           WHERE status = 'active'
             AND entity_type IN ('LC', 'CONTRACT', 'SHIPMENT', 'CUSTOMS_DECLARATION')`,
          []
        );
        // Shipment / customs-declaration -> contract joins.
        const pgShipments = await dbService.all(
          `SELECT shipment_id, contract_id FROM shipments WHERE contract_id IS NOT NULL`,
          []
        );
        const shipmentContract = new Map<string, string>();
        for (const s of pgShipments) {
          if (s.shipment_id && s.contract_id) shipmentContract.set(s.shipment_id, s.contract_id);
        }
        const pgDeclarations = await dbService.all(
          `SELECT declaration_number, contract_id FROM customs_declarations WHERE contract_id IS NOT NULL`,
          []
        );
        const declarationContract = new Map<string, string>();
        for (const dcl of pgDeclarations) {
          if (dcl.declaration_number && dcl.contract_id) declarationContract.set(dcl.declaration_number, dcl.contract_id);
        }
        const docsByLC = new Map<string, any[]>();
        const attachDoc = (key: string | null | undefined, doc: any) => {
          if (!key) return;
          const list = docsByLC.get(key) || [];
          list.push(doc);
          docsByLC.set(key, list);
        };
        for (const d of pgDocs) {
          const doc = {
            documentId: d.document_id,
            documentType: d.document_type,
            fileName: d.file_name,
            filePath: d.file_path,
            status: d.status || 'pending',
            verificationStatus: d.verification_status || '',
            verified: !!d.verified,
            uploadedAt: d.uploaded_at,
            uploadedBy: d.uploaded_by,
            entityType: d.entity_type,
            entityId: d.entity_id,
            contractId: d.contract_id,
          };

          // Map LC documents directly by entity_id (the LC ID)
          if (d.entity_type === 'LC') {
            attachDoc(d.entity_id, doc);
          }

          // Map CONTRACT documents by entity_id AND contract_id
          // (either spelling attaches the doc to the LC).
          if (d.entity_type === 'CONTRACT') {
            attachDoc(d.entity_id, doc);
            if (d.contract_id && d.contract_id !== d.entity_id) attachDoc(d.contract_id, doc);
          }

          // Map SHIPMENT documents via the shipment's contract.
          if (d.entity_type === 'SHIPMENT') {
            attachDoc(shipmentContract.get(d.entity_id), doc);
          }

          // Map CUSTOMS_DECLARATION documents via the declaration's contract.
          if (d.entity_type === 'CUSTOMS_DECLARATION') {
            attachDoc(declarationContract.get(d.entity_id), doc);
          }
        }
        // One document can attach under more than one key (e.g. a
        // CONTRACT doc keyed by both entity_id and contract_id), so
        // dedupe the per-LC list by document_id.
        const dedupeDocs = (docs: any[]) => {
          const seen = new Set<string>();
          return docs.filter((doc) => {
            if (seen.has(doc.documentId)) return false;
            seen.add(doc.documentId);
            return true;
          });
        };

        // Customs clearance per contract: the Payment Release queue requires
        // customsClearanceStatus 'CLEARED' (or customsCleared true), which
        // the chaincode LC object carries but this PG fallback never set.
        const pgCleared = await dbService.all(
          `SELECT DISTINCT contract_id FROM customs_declarations WHERE status = 'CLEARED'`,
          []
        );
        const clearedContracts = new Set(pgCleared.map((r: any) => r.contract_id));

        lcData = pgLCs.map((lc: any) => ({
          lcId: lc.lc_id,
          contractId: lc.contract_id,
          exporterId: lc.exporter_id,
          buyerId: lc.buyer_id || '',
          buyerName: lc.buyer_name || '',
          buyerCountry: lc.buyer_country || '',
          buyerBank: lc.buyer_bank || '',
          issuingBank: lc.issuing_bank || '',
          advisingBank: lc.advising_bank || '',
          amount: lc.amount ?? 0,
          currency: lc.currency || 'USD',
          status: lc.status || 'PENDING', // ✅ PostgreSQL status (synced from blockchain)
          expiryDate: lc.expiry_date || null,
          requestDate: lc.request_date || null,
          issueDate: lc.issue_date || null,
          terms: lc.terms || '',
          rejectionReason: lc.rejection_reason || '',
          rejectedBy: lc.rejected_by || '',
          rejectedByMsp: lc.rejected_by_msp || '',
          rejectionDate: lc.rejection_date || null,
          documentRejectionReason: lc.document_rejection_reason || '',
          documentRejectedBy: lc.document_rejected_by || '',
          documentRejectedByMsp: lc.document_rejected_by_msp || '',
          documentRejectionDate: lc.document_rejection_date || null,
          documents: dedupeDocs([
            ...(docsByLC.get(lc.lc_id) || []),
            ...(lc.lc_number && lc.lc_number !== lc.lc_id ? (docsByLC.get(lc.lc_number) || []) : []),
            ...(lc.contract_id ? (docsByLC.get(lc.contract_id) || []) : []),
          ]),
          customsClearanceStatus: clearedContracts.has(lc.contract_id) ? 'CLEARED' : '',
          customsCleared: clearedContracts.has(lc.contract_id),
          amendments: [],
          amendmentCount: 0,
          discrepancies: discrepanciesByLC.get(lc.lc_id) || [],
          discrepancyResolved: false,
        }));
        
        // Reconcile list statuses against ledger on explicit request (?reconcile=true)
        // or when ENABLE_READ_TIME_HEALING=true is set. By default, serve fast indexed PostgreSQL
        // mirror to prevent massive read latency and background DB locking.
        let statusReconciled = false;
        let statusHealed = 0;
        let statusMismatches = 0;
        const shouldReconcile = req.query.reconcile === 'true' || process.env.ENABLE_READ_TIME_HEALING === 'true';
        if (shouldReconcile) {
          const ledgerStatuses = await fetchLedgerLcStatusMap();
          if (ledgerStatuses) {
            statusReconciled = true;
            const toHeal: Array<{ lcId: string; chainStatus: string }> = [];
            for (const row of lcData) {
              const chainStatus = ledgerStatuses.get(row.lcId) || '';
              if (chainStatus && chainStatus !== row.status) {
                statusMismatches++;
                row.status = chainStatus; // show the ledger truth now
                toHeal.push({ lcId: row.lcId, chainStatus });
              }
            }
            if (toHeal.length > 0) {
              const capped = toHeal.slice(0, LC_RECONCILE_HEAL_CAP);
              if (toHeal.length > capped.length) {
                logger.warn(`[BANKING] ⚠️ LC status reconciliation: ${toHeal.length} stale rows, healing ${capped.length} this call (cap ${LC_RECONCILE_HEAL_CAP}); the rest stay ledger-correct in the response and heal on a later list load`);
              }
              const healed = await Promise.allSettled(
                capped.map((h) => autoHealLCStatus(h.lcId, h.chainStatus))
              );
              statusHealed = healed.filter((r) => r.status === 'fulfilled').length;
              logger.info(`[BANKING] 🔧 LC status reconciliation: ${statusMismatches} mismatched, ${statusHealed} PG rows healed to ledger status`);
            }
          }
        }

        // F4 (2026-11-19): honor ?status= — the list used to ignore it
        // and always return every LC. 'ALL' (or no param) means no
        // filter. The filter runs AFTER the ledger reconciliation above,
        // so a row whose PG status is stale (e.g. PG PAYMENT_RELEASED
        // vs ledger SETTLED) is matched on the status actually shown,
        // and the returned total is the filtered count.
        const rawStatusFilter = typeof req.query.status === 'string' ? req.query.status.trim() : '';
        const statusFilter = rawStatusFilter ? rawStatusFilter.toUpperCase() : '';
        const totalUnfiltered = lcData.length;
        if (statusFilter && statusFilter !== 'ALL') {
          lcData = lcData.filter((row: any) => String(row.status || '').toUpperCase() === statusFilter);
          logger.info(`[BANKING] 🔎 LC list filtered by status=${statusFilter}: ${lcData.length} of ${totalUnfiltered}`);
        }

        return res.json({
          success: true,
          data: lcData,
          total: lcData.length,
          totalUnfiltered,
          statusFilter: statusFilter || null,
          source: 'postgresql',
          statusReconciled,
          statusHealed,
          statusMismatches,
          enriched: true,
          timestamp: new Date().toISOString(),
        });
      } catch (pgError: any) {
        logger.error('[BANKING] ❌ PostgreSQL query failed:', pgError);
        return res.status(500).json({
          success: false,
          error: {
            code: 'DATA_UNAVAILABLE',
            message: 'PostgreSQL query failed'
          },
          timestamp: new Date().toISOString()
        });
      }
    } catch (error: any) {
      logger.error('[BANKING] LC list error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
        timestamp: new Date().toISOString()
      });
    }
  } catch (error: any) {
    logger.error('[BANKING] LC list error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /banking/lc/resync (2a, 2026-11-19, open-items round 2)
 *
 * Backfill letters_of_credit rows that exist on the ledger but never
 * reached PostgreSQL. The RequestLC mirror (above) is best-effort and
 * non-fatal: if the API dies between the chain commit and the PG
 * insert, the LC lives on the ledger only. Live case:
 * LC-CONT-SEQ24-20261119-20261119072453 (RequestLC tx 2fd4162b…,
 * block 14176) had no PG row, no audit_trail row and no
 * blockchain_signatures row. The list (GET /banking/lc) is PG-only,
 * global search is PG-driven, and the Banks KPIs read audit_trail, so
 * the LC was invisible everywhere except the ledger-backed detail
 * endpoint — while the ledger duplicate check (QueryAllLCs) still
 * 409s any fresh request for its APPROVED contract, wedging the
 * contract: its only LC could never be actioned through the UI.
 * Examine/release on the orphan fail honestly (400), so the gap is
 * visibility + the wedged contract, not a state-corruption risk.
 *
 * Safety: INSERT-only. Rows that already exist in PG are left
 * untouched (no UPDATE, no DELETE, no status healing — that is D5's
 * read-time reconciliation). Each insert is ON CONFLICT (lc_id)
 * DO NOTHING, so a concurrent normal mirror can never duplicate a
 * row and a repeat call is a no-op. Unknown ledger statuses are
 * skipped, never inserted. Every backfilled row gets an audit_trail
 * RESYNC row so the backfill itself is traceable. ADMIN-only.
 */
router.post('/lc/resync',
  authMiddleware,
  requireRole(['ADMIN']),
  async (req: Request, res: Response) => {
    try {
      const result = await fabricService.queryAllLCs();
      if (!result || !(result as any).success || !Array.isArray((result as any).data)) {
        return res.status(502).json({
          success: false,
          error: { code: 'LEDGER_UNAVAILABLE', message: 'Could not read LCs from the ledger (QueryAllLCs failed)' },
          timestamp: new Date().toISOString(),
        });
      }
      const KNOWN_LC_STATUSES = new Set([
        'REQUESTED', 'APPROVED', 'ISSUED', 'FOREX_ALLOCATED', 'UTILIZED',
        'PAYMENT_RELEASED', 'SETTLED', 'REJECTED', 'EXPIRED', 'AMENDED',
      ]);
      const ledgerLCs = (result as any).data as any[];
      const resynced: string[] = [];
      const skippedUnknownStatus: string[] = [];
      let skippedExisting = 0;
      for (const lc of ledgerLCs) {
        const lcId = String(lc?.lcId || lc?.LCID || lc?.LcId || lc?.id || '').trim();
        if (!lcId) continue;
        const status = String(lc?.status || lc?.Status || '').trim().toUpperCase();
        if (!KNOWN_LC_STATUSES.has(status)) {
          skippedUnknownStatus.push(`${lcId} (${status || 'no-status'})`);
          continue;
        }
        const existing = await dbService.get(
          `SELECT lc_id FROM letters_of_credit WHERE lc_id = $1`,
          [lcId]
        );
        if (existing) { skippedExisting++; continue; }
        const amount = lc?.amount ?? lc?.Amount ?? null;
        const requestDate = lc?.requestDate || lc?.RequestDate || null;
        const expiryDate = lc?.expiryDate || lc?.ExpiryDate || null;
        const inserted = await dbService.run(
          `INSERT INTO letters_of_credit (
            lc_id, lc_number, contract_id, exporter_id, issuing_bank, advising_bank,
            beneficiary, amount, currency, terms,
            latest_shipment_date, port_of_loading, port_of_discharge, payment_terms,
            partial_shipment, transhipment,
            status, expiry_date, request_date, created_at, updated_at
          ) VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW())
          ON CONFLICT (lc_id) DO NOTHING
          RETURNING lc_id`,
          [
            lcId,
            lc?.contractId || lc?.ContractID || null,
            lc?.exporterId || lc?.ExporterId || null,
            lc?.issuingBank || lc?.IssuingBank || null,
            lc?.advisingBank || lc?.AdvisingBank || null,
            lc?.beneficiary || lc?.Beneficiary || null,
            amount === '' ? null : amount,
            lc?.currency || lc?.Currency || 'USD',
            lc?.terms || lc?.Terms || null,
            lc?.latestShipmentDate || lc?.LatestShipmentDate || null,
            lc?.portOfLoading || lc?.PortOfLoading || null,
            lc?.portOfDischarge || lc?.PortOfDischarge || null,
            lc?.paymentTerms || lc?.PaymentTerms || null,
            lc?.partialShipment === true || lc?.PartialShipment === true,
            lc?.transhipment === true || lc?.Transhipment === true,
            status,
            expiryDate || null,
            requestDate ? new Date(requestDate).toISOString() : new Date().toISOString(),
          ]
        );
        if (inserted && (inserted as any).rowCount > 0) {
          resynced.push(lcId);
          logger.info(`[BANKING] 🔧 LC resync: backfilled missing PG row for ${lcId} (${status}) from ledger truth`);
          await logAuditBestEffort(req, {
            entityType: 'LC',
            entityId: lcId,
            action: 'RESYNC',
            newValue: status,
            reason: 'LC re-sync: backfilled missing PG row from ledger truth (no PG row existed)',
            metadata: { contractId: lc?.contractId || lc?.ContractID || null, resynced: true, source: 'ledger' },
          }, `lc ${lcId} resync`);
        } else {
          skippedExisting++;
        }
      }
      logger.info(`[BANKING] 🔧 LC resync complete: ledger=${ledgerLCs.length} existing=${skippedExisting} resynced=${resynced.length} unknownStatus=${skippedUnknownStatus.length}`);
      res.json({
        success: true,
        data: {
          ledgerTotal: ledgerLCs.length,
          skippedExisting,
          resynced,
          resyncedCount: resynced.length,
          skippedUnknownStatus,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error('[BANKING] LC resync error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * @swagger
 * /api/v1/banking/lcs:
 *   get:
 *     summary: Get all Letters of Credit (alias for /lc)
 *     tags: [Banking]
 */
router.get('/lcs', async (req, res) => {
  // Alias for /lc endpoint
  try {
    const result = await fabricService.queryAllLCs();
    
    if (result.success) {
      // Add default values for optional rejection fields to pass validation
      const normalizedLCs = (result.data || []).map((lc: any) => ({
        ...lc,
        // Document rejection fields (optional, default to empty)
        documentRejectedBy: lc.documentRejectedBy || '',
        documentRejectedByMsp: lc.documentRejectedByMsp || '',
        documentRejectionDate: lc.documentRejectionDate || '',
        documentRejectionReason: lc.documentRejectionReason || '',
        // LC rejection fields (optional, default to empty)
        rejectedBy: lc.rejectedBy || '',
        rejectedByMsp: lc.rejectedByMsp || '',
        rejectionDate: lc.rejectionDate || '',
        rejectionReason: lc.rejectionReason || ''
      }));
      
      const lcs = dedupeById(normalizedLCs, (lc: any) => lc.LCID || lc.lcId);
      res.json({
        success: true,
        data: lcs.filter(isValidLC),
        count: lcs.length,
        timestamp: new Date().toISOString()
      });
    } else {
      // If blockchain query fails, try CouchDB direct query as fallback
      logger.warn('[BANKING] Blockchain LC query failed, trying CouchDB fallback');
      try {
        const { CouchDBDirectService } = require('../services/couchDBDirectService');
        const couchDBService = new CouchDBDirectService();
        const couchLCs = await couchDBService.queryAllLCs();
        
        // Normalize CouchDB response
        const normalizedLCs = couchLCs.map((lc: any) => ({
          ...lc,
          documentRejectedBy: lc.documentRejectedBy || '',
          documentRejectedByMsp: lc.documentRejectedByMsp || '',
          documentRejectionDate: lc.documentRejectionDate || '',
          documentRejectionReason: lc.documentRejectionReason || '',
          rejectedBy: lc.rejectedBy || '',
          rejectedByMsp: lc.rejectedByMsp || '',
          rejectionDate: lc.rejectionDate || '',
          rejectionReason: lc.rejectionReason || ''
        }));
        
        const lcs = dedupeById(normalizedLCs, (lc: any) => lc.LCID || lc.lcId);
        res.json({
          success: true,
          data: lcs.filter(isValidLC),
          count: lcs.length,
          timestamp: new Date().toISOString()
        });
      } catch (couchError: any) {
        logger.error('[BANKING] CouchDB fallback also failed:', couchError);
        res.status(500).json({
          success: false,
          error: result.error,
          timestamp: new Date().toISOString()
        });
      }
    }
  } catch (error: any) {
    logger.error('Error querying all LCs:', error);
    
    // Last resort fallback: try CouchDB
    try {
      const { CouchDBDirectService } = require('../services/couchDBDirectService');
      const couchDBService = new CouchDBDirectService();
      const couchLCs = await couchDBService.queryAllLCs();
      
      const normalizedLCs = couchLCs.map((lc: any) => ({
        ...lc,
        documentRejectedBy: lc.documentRejectedBy || '',
        documentRejectedByMsp: lc.documentRejectedByMsp || '',
        documentRejectionDate: lc.documentRejectionDate || '',
        documentRejectionReason: lc.documentRejectionReason || '',
        rejectedBy: lc.rejectedBy || '',
        rejectedByMsp: lc.rejectedByMsp || '',
        rejectionDate: lc.rejectionDate || '',
        rejectionReason: lc.rejectionReason || ''
      }));
      
      const lcs = dedupeById(normalizedLCs, (lc: any) => lc.LCID || lc.lcId);
      res.json({
        success: true,
        data: lcs.filter(isValidLC),
        count: lcs.length,
        timestamp: new Date().toISOString()
      });
    } catch (couchError: any) {
      logger.error('[BANKING] All LC query methods failed:', couchError);
      res.status(500).json({
        success: false,
        error: { code: 'LC_QUERY_ERROR', message: error.message },
        timestamp: new Date().toISOString()
      });
    }
  }
});

/**
 * @swagger
 * /api/v1/banking/payments:
 *   get:
 *     summary: Get all payments
 *     tags: [Banking]
 */
router.get('/payments', async (req, res) => {
  try {
    // Get exporterId from query params or user context if needed
    const exporterId = req.query.exporterId as string;

    // With exporterId: the filtered list, as before (queryPayments drops
    // the non-payment rows QueryPaymentsByExporter returns — see
    // isRealPaymentRow in services/fabricService.ts).
    if (exporterId) {
      const result = await fabricService.queryPayments({ exporterId });

      if (result.success) {
        res.json({
          success: true,
          data: result.data || [],
          count: result.data?.length || 0,
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
          timestamp: new Date().toISOString()
        });
      }
      return;
    }

    // Without exporterId: the full payments list, paginated (2026-11-19,
    // leftovers round — this used to 400 with "exporterId parameter is
    // required", which also broke the PaymentDocuments tab's
    // /banking/payments?status=PENDING call). Same {success, data, count}
    // shape as the filtered call, plus total/page/limit/totalPages so a
    // caller can tell the page size from the ledger total. QueryAllPayments
    // already excludes repatriation docs (chaincode seq 26); the
    // isRealPaymentRow guard below is defence-in-depth (a no-op on the
    // live ledger: 205/205 rows carry paymentId + lcId).
    const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
    const result = await fabricService.queryChaincode('QueryAllPayments', []);

    if (!result.success) {
      res.status(500).json({
        success: false,
        error: result.error,
        timestamp: new Date().toISOString()
      });
      return;
    }

    let payments = (result.data || []).filter(isRealPaymentRow);
    if (statusFilter) {
      payments = payments.filter((p: any) => String(p.status || '').toUpperCase() === statusFilter.toUpperCase());
    }
    const total = payments.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const pageData = payments.slice((page - 1) * limit, page * limit);
    res.json({
      success: true,
      data: pageData,
      count: pageData.length,
      total,
      page,
      limit,
      totalPages,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    logger.error('Error querying payments:', error);
    res.status(500).json({
      success: false,
      error: { code: 'PAYMENT_QUERY_ERROR', message: error.message },
      timestamp: new Date().toISOString()
    });
  }
});

router.get('/lc/:lcID', authMiddleware, async (req, res) => {
  try {
    const { lcID } = req.params;
    
    logger.info(`[BANKING] 🚀 Fetching LC ${lcID} using PARALLEL approach (CouchDB + PostgreSQL simultaneously)`);
    
    // ✅ PARALLEL FETCH: Fetch from CouchDB and PostgreSQL at the same time
    const startTime = Date.now();
    
    const [blockchainResult, pgResult] = await Promise.allSettled([
      // Query 1: Blockchain (CouchDB via Fabric) - wrapped to handle schema errors
      (async () => {
        try {
          return await fabricService.getLC(lcID);
        } catch (error: any) {
          // Schema validation errors are non-fatal - return empty result
          if (error.message && error.message.includes('schema')) {
            logger.warn(`[BANKING] Schema validation error for ReadLC, using PostgreSQL fallback`);
            return { success: false, error: 'Schema validation error', data: null };
          }
          throw error;
        }
      })(),
      
      // Query 2: PostgreSQL (LC + buyer data)
      dbService.query(
        `SELECT 
          lc.*,
          c.buyer_id, c.buyer_id AS buyer_name, c.buyer_country, c.buyer_bank,
          c.exporter_bank
        FROM letters_of_credit lc
        LEFT JOIN contracts c ON lc.contract_id = c.contract_id
        WHERE lc.lc_id = $1`,
        [lcID]
      ),
    ]);
    
    const fetchTime = Date.now() - startTime;
    logger.info(`[BANKING] ⚡ Parallel fetch completed in ${fetchTime}ms`);
    
    // Process blockchain result
    let lcData: any = null;
    let blockchainSuccess = false;
    
    if (blockchainResult.status === 'fulfilled' && blockchainResult.value.success) {
      lcData = blockchainResult.value.data;
      
      // ✅ NORMALIZE FIELD NAMES: Blockchain returns PascalCase, we need camelCase
      if (lcData) {
        lcData = {
          ...lcData,
          // Map PascalCase to camelCase for consistency
          lcId: lcData.lcId || lcData.LCID || lcData.LcId,
          contractId: lcData.contractId || lcData.ContractID,
          exporterId: lcData.exporterId || lcData.ExporterID,
          buyerId: lcData.buyerId || lcData.BuyerID,
          buyerName: lcData.buyerName || lcData.BuyerName,
          buyerCountry: lcData.buyerCountry || lcData.BuyerCountry,
          buyerBank: lcData.buyerBank || lcData.BuyerBank,
          issuingBank: lcData.issuingBank || lcData.IssuingBank || lcData.issuingBankName,
          advisingBank: lcData.advisingBank || lcData.AdvisingBank || lcData.advisingBankName,
          beneficiary: lcData.beneficiary || lcData.Beneficiary,
          amount: lcData.amount || lcData.Amount,
          currency: lcData.currency || lcData.Currency,
          status: lcData.status || lcData.Status,
          expiryDate: lcData.expiryDate || lcData.ExpiryDate || lcData.expiry_date,
          requestDate: lcData.requestDate || lcData.RequestDate || lcData.request_date,
          approvalDate: lcData.approvalDate || lcData.ApprovalDate || lcData.approval_date,
          issueDate: lcData.issueDate || lcData.IssueDate || lcData.issue_date,
          terms: lcData.terms || lcData.Terms,
          approvedBy: lcData.approvedBy || lcData.ApprovedBy,
          approvedByMsp: lcData.approvedByMsp || lcData.ApprovedByMSP,
          issuedBy: lcData.issuedBy || lcData.IssuedBy,
          issuedByMsp: lcData.issuedByMsp || lcData.IssuedByMSP,
          createdAt: lcData.createdAt || lcData.CreatedAt,
          updatedAt: lcData.updatedAt || lcData.UpdatedAt,
        };
      }
      
      blockchainSuccess = true;
      logger.info(`[BANKING] ✅ Blockchain query successful (normalized field names)`);
    } else {
      const error = blockchainResult.status === 'rejected' 
        ? blockchainResult.reason 
        : blockchainResult.value?.error;
      logger.warn(`[BANKING] ⚠️  Blockchain query failed: ${error}`);
    }
    
    // Process PostgreSQL result
    let pgData: any = null;
    let buyerData: any = null;
    
    if (pgResult.status === 'fulfilled' && pgResult.value.rows.length > 0) {
      pgData = pgResult.value.rows[0];
      buyerData = {
        buyerId: pgData.buyer_id,
        buyerName: pgData.buyer_name,
        buyerCountry: pgData.buyer_country,
        buyerBank: pgData.buyer_bank,
        exporterBank: pgData.exporter_bank,
      };
      logger.info(`[BANKING] ✅ PostgreSQL query successful: buyer=${buyerData.buyerName}`);
    } else {
      logger.warn(`[BANKING] ⚠️  PostgreSQL query failed or no data found`);
    }
    
    // ✅ SMART FALLBACK: Use whichever succeeded
    if (!blockchainSuccess && pgData) {
      // Blockchain failed, use PostgreSQL as primary source
      logger.info(`[BANKING] 📊 Using PostgreSQL as primary source (blockchain unavailable)`);
      
      // Fetch documents in parallel with LC data
      const docs = await dbService.all(`
        SELECT document_id, document_type, file_name, file_path, status, verification_status,
               uploaded_at, uploaded_by, entity_type, entity_id
        FROM documents 
        WHERE status = 'active'
          AND (
            (entity_type = 'LC' AND (entity_id = $1 OR entity_id = $2))
            OR (entity_type = 'SHIPMENT' AND entity_id IN (
                 SELECT shipment_id FROM shipments WHERE contract_id = $2
            ))
            OR (entity_type = 'CONTRACT' AND entity_id = $2)
            OR (entity_type = 'CUSTOMS_DECLARATION' AND entity_id IN (
                 SELECT declaration_number FROM customs_declarations WHERE contract_id::text = $2
            ))
          )
        ORDER BY uploaded_at DESC
      `, [lcID, pgData.contract_id || '']);
      
      const allDocuments = docs.map((d: any) => ({
        documentId: d.document_id,
        documentType: d.document_type,
        fileName: d.file_name,
        filePath: d.file_path,
        status: d.status || 'pending',
        verificationStatus: d.verification_status || 'pending',  // ✅ Include verification status
        uploadedAt: d.uploaded_at,
        uploadedBy: d.uploaded_by,
        entityType: d.entity_type,
        entityId: d.entity_id,
      }));

      const persistedDiscrepancies = await dbService.all(
        `SELECT * FROM lc_discrepancies WHERE lc_id = $1 ORDER BY reported_date ASC`,
        [lcID]
      );
      const discrepancyRecords = persistedDiscrepancies.map((row: any) => ({
        discrepancyId: row.discrepancy_id,
        discrepancyType: row.discrepancy_type,
        severity: row.severity,
        document: row.document,
        issue: row.issue,
        affectedClauses: row.affected_clauses || '',
        recommendedAction: row.recommended_action || '',
        status: row.status,
        resolution: row.resolution || '',
        reportedBy: row.reported_by || '',
        reportedByMsp: row.reported_by_msp || '',
        reportedDate: row.reported_date,
        resolvedBy: row.resolved_by || '',
        resolvedByMsp: row.resolved_by_msp || '',
        resolvedDate: row.resolved_date || null,
        txId: row.blockchain_tx_id || '',
      }));
      
      logger.info(`[BANKING] ✅ Returning PostgreSQL data: ${allDocuments.length} documents`);
      
      return res.json({
        success: true,
        data: {
          lcId: pgData.lc_id,
          contractId: pgData.contract_id,
          exporterId: pgData.exporter_id,
          buyerId: pgData.buyer_id,
          buyerName: pgData.buyer_name,
          buyerCountry: pgData.buyer_country,
          buyerBank: pgData.buyer_bank,
          issuingBank: pgData.issuing_bank || 'Commercial Bank of Ethiopia',
          advisingBank: pgData.advising_bank || pgData.exporter_bank,
          amount: pgData.amount,
          currency: pgData.currency || 'USD',
          status: pgData.status,
          expiryDate: pgData.expiry_date,
          issueDate: pgData.issue_date,
          requestDate: pgData.request_date,
          terms: pgData.terms || '',
          rejectionReason: pgData.rejection_reason || '',
          rejectedBy: pgData.rejected_by || '',
          rejectedByMsp: pgData.rejected_by_msp || '',
          rejectionDate: pgData.rejection_date || null,
          documentRejectionReason: pgData.document_rejection_reason || '',
          documentRejectedBy: pgData.document_rejected_by || '',
          documentRejectedByMsp: pgData.document_rejected_by_msp || '',
          documentRejectionDate: pgData.document_rejection_date || null,
          documents: allDocuments,
          amendments: [],
          amendmentCount: 0,
          discrepancies: discrepancyRecords,
          discrepancyResolved: false,
        },
        source: 'postgresql-primary',
        fetchTimeMs: fetchTime,
        timestamp: new Date().toISOString(),
      });
    }
    
    if (blockchainSuccess) {
      // Blockchain succeeded, enrich with PostgreSQL data if available
      logger.info(`[BANKING] 🔗 Using blockchain as primary, enriching with PostgreSQL data`);
      
      // Merge buyer data if available from PostgreSQL
      if (buyerData?.buyerName) {
        lcData = {
          ...lcData,
          buyerId: buyerData.buyerId || lcData.buyerId,
          buyerName: buyerData.buyerName || lcData.buyerName,
          buyerCountry: buyerData.buyerCountry || lcData.buyerCountry,
          buyerBank: buyerData.buyerBank || lcData.buyerBank,
          advisingBank: buyerData.exporterBank || lcData.advisingBank,
        };
      } else {
        // Try enrichment service as fallback
        try {
          const { default: dataEnrichmentService } = await import('../services/dataEnrichmentService');
          const enriched = await dataEnrichmentService.enrichLCs([lcData]);
          if (enriched.length > 0) {
            lcData = enriched[0];
            logger.info(`[BANKING] ✅ Enriched with enrichment service`);
          }
        } catch (enrichError) {
          logger.warn('[BANKING] ⚠️  Enrichment service failed');
        }
      }
      
      // 3. Fetch ALL documents for this LC (LC, Contract, Shipment, Customs)
      let allDocuments: any[] = [];
      const contractId = lcData?.contractId || lcData?.contractID || lcData?.ContractID || pgData?.contract_id || '';
      
      if (contractId) {
        try {
          logger.debug(`[BANKING] 📎 Fetching ALL documents for LC ${lcID}, Contract ${contractId}`);
          const docs = await dbService.all(`
            SELECT document_id, document_type, file_name, file_path, status, verification_status,
                   uploaded_at, uploaded_by, entity_type, entity_id
            FROM documents 
            WHERE status = 'active'
              AND (
                (entity_type = 'LC' AND (entity_id = $1 OR entity_id = $2))
                OR (entity_type = 'SHIPMENT' AND entity_id IN (
                     SELECT shipment_id FROM shipments WHERE contract_id = $2
                ))
                OR (entity_type = 'CONTRACT' AND entity_id = $2)
                OR (entity_type = 'CUSTOMS_DECLARATION' AND entity_id IN (
                     SELECT declaration_number FROM customs_declarations WHERE contract_id::text = $2
                ))
              )
            ORDER BY uploaded_at DESC
          `, [lcID, contractId]);
          
          if (docs && docs.length > 0) {
            allDocuments = docs.map((d: any) => ({
              documentId: d.document_id,
              documentType: d.document_type,
              fileName: d.file_name,
              filePath: d.file_path,
              status: d.status || 'pending',
              verificationStatus: d.verification_status || 'pending',  // ✅ Include verification status
              uploadedAt: d.uploaded_at,
              uploadedBy: d.uploaded_by,
              entityType: d.entity_type,
              entityId: d.entity_id,
            }));
            logger.info(`[BANKING] 📎 LC ${lcID}: Found ${docs.length} documents (LC: ${docs.filter((d: any) => d.entity_type === 'LC').length}, CONTRACT: ${docs.filter((d: any) => d.entity_type === 'CONTRACT').length}, SHIPMENT: ${docs.filter((d: any) => d.entity_type === 'SHIPMENT').length}, CUSTOMS: ${docs.filter((d: any) => d.entity_type === 'CUSTOMS_DECLARATION').length})`);
          } else {
            logger.warn(`[BANKING] 📎 No documents found for LC ${lcID}, Contract ${contractId}`);
          }
        } catch (docError) {
          logger.warn('[BANKING] ⚠️  Could not fetch documents:', docError);
        }
      }

      // F-E (2026-11-16): the ledger LC carries the document IDs
      // submitted via SubmitLCDocuments in its own `documents` field
      // ([]string on the chaincode struct), but this endpoint only
      // ever returned the PG `documents` table rows — so after T9b
      // the detail response showed `documents: []` while CouchDB
      // listed the 3 IDs. The chaincode never writes those IDs into
      // the PG table, so merge the ledger IDs here: any ID not
      // already present as a PG row is appended in the same object
      // shape, flagged source 'ledger'. The raw ID list is also
      // exposed as `ledgerDocuments` so callers can see exactly what
      // the ledger holds.
      const ledgerDocIds: string[] = [];
      {
        const rawDocs: any = (lcData as any)?.documents ?? (lcData as any)?.Documents ?? [];
        const ids = Array.isArray(rawDocs) ? rawDocs : [];
        for (const d of ids) {
          const id = typeof d === 'string' ? d : (d?.documentId || d?.documentID || d?.id || '');
          if (id && !ledgerDocIds.includes(id)) ledgerDocIds.push(id);
        }
        const knownIds = new Set(allDocuments.map((d: any) => d.documentId));
        for (const id of ledgerDocIds) {
          if (!knownIds.has(id)) {
            allDocuments.push({
              documentId: id,
              documentType: '',
              fileName: '',
              filePath: '',
              status: 'submitted',
              uploadedAt: null,
              uploadedBy: '',
              entityType: 'LC',
              entityId: lcID,
              source: 'ledger',
            });
          }
        }
        if (ledgerDocIds.length > 0) {
          logger.info(`[BANKING] 📎 LC ${lcID}: merged ${ledgerDocIds.length} ledger-attached document IDs into detail response`);
        }
      }

      // 4. Merge data from all sources
      const requiredFields = {
        lcId: lcData?.lcId || lcData?.LCID || lcData?.id || lcID,
        contractId,
        exporterId: lcData?.exporterId || lcData?.exporterID || lcData?.ExporterID || pgData?.exporter_id || '',
        
        // ✅ BUYER DATA (enriched from PostgreSQL)
        buyerId: lcData?.buyerId || buyerData?.buyerId || '',
        buyerName: lcData?.buyerName || buyerData?.buyerName || '',
        buyerCountry: lcData?.buyerCountry || buyerData?.buyerCountry || '',
        buyerBank: lcData?.buyerBank || buyerData?.buyerBank || '',
        
        // ✅ BANKING DETAILS (with exporter's bank as advising bank)
        issuingBank: lcData?.issuingBank || lcData?.issuingBankName || lcData?.bankName || pgData?.issuing_bank || '',
        advisingBank: lcData?.advisingBank || lcData?.advisingBankName || buyerData?.exporterBank || pgData?.advising_bank || '',
        beneficiary: lcData?.beneficiary || '',
        
        amount: lcData?.amount ?? pgData?.amount ?? 0,
        currency: lcData?.currency || pgData?.currency || 'USD',
        status: lcData?.status || pgData?.status || 'PENDING',
        expiryDate: lcData?.expiryDate || lcData?.expiry_date || pgData?.expiry_date || null,
        requestDate: lcData?.requestDate || lcData?.request_date || pgData?.request_date || null,
        approvalDate: lcData?.approvalDate || lcData?.approval_date || pgData?.approval_date || null,
        issueDate: lcData?.issueDate || lcData?.issue_date || pgData?.issue_date || null,
        documents: allDocuments,  // ✅ ALL DOCUMENTS (LC + Contract + Shipment + Customs)
        ledgerDocuments: ledgerDocIds,  // F-E: raw document IDs attached to the LC on the ledger (SubmitLCDocuments)
        terms: lcData?.terms || pgData?.terms || '',
        amendments: lcData?.amendments || [],
        amendmentCount: lcData?.amendmentCount ?? (lcData?.amendments ? lcData.amendments.length : 0),
        discrepancies: lcData?.discrepancies || [],
        discrepancyResolved: lcData?.discrepancyResolved ?? false,
        createdAt: lcData?.createdAt || lcData?.created_at || pgData?.created_at || null,
        updatedAt: lcData?.updatedAt || lcData?.updated_at || pgData?.updated_at || null,
        
        // ACTOR FIELDS: Use CouchDB first (source of truth), fallback to PostgreSQL
        approvedBy: lcData?.approvedBy || pgData?.approved_by || null,
        approvedByMsp: lcData?.approvedByMsp || pgData?.approved_by_msp || null,
        issuedBy: lcData?.issuedBy || pgData?.issued_by || null,
        issuedByMsp: lcData?.issuedByMsp || pgData?.issued_by_msp || null,
        lastUpdatedBy: lcData?.lastUpdatedBy || pgData?.last_updated_by || null,
        lastUpdatedByMsp: lcData?.lastUpdatedByMsp || pgData?.last_updated_by_msp || null,
      };
      
      // Log which database provided fields
      logger.info(`[BANKING] ✅ LC data merged - Buyer: ${requiredFields.buyerName || 'N/A'}, Advising Bank: ${requiredFields.advisingBank || 'N/A'}`);

      // D5 (2026-11-18): heal PG from the ledger on detail reads too,
      // so a stale row (e.g. LC-BVER PAYMENT_RELEASED in PG vs SETTLED
      // on the ledger) is fixed by opening the LC, not only by listing
      // it. Best-effort — autoHealLCStatus never throws — and the
      // response already carries the ledger status either way.
      if (pgData && pgData.status && lcData?.status && pgData.status !== lcData.status) {
        await autoHealLCStatus(lcID, lcData.status);
      }

      res.json({
        success: true,
        data: {
          ...lcData,
          ...requiredFields,
        },
        enriched: true, // ✅ Flag showing enrichment was applied
        sources: {
          blockchain: blockchainSuccess,
          postgresql: pgData !== null,
          buyerEnriched: !!buyerData?.buyerName,
        },
        fetchTimeMs: fetchTime,
        timestamp: new Date().toISOString(),
      });
    } else {
      // Both blockchain and PostgreSQL failed
      logger.error(`[BANKING] ❌ Both blockchain and PostgreSQL queries failed for LC ${lcID}`);
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'LC not found in any database',
        },
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error retrieving LC ${req.params.lcID}:`, error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * @swagger
 * /api/v1/forex:
 *   get:
 *     summary: Get all forex allocations
 *     tags: [Forex]
 */
router.get('/forex', async (req, res) => {
  try {
    const result = await fabricService.queryAllForex();

    if (result.success) {
      res.json({
        success: true,
        data: result.data || [],
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(500).json({
        success: false,
        error: {
          code: 'QUERY_FAILED',
          message: result.error || 'Failed to retrieve forex allocations',
        },
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    logger.error('Error retrieving forex:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      },
      timestamp: new Date().toISOString(),
    });
  }
});

// ==================== PAYMENT DOCUMENT SUBMISSION ====================

/**
 * POST /api/v1/banking/payment/:paymentID/submit-documents
 * Exporter submits shipping documents for LC compliance
 */
router.post('/payment/:paymentID/submit-documents',
  authMiddleware,
  requireRole(['BANKS', 'BANK_ADMIN']),
  [
    param('paymentID').notEmpty().withMessage('Payment ID is required'),
    body('documents').isArray().withMessage('Documents array is required'),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { paymentID } = req.params;
      const { documents } = req.body;

      const result = await fabricService.submitPaymentDocuments(paymentID, documents);

      if (result.success) {
        logger.info(`Payment documents submitted: ${paymentID}`);
        // Audit: this chain move never wrote an audit_trail row — the
        // audited lcService/forexService methods are never called here.
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
          data: result.data,
          txId: result.txId,
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(400).json({
          success: false,
          error: {
            code: 'DOCUMENT_SUBMISSION_FAILED',
            message: result.error || 'Failed to submit documents',
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.error('Error submitting payment documents:', error);
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
 * POST /api/v1/banking/payment/:paymentID/verify-documents
 * Bank verifies submitted documents against LC terms
 */
router.post('/payment/:paymentID/verify-documents',
  authMiddleware,
  requireRole(['BANKS', 'BANK_ADMIN']),
  [
    param('paymentID').notEmpty().withMessage('Payment ID is required'),
    body('verifiedBy').notEmpty().withMessage('Verified by is required'),
    body('comments').optional().isString(),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { paymentID } = req.params;
      const { verifiedBy, comments } = req.body;

      const result = await fabricService.verifyPaymentDocuments(
        paymentID,
        verifiedBy,
        comments || 'Documents verified against LC terms'
      );

      if (result.success) {
        logger.info(`Payment documents verified: ${paymentID} by ${verifiedBy}`);
        // Audit: this chain move never wrote an audit_trail row — the
        // audited lcService/forexService methods are never called here.
        // Best-effort — a failed audit write must not fail the move.
        await logAuditBestEffort(req, {
          entityType: 'PAYMENT',
          entityId: paymentID,
          action: 'VERIFY_DOCUMENTS',
          newValue: 'VERIFIED',
          blockchainTxId: result.txId || undefined,
          metadata: { verifiedBy, blockchainTxId: result.txId || null },
        }, `payment ${paymentID} verify-documents`);

        res.json({
          success: true,
          data: result.data,
          txId: result.txId,
          timestamp: new Date().toISOString(),
        });
      } else {
        // Same not-found mapping as POST /payments/:id/verify (M-9):
        // "payment <id> does not exist" from VerifyPaymentDocuments
        // is a 404, not a 400 chain failure.
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
            code: 'DOCUMENT_VERIFICATION_FAILED',
            message: result.error || 'Failed to verify documents',
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.error('Error verifying payment documents:', error);
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


// ==================== PAYMENT METHOD-SPECIFIC ROUTES ====================
// Added June 26, 2026 for payment method differentiation

/**
 * POST /api/v1/banking/payment/initiate
 * Initiate payment with specific payment method
 * Supports: LC, CAD, TT_ADVANCE, TT_POST, ADVANCE
 */
router.post('/payment/initiate',
  authMiddleware,
  requireRole(['BANKS', 'BANK_ADMIN']),
  [
    body('paymentID').notEmpty().withMessage('Payment ID is required'),
    body('contractID').notEmpty().withMessage('Contract ID is required'),
    body('exporterID').notEmpty().withMessage('Exporter ID is required'),
    body('amount').notEmpty().withMessage('Amount is required'),
    body('currency').notEmpty().withMessage('Currency is required'),
    body('receivingBank').notEmpty().withMessage('Receiving bank is required'),
    bicValidator('receivingBankBIC', 'Receiving bank BIC'),
    body('beneficiaryName').notEmpty().withMessage('Beneficiary name is required'),
    body('beneficiaryAccount').notEmpty().withMessage('Beneficiary account is required').bail()
      .custom(bankAccountValidator('receivingBank')),
    body('paymentMethod').isIn(['LC', 'CAD', 'TT_ADVANCE', 'TT_POST', 'ADVANCE'])
      .withMessage('Invalid payment method. Must be LC, CAD, TT_ADVANCE, TT_POST, or ADVANCE'),
  ],
  validateRequest,
  async (req, res) => {
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

      // AUTO-MAPPING: Fetch contract data to auto-populate payment fields
      let autoMappedData: any = {};
      try {
        const contractResult = await fabricService.queryChaincode('ReadSalesContract', [contractID]);
        if (contractResult.success && contractResult.data) {
          const contract = contractResult.data;
          autoMappedData.exporterID = contract.ExporterID || contract.exporterID || exporterID;
          autoMappedData.currency = contract.Currency || contract.currency || 'USD';
          autoMappedData.paymentMethod = contract.PaymentMethod || contract.paymentMethod || paymentMethod;
          
          // Calculate payment amount from contract value if not provided
          const pricePerKg = parseFloat(contract.PricePerKg || contract.pricePerKg || '0');
          const quantity = parseFloat(contract.Quantity || contract.quantity || '0');
          autoMappedData.calculatedAmount = (pricePerKg * quantity).toFixed(2);
          
          logger.info(`[PAYMENT] Auto-mapped from contract: exporterID=${autoMappedData.exporterID}, amount=${autoMappedData.calculatedAmount}, method=${autoMappedData.paymentMethod}`);
        }
      } catch (error) {
        logger.warn('[PAYMENT] Could not fetch contract for auto-mapping:', error);
      }

      // Use provided values or auto-mapped values
      const finalExporterID = exporterID || autoMappedData.exporterID || '';
      const finalAmount = amount || autoMappedData.calculatedAmount || '0';
      const finalCurrency = currency || autoMappedData.currency || 'USD';
      const finalPaymentMethod = paymentMethod || autoMappedData.paymentMethod || 'LC';

      const result = await fabricService.initiatePayment(
        paymentID,
        contractID,
        finalExporterID,
        lcID || '',
        finalAmount.toString(),
        finalCurrency,
        receivingBank,
        receivingBankBIC,
        beneficiaryName,
        beneficiaryAccount,
        finalPaymentMethod
      );

      if (result.success) {
        logger.info(`✅ Payment initiated: ${paymentID} (method: ${finalPaymentMethod}) with auto-mapped data`);
        // Audit: this chain move never wrote an audit_trail row — the
        // audited lcService/forexService methods are never called here.
        // Best-effort — a failed audit write must not fail the move.
        await logAuditBestEffort(req, {
          entityType: 'PAYMENT',
          entityId: paymentID,
          action: 'INITIATE',
          blockchainTxId: result.txId || undefined,
          metadata: { contractID, exporterID, amount, blockchainTxId: result.txId || null },
        }, `payment ${paymentID} initiate`);

        res.status(201).json({
          success: true,
          data: result.data,
          autoMapped: {
            exporterID: finalExporterID,
            amount: finalAmount,
            currency: finalCurrency,
            paymentMethod: finalPaymentMethod,
          },
          txId: result.txId,
          metadata: {
            paymentMethod: finalPaymentMethod,
            riskProfile: getRiskProfile(finalPaymentMethod),
            bankGuarantee: finalPaymentMethod === 'LC',
          },
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(400).json({
          success: false,
          error: {
            code: 'PAYMENT_INITIATION_FAILED',
            message: result.error || 'Failed to initiate payment',
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.error('Error initiating payment:', error);
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
 * POST /api/v1/banking/payment/:paymentID/release-documents
 * Release documents to buyer (CAD/LC only, after payment confirmed)
 */
router.post('/payment/:paymentID/release-documents',
  authMiddleware,
  requireRole(['BANKS', 'BANK_ADMIN']),
  [
    param('paymentID').notEmpty().withMessage('Payment ID is required'),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { paymentID } = req.params;

      const result = await fabricService.releaseDocumentsToBuyer(paymentID);

      if (result.success) {
        logger.info(`Documents released to buyer for payment: ${paymentID}`);
        // Audit: this chain move never wrote an audit_trail row — the
        // audited lcService/forexService methods are never called here.
        // Best-effort — a failed audit write must not fail the move.
        await logAuditBestEffort(req, {
          entityType: 'PAYMENT',
          entityId: paymentID,
          action: 'RELEASE_DOCUMENTS',
          blockchainTxId: result.txId || undefined,
          metadata: { blockchainTxId: result.txId || null },
        }, `payment ${paymentID} release-documents`);

        res.json({
          success: true,
          data: result.data,
          txId: result.txId,
          message: 'Documents released to buyer successfully',
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(400).json({
          success: false,
          error: {
            code: 'DOCUMENT_RELEASE_FAILED',
            message: result.error || 'Failed to release documents',
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.error('Error releasing documents:', error);
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
 * POST /api/v1/banking/payment/:paymentID/receive-advance
 * Receive advance payment (TT_ADVANCE/ADVANCE methods only)
 */
router.post('/payment/:paymentID/receive-advance',
  authMiddleware,
  requireRole(['BANKS', 'BANK_ADMIN']),
  [
    param('paymentID').notEmpty().withMessage('Payment ID is required'),
    body('advancePercentage').isFloat({ min: 0, max: 100 })
      .withMessage('Advance percentage must be between 0 and 100'),
    body('amountReceived').isFloat({ min: 0 })
      .withMessage('Amount received must be a positive number'),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { paymentID } = req.params;
      const { advancePercentage, amountReceived } = req.body;

      const result = await fabricService.receiveAdvancePayment(
        paymentID,
        advancePercentage.toString(),
        amountReceived.toString()
      );

      if (result.success) {
        logger.info(`Advance payment received: ${paymentID} (${advancePercentage}%)`);
        // Audit: this chain move never wrote an audit_trail row — the
        // audited lcService/forexService methods are never called here.
        // Best-effort — a failed audit write must not fail the move.
        await logAuditBestEffort(req, {
          entityType: 'PAYMENT',
          entityId: paymentID,
          action: 'RECEIVE_ADVANCE_PAYMENT',
          blockchainTxId: result.txId || undefined,
          metadata: { advancePercentage, blockchainTxId: result.txId || null },
        }, `payment ${paymentID} advance`);

        res.json({
          success: true,
          data: result.data,
          txId: result.txId,
          message: `Advance payment of ${advancePercentage}% received successfully`,
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(400).json({
          success: false,
          error: {
            code: 'ADVANCE_PAYMENT_FAILED',
            message: result.error || 'Failed to record advance payment',
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.error('Error receiving advance payment:', error);
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
 * POST /api/v1/banking/payment/:paymentID/receive-balance
 * Receive balance payment after advance
 */
router.post('/payment/:paymentID/receive-balance',
  authMiddleware,
  requireRole(['BANKS', 'BANK_ADMIN']),
  [
    param('paymentID').notEmpty().withMessage('Payment ID is required'),
    body('amountReceived').isFloat({ min: 0 })
      .withMessage('Amount received must be a positive number'),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { paymentID } = req.params;
      const { amountReceived } = req.body;

      const result = await fabricService.receiveBalancePayment(
        paymentID,
        amountReceived.toString()
      );

      if (result.success) {
        logger.info(`Balance payment received: ${paymentID}`);
        // Audit: this chain move never wrote an audit_trail row — the
        // audited lcService/forexService methods are never called here.
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
          data: result.data,
          txId: result.txId,
          message: 'Balance payment received successfully',
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(400).json({
          success: false,
          error: {
            code: 'BALANCE_PAYMENT_FAILED',
            message: result.error || 'Failed to record balance payment',
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.error('Error receiving balance payment:', error);
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
 * PUT /api/v1/banking/payment/:paymentID/status
 * Update payment status (validates transition per payment method)
 */
router.put('/payment/:paymentID/status',
  authMiddleware,
  requireRole(['BANKS', 'BANK_ADMIN']),
  [
    param('paymentID').notEmpty().withMessage('Payment ID is required'),
    body('status').notEmpty().withMessage('New status is required'),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { paymentID } = req.params;
      const { status } = req.body;

      const result = await fabricService.updatePaymentStatus(paymentID, status);

      if (result.success) {
        logger.info(`Payment status updated: ${paymentID} → ${status}`);
        // Audit: this chain move never wrote an audit_trail row — the
        // audited lcService/forexService methods are never called here.
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
          data: result.data,
          txId: result.txId,
          message: `Payment status updated to ${status}`,
          timestamp: new Date().toISOString(),
        });
      } else {
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
      logger.error('Error updating payment status:', error);
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
 * GET /api/v1/banking/payment/by-method/:method
 * Query payments by payment method
 */
router.get('/payment/by-method/:method',
  authMiddleware,
  [
    param('method').isIn(['LC', 'CAD', 'TT_ADVANCE', 'TT_POST', 'ADVANCE'])
      .withMessage('Invalid payment method'),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { method } = req.params;

      // ✅ Use CouchDB direct query instead of Fabric SDK to avoid timeout
      const { CouchDBDirectService } = require('../services/couchDBDirectService');
      const couchDBService = new CouchDBDirectService();
      
      logger.info(`[BANKING] 🔗 Fetching payments for method: ${method} from blockchain (CouchDB direct)...`);
      
      const payments = await couchDBService.queryPaymentsByMethod(method);
      
      logger.info(`[BANKING] ✅ Loaded ${payments.length} payments for method ${method} from blockchain (CouchDB direct)`);

      res.json({
        success: true,
        data: payments || [],
        metadata: {
          paymentMethod: method,
          count: (payments || []).length,
          riskProfile: getRiskProfile(method),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error retrieving payments by method:', error);
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

// C1: never settle against a REJECTED SWIFT message. Chaincode
// SettlePayment never looks at any SWIFT message — it only stores the
// supplied swiftReference — so the API must check first. Same rule as
// checkSwiftForSettle() in api/src/routes/payments.ts: resolve the
// reference two ways (by reference, and by the messages linked to this
// payment, so a caller cannot dodge a rejected message by supplying a
// fresh reference). Any REJECTED message → 400 SWIFT_MESSAGE_REJECTED;
// a failed lookup itself → 503 SWIFT_LOOKUP_FAILED (fail closed, do
// not settle blind). The SWIFT_RECEIVED corroboration from payments.ts
// (SWIFT_MESSAGE_NOT_FOUND) is deliberately not ported here: it needs
// the payment's current status and stored swiftDetails, which this
// handler does not read, and the task rule is REJECTED/lookup-only.
async function checkSwiftForBankingSettle(
  paymentID: string,
  swiftReference: string,
): Promise<{ ok: true } | { ok: false; status: number; code: string; message: string }> {
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
  return { ok: true };
}

/**
 * POST /api/v1/banking/payment/:paymentID/settle
 * Settle payment with retention and exchange rate
 */
router.post('/payment/:paymentID/settle',
  authMiddleware,
  requireRole(['BANKS', 'BANK_ADMIN']),
  [
    param('paymentID').notEmpty().withMessage('Payment ID is required'),
    body('exchangeRate').isFloat({ gt: 0 }).withMessage('Exchange rate must be greater than 0'),
    body('retentionRate').isFloat({ gt: 0, max: 100 })
      .withMessage('Retention rate must be between 0 and 100'),
    body('payingBank').notEmpty().withMessage('Paying bank is required'),
    bicValidator('payingBankBIC', 'Paying bank BIC'),
    body('swiftReference').notEmpty().withMessage('SWIFT reference is required'),
    // LEG3 M-9: nbeApprovalRef is required on the /payments/:id/settle
    // route — require it here too so the two settle routes agree. The
    // chaincode stores it but does not require it; the API requires it
    // because settlement without an NBE approval reference is a
    // compliance gap. Callers updated: test/helpers/api-client.ts.
    body('nbeApprovalRef').notEmpty().withMessage('NBE approval reference is required'),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { paymentID } = req.params;
      const {
        exchangeRate,
        retentionRate,
        payingBank,
        payingBankBIC,
        swiftReference,
        nbeApprovalRef,
      } = req.body;

      // Connect as Banks MSP since only banks can settle payments
      await fabricService.connectAsOrg('BanksMSP');

      // C1: refuse to settle against a REJECTED SWIFT message (see
      // checkSwiftForBankingSettle above). Runs before any chain write.
      // No SWIFT reference at all → no message to check; settle proceeds.
      if (swiftReference) {
        const swiftGuard = await checkSwiftForBankingSettle(paymentID, swiftReference);
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
      }

      const result = await fabricService.settlePayment(
        paymentID,
        exchangeRate.toString(),
        retentionRate.toString(),
        payingBank,
        payingBankBIC,
        swiftReference,
        nbeApprovalRef
      );

      if (result.success) {
        logger.info(`Payment settled: ${paymentID} (SWIFT: ${swiftReference})`);
        // Audit: this chain move never wrote an audit_trail row — the
        // audited lcService/forexService methods are never called here.
        // Best-effort — a failed audit write must not fail the move.
        await logAuditBestEffort(req, {
          entityType: 'PAYMENT',
          entityId: paymentID,
          action: 'SETTLE',
          newValue: 'SETTLED',
          blockchainTxId: result.txId || undefined,
          metadata: { exchangeRate, retentionRate, payingBank, swiftReference, nbeApprovalRef, blockchainTxId: result.txId || null },
        }, `payment ${paymentID} settle`);

        // Settle-sig follow-up: this route's SettlePayment call never
        // left a blockchain_signatures row — the /payments/:id/settle
        // route records one (recordSettleSignature, leftover 2), this
        // one did not. Record it best-effort (recordChainSignature
        // catches internally and dedupes by txId) so a failed PG write
        // cannot turn a committed settlement into a 500.
        await paymentService.recordSettleSignature({
          paymentID,
          txId: result.txId || null,
          signerUsername: (req as any).user?.username || 'bank_admin',
        });

        // Settle-sig follow-up: carry blockchainTxId alongside txId,
        // top-level and under data when data is an object — the way
        // the /payments/:id/settle route does. This route returned
        // txId only, so the portal could not read the settle tx back
        // from the response.
        const settleData: any = result.data;
        if (settleData && typeof settleData === 'object' && !Array.isArray(settleData)) {
          settleData.blockchainTxId = result.txId || null;
        }

        res.json({
          success: true,
          data: settleData,
          txId: result.txId,
          blockchainTxId: result.txId || null,
          message: 'Payment settled successfully',
          timestamp: new Date().toISOString(),
        });
      } else {
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
      logger.error('Error settling payment:', error);
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

// ==================== CAD & CONSIGNMENT SUB-ROUTERS ====================
router.use('/cad', cadRoutes);
router.use('/consignment', consignmentRoutes);

// Helper function to get risk profile
function getRiskProfile(paymentMethod: string): string {
  const riskProfiles: { [key: string]: string } = {
    'LC': 'LOW',
    'CAD': 'MEDIUM',
    'TT_ADVANCE': 'LOW',
    'TT_POST': 'HIGH',
    'ADVANCE': 'LOW',
  };
  return riskProfiles[paymentMethod] || 'UNKNOWN';
}

/**
 * Auto-heal LC status synchronization between blockchain and PostgreSQL
 * Called on every LC query to ensure eventual consistency
 */
async function autoHealLCStatus(lcID: string, blockchainStatus: string): Promise<void> {
  try {
    const { DatabaseService } = await import('../services/databaseService');
    const db = DatabaseService.getInstance();
    
    const pgLc = await db.get(
      `SELECT status FROM letters_of_credit WHERE lc_id = $1`,
      [lcID]
    );
    
    if (pgLc && pgLc.status !== blockchainStatus) {
      logger.warn(`🔧 Status mismatch detected for ${lcID}: PostgreSQL=${pgLc.status}, Blockchain=${blockchainStatus}`);
      
      await db.run(
        `UPDATE letters_of_credit 
         SET status = $1, updated_at = NOW() 
         WHERE lc_id = $2`,
        [blockchainStatus, lcID]
      );
      
      // Record audit trail for auto-heal
      await db.run(
        `INSERT INTO audit_trail (
          entity_type, entity_id, action, performed_by, performed_by_org,
          old_value, new_value, reason, metadata, ip_address
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          'LC',
          lcID,
          'AUTO_HEAL_STATUS',
          'SYSTEM',
          'SYSTEM',
          JSON.stringify({ status: pgLc.status }),
          JSON.stringify({ status: blockchainStatus }),
          'Auto-healing: Synchronized PostgreSQL status with blockchain source of truth',
          JSON.stringify({
            lcID,
            oldStatus: pgLc.status,
            newStatus: blockchainStatus,
            autoHealed: true,
            timestamp: new Date().toISOString()
          }),
          'system'
        ]
      );
      
      logger.info(`✅ Auto-healed ${lcID}: ${pgLc.status} → ${blockchainStatus}`);
    }
  } catch (error) {
    logger.warn(`⚠️ Failed to auto-heal LC status for ${lcID}:`, error);
    // Non-fatal: don't throw, just log
  }
}

/**
 * D5 (2026-11-18): read-time LC status reconciliation for the Banks LC
 * list. The list (GET /banking/lc) is PG-only while the detail endpoint
 * reads the ledger first, so an LC whose settle predated the F-C mirror
 * (post-delivery settle, 2026-11-16) shows PAYMENT_RELEASED in the list
 * while the ledger says SETTLED — live on LC-BVER-20261116162737.
 *
 * One QueryAllLCs chain call (CouchDB rich query, limit 1000) returns
 * every ledger LC, so the whole list is reconciled with a single chain
 * read — never one call per row. The read is bounded: if the ledger
 * does not answer within LC_RECONCILE_TIMEOUT_MS the caller falls back
 * to the PG statuses (today's behaviour) and logs, so a slow or
 * mid-deploy chaincode can never hang the list. Rows the ledger does
 * not return (e.g. the phantom REQUESTED LC, keyed outside the
 * QueryAllLCs selector) keep their PG status.
 *
 * The ledger is the source of truth (same rule as autoHealLCStatus and
 * the F-C / tab-0 settle mirrors): a differing row is shown with the
 * ledger status AND healed in PG, best-effort. Healing is capped per
 * list call so a large stale backlog cannot stall the response; the
 * response status is reconciled regardless of the heal cap.
 */
const LC_RECONCILE_TIMEOUT_MS = 10000;
const LC_RECONCILE_HEAL_CAP = 50;

async function fetchLedgerLcStatusMap(): Promise<Map<string, string> | null> {
  try {
    const result = await Promise.race([
      fabricService.queryAllLCs(),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), LC_RECONCILE_TIMEOUT_MS)
      ),
    ]);
    if (!result || !(result as any).success || !Array.isArray((result as any).data)) {
      if (result === null) {
        logger.warn(`[BANKING] ⚠️ LC status reconciliation skipped: QueryAllLCs timed out after ${LC_RECONCILE_TIMEOUT_MS}ms`);
      } else {
        logger.warn('[BANKING] ⚠️ LC status reconciliation skipped: QueryAllLCs unsuccessful');
      }
      return null;
    }
    const map = new Map<string, string>();
    for (const lc of (result as any).data) {
      const id = lc?.lcId || lc?.LCID || lc?.LcId || lc?.id || '';
      const status = lc?.status || lc?.Status || '';
      if (id && status) map.set(id, status);
    }
    logger.info(`[BANKING] 🔗 LC status reconciliation: ${map.size} ledger LCs loaded`);
    return map;
  } catch (err) {
    logger.warn('[BANKING] ⚠️ LC status reconciliation skipped (QueryAllLCs failed):', (err as any)?.message || err);
    return null;
  }
}

/**
 * N1 (E2E fix round): record the trace of an ExamineLCDocuments chain
 * call — PG status mirror (UTILIZED when compliant), a
 * blockchain_signatures row and an audit_trail row — mirroring the F11
 * forex-confirm fix in nbe.ts. Best-effort throughout: the ledger write
 * already landed, so a failed PG write must not turn the call into a
 * 500. Used by the examine-documents endpoint itself and by the
 * release handler's auto-examination step.
 */
async function recordLCExaminationTrace(opts: {
  lcID: string;
  txId?: string | null;
  compliant: boolean;
  oldStatus?: string | null;
  signerOrg?: string;
  signerUsername?: string;
  submittingMspId?: string;
  ip?: string;
}): Promise<void> {
  const { lcID, txId, compliant, oldStatus, signerOrg, signerUsername, submittingMspId, ip } = opts;
  const newStatus = compliant ? 'UTILIZED' : (oldStatus || null);
  try {
    if (compliant) {
      await dbService.run(
        `UPDATE letters_of_credit
         SET status = 'UTILIZED', updated_at = NOW()
         WHERE lc_id = $1`,
        [lcID]
      );
      logger.info(`✅ PostgreSQL updated: LC ${lcID} status set to UTILIZED`);
    }
  } catch (dbError) {
    logger.warn(`⚠️  Failed to mirror LC examination to PostgreSQL for ${lcID}:`, dbError);
  }
  try {
    const signatureId = `SIG-${Date.now()}-${require('crypto').randomBytes(8).toString('hex')}`;
    await dbService.run(
      `INSERT INTO blockchain_signatures (
        signature_id, blockchain_tx_id, entity_type, entity_id,
        chaincode_function, signer_org, signer_username,
        blockchain_timestamp, action_type, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, NOW())
      ON CONFLICT (signature_id) DO NOTHING`,
      [
        signatureId,
        txId || null,
        'LC',
        lcID,
        'ExamineLCDocuments',
        submittingMspId || signerOrg || 'BanksMSP',
        signerUsername || 'Bank Officer',
        'DOCUMENT_EXAMINATION'
      ]
    );
  } catch (sigErr: any) {
    logger.warn(`⚠️ Failed to store LC-examination signature for ${lcID}: ${sigErr?.message}`);
  }
  try {
    await dbService.run(
      `INSERT INTO audit_trail (
        entity_type, entity_id, action, performed_by, performed_by_org,
        old_value, new_value, reason, metadata, ip_address, blockchain_tx_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        'LC',
        lcID,
        'EXAMINE_DOCUMENTS',
        signerUsername || 'Bank Officer',
        signerOrg || 'BanksMSP',
        oldStatus ? JSON.stringify({ status: oldStatus }) : null,
        newStatus ? JSON.stringify({ status: newStatus }) : null,
        compliant
          ? 'LC documents examined: compliant with LC terms'
          : 'LC documents examined: discrepancies found',
        JSON.stringify({
          lcID,
          compliant,
          transactionId: txId || null,
          action: 'LC Document Examination',
          timestamp: new Date().toISOString()
        }),
        ip || 'unknown',
        txId || null
      ]
    );
  } catch (auditErr: any) {
    logger.warn(`⚠️ Failed to store LC-examination audit row for ${lcID}: ${auditErr?.message}`);
  }
}

/**
 * FIX-2 (2026-11-19, banks-tabs-status): SHARED document-examination
 * gate — the S2 gate, extracted so both callers of ExamineLCDocuments
 * enforce the SAME rule. The chaincode checks only the LC status; it
 * cannot see the PG documents, so the gate must live in the API.
 * Rule, over the same attached-document set the LC detail endpoint
 * returns (LC + CONTRACT + SHIPMENT + CUSTOMS rows for the LC's
 * contract): no documents at all -> refuse; compliant=true -> every
 * attached document must be verified/approved/compliant;
 * compliant=false -> at least one attached document must have a
 * terminal examination outcome (verified or rejected).
 * Returns { ok: true, docs } or { ok: false, status, error } with the
 * error shaped exactly like the examine-documents route used to return
 * inline (same codes/messages/hints), so existing callers keep their
 * contract. A failed gate read fails CLOSED (500), never examines
 * blind. Callers: POST /lc/:lcID/examine-documents and the
 * release-payment handler's auto-exam step (which used to invoke the
 * chaincode directly, bypassing this gate - live: LC4 released with an
 * unverified doc, tx 6c852d31..., block 12930).
 */
async function checkLCExamineGate(
  lcID: string,
  compliant: boolean
): Promise<
  | { ok: true; docs: any[] }
  | { ok: false; status: number; error: { code: string; message: string; hint?: string; pendingDocuments?: any[] } }
> {
  try {
    const lcRow = await dbService.get(
      `SELECT contract_id FROM letters_of_credit WHERE lc_id = $1`,
      [lcID]
    );
    const gateContractId = lcRow?.contract_id || '';
    const docs: any[] = gateContractId
      ? await dbService.all(`
        SELECT document_id, document_type, verification_status, entity_type
        FROM documents
        WHERE status = 'active'
          AND (
            (entity_type = 'LC' AND entity_id = $1)
            OR (entity_type = 'CONTRACT' AND entity_id = $2)
            OR (entity_type = 'SHIPMENT' AND entity_id IN (
                 SELECT shipment_id FROM shipments WHERE contract_id = $2
            ))
            OR (entity_type = 'CUSTOMS_DECLARATION' AND entity_id IN (
                 SELECT declaration_number FROM customs_declarations WHERE contract_id::text = $2
            ))
          )
      `, [lcID, gateContractId])
      : [];
    if (docs.length === 0) {
      return {
        ok: false,
        status: 400,
        error: {
          code: 'NO_DOCUMENTS_TO_EXAMINE',
          message: 'Cannot examine documents: no documents are attached to this LC',
          hint: 'Upload and verify the LC documents before examination (Document Examination tab \u2192 per-document Approve)',
        },
      };
    }
    const isVerifiedDoc = (d: any) => ['verified', 'approved', 'compliant'].includes(
      String(d.verification_status || '').toLowerCase());
    const isExaminedDoc = (d: any) => isVerifiedDoc(d) ||
      String(d.verification_status || '').toLowerCase() === 'rejected';
    if (compliant === true) {
      const pending = docs.filter((d: any) => !isVerifiedDoc(d));
      if (pending.length > 0) {
        return {
          ok: false,
          status: 400,
          error: {
            code: 'DOCUMENTS_NOT_VERIFIED',
            message: `Cannot mark LC compliant: ${pending.length} document(s) not yet verified (${pending.map((d: any) => d.document_type).join(', ')})`,
            hint: 'Verify each document first (Document Examination tab \u2192 per-document Approve), then mark compliant',
            pendingDocuments: pending.map((d: any) => ({ documentId: d.document_id, documentType: d.document_type, entityType: d.entity_type, verificationStatus: d.verification_status })),
          },
        };
      }
    } else {
      const examined = docs.filter(isExaminedDoc);
      if (examined.length === 0) {
        return {
          ok: false,
          status: 400,
          error: {
            code: 'DOCUMENTS_NOT_EXAMINED',
            message: 'Cannot record discrepancies: no attached document has been examined yet',
            hint: 'Approve or reject at least one document first (Document Examination tab), then record the discrepancy',
          },
        };
      }
    }
    return { ok: true, docs };
  } catch (gateErr) {
    logger.warn(`[LC EXAMINE] Document gate read failed for ${lcID}:`, gateErr);
    return {
      ok: false,
      status: 500,
      error: {
        code: 'EXAMINATION_GATE_ERROR',
        message: 'Could not verify the LC documents before examination; try again',
      },
    };
  }
}

/**
 * POST /api/v1/banking/lc/:lcID/examine-documents
 * Bank examines shipping documents against LC terms (UCP 600 Article 14)
 * Workflow: After shipment, bank verifies documents comply with LC requirements
 */
router.post('/lc/:lcID/examine-documents',
  authMiddleware,
  requireRole(['BANKS', 'BANK_ADMIN']),
  [
    param('lcID').notEmpty().withMessage('LC ID is required'),
    body('compliant').isBoolean().withMessage('Compliance status is required'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { lcID } = req.params;
      const { compliant, discrepancies, examinationDate } = req.body;
      const user = (req as any).user;

      logger.info(`Examining LC documents for ${lcID}`, {
        userId: user?.sub,
        compliant,
        discrepancies: discrepancies || 'none',
      });

      // N1: capture the pre-examination status for the audit row
      // (best-effort — a failed read leaves oldStatus null, not a 500).
      let oldStatus: string | null = null;
      try {
        const lcBefore = await fabricService.queryChaincode('ReadLC', [lcID]);
        if (lcBefore.success && lcBefore.data) {
          oldStatus = lcBefore.data.Status || lcBefore.data.status || null;
        }
      } catch {
        oldStatus = null;
      }

      // FIX-2: shared gate (checkLCExamineGate above) - same rule the
      // release handler's auto-exam step now calls. Response codes and
      // messages are unchanged from the inline gate this replaces.
      const gate = await checkLCExamineGate(lcID, compliant);
      if (!gate.ok) {
        return res.status(gate.status).json({
          success: false,
          error: gate.error,
          timestamp: new Date().toISOString(),
        });
      }

      const result = await fabricService.invokeChaincode('ExamineLCDocuments', [
        lcID,
        compliant.toString(),
        discrepancies || '',
        examinationDate || new Date().toISOString(),
        user?.org || 'BANK',
      ]);

      if (result.success) {
        logger.info(`✅ LC documents examined: ${lcID}, compliant: ${compliant}`);

        // N1: the old handler returned data:null, no txId, and wrote no
        // blockchain_signatures / audit_trail row — the examination left
        // no trace. Mirror the F11 forex-confirm fix: PG status mirror
        // plus signature + audit rows (best-effort, never a 500).
        await recordLCExaminationTrace({
          lcID,
          txId: result.txId,
          compliant,
          oldStatus,
          signerOrg: user?.org,
          signerUsername: user?.username,
          submittingMspId: result.submittingMspId,
          ip: req.ip,
        });

        // In-app notification (persisted feed + live WS broadcast).
        // Document examination previously emitted nothing, so another
        // bank user never heard about it live. Utilisation is covered
        // by the forex_utilised emit on POST /forex/utilize.
        await notificationService.emitWorkflowEvent({
          type: 'lc_examined',
          title: `Letter of Credit ${lcID} documents examined`,
          message: compliant
            ? `Letter of Credit ${lcID} documents comply with the LC terms.`
            : `Letter of Credit ${lcID} documents have discrepancies: ${discrepancies || 'see examination record'}.`,
          entityType: 'lc', entityId: lcID, severity: compliant ? 'success' : 'warning',
          roles: ['BANKS'], lcId: lcID,
          actionUrl: '/portals/exporter?tab=contracts',
          actionUrls: { BANKS: '/portals/banks?tab=contracts' },
        });

        res.json({
          success: true,
          data: result.data,
          txId: result.txId,
          message: compliant ? 'Documents comply with LC terms' : 'Discrepancies found in documents',
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(400).json({
          success: false,
          error: {
            code: 'EXAMINATION_FAILED',
            message: result.error || 'Failed to examine documents',
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.error('Error examining LC documents:', error);
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
 * POST /api/v1/banking/lc/:lcID/release-payment
 * Bank releases payment to exporter after document compliance (UCP 600 Article 7)
 * Workflow: Final step - bank transfers funds via SWIFT after all checks pass
 */
router.post('/lc/:lcID/release-payment',
  authMiddleware,
  requireRole(['BANKS', 'BANK_ADMIN']),
  [
    param('lcID').notEmpty().withMessage('LC ID is required'),
    body('amount').notEmpty().withMessage('Payment amount is required'),
    body('currency').notEmpty().withMessage('Currency is required'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { lcID } = req.params;
      const { amount, currency, paymentDate } = req.body;
      const user = (req as any).user;

      logger.info(`Releasing payment for LC ${lcID}`, {
        userId: user?.sub,
        amount,
        currency,
      });

      // FIX-2 (2026-11-19): the old M-4 "document verification" block
      // that lived here is REMOVED - it could never block a release.
      // (1) Its fallback query matched CONTRACT/LC rows with NO entity
      // filter, so any contract docs in the DB satisfied it, even for
      // an LC with no documents of its own. (2) When zero docs were
      // verified it only logged "ALLOWING FOR TEST" and continued.
      // Live consequence: LC4 released with an unverified doc
      // (tx 6c852d31..., block 12930) while the examine endpoint would
      // have 400d. The real gate is the shared checkLCExamineGate,
      // now called at the auto-exam step below (FOREX_ALLOCATED only)
      // - the same rule as examine-documents: zero attached docs ->
      // refuse; any doc unverified -> refuse 400
      // DOCUMENT_EXAMINATION_FAILED. The status read below is kept:
      // lcStatus (PG first, chain fallback) is reused by the
      // auto-examination step, and the ledger status is auto-healed
      // into PG.
      let lcStatus: string | null = null;
      try {
        const { DatabaseService } = await import('../services/databaseService');
        const db = DatabaseService.getInstance();

        // Check PostgreSQL status first (source of truth for corrected states)
        const pgLcRow = await db.get(
          `SELECT status FROM letters_of_credit WHERE lc_id = $1`,
          [lcID]
        );

        if (pgLcRow && pgLcRow.status) {
          lcStatus = pgLcRow.status;
          logger.info(`Using PostgreSQL LC status: ${lcStatus} for ${lcID}`);
        } else {
          // Fallback to blockchain if not in PostgreSQL
          const lcResult = await fabricService.queryChaincode('ReadLC', [lcID]);
          if (lcResult.success && lcResult.data) {
            const lc = lcResult.data;
            lcStatus = lc.Status || lc.status || null;
            logger.info(`Using blockchain LC status: ${lcStatus} for ${lcID}`);
          }
        }

        // Auto-heal: Sync PostgreSQL with blockchain status
        const lcResult = await fabricService.queryChaincode('ReadLC', [lcID]);
        if (lcResult.success && lcResult.data) {
          const lc = lcResult.data;
          await autoHealLCStatus(lcID, lc.Status || lc.status);
        }
      } catch (statusErr) {
        logger.warn(`Non-fatal: LC status read failed for payment ${lcID}:`, statusErr);
        // Continue - a null lcStatus skips the auto-exam step and
        // ReleaseLCPayment still fails honestly unless UTILIZED.
      }

      // N1: run the document examination as part of the release
      // itself. ReleaseLCPayment requires the LC to be UTILIZED and
      // only ExamineLCDocuments sets UTILIZED, but nothing in the
      // API/portal chain ever ran examine — so the first release
      // attempt always 400'd PAYMENT_RELEASE_FAILED and only recovered
      // via a manual examine-documents call. The shared gate above verified every attached document, so a compliant
      // examination here is the same verdict, not a weaker one.
      // The chaincode gate is NOT touched: an LC in any other state
      // (REQUESTED, APPROVED, ISSUED, PAYMENT_RELEASED, ...) skips
      // this step and ReleaseLCPayment still fails honestly, and a
      // failed examination aborts the release instead of proceeding.
      // MERGE 2026-11-18: ExamineLCDocuments was narrowed by the
      // user's line (bd1825c8) to FOREX_ALLOCATED only — an ISSUED LC
      // must allocate forex first (ISSUED -> FOREX_ALLOCATED) before
      // it can be examined, so the auto-exam is only invoked for
      // FOREX_ALLOCATED. An ISSUED LC reaching release skips this
      // step and ReleaseLCPayment fails honestly (it requires
      // UTILIZED). Do NOT re-widen the gate here.
      let autoExamined = false;
      let examinationTxId: string | null = null;
      if (lcStatus === 'FOREX_ALLOCATED') {
        logger.info(`LC ${lcID} is ${lcStatus}: running document examination as part of release`);
        // FIX-2: run the SAME document gate the examine-documents
        // endpoint enforces before the chaincode can examine. The
        // chaincode checks status only, so without this the release
        // endpoint auto-examined (and released) LCs with unverified
        // documents. Zero docs or any unverified doc -> 400
        // DOCUMENT_EXAMINATION_FAILED naming the docs; a failed gate
        // read fails closed (500), never examines blind.
        const gate = await checkLCExamineGate(lcID, true);
        if (!gate.ok) {
          if (gate.status === 500) {
            return res.status(500).json({
              success: false,
              error: gate.error,
              timestamp: new Date().toISOString(),
            });
          }
          logger.warn(`Payment release ${lcID} blocked by document gate: ${gate.error.code} - ${gate.error.message}`);
          return res.status(400).json({
            success: false,
            error: {
              code: 'DOCUMENT_EXAMINATION_FAILED',
              message: gate.error.message,
              hint: gate.error.hint || 'Bank must examine the shipping documents (POST /banking/lc/:lcID/examine-documents) before payment release',
              gateCode: gate.error.code,
              ...(gate.error.pendingDocuments ? { pendingDocuments: gate.error.pendingDocuments } : {}),
            },
            timestamp: new Date().toISOString(),
          });
        }
        const examResult = await fabricService.invokeChaincode('ExamineLCDocuments', [
          lcID,
          'true',
          '',
          new Date().toISOString(),
          user?.org || 'BANK',
        ]);
        if (!examResult.success) {
          logger.warn(`Payment release ${lcID} blocked: auto-examination failed: ${examResult.error}`);
          return res.status(400).json({
            success: false,
            error: {
              code: 'DOCUMENT_EXAMINATION_FAILED',
              message: examResult.error || 'Document examination failed; payment cannot be released',
              hint: 'Bank must examine the shipping documents (POST /banking/lc/:lcID/examine-documents) before payment release'
            },
            timestamp: new Date().toISOString(),
          });
        }
        autoExamined = true;
        examinationTxId = examResult.txId || null;
        await recordLCExaminationTrace({
          lcID,
          txId: examResult.txId,
          compliant: true,
          oldStatus: lcStatus,
          signerOrg: user?.org,
          signerUsername: user?.username,
          submittingMspId: examResult.submittingMspId,
          ip: req.ip,
        });
        logger.info(`✅ LC ${lcID} auto-examined as part of release (tx ${examinationTxId})`);
      }

      const result = await fabricService.invokeChaincode('ReleaseLCPayment', [
        lcID,
        amount.toString(),
        currency,
        paymentDate || new Date().toISOString(),
        user?.org || 'BANK',
      ]);

      if (result.success) {
        logger.info(`✅ Payment released for LC ${lcID}: ${currency} ${amount}`);
        // N3: mirror the release into PG. The old handler wrote to the
        // ledger only, so PG letters_of_credit stayed UTILIZED while
        // the ledger said PAYMENT_RELEASED. The chain write already
        // landed, so a PG failure must not turn this into a 500 (a
        // retry would fail — only UTILIZED LCs can release); log it
        // loudly and flag it in the response, like the F5
        // confirm-settlement fix.
        let pgMirrorFailed = false;
        try {
          await dbService.run(
            `UPDATE letters_of_credit
             SET status = 'PAYMENT_RELEASED', updated_at = NOW()
             WHERE lc_id = $1`,
            [lcID]
          );
          logger.info(`✅ PostgreSQL updated: LC ${lcID} status set to PAYMENT_RELEASED`);
          // Audit: this chain move never wrote an audit_trail row — the
          // audited lcService/forexService methods are never called here.
          // Best-effort — a failed audit write must not fail the move.
          await logAuditBestEffort(req, {
            entityType: 'LC',
            entityId: lcID,
            action: 'RELEASE_PAYMENT',
            newValue: 'PAYMENT_RELEASED',
            blockchainTxId: result.txId || undefined,
            metadata: { amount, currency, examinationTxId, blockchainTxId: result.txId || null },
          }, `lc ${lcID} release-payment`);

          // ✅ AUTO-CREATE MT103 SWIFT MESSAGE when payment is released
          try {
            logger.info(`[PAYMENT RELEASE] Auto-creating MT103 SWIFT message for LC ${lcID}...`);
            
            // Generate SWIFT message ID
            const messageID = `MT103-${lcID}-${Date.now()}`;
            const swiftReference = `PAY-${lcID.substring(0, 12)}-${Date.now().toString().substring(-8)}`;
            
            // Get LC and contract data for MT103 fields
            const lcData = await dbService.get(
              'SELECT exporter_id, contract_id FROM letters_of_credit WHERE lc_id = $1',
              [lcID]
            );
            
            const contract = lcData ? await dbService.get(
              'SELECT buyer_id, exporter_bank FROM contracts WHERE contract_id = $1',
              [lcData.contract_id]
            ) : null;
            
            // B10: the real chaincode function is CreateMT103_Payment
            // (chaincodes/coffee/swift.go:536), NOT
            // CreateMT103_SendPayment — that name exists in neither
            // line, so the call always failed with "Function
            // CreateMT103_SendPayment not found in contract
            // CoffeeContract". Its 13 params, in order: messageID,
            // swiftRef, senderBIC, receiverBIC, paymentID,
            // orderingCustomer, beneficiary, beneficiaryAccount,
            // amountStr, currency, valueDate, remittanceInfo,
            // chargeCode. ReleaseLCPayment creates the payment
            // on-ledger with the deterministic ID "PAY_<lcID>"
            // (chaincodes/coffee/banking.go), so that is the
            // paymentID. Beneficiary account: the exporters table
            // has no bank-account column, so '' (same as the manual
            // MT103 route when absent). Charge code: 'SHA', the
            // manual route's default (valid: OUR/SHA/BEN).
            const paymentID = `PAY_${lcID}`;
            // Create MT103 via chaincode
            const mt103Result = await fabricService.invokeChaincode('CreateMT103_Payment', [
              messageID,
              swiftReference,
              'CBEETAAAXXX', // Sender BIC (CBE Ethiopia)
              contract?.exporter_bank || 'UNKNOWN', // Receiver BIC (beneficiary's bank)
              paymentID,
              contract?.buyer_id || 'Buyer', // Ordering customer
              lcData?.exporter_id || 'Exporter', // Beneficiary
              '', // Beneficiary account (not stored in PG)
              amount.toString(),
              currency || 'USD',
              new Date().toISOString().slice(0, 10), // Value date (today)
              `Payment for LC ${lcID}`, // Remittance info
              'SHA', // Charge code (OUR/SHA/BEN)
            ], 'BanksMSP');

            if (mt103Result.success) {
              logger.info(`✅ MT103 SWIFT message auto-created: ${messageID} for LC ${lcID}`);

              // Link the message to the LC (best-effort, like the
              // manual MT103 route in swift.ts).
              try {
                await fabricService.invokeChaincode('LinkSWIFTMessageToLC', [messageID, lcID], 'BanksMSP');
              } catch (linkErr: any) {
                logger.warn(`⚠️ Could not link MT103 ${messageID} to LC ${lcID}:`, linkErr?.message || linkErr);
              }

              // Log audit trail
              await logAuditBestEffort(req, {
                entityType: 'SWIFT',
                entityId: messageID,
                action: 'CREATE',
                blockchainTxId: mt103Result.txId || undefined,
                metadata: { messageType: 'MT103', lcID, swiftReference, amount, currency, autoCreated: true },
              }, `swift message ${messageID} auto-create MT103`);
              
              // Send notification
              await notificationService.emitWorkflowEvent({
                type: 'swift_message_created',
                title: `SWIFT MT103 Payment Message Created`,
                message: `Payment message ${messageID} (MT103) created for LC ${lcID} - ${currency} ${Number(amount).toLocaleString()}`,
                entityType: 'swift', entityId: messageID, severity: 'success',
                roles: ['BANKS', 'EXPORTER'], exporterId: lcData?.exporter_id, lcId: lcID,
              });
            } else {
              logger.warn(`⚠️ MT103 auto-creation failed for LC ${lcID}: ${mt103Result.error}`);
            }
          } catch (swiftErr: any) {
            // Don't fail the payment release if SWIFT creation fails
            logger.warn(`⚠️ MT103 auto-creation error for LC ${lcID}:`, swiftErr?.message || swiftErr);
          }

        } catch (pgErr) {
          pgMirrorFailed = true;
          logger.error(`Payment release landed on-chain but the PG mirror failed for LC ${lcID}:`, pgErr);
        }
        res.json({
          success: true,
          data: result.data,
          txId: result.txId,
          message: 'Payment released successfully via SWIFT',
          ...(autoExamined ? { autoExamined: true, examinationTxId } : {}),
          ...(pgMirrorFailed ? { pgMirrorFailed: true } : {}),
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(400).json({
          success: false,
          error: {
            code: 'PAYMENT_RELEASE_FAILED',
            message: result.error || 'Failed to release payment',
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.error('Error releasing LC payment:', error);
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


// ==================== LC DISCREPANCY SUB-ROUTER ====================
router.use('/lc', lcDiscrepancyRoutes);

// Simplified endpoints for testing - map to the full endpoints above
router.post('/lc/:lcId/examine', authMiddleware,
  requireRole(['BANKS', 'BANK_ADMIN']), async (req: Request, res: Response) => {
  // Redirect to examine-documents
  req.params.lcID = req.params.lcId;
  req.body.compliant = req.body.examinationResult === 'COMPLIANT';
  req.body.discrepancies = req.body.examinationNotes || '';
  
  // Find and call the examine-documents handler
  const examineRoute = router.stack.find((layer: any) => 
    layer.route?.path === '/lc/:lcID/examine-documents'
  );
  
  if (examineRoute && examineRoute.route) {
    const handler = examineRoute.route.stack[examineRoute.route.stack.length - 1].handle;
    return handler(req, res, () => {});
  }
  
  // Fallback simple implementation
  try {
    const { DatabaseService } = await import('../services/databaseService');
    const db = DatabaseService.getInstance();
    
    await db.run(`
      UPDATE letters_of_credit
      SET status = 'DOCUMENTS_EXAMINED', updated_at = CURRENT_TIMESTAMP
      WHERE lc_number = $1 OR lc_id = $1
    `, [req.params.lcId]);
    
    res.json({
      success: true,
      data: { lcId: req.params.lcId, status: 'DOCUMENTS_EXAMINED' },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/v1/banking/lc/:lcID/reset-status
 * DEVELOPMENT ONLY: Reset LC status for testing purposes
 * Calls the ResetLCStatusForTesting chaincode function
 */
router.post('/lc/:lcID/reset-status',
  authMiddleware,
  requireRole(['BANKS', 'BANK_ADMIN', 'ADMIN']),
  [
    param('lcID').notEmpty().withMessage('LC ID is required'),
    body('targetStatus').notEmpty().withMessage('Target status is required'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { lcID } = req.params;
      const { targetStatus } = req.body;
      const user = (req as any).user;

      logger.warn(`[TESTING] Resetting LC ${lcID} status to ${targetStatus}`, {
        userId: user?.sub,
        username: user?.username,
      });

      // Call chaincode function
      const result = await fabricService.invokeChaincode('ResetLCStatusForTesting', [
        lcID,
        targetStatus,
      ]);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'RESET_FAILED',
            message: result.error || 'Failed to reset LC status',
          },
          timestamp: new Date().toISOString(),
        });
      }

      // Update PostgreSQL to match
      const { DatabaseService } = await import('../services/databaseService');
      const db = DatabaseService.getInstance();
      
      await db.run(
        `UPDATE letters_of_credit 
         SET status = $1, updated_at = NOW() 
         WHERE lc_id = $2`,
        [targetStatus, lcID]
      );

      logger.info(`[TESTING] Successfully reset LC ${lcID} to ${targetStatus}`);

      res.json({
        success: true,
        data: {
          lcId: lcID,
          newStatus: targetStatus,
          txId: result.txId,
        },
        message: `LC status reset to ${targetStatus} (TESTING ONLY)`,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      logger.error('[BANKING] Error resetting LC status:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'RESET_ERROR',
          message: 'Internal server error while resetting LC status',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

export default router;


// ==================== ADVANCED BANKING OPERATIONS ====================

/**
 * POST /api/v1/banking/lc/:lcID/transfer
 * Transfer LC to second beneficiary (UCP 600 Article 38)
 * Allows original beneficiary to transfer all or part of LC credit
 */
router.post('/lc/:lcID/transfer',
  authMiddleware,
  requireRole(['BANKS', 'BANK_ADMIN']),
  [
    param('lcID').notEmpty().withMessage('LC ID is required'),
    body('originalBeneficiary').notEmpty().withMessage('Original beneficiary is required'),
    body('newBeneficiary').notEmpty().withMessage('New beneficiary is required'),
    body('newBeneficiaryBank').notEmpty().withMessage('New beneficiary bank is required'),
    body('transferType').isIn(['FULL', 'PARTIAL']).withMessage('Transfer type must be FULL or PARTIAL'),
    body('transferAmount').notEmpty().withMessage('Transfer amount is required'),
    body('transferReason').notEmpty().withMessage('Transfer reason is required'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { lcID } = req.params;
      const {
        originalBeneficiary,
        newBeneficiary,
        newBeneficiaryBank,
        transferType,
        transferAmount,
        transferReason,
        originalBeneficiaryConsent,
        termsAndConditions
      } = req.body;
      const user = (req as any).user;

      logger.info(`[BANKING] Transferring LC ${lcID} from ${originalBeneficiary} to ${newBeneficiary}`);

      // Verify original beneficiary consent
      if (!originalBeneficiaryConsent) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'CONSENT_REQUIRED',
            message: 'Original beneficiary consent is required for LC transfer'
          },
          timestamp: new Date().toISOString()
        });
      }

      // Read current LC details
      const lcResult = await fabricService.queryChaincode('ReadLC', [lcID]);
      if (!lcResult.success || !lcResult.data) {
        return res.status(404).json({
          success: false,
          error: { code: 'LC_NOT_FOUND', message: 'LC not found' },
          timestamp: new Date().toISOString()
        });
      }

      const lc = lcResult.data;
      const transferId = `TRANS-${lcID}-${Date.now()}`;

      // Record transfer in database
      const { DatabaseService } = await import('../services/databaseService');
      const db = DatabaseService.getInstance();

      await db.run(`
        INSERT INTO lc_transfers (
          transfer_id, lc_id, original_beneficiary, new_beneficiary,
          new_beneficiary_bank, transfer_type, transfer_amount,
          original_amount, transfer_reason, transfer_date,
          transferred_by, consent_confirmed, terms_and_conditions,
          status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP)
      `, [
        transferId,
        lcID,
        originalBeneficiary,
        newBeneficiary,
        newBeneficiaryBank,
        transferType,
        transferAmount,
        lc.Amount || lc.amount,
        transferReason,
        new Date().toISOString(),
        user.username,
        originalBeneficiaryConsent,
        termsAndConditions || 'All original LC terms apply to second beneficiary',
        'TRANSFERRED'
      ]);

      // Update LC on blockchain (optional - depends on chaincode support)
      try {
        await fabricService.invokeChaincode('TransferLC', [
          lcID,
          transferId,
          originalBeneficiary,
          newBeneficiary,
          newBeneficiaryBank,
          transferType,
          transferAmount.toString(),
          transferReason
        ]);
      } catch (chaincodeError) {
        logger.warn('[BANKING] Chaincode TransferLC not available, using database only');
      }

      logger.info(`✅ [BANKING] LC ${lcID} transferred successfully: ${transferId}`);

      res.json({
        success: true,
        data: {
          transferId,
          lcId: lcID,
          originalBeneficiary,
          newBeneficiary,
          transferType,
          transferAmount,
          status: 'TRANSFERRED',
          transferDate: new Date().toISOString()
        },
        message: 'LC transferred to second beneficiary successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('[BANKING] Error transferring LC:', error);
      res.status(500).json({
        success: false,
        error: { code: 'TRANSFER_FAILED', message: 'Failed to transfer LC' },
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * POST /api/v1/banking/lc/:lcID/deferred-payment/record
 * Record deferred payment acceptance (Usance LC)
 * Payment deferred to future date (e.g., 90 days after B/L date)
 */
router.post('/lc/:lcID/deferred-payment/record',
  authMiddleware,
  requireRole(['BANKS', 'BANK_ADMIN']),
  [
    param('lcID').notEmpty().withMessage('LC ID is required'),
    body('documentPresentationDate').notEmpty().withMessage('Document presentation date is required'),
    body('maturityDate').notEmpty().withMessage('Maturity date is required'),
    body('deferredAmount').isNumeric().withMessage('Deferred amount must be numeric'),
    body('deferredDays').isInt({ min: 1 }).withMessage('Deferred days must be positive integer'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { lcID } = req.params;
      const {
        documentPresentationDate,
        maturityDate,
        deferredAmount,
        deferredDays,
        acceptanceBy,
        acceptanceDate,
        interest,
        totalPayable
      } = req.body;
      const user = (req as any).user;

      logger.info(`[BANKING] Recording deferred payment for LC ${lcID}`);

      const deferredPaymentId = `DEF-${lcID}-${Date.now()}`;

      // Calculate interest if not provided
      const calculatedInterest = interest || (deferredAmount * 0.05 * deferredDays / 365);
      const calculatedTotal = totalPayable || (parseFloat(deferredAmount) + calculatedInterest);

      // Store in database
      const { DatabaseService } = await import('../services/databaseService');
      const db = DatabaseService.getInstance();

      await db.run(`
        INSERT INTO deferred_payments (
          deferred_payment_id, lc_id, document_presentation_date,
          maturity_date, deferred_days, deferred_amount, interest_amount,
          total_payable, acceptance_by, acceptance_date, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
      `, [
        deferredPaymentId,
        lcID,
        documentPresentationDate,
        maturityDate,
        deferredDays,
        deferredAmount,
        calculatedInterest,
        calculatedTotal,
        acceptanceBy || user.username,
        acceptanceDate || new Date().toISOString(),
        'ACCEPTED'
      ]);

      logger.info(`✅ [BANKING] Deferred payment recorded: ${deferredPaymentId}`);

      res.json({
        success: true,
        data: {
          deferredPaymentId,
          lcId: lcID,
          documentPresentationDate,
          maturityDate,
          deferredDays,
          deferredAmount,
          interestAmount: calculatedInterest,
          totalPayable: calculatedTotal,
          status: 'ACCEPTED',
          acceptanceDate: acceptanceDate || new Date().toISOString()
        },
        message: 'Deferred payment recorded successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('[BANKING] Error recording deferred payment:', error);
      res.status(500).json({
        success: false,
        error: { code: 'DEFERRED_PAYMENT_FAILED', message: 'Failed to record deferred payment' },
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * POST /api/v1/banking/lc/:lcID/acceptance-financing
 * Process acceptance financing (negotiation/discounting)
 * Bank advances payment to beneficiary at discount before maturity
 */
router.post('/lc/:lcID/acceptance-financing',
  authMiddleware,
  requireRole(['BANKS', 'BANK_ADMIN']),
  [
    param('lcID').notEmpty().withMessage('LC ID is required'),
    body('financingAmount').isNumeric().withMessage('Financing amount must be numeric'),
    body('discountRate').isFloat({ min: 0, max: 100 }).withMessage('Discount rate must be between 0 and 100'),
    body('financingPeriod').isInt({ min: 1 }).withMessage('Financing period must be positive integer'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { lcID } = req.params;
      const {
        financingAmount,
        discountRate,
        financingPeriod,
        beneficiary,
        requestDate,
        maturityDate,
        terms
      } = req.body;
      const user = (req as any).user;

      logger.info(`[BANKING] Processing acceptance financing for LC ${lcID}`);

      const financingId = `FIN-${lcID}-${Date.now()}`;

      // Calculate discount and net amount
      const discountAmount = (parseFloat(financingAmount) * parseFloat(discountRate) * financingPeriod) / (365 * 100);
      const netAmount = parseFloat(financingAmount) - discountAmount;
      const totalCost = parseFloat(financingAmount) + discountAmount; // Total cost includes discount amount (bank's fee)

      // Store in database
      const { DatabaseService } = await import('../services/databaseService');
      const db = DatabaseService.getInstance();

      await db.run(`
        INSERT INTO acceptance_financing (
          financing_id, lc_id, financing_amount, discount_rate,
          discount_amount, net_amount, financing_period, beneficiary,
          request_date, maturity_date, terms, approved_by,
          approval_date, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP)
      `, [
        financingId,
        lcID,
        financingAmount,
        discountRate,
        discountAmount,
        netAmount,
        financingPeriod,
        beneficiary,
        requestDate || new Date().toISOString(),
        maturityDate,
        terms || 'Beneficiary requests early payment at discount',
        user.username,
        new Date().toISOString(),
        'APPROVED'
      ]);

      logger.info(`✅ [BANKING] Acceptance financing approved: ${financingId}`);

      res.json({
        success: true,
        data: {
          financingId,
          lcId: lcID,
          financingAmount,
          discountRate,
          discountAmount,
          netAmount,
          totalCost, // Total cost equals financing amount plus discount (bank's fee)
          financingPeriod,
          beneficiary,
          status: 'APPROVED',
          approvalDate: new Date().toISOString(),
          maturityDate
        },
        message: 'Acceptance financing approved successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('[BANKING] Error processing acceptance financing:', error);
      res.status(500).json({
        success: false,
        error: { code: 'FINANCING_FAILED', message: 'Failed to process acceptance financing' },
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * POST /api/v1/banking/payment/:paymentID/apply-forex
 * Apply forex conversion rate to payment
 * Used when settling payment in different currency
 */
router.post('/payment/:paymentID/apply-forex',
  authMiddleware,
  requireRole(['BANKS', 'BANK_ADMIN']),
  [
    param('paymentID').notEmpty().withMessage('Payment ID is required'),
    body('paymentAmount').isNumeric().withMessage('Payment amount must be numeric'),
    body('currency').notEmpty().withMessage('Source currency is required'),
    body('targetCurrency').notEmpty().withMessage('Target currency is required'),
    body('forexRate').isFloat({ min: 0 }).withMessage('Forex rate must be positive number'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { paymentID } = req.params;
      const {
        paymentAmount,
        currency,
        targetCurrency,
        forexRate,
        conversionType,
        rateDate,
        rateSource,
        conversionReference
      } = req.body;
      const user = (req as any).user;

      logger.info(`[BANKING] Applying forex rate to payment ${paymentID}`);

      const convertedAmount = parseFloat(paymentAmount) * parseFloat(forexRate);
      const conversionId = conversionReference || `FX-CONV-${Date.now()}`;

      // Store conversion record
      const { DatabaseService } = await import('../services/databaseService');
      const db = DatabaseService.getInstance();

      await db.run(`
        INSERT INTO forex_conversions (
          conversion_id, payment_id, source_amount, source_currency,
          target_currency, forex_rate, converted_amount, rate_date,
          rate_source, converted_by, conversion_date, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
      `, [
        conversionId,
        paymentID,
        paymentAmount,
        currency,
        targetCurrency,
        forexRate,
        convertedAmount,
        rateDate || new Date().toISOString(),
        rateSource || 'NBE Official Rate',
        user.username,
        new Date().toISOString()
      ]);

      logger.info(`✅ [BANKING] Forex conversion applied: ${currency} ${paymentAmount} = ${targetCurrency} ${convertedAmount}`);

      res.json({
        success: true,
        data: {
          conversionId,
          paymentId: paymentID,
          sourceAmount: paymentAmount,
          sourceCurrency: currency,
          targetCurrency,
          forexRate,
          convertedAmount,
          conversionType: conversionType || 'SPOT',
          rateDate: rateDate || new Date().toISOString(),
          rateSource: rateSource || 'NBE Official Rate'
        },
        message: 'Forex rate applied to payment successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('[BANKING] Error applying forex rate:', error);
      res.status(500).json({
        success: false,
        error: { code: 'FOREX_CONVERSION_FAILED', message: 'Failed to apply forex rate' },
        timestamp: new Date().toISOString()
      });
    }
  }
);

