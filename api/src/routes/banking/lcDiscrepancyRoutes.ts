// Ethiopian Coffee Export Consortium Blockchain System (CECBS)
// Banking API Routes - LC Discrepancy Management

import express, { Request, Response } from 'express';
import { body, param } from 'express-validator';
import { FabricService } from '../../services/fabricService';
import { DatabaseService } from '../../services/databaseService';
import notificationService from '../../services/notificationService';
import { logger } from '../../utils/logger';
import { logAuditBestEffort } from '../../utils/auditBestEffort';
import { validateRequest } from '../../middleware/validation';
import { authMiddleware } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';

const router = express.Router();
const fabricService = FabricService.getInstance();
const dbService = DatabaseService.getInstance();

// F-8: a discrepancy that is no longer OPEN (already resolved/waived)
// or does not exist is a client state error, not a 500. The chaincode
// gates both ResolveLCDiscrepancy and WaiveLCDiscrepancy on status OPEN
// (chaincodes/coffee/banking.go: "discrepancy %s is not open" /
// "discrepancy %s not found in LC %s"), so map its text. A Postgres
// pre-check gives the same answer without a chain round-trip when the
// mirror row exists; when it does not, the ledger decides (PG mirrors
// are best-effort and may lag, so a missing row is never a 404 here).
async function getDiscrepancyPgStatus(lcId: string, discrepancyId: string): Promise<string | undefined> {
  try {
    const row = await dbService.get(
      `SELECT status FROM lc_discrepancies WHERE lc_id = $1 AND discrepancy_id = $2`,
      [lcId, discrepancyId]
    );
    return row?.status;
  } catch (pgErr: any) {
    logger.warn(`[BANKING] Postgres discrepancy lookup failed for ${lcId} / ${discrepancyId}:`, pgErr?.message);
    return undefined;
  }
}

function mapDiscrepancyChainError(error: string | undefined): { status: number; message: string } | null {
  const msg = error || '';
  if (/is not open/i.test(msg)) {
    return { status: 400, message: msg || 'Discrepancy is not open' };
  }
  if (/not found|does not exist/i.test(msg)) {
    return { status: 404, message: msg || 'Discrepancy not found' };
  }
  return null;
}

/**
 * GET /api/v1/banking/lc/discrepancies/pending — Get all LCs with unresolved discrepancies
 */
