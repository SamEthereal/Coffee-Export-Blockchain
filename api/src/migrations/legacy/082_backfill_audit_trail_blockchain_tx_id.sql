-- Migration 082: backfill audit_trail.blockchain_tx_id from the values
-- auditService.log() already knew but never persisted.
--
-- The column exists since migration 005, but log() never wrote it, so it
-- is NULL on every legacy row. log() now persists it (operation txId when
-- the caller passes one, else the audit log's own CreateAuditLog txId).
-- This migration recovers what can be recovered honestly, and nothing else:
--
-- 1. Rows whose metadata JSONB already carries blockchainTxId: that value
--    IS the audit log's own CreateAuditLog txId (log() always overwrote
--    any caller-supplied value in metadata with its own txId), so copying
--    it into the column is exact. Only well-formed 64-hex Fabric txIds
--    are copied. Measured 2026-11-14 on the dev database: 871 rows, all
--    distinct, all valid 64-hex, zero duplicates.
--
-- 2. Rows with no metadata txId whose OPERATION txId is recoverable from
--    blockchain_signatures: same entity_type + same entity_id + same
--    action (via the tense/name map below) + |created_at -
--    blockchain_timestamp| <= 5 seconds + exactly ONE matching signature
--    row (a second candidate disqualifies the row). Measured 2026-11-14:
--    59 rows match (FOREX CONFIRM -> CONFIRMED x51, LC EXAMINE_DOCUMENTS
--    -> DOCUMENT_EXAMINATION x8), all with |skew| <= 0.11s, zero ambiguous.
--
-- 3. Rows whose OPERATION txId the direct-INSERT writers stored under
--    metadata->>'transactionId' (routes/contracts.ts, routes/banking.ts):
--    same-row direct key, valid 64-hex only. Measured 2026-11-14: 191
--    rows (CONTRACT APPROVE x181, REJECT x7, RESUBMIT x3), all valid.
--
-- 4. Everything else stays NULL — honestly. Measured 2026-11-14: 9 rows
--    have no recoverable txId (DOCUMENT VIEW x4 — reads, no chain tx
--    exists; DOCUMENT SIGNATURE_APPROVE x3 — the only signature row for
--    the document is its registration, a different operation; EXPORTER_
--    APPLICATION SUBMIT x2 — PG-only rows, no txId recorded anywhere).
--    No txId is invented for them.
--
-- The runner (api/src/utils/runMigrations.ts) reads this directory sorted
-- by filename and tracks applied files by name in _schema_migrations, so
-- 082 runs once, after 081, on this machine and on the host.

-- 0. The column already exists (migration 005); re-assert for safety.
ALTER TABLE audit_trail ADD COLUMN IF NOT EXISTS blockchain_tx_id VARCHAR(255);

-- 1. Backfill from metadata: the audit log's own CreateAuditLog txId.
UPDATE audit_trail
SET blockchain_tx_id = metadata->>'blockchainTxId'
WHERE blockchain_tx_id IS NULL
  AND metadata->>'blockchainTxId' ~ '^[0-9a-f]{64}$';

-- 2. Backfill the operation txId from blockchain_signatures, exact
--    matches only (same entity + mapped action + within 5s + unique).
UPDATE audit_trail a
SET blockchain_tx_id = s.blockchain_tx_id
FROM blockchain_signatures s
WHERE a.blockchain_tx_id IS NULL
  AND s.entity_type = a.entity_type
  AND s.entity_id = a.entity_id
  AND s.blockchain_tx_id ~ '^[0-9a-f]{64}$'
  AND s.action_type = CASE a.action
    WHEN 'CONFIRM' THEN 'CONFIRMED'
    WHEN 'EXAMINE_DOCUMENTS' THEN 'DOCUMENT_EXAMINATION'
    WHEN 'APPROVE' THEN 'APPROVED'
    WHEN 'CREATE' THEN 'REGISTER'
    WHEN 'REQUEST' THEN CASE WHEN a.entity_type = 'LC' THEN 'LC_REQUESTED' ELSE 'REQUEST' END
    WHEN 'RELEASE' THEN 'RETENTION_RELEASE'
    WHEN 'CONVERT_RETENTION' THEN 'RETENTION_CONVERSION'
    ELSE NULL
  END
  AND abs(EXTRACT(EPOCH FROM (a.created_at - s.blockchain_timestamp))) <= 5
  -- Exactly one matching signature row: a second candidate disqualifies.
  AND NOT EXISTS (
    SELECT 1 FROM blockchain_signatures s2
    WHERE s2.id <> s.id
      AND s2.entity_type = a.entity_type
      AND s2.entity_id = a.entity_id
      AND s2.blockchain_tx_id ~ '^[0-9a-f]{64}$'
      AND s2.action_type = s.action_type
      AND abs(EXTRACT(EPOCH FROM (a.created_at - s2.blockchain_timestamp))) <= 5
  );

-- 3. Backfill the operation txId the direct-INSERT writers stored under
--    metadata->>'transactionId' (routes/contracts.ts approve/reject/
--    resubmit, routes/banking.ts LC examination). Those writers bypass
--    auditService.log() and stored the operation txId under the
--    'transactionId' key, not 'blockchainTxId', so branch 1 misses them.
--    Same-row direct key, valid 64-hex only. Measured 2026-11-14: 191
--    rows (CONTRACT APPROVE x181, REJECT x7, RESUBMIT x3), all valid.
UPDATE audit_trail
SET blockchain_tx_id = metadata->>'transactionId'
WHERE blockchain_tx_id IS NULL
  AND metadata->>'transactionId' ~ '^[0-9a-f]{64}$';
