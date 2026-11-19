// Ethiopian Coffee Export Consortium Blockchain System (CECBS)
// Forex Allocation API Routes — uses shared FabricService singleton

import express from 'express';
import { FabricService } from '../services/fabricService';
import { ForexService } from '../services/forexService';
import { DatabaseService } from '../services/databaseService';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { body, param } from 'express-validator';
import { validateRequest } from '../middleware/validation';
import { logger } from '../utils/logger';
import { logAuditBestEffort } from '../utils/auditBestEffort';
import notificationService from '../services/notificationService';
import { dedupeById, isValidForex } from '../utils/dataFilters';
import { fetchLedgerForexMap, healForexRow, markForexSyntheticRepatriated } from '../utils/healLedger';
import { BlockchainSignatureService } from '../services/blockchainSignatureService';
import { blockchainCache, CacheKeys, CacheInvalidation } from '../services/blockchainCacheService';

const router = express.Router();
const fabricService = FabricService.getInstance();
const forexService = ForexService.getInstance();
const postgresDb = DatabaseService.getInstance();
const signatureService = BlockchainSignatureService.getInstance();

// ==================== FOREX ALLOCATION ROUTES ====================

// POST /api/v1/forex — Create forex request (wrapper for /request endpoint)
// LEG 1 (F5a): exporters may file their own forex request. Exporters
// are not Fabric members, so the API signs their request as ECTAMSP
// (the LC-request precedent); the caller must own the exporterId.
router.post('/', authMiddleware, requireRole(['BANKS', 'BANK_ADMIN', 'BANK OFFICER', 'FOREX OFFICER', 'EXPORTER']), async (req, res) => {
  try {
    const { forexID, contractID, exporterID, lcNumber, amount, currency, status } = req.body;
    
    logger.info(`[FOREX] Creating forex request: ${forexID || req.body.forexId}`);
    
    // Map workflow test parameters to actual API parameters
    const forexId = forexID || req.body.forexId;
    const contractId = contractID || req.body.contractId;
    const exporterId = exporterID || req.body.exporterId;
    
    if (!forexId || !contractId || !exporterId || !amount) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing required fields: forexID, contractID, exporterID, amount',
        },
        timestamp: new Date().toISOString(),
      });
    }
    
    // Forward to the actual /request endpoint logic
    // AUTO-MAPPING: Fetch contract data to auto-populate forex fields
    let autoMappedData: any = {};
    try {
      const contractResult = await fabricService.queryChaincode('ReadSalesContract', [contractId]);
      if (contractResult.success && contractResult.data) {
        const contract = contractResult.data;
        autoMappedData.exporterId = contract.ExporterID || contract.exporterId || exporterId;
        autoMappedData.currency = contract.Currency || contract.currency || 'USD';
        
        // Calculate forex amount from contract value if not provided
        const pricePerKg = parseFloat(contract.PricePerKg || contract.pricePerKg || '0');
        const quantity = parseFloat(contract.Quantity || contract.quantity || '0');
        autoMappedData.calculatedAmount = (pricePerKg * quantity).toFixed(2);
        
        logger.info(`[FOREX] Auto-mapped from contract: exporterId=${autoMappedData.exporterId}, amount=${autoMappedData.calculatedAmount}, currency=${autoMappedData.currency}`);
      }
    } catch (error) {
      logger.warn('[FOREX] Could not fetch contract for auto-mapping:', error);
    }

    // Use provided values or auto-mapped values
    const finalExporterId = exporterId || autoMappedData.exporterId || '';
    const finalAmount = amount || autoMappedData.calculatedAmount || '0';
    const finalCurrency = currency || autoMappedData.currency || 'USD';

    const user = (req as any).user;

    // LEG 1 (F5a): an exporter files only for their own exporterId.
    if (String(user?.role || '').toUpperCase() === 'EXPORTER') {
      const callerId = String(user?.exporterId || user?.exporter_id || user?.username || '');
      if (!callerId || callerId.toLowerCase() !== String(finalExporterId).toLowerCase()) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Exporters can request forex only for their own exporter account' },
          timestamp: new Date().toISOString(),
        });
      }
    }
    // Exporters are not Fabric members: RequestForex accepts only
    // ECTAMSP / bank MSPs, so the API signs exporter requests as ECTA.
    const signingOrg = String(user?.role || '').toUpperCase() === 'EXPORTER'
      ? 'ECTAMSP'
      : (user?.org || 'BanksMSP');

    // Use ForexService which handles both blockchain AND PostgreSQL
    const result = await forexService.requestForex({
      forexId,
      contractId,
      exporterId: finalExporterId,
      lcId: lcNumber || '',
      amount: parseFloat(finalAmount.toString()),
      currency: finalCurrency,
      userId: user?.username || user?.sub || '',
      userOrg: signingOrg
    });
    
    if (result.success) {
      logger.info(`✅ [FOREX] Forex request created successfully: ${forexId}`);
      res.status(201).json({
        success: true,
        message: 'Forex request created successfully',
        data: { forexID: forexId, forexId, status: 'REQUESTED' },
        txId: result.txId,
        timestamp: new Date().toISOString(),
      });
    } else {
      logger.error(`❌ [FOREX] Failed to create forex request`);
      res.status(400).json({
        success: false,
        error: {
          code: 'REQUEST_FAILED',
          message: 'Failed to create forex request',
        },
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error: any) {
    logger.error('[FOREX] Error creating forex request:', error);
    // A2: ForexService.requestForex throws the chaincode refusal
    // ("RequestForex: ..." / "exporter license is SUSPENDED ...") —
    // that is a 400 business-rule failure, not a 500. Anything else
    // (Fabric down, DB failure) stays a 500.
    const message = error?.message || '';
    if (/RequestForex:|licen[cs]e is (SUSPENDED|REVOKED|EXPIRED)/i.test(message)) {
      return res.status(400).json({
        success: false,
        error: {
          code: /licen[cs]e is (SUSPENDED|REVOKED|EXPIRED)/i.test(message) ? 'EXPORTER_LICENCE_SUSPENDED' : 'REQUEST_FAILED',
          message,
        },
        timestamp: new Date().toISOString(),
      });
    }
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message,
      },
      timestamp: new Date().toISOString(),
    });
  }
});

      // GET /api/v1/forex — all forex allocations (BLOCKCHAIN ONLY - NO CACHE)