router.get('/discrepancies/pending', authMiddleware, async (req: Request, res: Response) => {
  try {
    logger.info('[BANKING] 🔍 Fetching LCs with pending discrepancies');

    const result = await fabricService.evaluateTransaction('QueryLCsWithDiscrepancies');

    if (!result.success) {
      logger.error(`[BANKING] ❌ Failed to fetch LCs: ${result.error}`);
      return res.status(500).json({ 
        success: false, 
        error: result.error 
      });
    }

    const lcs = result.data || [];

    res.json({
      success: true,
      data: lcs,
      count: lcs.length,
      source: 'blockchain'
    });
  } catch (error: any) {
    logger.error('[BANKING] ❌ Error fetching LCs:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * GET /api/v1/banking/lc/:lcId/discrepancies — Get all discrepancies for an LC
 */
router.get('/:lcId/discrepancies', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { lcId } = req.params;
    logger.info(`[BANKING] 🔍 Fetching discrepancies for LC: ${lcId}`);

    const result = await fabricService.evaluateTransaction('GetLCDiscrepancies', lcId);

    if (!result.success) {
      logger.error(`[BANKING] ❌ Failed to fetch discrepancies: ${result.error}`);
      return res.status(500).json({ 
        success: false, 
        error: result.error 
      });
    }

    const discrepancies = result.data || [];

    res.json({
      success: true,
      data: discrepancies,
      count: discrepancies.length,
      source: 'blockchain'
    });
  } catch (error: any) {
    logger.error('[BANKING] ❌ Error fetching discrepancies:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * POST /api/v1/banking/lc/:lcId/discrepancy/report — Report LC discrepancy
 */
router.post('/:lcId/discrepancy/report', authMiddleware, requireRole(['BANKS', 'BANK_ADMIN']), [
  param('lcId').notEmpty(),
  body('discrepancyId').isString().trim().notEmpty(),
  body('discrepancyType').isString().trim().notEmpty(),
  body('severity').isIn(['MINOR', 'MAJOR', 'CRITICAL']),
  body('affectedDocument').isString().trim().notEmpty(),
  body('description').isString().trim().isLength({ min: 10, max: 500 }),
], validateRequest, async (req: Request, res: Response) => {
  try {
    const { lcId } = req.params;
    const { discrepancyId, discrepancyType, severity, affectedDocument, description, affectedClauses, recommendedAction } = req.body;
    const user = (req as any).user;

    logger.info(`[BANKING] ⚠️  Reporting LC discrepancy: ${lcId} / ${discrepancyId}`);

    await fabricService.connectAsOrg('BanksMSP');
    const result = await fabricService.submitTransaction('ReportLCDiscrepancy',
      lcId,
      discrepancyId,
      discrepancyType,
      severity,
      affectedDocument,
      description,
      affectedClauses || '',
      recommendedAction || ''
    );

    if (!result.success) {
      logger.error(`[BANKING] ❌ Failed to report discrepancy: ${result.error}`);
      return res.status(500).json({ 
        success: false, 
        error: result.error 
      });
    }

    try {
      await dbService.run(
        `INSERT INTO lc_discrepancies (
           discrepancy_id, lc_id, discrepancy_type, severity, document, issue,
           affected_clauses, recommended_action, status, reported_by, reported_by_msp,
           reported_date, blockchain_tx_id, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'OPEN',$9,'BanksMSP',CURRENT_TIMESTAMP,$10,CURRENT_TIMESTAMP)
         ON CONFLICT (discrepancy_id) DO UPDATE SET
           lc_id = EXCLUDED.lc_id, discrepancy_type = EXCLUDED.discrepancy_type,
           severity = EXCLUDED.severity, document = EXCLUDED.document,
           issue = EXCLUDED.issue, affected_clauses = EXCLUDED.affected_clauses,
           recommended_action = EXCLUDED.recommended_action,
           status = 'OPEN', resolution = NULL, reported_by = EXCLUDED.reported_by,
           reported_by_msp = EXCLUDED.reported_by_msp, reported_date = EXCLUDED.reported_date,
           blockchain_tx_id = EXCLUDED.blockchain_tx_id, updated_at = CURRENT_TIMESTAMP`,
        [discrepancyId, lcId, discrepancyType, severity, affectedDocument, description, affectedClauses || '', recommendedAction || '', user?.username || user?.sub || 'Bank Officer', result.transactionId]
      );
    } catch (syncError) {
      logger.warn(`Failed to sync discrepancy ${discrepancyId} to PostgreSQL`, syncError);
    }

    logger.info(`[BANKING] ✅ Discrepancy reported: ${discrepancyId}`);
    await logAuditBestEffort(req, {
      entityType: 'LC_DISCREPANCY',
      entityId: discrepancyId,
      action: 'REPORT',
      blockchainTxId: result.transactionId || undefined,
      metadata: { lcId, blockchainTxId: result.transactionId || null },
    }, `lc ${lcId} discrepancy ${discrepancyId} report`);

    res.status(201).json({
      success: true,
      message: 'LC discrepancy reported successfully',
      data: { lcId, discrepancyId },
      txId: result.transactionId
    });
  } catch (error: any) {
    logger.error('[BANKING] ❌ Error reporting discrepancy:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * POST /api/v1/banking/lc/:lcId/discrepancy/:discrepancyId/resolve — Resolve discrepancy
 */
router.post('/:lcId/discrepancy/:discrepancyId/resolve', authMiddleware, requireRole(['BANKS', 'BANK_ADMIN']), [
  param('lcId').notEmpty(),
  param('discrepancyId').notEmpty(),
  body('resolution').isString().trim().isLength({ min: 1, max: 500 }),
], validateRequest, async (req: Request, res: Response) => {
  try {
    const { lcId, discrepancyId } = req.params;
    const { resolution } = req.body;
    const user = (req as any).user;

    logger.info(`[BANKING] ✅ Resolving LC discrepancy: ${lcId} / ${discrepancyId}`);

    const pgStatus = await getDiscrepancyPgStatus(lcId, discrepancyId);
    if (pgStatus && pgStatus !== 'OPEN') {
      return res.status(400).json({
        success: false,
        error: `Discrepancy ${discrepancyId} is not open (current status: ${pgStatus})`
      });
    }

    await fabricService.connectAsOrg('BanksMSP');
    const result = await fabricService.submitTransaction('ResolveLCDiscrepancy',
      lcId,
      discrepancyId,
      resolution
    );

    if (!result.success) {
      logger.error(`[BANKING] ❌ Failed to resolve discrepancy: ${result.error}`);
      const mapped = mapDiscrepancyChainError(result.error);
      if (mapped) {
        return res.status(mapped.status).json({
          success: false,
          error: mapped.message
        });
      }
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    try {
      await dbService.run(
        `UPDATE lc_discrepancies
         SET status = 'RESOLVED', resolution = $1, resolved_by = $2,
             resolved_by_msp = 'BanksMSP', resolved_date = CURRENT_TIMESTAMP,
             blockchain_tx_id = $3, updated_at = CURRENT_TIMESTAMP
         WHERE lc_id = $4 AND discrepancy_id = $5`,
        [resolution, user?.username || user?.sub || 'Bank Officer', result.transactionId, lcId, discrepancyId]
      );
    } catch (syncError) {
      logger.warn(`Failed to sync discrepancy resolution ${discrepancyId} to PostgreSQL`, syncError);
    }

    logger.info(`[BANKING] ✅ Discrepancy resolved: ${discrepancyId}`);
    await logAuditBestEffort(req, {
      entityType: 'LC_DISCREPANCY',
      entityId: discrepancyId,
      action: 'RESOLVE',
      blockchainTxId: result.transactionId || undefined,
      metadata: { lcId, blockchainTxId: result.transactionId || null },
    }, `lc ${lcId} discrepancy ${discrepancyId} resolve`);

    res.json({
      success: true,
      message: 'LC discrepancy resolved successfully',
      txId: result.transactionId
    });
  } catch (error: any) {
    logger.error('[BANKING] ❌ Error resolving discrepancy:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * POST /api/v1/banking/lc/:lcId/discrepancy/:discrepancyId/waive — Waive discrepancy
 */
router.post('/:lcId/discrepancy/:discrepancyId/waive', authMiddleware, requireRole(['BANKS', 'BANK_ADMIN']), [
  param('lcId').notEmpty(),
  param('discrepancyId').notEmpty(),
  body('waiverReason').isString().trim().isLength({ min: 1, max: 500 }),
], validateRequest, async (req: Request, res: Response) => {
  try {
    const { lcId, discrepancyId } = req.params;
    const { waiverReason } = req.body;
    const user = (req as any).user;

    logger.info(`[BANKING] 📋 Waiving LC discrepancy: ${lcId} / ${discrepancyId}`);

    const pgStatus = await getDiscrepancyPgStatus(lcId, discrepancyId);
    if (pgStatus && pgStatus !== 'OPEN') {
      return res.status(400).json({
        success: false,
        error: `Discrepancy ${discrepancyId} is not open (current status: ${pgStatus})`
      });
    }

    await fabricService.connectAsOrg('BanksMSP');
    const result = await fabricService.submitTransaction('WaiveLCDiscrepancy',
      lcId,
      discrepancyId,
      waiverReason
    );

    if (!result.success) {
      logger.error(`[BANKING] ❌ Failed to waive discrepancy: ${result.error}`);
      const mapped = mapDiscrepancyChainError(result.error);
      if (mapped) {
        return res.status(mapped.status).json({
          success: false,
          error: mapped.message
        });
      }
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    try {
      await dbService.run(
        `UPDATE lc_discrepancies
         SET status = 'WAIVED', resolution = $1, resolved_by = $2,
             resolved_by_msp = 'BanksMSP', resolved_date = CURRENT_TIMESTAMP,
             blockchain_tx_id = $3, updated_at = CURRENT_TIMESTAMP
         WHERE lc_id = $4 AND discrepancy_id = $5`,
        [waiverReason, user?.username || user?.sub || 'Bank Officer', result.transactionId, lcId, discrepancyId]
      );
    } catch (syncError) {
      logger.warn(`Failed to sync discrepancy waiver ${discrepancyId} to PostgreSQL`, syncError);
    }

    logger.info(`[BANKING] ✅ Discrepancy waived: ${discrepancyId}`);
    await logAuditBestEffort(req, {
      entityType: 'LC_DISCREPANCY',
      entityId: discrepancyId,
      action: 'WAIVE',
      blockchainTxId: result.transactionId || undefined,
      metadata: { lcId, blockchainTxId: result.transactionId || null },
    }, `lc ${lcId} discrepancy ${discrepancyId} waive`);

    res.json({
      success: true,
      message: 'LC discrepancy waived successfully',
      txId: result.transactionId
    });
  } catch (error: any) {
    logger.error('[BANKING] ❌ Error waiving discrepancy:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * POST /api/v1/banking/lc/:lcId/documents/reject — Reject LC documents
 */
router.post('/:lcId/documents/reject', authMiddleware, requireRole(['BANKS', 'BANK_ADMIN']), [
  param('lcId').notEmpty(),
  body('rejectionReason').isString().trim().isLength({ min: 10, max: 500 }),
], validateRequest, async (req: Request, res: Response) => {
  try {
    const { lcId } = req.params;
    const { rejectionReason } = req.body;
    const user = (req as any).user;

    logger.info(`[BANKING] ❌ Rejecting LC documents: ${lcId}`);

    await fabricService.connectAsOrg('BanksMSP');
    const result = await fabricService.submitTransaction('RejectLCDocuments',
      lcId,
      rejectionReason
    );

    if (!result.success) {
      logger.error(`[BANKING] ❌ Failed to reject documents: ${result.error}`);
      return res.status(500).json({ 
        success: false, 
        error: result.error 
      });
    }

    logger.info(`[BANKING] ✅ LC documents rejected: ${lcId}`);
    await logAuditBestEffort(req, {
      entityType: 'LC',
      entityId: lcId,
      action: 'REJECT_DOCUMENTS',
      blockchainTxId: result.transactionId || undefined,
      metadata: { blockchainTxId: result.transactionId || null },
    }, `lc ${lcId} reject-documents`);

    try {
      await dbService.run(
        `UPDATE letters_of_credit
         SET status = $1, document_rejection_reason = $2, document_rejected_by = $3,
             document_rejected_by_msp = $4, document_rejection_date = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE lc_id = $5`,
        ['EXPIRED', String(rejectionReason).trim(), user?.username || user?.sub || 'Bank Officer', 'BanksMSP', lcId]
      );
    } catch (syncError) {
      logger.warn(`Failed to sync document rejection for LC ${lcId} to PostgreSQL`, syncError);
    }

    await notificationService.emitWorkflowEvent({
      type: 'lc_documents_rejected',
      title: `Letter of Credit ${lcId} documents rejected`,
      message: `Letter of Credit ${lcId} documents were rejected: ${rejectionReason}`,
      entityType: 'lc', entityId: lcId, severity: 'warning',
      roles: ['BANKS'], lcId,
      actionUrl: '/portals/exporter?tab=contracts',
      actionUrls: { BANKS: '/portals/banks?tab=contracts' },
    });

    res.json({
      success: true,
      message: 'LC documents rejected successfully',
      txId: result.transactionId
    });
  } catch (error: any) {
    logger.error('[BANKING] ❌ Error rejecting documents:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

export default router;
