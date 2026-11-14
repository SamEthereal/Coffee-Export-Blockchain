// Shared best-effort audit helper.
//
// Many live routes do their own inline chain invoke and never call the
// audited service methods, so those operations left no audit_trail row
// (see ~/workspace/audit-coverage/audit-map.md). The fix pattern —
// established by the payment-settle audit row in routes/payments.ts
// (commit 9ca9702f) — is: after the chain call succeeds and the PG
// mirror is written, call auditService.log() best-effort with the
// operation's own chain txId as `blockchainTxId` (top-level AND in
// metadata), inside a try/catch so a failed audit write can never turn
// a committed operation into a 500.
//
// This helper is that pattern in one place. Call sites pass the
// operation's txId variable; when an operation has no on-chain txId
// (pure PG step) the caller omits blockchainTxId and the row is
// honestly written without one — never an invented txId.
// auditService.log() itself never throws, so this is doubly safe.
import { logger } from './logger';
import type { AuditLogEntry } from '../services/auditService';

export interface AuditBestEffortEntry {
  entityType: string;
  entityId: string;
  action: string;
  oldValue?: string;
  newValue?: string;
  reason?: string;
  metadata?: any;
  /** The operation's own on-chain txId (e.g. result.txId). Omit for PG-only steps. */
  blockchainTxId?: string;
}

export async function logAuditBestEffort(
  req: any,
  entry: AuditBestEffortEntry,
  label: string,
): Promise<void> {
  const user = (req && req.user) || {};
  return logAuditBestEffortForUser(user, entry, label);
}

/**
 * Same best-effort write, for code that has no `req` in scope (shared
 * helpers such as shipping.ts mirrorBookingStatusToShipment). Pass the
 * acting user when the caller has one; otherwise attribution falls back
 * to 'system' — the row is still written, honestly without a user.
 */
export async function logAuditBestEffortForUser(
  user: { username?: string; email?: string; organization?: string } | undefined | null,
  entry: AuditBestEffortEntry,
  label: string,
): Promise<void> {
  try {
    const { AuditService } = await import('../services/auditService');
    const u = user || {};
    const auditEntry: AuditLogEntry = {
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      performedBy: u.username || u.email || 'system',
      organization: u.organization || 'BANKS',
      performedByOrg: u.organization || 'BANKS',
      oldValue: entry.oldValue,
      newValue: entry.newValue,
      reason: entry.reason,
      metadata: entry.metadata,
      // Shared audit contract: top-level operation txId — never the
      // audit log's own CreateAuditLog txId, never an invented value.
      blockchainTxId: entry.blockchainTxId || undefined,
    };
    await AuditService.getInstance().log(auditEntry);
  } catch (auditErr) {
    logger.warn(`[AUDIT] Could not write audit row (${label}):`, auditErr);
  }
}
