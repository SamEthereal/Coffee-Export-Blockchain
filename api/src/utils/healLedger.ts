// Ledger-truth heal helpers (2026-11-19, pg-ledger-equality fix round).
//
// The PG-vs-ledger equality audit (~/workspace/pg-ledger-equality-20261119)
// found genuine divergences in forex, shipments, payments and
// repatriation: lifecycle steps that advanced the ledger without ever
// mirroring to Postgres (missed allocate/settle/confirm/verify/waive
// mirrors, Nov 11-12 direct-write paths, and the Nov-15 repatriation
// test writing synthetic rows). The LC side already had this pattern —
// D5 autoHealLCStatus (routes/banking.ts) heals letters_of_credit from
// the ledger at read time, and POST /banking/lc/resync backfills missing
// LC rows. These helpers are the same pattern for the other four
// entities, shared by the four /resync endpoints and the GET /forex
// read-time reconciliation.
//
// Rules, in every function here:
//   - The LEDGER is the source of truth. Postgres is healed FROM it.
//     Nothing here ever writes to the chain, and nothing ever deletes
//     a Postgres row to force the counts equal.
//   - Every heal writes an audit_trail row (AUTO_HEAL_STATUS, RESYNC
//     for backfilled rows, FLAG_PHANTOM for PG-only rows) so the heal
//     itself is traceable. Best-effort: a failed audit write never
//     fails the heal.
//   - Every function is idempotent: re-running it after a heal is a
//     no-op (status already equal / row already exists / flag already
//     set), and reports exactly that.
//   - Every function is fail-soft: a missing PG row, an unknown ledger
//     status or a DB error is logged and reported, never thrown — the
//     caller decides the HTTP status.

import { DatabaseService } from '../services/databaseService';
import { FabricService } from '../services/fabricService';
import { logger } from './logger';

const dbService = DatabaseService.getInstance();
const fabricService = FabricService.getInstance();

export type HealActor =
  | { username?: string; email?: string; organization?: string }
  | undefined
  | null;

/** Same bound as the D5 LC reconciliation: a slow ledger read falls back. */
const LEDGER_MAP_TIMEOUT_MS = 10000;

export interface HealResult {
  healed: boolean;
  oldStatus?: string | null;
  newStatus?: string | null;
  reason?: string;
}

