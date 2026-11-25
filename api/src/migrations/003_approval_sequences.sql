-- Migration 003: Approval ID sequences and uniqueness constraints
-- Provides sequences for server-generated Exporter IDs and ECTA License numbers

CREATE SEQUENCE IF NOT EXISTS exporter_id_seq START WITH 1000000;
CREATE SEQUENCE IF NOT EXISTS ecta_license_seq START WITH 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_exporter_applications_exporter_id_unique
  ON exporter_applications (exporter_id)
  WHERE exporter_id IS NOT NULL AND exporter_id <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_exporter_applications_license_number_unique
  ON exporter_applications (license_number)
  WHERE license_number IS NOT NULL AND license_number <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_exporter_applications_ecta_license_number_unique
  ON exporter_applications (ecta_license_number)
  WHERE ecta_license_number IS NOT NULL AND ecta_license_number <> '';
