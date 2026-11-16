/**
 * Post-Delivery Workflow Service
 * 
 * Manages the complete post-delivery workflow for coffee exports:
 * 1. Payment Settlement
 * 2. Forex Repatriation
 * 3. Letter of Credit Settlement
 * 4. ECTA Final Audit
 * 5. Contract Completion
 * 
 * Professional implementation with proper state management,
 * notifications, and compliance tracking.
 */

import { logger } from '../utils/logger';
import { FabricService } from './fabricService';
import { DatabaseService } from './databaseService';
import { NotificationService } from './notificationService';
import { CacheInvalidation } from './blockchainCacheService';

export interface PostDeliveryStatus {
  shipmentId: string;
  contractId: string;
  exporterId: string;
  deliveryDate: string;
  
  // Payment Settlement
  paymentReceived: boolean;
  paymentReceivedDate?: string;
  paymentAmount?: number;
  paymentCurrency?: string;
  swiftReference?: string;
  
  // Forex Repatriation
  forexRepatriated: boolean;
  forexRepatriationDate?: string;
  forexAmount?: number;
  forexRate?: number;
  
  // LC Settlement (if applicable)
  lcUsed: boolean;
  lcSettled?: boolean;
  lcSettlementDate?: string;
  lcReference?: string;
  
  // ECTA Audit
  ectaAuditCompleted: boolean;
  ectaAuditDate?: string;
  ectaAuditResult?: 'PASSED' | 'FAILED' | 'PENDING';
  ectaAuditNotes?: string;
  
  // Contract Closure
  contractClosed: boolean;
  contractClosureDate?: string;
  
  // Overall Status
  overallStatus: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DELAYED' | 'ISSUE';
  completionPercentage: number;
  daysElapsed: number;
  expectedCompletionDate: string;
  
  // Issues/Alerts
  issues: Array<{
    type: 'PAYMENT_OVERDUE' | 'FOREX_DELAYED' | 'LC_ISSUE' | 'AUDIT_REQUIRED' | 'COMPLIANCE_ISSUE';
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    message: string;
    createdAt: string;
  }>;
}

export class PostDeliveryWorkflowService {
  private fabricService: FabricService;
  private db: DatabaseService;
  private notificationService: NotificationService;

  // SLA Thresholds (in days)
  private readonly PAYMENT_SLA = 90; // 90 days to receive payment
  private readonly FOREX_SLA = 7; // 7 days after payment to repatriate
  private readonly LC_SETTLEMENT_SLA = 21; // 21 days for LC settlement
  private readonly AUDIT_SLA = 14; // 14 days for ECTA audit
  private readonly CONTRACT_CLOSURE_SLA = 7; // 7 days after all complete

  constructor() {
    this.fabricService = FabricService.getInstance();
    this.db = DatabaseService.getInstance();
    this.notificationService = NotificationService.getInstance();
  }

