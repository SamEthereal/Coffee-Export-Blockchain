-- ============================================================================
-- Ethiopian Coffee Export Consortium Blockchain System (CECBS)
-- Initial Seed & Reference Data (Idempotent)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Standard Roles
-- ----------------------------------------------------------------------------
INSERT INTO roles (name, description, permissions) VALUES
  ('ADMIN', 'System Administrator with full management access', '["*"]'::jsonb),
  ('ECTA', 'Ethiopian Coffee and Tea Authority Officer', '["contracts:read", "contracts:approve", "quality:read", "quality:certify", "documents:verify"]'::jsonb),
  ('ECTA_ADMIN', 'ECTA Senior Administrator', '["*"]'::jsonb),
  ('ECX', 'Ethiopian Commodity Exchange Officer', '["lots:manage", "lots:trade", "contracts:read"]'::jsonb),
  ('ECX_ADMIN', 'ECX Senior Administrator', '["*"]'::jsonb),
  ('NBE', 'National Bank of Ethiopia Forex & Compliance Officer', '["forex:read", "forex:allocate", "retention:manage", "compliance:audit"]'::jsonb),
  ('NBE_ADMIN', 'NBE Senior Administrator', '["*"]'::jsonb),
  ('BANKS', 'Commercial Bank Trade Finance Officer', '["lc:issue", "lc:amend", "payments:settle", "forex:request"]'::jsonb),
  ('BANK_ADMIN', 'Commercial Bank Senior Administrator', '["*"]'::jsonb),
  ('CUSTOMS', 'Customs Commission Clearance Officer', '["customs:inspect", "customs:assess", "customs:clear"]'::jsonb),
  ('CUSTOMS_ADMIN', 'Customs Commission Senior Administrator', '["*"]'::jsonb),
  ('SHIPPING', 'Shipping & Logistics Freight Coordinator', '["shipping:book", "shipping:dispatch", "bl:issue"]'::jsonb),
  ('SHIPPING_ADMIN', 'Shipping & Logistics Senior Administrator', '["*"]'::jsonb),
  ('EXPORTER', 'Licensed Coffee Exporter', '["contracts:create", "lc:view", "shipments:view", "documents:upload"]'::jsonb),
  ('APPLICANT', 'Prospective Exporter Applicant', '["application:manage", "documents:upload"]'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. System Default Users (Passwords hashed with bcrypt 10 rounds: password123 / admin123)
-- ----------------------------------------------------------------------------
-- admin / admin123
INSERT INTO users (username, password_hash, email, full_name, organization, role, status) VALUES
  ('admin', '$2b$10$yUnmkwT5oRt1MB2g3/3US.3nmlymIpNMUCIyz4uDNuQvJW2nhGpSi', 'admin@cecbs.et', 'System Administrator', 'ADMIN', 'ADMIN', 'active')
ON CONFLICT (username) DO NOTHING;

-- ecta_admin / password123
INSERT INTO users (username, password_hash, email, full_name, organization, role, status) VALUES
  ('ecta_admin', '$2b$10$z4LIErxl4xpc31F0mkpZoe8/L2sIFzwD1XaL0AdfH82S5oPcYUx9S', 'admin@ecta.gov.et', 'ECTA Administrator', 'ECTA', 'ECTA', 'active')
ON CONFLICT (username) DO NOTHING;

-- ecx_admin / password123
INSERT INTO users (username, password_hash, email, full_name, organization, role, status) VALUES
  ('ecx_admin', '$2b$10$z4LIErxl4xpc31F0mkpZoe8/L2sIFzwD1XaL0AdfH82S5oPcYUx9S', 'admin@ecx.com.et', 'ECX Administrator', 'ECX', 'ECX', 'active')
ON CONFLICT (username) DO NOTHING;

-- nbe_admin / password123
INSERT INTO users (username, password_hash, email, full_name, organization, role, status) VALUES
  ('nbe_admin', '$2b$10$z4LIErxl4xpc31F0mkpZoe8/L2sIFzwD1XaL0AdfH82S5oPcYUx9S', 'admin@nbe.gov.et', 'NBE Administrator', 'NBE', 'NBE', 'active')
ON CONFLICT (username) DO NOTHING;

-- bank_admin / password123
INSERT INTO users (username, password_hash, email, full_name, organization, role, status) VALUES
  ('bank_admin', '$2b$10$z4LIErxl4xpc31F0mkpZoe8/L2sIFzwD1XaL0AdfH82S5oPcYUx9S', 'admin@cbe.com.et', 'CBE Administrator', 'BANKS', 'BANKS', 'active')
ON CONFLICT (username) DO NOTHING;

-- customs_admin / password123
INSERT INTO users (username, password_hash, email, full_name, organization, role, status) VALUES
  ('customs_admin', '$2b$10$z4LIErxl4xpc31F0mkpZoe8/L2sIFzwD1XaL0AdfH82S5oPcYUx9S', 'admin@customs.gov.et', 'Customs Administrator', 'CUSTOMS', 'CUSTOMS', 'active')
ON CONFLICT (username) DO NOTHING;

-- shipping_admin / password123
INSERT INTO users (username, password_hash, email, full_name, organization, role, status) VALUES
  ('shipping_admin', '$2b$10$z4LIErxl4xpc31F0mkpZoe8/L2sIFzwD1XaL0AdfH82S5oPcYUx9S', 'admin@shipping.com.et', 'Shipping Administrator', 'SHIPPING', 'SHIPPING', 'active')
ON CONFLICT (username) DO NOTHING;

-- exporter1 / password123
INSERT INTO users (username, password_hash, email, full_name, phone, organization, role, exporter_id, ecta_license, status) VALUES
  ('exporter1', '$2b$10$z4LIErxl4xpc31F0mkpZoe8/L2sIFzwD1XaL0AdfH82S5oPcYUx9S', 'exporter@test.com', 'Ethiopian Specialty Coffee Exporter', '+251911234567', 'EXPORTER', 'EXPORTER', 'EXP001', 'LIC-ECTA-2026-001', 'active')
ON CONFLICT (username) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. Exporter Profiles
-- ----------------------------------------------------------------------------
INSERT INTO exporters (exporter_id, company_name, ecta_license_number, license_status, contact_person, email, phone) VALUES
  ('EXP001', 'Ethiopian Specialty Coffee Exporter', 'LIC-ECTA-2026-001', 'ACTIVE', 'Abebe Bikila', 'exporter@test.com', '+251911234567')
ON CONFLICT (exporter_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. Initial Approval Requirements
-- ----------------------------------------------------------------------------
INSERT INTO approval_requirements (document_type, entity_type, min_approvers, required_roles, approval_order, description, active) VALUES
  ('CONTRACT', 'SALES_CONTRACT', 1, ARRAY['ECTA', 'ECTA_ADMIN'], 1, 'ECTA approval required for sales contract registration', true),
  ('LETTER_OF_CREDIT', 'LC', 1, ARRAY['BANKS', 'BANK_ADMIN'], 1, 'Commercial bank issuance for Letter of Credit', true),
  ('FOREX_ALLOCATION', 'FOREX', 1, ARRAY['NBE', 'NBE_ADMIN'], 1, 'National Bank of Ethiopia foreign exchange allocation', true),
  ('QUALITY_CERTIFICATE', 'INSPECTION', 1, ARRAY['ECTA', 'ECTA_ADMIN'], 1, 'ECTA Quality & Cupping Certificate issuance', true),
  ('CUSTOMS_CLEARANCE', 'DECLARATION', 1, ARRAY['CUSTOMS', 'CUSTOMS_ADMIN'], 1, 'Customs export clearance and release', true),
  ('BILL_OF_LADING', 'SHIPMENT', 1, ARRAY['SHIPPING', 'SHIPPING_ADMIN'], 1, 'Shipping company Bill of Lading issuance', true)
ON CONFLICT (document_type, entity_type) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. Standard Customs Tariffs & Preferences
-- ----------------------------------------------------------------------------
INSERT INTO customs_tariffs (hs_code, description, duty_rate, excise_rate, vat_rate, effective_from) VALUES
  ('0901.11.00', 'Coffee, not roasted, not decaffeinated (Arabica)', 0.00, 0.00, 0.00, '2026-01-01'),
  ('0901.12.00', 'Coffee, not roasted, decaffeinated', 0.00, 0.00, 0.00, '2026-01-01'),
  ('0901.21.00', 'Coffee, roasted, not decaffeinated', 5.00, 0.00, 15.00, '2026-01-01'),
  ('0901.22.00', 'Coffee, roasted, decaffeinated', 5.00, 0.00, 15.00, '2026-01-01');

INSERT INTO trade_preferences (agreement_name, country_group, hs_code, preferential_rate, standard_rate, valid_from, is_active, notes) VALUES
  ('Everything But Arms (EBA)', 'EU', '0901.11.00', 0.00, 0.00, '2026-01-01', true, 'Duty-free export to European Union'),
  ('African Growth and Opportunity Act (AGOA)', 'US', '0901.11.00', 0.00, 0.00, '2026-01-01', true, 'Duty-free export to United States'),
  ('China Special Preferential Tariff', 'CN', '0901.11.00', 0.00, 0.00, '2026-01-01', true, 'Zero tariff for LDC origins'),
  ('Japan GSP Scheme', 'JP', '0901.11.00', 0.00, 0.00, '2026-01-01', true, 'Generalized Scheme of Preferences');

-- ----------------------------------------------------------------------------
-- 6. Initial NBE Retention Policy (70/30 retention rule)
-- ----------------------------------------------------------------------------
INSERT INTO retention_compliance_policies (policy_name, policy_type, retention_percentage, minimum_retention_period_days, grace_period_days, product_category, effective_from, is_active, description) VALUES
  ('NBE Coffee Export Retention Rule (Directives)', 'SECTOR_SPECIFIC', 70.00, 120, 30, 'COFFEE', '2026-01-01', true, '70% retention in Exporter Foreign Currency Account, 30% converted to ETB at prevailing rate');

-- ----------------------------------------------------------------------------
-- Schema Migrations Tracking
-- ----------------------------------------------------------------------------
INSERT INTO _schema_migrations (migration_name) VALUES ('002_seed_initial_data') ON CONFLICT DO NOTHING;

