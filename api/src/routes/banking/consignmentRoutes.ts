// Ethiopian Coffee Export Consortium Blockchain System (CECBS)
// Banking API Routes - Consignment Export Permits (CBE Section 3.2.iv)

import express, { Request, Response } from 'express';
import { body, param } from 'express-validator';
import { FabricService } from '../../services/fabricService';
import { CouchDBDirectService } from '../../services/couchDBDirectService';
import { logger } from '../../utils/logger';
import { logAuditBestEffort } from '../../utils/auditBestEffort';
import { validateRequest } from '../../middleware/validation';
import { authMiddleware } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';

const router = express.Router();
const fabricService = FabricService.getInstance();

/**
 * POST /api/v1/banking/consignment/register
 * Issue consignment export permit (limited commodities only: Fruits, Flowers, Meat)
 */
router.post('/register',
  authMiddleware,
  requireRole(['BANKS', 'BANK_ADMIN']),
  [
    body('consignmentID').notEmpty().withMessage('Consignment ID is required'),
    body('exporterID').notEmpty().withMessage('Exporter ID is required'),
    body('commodityType').isIn(['FRUITS', 'FLOWERS', 'MEAT'])
      .withMessage('Commodity type must be FRUITS, FLOWERS, or MEAT'),
    body('description').notEmpty().withMessage('Description is required'),
    body('buyerName').notEmpty().withMessage('Buyer name is required'),
    body('buyerAddress').notEmpty().withMessage('Buyer address is required'),
    body('buyerCountry').notEmpty().withMessage('Buyer country is required'),
    body('permitAmount').isFloat({ gt: 0 }).withMessage('Permit amount must be positive'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const {
        consignmentID, exporterID, commodityType, description, buyerName,
        buyerAddress, buyerCountry, permitAmount, currency, permitNumber
      } = req.body;
      const user = (req as any).user;

      const permitID = `PERMIT-${consignmentID}`;
      const result = await fabricService.invokeChaincode('IssueConsignmentPermit', [
        consignmentID, permitID, permitNumber || `CP-${Date.now()}`,
        exporterID, commodityType, description, buyerCountry,
        buyerName, buyerAddress, permitAmount.toString(),
        currency || 'USD', user?.org || 'BANK'
      ]);

      if (result.success) {
        logger.info(`✅ Consignment permit issued: ${consignmentID} (${commodityType})`);
        await logAuditBestEffort(req, {
          entityType: 'CONSIGNMENT',
          entityId: consignmentID,
          action: 'ISSUE_PERMIT',
          blockchainTxId: result.txId || undefined,
          metadata: { commodityType, blockchainTxId: result.txId || null },
        }, `consignment ${consignmentID} register`);

        res.status(201).json({
          success: true,
          data: result.data,
          txId: result.txId,
          message: 'Consignment permit issued successfully',
          warning: 'Settlement due within 90 days per CBE Section 3.2.iv',
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(400).json({
          success: false,
          error: {
            code: 'CONSIGNMENT_REGISTRATION_FAILED',
            message: result.error || 'Failed to register consignment',
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error: any) {
      logger.error('Error registering consignment:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message || 'Internal server error',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * PUT /api/v1/banking/consignment/:consignmentID/status
 * Update consignment status
 */
router.put('/:consignmentID/status',
  authMiddleware,
  requireRole(['BANKS', 'BANK_ADMIN']),
  [
    param('consignmentID').notEmpty().withMessage('Consignment ID is required'),
    body('status').isIn(['PERMITTED', 'SHIPPED', 'SOLD', 'SETTLED', 'OUTSTANDING'])
      .withMessage('Invalid consignment status'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { consignmentID } = req.params;
      const { status, notes } = req.body;

      if (status !== 'SHIPPED') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'CONSIGNMENT_STATUS_UNSUPPORTED',
            message: `Consignment status '${status}' has no chaincode transition (the ledger state machine is PERMIT_ISSUED -> SHIPPED -> PARTIAL -> SETTLED); only SHIPPED is supported here`,
          },
          timestamp: new Date().toISOString(),
        });
      }
      const readResult = await fabricService.queryChaincode('ReadConsignment', [consignmentID]);
      if (!readResult.success || !readResult.data) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: readResult.error || 'Consignment not found' },
          timestamp: new Date().toISOString(),
        });
      }
      const shippedValue = Number(readResult.data.permitAmount);
      if (!Number.isFinite(shippedValue) || shippedValue <= 0) {
        return res.status(400).json({
          success: false,
          error: { code: 'CONSIGNMENT_STATUS_UPDATE_FAILED', message: 'Consignment has no permit amount to ship' },
          timestamp: new Date().toISOString(),
        });
      }
      const result = await fabricService.invokeChaincode('RecordConsignmentShipment', [
        consignmentID, shippedValue.toString()
      ]);

      if (result.success) {
        logger.info(`Consignment status updated: ${consignmentID} → ${status}`);
        await logAuditBestEffort(req, {
          entityType: 'CONSIGNMENT',
          entityId: consignmentID,
          action: 'UPDATE_STATUS',
          newValue: status,
          blockchainTxId: result.txId || undefined,
          metadata: { status, notes, blockchainTxId: result.txId || null },
        }, `consignment ${consignmentID} status ${status}`);

        res.json({
          success: true,
          data: result.data,
          txId: result.txId,
          message: `Consignment status updated to ${status}`,
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(400).json({
          success: false,
          error: {
            code: 'CONSIGNMENT_STATUS_UPDATE_FAILED',
            message: result.error || 'Failed to update consignment status',
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error: any) {
      logger.error('Error updating consignment status:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message || 'Internal server error',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/v1/banking/consignment/:consignmentID/payment
 * Record payment received from consignment sale
 */
router.post('/:consignmentID/payment',
  authMiddleware,
  requireRole(['BANKS', 'BANK_ADMIN']),
  [
    param('consignmentID').notEmpty().withMessage('Consignment ID is required'),
    body('amountReceived').isFloat({ min: 0 }).withMessage('Amount must be positive'),
    body('paymentReference').notEmpty().withMessage('Payment reference is required'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { consignmentID } = req.params;
      const { amountReceived, paymentReference } = req.body;
      const user = (req as any).user;

      const result = await fabricService.invokeChaincode('RecordPartialPayment', [
        consignmentID, amountReceived.toString(), paymentReference, user?.username || 'bank_admin'
      ]);

      if (result.success) {
        logger.info(`✅ Consignment payment recorded: ${consignmentID} (${amountReceived})`);
        await logAuditBestEffort(req, {
          entityType: 'CONSIGNMENT',
          entityId: consignmentID,
          action: 'RECORD_PAYMENT',
          blockchainTxId: result.txId || undefined,
          metadata: { amountReceived, paymentReference, blockchainTxId: result.txId || null },
        }, `consignment ${consignmentID} payment`);

        res.json({
          success: true,
          data: result.data,
          txId: result.txId,
          message: 'Consignment payment recorded successfully',
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(400).json({
          success: false,
          error: {
            code: 'CONSIGNMENT_PAYMENT_FAILED',
            message: result.error || 'Failed to record consignment payment',
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error: any) {
      logger.error('Error recording consignment payment:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message || 'Internal server error',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /api/v1/banking/consignment/exporter/:exporterID
 * Get all consignments for exporter
 */
router.get('/exporter/:exporterID',
  authMiddleware,
  [
    param('exporterID').notEmpty().withMessage('Exporter ID is required'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { exporterID } = req.params;

      const result = await fabricService.queryChaincode('QueryConsignmentsByExporter', [exporterID]);

      if (result.success) {
        res.json({
          success: true,
          data: result.data || [],
          count: (result.data || []).length,
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            code: 'QUERY_FAILED',
            message: result.error || 'Failed to retrieve consignments',
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error: any) {
      logger.error('Error retrieving consignments:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message || 'Internal server error',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /api/v1/banking/consignment/outstanding
 * Get all consignments with outstanding balance
 */
router.get('/outstanding',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const couchDBService = new CouchDBDirectService();
      
      logger.info('[BANKING] 🔗 Fetching outstanding consignments from blockchain (CouchDB direct)...');
      
      const consignments = await couchDBService.queryOutstandingConsignments();
      
      logger.info(`[BANKING] ✅ Loaded ${consignments.length} outstanding consignments from blockchain (CouchDB direct)`);

      res.json({
        success: true,
        data: consignments || [],
        count: (consignments || []).length,
        warning: 'Outstanding consignments require settlement',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error('Error retrieving outstanding consignments:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message || 'Internal server error',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /api/v1/banking/consignment/:consignmentID
 * Get consignment details
 */
router.get('/:consignmentID',
  authMiddleware,
  [
    param('consignmentID').notEmpty().withMessage('Consignment ID is required'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { consignmentID } = req.params;

      const result = await fabricService.queryChaincode('ReadConsignment', [consignmentID]);

      if (result.success) {
        res.json({
          success: true,
          data: result.data,
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: result.error || 'Consignment not found',
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error: any) {
      logger.error('Error retrieving consignment:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message || 'Internal server error',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

export default router;
