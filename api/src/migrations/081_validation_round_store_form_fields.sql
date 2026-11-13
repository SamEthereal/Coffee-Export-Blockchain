-- Migration 081: validation round (ECX / Customs / Shipping) — persist the
-- form fields the API used to silently discard.
--
-- 1. customs_declarations: the clearance dialog collects a clearance type,
--    an exit point and a validity period (all required in the form) and the
--    clear route destructured them but never stored them — the officer's
--    choices vanished while the form implied they were recorded. The
--    clearance date the form sends is now stored too (the service used
--    NOW() instead). No stored value is excluded by this migration.
--
-- 2. shipping_bookings: the freight-booking dialog collects special
--    instructions, but the booking INSERT never persisted them and the
--    column did not exist — the exporter's handling requirements vanished
--    on submit. Stored as free text.
--
-- The runner (api/src/utils/runMigrations.ts) reads this directory
-- sorted by filename and tracks applied files by name in
-- _schema_migrations, so 081 runs once, after 080.

-- 1. Customs clearance detail columns.
ALTER TABLE customs_declarations ADD COLUMN IF NOT EXISTS clearance_type VARCHAR(50);
ALTER TABLE customs_declarations ADD COLUMN IF NOT EXISTS exit_point VARCHAR(100);
ALTER TABLE customs_declarations ADD COLUMN IF NOT EXISTS validity_period VARCHAR(10);

-- 2. Freight booking special instructions.
ALTER TABLE shipping_bookings ADD COLUMN IF NOT EXISTS special_instructions TEXT;