// GET /api/v1/forex/allocations — alias for /forex
router.get(['/', '/allocations'], authMiddleware, async (req, res) => {
  try {
    logger.info('[FOREX] Fetching forex allocations with parallel blockchain + PostgreSQL...');
    
    // Parallel fetch: PostgreSQL (fast) + Blockchain (background)
    const pgPromise = postgresDb.all(`
      SELECT * FROM forex_allocations 
      ORDER BY created_at DESC
    `).catch(err => {
      logger.warn('[FOREX] PostgreSQL query failed:', err);
      return [];
    });
    
    // (The ledger read for this list now happens in the D5-style
    // reconciliation below, awaited — not in a background promise.)

    // Wait for PostgreSQL first (instant response)
    const pgForex = await pgPromise;
    logger.info(`[FOREX] ✅ Retrieved ${pgForex.length} forex allocations from PostgreSQL`);

    // D5-style read-time reconciliation (2026-11-19, pg-ledger-equality
    // fix round): GET /forex is PG-first while GET /banking/forex reads
    // the ledger, and the audit found 18 rows where the two disagreed
    // (12 PG-ahead phantom ALLOCATED rows, 3 ledger-ahead missed
    // allocate mirrors, 3 confirm/reject mismatches). One QueryAllForex
    // call covers the whole list; a failed/slow ledger read falls back
    // to the PG statuses above, so the list never breaks on chain
    // trouble. Rows the ledger does not return (the 2 synthetic
    // Nov-15 REPAT rows) keep their PG status here — they are corrected
    // by POST /forex/resync, not by a read-time heal. The old
    // background-only blockchain fetch is replaced by this awaited
    // reconciliation: a background log line never fixed the portal view.
    let statusReconciled = false;
    let statusHealed = 0;
    let statusMismatches = 0;
    const ledgerById = new Map<string, { status: string; allocatedAmount?: number }>();
    const ledgerMap = await fetchLedgerForexMap();
    if (ledgerMap) {
      statusReconciled = true;
      for (const [id, doc] of ledgerMap) {
        ledgerById.set(id, {
          status: String(doc?.status || doc?.Status || '').trim().toUpperCase(),
          allocatedAmount: typeof doc?.allocatedAmount === 'number' ? doc.allocatedAmount : undefined,
        });
      }
      const toHeal: Array<{ forexId: string; chainStatus: string; allocatedAmount?: number }> = [];
      for (const fx of pgForex as any[]) {
        const key = String(fx?.forex_id || fx?.allocation_id || '');
        const ledger = ledgerById.get(key);
        if (ledger && ledger.status && ledger.status !== String(fx?.status || '').toUpperCase()) {
          statusMismatches++;
          toHeal.push({ forexId: key, chainStatus: ledger.status, allocatedAmount: ledger.allocatedAmount });
        }
      }
      if (toHeal.length > 0) {
        const capped = toHeal.slice(0, 50);
        const healed = await Promise.allSettled(
          capped.map((h) => healForexRow(h.forexId, h.chainStatus, (req as any).user, h.allocatedAmount)),
        );
        statusHealed = healed.filter((r) => r.status === 'fulfilled' && (r as any).value?.healed).length;
        logger.info(`[FOREX] 🔧 Status reconciliation: ${statusMismatches} mismatched, ${statusHealed} PG rows healed to ledger status`);
      }
    }

    const normalizedForex = pgForex.map((fx: any) => {
      // Show the ledger truth now (same rule as the D5 LC list): a row
      // whose PG status is stale is displayed with the ledger status,
      // and the allocated amount follows the ledger too.
      const ledgerKey = String(fx?.forex_id || fx?.allocation_id || '');
      const ledgerRow = ledgerById.get(ledgerKey);
      const shownStatus = ledgerRow && ledgerRow.status ? ledgerRow.status : (fx?.status || 'REQUESTED');
      const shownAllocated = ledgerRow && typeof ledgerRow.allocatedAmount === 'number'
        ? ledgerRow.allocatedAmount
        : (fx?.allocated_amount ?? 0);
      return {
        forexId: String(fx?.forex_id || fx?.allocation_id || ''),
        contractId: String(fx?.contract_id || ''),
        exporterId: String(fx?.exporter_id || ''),
        lcId: String(fx?.lc_id || ''),
        buyerName: fx?.buyer_name || 'Unknown Buyer',
        buyerCountry: fx?.buyer_country || '',
        amount: fx?.amount ?? 0,
        currency: fx?.currency || 'USD',
        status: shownStatus,
        requestedAmount: fx?.requested_amount ?? 0,
        allocatedAmount: shownAllocated,
        exchangeRate: fx?.exchange_rate ?? 0,
        retention: fx?.retention ?? 0,
        retentionRate: fx?.retention_rate ?? 0,
        retentionPercentage: fx?.retention_percentage ?? 0,
        retentionAmountUsd: fx?.retention_amount_usd ?? 0,
        fcyAccountNumber: fx?.fcy_account_number || '',
        retentionStatus: fx?.retention_status || 'PENDING',
        expiryDate: fx?.expiry_date || null,
        requestDate: fx?.request_date || null,
        allocationDate: fx?.allocation_date || null,
        utilizationDate: fx?.utilization_date || null,
        nbeApprovalRef: fx?.nbe_approval_ref || '',
        nbeOfficer: fx?.nbe_officer || '',
        verifiedBy: fx?.verified_by || '',
        verifiedByMSP: fx?.verified_by_msp || '',
        comments: fx?.comments || '',
      };
    });

      const uniqueForex = dedupeById(normalizedForex, (fx: any) => String(fx.forexId));

      return res.json({
        success: true,
        data: uniqueForex,
        source: 'postgresql',
        count: uniqueForex.length,
        statusReconciled,
        statusHealed,
        statusMismatches,
        timestamp: new Date().toISOString()
      });

  } catch (error: any) {
    logger.error('[FOREX] ❌ Error in GET /forex:', error);
    return res.status(500).json({
      success: false,
      error: {
        message: error.message || 'Failed to fetch forex allocations',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    });
  }
});

// ==================== SPECIFIC ROUTES (MUST BE BEFORE :forexId) ====================

/**
 * POST /api/v1/forex/resync (2026-11-19, pg-ledger-equality fix round)
 *
 * Heal forex_allocations from ledger truth, mirroring POST
 * /banking/lc/resync (ADMIN-only, idempotent). The audit found 20
 * differing rows: 18 status diffs healed here from QueryAllForex, and
 * the 2 synthetic Nov-15 rows corrected to REPATRIATED (see
 * markForexSyntheticRepatriated — kept, never deleted). Nothing is
 * inserted: every ledger forex doc already has a PG row. A repeat call
 * heals 0 rows. Unknown ledger statuses are skipped, never written.
 */
router.post('/resync', authMiddleware, requireRole(['ADMIN']), async (req, res) => {
  try {
    const ledgerMap = await fetchLedgerForexMap();
    if (!ledgerMap) {
      return res.status(502).json({
        success: false,
        error: { code: 'LEDGER_UNAVAILABLE', message: 'Could not read forex allocations from the ledger (QueryAllForex failed)' },
        timestamp: new Date().toISOString(),
      });
    }
    const actor = (req as any).user;
    const healed: Array<{ forexId: string; from: string; to: string }> = [];
    const skipped: Array<{ forexId: string; reason: string }> = [];
    for (const [forexId, doc] of ledgerMap) {
      const chainStatus = String(doc?.status || doc?.Status || '').trim().toUpperCase();
      const allocatedAmount = typeof doc?.allocatedAmount === 'number' ? doc.allocatedAmount : null;
      const result = await healForexRow(forexId, chainStatus, actor, allocatedAmount);
      if (result.healed) {
        healed.push({ forexId, from: String(result.oldStatus), to: String(result.newStatus) });
      } else if (result.reason && result.reason !== 'already equal' && result.reason !== 'no PG row') {
        skipped.push({ forexId, reason: result.reason });
      }
    }
    // The 2 synthetic rows have no ledger doc, so the loop above never
    // sees them. Their LCs are SETTLED on-ledger with real ALLOCATED
    // ledger forex docs; the synthetic rows are repatriation-test
    // artefacts, corrected to REPATRIATED in place (never deleted —
    // forex_repatriations references them).
    const syntheticIds = ['FOREX-REPAT-TXID-20261115', 'FOREX-REPAT-TXID-20261115-B'];
    const synthetics: Array<{ forexId: string; from: string; to: string; note: string }> = [];
    for (const forexId of syntheticIds) {
      const result = await markForexSyntheticRepatriated(forexId, actor);
      if (result.healed) {
        synthetics.push({
          forexId,
          from: String(result.oldStatus),
          to: String(result.newStatus),
          note: 'Synthetic Nov-15 repatriation-test row, no ledger doc; kept, corrected ALLOCATED → REPATRIATED',
        });
      }
    }
    const pgCount = await postgresDb.get(`SELECT COUNT(*)::int AS n FROM forex_allocations`, []);
    res.json({
      success: true,
      data: {
        ledgerTotal: ledgerMap.size,
        pgTotal: (pgCount as any)?.n ?? null,
        healed,
        healedCount: healed.length,
        synthetics,
        syntheticCount: synthetics.length,
        skipped,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('[FOREX] ❌ Resync error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message },
      timestamp: new Date().toISOString(),
    });
  }
});

// GET /api/v1/forex/rates — get all exchange rates
router.get('/rates', authMiddleware, async (req, res) => {
  try {
    const result = await fabricService.queryChaincode('QueryAllExchangeRates', []);
    if (result.success) {
      res.json({ success: true, data: result.data || [], timestamp: new Date().toISOString() });
    } else {
      res.status(500).json({ success: false, error: { code: 'QUERY_FAILED', message: result.error }, timestamp: new Date().toISOString() });
    }
  } catch (error: any) {
    logger.error('Error fetching exchange rates:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message }, timestamp: new Date().toISOString() });
  }
});

// GET /api/v1/forex/rates/:currency — get specific currency rate
router.get('/rates/:currency', authMiddleware, async (req, res) => {
  try {
    const result = await fabricService.queryChaincode('QueryExchangeRate', [req.params.currency]);
    if (result.success) {
      res.json({ success: true, data: result.data, timestamp: new Date().toISOString() });
    } else {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: result.error }, timestamp: new Date().toISOString() });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message }, timestamp: new Date().toISOString() });
  }
});