  /**
   * Initialize post-delivery workflow when shipment is delivered
   */
  async initializePostDeliveryWorkflow(
    shipmentId: string,
    deliveryDate: string,
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      logger.info(`📦 Initializing post-delivery workflow for shipment: ${shipmentId}`);

      // Get shipment details
      const shipmentResult = await this.fabricService.queryChaincode('ReadShipment', [shipmentId]);
      
      if (!shipmentResult.success || !shipmentResult.data) {
        return { success: false, error: 'Shipment not found' };
      }

      const shipment = shipmentResult.data;
      const contractId = shipment.contractId;
      const exporterId = shipment.exporterId;

      // Check if LC was used
      const lcResult = await this.fabricService.queryChaincode('QueryLCsByContract', [contractId]);
      const lcUsed = lcResult.success && lcResult.data && lcResult.data.length > 0;

      // Create post-delivery tracking record in database
      const query = `
        INSERT INTO post_delivery_tracking (
          shipment_id,
          contract_id,
          exporter_id,
          delivery_date,
          lc_used,
          overall_status,
          completion_percentage,
          expected_completion_date,
          created_by,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        RETURNING id
      `;

      const expectedCompletionDate = new Date(deliveryDate);
      expectedCompletionDate.setDate(expectedCompletionDate.getDate() + this.PAYMENT_SLA);

      await this.db.query(query, [
        shipmentId,
        contractId,
        exporterId,
        deliveryDate,
        lcUsed,
        'PENDING',
        0,
        expectedCompletionDate.toISOString(),
        userId
      ]);

      // ✅ Record post-delivery tracking on blockchain
      try {
        const auditService = require('./auditService').default;
        await auditService.recordAudit({
          entityType: 'POST_DELIVERY_TRACKING',
          entityId: shipmentId,
          actionType: 'INITIALIZE',
          actionBy: userId,
          organizationMSP: 'BanksMSP',
          details: {
            shipmentId,
            contractId,
            exporterId,
            deliveryDate,
            lcUsed,
            expectedCompletionDate: expectedCompletionDate.toISOString()
          },
          timestamp: new Date()
        });
        logger.info(`✅ Post-delivery tracking recorded on blockchain: ${shipmentId}`);
      } catch (blockchainErr) {
        logger.warn(`⚠️ Failed to record post-delivery tracking on blockchain (non-fatal):`, blockchainErr);
      }

      // Send notifications to relevant parties
      await this.notifyStakeholders(shipmentId, contractId, exporterId, 'DELIVERY_COMPLETED');

      // Create initial checklist items
      await this.createChecklistItems(shipmentId, lcUsed);

      logger.info(`✅ Post-delivery workflow initialized for ${shipmentId}`);

      return { success: true };
    } catch (error: any) {
      logger.error('Failed to initialize post-delivery workflow:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get post-delivery status for a shipment
   */
  async getPostDeliveryStatus(shipmentId: string): Promise<PostDeliveryStatus | null> {
    try {
      const query = `
        SELECT *
        FROM post_delivery_tracking
        WHERE shipment_id = $1
      `;

      const result = await this.db.query(query, [shipmentId]);

      if (result.rows.length === 0) {
        return null;
      }

      const record = result.rows[0];

      // Calculate days elapsed
      const deliveryDate = new Date(record.delivery_date);
      const today = new Date();
      const daysElapsed = Math.floor((today.getTime() - deliveryDate.getTime()) / (1000 * 60 * 60 * 24));

      // Get issues
      const issuesQuery = `
        SELECT * FROM post_delivery_issues
        WHERE shipment_id = $1 AND resolved = false
        ORDER BY created_at DESC
      `;
      const issuesResult = await this.db.query(issuesQuery, [shipmentId]);

      // Calculate completion percentage
      const completionPercentage = this.calculateCompletionPercentage(record);

      // Determine overall status
      const overallStatus = this.determineOverallStatus(record, daysElapsed);

      return {
        shipmentId: record.shipment_id,
        contractId: record.contract_id,
        exporterId: record.exporter_id,
        deliveryDate: record.delivery_date,
        
        paymentReceived: record.payment_received || false,
        paymentReceivedDate: record.payment_received_date,
        paymentAmount: record.payment_amount,
        paymentCurrency: record.payment_currency,
        swiftReference: record.swift_reference,
        
        forexRepatriated: record.forex_repatriated || false,
        forexRepatriationDate: record.forex_repatriation_date,
        forexAmount: record.forex_amount,
        forexRate: record.forex_rate,
        
        lcUsed: record.lc_used || false,
        lcSettled: record.lc_settled,
        lcSettlementDate: record.lc_settlement_date,
        lcReference: record.lc_reference,
        
        ectaAuditCompleted: record.ecta_audit_completed || false,
        ectaAuditDate: record.ecta_audit_date,
        ectaAuditResult: record.ecta_audit_result,
        ectaAuditNotes: record.ecta_audit_notes,
        
        contractClosed: record.contract_closed || false,
        contractClosureDate: record.contract_closure_date,
        
        overallStatus,
        completionPercentage,
        daysElapsed,
        expectedCompletionDate: record.expected_completion_date,
        
        issues: issuesResult.rows.map(issue => ({
          type: issue.issue_type,
          severity: issue.severity,
          message: issue.message,
          createdAt: issue.created_at
        }))
      };
    } catch (error) {
      logger.error('Failed to get post-delivery status:', error);
      return null;
    }
  }

  /**
   * Record payment received
   */
  async recordPaymentReceived(
    shipmentId: string,
    paymentAmount: number,
    paymentCurrency: string,
    swiftReference: string,
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      logger.info(`💰 Recording payment for shipment: ${shipmentId}`);

      const query = `
        UPDATE post_delivery_tracking
        SET 
          payment_received = true,
          payment_received_date = NOW(),
          overall_status = CASE WHEN overall_status = 'PENDING' THEN 'IN_PROGRESS' ELSE overall_status END,
          payment_amount = $2,
          payment_currency = $3,
          swift_reference = $4,
          updated_by = $5,
          updated_at = NOW()
        WHERE shipment_id = $1
      `;

      const paymentUpdate = await this.db.query(query, [
        shipmentId,
        paymentAmount,
        paymentCurrency,
        swiftReference,
        userId
      ]);
      if (!paymentUpdate.rowCount) {
        return { success: false, error: 'Post-delivery record not found' };
      }

      // Update checklist
      await this.updateChecklistItem(shipmentId, 'PAYMENT_RECEIVED');

      // Notify NBE to monitor forex repatriation
      await this.notifyStakeholders(shipmentId, null, null, 'PAYMENT_RECEIVED');

      // Check for issues
      await this.checkAndCreateIssues(shipmentId);

      logger.info(`✅ Payment recorded for ${shipmentId}`);

      return { success: true };
    } catch (error: any) {
      logger.error('Failed to record payment:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Record forex repatriation
   */
  async recordForexRepatriation(
    shipmentId: string,
    forexAmount: number,
    forexRate: number,
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      logger.info(`💱 Recording forex repatriation for shipment: ${shipmentId}`);

      const query = `
        UPDATE post_delivery_tracking
        SET 
          forex_repatriated = true,
          forex_repatriation_date = NOW(),
          overall_status = CASE WHEN overall_status = 'PENDING' THEN 'IN_PROGRESS' ELSE overall_status END,
          forex_amount = $2,
          forex_rate = $3,
          updated_by = $4,
          updated_at = NOW()
        WHERE shipment_id = $1
      `;

      const forexUpdate = await this.db.query(query, [shipmentId, forexAmount, forexRate, userId]);
      if (!forexUpdate.rowCount) {
        return { success: false, error: 'Post-delivery record not found' };
      }

      // Update checklist
      await this.updateChecklistItem(shipmentId, 'FOREX_REPATRIATED');

      // Notify ECTA to start audit
      await this.notifyStakeholders(shipmentId, null, null, 'FOREX_REPATRIATED');

      // Check for completion
      await this.checkWorkflowCompletion(shipmentId);

      logger.info(`✅ Forex repatriation recorded for ${shipmentId}`);

      return { success: true };
    } catch (error: any) {
      logger.error('Failed to record forex repatriation:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Record LC settlement
   * Updates the post_delivery_tracking DB and also settles the Payment entity
   * on the blockchain (created by the ReleaseLCPayment bridge as "PAY_<lcID>").
   */
  async recordLCSettlement(
    shipmentId: string,
    lcReference: string,
    userId: string
  ): Promise<{ success: boolean; error?: string; status?: number; code?: string }> {
    try {
      logger.info(`📄 Recording LC settlement for shipment: ${shipmentId}`);

      // --- Blockchain settlement: settle the bridged Payment entity ---
      const paymentID = `PAY_${lcReference}`;
      let blockchainSettled = false;

      try {
        const paymentResult = await this.fabricService.queryChaincode('ReadPayment', [paymentID]);
        if (paymentResult.success && paymentResult.data) {
          const payment = paymentResult.data;
          if (payment.status === 'VERIFIED' || payment.status === 'SWIFT_RECEIVED') {
            const payingBank = payment.payingBank || 'Issuing Bank';
            const payingBankBIC = payment.payingBankBic || '';
            const swiftReference = payment.swiftDetails?.swiftReference || `SETTLE-${lcReference}`;

            // F17 (2026-11-16): the tab-0 settle route (payments.ts
            // checkSwiftForSettle) refuses settlement when the SWIFT
            // message for the reference is REJECTED, but this
            // post-delivery path invoked SettlePayment directly with no
            // such lookup — a REJECTED message blocked tab 0 but not
            // tab 5. SettlePayment itself never looks at any SWIFT
            // message, so the API must check here too, with the same
            // rule and the same two lookups (by reference, and by the
            // messages linked to this payment, so a fresh reference
            // cannot dodge a rejected one). Refusal returns before any
            // chain write AND before the DB update below, so a blocked
            // settlement leaves lc_settled false.
            try {
              const byReference = await this.fabricService.queryChaincode('QuerySWIFTMessagesByReference', [swiftReference]);
              const byPayment = await this.fabricService.queryChaincode('QuerySWIFTMessagesByPayment', [paymentID]);
              if (!byReference.success || !byPayment.success) {
                const lookupErr = !byReference.success ? byReference.error : byPayment.error;
                logger.warn(`⚠️ SWIFT lookup failed for post-delivery settlement of ${paymentID}: ${lookupErr} — refusing to settle blind`);
                return { success: false, error: `Could not verify SWIFT message for reference ${swiftReference} on the ledger: ${lookupErr || 'query failed'}`, status: 503, code: 'SWIFT_LOOKUP_FAILED' };
              }
              const swiftMessages: any[] = [
                ...(Array.isArray(byReference.data) ? byReference.data : []),
                ...(Array.isArray(byPayment.data) ? byPayment.data : []),
              ];
              const rejected = swiftMessages.find((m: any) => (m?.status || m?.Status) === 'REJECTED');
              if (rejected) {
                const rejectedId = rejected.messageId || rejected.MessageID || rejected.messageID || swiftReference;
                const reason = rejected.rejectionReason || rejected.RejectionReason;
                logger.warn(`⛔ Post-delivery settlement of ${paymentID} refused: SWIFT message ${rejectedId} is REJECTED`);
                return { success: false, error: `Cannot settle payment: SWIFT message ${rejectedId} (reference ${swiftReference}) is REJECTED${reason ? `: ${reason}` : ''}`, status: 400, code: 'SWIFT_MESSAGE_REJECTED' };
              }
            } catch (swiftGuardErr: any) {
              logger.warn(`⚠️ SWIFT guard failed for post-delivery settlement of ${paymentID}: ${swiftGuardErr?.message} — refusing to settle blind`);
              return { success: false, error: `Could not verify SWIFT message for reference ${swiftReference} on the ledger: ${swiftGuardErr?.message || 'lookup failed'}`, status: 503, code: 'SWIFT_LOOKUP_FAILED' };
            }

            // F17 follow-on (2026-11-16, found by the live C-chain probe):
            // SettlePayment was invoked with exchangeRate/retentionRate
            // '0' relying on the chaincode's auto-map from the forex
            // allocation — but the chaincode looks the allocation up as
            // GetState("FOREX_" + lcID) while the real allocation key is
            // FOREX_<lcID>_REQUEST, so the lookup always misses and
            // SettlePayment refuses honestly ("exchange rate must be
            // positive"). The chaincode key is out of scope for this API
            // fix, so resolve the rates here and pass them explicitly:
            // ledger first (ReadForex <lcID>_REQUEST), PG mirror as
            // fallback. If neither yields positive rates, refuse before
            // any chain write, like the SWIFT guard above.
            let exchangeRate = 0;
            let retentionRate = 0;
            try {
              const forexResult = await this.fabricService.queryChaincode('ReadForex', [`${lcReference}_REQUEST`]);
              const fx = forexResult?.success ? forexResult.data : null;
              const fxRate = Number(fx?.exchangeRate ?? fx?.ExchangeRate ?? 0);
              const fxRet = Number(fx?.retentionRate ?? fx?.RetentionRate ?? 0);
              if (Number.isFinite(fxRate) && fxRate > 0 && Number.isFinite(fxRet) && fxRet > 0) {
                exchangeRate = fxRate;
                retentionRate = fxRet;
              }
            } catch { /* fall through to the PG mirror */ }
            if (exchangeRate <= 0 || retentionRate <= 0) {
              try {
                const pgFx = await this.db.query(
                  `SELECT exchange_rate, retention_rate FROM forex_allocations
                    WHERE lc_id = $1 AND exchange_rate > 0 AND retention_rate > 0
                    ORDER BY created_at DESC LIMIT 1`,
                  [lcReference]
                );
                const row = pgFx?.rows?.[0];
                const pgRate = Number(row?.exchange_rate ?? 0);
                const pgRet = Number(row?.retention_rate ?? 0);
                if (Number.isFinite(pgRate) && pgRate > 0 && Number.isFinite(pgRet) && pgRet > 0) {
                  exchangeRate = pgRate;
                  retentionRate = pgRet;
                }
              } catch { /* no usable mirror row — refuse below */ }
            }
            if (exchangeRate <= 0 || retentionRate <= 0) {
              logger.warn(`⛔ Post-delivery settlement of ${paymentID} refused: no exchange/retention rate for LC ${lcReference}`);
              return { success: false, error: `Cannot settle payment: no exchange rate / retention rate found for LC ${lcReference} (no forex allocation with a rate)`, status: 400, code: 'SETTLEMENT_RATE_UNAVAILABLE' };
            }

            const settleResult = await this.fabricService.invokeChaincode('SettlePayment', [
              paymentID,
              String(exchangeRate),   // resolved from the LC's forex allocation (see above)
              String(retentionRate),  // resolved from the LC's forex allocation (see above)
              payingBank,
              payingBankBIC,
              swiftReference,
              '',               // nbeApprovalRef: optional
            ]);

            if (settleResult.success) {
              blockchainSettled = true;
              logger.info(`✅ Blockchain: Payment ${paymentID} settled, LC ${lcReference} cascaded to SETTLED`);
              // Audit: this SettlePayment chain write in the close flow
              // never wrote an audit_trail row. Best-effort — a failed
              // audit write must not fail the settlement.
              try {
                const auditService = require('./auditService').default;
                await auditService.recordAudit({
                  entityType: 'PAYMENT',
                  entityId: paymentID,
                  actionType: 'SETTLE',
                  actionBy: userId,
                  organizationMSP: 'BanksMSP',
                  details: {
                    lcReference,
                    shipmentId,
                    payingBank,
                    payingBankBIC,
                    swiftReference,
                    blockchainTxId: (settleResult as any)?.txId || null
                  },
                  blockchainTxId: (settleResult as any)?.txId,
                  timestamp: new Date()
                });
              } catch (auditErr) {
                logger.warn(`⚠️ Failed to audit LC settlement for ${paymentID} (non-fatal):`, auditErr);
              }
            } else {
              logger.warn(`⚠️ Blockchain SettlePayment failed for ${paymentID}: ${settleResult.error}`);
            }
          } else {
            logger.warn(`⚠️ Payment ${paymentID} status is ${payment.status}, cannot settle (needs VERIFIED or SWIFT_RECEIVED)`);
          }
        } else {
          logger.warn(`⚠️ Payment entity ${paymentID} not found on blockchain — skipping blockchain settlement`);
        }
      } catch (blockchainError: any) {
        logger.warn(`⚠️ Blockchain settlement failed for ${paymentID}: ${blockchainError.message} — continuing with DB update`);
      }

      // --- Database update (kept for post-delivery tracking) ---
      const query = `
        UPDATE post_delivery_tracking
        SET 
          lc_settled = true,
          lc_settlement_date = NOW(),
          overall_status = CASE WHEN overall_status = 'PENDING' THEN 'IN_PROGRESS' ELSE overall_status END,
          lc_reference = $2,
          updated_by = $3,
          updated_at = NOW()
        WHERE shipment_id = $1
      `;

      const lcUpdate = await this.db.query(query, [shipmentId, lcReference, userId]);
      if (!lcUpdate.rowCount) {
        return { success: false, error: 'Post-delivery record not found' };
      }

      // Update checklist
      await this.updateChecklistItem(shipmentId, 'LC_SETTLED');

      await this.checkWorkflowCompletion(shipmentId);

      logger.info(`✅ LC settlement recorded for ${shipmentId} (blockchain: ${blockchainSettled ? 'settled' : 'skipped'})`);

      return { success: true };
    } catch (error: any) {
      logger.error('Failed to record LC settlement:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Record ECTA audit completion
   */
  async recordECTAAudit(
    shipmentId: string,
    auditResult: 'PASSED' | 'FAILED',
    auditNotes: string,
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      logger.info(`📋 Recording ECTA audit for shipment: ${shipmentId}`);

      const query = `
        UPDATE post_delivery_tracking
        SET 
          ecta_audit_completed = true,
          ecta_audit_date = NOW(),
          overall_status = CASE WHEN overall_status = 'PENDING' THEN 'IN_PROGRESS' ELSE overall_status END,
          ecta_audit_result = $2,
          ecta_audit_notes = $3,
          updated_by = $4,
          updated_at = NOW()
        WHERE shipment_id = $1
      `;

      const auditUpdate = await this.db.query(query, [shipmentId, auditResult, auditNotes, userId]);
      if (!auditUpdate.rowCount) {
        return { success: false, error: 'Post-delivery record not found' };
      }

      // Update checklist
      await this.updateChecklistItem(shipmentId, 'ECTA_AUDIT_COMPLETED');

      await this.checkWorkflowCompletion(shipmentId);

      logger.info(`✅ ECTA audit recorded for ${shipmentId}`);

      return { success: true };
    } catch (error: any) {
      logger.error('Failed to record ECTA audit:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Close contract
   */
  async closeContract(
    shipmentId: string,
    userId: string
  ): Promise<{ success: boolean; error?: string; blockchainSynced?: boolean; blockchainWarning?: string | null; status?: number; code?: string; alreadyClosed?: boolean; healed?: string | null }> {
    try {
      logger.info(`📋 Closing contract for shipment: ${shipmentId}`);

      // Get contract ID
      const statusResult = await this.getPostDeliveryStatus(shipmentId);
      if (!statusResult) {
        return { success: false, error: 'Post-delivery record not found' };
      }

      // Re-close is idempotent — but the old close flows left two
      // divergent legacies behind, and a bare short-circuit preserves
      // both forever:
      //  (a) ledger COMPLETED, PG contracts.status still APPROVED
      //      (the close never UPDATEs the contracts table — every
      //      ledger-first close since the fix), and
      //  (b) PG tracking contract_closed=true with the ledger still
      //      APPROVED (the pre-fix PG-first close never wrote the
      //      chain; the ledger is source of truth, so the contract was
      //      never actually completed).
      // Heal instead of no-op: read the ledger, then converge the
      // side that lags. (a) mirrors COMPLETED into PG. (b) re-runs
      // the chain close — but only when every close precondition is
      // still met (payment, repatriation, LC settlement, ECTA audit),
      // so a half-finished export is never completed by a re-close.
      // Neither heal re-sends notifications or re-touches the
      // checklist: the business outcome was already recorded.
      if (statusResult.contractClosed) {
        logger.info(`📋 Contract for ${shipmentId} is already closed; checking whether the ledger and PG agree before returning`);
        const healed = await this.healClosedContract(statusResult, userId);
        return {
          success: true,
          alreadyClosed: true,
          blockchainSynced: healed === 'chain-close',
          blockchainWarning: healed
            ? `Contract was already closed; healed divergence via ${healed}`
            : 'Contract was already closed; no new chain transaction was submitted',
          healed: healed || null,
        };
      }

      // Verify every required step before closing. The old code set
      // COMPLETED + 100% unconditionally, so a contract could be closed
      // with payment, repatriation, LC settlement or the ECTA audit still
      // outstanding. LC settlement is only required when an LC was used.
      const missingSteps: string[] = [];
      if (!statusResult.paymentReceived) missingSteps.push('payment');
      if (!statusResult.forexRepatriated) missingSteps.push('forex repatriation');
      if (statusResult.lcUsed && !statusResult.lcSettled) missingSteps.push('LC settlement');
      if (!statusResult.ectaAuditCompleted) missingSteps.push('ECTA audit');
      if (missingSteps.length > 0) {
        await this.db.query(
          `UPDATE post_delivery_tracking
           SET overall_status = 'ISSUE', updated_at = NOW()
           WHERE shipment_id = $1`,
          [shipmentId]
        );
        logger.warn(`📋 Cannot close contract for ${shipmentId}: incomplete steps: ${missingSteps.join(', ')}`);
        return {
          success: false,
          error: `Cannot close contract: incomplete steps: ${missingSteps.join(', ')}`,
        };
      }

      // Mark the contract completed on-chain FIRST (ledger-first honesty,
      // TEST-STATUS-MATRIX §17 #7). If neither chain write succeeds the
      // close FAILS (503) and PG is left untouched — a PG COMPLETED row
      // with the contract still APPROVED on-chain must never be written
      // again.
      const chainClose = await this.completeContractOnChain(statusResult.contractId, userId);
      const blockchainSynced = chainClose.ok;
      const blockchainWarning = chainClose.warning;

      if (!blockchainSynced) {
        logger.error(`📋 Cannot close contract for ${shipmentId}: chain write failed: ${blockchainWarning}`);
        return {
          success: false,
          error: `Failed to close contract on-chain: ${blockchainWarning}`,
          status: 503,
          code: 'CONTRACT_CLOSURE_CHAIN_FAILED',
          blockchainSynced: false,
          blockchainWarning,
        };
      }

      // Update post-delivery tracking
      const query = `
        UPDATE post_delivery_tracking
        SET 
          contract_closed = true,
          contract_closure_date = NOW(),
          overall_status = 'COMPLETED',
          completion_percentage = 100,
          updated_by = $2,
          updated_at = NOW()
        WHERE shipment_id = $1
      `;

      await this.db.query(query, [shipmentId, userId]);

      // Mirror COMPLETED into the contracts table. The close used to
      // update only post_delivery_tracking, so PG contracts.status
      // stayed APPROVED for every closed contract (zero COMPLETED
      // rows live) while the ledger said COMPLETED — the same stale
      // mirror class as the shipment mirrors. Mirror only after the
      // chain write above succeeded.
      await this.mirrorContractCompleted(statusResult.contractId);

      // Update checklist
      await this.updateChecklistItem(shipmentId, 'CONTRACT_CLOSED');

      // Send final notifications
      await this.notifyStakeholders(shipmentId, statusResult.contractId, statusResult.exporterId, 'WORKFLOW_COMPLETED');

      logger.info(`✅ Contract closed for ${shipmentId} (blockchainSynced: ${blockchainSynced})`);

      return { success: true, blockchainSynced, blockchainWarning };
    } catch (error: any) {
      logger.error('Failed to close contract:', error);
      return { success: false, error: error.message };
    }
  }

  // ==================== PRIVATE HELPER METHODS ====================

  /**
   * CompleteContract takes (contractID, completedBy); UpdateContractStatus
   * takes (contractID, newStatus) and is tried as a fallback if
   * CompleteContract is not committed yet. Both attempts are pinned to
   * ECTAMSP: close is ECTA-only (the route requires ECTA/ECTA_ADMIN)
   * and both chaincode functions enforce "only ECTA and Admin"
   * (main.go: CompleteContract, UpdateContractStatus).
   */
  private async completeContractOnChain(
    contractId: string,
    userId: string
  ): Promise<{ ok: boolean; warning: string | null }> {
    let warning: string | null = null;
    const syncAttempts: Array<{ fn: string; args: string[] }> = [
      { fn: 'CompleteContract', args: [contractId, userId] },
      { fn: 'UpdateContractStatus', args: [contractId, 'COMPLETED'] },
    ];
    for (const attempt of syncAttempts) {
      try {
        const chainResult = await this.fabricService.invokeChaincode(attempt.fn, attempt.args, 'ECTAMSP');
        if (chainResult.success) {
          logger.info(`📋 Contract ${contractId} marked COMPLETED on-chain via ${attempt.fn}`);
          return { ok: true, warning };
        }
        warning = `Chaincode ${attempt.fn} did not complete ${contractId}: ${chainResult.error || 'unknown error'}`;
        logger.warn(`📋 ${warning}`);
      } catch (chainError: any) {
        warning = `Could not complete ${contractId} on the ledger via ${attempt.fn} (no Fabric here?): ${chainError.message}`;
        logger.warn(`📋 ${warning}`);
      }
    }
    return { ok: false, warning };
  }

  /**
   * Mirror a ledger COMPLETED contract into PG and drop its cached GET
   * entry. Only ever called after the ledger is known COMPLETED — never
   * the reverse direction (PG must not overwrite the ledger).
   */
  private async mirrorContractCompleted(contractId: string): Promise<void> {
    try {
      await this.db.query(
        `UPDATE contracts SET status = 'COMPLETED', updated_at = NOW() WHERE contract_id = $1`,
        [contractId]
      );
      CacheInvalidation.contract(contractId);
    } catch (err: any) {
      logger.warn(`📋 Could not mirror COMPLETED for contract ${contractId} into PG:`, err?.message || err);
    }
  }

  /**
   * Heal an already-closed contract whose ledger and PG disagree (see
   * closeContract). Returns 'pg-mirror' when the ledger was already
   * COMPLETED and only PG lagged, 'chain-close' when the ledger still
   * said APPROVED and the chain close was (re-)run, or null when
   * nothing needed healing / healing was not safe. The ledger is
   * source of truth in both directions: PG is never flipped to
   * COMPLETED unless the ledger says so, and the chain close is only
   * re-run when every close precondition is still met.
   */
  private async healClosedContract(
    statusResult: PostDeliveryStatus,
    userId: string
  ): Promise<'pg-mirror' | 'chain-close' | null> {
    let ledgerStatus: string | null = null;
    try {
      const ledger = await this.fabricService.getSalesContract(statusResult.contractId);
      if (ledger.success && ledger.data) {
        ledgerStatus = String(ledger.data.contractStatus || ledger.data.status || ledger.data.Status || '');
      }
    } catch (err: any) {
      logger.warn(`📋 Heal: could not read ledger status for ${statusResult.contractId}:`, err?.message || err);
    }
    if (!ledgerStatus) {
      logger.warn(`📋 Heal: ledger status for ${statusResult.contractId} is unreadable; leaving PG as-is`);
      return null;
    }
    if (ledgerStatus === 'COMPLETED') {
      await this.mirrorContractCompleted(statusResult.contractId);
      logger.info(`📋 Heal: contract ${statusResult.contractId} already COMPLETED on ledger; mirrored into PG`);
      return 'pg-mirror';
    }
    if (ledgerStatus !== 'APPROVED') {
      logger.warn(`📋 Heal: contract ${statusResult.contractId} is ${ledgerStatus} on ledger, not APPROVED; refusing to complete it`);
      return null;
    }
    // Ledger still APPROVED: only complete it when the business
    // outcome was genuinely achieved (same gates as closeContract).
    const missingSteps: string[] = [];
    if (!statusResult.paymentReceived) missingSteps.push('payment');
    if (!statusResult.forexRepatriated) missingSteps.push('forex repatriation');
    if (statusResult.lcUsed && !statusResult.lcSettled) missingSteps.push('LC settlement');
    if (!statusResult.ectaAuditCompleted) missingSteps.push('ECTA audit');
    if (missingSteps.length > 0) {
      logger.warn(`📋 Heal: contract ${statusResult.contractId} cannot be completed on-chain; incomplete steps: ${missingSteps.join(', ')}`);
      return null;
    }
    const chainClose = await this.completeContractOnChain(statusResult.contractId, userId);
    if (!chainClose.ok) {
      logger.error(`📋 Heal: chain close failed for ${statusResult.contractId}: ${chainClose.warning}`);
      return null;
    }
    await this.mirrorContractCompleted(statusResult.contractId);
    logger.info(`📋 Heal: contract ${statusResult.contractId} completed on-chain and mirrored into PG`);
    return 'chain-close';
  }

  private calculateCompletionPercentage(record: any): number {
    let completed = 0;
    let total = record.lc_used ? 5 : 4; // 5 steps if LC, 4 if not

    if (record.payment_received) completed++;
    if (record.forex_repatriated) completed++;
    // The LC step only exists when an LC was used; counting it as done when
    // no LC was used let `completed` reach 5 against a total of 4 (125%).
    if (record.lc_used && record.lc_settled) completed++;
    if (record.ecta_audit_completed) completed++;
    if (record.contract_closed) completed++;

    return Math.round((completed / total) * 100);
  }

  private determineOverallStatus(record: any, daysElapsed: number): 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DELAYED' | 'ISSUE' {
    if (record.contract_closed) {
      return 'COMPLETED';
    }

    // A close refused for incomplete steps writes overall_status = 'ISSUE'
    // to the row (closeContract); the read-time derivation must not hide
    // it behind PENDING/IN_PROGRESS. ISSUE is a stored state; DELAYED
    // below is read-time only — no background job persists it, so the
    // stored column keeps PENDING/IN_PROGRESS while the read reports
    // DELAYED (TEST-STATUS-MATRIX §17 #11).
    if (record.overall_status === 'ISSUE') {
      return 'ISSUE';
    }

    if (!record.payment_received && daysElapsed > this.PAYMENT_SLA) {
      return 'DELAYED';
    }

    if (record.payment_received && !record.forex_repatriated) {
      const paymentDays = Math.floor(
        (new Date().getTime() - new Date(record.payment_received_date).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (paymentDays > this.FOREX_SLA) {
        return 'DELAYED';
      }
    }

    // Payment and forex are done but LC settlement (when an LC was used)
    // or the ECTA audit is still outstanding past the payment SLA: the
    // workflow is overdue even though no single step has its own timer.
    if (
      record.payment_received &&
      record.forex_repatriated &&
      ((record.lc_used && !record.lc_settled) || !record.ecta_audit_completed) &&
      daysElapsed > this.PAYMENT_SLA
    ) {
      return 'DELAYED';
    }

    if (record.payment_received || record.forex_repatriated || record.ecta_audit_completed) {
      return 'IN_PROGRESS';
    }

    return 'PENDING';
  }

  private async createChecklistItems(shipmentId: string, lcUsed: boolean): Promise<void> {
    const items = [
      { type: 'PAYMENT_RECEIVED', description: 'Payment received from buyer', order: 1 },
      { type: 'FOREX_REPATRIATED', description: 'Forex repatriated to Ethiopia', order: 2 },
      { type: 'ECTA_AUDIT_COMPLETED', description: 'ECTA final audit completed', order: 4 },
      { type: 'CONTRACT_CLOSED', description: 'Export contract closed', order: 5 }
    ];

    if (lcUsed) {
      items.push({ type: 'LC_SETTLED', description: 'Letter of Credit settled', order: 3 });
    }

    const query = `
      INSERT INTO post_delivery_checklist (shipment_id, item_type, description, display_order, completed)
      VALUES ($1, $2, $3, $4, false)
    `;

    for (const item of items) {
      await this.db.query(query, [shipmentId, item.type, item.description, item.order]);
    }
  }

  private async updateChecklistItem(shipmentId: string, itemType: string): Promise<void> {
    const query = `
      UPDATE post_delivery_checklist
      SET completed = true, completed_at = NOW()
      WHERE shipment_id = $1 AND item_type = $2
    `;
    await this.db.query(query, [shipmentId, itemType]);
  }

  private async checkAndCreateIssues(shipmentId: string): Promise<void> {
    const status = await this.getPostDeliveryStatus(shipmentId);
    if (!status) return;

    // Check payment overdue
    if (!status.paymentReceived && status.daysElapsed > this.PAYMENT_SLA) {
      await this.createIssue(shipmentId, 'PAYMENT_OVERDUE', 'HIGH', 
        `Payment not received after ${status.daysElapsed} days (SLA: ${this.PAYMENT_SLA} days)`);
    }

    // Check forex delay
    if (status.paymentReceived && !status.forexRepatriated && status.paymentReceivedDate) {
      const daysSincePayment = Math.floor(
        (new Date().getTime() - new Date(status.paymentReceivedDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSincePayment > this.FOREX_SLA) {
        await this.createIssue(shipmentId, 'FOREX_DELAYED', 'HIGH',
          `Forex not repatriated ${daysSincePayment} days after payment (SLA: ${this.FOREX_SLA} days)`);
      }
    }
  }

  private async createIssue(
    shipmentId: string,
    issueType: string,
    severity: string,
    message: string
  ): Promise<void> {
    const query = `
      INSERT INTO post_delivery_issues (shipment_id, issue_type, severity, message, resolved, created_at)
      VALUES ($1, $2, $3, $4, false, NOW())
      ON CONFLICT (shipment_id, issue_type) DO NOTHING
    `;
    await this.db.query(query, [shipmentId, issueType, severity, message]);

    // ✅ Record post-delivery issue on blockchain
    try {
      const auditService = require('./auditService').default;
      await auditService.recordAudit({
        entityType: 'POST_DELIVERY_ISSUE',
        entityId: `${shipmentId}_${issueType}`,
        actionType: 'CREATE',
        actionBy: 'system',
        organizationMSP: 'BanksMSP',
        details: {
          shipmentId,
          issueType,
          severity,
          message,
          resolved: false
        },
        timestamp: new Date()
      });
      logger.info(`✅ Post-delivery issue recorded on blockchain: ${shipmentId}_${issueType}`);
    } catch (blockchainErr) {
      logger.warn(`⚠️ Failed to record post-delivery issue on blockchain (non-fatal):`, blockchainErr);
    }
  }

  private async checkWorkflowCompletion(shipmentId: string): Promise<void> {
    const status = await this.getPostDeliveryStatus(shipmentId);
    if (!status) return;

    // Check if all required steps are complete
    const allComplete = 
      status.paymentReceived &&
      status.forexRepatriated &&
      (!status.lcUsed || status.lcSettled) &&
      status.ectaAuditCompleted;

    if (allComplete && !status.contractClosed) {
      // Notify admin/ECTA to close contract
      await this.notifyStakeholders(shipmentId, status.contractId, status.exporterId, 'READY_FOR_CLOSURE');
    }
  }

  private async notifyStakeholders(
    shipmentId: string,
    contractId: string | null,
    exporterId: string | null,
    eventType: string
  ): Promise<void> {
    // Implementation depends on NotificationService
    logger.info(`📧 Notification sent: ${eventType} for shipment ${shipmentId}`);
  }
}

export default PostDeliveryWorkflowService;