async function auditHeal(
  actor: HealActor,
  entityType: string,
  entityId: string,
  action: string,
  oldStatus: string | null | undefined,
  newStatus: string | null | undefined,
  reason: string,
): Promise<void> {
  // PG-only audit insert, exactly like D5 autoHealLCStatus
  // (routes/banking.ts). AuditService.log() submits a CreateAuditLog
  // chaincode transaction per row (~4-5 s each with endorsement), so a
  // resync healing 20-37 rows through it takes minutes and outlives a
  // normal client timeout — the shipments resync proved it (client
  // timed out at 180 s even though every heal had landed). The heal
  // itself is a PG-side correction from ledger truth; its audit row
  // belongs in audit_trail, not on the chain. Best-effort: a failed
  // audit insert never fails the heal.
  try {
    const performedBy = (actor as any)?.username || (actor as any)?.email || 'SYSTEM';
    const performedByOrg = (actor as any)?.organization || 'SYSTEM';
    await dbService.run(
      `INSERT INTO audit_trail (
        entity_type, entity_id, action, performed_by, performed_by_org,
        old_value, new_value, reason, metadata, ip_address
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        entityType,
        entityId,
        action,
        performedBy,
        performedByOrg,
        oldStatus ? JSON.stringify({ status: oldStatus }) : null,
        newStatus ? JSON.stringify({ status: newStatus }) : null,
        reason,
        JSON.stringify({ entityId, oldStatus: oldStatus ?? null, newStatus: newStatus ?? null, autoHealed: true, source: 'ledger', timestamp: new Date().toISOString() }),
        'system',
      ],
    );
  } catch (err: any) {
    logger.warn(`[HEAL] ⚠️ Could not write heal audit row for ${entityType} ${entityId}:`, err?.message || err);
  }
}

/**
 * One bounded ledger read, as a Map<id, doc>. Returns null when the
 * ledger cannot be read in time or the query fails — callers fall back
 * to Postgres-only behaviour and report LEDGER_UNAVAILABLE, never hang.
 */
async function fetchLedgerDocMap(
  label: string,
  query: () => Promise<any>,
  idFields: string[],
  dropIf?: (doc: any) => boolean,
): Promise<Map<string, any> | null> {
  try {
    const result = await Promise.race([
      query(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), LEDGER_MAP_TIMEOUT_MS)),
    ]);
    if (!result || !(result as any).success || !Array.isArray((result as any).data)) {
      if (result === null) {
        logger.warn(`[HEAL] ⚠️ Ledger ${label} map skipped: query timed out after ${LEDGER_MAP_TIMEOUT_MS}ms`);
      } else {
        logger.warn(`[HEAL] ⚠️ Ledger ${label} map skipped: query unsuccessful`);
      }
      return null;
    }
    const map = new Map<string, any>();
    for (const doc of (result as any).data as any[]) {
      if (dropIf && dropIf(doc)) continue;
      const id = String(
        idFields.map((f) => doc?.[f]).find((v) => v !== undefined && v !== null && String(v).trim() !== '') || '',
      ).trim();
      if (id) map.set(id, doc);
    }
    logger.info(`[HEAL] 🔗 Ledger ${label} map loaded: ${map.size} docs`);
    return map;
  } catch (err: any) {
    logger.warn(`[HEAL] ⚠️ Ledger ${label} map skipped:`, err?.message || err);
    return null;
  }
}

const ledgerStatusOf = (doc: any): string =>
  String(doc?.status || doc?.Status || '').trim().toUpperCase();

export function fetchLedgerForexMap(): Promise<Map<string, any> | null> {
  return fetchLedgerDocMap('forex', () => fabricService.queryAllForex(), ['forexId', 'forexID', 'id']);
}

export function fetchLedgerShipmentMap(): Promise<Map<string, any> | null> {
  return fetchLedgerDocMap('shipments', () => fabricService.getAllShipments(), ['shipmentId', 'shipmentID', 'id']);
}

export function fetchLedgerPaymentMap(): Promise<Map<string, any> | null> {
  // QueryAllPayments also matches the 20 repatriation docs (they carry
  // paymentId — payment.go:1367, seq-26 chaincode fix pending), so drop
  // any doc that carries a repatriationId: those are repatriations, not
  // payments. True ledger payments: 202, not 222.
  return fetchLedgerDocMap(
    'payments',
    () => fabricService.queryChaincode('QueryAllPayments', []),
    ['paymentId', 'paymentID', 'id'],
    (doc) => !!(doc?.repatriationId || doc?.repatriationID),
  );
}

export function fetchLedgerRepatriationMap(): Promise<Map<string, any> | null> {
  return fetchLedgerDocMap(
    'repatriation',
    () => fabricService.evaluateTransaction('QueryAllRepatriations'),
    ['repatriationId', 'repatriationID', 'id'],
  );
}

// ---------------------------------------------------------------- forex

const KNOWN_FOREX_STATUSES = new Set([
  'REQUESTED', 'CONFIRMED', 'ALLOCATED', 'UTILIZED', 'APPROVED', 'REPATRIATED', 'REJECTED',
]);

export async function healForexRow(
  forexId: string,
  chainStatus: string,
  actor: HealActor,
  allocatedAmount?: number | null,
): Promise<HealResult> {
  const target = chainStatus.trim().toUpperCase();
  if (!KNOWN_FOREX_STATUSES.has(target)) {
    return { healed: false, reason: `unknown ledger status ${chainStatus || '(none)'}` };
  }
  try {
    const row: any = await dbService.get(
      `SELECT status FROM forex_allocations WHERE forex_id = $1 OR allocation_id = $1`,
      [forexId],
    );
    if (!row) return { healed: false, reason: 'no PG row' };
    if (String(row.status).toUpperCase() === target) {
      return { healed: false, oldStatus: row.status, newStatus: target, reason: 'already equal' };
    }
    const hasAmount = typeof allocatedAmount === 'number' && Number.isFinite(allocatedAmount);
    await dbService.run(
      hasAmount
        ? `UPDATE forex_allocations SET status = $1, allocated_amount = $2, updated_at = NOW()
           WHERE forex_id = $3 OR allocation_id = $3`
        : `UPDATE forex_allocations SET status = $1, updated_at = NOW()
           WHERE forex_id = $2 OR allocation_id = $2`,
      hasAmount ? [target, allocatedAmount, forexId] : [target, forexId],
    );
    await auditHeal(actor, 'FOREX', forexId, 'AUTO_HEAL_STATUS', row.status, target,
      'Healed forex_allocations status from ledger truth (pg-ledger-equality fix round)');
    logger.info(`[HEAL] ✅ Forex ${forexId}: ${row.status} → ${target}`);
    return { healed: true, oldStatus: row.status, newStatus: target };
  } catch (err: any) {
    logger.warn(`[HEAL] ⚠️ Failed to heal forex ${forexId}:`, err?.message || err);
    return { healed: false, reason: String(err?.message || err) };
  }
}

/**
 * The two Nov-15 synthetic rows (FOREX-REPAT-TXID-20261115[-B]) have no
 * ledger doc: the repatriation handler inserted a forex_allocations row
 * (NULL blockchain_tx_id) instead of reusing the real forex id, while
 * the LCs they point at are SETTLED on-ledger and already have real
 * ALLOCATED ledger forex docs. They are NOT deleted — forex_repatriations
 * rows reference them — and they are NOT left ALLOCATED (that inflates
 * the Banks Forex Allocated KPI). Their honest status is REPATRIATED:
 * the repatriation they were created for completed. Documented as
 * accepted artefacts, corrected in place.
 */
export async function markForexSyntheticRepatriated(
  forexId: string,
  actor: HealActor,
): Promise<HealResult> {
  try {
    const row: any = await dbService.get(
      `SELECT status FROM forex_allocations WHERE forex_id = $1 OR allocation_id = $1`,
      [forexId],
    );
    if (!row) return { healed: false, reason: 'no PG row' };
    if (String(row.status).toUpperCase() === 'REPATRIATED') {
      return { healed: false, oldStatus: row.status, newStatus: 'REPATRIATED', reason: 'already REPATRIATED' };
    }
    await dbService.run(
      `UPDATE forex_allocations SET status = 'REPATRIATED', updated_at = NOW()
       WHERE forex_id = $1 OR allocation_id = $1`,
      [forexId],
    );
    await auditHeal(actor, 'FOREX', forexId, 'HEAL_SYNTHETIC', row.status, 'REPATRIATED',
      'Synthetic Nov-15 repatriation-test row (no ledger doc; LC SETTLED with a real ALLOCATED ledger forex doc). Kept, not deleted — forex_repatriations references it — and corrected ALLOCATED → REPATRIATED so it no longer inflates the Forex Allocated KPI.');
    logger.info(`[HEAL] ✅ Forex synthetic ${forexId}: ${row.status} → REPATRIATED`);
    return { healed: true, oldStatus: row.status, newStatus: 'REPATRIATED' };
  } catch (err: any) {
    logger.warn(`[HEAL] ⚠️ Failed to mark synthetic forex ${forexId}:`, err?.message || err);
    return { healed: false, reason: String(err?.message || err) };
  }
}

// ------------------------------------------------------------- shipments

const KNOWN_SHIPMENT_STATUSES = new Set([
  'CREATED', 'REGISTERED', 'FREIGHT_BOOKED', 'BOOKED', 'PERMIT_ISSUED',
  'CUSTOMS_CLEARED', 'CUSTOMS_REJECTED', 'CUSTOMS_DECLARED',
  'INSPECTION_PENDING', 'INSPECTION_COMPLETE', 'LAND_TRANSPORT',
  'PORT_ARRIVED', 'CONTAINER_STUFFED', 'VESSEL_LOADED', 'DEPARTED',
  'IN_TRANSIT', 'DESTINATION_ARRIVED', 'ARRIVED', 'DELIVERED', 'LOADED',
  'CANCELLED', 'QUALITY_PENDING', 'COMPLETED',
]);

export async function healShipmentRow(
  shipmentId: string,
  chainStatus: string,
  actor: HealActor,
): Promise<HealResult> {
  const target = chainStatus.trim().toUpperCase();
  if (!KNOWN_SHIPMENT_STATUSES.has(target)) {
    return { healed: false, reason: `unknown ledger status ${chainStatus || '(none)'}` };
  }
  try {
    const row: any = await dbService.get(
      `SELECT status FROM shipments WHERE shipment_id = $1`,
      [shipmentId],
    );
    if (!row) return { healed: false, reason: 'no PG row' };
    if (String(row.status).toUpperCase() === target) {
      return { healed: false, oldStatus: row.status, newStatus: target, reason: 'already equal' };
    }
    await dbService.run(
      `UPDATE shipments SET status = $1, updated_at = NOW() WHERE shipment_id = $2`,
      [target, shipmentId],
    );
    await auditHeal(actor, 'SHIPMENT', shipmentId, 'AUTO_HEAL_STATUS', row.status, target,
      'Healed shipments status from ledger truth (pg-ledger-equality fix round)');
    logger.info(`[HEAL] ✅ Shipment ${shipmentId}: ${row.status} → ${target}`);
    return { healed: true, oldStatus: row.status, newStatus: target };
  } catch (err: any) {
    logger.warn(`[HEAL] ⚠️ Failed to heal shipment ${shipmentId}:`, err?.message || err);
    return { healed: false, reason: String(err?.message || err) };
  }
}

/**
 * The 13 Nov-11 PG-only shipment phantoms have no ledger doc, an empty
 * blockchain_tx_id and zero audit rows — the chain write never happened
 * but the row was marked blockchain_synced=true. They are NOT deleted
 * (they are test history; other workers may still need them). The honest
 * correction is to clear the false synced flag so nothing downstream
 * treats them as on-chain, and to leave an audit row saying so.
 */
export async function flagShipmentPhantom(
  shipmentId: string,
  actor: HealActor,
): Promise<HealResult> {
  try {
    const row: any = await dbService.get(
      `SELECT status, blockchain_tx_id, blockchain_synced FROM shipments WHERE shipment_id = $1`,
      [shipmentId],
    );
    if (!row) return { healed: false, reason: 'no PG row' };
    const hasTx = !!(row.blockchain_tx_id && String(row.blockchain_tx_id).trim() !== '');
    if (hasTx) {
      return { healed: false, reason: 'has a blockchain_tx_id — not a phantom, refusing to flag' };
    }
    if (row.blockchain_synced === false) {
      return { healed: false, oldStatus: row.status, reason: 'already flagged unsynced' };
    }
    await dbService.run(
      `UPDATE shipments SET blockchain_synced = false, updated_at = NOW() WHERE shipment_id = $1`,
      [shipmentId],
    );
    await auditHeal(actor, 'SHIPMENT', shipmentId, 'FLAG_PHANTOM', row.status, row.status,
      'PG-only phantom (Nov-11 test round): no ledger doc, empty blockchain_tx_id, zero audit rows. Row kept, never deleted; blockchain_synced corrected true → false so it is no longer presented as on-chain.');
    logger.info(`[HEAL] ✅ Shipment phantom ${shipmentId} flagged unsynced (status kept ${row.status})`);
    return { healed: true, oldStatus: row.status, newStatus: row.status };
  } catch (err: any) {
    logger.warn(`[HEAL] ⚠️ Failed to flag shipment phantom ${shipmentId}:`, err?.message || err);
    return { healed: false, reason: String(err?.message || err) };
  }
}

// -------------------------------------------------------------- payments

const KNOWN_PAYMENT_STATUSES = new Set([
  'PENDING', 'DOCUMENTS_SUBMITTED', 'VERIFIED', 'REJECTED', 'SWIFT_INITIATED',
  'SWIFT_RECEIVED', 'SWIFT_FAILED', 'SETTLED', 'CONFIRMED', 'DOCUMENTS_RELEASED',
  'COMPLETED', 'CANCELLED',
]);

export async function healPaymentRow(
  paymentId: string,
  chainStatus: string,
  actor: HealActor,
): Promise<HealResult> {
  const target = chainStatus.trim().toUpperCase();
  if (!KNOWN_PAYMENT_STATUSES.has(target)) {
    return { healed: false, reason: `unknown ledger status ${chainStatus || '(none)'}` };
  }
  try {
    const row: any = await dbService.get(
      `SELECT status FROM payments WHERE payment_id = $1`,
      [paymentId],
    );
    if (!row) return { healed: false, reason: 'no PG row' };
    if (String(row.status).toUpperCase() === target) {
      return { healed: false, oldStatus: row.status, newStatus: target, reason: 'already equal' };
    }
    // payments has no updated_at column.
    await dbService.run(
      `UPDATE payments SET status = $1 WHERE payment_id = $2`,
      [target, paymentId],
    );
    await auditHeal(actor, 'PAYMENT', paymentId, 'AUTO_HEAL_STATUS', row.status, target,
      'Healed payments status from ledger truth (pg-ledger-equality fix round)');
    logger.info(`[HEAL] ✅ Payment ${paymentId}: ${row.status} → ${target}`);
    return { healed: true, oldStatus: row.status, newStatus: target };
  } catch (err: any) {
    logger.warn(`[HEAL] ⚠️ Failed to heal payment ${paymentId}:`, err?.message || err);
    return { healed: false, reason: String(err?.message || err) };
  }
}

// ---------------------------------------------------------- repatriation

const KNOWN_REPAT_STATUSES = new Set([
  'PENDING', 'PARTIAL', 'READY_FOR_VERIFICATION', 'OVERDUE', 'COMPLIED',
  'NON_COMPLIANT', 'WAIVED',
]);

/** Ledger field → PG column mapping for a read-back mirror. */
function repatMirrorSets(doc: any): { sets: string[]; params: any[] } {
  const sets: string[] = [];
  const params: any[] = [];
  const put = (col: string, value: any) => {
    params.push(value);
    sets.push(`${col} = $${params.length}`);
  };
  const num = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const str = (v: any) => {
    const s = v === undefined || v === null ? '' : String(v).trim();
    return s === '' ? null : s;
  };
  const status = ledgerStatusOf(doc);
  if (KNOWN_REPAT_STATUSES.has(status)) put('status', status);
  const repatAmt = num(doc?.repatriatedAmount ?? doc?.RepatriatedAmount);
  if (repatAmt !== null) put('repatriated_amount', repatAmt);
  const convAmt = num(doc?.convertedAmount ?? doc?.ConvertedAmount);
  if (convAmt !== null) put('converted_amount', convAmt);
  const convBirr = num(doc?.convertedAmountBirr ?? doc?.ConvertedAmountBirr);
  if (convBirr !== null) put('converted_amount_birr', convBirr);
  const rate = num(doc?.exchangeRate ?? doc?.ExchangeRate);
  if (rate !== null && rate > 0) put('exchange_rate', rate);
  const repatDate = str(doc?.repatriationDate ?? doc?.RepatriationDate);
  if (repatDate) put('repatriation_date', repatDate);
  const compDate = str(doc?.complianceDate ?? doc?.ComplianceDate);
  if (compDate) put('compliance_date', compDate);
  const verBy = str(doc?.verifiedBy ?? doc?.VerifiedBy);
  if (verBy) put('verified_by', verBy);
  const verMsp = str(doc?.verifiedByMsp ?? doc?.VerifiedByMSP ?? doc?.VerifiedByMsp);
  if (verMsp) put('verified_by_msp', verMsp);
  const verDate = str(doc?.verificationDate ?? doc?.VerificationDate);
  if (verDate) put('verification_date', verDate);
  const verRef = str(doc?.verificationRef ?? doc?.VerificationRef);
  if (verRef) put('verification_ref', verRef);
  const verNotes = str(doc?.verificationNotes ?? doc?.VerificationNotes);
  if (verNotes) put('verification_notes', verNotes);
  if (typeof doc?.isOverdue === 'boolean') put('is_overdue', doc.isOverdue);
  if (typeof doc?.waiverRequested === 'boolean') put('waiver_requested', doc.waiverRequested);
  if (typeof doc?.waiverApproved === 'boolean') put('waiver_approved', doc.waiverApproved);
  const waiverReason = str(doc?.waiverReason ?? doc?.WaiverReason);
  if (waiverReason) put('waiver_reason', waiverReason);
  const waiverDate = str(doc?.waiverDate ?? doc?.WaiverDate);
  if (waiverDate) put('waiver_date', waiverDate);
  const recBy = str(doc?.recordedBy ?? doc?.RecordedBy);
  if (recBy) put('recorded_by', recBy);
  const recMsp = str(doc?.recordedByMsp ?? doc?.RecordedByMSP ?? doc?.RecordedByMsp);
  if (recMsp) put('recorded_by_msp', recMsp);
  const bankCert = str(doc?.bankCertificate ?? doc?.BankCertificate);
  if (bankCert) put('bank_certificate', bankCert);
  return { sets, params };
}

/** Mirror one ledger repatriation doc onto its PG row (status + amounts). */
export async function healRepatriationRow(
  repatriationId: string,
  doc: any,
  actor: HealActor,
): Promise<HealResult> {
  const target = ledgerStatusOf(doc);
  if (!KNOWN_REPAT_STATUSES.has(target)) {
    return { healed: false, reason: `unknown ledger status ${target || '(none)'}` };
  }
  try {
    const row: any = await dbService.get(
      `SELECT status FROM export_proceeds_repatriation WHERE repatriation_id = $1`,
      [repatriationId],
    );
    if (!row) return { healed: false, reason: 'no PG row' };
    const { sets, params } = repatMirrorSets(doc);
    if (sets.length === 0) return { healed: false, reason: 'nothing to mirror' };
    const statusChanged = String(row.status).toUpperCase() !== target;
    params.push(repatriationId);
    await dbService.run(
      `UPDATE export_proceeds_repatriation SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE repatriation_id = $${params.length}`,
      params,
    );
    // The UPDATE always refreshes amounts/dates from the ledger (e.g.
    // REP-PROBE-20261115 kept repatriated_amount 0 in PG while the
    // ledger holds 110000); the heal counts when the status moved.
    if (statusChanged) {
      await auditHeal(actor, 'REPATRIATION', repatriationId, 'AUTO_HEAL_STATUS', row.status, target,
        'Healed export_proceeds_repatriation status/amounts from ledger truth (pg-ledger-equality fix round)');
      logger.info(`[HEAL] ✅ Repatriation ${repatriationId}: ${row.status} → ${target}`);
      return { healed: true, oldStatus: row.status, newStatus: target };
    }
    return { healed: false, oldStatus: row.status, newStatus: target, reason: 'status already equal (amounts refreshed from ledger)' };
  } catch (err: any) {
    logger.warn(`[HEAL] ⚠️ Failed to heal repatriation ${repatriationId}:`, err?.message || err);
    return { healed: false, reason: String(err?.message || err) };
  }
}

/**
 * Backfill a ledger-only repatriation into export_proceeds_repatriation.
 * INSERT-only, ON CONFLICT DO NOTHING — a repeat call is a no-op.
 * Amounts/dates/identities come from the ledger doc, never invented:
 * a doc without an export amount or a compliance deadline is skipped,
 * not inserted with a placeholder.
 */
export async function backfillRepatriation(
  doc: any,
  actor: HealActor,
): Promise<{ inserted: boolean; repatriationId: string; reason?: string }> {
  const id = String(doc?.repatriationId || doc?.repatriationID || doc?.id || '').trim();
  const status = ledgerStatusOf(doc);
  if (!id) return { inserted: false, repatriationId: '', reason: 'no repatriationId on ledger doc' };
  if (!KNOWN_REPAT_STATUSES.has(status)) {
    return { inserted: false, repatriationId: id, reason: `unknown ledger status ${status || '(none)'}` };
  }
  const exportAmount = typeof doc?.exportAmount === 'number' ? doc.exportAmount : null;
  const deadline = String(doc?.complianceDeadline || doc?.ComplianceDeadline || '').trim();
  if (exportAmount === null || !deadline) {
    return { inserted: false, repatriationId: id, reason: 'ledger doc lacks exportAmount or complianceDeadline — refusing to invent them' };
  }
  const shipDateRaw = String(doc?.shipmentDate || doc?.ShipmentDate || '').trim();
  try {
    const inserted: any = await dbService.run(
      `INSERT INTO export_proceeds_repatriation (
        repatriation_id, payment_id, contract_id, shipment_id, exporter_id,
        export_amount, currency, required_retention, required_conversion,
        retention_percentage, conversion_percentage,
        repatriated_amount, converted_amount, converted_amount_birr, exchange_rate,
        fcy_account_number, fcy_bank, fcy_bank_bic,
        status, compliance_deadline, shipment_date, repatriation_date, compliance_date,
        is_overdue, verified_by, verified_by_msp, verification_date, verification_ref,
        verification_notes, waiver_requested, waiver_approved, waiver_reason, waiver_date,
        recorded_by, recorded_by_msp, bank_certificate, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
        $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36,
        NOW(), NOW()
      ) ON CONFLICT (repatriation_id) DO NOTHING RETURNING repatriation_id`,
      [
        id,
        doc?.paymentId || doc?.PaymentId || null,
        doc?.contractId || doc?.ContractId || null,
        doc?.shipmentId || doc?.ShipmentId || null,
        doc?.exporterId || doc?.ExporterId || null,
        exportAmount,
        doc?.currency || doc?.Currency || 'USD',
        doc?.requiredRetention ?? null,
        doc?.requiredConversion ?? null,
        doc?.retentionPercentage ?? 40,
        doc?.conversionPercentage ?? 60,
        doc?.repatriatedAmount ?? 0,
        doc?.convertedAmount ?? 0,
        doc?.convertedAmountBirr ?? 0,
        doc?.exchangeRate && Number(doc.exchangeRate) > 0 ? Number(doc.exchangeRate) : null,
        doc?.fcyAccountNumber || null,
        doc?.fcyBank || null,
        doc?.fcyBankBic || null,
        status,
        deadline,
        shipDateRaw ? shipDateRaw.slice(0, 10) : null,
        doc?.repatriationDate ? String(doc.repatriationDate) : null,
        doc?.complianceDate ? String(doc.complianceDate) : null,
        !!doc?.isOverdue,
        doc?.verifiedBy || null,
        doc?.verifiedByMsp || doc?.VerifiedByMSP || null,
        doc?.verificationDate ? String(doc.verificationDate) : null,
        doc?.verificationRef || null,
        doc?.verificationNotes || null,
        !!doc?.waiverRequested,
        !!doc?.waiverApproved,
        doc?.waiverReason || null,
        doc?.waiverDate ? String(doc.waiverDate) : null,
        doc?.recordedBy || null,
        doc?.recordedByMsp || doc?.RecordedByMSP || null,
        doc?.bankCertificate || null,
      ],
    );
    if (inserted && (inserted as any).rowCount > 0) {
      await auditHeal(actor, 'REPATRIATION', id, 'RESYNC', null, status,
        'Backfilled missing PG row from ledger truth (pg-ledger-equality fix round)');
      logger.info(`[HEAL] ✅ Repatriation ${id} backfilled from ledger (${status})`);
      return { inserted: true, repatriationId: id };
    }
    return { inserted: false, repatriationId: id, reason: 'already exists' };
  } catch (err: any) {
    logger.warn(`[HEAL] ⚠️ Failed to backfill repatriation ${id}:`, err?.message || err);
    return { inserted: false, repatriationId: id, reason: String(err?.message || err) };
  }
}