// GET /api/v1/forex/rates/:currency/current — fetch only the active ledger rate.
// Cached 60s: a chaincode evaluate costs ~1s on a warm gateway (measured
// 0.96–1.29s) for reference data that changes only when NBE sets a new
// rate. There is no PG mirror of exchange rates to serve instead, so a
// short cache is the safe speed-up; the set-rate handlers below
// invalidate it, so a newly set rate is visible immediately. Display
// reads only — the allocate flow takes its rate from the request body,
// never from this endpoint.
router.get('/rates/:currency/current', authMiddleware, async (req, res) => {
  try {
    const currency = String(req.params.currency || '').toUpperCase();
    const servedFromCache = blockchainCache.peek(CacheKeys.forexRate(currency));
    const data = await blockchainCache.get(
      CacheKeys.forexRate(currency),
      async () => {
        const result = await fabricService.queryChaincode('GetCurrentExchangeRate', [currency]);
        if (result.success && result.data) return result.data;
        // The ledger reports "no active rate" as a failed evaluate, not
        // as an empty success — keep the old 404 for that case, and
        // only 500 genuine transport failures (thrown below).
        const err: any = new Error(result.error || `No active ${currency} rate is recorded`);
        err.code = 'ACTIVE_RATE_NOT_FOUND';
        throw err;
      },
      60 * 1000
    );
    return res.json({ success: true, data, source: servedFromCache ? 'cache' : 'blockchain', timestamp: new Date().toISOString() });
  } catch (error: any) {
    if (error?.code === 'ACTIVE_RATE_NOT_FOUND') {
      return res.status(404).json({ success: false, error: { code: 'ACTIVE_RATE_NOT_FOUND', message: error.message } });
    }
    return res.status(500).json({ success: false, error: { code: 'QUERY_FAILED', message: error.message } });
  }
});

// GET /api/v1/forex/retention-policy/:commodityType — active policy from ledger.
// Same 60s-cache reasoning as the rate read above; invalidated by the
// set-policy handler below.
router.get('/retention-policy/:commodityType', authMiddleware, async (req, res) => {
  try {
    const commodityType = String(req.params.commodityType || '').toUpperCase();
    const servedFromCache = blockchainCache.peek(CacheKeys.retentionPolicy(commodityType));
    const data = await blockchainCache.get(
      CacheKeys.retentionPolicy(commodityType),
      async () => {
        const result = await fabricService.queryChaincode('GetCurrentRetentionPolicy', [commodityType]);
        if (result.success && result.data) return result.data;
        const err: any = new Error(result.error || `No active ${commodityType} policy is recorded`);
        err.code = 'ACTIVE_POLICY_NOT_FOUND';
        throw err;
      },
      60 * 1000
    );
    return res.json({ success: true, data, source: servedFromCache ? 'cache' : 'blockchain', timestamp: new Date().toISOString() });
  } catch (error: any) {
    if (error?.code === 'ACTIVE_POLICY_NOT_FOUND') {
      return res.status(404).json({ success: false, error: { code: 'ACTIVE_POLICY_NOT_FOUND', message: error.message } });
    }
    return res.status(500).json({ success: false, error: { code: 'QUERY_FAILED', message: error.message } });
  }
});

// POST /api/v1/forex/retention-policy — NBE sets retention policy for commodity
router.post('/retention-policy', authMiddleware, requireRole(['NBE', 'NBE_ADMIN', 'NBE OFFICER']), async (req, res) => {
  try {
    const user = (req as any).user;
    const { policyID, commodityType, retentionRate, setBy, justification } = req.body;

    if (!policyID || !commodityType || retentionRate === undefined) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'policyID, commodityType, and retentionRate are required'
        }
      });
    }

    logger.info(`[FOREX] NBE setting retention policy: ${policyID} for ${commodityType} at ${retentionRate}%`);

    const result = await fabricService.invokeChaincode(
      'SetRetentionPolicy',
      [
        policyID,
        String(commodityType).toUpperCase(),
        String(retentionRate),
        setBy || user?.username || 'NBE',
        justification || 'NBE retention policy directive'
      ],
      'NBEMSP'
    );

    if (result.success) {
      logger.info(`✅ Retention policy set: ${policyID} - ${commodityType} @ ${retentionRate}%`);
      // Audit: this inline chain move never called the audited
      // forexService method, so it left no audit_trail row.
      // Best-effort — a failed audit write must not fail the move.
      await logAuditBestEffort(req, {
        entityType: 'FOREX',
        entityId: policyID,
        action: 'SET_RETENTION_POLICY',
        blockchainTxId: result.txId || undefined,
        metadata: { commodityType, retentionRate, blockchainTxId: result.txId || null },
      }, `retention policy ${policyID} set`);

      // The active-policy read is cached (60s) — a newly set policy
      // must be visible immediately.
      CacheInvalidation.retentionPolicy(String(commodityType).toUpperCase());
      return res.status(200).json({
        success: true,
        message: 'Retention policy set successfully',
        data: {
          policyID,
          commodityType: String(commodityType).toUpperCase(),
          retentionRate,
          txId: result.txId
        },
        timestamp: new Date().toISOString()
      });
    } else {
      return res.status(400).json({
        success: false,
        error: {
          code: 'POLICY_SET_FAILED',
          message: result.error || 'Failed to set retention policy'
        },
        timestamp: new Date().toISOString()
      });
    }
  } catch (error: any) {
    logger.error('[FOREX] Error setting retention policy:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message
      },
      timestamp: new Date().toISOString()
    });
  }
});

