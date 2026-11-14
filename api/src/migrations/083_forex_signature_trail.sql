-- Migration 083: unify the forex blockchain-signature trail under
-- entity_type FOREX_ALLOCATION (the type the portal's
-- BlockchainSignatureVerification queries) and backfill the rows the
-- writers never recorded.
--
-- What was wrong (found live 2026-11-14 on the E2E-FULL-20261114 chain,
-- forex FOREX_LC-CONT-E2E-FULL-20261114_REQUEST):
--
-- 1. ConfirmForex rows were stored as entity_type 'FOREX' (raw INSERT in
--    routes/nbe.ts), while the portal queries 'FOREX_ALLOCATION' — so all
--    63 historical confirms were invisible in the verification panel.
--    The code now writes 'FOREX_ALLOCATION'; this migration reclassifies
--    the existing rows. The audit_trail 'FOREX' rows are NOT touched:
--    that is audit_trail's own convention, read by analyticsService.
--
-- 2. RequestForex recorded a signature row only on the POST
--    /forex/request route. Requests through ForexService.requestForex
--    (POST /forex and the LC-issue auto-request) recorded none: 76 audit
--    REQUEST rows carry a valid txId with no matching signature row.
--
-- 3. AllocateForex recorded no signature row anywhere: all 92 audit
--    ALLOCATE rows carry a valid txId with no matching signature row.
--
-- The backfill below recovers rows only from audit_trail, where the
-- operation txId was already persisted (migration 082's backfill):
-- same blockchain_tx_id, same action, valid 64-hex only, and only where
-- no signature row with that txId + chaincode function exists yet.
-- Measured 2026-11-14 on the dev database: 76 RequestForex + 92
-- AllocateForex rows to insert, all 168 txIds distinct, zero NULL
-- signers, zero duplicates against existing rows. No txId is invented.
--
-- The runner (api/src/utils/runMigrations.ts) reads this directory sorted
-- by filename and tracks applied files by name in _schema_migrations, so
-- 083 runs once, after 082, on this machine and on the host.

-- 1. Reclassify historical ConfirmForex signature rows.
UPDATE blockchain_signatures
SET entity_type = 'FOREX_ALLOCATION'
WHERE entity_type = 'FOREX'
  AND chaincode_function = 'ConfirmForex';

-- 2. Backfill missing RequestForex signature rows from audit_trail.
INSERT INTO blockchain_signatures (
  signature_id, entity_type, entity_id, action_type,
  signer_username, signer_org, signer_role,
  blockchain_tx_id, blockchain_timestamp,
  chaincode_name, chaincode_function, transaction_args,
  metadata, created_at
)
SELECT
  'SIG-083-REQ-' || a.id,
  'FOREX_ALLOCATION',
  a.entity_id,
  'REQUEST',
  a.performed_by,
  a.performed_by_org,
  NULL,
  a.blockchain_tx_id,
  a.created_at,
  'coffee',
  'RequestForex',
  NULL,
  jsonb_build_object('backfilledBy', 'migration-083', 'auditTrailId', a.id),
  NOW()
FROM audit_trail a
WHERE a.entity_type = 'FOREX'
  AND a.action = 'REQUEST'
  AND a.blockchain_tx_id ~ '^[0-9a-f]{64}$'
  AND NOT EXISTS (
    SELECT 1 FROM blockchain_signatures s
    WHERE s.blockchain_tx_id = a.blockchain_tx_id
      AND s.chaincode_function = 'RequestForex'
  );

-- 3. Backfill missing AllocateForex signature rows from audit_trail.
INSERT INTO blockchain_signatures (
  signature_id, entity_type, entity_id, action_type,
  signer_username, signer_org, signer_role,
  blockchain_tx_id, blockchain_timestamp,
  chaincode_name, chaincode_function, transaction_args,
  metadata, created_at
)
SELECT
  'SIG-083-ALLOC-' || a.id,
  'FOREX_ALLOCATION',
  a.entity_id,
  'ALLOCATE',
  a.performed_by,
  a.performed_by_org,
  NULL,
  a.blockchain_tx_id,
  a.created_at,
  'coffee',
  'AllocateForex',
  NULL,
  jsonb_build_object('backfilledBy', 'migration-083', 'auditTrailId', a.id),
  NOW()
FROM audit_trail a
WHERE a.entity_type = 'FOREX'
  AND a.action = 'ALLOCATE'
  AND a.blockchain_tx_id ~ '^[0-9a-f]{64}$'
  AND NOT EXISTS (
    SELECT 1 FROM blockchain_signatures s
    WHERE s.blockchain_tx_id = a.blockchain_tx_id
      AND s.chaincode_function = 'AllocateForex'
  );
