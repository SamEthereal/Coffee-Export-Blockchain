// Ethiopian Coffee Export Consortium Blockchain System (CECBS)
// Banking API Routes - Documentary Collection (CAD)

import express, { Request, Response } from 'express';
import { body, param } from 'express-validator';
import { FabricService } from '../../services/fabricService';
import { logger } from '../../utils/logger';
import { logAuditBestEffort } from '../../utils/auditBestEffort';
import { validateRequest } from '../../middleware/validation';
import { authMiddleware } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validateBIC } from '../../utils/fieldValidation';

const router = express.Router();
const fabricService = FabricService.getInstance();

const bicValidator = (field: string, label: string) =>
  body(field)
    .notEmpty().withMessage(`${label} is required`).bail()
    .custom((value) => {
      const result = validateBIC(value, label);
      if (!result.valid) throw new Error(result.error || 'Invalid BIC');
      return true;
    });

/**
 * POST /api/v1/banking/cad - Register documentary collection
 */
router.post('/',
  authMiddleware,
  requireRole(['BANKS', 'BANK_ADMIN']),
  [
    body('collectionID').notEmpty().withMessage('Collection ID is required'),
    body('contractID').notEmpty().withMessage('Contract ID is required'),
    body('exporterID').notEmpty().withMessage('Exporter ID is required'),
    body('drawerName').notEmpty().withMessage('Drawer name is required'),
    body('draweeName').notEmpty().withMessage('Drawee name is required'),
    body('draweeAddress').notEmpty().withMessage('Drawee address is required'),
    body('amount').isNumeric().withMessage('Amount must be numeric'),
    body('currency').notEmpty().withMessage('Currency is required'),
    body('paymentTerm').isIn(['SIGHT', 'ACCEPTANCE']).withMessage('Payment term must be SIGHT or ACCEPTANCE'),
    body('remittingBank').notEmpty().withMessage('Remitting bank is required'),
    bicValidator('remittingBankBIC', 'Remitting bank BIC'),
    body('collectingBank').notEmpty().withMessage('Collecting bank is required'),
    bicValidator('collectingBankBIC', 'Collecting bank BIC'),
    body('documents').isArray().withMessage('Documents array is required'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const {
        collectionID, contractID, exporterID, drawerName, draweeName, draweeAddress,
        amount, currency, paymentTerm, acceptanceDays, remittingBank, remittingBankBIC,
        collectingBank, collectingBankBIC, instructions, documents
      } = req.body;

      const result = await fabricService.invokeChaincode('RegisterDocumentaryCollection', [
        collectionID, contractID, exporterID, drawerName, draweeName, draweeAddress,
        amount.toString(), currency, paymentTerm, (acceptanceDays || '0').toString(),
        remittingBank, remittingBankBIC, collectingBank, collectingBankBIC,
        instructions || 'Present documents directly to drawee',
        JSON.stringify(documents)
      ]);

      if (result.success) {
        logger.info(`✅ Documentary collection registered: ${collectionID} (${paymentTerm})`);
        await logAuditBestEffort(req, {
          entityType: 'CAD',
          entityId: collectionID,
          action: 'REGISTER',
          blockchainTxId: result.txId || undefined,
          metadata: { paymentTerm, blockchainTxId: result.txId || null },
        }, `cad ${collectionID} register`);

        res.status(201).json({
          success: true,
          data: result.data,
          txId: result.txId,
          message: 'Documentary collection registered successfully',
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(400).json({
          success: false,
          error: {
            code: 'CAD_REGISTRATION_FAILED',
            message: result.error || 'Failed to register documentary collection',
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error: any) {
      logger.error('Error registering documentary collection:', error);
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
 * PUT /api/v1/banking/cad/:collectionID/status
 * Update documentary collection status
 */
router.put('/:collectionID/status',
  authMiddleware,
  requireRole(['BANKS', 'BANK_ADMIN']),
  [
    param('collectionID').notEmpty().withMessage('Collection ID is required'),
    body('status').isIn(['SENT', 'FORWARDED', 'PRESENTED', 'ACCEPTED', 'PAID', 'REJECTED'])
      .withMessage('Invalid CAD status'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { collectionID } = req.params;
      const { status, notes } = req.body;

      const result = await fabricService.invokeChaincode('UpdateCADStatus', [
        collectionID, status, notes || ''
      ]);

      if (result.success) {
        logger.info(`CAD status updated: ${collectionID} → ${status}`);
        await logAuditBestEffort(req, {
          entityType: 'CAD',
          entityId: collectionID,
          action: 'UPDATE_STATUS',
          newValue: status,
          blockchainTxId: result.txId || undefined,
          metadata: { status, notes, blockchainTxId: result.txId || null },
        }, `cad ${collectionID} status ${status}`);

        res.json({
          success: true,
          data: result.data,
          txId: result.txId,
          message: `Documentary collection status updated to ${status}`,
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(400).json({
          success: false,
          error: {
            code: 'CAD_STATUS_UPDATE_FAILED',
            message: result.error || 'Failed to update CAD status',
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error: any) {
      logger.error('Error updating CAD status:', error);
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
 * POST /api/v1/banking/cad/:collectionID/payment
 * Record payment received for documentary collection
 */
router.post('/:collectionID/payment',
  authMiddleware,
  requireRole(['BANKS', 'BANK_ADMIN']),
  [
    param('collectionID').notEmpty().withMessage('Collection ID is required'),
    body('amountReceived').isFloat({ min: 0 }).withMessage('Amount must be positive'),
    body('paymentReference').notEmpty().withMessage('Payment reference is required'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { collectionID } = req.params;
      const { amountReceived, paymentReference } = req.body;

      const result = await fabricService.invokeChaincode('RecordCADPayment', [
        collectionID, paymentReference, amountReceived.toString()
      ]);

      if (result.success) {
        logger.info(`✅ CAD payment recorded: ${collectionID} (${amountReceived})`);
        await logAuditBestEffort(req, {
          entityType: 'CAD',
          entityId: collectionID,
          action: 'RECORD_PAYMENT',
          blockchainTxId: result.txId || undefined,
          metadata: { amountReceived, paymentReference, blockchainTxId: result.txId || null },
        }, `cad ${collectionID} payment`);

        res.json({
          success: true,
          data: result.data,
          txId: result.txId,
          message: 'CAD payment recorded successfully',
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(400).json({
          success: false,
          error: {
            code: 'CAD_PAYMENT_FAILED',
            message: result.error || 'Failed to record CAD payment',
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error: any) {
      logger.error('Error recording CAD payment:', error);
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
 * GET /api/v1/banking/cad/exporter/:exporterID
 * Get all documentary collections for exporter
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

      let result;
      if (exporterID === 'ALL') {
        result = await fabricService.queryChaincode('QueryAllCollections', []);
      } else {
        result = await fabricService.queryChaincode('QueryCollectionsByExporter', [exporterID]);
      }

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
            message: result.error || 'Failed to retrieve documentary collections',
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error: any) {
      logger.error('Error retrieving documentary collections:', error);
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
 * GET /api/v1/banking/cad/:collectionID
 * Get documentary collection details
 */
router.get('/:collectionID',
  authMiddleware,
  [
    param('collectionID').notEmpty().withMessage('Collection ID is required'),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { collectionID } = req.params;

      const result = await fabricService.queryChaincode('ReadDocumentaryCollection', [collectionID]);

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
            message: result.error || 'Documentary collection not found',
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error: any) {
      logger.error('Error retrieving documentary collection:', error);
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