// POST /api/v1/forex/exchange-rate — NBE sets official exchange rate
router.post('/exchange-rate', authMiddleware, requireRole(['NBE', 'NBE_ADMIN', 'NBE OFFICER']), async (req, res) => {
  try {
    const user = (req as any).user;
    const { rateID, currency, buyingRate, sellingRate, setBy } = req.body;

    if (!rateID || !currency || !buyingRate || !sellingRate) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'rateID, currency, buyingRate, and sellingRate are required'
        }
      });
    }

    logger.info(`[FOREX] NBE setting exchange rate: ${rateID} for ${currency} - Buy: ${buyingRate}, Sell: ${sellingRate}`);

    const result = await fabricService.invokeChaincode(
      'SetExchangeRate',
      [
        rateID,
        String(currency).toUpperCase(),
        String(buyingRate),
        String(sellingRate),
        setBy || user?.username || 'NBE'
      ],
      'NBEMSP'
    );

    if (result.success) {
      logger.info(`✅ Exchange rate set: ${rateID} - ${currency} @ ${buyingRate}/${sellingRate}`);
      // Audit: this inline chain move never called the audited
      // forexService method, so it left no audit_trail row.
      // Best-effort — a failed audit write must not fail the move.
      await logAuditBestEffort(req, {
        entityType: 'EXCHANGE_RATE',
        entityId: rateID,
        action: 'SET_EXCHANGE_RATE',
        blockchainTxId: result.txId || undefined,
        metadata: { currency, buyingRate, sellingRate, blockchainTxId: result.txId || null },
      }, `exchange rate ${rateID} set`);

      // The active-rate read is cached (60s) — invalidate it so the
      // newly set rate is visible immediately.
      CacheInvalidation.forexRate(String(currency).toUpperCase());
      return res.status(200).json({
        success: true,
        message: 'Exchange rate set successfully',
        data: {
          rateID,
          currency: String(currency).toUpperCase(),
          buyingRate,
          sellingRate,
          midRate: (Number(buyingRate) + Number(sellingRate)) / 2,
          txId: result.txId
        },
        timestamp: new Date().toISOString()
      });
    } else {
      return res.status(400).json({
        success: false,
        error: {
          code: 'RATE_SET_FAILED',
          message: result.error || 'Failed to set exchange rate'
        },
        timestamp: new Date().toISOString()
      });
    }
  } catch (error: any) {
    logger.error('[FOREX] Error setting exchange rate:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message
      },
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/v1/forex/exporter/:exporterId
router.get('/exporter/:exporterId', authMiddleware, async (req, res) => {
  try {
    const result = await fabricService.getForexByExporter(req.params.exporterId);
    if (result.success) {
      res.json({ success: true, data: result.data || [], timestamp: new Date().toISOString() });
    } else {
      res.status(500).json({ success: false, error: result.error, timestamp: new Date().toISOString() });
    }
  } catch (error: any) {
    logger.error('Error fetching forex by exporter:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message }, timestamp: new Date().toISOString() });
  }
});

// GET /api/v1/nbe/lc-monitoring - NBE monitors all LCs for forex compliance
router.get('/lc-monitoring', requireRole(['NBE', 'NBE_ADMIN', 'NBE OFFICER']), async (req, res) => {
  try {
    logger.info('[NBE] ===== LC MONITORING ENDPOINT HIT =====');
    logger.info('[NBE] User:', (req as any).user);
    logger.info('[NBE] Fetching all LCs from PostgreSQL...');
    
    // Get all LCs from PostgreSQL
    const lcs = await postgresDb.all(`
      SELECT * FROM letters_of_credit 
      ORDER BY created_at DESC
    `);
    
    logger.info(`[NBE] Query executed successfully`);
    logger.info(`[NBE] Retrieved ${lcs.length} LCs for monitoring`);
    logger.info(`[NBE] Sample LC:`, lcs[0]);
    
    return res.json({
      success: true,
      data: lcs,
      count: lcs.length,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    logger.error('[NBE] ===== ERROR IN LC MONITORING =====');
    logger.error('[NBE] Error fetching LCs for monitoring:', error);
    logger.error('[NBE] Stack trace:', error.stack);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
      timestamp: new Date().toISOString()
    });
  }
});

// ==================== GENERIC ROUTES (MUST BE LAST) ====================

// GET /api/v1/forex/:forexId — single forex allocation by ID
router.get('/:forexId', authMiddleware, async (req, res) => {
  try {
    const { forexId } = req.params;
    
    // Query from PostgreSQL
    const forex = await postgresDb.get(
      'SELECT * FROM forex_allocations WHERE forex_id = $1',
      [forexId]
    );
    
    if (forex) {
      return res.json({
        success: true,
        data: forex,
        source: 'postgresql',
        timestamp: new Date().toISOString()
      });
    }
    
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Forex allocation not found' },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    logger.error('[FOREX] Error fetching forex allocation:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
      timestamp: new Date().toISOString()
    });
  }
});

