-- Migration 080: smoothness round (API leg) — extend the status CHECKs
-- that the cancel writers need.
--
-- 1. shipping_bookings: the cancel endpoint (routes/shipping.ts,
--    DELETE /shipping/bookings/:bookingId/cancel) sets status =
--    'CANCELLED' and migration 067 added the cancel columns, but the
--    CHECK from 064 never admitted 'CANCELLED', so every cancel failed
--    with PG 23514 (chk_shipping_bookings_status). No stored value is
--    excluded by this migration.
--
-- 2. customs_declarations: the cancel endpoint (routes/customs.ts,
--    DELETE /customs/declaration/:declarationId/cancel) sets status =
--    'CANCELLED', but chk_customs_declarations_status never admitted
--    it, so even after the column fixes the UPDATE would still fail
--    with PG 23514. No stored value is excluded by this migration.
--
-- The runner (api/src/utils/runMigrations.ts) reads this directory
-- sorted by filename and tracks applied files by name in
-- _schema_migrations, so 080 runs once, after 079.

-- 1. Shipping bookings: admit CANCELLED.
ALTER TABLE shipping_bookings DROP CONSTRAINT IF EXISTS chk_shipping_bookings_status;
ALTER TABLE shipping_bookings
  ADD CONSTRAINT chk_shipping_bookings_status
  CHECK (status IN ('BOOKED', 'LOADED', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED', 'COMPLETED', 'CANCELLED'));

-- 2. Customs declarations: admit CANCELLED.
ALTER TABLE customs_declarations DROP CONSTRAINT IF EXISTS chk_customs_declarations_status;
ALTER TABLE customs_declarations
  ADD CONSTRAINT chk_customs_declarations_status
  CHECK (status IN ('SUBMITTED', 'UNDER_INSPECTION', 'UNDER_REVIEW', 'CLEARED', 'REJECTED', 'CANCELLED'));
