// Ethiopian Coffee Export Consortium Blockchain System (CECBS)
// Insurance Policy Management API Routes

import express from 'express';
import { FabricService } from '../services/fabricService';
import { logger } from '../utils/logger';
import { logAuditBestEffort } from '../utils/auditBestEffort';
import { validateRequest } from '../middleware/validation';
import { authMiddleware, requireRole } from '../middleware/auth';
import { body, param } from 'express-validator';

const router = express.Router();
const fabricService = FabricService.getInstance();

/**
 * @swagger
 * /api/v1/insurance/register:
 *   post:
 *     summary: Register insurance policy for shipment
 *     tags: [Insurance]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - policyNumber
 *               - shipmentID
 *               - insuranceCompany
 *               - coverageAmount
 */
router.post('/register',
  authMiddleware,
  requireRole('EXPORTER', 'BANKS', 'BANK_ADMIN'),
  [
    body('policyNumber').notEmpty().withMessage('Policy number is required'),
    body('shipmentID').notEmpty().withMessage('Shipment ID is required'),
    body('insuranceCompany').notEmpty().withMessage('Insurance company is required'),
    body('coverageAmount').isNumeric().withMessage('Coverage amount must be numeric'),
    body('currency').notEmpty().withMessage('Currency is required'),
    body('policyType').isIn(['MARINE_CARGO', 'ALL_RISK', 'WAREHOUSE_TO_WAREHOUSE', 'FPA']),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const {
        policyNumber,
        shipmentID,
        insuranceCompany,
        coverageAmount,
        currency,
        policyType,
        effectiveDate,
        expiryDate,
        beneficiary,
        coverageDetails,
        contractId: bodyContractId,
        quantity: bodyQuantity,
        vesselName,
        voyageNumber,
        containerNumber,
        portOfLoading,
        portOfDischarge,
        goodsDescription,
        incoterm,
      } = req.body;

      logger.info(`[INSURANCE] Registering policy: ${policyNumber} for shipment: ${shipmentID}`);

      // Bug (probe round, 2026-11-15): this route invoked
      // 'RegisterInsurancePolicy', which does not exist in the chaincode —
      // every register 400'd with 'Function RegisterInsurancePolicy not
      // found in contract CoffeeContract'. The chaincode's insurance
      // function is IssueInsuranceCertificate (insurance.go), which takes
      // the same core data (policy, shipment, insurer, value, currency,
      // cover) plus certificate fields. Map onto it: contractId/quantity
      // are read from the shipment when the caller does not supply them,
      // incoterm defaults to CIF (the chaincode only warns for non-CIF).
      let contractId = bodyContractId || '';
      let quantity = bodyQuantity != null ? String(bodyQuantity) : '';
      if (!contractId || !quantity) {
        const ship = await fabricService.queryChaincode('ReadShipment', [shipmentID]);
        const shipData: any = (ship as any)?.data || (ship as any);
        if (shipData) {
          if (!contractId && shipData.contractId) contractId = String(shipData.contractId);
          if (!quantity && shipData.quantity != null) quantity = String(shipData.quantity);
        }
      }
      if (!quantity) quantity = '0';
      const issuedBy = (req as any).user?.username || (req as any).user?.email || '';

      const result = await fabricService.invokeChaincode('IssueInsuranceCertificate', [
        policyNumber,
        shipmentID,
        contractId,
        policyNumber,
        insuranceCompany,
        coverageAmount.toString(),
        currency,
        policyType || 'MARINE_CARGO',
        vesselName || '',
        voyageNumber || '',
        containerNumber || '',
        portOfLoading || '',
        portOfDischarge || '',
        goodsDescription || 'Coffee',
        quantity,
        incoterm || 'CIF',
        beneficiary || '',
        issuedBy,
      ]);

      if (result.success) {
        logger.info(`✅ Insurance policy registered: ${policyNumber}`);
        // Audit: this chain move never wrote an audit_trail row.
        // Best-effort — a failed audit write must not fail the move.
        await logAuditBestEffort(req, {
          entityType: 'INSURANCE_POLICY',
          entityId: policyNumber,
          action: 'REGISTER',
          blockchainTxId: result.txId || undefined,
          metadata: { blockchainTxId: result.txId || null },
        }, `insurance ${policyNumber} register`);

        res.status(201).json({
          success: true,
          message: 'Insurance policy registered successfully',
          data: result.data,
          txId: result.txId,
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(400).json({
          success: false,
          error: {
            code: 'REGISTRATION_FAILED',
            message: result.error || 'Failed to register insurance policy',
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error: any) {
      logger.error('[INSURANCE] Error registering policy:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * @swagger
 * /api/v1/insurance/{policyNumber}:
 *   get:
 *     summary: Get insurance policy details
 *     tags: [Insurance]
 */
router.get('/:policyNumber',
  authMiddleware,
  [param('policyNumber').notEmpty()],
  validateRequest,
  async (req, res) => {
    try {
      const { policyNumber } = req.params;

      // 'ReadInsurancePolicy' does not exist in the chaincode either;
      // the read function is ReadInsuranceCertificate (insurance.go).
      const result = await fabricService.queryChaincode('ReadInsuranceCertificate', [policyNumber]);

      if (result.success) {
        res.json({
          success: true,
          data: result.data,
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Insurance policy not found' },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error: any) {
      logger.error('[INSURANCE] Error fetching policy:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * @swagger
 * /api/v1/insurance/{policyNumber}/claim:
 *   post:
 *     summary: File insurance claim
 *     tags: [Insurance]
 */
router.post('/:policyNumber/claim',
  authMiddleware,
  requireRole('EXPORTER', 'BANKS', 'BANK_ADMIN'),
  [
    param('policyNumber').notEmpty(),
    body('claimAmount').isNumeric().withMessage('Claim amount must be numeric'),
    body('claimReason').notEmpty().withMessage('Claim reason is required'),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { policyNumber } = req.params;
      const { claimAmount, claimReason, incidentDate, supportingDocuments } = req.body;

      logger.info(`[INSURANCE] Filing claim for policy: ${policyNumber}`);

      // 'FileInsuranceClaim' does not exist in the chaincode; the claim
      // function is RecordInsuranceClaim(insuranceID, claimReason,
      // claimAmount). It records no incident date or supporting
      // documents, so those are carried in the audit metadata instead.
      const result = await fabricService.invokeChaincode('RecordInsuranceClaim', [
        policyNumber,
        claimReason,
        claimAmount.toString(),
      ]);

      if (result.success) {
        logger.info(`✅ Insurance claim filed: ${policyNumber}`);
        // Audit: this chain move never wrote an audit_trail row.
        // Best-effort — a failed audit write must not fail the move.
        await logAuditBestEffort(req, {
          entityType: 'INSURANCE_POLICY',
          entityId: policyNumber,
          action: 'FILE_CLAIM',
          blockchainTxId: result.txId || undefined,
          metadata: {
            blockchainTxId: result.txId || null,
            claimAmount: claimAmount?.toString() || null,
            claimReason: claimReason || null,
            incidentDate: incidentDate || null,
            supportingDocuments: supportingDocuments || [],
          },
        }, `insurance ${policyNumber} claim`);

        res.json({
          success: true,
          message: 'Insurance claim filed successfully',
          data: result.data,
          txId: result.txId,
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(400).json({
          success: false,
          error: { code: 'CLAIM_FAILED', message: result.error },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error: any) {
      logger.error('[INSURANCE] Error filing claim:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * @swagger
 * /api/v1/insurance/shipment/{shipmentID}:
 *   get:
 *     summary: Get insurance policies for a shipment
 *     tags: [Insurance]
 */
router.get('/shipment/:shipmentID',
  authMiddleware,
  [param('shipmentID').notEmpty()],
  validateRequest,
  async (req, res) => {
    try {
      const { shipmentID } = req.params;

      // 'QueryInsuranceByShipment' does not exist in the chaincode; the
      // query is QueryInsuranceCertificatesByShipment (insurance.go).
      const result = await fabricService.queryChaincode('QueryInsuranceCertificatesByShipment', [shipmentID]);

      if (result.success) {
        res.json({
          success: true,
          data: result.data || [],
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'No insurance policies found for shipment' },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error: any) {
      logger.error('[INSURANCE] Error querying shipment insurance:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /api/v1/insurance
 * Get all insurance certificates/policies
 * @access Authenticated
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { status, exporterId, shipmentId } = req.query;
    
    logger.info('[INSURANCE] 📋 Fetching all insurance certificates...');
    
    const result = await fabricService.evaluateTransaction('QueryAllInsurancePolicies');
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: { code: 'QUERY_FAILED', message: result.error },
        timestamp: new Date().toISOString()
      });
    }
    
    let policies = result.data || [];
    
    // Apply filters if provided
    if (status) {
      policies = policies.filter((policy: any) => policy.status === status);
    }
    if (exporterId) {
      policies = policies.filter((policy: any) => policy.exporterID === exporterId);
    }
    if (shipmentId) {
      policies = policies.filter((policy: any) => policy.shipmentID === shipmentId);
    }
    
    logger.info(`[INSURANCE] ✅ Found ${policies.length} insurance policies`);
    
    res.json({
      success: true,
      data: policies,
      count: policies.length,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    logger.error('[INSURANCE] ❌ Error fetching policies:', error);
    res.status(500).json({
      success: false,
      error: { code: 'QUERY_FAILED', message: error.message },
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