// POST /api/v1/forex/rates — create/update exchange rate (NBE only)
router.post('/rates', authMiddleware, requireRole(['NBE', 'NBE_ADMIN', 'NBE OFFICER']), async (req, res) => {
  try {
    const { currency, buyingRate, sellingRate } = req.body;
    if (!currency || !buyingRate || !sellingRate) {
      return res.status(400).json({ 
        success: false, 
        error: { code: 'MISSING_FIELDS', message: 'currency, buyingRate, and sellingRate are required' } 
      });
    }

    // Connect as NBE
    await fabricService.connectAsOrg('NBEMSP');

    const user = (req as any).user;
    const setBy = user?.sub || user?.userId || 'NBE_SYSTEM';
    const rateId = `RATE${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // SetExchangeRate(rateID, currency, buyingRate, sellingRate, setBy)
    const result = await fabricService.invokeChaincode('SetExchangeRate', [
      rateId,
      currency,
      buyingRate.toString(),
      sellingRate.toString(),
      setBy,
    ]);

    if (result.success) {
      const midRate = (parseFloat(buyingRate) + parseFloat(sellingRate)) / 2;
      logger.info(`✅ Exchange rate set: ${currency} = ${buyingRate}/${sellingRate} ETB by ${setBy}`);
      // Audit: this inline chain move never called the audited
      // forexService method, so it left no audit_trail row.
      // Best-effort — a failed audit write must not fail the move.
      await logAuditBestEffort(req, {
        entityType: 'EXCHANGE_RATE',
        entityId: rateId,
        action: 'SET_EXCHANGE_RATE',
        blockchainTxId: result.txId || undefined,
        metadata: { currency, buyingRate, sellingRate, setBy, blockchainTxId: result.txId || null },
      }, `exchange rate ${rateId} set`);

      // The active-rate read is cached (60s) — a newly set rate must
      // be visible immediately.
      CacheInvalidation.forexRate(String(currency).toUpperCase());
      res.status(201).json({ 
        success: true, 
        data: { rateId, currency, buyingRate, sellingRate, midRate, setBy },
        txId: result.txId, 
        timestamp: new Date().toISOString() 
      });
    } else {
      res.status(400).json({ 
        success: false, 
        error: { code: 'RATE_CREATE_FAILED', message: result.error }, 
        timestamp: new Date().toISOString() 
      });
    }
  } catch (error: any) {
    logger.error('Error setting exchange rate:', error);
    res.status(500).json({ 
      success: false, 
      error: { code: 'INTERNAL_ERROR', message: error.message }, 
      timestamp: new Date().toISOString() 
    });
  }
});

// GET /api/v1/forex/exporter/:exporterId
// POST /api/v1/forex/request — create forex request
// NOTE: LC ID removed from parameters to prevent SDK-level state queries
// LC will be linked during NBE allocation phase
router.post('/request', authMiddleware, requireRole(['BANKS', 'BANK_ADMIN', 'BANK OFFICER', 'FOREX OFFICER', 'EXPORTER']), async (req, res) => {
  try {
    // LEG 1 (F5b): accept the LC id the bank form sends. It used to be
    // destructured away here, and the PG mirror below had no lc_id
    // column, so GET /forex normalised lcId from an empty value and a
    // later allocate built from the row sent lcId:'' → 400.
    const { forexId, contractId, exporterId, amount, currency, lcId, lcNumber } = req.body;
    const requestLcId = lcId || lcNumber || '';
    if (!forexId || !contractId) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'forexId and contractId are required' } });
    }

    const requestUser = (req as any).user;
    const isExporterRequester = String(requestUser?.role || '').toUpperCase() === 'EXPORTER';

    // AUTO-MAPPING: Fetch contract data to auto-populate forex fields
    let autoMappedData: any = {};
    try {
      const contractResult = await fabricService.queryChaincode('ReadSalesContract', [contractId]);
      if (contractResult.success && contractResult.data) {
        const contract = contractResult.data;
        autoMappedData.exporterId = contract.ExporterID || contract.exporterId || exporterId;
        autoMappedData.currency = contract.Currency || contract.currency || 'USD';
        
        // Calculate forex amount from contract value if not provided
        const pricePerKg = parseFloat(contract.PricePerKg || contract.pricePerKg || '0');
        const quantity = parseFloat(contract.Quantity || contract.quantity || '0');
        autoMappedData.calculatedAmount = (pricePerKg * quantity).toFixed(2);
        
        logger.info(`[FOREX] Auto-mapped from contract: exporterId=${autoMappedData.exporterId}, amount=${autoMappedData.calculatedAmount}, currency=${autoMappedData.currency}`);
      }
    } catch (error) {
      logger.warn('[FOREX] Could not fetch contract for auto-mapping:', error);
    }

    // Use provided values or auto-mapped values
    const finalExporterId = exporterId || autoMappedData.exporterId || '';
    const finalAmount = amount || autoMappedData.calculatedAmount || '0';
    const finalCurrency = currency || autoMappedData.currency || 'USD';

    // LEG 1 (F5a): an exporter files only for their own exporterId.
    if (isExporterRequester) {
      const callerId = String(requestUser?.exporterId || requestUser?.exporter_id || requestUser?.username || '');
      if (!callerId || callerId.toLowerCase() !== String(finalExporterId).toLowerCase()) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Exporters can request forex only for their own exporter account' },
          timestamp: new Date().toISOString()
        });
      }
    }
    // Exporters are not Fabric members: RequestForex accepts only
    // ECTAMSP / bank MSPs, so the API signs exporter requests as ECTA.
    const requestSigningOrg = isExporterRequester ? 'ECTAMSP' : 'BanksMSP';

    // Retry logic for peer synchronization issues
    let result;
    let lastError;
    const maxRetries = 5; // Increased from 3 to 5 attempts
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // RequestForex now takes 5 parameters (lcId removed)
        await fabricService.connectAsOrg(requestSigningOrg);
        result = await fabricService.invokeChaincode('RequestForex', [
          forexId, contractId, finalExporterId, finalAmount.toString(), finalCurrency,
        ], requestSigningOrg);
        
        if (result.success) {
          logger.info(`✅ Forex request created: ${forexId} with auto-mapped data (attempt ${attempt})`);
          
          // ✅ Record blockchain signature for this transaction
          try {
            const user = (req as any).user;
            await signatureService.recordSignature({
              entityType: 'FOREX_ALLOCATION',
              entityId: forexId,
              actionType: 'REQUEST',
              signerUsername: user?.username || user?.sub || 'exporter',
              signerOrg: user?.org || user?.organization || 'ExportersMSP',
              signerRole: user?.role || 'exporter',
              blockchainTxId: result.txId,
              blockchainTimestamp: new Date(),
              chaincodeName: 'coffee',
              chaincodeFunction: 'RequestForex',
              transactionArgs: [forexId, contractId, finalExporterId, finalAmount.toString(), finalCurrency],
              metadata: {
                contractId,
                exporterId: finalExporterId,
                amount: finalAmount,
                currency: finalCurrency,
                autoMapped: true
              }
            });
          } catch (sigError) {
            logger.error('Failed to record blockchain signature:', sigError);
            // Don't fail the request if signature recording fails
          }
          
          // Wait for transaction to propagate to all peers before responding
          // This prevents the next operation (AllocateForex) from failing
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          // ✅ STORE BLOCKCHAIN METADATA in PostgreSQL
          try {
            const db = DatabaseService.getInstance();
            const forexExpiryDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
            await db.run(
              `INSERT INTO forex_allocations (
                allocation_id, forex_id, contract_id, lc_id, exporter_id, requested_amount, currency, status,
                expiry_date, blockchain_tx_id, blockchain_timestamp, last_blockchain_sync, request_date, updated_at
              ) VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW(), NOW(), NOW())
              ON CONFLICT (forex_id) DO UPDATE SET
                allocation_id = EXCLUDED.allocation_id,
                contract_id = EXCLUDED.contract_id,
                lc_id = EXCLUDED.lc_id,
                exporter_id = EXCLUDED.exporter_id,
                requested_amount = EXCLUDED.requested_amount,
                currency = EXCLUDED.currency,
                status = EXCLUDED.status,
                expiry_date = EXCLUDED.expiry_date,
                blockchain_tx_id = EXCLUDED.blockchain_tx_id,
                blockchain_timestamp = NOW(),
                last_blockchain_sync = NOW(),
                updated_at = NOW()`,
              [forexId, contractId, requestLcId || null, finalExporterId, finalAmount, finalCurrency, 'REQUESTED', forexExpiryDate, result.txId]
            );
            logger.info(`✅ Stored blockchain metadata for forex ${forexId}: txId=${result.txId}`);
            // Audit: this inline chain move never called the audited
            // forexService method, so it left no audit_trail row.
            // Best-effort — a failed audit write must not fail the move.
            await logAuditBestEffort(req, {
              entityType: 'FOREX',
              entityId: forexId,
              action: 'REQUEST',
              newValue: 'REQUESTED',
              blockchainTxId: result.txId || undefined,
              metadata: { contractId, exporterId: finalExporterId, amount: finalAmount, currency: finalCurrency, blockchainTxId: result.txId || null },
            }, `forex ${forexId} request`);

          } catch (dbError) {
            logger.error(`Failed to store blockchain metadata for ${forexId}:`, dbError);
          }
          
          // In-app notification (persisted feed + live WS broadcast).
          // A forex request previously emitted nothing (only the later
          // allocate did), so another bank/NBE user never heard about
          // it live. Audience mirrors forex_allocated.
          await notificationService.emitWorkflowEvent({
            type: 'forex_requested',
            title: `Forex requested for contract ${contractId}`,
            message: `Forex ${forexId} was requested for contract ${contractId} (${finalCurrency} ${Number(finalAmount || 0).toLocaleString()}).`,
            entityType: 'forex', entityId: forexId, severity: 'info',
            roles: ['BANKS', 'NBE'], exporterId: finalExporterId || undefined, lcId: requestLcId || undefined,
            actionUrl: '/portals/exporter?tab=contracts',
            actionUrls: { BANKS: '/portals/banks?tab=contracts', NBE: '/portals/nbe?tab=contracts' },
          });

          return res.status(201).json({
            success: true,
            data: { forexId, lcId: requestLcId || null },
            autoMapped: {
              exporterId: finalExporterId,
              amount: finalAmount,
              currency: finalCurrency,
            },
            txId: result.txId,
            blockchainProof: {
              transactionId: result.txId,
              timestamp: new Date().toISOString(),
              action: 'REQUEST_FOREX'
            },
            attempt,
            timestamp: new Date().toISOString() 
          });
        }
        
        lastError = result.error;

        // A2: a licence refusal is final — never retry it (the
        // chaincode refuses suspended exporters deterministically, so
        // retrying only burns 5 attempts of backoff before the 400).
        if (result.error && /licen[cs]e is (SUSPENDED|REVOKED|EXPIRED)/i.test(result.error)) {
          break;
        }
        
        // If error is about peer endorsement mismatch or LC not found, wait and retry
        if (result.error && (
          result.error.includes('Peer endorsements do not match') ||
          result.error.includes('does not exist') ||
          result.error.includes('not found')
        )) {
          const waitTime = 4000 * attempt; // 4s, 8s, 12s, 16s, 20s
          logger.warn(`Peer sync issue detected on attempt ${attempt}/${maxRetries}, waiting ${waitTime}ms before retry...`);
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
        } else {
          // Other errors, don't retry
          break;
        }
      } catch (error: any) {
        lastError = error.message;
        logger.error(`Error on attempt ${attempt}:`, error);
        if (attempt < maxRetries) {
          const waitTime = 4000 * attempt;
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    
    // All retries failed — a chaincode refusal (including a suspended
    // exporter licence) is a 400, not a 500 (A2).
    const licenceRefused = /licen[cs]e is (SUSPENDED|REVOKED|EXPIRED)/i.test(String(lastError || ''));
    res.status(400).json({ 
      success: false, 
      error: { 
        code: licenceRefused ? 'EXPORTER_LICENCE_SUSPENDED' : 'REQUEST_FAILED', 
        message: lastError,
        hint: licenceRefused
          ? 'The exporter licence is not active. ECTA must reactivate the licence before a forex request can be submitted.'
          : 'Peers may not be synchronized. Wait a few seconds and try again, or check that the LC exists and blockchain peers are healthy.'
      }, 
      timestamp: new Date().toISOString() 
    });
  } catch (error: any) {
    logger.error('Error requesting forex:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message }, timestamp: new Date().toISOString() });
  }
});

// POST /api/v1/forex/:forexId/confirm — NBE confirms forex request (REQUESTED → CONFIRMED)
router.post('/:forexId/confirm', authMiddleware, requireRole(['NBE', 'NBE_ADMIN', 'NBE OFFICER']), [
  param('forexId').notEmpty().withMessage('forexId is required'),
  body('comments').optional().isString().withMessage('comments must be a string'),
], validateRequest, async (req, res) => {
  try {
    const { forexId } = req.params;
    const { confirmedBy, comments } = req.body;

    if (!forexId) {
      return res.status(400).json({ 
        success: false, 
        error: { code: 'MISSING_FIELDS', message: 'forexId is required' } 
      });
    }

    logger.info(`[FOREX] Confirming forex request: ${forexId} by ${confirmedBy}`);

    // PG-state pre-check: a repeat confirm is answered from the
    // mirror in milliseconds, without a ~2.5s chain round-trip that
    // ends in a 500. The mirror is written by this same handler on
    // success (and by the NBE approve route), so a CONFIRMED or
    // ALLOCATED row already tells the answer. A missing row means
    // nothing — the ledger is still the authority then, and the chain
    // error mapping below answers honestly.
    try {
      const pgRow: any = await postgresDb.get(
        `SELECT status FROM forex_allocations WHERE allocation_id = $1 OR forex_id = $1 LIMIT 1`,
        [forexId]
      );
      const pgStatus = String(pgRow?.status || '').toUpperCase();
      if (pgStatus === 'CONFIRMED' || pgStatus === 'ALLOCATED' || pgStatus === 'UTILIZED') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'ALREADY_CONFIRMED',
            message: `Forex request ${forexId} is already ${pgStatus}; it cannot be confirmed again (must be REQUESTED)`
          },
          timestamp: new Date().toISOString()
        });
      }
    } catch (pgErr) {
      logger.warn(`[FOREX] Confirm pre-check PG lookup failed for ${forexId}, proceeding to chain:`, pgErr);
    }

    // Connect as NBE to confirm the request
    await fabricService.connectAsOrg('NBEMSP');

    // Update forex status to CONFIRMED.
    // ConfirmForex (forex.go:231) takes (forexID, officer, comments) — the
    // old call passed new Date().toISOString() as the third arg, so the
    // ledger stored a timestamp where the officer's comment belongs.
    // Pass the caller's comments (or ''), never a timestamp.
    const result = await fabricService.invokeChaincode('ConfirmForex', [
      forexId,
      confirmedBy || 'NBE Officer',
      comments || ''
    ]);

    if (result.success) {
      logger.info(`[FOREX] ✅ Forex request confirmed: ${forexId}`);

      // Store confirmation in PostgreSQL.
      // LEG 1 (F5c): match by allocation_id OR forex_id. LC-issue
      // auto-created rows carry allocation_id = ${forexId}-ALLOC
      // (banking.ts), so the old allocation_id-only mirror updated 0
      // rows for 39 live rows while the ledger was CONFIRMED. The
      // caller is told whether the mirror actually updated a row.
      let mirrorUpdated = false;
      try {
        const mirror = await postgresDb.run(
          `UPDATE forex_allocations
           SET status = 'CONFIRMED',
               updated_at = CURRENT_TIMESTAMP,
               confirmed_by = $1,
               confirmed_at = CURRENT_TIMESTAMP
           WHERE allocation_id = $2 OR forex_id = $2`,
          [confirmedBy || 'NBE Officer', forexId]
        );
        mirrorUpdated = (mirror?.rowCount ?? 0) > 0;
        if (!mirrorUpdated) {
          logger.error(`[FOREX] Confirm mirror updated 0 rows for ${forexId} — no forex_allocations row matches allocation_id or forex_id`);
        }
      } catch (pgErr) {
        logger.warn('[FOREX] Could not update PostgreSQL, but blockchain succeeded:', pgErr);
      }
      // Audit: this inline chain move never called the audited
      // forexService method, so it left no audit_trail row.
      // Best-effort — a failed audit write must not fail the move.
      await logAuditBestEffort(req, {
        entityType: 'FOREX',
        entityId: forexId,
        action: 'CONFIRM',
        oldValue: 'REQUESTED',
        newValue: 'CONFIRMED',
        blockchainTxId: result.txId || undefined,
        metadata: { confirmedBy, mirrorUpdated, blockchainTxId: result.txId || null },
      }, `forex ${forexId} confirm`);


      return res.json({
        success: true,
        data: {
          forexId,
          status: 'CONFIRMED',
          confirmedBy: confirmedBy || 'NBE Officer',
          confirmedAt: new Date().toISOString(),
          postgresMirrorUpdated: mirrorUpdated,
          message: 'Forex request confirmed. Allocate button is now active.'
        },
        timestamp: new Date().toISOString()
      });
    } else {
      logger.error(`[FOREX] ❌ Failed to confirm forex: ${result.error}`);
      // A chaincode state refusal is a client error, not a server
      // error: ConfirmForex refuses anything that is not REQUESTED
      // (forex.go: "cannot be confirmed, current status: %s (must be
      // REQUESTED)"), and a missing forex id is a 404-shaped 400, not
      // a 500. Only genuine transport/peer failures stay 500.
      const chainErr = String(result.error || '');
      const stateRefusal = /cannot be confirmed|must be REQUESTED|already (confirmed|allocated)|does not exist|not found/i.test(chainErr);
      if (stateRefusal) {
        const alreadyConfirmed = /current status:\s*CONFIRMED/i.test(chainErr);
        // State the chaincode's own reason: the per-peer envelope
        // repeats it six times (once per endorsing peer), so take the
        // first peer message; otherwise strip the fabricService
        // outcome suffix (". Fabric rejected the proposal…" /
        // ". Transaction outcome is unknown…").
        const firstPeer = chainErr.match(/message=([^\n]+)/);
        const reason = (firstPeer?.[1] ||
          chainErr.split(/\. (Fabric rejected the proposal|Transaction outcome is unknown)/)[0]
        ).trim();
        return res.status(400).json({
          success: false,
          error: {
            code: alreadyConfirmed ? 'ALREADY_CONFIRMED' : 'INVALID_TRANSITION',
            message: reason || 'Failed to confirm forex request'
          },
          timestamp: new Date().toISOString()
        });
      }
      return res.status(500).json({
        success: false,
        error: { code: 'BLOCKCHAIN_ERROR', message: result.error || 'Failed to confirm forex request' },
        timestamp: new Date().toISOString()
      });
    }
  } catch (error: any) {
    logger.error('[FOREX] Error confirming forex:', error);
    res.status(500).json({ 
      success: false, 
      error: { code: 'INTERNAL_ERROR', message: error.message }, 
      timestamp: new Date().toISOString() 
    });
  }
});

// POST /api/v1/forex/allocate — Bank allocates forex per NBE policy
// Per NBE FXD/01/2024: Banks can allocate without prior NBE approval
router.post('/allocate', authMiddleware, requireRole(['BANKS', 'BANK_ADMIN', 'BANK OFFICER', 'FOREX OFFICER', 'NBE', 'NBE_ADMIN', 'NBE OFFICER']), async (req, res) => {
  try {
    const user = (req as any).user;
    const { forexId, lcId, amount, exchangeRate, retentionRate, officer, approvalRef, expiryDate } = req.body;
    
    if (!forexId || !lcId) {
      return res.status(400).json({ 
        success: false, 
        error: { 
          code: 'MISSING_FIELDS', 
          message: 'forexId and lcId are required' 
        } 
      });
    }

    // E2E leg 1 (F16): the allocating officer is required — it used to
    // default silently to the caller, so a missing officer recorded an
    // allocation against whoever happened to hold the token.
    if (!officer || !String(officer).trim()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Officer is required'
        },
        timestamp: new Date().toISOString()
      });
    }

    logger.info(`[FOREX] Allocating forex: ${forexId} with retention rate: ${retentionRate || '40% (default)'}`);

    // Use ForexService which includes 40% retention logic
    const result = await forexService.allocateForex({
      forexID: forexId,
      lcID: lcId,
      amount: amount ? Number(amount) : 0,
      exchangeRate: exchangeRate ? Number(exchangeRate) : 1,
      retentionRate: retentionRate ? Number(retentionRate) : 40, // Defaults to 40% (percent units — must match the active NBE COFFEE policy, forex.go AllocateForex)
      officer: String(officer).trim(),
      approvalRef: approvalRef || '',
      expiryDate: expiryDate || null, // Pass null instead of empty string
      userId: user?.username || user?.sub,
      userOrg: user?.org || 'BanksMSP'
    });

    if (result.success) {
      logger.info(`✅ Forex allocated: ${forexId}, Retention Amount: ${result.retentionAmount}, Release Amount: ${result.releaseAmount}`);
      // In-app notification (persisted feed + live WS broadcast).
      await notificationService.emitWorkflowEvent({
        type: 'forex_allocated',
        title: `Forex ${forexId} allocated`,
        message: `Forex ${forexId} has been allocated for LC ${lcId} (USD ${Number(amount || 0).toLocaleString()}).`,
        entityType: 'forex', entityId: forexId, severity: 'success',
        roles: ['BANKS', 'NBE'], lcId,
        actionUrl: '/portals/exporter?tab=contracts',
        actionUrls: { BANKS: '/portals/banks?tab=contracts', NBE: '/portals/nbe?tab=contracts' },
      });
      
      res.status(200).json({
        success: true,
        message: 'Forex allocated successfully with retention policy',
        data: {
          forexID: forexId,
          lcID: lcId,
          retentionAmount: result.retentionAmount,
          releaseAmount: result.releaseAmount,
          txId: result.txId,
          blockchainSynced: (result as any).blockchainSynced ?? false,
          blockchainWarning: (result as any).blockchainWarning
        },
        timestamp: new Date().toISOString()
      });
    } else {
      // Defensive: allocateForex now throws a coded error on chain failure
      // instead of returning success:false, so this should not be reached.
      // Kept honest anyway — never report a failed allocation as 400/200.
      res.status(503).json({
        success: false,
        error: {
          code: 'FOREX_ALLOCATE_FAILED',
          message: 'Failed to allocate forex on the ledger; no allocation was recorded'
        },
        timestamp: new Date().toISOString()
      });
    }
  } catch (error: any) {
    logger.error('[FOREX] Error allocating forex:', error);
    // W2 3i: allocating from a non-allocatable state (e.g. REJECTED) is
    // a state conflict, not a server error. allocateForex's from-state
    // guard throws a plain Error with no .code ("Cannot allocate forex:
    // invalid status transition from REJECTED to ALLOCATED ...",
    // forexService.ts:159) — and the same phrase in a ledger refusal
    // means the same thing. Map it to 409; genuine failures
    // (unavailable, endorsement, timeout, rate/policy mismatch) keep
    // the 503 below and genuine server errors the 500.
    if (/invalid status transition/i.test(error?.message || '')) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'FOREX_INVALID_STATUS',
          message: error.message
        },
        timestamp: new Date().toISOString()
      });
    }
    // Ledger-first failure (forexService.allocateForex): the chain call
    // failed, so NO allocation was recorded on-chain, in CouchDB, or in
    // Postgres — report 503, never a 200 with a phantom ALLOCATED row.
    if (error?.code === 'FOREX_ALLOCATE_FAILED') {
      return res.status(503).json({
        success: false,
        error: {
          code: 'FOREX_ALLOCATE_FAILED',
          message: error.message
        },
        timestamp: new Date().toISOString()
      });
    }
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

// POST /api/v1/forex/:forexID/allocate — Alias with forexID in path
router.post('/:forexID/allocate', authMiddleware, requireRole(['BANKS', 'BANK_ADMIN', 'BANK OFFICER', 'FOREX OFFICER', 'NBE', 'NBE_ADMIN', 'NBE OFFICER']), async (req, res) => {
  try {
    const { forexID } = req.params;
    const user = (req as any).user;
    const { lcId, amount, exchangeRate, retentionRate, officer, approvalRef, expiryDate } = req.body;
    
    if (!lcId) {
      return res.status(400).json({ 
        success: false, 
        error: { 
          code: 'MISSING_FIELDS', 
          message: 'lcId is required' 
        } 
      });
    }

    // E2E leg 1 (F16): the allocating officer is required — it used to
    // default silently to the caller (see the /allocate route above).
    if (!officer || !String(officer).trim()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Officer is required'
        },
        timestamp: new Date().toISOString()
      });
    }

    logger.info(`[FOREX] Allocating forex: ${forexID} with retention rate: ${retentionRate || '40% (default)'}`);

    // Use ForexService which includes 40% retention logic
    const result = await forexService.allocateForex({
      forexID,
      lcID: lcId,
      amount: amount ? Number(amount) : 0,
      exchangeRate: exchangeRate ? Number(exchangeRate) : 1,
      retentionRate: retentionRate ? Number(retentionRate) : 40,
      officer: String(officer).trim(),
      approvalRef: approvalRef || '',
      expiryDate: expiryDate || null,
      userId: user?.username || user?.sub,
      userOrg: user?.org || 'BanksMSP'
    });

    if (result.success) {
      logger.info(`✅ Forex allocated: ${forexID}, Retention Amount: ${result.retentionAmount}, Release Amount: ${result.releaseAmount}`);
      // In-app notification (persisted feed + live WS broadcast).
      await notificationService.emitWorkflowEvent({
        type: 'forex_allocated',
        title: `Forex ${forexID} allocated`,
        message: `Forex ${forexID} has been allocated for LC ${lcId} (USD ${Number(amount || 0).toLocaleString()}).`,
        entityType: 'forex', entityId: forexID, severity: 'success',
        roles: ['BANKS', 'NBE'], lcId,
        actionUrl: '/portals/exporter?tab=contracts',
        actionUrls: { BANKS: '/portals/banks?tab=contracts', NBE: '/portals/nbe?tab=contracts' },
      });
      
      res.status(200).json({
        success: true,
        message: 'Forex allocated successfully with retention policy',
        data: {
          forexID,
          lcID: lcId,
          retentionAmount: result.retentionAmount,
          releaseAmount: result.releaseAmount,
          txId: result.txId,
          blockchainSynced: (result as any).blockchainSynced ?? false,
          blockchainWarning: (result as any).blockchainWarning
        },
        timestamp: new Date().toISOString()
      });
    } else {
      // Defensive: allocateForex now throws a coded error on chain failure
      // instead of returning success:false, so this should not be reached.
      // Kept honest anyway — never report a failed allocation as 400/200.
      res.status(503).json({
        success: false,
        error: {
          code: 'FOREX_ALLOCATE_FAILED',
          message: 'Failed to allocate forex on the ledger; no allocation was recorded'
        },
        timestamp: new Date().toISOString()
      });
    }
  } catch (error: any) {
    logger.error('[FOREX] Error allocating forex:', error);
    // W2 3i: allocating from a non-allocatable state (e.g. REJECTED) is
    // a state conflict, not a server error — see the identical mapping
    // in the POST /allocate catch above.
    if (/invalid status transition/i.test(error?.message || '')) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'FOREX_INVALID_STATUS',
          message: error.message
        },
        timestamp: new Date().toISOString()
      });
    }
    // Ledger-first failure (forexService.allocateForex): the chain call
    // failed, so NO allocation was recorded on-chain, in CouchDB, or in
    // Postgres — report 503, never a 200 with a phantom ALLOCATED row.
    if (error?.code === 'FOREX_ALLOCATE_FAILED') {
      return res.status(503).json({
        success: false,
        error: {
          code: 'FOREX_ALLOCATE_FAILED',
          message: error.message
        },
        timestamp: new Date().toISOString()
      });
    }
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

// POST /api/v1/forex/utilize
router.post('/utilize', authMiddleware, requireRole(['BANKS', 'BANK_ADMIN', 'BANK OFFICER', 'FOREX OFFICER', 'NBE', 'NBE_ADMIN', 'NBE OFFICER']), async (req, res) => {
  try {
    const { forexId, utilizedAmount } = req.body;
    const user = (req as any).user;
    const role = String(user?.role || '').toUpperCase();
    
    // ✅ WORKFLOW ENFORCEMENT: Check if shipment exists before utilization
    // UCP 600 requires: LC → Forex Allocated → Shipment Created → Document Examination → Forex Utilized
    try {
      // Get the LC associated with this forex allocation
      const forexQuery = await postgresDb.query(
        'SELECT lc_id, contract_id FROM forex_allocations WHERE forex_id = $1',
        [forexId]
      );
      
      if (forexQuery.rows.length > 0) {
        const { lc_id, contract_id } = forexQuery.rows[0];
        
        // Check if a shipment exists for this contract/LC
        const shipmentQuery = await postgresDb.query(
          'SELECT shipment_id FROM shipments WHERE contract_id = $1 OR lc_id = $2 LIMIT 1',
          [contract_id, lc_id]
        );
        
        if (shipmentQuery.rows.length === 0) {
          logger.warn(`Forex utilization blocked: No shipment exists for forex ${forexId}, LC ${lc_id}, contract ${contract_id}`);
          return res.status(400).json({ 
            success: false, 
            error: { 
              code: 'SHIPMENT_REQUIRED', 
              message: 'Forex cannot be utilized before shipment creation. Please create a shipment first to comply with UCP 600 workflow requirements.' 
            }, 
            timestamp: new Date().toISOString() 
          });
        }
        
        logger.info(`Forex utilization validation passed: Shipment exists for forex ${forexId}`);
      }
    } catch (validationError) {
      logger.error('Shipment validation error (continuing with utilization):', validationError);
      // Continue if validation check fails - don't block legitimate operations
    }
    
    await fabricService.connectAsOrg(role.startsWith('NBE') ? 'NBEMSP' : 'BanksMSP');
    const result = await fabricService.invokeChaincode('UtilizeForex', [forexId, utilizedAmount.toString()]);
    if (result.success) {
      // ✅ UPDATE DATABASE with utilization
      try {
        await postgresDb.query(
          `UPDATE forex_allocations 
           SET status = $1, 
               utilization_date = $2,
               updated_at = $2
           WHERE forex_id = $3`,
          ['UTILIZED', new Date(), forexId]
        );
      } catch (dbError) {
        logger.error('Failed to update forex in database:', dbError);
        // Continue even if DB update fails - blockchain is source of truth
      }
      
      // ✅ Record blockchain signature for utilization
      try {
        const user = (req as any).user;
        await signatureService.recordSignature({
          entityType: 'FOREX_ALLOCATION',
          entityId: forexId,
          actionType: 'UTILIZE',
          signerUsername: user?.username || user?.sub || 'exporter',
          signerOrg: user?.org || user?.organization || 'ExportersMSP',
          signerRole: user?.role || 'exporter',
          blockchainTxId: result.txId,
          blockchainTimestamp: new Date(),
          chaincodeName: 'coffee',
          chaincodeFunction: 'UtilizeForex',
          transactionArgs: [forexId, utilizedAmount.toString()],
          metadata: {
            forexId,
            utilizedAmount
          }
        });
      } catch (sigError) {
        logger.error('Failed to record blockchain signature:', sigError);
      }
      
      // Audit: this inline chain move never called the audited
      // forexService method, so it left no audit_trail row.
      // Best-effort — a failed audit write must not fail the move.
      await logAuditBestEffort(req, {
        entityType: 'FOREX',
        entityId: forexId,
        action: 'UTILIZE',
        blockchainTxId: result.txId || undefined,
        metadata: { utilizedAmount, blockchainTxId: result.txId || null },
      }, `forex ${forexId} utilize`);
      // In-app notification (persisted feed + live WS broadcast).
      // Forex utilisation previously emitted nothing, so another
      // bank/NBE user never heard about it live. The exporter audience
      // resolves from the forex_allocations row (entityType 'forex').
      await notificationService.emitWorkflowEvent({
        type: 'forex_utilised',
        title: `Forex ${forexId} utilised`,
        message: `Forex ${forexId} was utilised (${utilizedAmount}).`,
        entityType: 'forex', entityId: forexId, severity: 'success',
        roles: ['BANKS', 'NBE'],
        actionUrl: '/portals/exporter?tab=contracts',
        actionUrls: { BANKS: '/portals/banks?tab=contracts', NBE: '/portals/nbe?tab=contracts' },
      });
      res.json({ success: true, txId: result.txId, timestamp: new Date().toISOString() });
    } else {
      res.status(400).json({ success: false, error: { code: 'UTILIZE_FAILED', message: result.error }, timestamp: new Date().toISOString() });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message }, timestamp: new Date().toISOString() });
  }
});

// ==================== SINGLE FOREX RECORD (MUST BE LAST) ====================

// GET /api/v1/forex/:forexId — single forex record

export default router;
