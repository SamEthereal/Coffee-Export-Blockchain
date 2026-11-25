-- ============================================================================
-- Ethiopian Coffee Export Consortium Blockchain System (CECBS)
-- Unified Baseline Database Schema (PostgreSQL)
--
-- Consolidates all tables, complete column definitions, constraints, and indexes
-- into a single, clean, high-performance schema.
-- ============================================================================

-- Ensure required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Sequences
CREATE SEQUENCE IF NOT EXISTS approval_seq START WITH 1000 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS reference_seq START WITH 5000 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS exporter_id_seq START WITH 1000000;
CREATE SEQUENCE IF NOT EXISTS ecta_license_seq START WITH 1;

-- ----------------------------------------------------------------------------
-- Table: users
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    organization VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL,
    full_name VARCHAR(255),
    exporter_id VARCHAR(50),
    ecta_license VARCHAR(100),
    phone VARCHAR(50),
    bank_name VARCHAR(255),
    bank_account_number VARCHAR(100),
    bank_branch VARCHAR(255),
    bank_branch_code VARCHAR(50),
    permissions TEXT,
    status VARCHAR(50) DEFAULT 'active',
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    two_factor_enabled BOOLEAN DEFAULT false
);

-- ----------------------------------------------------------------------------
-- Table: roles
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    permissions JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- Table: user_2fa_settings
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_2fa_settings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    totp_secret VARCHAR(255),
    is_enabled BOOLEAN DEFAULT false,
    backup_codes JSONB,
    backup_codes_used JSONB DEFAULT '[]',
    setup_at TIMESTAMP,
    verified_at TIMESTAMP,
    disabled_at TIMESTAMP,
    last_used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT user_2fa_settings_backup_codes_valid 
        CHECK (backup_codes IS NULL OR jsonb_typeof(backup_codes) = 'array'),
    CONSTRAINT user_2fa_settings_backup_codes_used_valid 
        CHECK (jsonb_typeof(backup_codes_used) = 'array')
);

-- ----------------------------------------------------------------------------
-- Table: user_sessions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_sessions (
    session_id VARCHAR(255) PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255),
    refresh_token_hash VARCHAR(255),
    ip_address VARCHAR(50),
    user_agent TEXT,
    device_type VARCHAR(50),
    browser VARCHAR(100),
    os VARCHAR(100),
    location VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    is_current BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP,
    revoked_by INTEGER REFERENCES users(id),
    revocation_reason VARCHAR(255),
    CONSTRAINT valid_device_type CHECK (device_type IN ('desktop', 'mobile', 'tablet', 'unknown'))
);

-- ----------------------------------------------------------------------------
-- Table: user_2fa_verification_log
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_2fa_verification_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    verification_method VARCHAR(50) NOT NULL,
    was_successful BOOLEAN NOT NULL,
    failure_reason VARCHAR(255),
    ip_address VARCHAR(50),
    user_agent TEXT,
    attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_verification_method CHECK (verification_method IN (
        'totp', 'backup_code', 'sms', 'email', 'recovery'
    ))
);

-- ----------------------------------------------------------------------------
-- Table: session_activity_log
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS session_activity_log (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL REFERENCES user_sessions(session_id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_type VARCHAR(50) NOT NULL,
    endpoint VARCHAR(255),
    http_method VARCHAR(10),
    status_code INTEGER,
    ip_address VARCHAR(50),
    user_agent TEXT,
    duration_ms INTEGER,
    occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_activity_type CHECK (activity_type IN (
        'login', 'logout', 'api_call', 'page_view', 'action', 'error'
    )),
    CONSTRAINT valid_http_method CHECK (http_method IN (
        'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'
    ))
);

-- ----------------------------------------------------------------------------
-- Table: user_trusted_devices
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_trusted_devices (
    device_id VARCHAR(255) PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_fingerprint VARCHAR(255) NOT NULL,
    device_name VARCHAR(255),
    device_type VARCHAR(50),
    browser VARCHAR(100),
    os VARCHAR(100),
    is_trusted BOOLEAN DEFAULT true,
    trust_level VARCHAR(50) DEFAULT 'STANDARD',
    first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    trusted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    revoked_at TIMESTAMP,
    ip_address VARCHAR(50),
    location VARCHAR(255),
    CONSTRAINT valid_trust_level CHECK (trust_level IN ('STANDARD', 'HIGH', 'REVOKED'))
);

-- ----------------------------------------------------------------------------
-- Table: user_activity_log
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_activity_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    username VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    target_user_id INTEGER,
    target_username VARCHAR(255),
    details JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    performed_by VARCHAR(255),
    performed_by_role VARCHAR(50),
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- Table: revoked_tokens
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS revoked_tokens (
    jti VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    revoked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL
);

-- ----------------------------------------------------------------------------
-- Table: exporter_applications
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exporter_applications (
    id SERIAL PRIMARY KEY,
    company_name VARCHAR(255) NOT NULL,
    tin VARCHAR(50),
    license_number VARCHAR(100),
    contact_person VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    submitted_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_date TIMESTAMP,
    reviewed_by INTEGER,
    rejection_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    application_id VARCHAR(100) UNIQUE,
    tin_number VARCHAR(50),
    business_license_number VARCHAR(100),
    registration_date DATE,
    capital_requirement VARCHAR(50),
    professional_taster VARCHAR(100),
    taster_certificate VARCHAR(100),
    laboratory_facility VARCHAR(10) DEFAULT 'no',
    laboratory_certificate_number VARCHAR(100),
    city VARCHAR(100),
    region VARCHAR(100),
    bank_name VARCHAR(100),
    bank_account_number VARCHAR(100),
    bank_branch VARCHAR(255),
    bank_branch_code VARCHAR(50),
    comments TEXT,
    documents JSONB DEFAULT '[]'::jsonb,
    exporter_type VARCHAR(20) DEFAULT 'company',
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP,
    rejected_at TIMESTAMP,
    exporter_id VARCHAR(100),
    account_created BOOLEAN DEFAULT false,
    ecta_license_number VARCHAR(100),
    license_issued_date TIMESTAMP,
    license_expiry_date TIMESTAMP,
    digital_signature TEXT,
    verification_code VARCHAR(50),
    temp_username VARCHAR(100),
    temp_password TEXT,
    temp_credentials_sent BOOLEAN DEFAULT FALSE,
    last_login TIMESTAMP,
    blockchain_tx_id VARCHAR(255),
    CONSTRAINT chk_exporter_applications_status CHECK (status IN ('pending', 'approved', 'rejected'))
);

-- ----------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- Table: applicant_credentials
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS applicant_credentials (
    id SERIAL PRIMARY KEY,
    application_id INTEGER NOT NULL REFERENCES exporter_applications(id) ON DELETE CASCADE,
    temp_username VARCHAR(100) UNIQUE NOT NULL,
    temp_password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    last_login TIMESTAMP,
    login_attempts INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(application_id)
);

-- ----------------------------------------------------------------------------
-- Table: exporters
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exporters (
    id SERIAL PRIMARY KEY,
    exporter_id VARCHAR(100) UNIQUE NOT NULL,
    company_name VARCHAR(255) NOT NULL,
    ecta_license_number VARCHAR(100) UNIQUE NOT NULL,
    license_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    capital_requirement DECIMAL(15, 2),
    laboratory_certified BOOLEAN DEFAULT FALSE,
    professional_taster VARCHAR(255),
    taster_certificate VARCHAR(255),
    license_expiry_date TIMESTAMP,
    bank_name VARCHAR(255),
    bank_branch VARCHAR(255),
    bank_branch_code VARCHAR(50),
    contact_person VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_license_status CHECK (license_status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED'))
);

-- Table: contracts
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contracts (
    id SERIAL PRIMARY KEY,
    contract_id VARCHAR(100) UNIQUE NOT NULL,
    exporter_id VARCHAR(100),
    buyer_id VARCHAR(100),
    quantity DECIMAL(10,2),
    price_per_kg DECIMAL(10,2),
    total_value DECIMAL(15,2),
    payment_terms VARCHAR(255),
    delivery_terms VARCHAR(255),
    status VARCHAR(50) DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    buyer_country VARCHAR(100),
    buyer_bank VARCHAR(255),
    exporter_bank VARCHAR(255),
    coffee_type VARCHAR(100),
    currency VARCHAR(10) DEFAULT 'USD',
    payment_method VARCHAR(50) DEFAULT 'LC',
    eudr_required BOOLEAN DEFAULT false,
    blockchain_tx_id VARCHAR(255),
    blockchain_synced BOOLEAN DEFAULT false,
    buyer_name VARCHAR(255),
    organic_certified BOOLEAN DEFAULT false,
    fair_trade_certified BOOLEAN DEFAULT false,
    port_of_loading VARCHAR(255),
    port_of_destination VARCHAR(255),
    delivery_date DATE,
    incoterm VARCHAR(10),
    special_instructions TEXT,
    rejection_reason TEXT,
    rejection_date TIMESTAMP,
    rejected_by VARCHAR(255),
    supersedes_contract_id VARCHAR(100),
    approved_by VARCHAR(255),
    approved_at TIMESTAMP,
    rejected_at TIMESTAMP,
    buyer_email VARCHAR(255),
    buyer_phone VARCHAR(50),
    CONSTRAINT chk_contracts_status CHECK (status IN ('PENDING', 'REGISTERED', 'APPROVED', 'REJECTED',
                    'CANCELLED', 'COMPLETED'))
);

-- Table: approval_requirements
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS approval_requirements (
    id SERIAL PRIMARY KEY,
    document_type VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    min_approvers INTEGER DEFAULT 1,
    required_roles TEXT[],
    approval_order INTEGER,
    description TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(document_type, entity_type)
);

-- ----------------------------------------------------------------------------
-- Table: approval_workflow_state
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS approval_workflow_state (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(100),
    entity_id VARCHAR(100),
    current_state VARCHAR(50),
    required_approvals INTEGER,
    received_approvals INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- Table: letters_of_credit
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS letters_of_credit (
    id SERIAL PRIMARY KEY,
    lc_number VARCHAR(100) UNIQUE NOT NULL,
    shipment_id VARCHAR(100),
    issuing_bank VARCHAR(255),
    advising_bank VARCHAR(255),
    beneficiary VARCHAR(255),
    applicant VARCHAR(255),
    amount DECIMAL(15,2),
    currency VARCHAR(10) DEFAULT 'USD',
    issue_date DATE,
    expiry_date DATE,
    status VARCHAR(50) DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    latest_shipment_date DATE,
    lc_id VARCHAR(100),
    contract_id VARCHAR(100),
    exporter_id VARCHAR(100),
    request_date TIMESTAMP,
    terms TEXT,
    approval_date TIMESTAMP,
    approved_by VARCHAR(255),
    approved_by_msp VARCHAR(100),
    rejection_reason TEXT,
    rejected_by VARCHAR(255),
    rejected_by_msp VARCHAR(100),
    rejection_date TIMESTAMP,
    document_rejection_reason TEXT,
    document_rejected_by VARCHAR(255),
    document_rejected_by_msp VARCHAR(100),
    document_rejection_date TIMESTAMP,
    port_of_loading VARCHAR(255),
    port_of_discharge VARCHAR(255),
    payment_terms TEXT,
    partial_shipment_allowed BOOLEAN DEFAULT false,
    transshipment_allowed BOOLEAN DEFAULT false,
    partial_shipment BOOLEAN DEFAULT false,
    transshipment BOOLEAN DEFAULT false,
    transhipment BOOLEAN DEFAULT false,
    blockchain_tx_id VARCHAR(255),
    issued_at TIMESTAMP,
    issued_by VARCHAR(255),
    issued_by_msp VARCHAR(100),
    CONSTRAINT chk_letters_of_credit_status CHECK (status IN ('PENDING', 'REQUESTED', 'APPROVED', 'REJECTED', 'ISSUED',
                    'FOREX_ALLOCATED', 'AMENDED', 'UTILIZED', 'PAYMENT_RELEASED',
                    'SETTLED', 'EXPIRED'))
);

-- ----------------------------------------------------------------------------
-- Table: lc_discrepancies
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lc_discrepancies (
    discrepancy_id VARCHAR(100) PRIMARY KEY,
    lc_id VARCHAR(100) NOT NULL,
    discrepancy_type VARCHAR(255) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('MINOR', 'MAJOR', 'CRITICAL')),
    document TEXT NOT NULL,
    issue TEXT NOT NULL,
    affected_clauses TEXT,
    recommended_action VARCHAR(255),
    status VARCHAR(40) NOT NULL DEFAULT 'OPEN',
    resolution TEXT,
    reported_by TEXT,
    reported_by_msp VARCHAR(100),
    reported_date TIMESTAMP NOT NULL,
    resolved_by TEXT,
    resolved_by_msp VARCHAR(100),
    resolved_date TIMESTAMP,
    blockchain_tx_id VARCHAR(255),
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_lc_discrepancies_status CHECK (status IN ('OPEN', 'RESOLVED', 'WAIVED'))
);

-- ----------------------------------------------------------------------------
-- Table: lc_transfers
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lc_transfers (
    id SERIAL PRIMARY KEY,
    transfer_id VARCHAR(100) UNIQUE NOT NULL,
    lc_id VARCHAR(100) NOT NULL,
    original_beneficiary VARCHAR(255) NOT NULL,
    new_beneficiary VARCHAR(255) NOT NULL,
    new_beneficiary_bank VARCHAR(255) NOT NULL,
    transfer_type VARCHAR(20) NOT NULL CHECK (transfer_type IN ('FULL', 'PARTIAL')),
    transfer_amount DECIMAL(15, 2) NOT NULL,
    original_amount DECIMAL(15, 2),
    transfer_reason TEXT NOT NULL,
    transfer_date TIMESTAMP NOT NULL,
    transferred_by VARCHAR(100),
    consent_confirmed BOOLEAN DEFAULT FALSE,
    terms_and_conditions TEXT,
    status VARCHAR(50) DEFAULT 'TRANSFERRED',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- Table: standby_letters_of_credit
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS standby_letters_of_credit (
    id SERIAL PRIMARY KEY,
    standby_lc_id VARCHAR(100) UNIQUE NOT NULL,
    standby_lc_number VARCHAR(100) UNIQUE NOT NULL,
    contract_id VARCHAR(100),
    amount DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    expiry_date DATE NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('PERFORMANCE', 'ADVANCE_PAYMENT', 'BID_BOND', 'FINANCIAL')),
    purpose TEXT NOT NULL,
    beneficiary VARCHAR(255) NOT NULL,
    applicant VARCHAR(255) NOT NULL,
    terms TEXT,
    issuing_bank VARCHAR(255),
    advising_bank VARCHAR(255),
    issued_by VARCHAR(100),
    issue_date TIMESTAMP NOT NULL,
    claimed BOOLEAN DEFAULT FALSE,
    claim_date TIMESTAMP,
    claim_amount DECIMAL(15, 2),
    status VARCHAR(50) DEFAULT 'ISSUED',
    blockchain_tx_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- Table: deferred_payments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deferred_payments (
    id SERIAL PRIMARY KEY,
    deferred_payment_id VARCHAR(100) UNIQUE NOT NULL,
    lc_id VARCHAR(100) NOT NULL,
    document_presentation_date TIMESTAMP NOT NULL,
    maturity_date TIMESTAMP NOT NULL,
    deferred_days INTEGER NOT NULL,
    deferred_amount DECIMAL(15, 2) NOT NULL,
    interest_amount DECIMAL(15, 2) DEFAULT 0,
    total_payable DECIMAL(15, 2) NOT NULL,
    acceptance_by VARCHAR(100),
    acceptance_date TIMESTAMP,
    payment_date TIMESTAMP,
    status VARCHAR(50) DEFAULT 'ACCEPTED' CHECK (status IN ('PENDING', 'ACCEPTED', 'PAID', 'OVERDUE')),
    blockchain_tx_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- Table: acceptance_financing
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS acceptance_financing (
    id SERIAL PRIMARY KEY,
    financing_id VARCHAR(100) UNIQUE NOT NULL,
    lc_id VARCHAR(100) NOT NULL,
    financing_amount DECIMAL(15, 2) NOT NULL,
    discount_rate DECIMAL(5, 2) NOT NULL,
    discount_amount DECIMAL(15, 2) NOT NULL,
    net_amount DECIMAL(15, 2) NOT NULL,
    financing_period INTEGER NOT NULL,
    beneficiary VARCHAR(255),
    request_date TIMESTAMP NOT NULL,
    maturity_date TIMESTAMP,
    terms TEXT,
    approved_by VARCHAR(100),
    approval_date TIMESTAMP,
    disbursement_date TIMESTAMP,
    status VARCHAR(50) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'DISBURSED', 'REJECTED')),
    blockchain_tx_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- Table: documentary_collections
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documentary_collections (
    id SERIAL PRIMARY KEY,
    collection_id VARCHAR(100) UNIQUE NOT NULL,
    lc_id VARCHAR(100),
    contract_id VARCHAR(100),
    amount DECIMAL(15, 2),
    currency VARCHAR(10) DEFAULT 'USD',
    status VARCHAR(50) DEFAULT 'SENT',
    collection_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    bank_name VARCHAR(200),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_documentary_collections_status CHECK (status IN ('SENT', 'FORWARDED', 'PRESENTED', 'ACCEPTED', 'PAID',
                    'REJECTED', 'RETURNED'))
);

-- ----------------------------------------------------------------------------
-- Table: advance_payments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS advance_payments (
    id SERIAL PRIMARY KEY,
    payment_id VARCHAR(100) UNIQUE NOT NULL,
    contract_id VARCHAR(100),
    amount DECIMAL(15, 2),
    currency VARCHAR(10) DEFAULT 'USD',
    status VARCHAR(50) DEFAULT 'PENDING',
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    percentage_advance DECIMAL(5, 2) DEFAULT 30.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- Table: consignment_payments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consignment_payments (
    id SERIAL PRIMARY KEY,
    payment_id VARCHAR(100) UNIQUE NOT NULL,
    contract_id VARCHAR(100),
    amount DECIMAL(15, 2),
    currency VARCHAR(10) DEFAULT 'USD',
    status VARCHAR(50) DEFAULT 'PENDING',
    consignment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    settlement_terms VARCHAR(200),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- Table: payments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    payment_id VARCHAR(100) UNIQUE NOT NULL,
    lc_number VARCHAR(100),
    shipment_id VARCHAR(100),
    amount DECIMAL(15,2),
    currency VARCHAR(10) DEFAULT 'USD',
    payment_date DATE,
    status VARCHAR(50) DEFAULT 'PENDING',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    contract_id VARCHAR(100),
    exporter_id VARCHAR(100),
    payment_method VARCHAR(50),
    blockchain_tx_id VARCHAR(100),
    payment_tracking_status VARCHAR(50) DEFAULT 'PENDING',
    lc_id VARCHAR(100),
    forex_id VARCHAR(100),
    retention_rate INTEGER,
    retention_amount DECIMAL(15,2),
    release_amount DECIMAL(15,2),
    swift_reference VARCHAR(100),
    payer_name VARCHAR(255),
    payer_bank VARCHAR(255),
    amount_usd DECIMAL(15,2),
    retention_status VARCHAR(50),
    exchange_rate DECIMAL(10,4),
    amount_birr DECIMAL(15,2),
    converted_by VARCHAR(100),
    conversion_ref VARCHAR(100),
    conversion_date TIMESTAMP,
    CONSTRAINT chk_payments_tracking_status CHECK (payment_tracking_status IN ('PENDING', 'DOCUMENTS_SUBMITTED', 'VERIFIED',
                                     'SWIFT_INITIATED', 'SWIFT_RECEIVED', 'SETTLED')),
    CONSTRAINT chk_payments_status CHECK (status IN (
  'PENDING', 'DOCUMENTS_SUBMITTED', 'VERIFIED', 'REJECTED',
  'SWIFT_INITIATED', 'SWIFT_RECEIVED', 'SWIFT_FAILED',
  'SETTLED', 'CONFIRMED', 'DOCUMENTS_RELEASED', 'COMPLETED', 'CANCELLED'
)),
    CONSTRAINT chk_payments_retention_status CHECK (
  retention_status IS NULL OR retention_status IN (
    'RECEIVED', 'SPLIT', 'RETENTION_CONVERTED', 'RELEASED'
  )
)
);

-- ----------------------------------------------------------------------------
-- Table: forex_allocations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS forex_allocations (
    id SERIAL PRIMARY KEY,
    allocation_id VARCHAR(100) UNIQUE NOT NULL,
    shipment_id VARCHAR(100),
    lc_number VARCHAR(100),
    amount_usd DECIMAL(15,2),
    exchange_rate DECIMAL(10,4),
    amount_local DECIMAL(15,2),
    allocation_date DATE,
    status VARCHAR(50) DEFAULT 'REQUESTED',
    approved_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approval_date TIMESTAMP,
    repatriation_date TIMESTAMP,
    repatriation_amount DECIMAL(15,2),
    repatriation_reference VARCHAR(255),
    forex_id VARCHAR(100),
    lc_id VARCHAR(100),
    contract_id VARCHAR(100),
    exporter_id VARCHAR(100),
    requested_amount DECIMAL(15, 2),
    allocated_amount DECIMAL(15, 2),
    amount DECIMAL(15, 2),
    amount_etb DECIMAL(18, 2),
    currency VARCHAR(3),
    retention_rate DECIMAL(5, 2),
    retention_percentage DECIMAL(5, 2),
    retention_amount_usd DECIMAL(15, 2),
    fcy_account_number VARCHAR(100),
    retention_status VARCHAR(30),
    retention_date TIMESTAMP,
    expiry_date DATE,
    request_date TIMESTAMP,
    utilization_date TIMESTAMP,
    nbe_officer VARCHAR(255),
    nbe_approval_ref VARCHAR(255),
    confirmed_by VARCHAR(255),
    confirmed_at TIMESTAMP,
    verified_by VARCHAR(255),
    verified_by_msp VARCHAR(100),
    comments TEXT,
    blockchain_tx_id VARCHAR(255),
    blockchain_timestamp TIMESTAMP,
    last_blockchain_sync TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    retention_amount DECIMAL(15,2) DEFAULT 0,
    release_amount DECIMAL(15,2) DEFAULT 0,
    allocated_by VARCHAR(255),
    allocated_at TIMESTAMP,
    approval_ref VARCHAR(255),
    CONSTRAINT chk_forex_allocations_retention_status CHECK (retention_status IN ('', 'PENDING', 'COMPLIED', 'NON_COMPLIANT')),
    CONSTRAINT chk_forex_allocations_status CHECK (status IN ('REQUESTED', 'CONFIRMED', 'ALLOCATED', 'UTILIZED',
                    'APPROVED', 'REPATRIATED', 'REJECTED'))
);

-- ----------------------------------------------------------------------------
-- Table: forex_conversions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS forex_conversions (
    id SERIAL PRIMARY KEY,
    conversion_id VARCHAR(100) UNIQUE NOT NULL,
    payment_id VARCHAR(100),
    lc_id VARCHAR(100),
    source_amount DECIMAL(15, 2) NOT NULL,
    source_currency VARCHAR(3) NOT NULL,
    target_currency VARCHAR(3) NOT NULL,
    forex_rate DECIMAL(10, 4) NOT NULL,
    converted_amount DECIMAL(15, 2) NOT NULL,
    rate_date TIMESTAMP NOT NULL,
    rate_source VARCHAR(100) DEFAULT 'NBE Official Rate',
    converted_by VARCHAR(100),
    conversion_date TIMESTAMP NOT NULL,
    blockchain_tx_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- Table: export_proceeds_repatriation
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS export_proceeds_repatriation (
    repatriation_id VARCHAR(50) PRIMARY KEY,
    payment_id VARCHAR(50),
    contract_id VARCHAR(50),
    shipment_id VARCHAR(50),
    exporter_id VARCHAR(50),
    export_amount DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'USD',
    required_retention DECIMAL(15, 2),
    required_conversion DECIMAL(15, 2),
    retention_percentage DECIMAL(5, 2) DEFAULT 40.0,
    conversion_percentage DECIMAL(5, 2) DEFAULT 60.0,
    repatriated_amount DECIMAL(15, 2) DEFAULT 0,
    converted_amount DECIMAL(15, 2) DEFAULT 0,
    converted_amount_birr DECIMAL(15, 2) DEFAULT 0,
    exchange_rate DECIMAL(10, 4),
    fcy_account_number VARCHAR(50),
    fcy_bank VARCHAR(100),
    fcy_bank_bic VARCHAR(20),
    status VARCHAR(30) DEFAULT 'PENDING',
    compliance_deadline TIMESTAMP NOT NULL,
    shipment_date DATE,
    repatriation_date TIMESTAMP,
    compliance_date TIMESTAMP,
    days_remaining INTEGER,
    is_overdue BOOLEAN DEFAULT FALSE,
    verified_by TEXT,
    verified_by_msp VARCHAR(50),
    verification_date TIMESTAMP,
    verification_ref VARCHAR(100),
    verification_notes TEXT,
    penalty_amount DECIMAL(15, 2),
    penalty_currency VARCHAR(10),
    waiver_requested BOOLEAN DEFAULT FALSE,
    waiver_approved BOOLEAN DEFAULT FALSE,
    waiver_reason TEXT,
    waiver_date TIMESTAMP,
    swift_references JSONB DEFAULT '[]'::jsonb,
    bank_certificate TEXT,
    recorded_by TEXT,
    recorded_by_msp VARCHAR(50),
    last_updated_by TEXT,
    last_updated_by_msp VARCHAR(50),
    comments TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_export_proceeds_repatriation_status CHECK (status IN ('PENDING', 'PARTIAL', 'READY_FOR_VERIFICATION', 'OVERDUE',
                    'COMPLIED', 'NON_COMPLIANT', 'WAIVED'))
);

-- ----------------------------------------------------------------------------
-- Table: forex_repatriations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS forex_repatriations (
    id SERIAL PRIMARY KEY,
    repatriation_id VARCHAR(100),
    forex_allocation_id VARCHAR(100) NOT NULL,
    repatriation_amount DECIMAL(15, 2),
    repatriation_date DATE,
    bank_reference VARCHAR(100),
    repatriation_method VARCHAR(50) DEFAULT 'Wire Transfer',
    status VARCHAR(50) DEFAULT 'COMPLETED',
    blockchain_synced BOOLEAN DEFAULT FALSE,
    blockchain_tx_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_forex_repatriations_status CHECK (status IN ('PENDING', 'PARTIAL', 'READY_FOR_VERIFICATION', 'OVERDUE',
                    'COMPLIED', 'NON_COMPLIANT', 'WAIVED', 'COMPLETED'))
);

-- ----------------------------------------------------------------------------
-- Table: retention_accounts
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS retention_accounts (
    account_id SERIAL PRIMARY KEY,
    exporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_number VARCHAR(50) NOT NULL,
    account_type VARCHAR(50) NOT NULL DEFAULT 'FOREX_RETENTION',
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    retention_percentage DECIMAL(5, 2) NOT NULL DEFAULT 40.00,
    current_balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
    minimum_balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
    holds_policy VARCHAR(50) DEFAULT 'STANDARD',
    hold_until_date DATE,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    blockchain_tx_id VARCHAR(255),
    CONSTRAINT valid_account_type CHECK (account_type IN (
        'FOREX_RETENTION',
        'EXPORT_PROCEEDS',
        'REPATRIATION_ACCOUNT'
    )),
    CONSTRAINT valid_retention_percentage CHECK (retention_percentage >= 0 AND retention_percentage <= 100),
    CONSTRAINT positive_balances CHECK (current_balance >= 0 AND minimum_balance >= 0),
    CONSTRAINT valid_status CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED', 'UNDER_REVIEW')),
    CONSTRAINT unique_exporter_account UNIQUE (exporter_id, account_number)
);

-- ----------------------------------------------------------------------------
-- Table: retention_penalties
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS retention_penalties (
    penalty_id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES retention_accounts(account_id) ON DELETE CASCADE,
    violation_type VARCHAR(50) NOT NULL,
    violation_description TEXT,
    required_amount DECIMAL(15, 2) NOT NULL,
    actual_amount DECIMAL(15, 2) NOT NULL,
    shortfall_amount DECIMAL(15, 2) NOT NULL,
    penalty_rate DECIMAL(5, 4) NOT NULL,
    penalty_amount DECIMAL(15, 2) NOT NULL,
    total_owed DECIMAL(15, 2) NOT NULL,
    violation_start_date DATE,
    violation_end_date DATE,
    violation_duration_months INTEGER DEFAULT 1,
    amount_paid DECIMAL(15, 2) DEFAULT 0,
    payment_deadline DATE,
    status VARCHAR(50) NOT NULL DEFAULT 'CALCULATED',
    penalty_description TEXT,
    notes TEXT,
    calculated_by INTEGER REFERENCES users(id),
    approved_by INTEGER REFERENCES users(id),
    approved_at TIMESTAMP,
    paid_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    blockchain_tx_id VARCHAR(255),
    CONSTRAINT valid_violation_type CHECK (violation_type IN (
        'UNDER_RETENTION',
        'LATE_REPATRIATION',
        'UNAUTHORIZED_WITHDRAWAL',
        'POLICY_VIOLATION',
        'MINIMUM_BALANCE_BREACH',
        'REPORTING_FAILURE'
    )),
    CONSTRAINT valid_penalty_status CHECK (status IN (
        'CALCULATED',
        'APPROVED',
        'DISPUTED',
        'PAID',
        'WAIVED',
        'CANCELLED'
    )),
    CONSTRAINT positive_penalty_amounts CHECK (
        required_amount >= 0 AND
        actual_amount >= 0 AND
        shortfall_amount >= 0 AND
        penalty_rate >= 0 AND
        penalty_amount >= 0 AND
        total_owed >= 0 AND
        amount_paid >= 0
    )
);

-- ----------------------------------------------------------------------------
-- Table: retention_waivers
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS retention_waivers (
    waiver_id SERIAL PRIMARY KEY,
    request_type VARCHAR(50) NOT NULL,
    exporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id INTEGER REFERENCES retention_accounts(account_id) ON DELETE SET NULL,
    penalty_id INTEGER REFERENCES retention_penalties(penalty_id) ON DELETE SET NULL,
    waiver_amount DECIMAL(15, 2),
    justification TEXT NOT NULL,
    supporting_documents JSONB,
    request_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    reviewed_by INTEGER REFERENCES users(id),
    review_notes TEXT,
    decision_date TIMESTAMP,
    approved_amount DECIMAL(15, 2),
    approval_conditions TEXT,
    requested_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    blockchain_tx_id VARCHAR(255),
    CONSTRAINT valid_request_type CHECK (request_type IN (
        'PENALTY_WAIVER',
        'RETENTION_REDUCTION',
        'COMPLIANCE_EXTENSION',
        'HARDSHIP_RELIEF',
        'FORCE_MAJEURE'
    )),
    CONSTRAINT valid_request_status CHECK (request_status IN (
        'PENDING',
        'UNDER_REVIEW',
        'APPROVED',
        'PARTIALLY_APPROVED',
        'REJECTED',
        'WITHDRAWN'
    )),
    CONSTRAINT positive_waiver_amounts CHECK (
        (waiver_amount IS NULL OR waiver_amount >= 0) AND
        (approved_amount IS NULL OR approved_amount >= 0)
    ),
    CONSTRAINT retention_waivers_supporting_documents_valid CHECK (supporting_documents IS NULL OR jsonb_typeof(supporting_documents) IN ('array', 'object'))
);

-- ----------------------------------------------------------------------------
-- Table: retention_transactions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS retention_transactions (
    transaction_id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES retention_accounts(account_id) ON DELETE CASCADE,
    transaction_type VARCHAR(50) NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    balance_before DECIMAL(15, 2) NOT NULL,
    balance_after DECIMAL(15, 2) NOT NULL,
    reference_type VARCHAR(50),
    reference_id VARCHAR(100),
    description TEXT,
    notes TEXT,
    processed_by INTEGER REFERENCES users(id),
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    blockchain_tx_id VARCHAR(255),
    CONSTRAINT valid_transaction_type CHECK (transaction_type IN (
        'DEPOSIT',
        'WITHDRAWAL',
        'REPATRIATION',
        'PENALTY_PAYMENT',
        'INTEREST_CREDIT',
        'FEE_DEBIT',
        'ADJUSTMENT',
        'TRANSFER_IN',
        'TRANSFER_OUT'
    )),
    CONSTRAINT positive_transaction_amount CHECK (amount >= 0),
    CONSTRAINT valid_balances CHECK (balance_before >= 0 AND balance_after >= 0)
);

-- ----------------------------------------------------------------------------
-- Table: retention_compliance_policies
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS retention_compliance_policies (
    policy_id SERIAL PRIMARY KEY,
    policy_name VARCHAR(255) NOT NULL,
    policy_type VARCHAR(50) NOT NULL,
    retention_percentage DECIMAL(5, 2) NOT NULL,
    minimum_retention_period_days INTEGER NOT NULL DEFAULT 180,
    grace_period_days INTEGER DEFAULT 30,
    product_category VARCHAR(100),
    applies_to_export_value_min DECIMAL(15, 2),
    applies_to_export_value_max DECIMAL(15, 2),
    penalty_rate_monthly DECIMAL(5, 4) DEFAULT 0.02,
    penalty_cap_percentage DECIMAL(5, 2),
    effective_from DATE NOT NULL,
    effective_to DATE,
    is_active BOOLEAN DEFAULT true,
    description TEXT,
    legal_reference TEXT,
    created_by INTEGER REFERENCES users(id),
    approved_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_policy_type CHECK (policy_type IN (
        'STANDARD',
        'PREFERENTIAL',
        'SECTOR_SPECIFIC',
        'TEMPORARY',
        'EMERGENCY'
    )),
    CONSTRAINT valid_retention_percentage CHECK (retention_percentage >= 0 AND retention_percentage <= 100),
    CONSTRAINT positive_periods CHECK (
        minimum_retention_period_days >= 0 AND
        (grace_period_days IS NULL OR grace_period_days >= 0)
    )
);

-- ----------------------------------------------------------------------------
-- Table: ecx_lots
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ecx_lots (
    id SERIAL PRIMARY KEY,
    lot_id VARCHAR(100) UNIQUE NOT NULL,
    lot_number VARCHAR(100),
    exporter_id VARCHAR(100),
    exporter_name VARCHAR(255),
    warehouse_id VARCHAR(100),
    origin VARCHAR(100),
    sub_region VARCHAR(100),
    quantity DECIMAL(15, 2),
    bags INTEGER,
    processing_method VARCHAR(50),
    harvest_season VARCHAR(20),
    grade VARCHAR(20),
    quality_score DECIMAL(5, 2),
    status VARCHAR(50) DEFAULT 'WAREHOUSED',
    receipt_date TIMESTAMP,
    contract_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_ecx_lots_status CHECK (status IN ('WAREHOUSED', 'GRADED', 'ASSIGNED', 'RELEASED', 'REJECTED'))
);

-- ----------------------------------------------------------------------------
-- Table: quality_inspections
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quality_inspections (
    id SERIAL PRIMARY KEY,
    shipment_id VARCHAR(100),
    inspector_id INTEGER,
    inspection_date TIMESTAMP,
    grade VARCHAR(50),
    moisture_content DECIMAL(5,2),
    defect_count INTEGER,
    cup_quality VARCHAR(50),
    status VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    exporter_id VARCHAR(100),
    passed BOOLEAN,
    inspection_id VARCHAR(100),
    contract_id VARCHAR(100),
    coffee_type VARCHAR(100),
    quantity DECIMAL(10,2),
    sample_size DECIMAL(10,2),
    requested_date TIMESTAMP,
    blockchain_tx_id VARCHAR(255),
    certification_number VARCHAR(100),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    remarks TEXT,
    inspector_name VARCHAR(255),
    screen_size INTEGER,
    export_permit_no VARCHAR(100),
    CONSTRAINT chk_quality_inspections_status CHECK (status IN ('PENDING', 'REQUESTED', 'SCHEDULED', 'SAMPLE_COLLECTED', 'INSPECTED',
                    'APPROVED', 'REJECTED', 'PERMIT_ISSUED', 'CERTIFICATE_ISSUED',
                    'COMPLETED'))
);

-- ----------------------------------------------------------------------------
-- Table: export_permits
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS export_permits (
    id SERIAL PRIMARY KEY,
    permit_id VARCHAR(100) UNIQUE NOT NULL,
    contract_id VARCHAR(100),
    permit_type VARCHAR(50) DEFAULT 'EXPORT',
    status VARCHAR(50) DEFAULT 'PENDING',
    issue_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expiry_date TIMESTAMP,
    quantity DECIMAL(15, 2),
    approved_by VARCHAR(200),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_export_permits_status CHECK (status IN ('PENDING', 'ISSUED', 'UTILIZED', 'SETTLED'))
);

-- ----------------------------------------------------------------------------
-- Table: phytosanitary_certificates
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS phytosanitary_certificates (
    id SERIAL PRIMARY KEY,
    certificate_id VARCHAR(100) UNIQUE NOT NULL,
    contract_id VARCHAR(100),
    status VARCHAR(50) DEFAULT 'PENDING',
    issue_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expiry_date TIMESTAMP,
    treatment_type VARCHAR(100),
    inspection_result VARCHAR(50),
    certifying_officer VARCHAR(200),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    shipment_id VARCHAR(100),
    exporter_id VARCHAR(100),
    place_of_origin VARCHAR(255),
    point_of_entry VARCHAR(255),
    packaging_type VARCHAR(100),
    number_of_packages INTEGER,
    distinguishing_marks VARCHAR(255),
    means_of_conveyance VARCHAR(255),
    validity_period VARCHAR(100),
    CONSTRAINT chk_phytosanitary_certificates_status CHECK (status IN ('PENDING', 'INSPECTED', 'ISSUED', 'REVOKED'))
);

-- ----------------------------------------------------------------------------
-- Table: certificate_of_origin
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS certificate_of_origin (
    id SERIAL PRIMARY KEY,
    certificate_id VARCHAR(100) UNIQUE NOT NULL,
    contract_id VARCHAR(100),
    status VARCHAR(50) DEFAULT 'ISSUED',
    issue_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    origin VARCHAR(100) DEFAULT 'ETHIOPIA',
    certifying_authority VARCHAR(200) DEFAULT 'ECTA',
    certifying_officer VARCHAR(200),
    hs_code VARCHAR(20) DEFAULT '0901.21',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- Table: shipping_bookings
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shipping_bookings (
    booking_id VARCHAR(100) PRIMARY KEY,
    shipment_id VARCHAR(100) NOT NULL,
    exporter_id VARCHAR(100),
    carrier VARCHAR(200),
    vessel_name VARCHAR(200),
    voyage_number VARCHAR(100),
    container_type VARCHAR(50),
    number_of_containers INTEGER,
    container_number VARCHAR(50),
    seal_number VARCHAR(50),
    transport_mode VARCHAR(50) DEFAULT 'LAND_SEA',
    origin VARCHAR(100),
    destination VARCHAR(100),
    estimated_departure TIMESTAMP,
    actual_departure TIMESTAMP,
    estimated_arrival TIMESTAMP,
    actual_arrival TIMESTAMP,
    delivery_date TIMESTAMP,
    status VARCHAR(50) NOT NULL DEFAULT 'BOOKED',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    cancellation_reason TEXT,
    cancelled_by VARCHAR(100),
    cancellation_date TIMESTAMP,
    special_instructions TEXT,
    CONSTRAINT chk_shipping_bookings_status CHECK (status IN ('BOOKED', 'LOADED', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED', 'COMPLETED', 'CANCELLED'))
);

-- ----------------------------------------------------------------------------
-- Table: bills_of_lading
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bills_of_lading (
    id SERIAL PRIMARY KEY,
    bl_id VARCHAR(100) UNIQUE NOT NULL,
    bl_number VARCHAR(100) UNIQUE NOT NULL,
    bl_type VARCHAR(50) NOT NULL CHECK (bl_type IN ('NEGOTIABLE', 'NON_NEGOTIABLE', 'SEA_WAYBILL', 'MASTER_BL', 'HOUSE_BL')),
    booking_id VARCHAR(100),
    shipper VARCHAR(255) NOT NULL,
    consignee VARCHAR(255) NOT NULL,
    notify_party VARCHAR(255),
    port_of_loading VARCHAR(255),
    port_of_discharge VARCHAR(255),
    vessel_name VARCHAR(255),
    voyage_number VARCHAR(100),
    container_numbers TEXT,
    seal_numbers TEXT,
    cargo_description TEXT,
    package_count INTEGER DEFAULT 0,
    gross_weight DECIMAL(10, 2) DEFAULT 0,
    measurement DECIMAL(10, 2) DEFAULT 0,
    freight_terms VARCHAR(50) DEFAULT 'PREPAID',
    number_of_originals INTEGER DEFAULT 3,
    issued_at VARCHAR(255),
    issue_date TIMESTAMP NOT NULL,
    on_board_date TIMESTAMP,
    issued_by VARCHAR(100),
    surrendered BOOLEAN DEFAULT FALSE,
    surrender_date TIMESTAMP,
    status VARCHAR(50) DEFAULT 'ISSUED',
    blockchain_tx_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- Table: booking_amendments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS booking_amendments (
    id SERIAL PRIMARY KEY,
    amendment_id VARCHAR(100) UNIQUE NOT NULL,
    booking_id VARCHAR(100) NOT NULL,
    amendment_reason TEXT NOT NULL,
    amended_by VARCHAR(100),
    old_vessel_name VARCHAR(255),
    new_vessel_name VARCHAR(255),
    old_voyage_number VARCHAR(100),
    new_voyage_number VARCHAR(100),
    old_departure TIMESTAMP,
    new_departure TIMESTAMP,
    old_arrival TIMESTAMP,
    new_arrival TIMESTAMP,
    old_container_type VARCHAR(50),
    new_container_type VARCHAR(50),
    old_container_count INTEGER,
    new_container_count INTEGER,
    additional_notes TEXT,
    status VARCHAR(50) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    approved_by VARCHAR(100),
    approval_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- Table: container_allocations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS container_allocations (
    id SERIAL PRIMARY KEY,
    container_id VARCHAR(100) UNIQUE NOT NULL,
    booking_id VARCHAR(100) NOT NULL,
    container_number VARCHAR(100) NOT NULL,
    container_type VARCHAR(50) NOT NULL,
    size_type VARCHAR(20) NOT NULL CHECK (size_type IN ('20FT', '40FT', '40HC', '45FT', '20RF', '40RF')),
    condition VARCHAR(50) DEFAULT 'GOOD' CHECK (condition IN ('GOOD', 'DAMAGED', 'UNDER_REPAIR')),
    allocated_by VARCHAR(100),
    allocated_date TIMESTAMP NOT NULL,
    released_date TIMESTAMP,
    status VARCHAR(50) DEFAULT 'ALLOCATED' CHECK (status IN ('ALLOCATED', 'STUFFED', 'LOADED', 'DISCHARGED', 'RELEASED')),
    blockchain_tx_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- Table: container_stuffing_reports
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS container_stuffing_reports (
    id SERIAL PRIMARY KEY,
    report_id VARCHAR(100) UNIQUE NOT NULL,
    container_id VARCHAR(100) NOT NULL,
    container_number VARCHAR(100) NOT NULL,
    stuffing_date TIMESTAMP NOT NULL,
    stuffing_location VARCHAR(255),
    cargo_description TEXT,
    package_count INTEGER DEFAULT 0,
    gross_weight DECIMAL(10, 2) DEFAULT 0,
    net_weight DECIMAL(10, 2) DEFAULT 0,
    volume_cbm DECIMAL(10, 2) DEFAULT 0,
    seal_number VARCHAR(100),
    stuffing_supervisor VARCHAR(100),
    photo_urls JSONB DEFAULT '[]',
    remarks TEXT,
    reported_by VARCHAR(100),
    verified BOOLEAN DEFAULT FALSE,
    verified_by VARCHAR(100),
    verification_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- Table: shipments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shipments (
    id SERIAL PRIMARY KEY,
    shipment_id VARCHAR(100) UNIQUE NOT NULL,
    contract_id VARCHAR(100),
    exporter_id VARCHAR(100),
    buyer_id VARCHAR(100),
    origin VARCHAR(100),
    destination VARCHAR(100),
    quantity DECIMAL(10,2),
    grade VARCHAR(50),
    status VARCHAR(50) DEFAULT 'CREATED',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    delivery_date TIMESTAMP,
    ico_number VARCHAR(100),
    ecx_lot_number VARCHAR(100),
    channel VARCHAR(50),
    forex_rate DECIMAL(10,4),
    value_usd DECIMAL(15,2),
    eudr_compliant BOOLEAN DEFAULT false,
    blockchain_tx_id VARCHAR(255),
    blockchain_synced BOOLEAN DEFAULT false,
    carrier VARCHAR(200),
    booking_reference VARCHAR(100),
    container_number VARCHAR(50),
    seal_number VARCHAR(50),
    transport_mode VARCHAR(50) DEFAULT 'LAND_SEA',
    current_location VARCHAR(200),
    estimated_departure TIMESTAMP,
    actual_departure TIMESTAMP,
    estimated_arrival TIMESTAMP,
    actual_arrival TIMESTAMP,
    logistics_status VARCHAR(50) DEFAULT 'PENDING',
    CONSTRAINT chk_shipments_logistics_status CHECK (logistics_status IN ('PENDING', 'BOOKED', 'LOADED', 'DEPARTED',
                              'IN_TRANSIT', 'ARRIVED', 'DELIVERED', 'CONFIRMED')),
    CONSTRAINT chk_shipments_status CHECK (status IN ('CREATED', 'REGISTERED', 'FREIGHT_BOOKED', 'BOOKED',
                    'PERMIT_ISSUED', 'CUSTOMS_CLEARED', 'CUSTOMS_REJECTED',
                    'CUSTOMS_DECLARED', 'INSPECTION_PENDING', 'INSPECTION_COMPLETE', 'LAND_TRANSPORT',
                    'PORT_ARRIVED', 'CONTAINER_STUFFED', 'VESSEL_LOADED',
                    'DEPARTED', 'IN_TRANSIT', 'DESTINATION_ARRIVED',
                    'ARRIVED', 'DELIVERED', 'LOADED', 'CANCELLED',
                    'QUALITY_PENDING', 'COMPLETED'))
);

-- ----------------------------------------------------------------------------
-- Table: shipment_status_history
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shipment_status_history (
    id SERIAL PRIMARY KEY,
    shipment_id VARCHAR(100),
    status VARCHAR(50),
    changed_by INTEGER,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    CONSTRAINT chk_shipment_status_history_status CHECK (status IN ('CREATED', 'REGISTERED', 'FREIGHT_BOOKED', 'BOOKED',
                    'PERMIT_ISSUED', 'CUSTOMS_CLEARED', 'CUSTOMS_REJECTED',
                    'CUSTOMS_DECLARED', 'INSPECTION_PENDING', 'INSPECTION_COMPLETE', 'LAND_TRANSPORT',
                    'PORT_ARRIVED', 'CONTAINER_STUFFED', 'VESSEL_LOADED',
                    'DEPARTED', 'IN_TRANSIT', 'DESTINATION_ARRIVED',
                    'ARRIVED', 'DELIVERED', 'LOADED', 'CANCELLED',
                    'QUALITY_PENDING', 'COMPLETED'))
);

-- ----------------------------------------------------------------------------
-- Table: post_delivery_tracking
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS post_delivery_tracking (
    id SERIAL PRIMARY KEY,
    tracking_id VARCHAR(100) UNIQUE NOT NULL,
    shipment_id VARCHAR(100),
    arrival_date TIMESTAMP,
    warehouse_location VARCHAR(255),
    quality_recheck_status VARCHAR(50),
    status VARCHAR(50) DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    contract_id VARCHAR(100),
    exporter_id VARCHAR(100),
    delivery_date TIMESTAMP,
    lc_used BOOLEAN DEFAULT false,
    overall_status VARCHAR(50) DEFAULT 'PENDING',
    completion_percentage INTEGER DEFAULT 0,
    expected_completion_date TIMESTAMP,
    created_by VARCHAR(100),
    payment_received BOOLEAN DEFAULT false,
    payment_received_date TIMESTAMP,
    payment_amount DECIMAL(15,2),
    payment_currency VARCHAR(3),
    swift_reference VARCHAR(100),
    forex_repatriated BOOLEAN DEFAULT false,
    forex_repatriation_date TIMESTAMP,
    forex_amount DECIMAL(15,2),
    forex_rate DECIMAL(10,4),
    lc_settled BOOLEAN DEFAULT false,
    lc_settlement_date TIMESTAMP,
    lc_reference VARCHAR(100),
    ecta_audit_completed BOOLEAN DEFAULT false,
    ecta_audit_date TIMESTAMP,
    ecta_audit_result VARCHAR(20),
    ecta_audit_notes TEXT,
    contract_closed BOOLEAN DEFAULT false,
    contract_closure_date TIMESTAMP,
    updated_by VARCHAR(100),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_post_delivery_overall_status CHECK (overall_status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'DELAYED', 'ISSUE')),
    CONSTRAINT chk_post_delivery_status CHECK (status IN ('pending')),
    CONSTRAINT uq_post_delivery_tracking_shipment_id UNIQUE (shipment_id)
);

-- ----------------------------------------------------------------------------
-- Table: post_delivery_issues
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS post_delivery_issues (
    id SERIAL PRIMARY KEY,
    shipment_id VARCHAR(100) NOT NULL,
    issue_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20),
    message TEXT,
    resolved BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (shipment_id, issue_type)
);

-- ----------------------------------------------------------------------------
-- Table: post_delivery_checklist
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS post_delivery_checklist (
    id SERIAL PRIMARY KEY,
    shipment_id VARCHAR(100) NOT NULL,
    item_type VARCHAR(50) NOT NULL,
    description TEXT,
    display_order INTEGER,
    completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (shipment_id, item_type)
);

-- ----------------------------------------------------------------------------
-- Table: customs_declarations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customs_declarations (
    id SERIAL PRIMARY KEY,
    declaration_id VARCHAR(100) UNIQUE NOT NULL,
    shipment_id VARCHAR(100),
    declaration_number VARCHAR(100),
    declared_value DECIMAL(15,2),
    duty_amount DECIMAL(15,2),
    status VARCHAR(50) DEFAULT 'SUBMITTED',
    submitted_date TIMESTAMP,
    cleared_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    contract_id VARCHAR(100),
    exporter_id VARCHAR(100),
    declaration_type VARCHAR(100),
    hs_code VARCHAR(50),
    description TEXT,
    quantity DECIMAL(15, 2),
    customs_value_usd DECIMAL(15, 2),
    currency VARCHAR(10) DEFAULT 'USD',
    destination VARCHAR(255),
    destination_country VARCHAR(255),
    port_of_exit VARCHAR(255),
    eudr_compliant BOOLEAN DEFAULT false,
    additional_notes TEXT,
    customs_officer VARCHAR(255),
    inspection_required BOOLEAN DEFAULT false,
    inspection_notes TEXT,
    duty_paid BOOLEAN DEFAULT false,
    clearance_date TIMESTAMP,
    blockchain_tx_id VARCHAR(255),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    cleared_by VARCHAR(255),
    clearance_number VARCHAR(100),
    duties DECIMAL(15,2),
    taxes DECIMAL(15,2),
    clearance_notes TEXT,
    cancellation_status VARCHAR(50),
    cancellation_reason TEXT,
    cancelled_by INTEGER REFERENCES users(id),
    cancelled_at TIMESTAMP,
    cancellation_approved_by INTEGER REFERENCES users(id),
    cancellation_approved_at TIMESTAMP,
    clearance_type VARCHAR(50),
    exit_point VARCHAR(100),
    validity_period VARCHAR(10),
    CONSTRAINT valid_cancellation_status CHECK (
        cancellation_status IS NULL OR 
        cancellation_status IN ('requested', 'approved', 'rejected')
    ),
    CONSTRAINT chk_customs_declarations_status CHECK (status IN ('SUBMITTED', 'UNDER_INSPECTION', 'UNDER_REVIEW', 'CLEARED', 'REJECTED', 'CANCELLED'))
);

-- ----------------------------------------------------------------------------
-- Table: customs_clearances
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customs_clearances (
    id SERIAL PRIMARY KEY,
    clearance_id VARCHAR(100) UNIQUE NOT NULL,
    shipment_id VARCHAR(100),
    declaration_id VARCHAR(100),
    clearance_date TIMESTAMP,
    exit_point VARCHAR(255),
    status VARCHAR(50) DEFAULT 'SUBMITTED',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    clearance_number VARCHAR(100),
    cleared_by VARCHAR(255),
    cleared_date TIMESTAMP,
    duty_amount DECIMAL(15, 2),
    tax_amount DECIMAL(15, 2),
    remarks TEXT,
    blockchain_tx_id VARCHAR(255),
    CONSTRAINT chk_customs_clearances_status CHECK (status IN ('SUBMITTED', 'UNDER_INSPECTION', 'UNDER_REVIEW', 'CLEARED', 'REJECTED'))
);

-- ----------------------------------------------------------------------------
-- Table: customs_assessments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customs_assessments (
    id SERIAL PRIMARY KEY,
    assessment_id VARCHAR(100) UNIQUE NOT NULL,
    declaration_number VARCHAR(100),
    contract_id VARCHAR(100),
    assessed_value DECIMAL(15, 2),
    duty_amount DECIMAL(15, 2),
    tax_amount DECIMAL(15, 2),
    total_amount DECIMAL(15, 2),
    currency VARCHAR(10) DEFAULT 'ETB',
    assessed_by VARCHAR(200),
    assessment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- Table: declaration_amendments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS declaration_amendments (
    amendment_id SERIAL PRIMARY KEY,
    declaration_id VARCHAR(100) NOT NULL REFERENCES customs_declarations(declaration_id) ON DELETE CASCADE,
    amendment_number INTEGER NOT NULL,
    amendment_reason TEXT NOT NULL,
    original_values JSONB NOT NULL,
    amended_values JSONB NOT NULL,
    amendment_requested_by VARCHAR(255) NOT NULL,
    amendment_requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    customs_officer_id INTEGER REFERENCES users(id),
    approval_status VARCHAR(50) NOT NULL DEFAULT 'pending',
    approval_notes TEXT,
    approved_rejected_at TIMESTAMP,
    blockchain_tx_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_amendment_status CHECK (approval_status IN ('pending', 'approved', 'rejected')),
    CONSTRAINT unique_amendment_number UNIQUE (declaration_id, amendment_number),
    CONSTRAINT declaration_amendments_original_values_not_string CHECK (jsonb_typeof(original_values) != 'string'),
    CONSTRAINT declaration_amendments_amended_values_not_string CHECK (jsonb_typeof(amended_values) != 'string')
);

-- ----------------------------------------------------------------------------
-- Table: duty_calculations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS duty_calculations (
    calculation_id SERIAL PRIMARY KEY,
    declaration_id VARCHAR(100) NOT NULL REFERENCES customs_declarations(declaration_id) ON DELETE CASCADE,
    calculation_method VARCHAR(50) NOT NULL,
    customs_value DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    exchange_rate DECIMAL(10, 6),
    basic_duty_rate DECIMAL(5, 2) NOT NULL,
    basic_duty_amount DECIMAL(15, 2) NOT NULL,
    additional_duties JSONB,
    vat_rate DECIMAL(5, 2),
    vat_amount DECIMAL(15, 2),
    excise_rate DECIMAL(5, 2),
    excise_amount DECIMAL(15, 2),
    other_charges JSONB,
    total_duties DECIMAL(15, 2) NOT NULL,
    total_taxes DECIMAL(15, 2) NOT NULL,
    total_payable DECIMAL(15, 2) NOT NULL,
    trade_preference_id INTEGER,
    preference_applied VARCHAR(100),
    duty_exemption_amount DECIMAL(15, 2) DEFAULT 0,
    exemption_reason TEXT,
    calculated_by INTEGER REFERENCES users(id),
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verified_by INTEGER REFERENCES users(id),
    verified_at TIMESTAMP,
    blockchain_tx_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_calculation_method CHECK (calculation_method IN ('standard', 'preferential', 'exempted', 'simplified')),
    CONSTRAINT positive_amounts CHECK (
        customs_value >= 0 AND
        basic_duty_amount >= 0 AND
        total_duties >= 0 AND
        total_taxes >= 0 AND
        total_payable >= 0
    ),
    CONSTRAINT duty_calculations_additional_duties_valid CHECK (additional_duties IS NULL OR jsonb_typeof(additional_duties) IN ('array', 'object')),
    CONSTRAINT duty_calculations_other_charges_valid CHECK (other_charges IS NULL OR jsonb_typeof(other_charges) IN ('array', 'object'))
);

-- ----------------------------------------------------------------------------
-- Table: customs_valuations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customs_valuations (
    valuation_id SERIAL PRIMARY KEY,
    declaration_id VARCHAR(100) NOT NULL REFERENCES customs_declarations(declaration_id) ON DELETE CASCADE,
    valuation_method VARCHAR(50) NOT NULL,
    invoice_value DECIMAL(15, 2),
    invoice_currency VARCHAR(3),
    adjustments JSONB,
    freight_cost DECIMAL(15, 2),
    insurance_cost DECIMAL(15, 2),
    loading_costs DECIMAL(15, 2),
    deductible_costs JSONB,
    adjusted_value DECIMAL(15, 2) NOT NULL,
    final_customs_value DECIMAL(15, 2) NOT NULL,
    valuation_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    is_related_party BOOLEAN DEFAULT false,
    related_party_declaration TEXT,
    relationship_affects_price BOOLEAN,
    comparable_goods_value DECIMAL(15, 2),
    comparable_goods_reference VARCHAR(255),
    supporting_documents JSONB,
    valuation_notes TEXT,
    valued_by INTEGER REFERENCES users(id),
    valued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_by INTEGER REFERENCES users(id),
    approved_at TIMESTAMP,
    approval_status VARCHAR(50) DEFAULT 'pending',
    blockchain_tx_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_valuation_method CHECK (valuation_method IN (
        'TRANSACTION',       
        'IDENTICAL',         
        'SIMILAR',          
        'DEDUCTIVE',        
        'COMPUTED',         
        'FALLBACK'          
    )),
    CONSTRAINT valid_approval_status CHECK (approval_status IN ('pending', 'approved', 'rejected', 'under_review')),
    CONSTRAINT positive_valuation_amounts CHECK (
        final_customs_value >= 0 AND
        adjusted_value >= 0
    ),
    CONSTRAINT customs_valuations_adjustments_valid CHECK (adjustments IS NULL OR jsonb_typeof(adjustments) IN ('array', 'object')),
    CONSTRAINT customs_valuations_deductible_costs_valid CHECK (deductible_costs IS NULL OR jsonb_typeof(deductible_costs) IN ('array', 'object')),
    CONSTRAINT customs_valuations_supporting_documents_valid CHECK (supporting_documents IS NULL OR jsonb_typeof(supporting_documents) IN ('array', 'object'))
);

-- ----------------------------------------------------------------------------
-- Table: customs_tariffs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customs_tariffs (
    tariff_id SERIAL PRIMARY KEY,
    hs_code VARCHAR(20) NOT NULL,
    description TEXT NOT NULL,
    duty_rate DECIMAL(5, 2) NOT NULL,
    vat_rate DECIMAL(5, 2),
    excise_rate DECIMAL(5, 2),
    import_restrictions TEXT,
    effective_from DATE NOT NULL,
    effective_to DATE,
    country_of_origin VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT positive_rates CHECK (
        duty_rate >= 0 AND
        (vat_rate IS NULL OR vat_rate >= 0) AND
        (excise_rate IS NULL OR excise_rate >= 0)
    )
);

-- ----------------------------------------------------------------------------
-- Table: trade_preferences
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trade_preferences (
    preference_id SERIAL PRIMARY KEY,
    agreement_name VARCHAR(255) NOT NULL,
    country_group VARCHAR(100) NOT NULL,
    hs_code VARCHAR(20) NOT NULL,
    preferential_rate DECIMAL(5, 2) NOT NULL,
    standard_rate DECIMAL(5, 2) NOT NULL,
    duty_savings DECIMAL(5, 2) GENERATED ALWAYS AS (standard_rate - preferential_rate) STORED,
    origin_criteria TEXT,
    required_documents JSONB,
    valid_from DATE NOT NULL,
    valid_to DATE,
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT positive_preference_rates CHECK (
        preferential_rate >= 0 AND
        standard_rate >= 0
    )
);

-- ----------------------------------------------------------------------------
-- Table: customs_risk_rules
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customs_risk_rules (
    id INTEGER PRIMARY KEY DEFAULT 1,
    config JSONB NOT NULL,
    updated_by VARCHAR(255),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT customs_risk_rules_single_row CHECK (id = 1)
);

-- ----------------------------------------------------------------------------
-- Table: documents
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    document_id VARCHAR(100) UNIQUE NOT NULL,
    shipment_id VARCHAR(100),
    document_type VARCHAR(100),
    document_name VARCHAR(255),
    file_hash VARCHAR(255),
    ipfs_hash VARCHAR(255),
    uploaded_by INTEGER,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'pending',
    verified BOOLEAN DEFAULT FALSE,
    mime_type VARCHAR(100),
    file_size BIGINT,
    file_path VARCHAR(500),
    description TEXT,
    entity_type VARCHAR(50),
    entity_id VARCHAR(100),
    contract_id VARCHAR(100),
    exporter_id VARCHAR(100),
    file_name VARCHAR(255),
    blockchain_tx_id VARCHAR(255),
    verification_status VARCHAR(50)
);

-- ----------------------------------------------------------------------------
-- Table: contract_documents
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contract_documents (
    id SERIAL PRIMARY KEY,
    contract_id VARCHAR(100) NOT NULL,
    document_id VARCHAR(100) NOT NULL,
    linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    linked_by INTEGER,
    notes TEXT,
    UNIQUE(contract_id, document_id),
    CONSTRAINT fk_contract 
        FOREIGN KEY (contract_id) 
        REFERENCES contracts(contract_id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_document 
        FOREIGN KEY (document_id) 
        REFERENCES documents(document_id) 
        ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- Table: document_verifications
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_verifications (
    id SERIAL PRIMARY KEY,
    document_id VARCHAR(100),
    verified_by INTEGER,
    verification_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50),
    notes TEXT
);

-- ----------------------------------------------------------------------------
-- Table: document_signatures
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_signatures (
    id SERIAL PRIMARY KEY,
    signature_id VARCHAR(255) UNIQUE NOT NULL,
    document_id VARCHAR(255) NOT NULL,
    signer_id VARCHAR(255),
    signer_org VARCHAR(100),
    signature_type VARCHAR(50),
    certificate_id VARCHAR(255),
    remarks TEXT,
    blockchain_tx_id VARCHAR(255),
    visual_signature_added BOOLEAN DEFAULT FALSE,
    crypto_signature_embedded BOOLEAN DEFAULT FALSE,
    signed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    detached_signature_created BOOLEAN NOT NULL DEFAULT FALSE,
    document_hash_signed TEXT,
    ledger_validation_code INTEGER,
    ledger_validation_status TEXT,
    ledger_block_number BIGINT,
    ledger_block_hash TEXT,
    ledger_creator_msp_id TEXT,
    ledger_creator_identity TEXT,
    endorsing_msp_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    creator_signature_valid BOOLEAN,
    endorsement_signatures_valid BOOLEAN
);

-- ----------------------------------------------------------------------------
-- Table: blockchain_signatures
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blockchain_signatures (
    id SERIAL PRIMARY KEY,
    signature_id VARCHAR(255) UNIQUE NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(255) NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    signer_username VARCHAR(255),
    signer_org VARCHAR(100),
    signer_role VARCHAR(50),
    certificate_dn TEXT,
    certificate_fingerprint VARCHAR(255),
    blockchain_tx_id VARCHAR(255),
    blockchain_timestamp TIMESTAMP,
    chaincode_name VARCHAR(100),
    chaincode_function VARCHAR(100),
    transaction_args TEXT,
    endorsing_peers TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- Table: blockchain_identities
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blockchain_identities (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    username VARCHAR(100) NOT NULL,
    msp_id VARCHAR(50) NOT NULL,
    public_key TEXT NOT NULL,
    certificate TEXT NOT NULL,
    certificate_hash VARCHAR(64) NOT NULL,
    enrollment_id VARCHAR(200) NOT NULL UNIQUE,
    certified_role VARCHAR(50),
    certified_organization VARCHAR(100),
    revocation_status VARCHAR(40),
    crl_generated_at TIMESTAMP,
    crl_hash VARCHAR(64),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'revoked', 'expired')),
    revocation_reason TEXT,
    last_used_at TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- Table: blockchain_transactions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blockchain_transactions (
    id SERIAL PRIMARY KEY,
    tx_id VARCHAR(100) UNIQUE NOT NULL,
    channel_id VARCHAR(100) NOT NULL,
    chaincode_id VARCHAR(100) NOT NULL,
    block_number BIGINT,
    timestamp TIMESTAMP NOT NULL,
    creator_msp VARCHAR(100),
    tx_type VARCHAR(50),
    validation_code INTEGER,
    payload JSONB,
    endorsements JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- Table: blockchain_blocks
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blockchain_blocks (
    id SERIAL PRIMARY KEY,
    block_number BIGINT UNIQUE NOT NULL,
    block_hash VARCHAR(100) UNIQUE NOT NULL,
    previous_hash VARCHAR(100),
    channel_id VARCHAR(100) NOT NULL,
    data_hash VARCHAR(100),
    tx_count INTEGER DEFAULT 0,
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- Table: blockchain_events
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blockchain_events (
    id SERIAL PRIMARY KEY,
    event_name VARCHAR(100) NOT NULL,
    tx_id VARCHAR(100),
    block_number BIGINT,
    channel_id VARCHAR(100),
    chaincode_id VARCHAR(100),
    payload JSONB,
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- Table: blockchain_shipments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blockchain_shipments (
    shipment_id VARCHAR(100) PRIMARY KEY,
    contract_id VARCHAR(100),
    exporter_id VARCHAR(100),
    buyer_id VARCHAR(100),
    origin VARCHAR(100),
    quantity DECIMAL(10,2),
    grade VARCHAR(50),
    status VARCHAR(50),
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    synced_from VARCHAR(20),
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    raw_data JSONB
);

-- ----------------------------------------------------------------------------
-- Table: blockchain_documents
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blockchain_documents (
    document_id VARCHAR(100) PRIMARY KEY,
    shipment_id VARCHAR(100),
    document_type VARCHAR(50),
    issuer VARCHAR(100),
    status VARCHAR(50),
    ipfs_hash VARCHAR(255),
    verified BOOLEAN,
    created_at TIMESTAMP,
    synced_from VARCHAR(20),
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    raw_data JSONB
);

-- ----------------------------------------------------------------------------
-- Table: blockchain_contracts
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blockchain_contracts (
    contract_id VARCHAR(100) PRIMARY KEY,
    exporter_id VARCHAR(100),
    buyer_id VARCHAR(100),
    quantity DECIMAL(10,2),
    total_value DECIMAL(15,2),
    status VARCHAR(50),
    created_at TIMESTAMP,
    synced_from VARCHAR(20),
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    raw_data JSONB
);

-- ----------------------------------------------------------------------------
-- Table: blockchain_payments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blockchain_payments (
    payment_id VARCHAR(100) PRIMARY KEY,
    shipment_id VARCHAR(100),
    lc_number VARCHAR(100),
    amount DECIMAL(15,2),
    currency VARCHAR(10),
    status VARCHAR(50),
    payment_date TIMESTAMP,
    created_at TIMESTAMP,
    synced_from VARCHAR(20),
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    raw_data JSONB
);

-- ----------------------------------------------------------------------------
-- Table: blockchain_customs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blockchain_customs (
    clearance_id VARCHAR(100) PRIMARY KEY,
    shipment_id VARCHAR(100),
    declaration_number VARCHAR(100),
    clearance_status VARCHAR(50),
    clearance_date TIMESTAMP,
    created_at TIMESTAMP,
    synced_from VARCHAR(20),
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    raw_data JSONB
);

-- ----------------------------------------------------------------------------
-- Table: shipment_blockchain_sync
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shipment_blockchain_sync (
    id SERIAL PRIMARY KEY,
    shipment_id VARCHAR(100) UNIQUE NOT NULL,
    blockchain_tx_id VARCHAR(100),
    blockchain_block_number BIGINT,
    sync_status VARCHAR(50) DEFAULT 'pending',
    last_sync_at TIMESTAMP,
    sync_error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- Table: contract_blockchain_sync
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contract_blockchain_sync (
    id SERIAL PRIMARY KEY,
    contract_id VARCHAR(100) UNIQUE NOT NULL,
    blockchain_tx_id VARCHAR(100),
    blockchain_block_number BIGINT,
    sync_status VARCHAR(50) DEFAULT 'pending',
    last_sync_at TIMESTAMP,
    sync_error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- Table: lc_blockchain_sync
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lc_blockchain_sync (
    id SERIAL PRIMARY KEY,
    lc_id VARCHAR(100) UNIQUE NOT NULL,
    blockchain_tx_id VARCHAR(100),
    blockchain_block_number BIGINT,
    sync_status VARCHAR(50) DEFAULT 'pending',
    last_sync_at TIMESTAMP,
    sync_error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- Table: sync_status
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_status (
    id SERIAL PRIMARY KEY,
    couch_instance VARCHAR(50) NOT NULL,
    database_name VARCHAR(100) NOT NULL,
    last_sync TIMESTAMP,
    last_seq VARCHAR(100),
    documents_synced INTEGER,
    status VARCHAR(50),
    error_message TEXT,
    UNIQUE(couch_instance, database_name)
);

-- ----------------------------------------------------------------------------
-- Table: webhooks
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS webhooks (
    id SERIAL PRIMARY KEY,
    webhook_id VARCHAR(100) UNIQUE NOT NULL,
    url VARCHAR(500) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    secret VARCHAR(255),
    active BOOLEAN DEFAULT TRUE,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- Table: notifications
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    title VARCHAR(255),
    message TEXT,
    type VARCHAR(50),
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    entity_type VARCHAR(100),
    entity_id VARCHAR(100),
    action_url VARCHAR(255),
    severity VARCHAR(20) DEFAULT 'info',
    role VARCHAR(50),
    exporter_id VARCHAR(100)
);

-- ----------------------------------------------------------------------------
-- Table: audit_trail
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_trail (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(100),
    entity_id VARCHAR(100),
    action VARCHAR(100),
    user_id INTEGER,
    old_value JSONB,
    new_value JSONB,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),
    performed_by_org VARCHAR(100),
    performed_by VARCHAR(255),
    organization VARCHAR(100),
    changes JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    blockchain_tx_id VARCHAR(255),
    reason TEXT,
    metadata JSONB DEFAULT '{}',
    CONSTRAINT audit_trail_old_value_is_json_check CHECK (
      old_value IS NULL OR 
      jsonb_typeof(old_value) IN ('object', 'array')
    ),
    CONSTRAINT audit_trail_new_value_is_json_check CHECK (
      new_value IS NULL OR 
      jsonb_typeof(new_value) IN ('object', 'array')
    ),
    CONSTRAINT audit_trail_metadata_is_json_check CHECK (
      metadata IS NULL OR 
      jsonb_typeof(metadata) IN ('object', 'array')
    )
);

-- ----------------------------------------------------------------------------
-- Table: audit_log
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(100),
    entity_id VARCHAR(100),
    action VARCHAR(100),
    user_id INTEGER,
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(50),
    user_agent TEXT
);

-- ----------------------------------------------------------------------------
-- Table: audit_logs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    action VARCHAR(255),
    entity_type VARCHAR(100),
    entity_id VARCHAR(100),
    user_id INTEGER,
    changes JSONB,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- Table: system_alerts
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_alerts (
    id SERIAL PRIMARY KEY,
    alert_type VARCHAR(100) NOT NULL,
    severity VARCHAR(50) NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
    title VARCHAR(500) NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolved BOOLEAN NOT NULL DEFAULT false,
    resolved_at TIMESTAMP,
    resolved_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- Table: if
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS if (
    rejection_reason TEXT
);

-- ============================================================================
-- Indexes for Query Performance and Lookup Efficiency
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_organization ON users(organization);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status);
CREATE INDEX IF NOT EXISTS idx_shipments_exporter ON shipments(exporter_id);
CREATE INDEX IF NOT EXISTS idx_shipments_created ON shipments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_shipment ON documents(shipment_id);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(document_type);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_contracts_exporter ON contracts(exporter_id);
CREATE INDEX IF NOT EXISTS idx_contracts_buyer ON contracts(buyer_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_lc_shipment ON letters_of_credit(shipment_id);
CREATE INDEX IF NOT EXISTS idx_lc_status ON letters_of_credit(status);
CREATE INDEX IF NOT EXISTS idx_payments_lc ON payments(lc_number);
CREATE INDEX IF NOT EXISTS idx_payments_shipment ON payments(shipment_id);
CREATE INDEX IF NOT EXISTS idx_forex_shipment ON forex_allocations(shipment_id);
CREATE INDEX IF NOT EXISTS idx_forex_lc ON forex_allocations(lc_number);
CREATE INDEX IF NOT EXISTS idx_customs_decl_shipment ON customs_declarations(shipment_id);
CREATE INDEX IF NOT EXISTS idx_customs_clear_shipment ON customs_clearances(shipment_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_entity ON audit_trail(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_user ON audit_trail(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_timestamp ON audit_trail(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_blockchain_shipments_status ON blockchain_shipments(status);
CREATE INDEX IF NOT EXISTS idx_blockchain_shipments_exporter ON blockchain_shipments(exporter_id);
CREATE INDEX IF NOT EXISTS idx_blockchain_shipments_contract ON blockchain_shipments(contract_id);
CREATE INDEX IF NOT EXISTS idx_blockchain_shipments_synced_from ON blockchain_shipments(synced_from);
CREATE INDEX IF NOT EXISTS idx_blockchain_documents_shipment ON blockchain_documents(shipment_id);
CREATE INDEX IF NOT EXISTS idx_blockchain_documents_type ON blockchain_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_blockchain_contracts_exporter ON blockchain_contracts(exporter_id);
CREATE INDEX IF NOT EXISTS idx_blockchain_contracts_status ON blockchain_contracts(status);
CREATE INDEX IF NOT EXISTS idx_blockchain_payments_shipment ON blockchain_payments(shipment_id);
CREATE INDEX IF NOT EXISTS idx_blockchain_payments_lc ON blockchain_payments(lc_number);
CREATE INDEX IF NOT EXISTS idx_blockchain_customs_shipment ON blockchain_customs(shipment_id);
CREATE INDEX IF NOT EXISTS idx_sync_status_instance ON sync_status(couch_instance);
CREATE INDEX IF NOT EXISTS idx_sync_status_last_sync ON sync_status(last_sync DESC);
CREATE INDEX IF NOT EXISTS idx_lc_contract_id ON letters_of_credit(contract_id);
CREATE INDEX IF NOT EXISTS idx_lc_exporter_id ON letters_of_credit(exporter_id);
CREATE INDEX IF NOT EXISTS idx_lc_id ON letters_of_credit(lc_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_action ON audit_trail(action);
CREATE INDEX IF NOT EXISTS idx_audit_trail_performed_by ON audit_trail(performed_by);
CREATE INDEX IF NOT EXISTS idx_audit_trail_performed_by_org ON audit_trail(performed_by_org);
CREATE INDEX IF NOT EXISTS idx_audit_trail_timestamp_desc ON audit_trail(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_trail_entity_action ON audit_trail(entity_type, action);
CREATE INDEX IF NOT EXISTS idx_exporter_applications_application_id 
ON exporter_applications(application_id);
CREATE INDEX IF NOT EXISTS idx_exporter_applications_status 
ON exporter_applications(status);
CREATE INDEX IF NOT EXISTS idx_exporter_applications_email 
ON exporter_applications(email);
CREATE INDEX IF NOT EXISTS idx_blockchain_tx_block ON blockchain_transactions(block_number);
CREATE INDEX IF NOT EXISTS idx_blockchain_tx_channel ON blockchain_transactions(channel_id);
CREATE INDEX IF NOT EXISTS idx_blockchain_blocks_channel ON blockchain_blocks(channel_id);
CREATE INDEX IF NOT EXISTS idx_blockchain_events_tx ON blockchain_events(tx_id);
CREATE INDEX IF NOT EXISTS idx_shipment_sync_status ON shipment_blockchain_sync(sync_status);
CREATE INDEX IF NOT EXISTS idx_contract_sync_status ON contract_blockchain_sync(sync_status);
CREATE INDEX IF NOT EXISTS idx_lc_sync_status ON lc_blockchain_sync(sync_status);
CREATE INDEX IF NOT EXISTS idx_repatriation_payment ON export_proceeds_repatriation(payment_id);
CREATE INDEX IF NOT EXISTS idx_repatriation_contract ON export_proceeds_repatriation(contract_id);
CREATE INDEX IF NOT EXISTS idx_repatriation_shipment ON export_proceeds_repatriation(shipment_id);
CREATE INDEX IF NOT EXISTS idx_repatriation_exporter ON export_proceeds_repatriation(exporter_id);
CREATE INDEX IF NOT EXISTS idx_repatriation_status ON export_proceeds_repatriation(status);
CREATE INDEX IF NOT EXISTS idx_repatriation_deadline ON export_proceeds_repatriation(compliance_deadline);
CREATE INDEX IF NOT EXISTS idx_repatriation_overdue ON export_proceeds_repatriation(is_overdue) WHERE is_overdue = TRUE;
CREATE INDEX IF NOT EXISTS idx_payments_contract ON payments(contract_id);
CREATE INDEX IF NOT EXISTS idx_payments_exporter ON payments(exporter_id);
CREATE INDEX IF NOT EXISTS idx_quality_inspections_exporter ON quality_inspections(exporter_id);
CREATE INDEX IF NOT EXISTS idx_contracts_blockchain_tx ON contracts(blockchain_tx_id);
CREATE INDEX IF NOT EXISTS idx_contracts_buyer_country ON contracts(buyer_country);
CREATE INDEX IF NOT EXISTS idx_contracts_coffee_type ON contracts(coffee_type);
CREATE INDEX IF NOT EXISTS idx_contracts_eudr ON contracts(eudr_required) WHERE eudr_required = true;
CREATE INDEX IF NOT EXISTS idx_contracts_buyer_name ON contracts(buyer_name);
CREATE INDEX IF NOT EXISTS idx_contracts_delivery_date ON contracts(delivery_date);
CREATE INDEX IF NOT EXISTS idx_contracts_organic ON contracts(organic_certified) WHERE organic_certified = true;
CREATE INDEX IF NOT EXISTS idx_contracts_fair_trade ON contracts(fair_trade_certified) WHERE fair_trade_certified = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_quality_inspections_inspection_id 
ON quality_inspections(inspection_id) 
WHERE inspection_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_permits_status ON export_permits(status);
CREATE INDEX IF NOT EXISTS idx_permits_contract ON export_permits(contract_id);
CREATE INDEX IF NOT EXISTS idx_phyto_status ON phytosanitary_certificates(status);
CREATE INDEX IF NOT EXISTS idx_phyto_contract ON phytosanitary_certificates(contract_id);
CREATE INDEX IF NOT EXISTS idx_coo_status ON certificate_of_origin(status);
CREATE INDEX IF NOT EXISTS idx_coo_contract ON certificate_of_origin(contract_id);
CREATE INDEX IF NOT EXISTS idx_customs_assess_decl ON customs_assessments(declaration_number);
CREATE INDEX IF NOT EXISTS idx_customs_assess_status ON customs_assessments(status);
CREATE INDEX IF NOT EXISTS idx_documentary_collections_lc ON documentary_collections(lc_id);
CREATE INDEX IF NOT EXISTS idx_documentary_collections_status ON documentary_collections(status);
CREATE INDEX IF NOT EXISTS idx_advance_payments_contract ON advance_payments(contract_id);
CREATE INDEX IF NOT EXISTS idx_advance_payments_status ON advance_payments(status);
CREATE INDEX IF NOT EXISTS idx_consignment_payments_contract ON consignment_payments(contract_id);
CREATE INDEX IF NOT EXISTS idx_consignment_payments_status ON consignment_payments(status);
CREATE INDEX IF NOT EXISTS idx_documents_shipment_id ON documents(shipment_id);
CREATE INDEX IF NOT EXISTS idx_documents_document_type ON documents(document_type);
CREATE INDEX IF NOT EXISTS idx_customs_declarations_exporter
  ON customs_declarations(exporter_id);
CREATE INDEX IF NOT EXISTS idx_customs_declarations_status
  ON customs_declarations(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_letters_of_credit_lc_id
  ON letters_of_credit(lc_id);
CREATE INDEX IF NOT EXISTS idx_letters_of_credit_contract
  ON letters_of_credit(contract_id);
CREATE INDEX IF NOT EXISTS idx_documents_entity_linkage
  ON documents(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_doc_sig_document_id ON document_signatures(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_sig_blockchain_tx ON document_signatures(blockchain_tx_id);
CREATE INDEX IF NOT EXISTS idx_blockchain_identities_msp_status
  ON blockchain_identities(msp_id, status);
CREATE INDEX IF NOT EXISTS idx_blockchain_identities_expiration
  ON blockchain_identities(expires_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_lc_discrepancies_lc_id ON lc_discrepancies(lc_id);
CREATE INDEX IF NOT EXISTS idx_lc_discrepancies_status ON lc_discrepancies(status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_forex_allocations_forex_id
  ON forex_allocations(forex_id);
CREATE INDEX IF NOT EXISTS idx_system_alerts_open_created
  ON system_alerts (created_at DESC, id DESC)
  WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_system_alerts_severity_created
  ON system_alerts (severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contract_documents_contract_id 
    ON contract_documents(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_documents_document_id 
    ON contract_documents(document_id);
CREATE INDEX IF NOT EXISTS idx_documents_contract_id ON documents(contract_id);
CREATE INDEX IF NOT EXISTS idx_documents_exporter_id ON documents(exporter_id);
CREATE INDEX IF NOT EXISTS idx_shipments_logistics_status ON shipments(logistics_status);
CREATE INDEX IF NOT EXISTS idx_payments_tracking_status ON payments(payment_tracking_status);
CREATE INDEX IF NOT EXISTS idx_applicant_credentials_username 
    ON applicant_credentials(temp_username);
CREATE INDEX IF NOT EXISTS idx_applicant_credentials_application 
    ON applicant_credentials(application_id);
CREATE INDEX IF NOT EXISTS idx_exporter_applications_temp_username 
    ON exporter_applications(temp_username);
CREATE INDEX IF NOT EXISTS idx_contracts_approved_by ON contracts(approved_by);
CREATE INDEX IF NOT EXISTS idx_contracts_approved_at ON contracts(approved_at);
CREATE INDEX IF NOT EXISTS idx_blockchain_signatures_entity ON blockchain_signatures(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_blockchain_signatures_tx_id ON blockchain_signatures(blockchain_tx_id);
CREATE INDEX IF NOT EXISTS idx_blockchain_signatures_signer ON blockchain_signatures(signer_username, signer_org);
CREATE INDEX IF NOT EXISTS idx_approval_requirements_lookup ON approval_requirements(document_type, entity_type, active);
CREATE INDEX IF NOT EXISTS idx_payments_lc_id ON payments(lc_id);
CREATE INDEX IF NOT EXISTS idx_payments_forex_id ON payments(forex_id);
CREATE INDEX IF NOT EXISTS idx_payments_exporter_id ON payments(exporter_id);
CREATE INDEX IF NOT EXISTS idx_exporters_exporter_id ON exporters(exporter_id);
CREATE INDEX IF NOT EXISTS idx_exporters_license_number ON exporters(ecta_license_number);
CREATE INDEX IF NOT EXISTS idx_exporters_license_status ON exporters(license_status);
CREATE INDEX IF NOT EXISTS idx_exporters_company_name ON exporters(company_name);
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires_at
    ON revoked_tokens (expires_at);
CREATE INDEX IF NOT EXISTS idx_post_delivery_shipment
    ON post_delivery_tracking (shipment_id);
CREATE INDEX IF NOT EXISTS idx_post_delivery_overall_status
    ON post_delivery_tracking (overall_status);
CREATE INDEX IF NOT EXISTS idx_post_delivery_issues_shipment
    ON post_delivery_issues (shipment_id, resolved);
CREATE INDEX IF NOT EXISTS idx_post_delivery_checklist_shipment
    ON post_delivery_checklist (shipment_id);
CREATE INDEX IF NOT EXISTS idx_ecx_lots_status ON ecx_lots(status);
CREATE INDEX IF NOT EXISTS idx_ecx_lots_exporter ON ecx_lots(exporter_id);
CREATE INDEX IF NOT EXISTS idx_ecx_lots_number ON ecx_lots(lot_number);
CREATE INDEX IF NOT EXISTS idx_forex_repatriations_allocation ON forex_repatriations(forex_allocation_id);
CREATE INDEX IF NOT EXISTS idx_forex_repatriations_id ON forex_repatriations(repatriation_id);
CREATE INDEX IF NOT EXISTS idx_shipping_bookings_shipment
  ON shipping_bookings(shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipping_bookings_status
  ON shipping_bookings(status);
CREATE INDEX IF NOT EXISTS idx_lc_transfers_lc_id ON lc_transfers(lc_id);
CREATE INDEX IF NOT EXISTS idx_lc_transfers_transfer_id ON lc_transfers(transfer_id);
CREATE INDEX IF NOT EXISTS idx_lc_transfers_status ON lc_transfers(status);
CREATE INDEX IF NOT EXISTS idx_standby_lc_id ON standby_letters_of_credit(standby_lc_id);
CREATE INDEX IF NOT EXISTS idx_standby_lc_number ON standby_letters_of_credit(standby_lc_number);
CREATE INDEX IF NOT EXISTS idx_standby_contract_id ON standby_letters_of_credit(contract_id);
CREATE INDEX IF NOT EXISTS idx_standby_status ON standby_letters_of_credit(status);
CREATE INDEX IF NOT EXISTS idx_standby_type ON standby_letters_of_credit(type);
CREATE INDEX IF NOT EXISTS idx_deferred_payments_lc_id ON deferred_payments(lc_id);
CREATE INDEX IF NOT EXISTS idx_deferred_payments_status ON deferred_payments(status);
CREATE INDEX IF NOT EXISTS idx_deferred_payments_maturity_date ON deferred_payments(maturity_date);
CREATE INDEX IF NOT EXISTS idx_acceptance_financing_lc_id ON acceptance_financing(lc_id);
CREATE INDEX IF NOT EXISTS idx_acceptance_financing_status ON acceptance_financing(status);
CREATE INDEX IF NOT EXISTS idx_acceptance_financing_maturity ON acceptance_financing(maturity_date);
CREATE INDEX IF NOT EXISTS idx_forex_conversions_payment_id ON forex_conversions(payment_id);
CREATE INDEX IF NOT EXISTS idx_forex_conversions_lc_id ON forex_conversions(lc_id);
CREATE INDEX IF NOT EXISTS idx_forex_conversions_rate_date ON forex_conversions(rate_date);
CREATE INDEX IF NOT EXISTS idx_bl_id ON bills_of_lading(bl_id);
CREATE INDEX IF NOT EXISTS idx_bl_number ON bills_of_lading(bl_number);
CREATE INDEX IF NOT EXISTS idx_bl_booking_id ON bills_of_lading(booking_id);
CREATE INDEX IF NOT EXISTS idx_bl_type ON bills_of_lading(bl_type);
CREATE INDEX IF NOT EXISTS idx_bl_status ON bills_of_lading(status);
CREATE INDEX IF NOT EXISTS idx_booking_amendments_booking_id ON booking_amendments(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_amendments_status ON booking_amendments(status);
CREATE INDEX IF NOT EXISTS idx_container_allocations_booking_id ON container_allocations(booking_id);
CREATE INDEX IF NOT EXISTS idx_container_allocations_container_number ON container_allocations(container_number);
CREATE INDEX IF NOT EXISTS idx_container_allocations_status ON container_allocations(status);
CREATE INDEX IF NOT EXISTS idx_stuffing_reports_container_id ON container_stuffing_reports(container_id);
CREATE INDEX IF NOT EXISTS idx_stuffing_reports_container_number ON container_stuffing_reports(container_number);
CREATE INDEX IF NOT EXISTS idx_stuffing_reports_stuffing_date ON container_stuffing_reports(stuffing_date);
CREATE INDEX IF NOT EXISTS idx_declaration_amendments_declaration ON declaration_amendments(declaration_id);
CREATE INDEX IF NOT EXISTS idx_declaration_amendments_status ON declaration_amendments(approval_status);
CREATE INDEX IF NOT EXISTS idx_declaration_amendments_requested_at ON declaration_amendments(amendment_requested_at);
CREATE INDEX IF NOT EXISTS idx_duty_calculations_declaration ON duty_calculations(declaration_id);
CREATE INDEX IF NOT EXISTS idx_duty_calculations_calculated_at ON duty_calculations(calculated_at);
CREATE INDEX IF NOT EXISTS idx_customs_valuations_declaration ON customs_valuations(declaration_id);
CREATE INDEX IF NOT EXISTS idx_customs_valuations_method ON customs_valuations(valuation_method);
CREATE INDEX IF NOT EXISTS idx_customs_valuations_status ON customs_valuations(approval_status);
CREATE INDEX IF NOT EXISTS idx_customs_declarations_cancellation ON customs_declarations(cancellation_status) 
    WHERE cancellation_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customs_tariffs_hs_code ON customs_tariffs(hs_code);
CREATE INDEX IF NOT EXISTS idx_customs_tariffs_effective ON customs_tariffs(effective_from, effective_to);
CREATE INDEX IF NOT EXISTS idx_customs_tariffs_origin ON customs_tariffs(country_of_origin);
CREATE INDEX IF NOT EXISTS idx_trade_preferences_agreement ON trade_preferences(agreement_name);
CREATE INDEX IF NOT EXISTS idx_trade_preferences_hs_code ON trade_preferences(hs_code);
CREATE INDEX IF NOT EXISTS idx_trade_preferences_country_group ON trade_preferences(country_group);
CREATE INDEX IF NOT EXISTS idx_trade_preferences_active ON trade_preferences(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_retention_accounts_exporter ON retention_accounts(exporter_id);
CREATE INDEX IF NOT EXISTS idx_retention_accounts_status ON retention_accounts(status);
CREATE INDEX IF NOT EXISTS idx_retention_accounts_currency ON retention_accounts(currency);
CREATE INDEX IF NOT EXISTS idx_retention_accounts_balance ON retention_accounts(current_balance);
CREATE INDEX IF NOT EXISTS idx_retention_penalties_account ON retention_penalties(account_id);
CREATE INDEX IF NOT EXISTS idx_retention_penalties_status ON retention_penalties(status);
CREATE INDEX IF NOT EXISTS idx_retention_penalties_violation_type ON retention_penalties(violation_type);
CREATE INDEX IF NOT EXISTS idx_retention_penalties_payment_deadline ON retention_penalties(payment_deadline);
CREATE INDEX IF NOT EXISTS idx_retention_penalties_created ON retention_penalties(created_at);
CREATE INDEX IF NOT EXISTS idx_retention_waivers_exporter ON retention_waivers(exporter_id);
CREATE INDEX IF NOT EXISTS idx_retention_waivers_account ON retention_waivers(account_id);
CREATE INDEX IF NOT EXISTS idx_retention_waivers_penalty ON retention_waivers(penalty_id);
CREATE INDEX IF NOT EXISTS idx_retention_waivers_status ON retention_waivers(request_status);
CREATE INDEX IF NOT EXISTS idx_retention_waivers_type ON retention_waivers(request_type);
CREATE INDEX IF NOT EXISTS idx_retention_waivers_created ON retention_waivers(created_at);
CREATE INDEX IF NOT EXISTS idx_retention_transactions_account ON retention_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_retention_transactions_type ON retention_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_retention_transactions_processed ON retention_transactions(processed_at);
CREATE INDEX IF NOT EXISTS idx_retention_transactions_reference ON retention_transactions(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_retention_policies_active ON retention_compliance_policies(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_retention_policies_effective ON retention_compliance_policies(effective_from, effective_to);
CREATE INDEX IF NOT EXISTS idx_retention_policies_product ON retention_compliance_policies(product_category);
CREATE INDEX IF NOT EXISTS idx_user_2fa_settings_user ON user_2fa_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_2fa_settings_enabled ON user_2fa_settings(is_enabled) WHERE is_enabled = true;
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_last_activity ON user_sessions(last_activity);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_2fa_verification_log_user ON user_2fa_verification_log(user_id);
CREATE INDEX IF NOT EXISTS idx_2fa_verification_log_attempted ON user_2fa_verification_log(attempted_at);
CREATE INDEX IF NOT EXISTS idx_2fa_verification_log_success ON user_2fa_verification_log(was_successful);
CREATE INDEX IF NOT EXISTS idx_session_activity_log_session ON session_activity_log(session_id);
CREATE INDEX IF NOT EXISTS idx_session_activity_log_user ON session_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_session_activity_log_occurred ON session_activity_log(occurred_at);
CREATE INDEX IF NOT EXISTS idx_session_activity_log_type ON session_activity_log(activity_type);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_user ON user_trusted_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_fingerprint ON user_trusted_devices(device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_trusted ON user_trusted_devices(is_trusted) WHERE is_trusted = true;
CREATE INDEX IF NOT EXISTS idx_trusted_devices_expires ON user_trusted_devices(expires_at);
CREATE INDEX IF NOT EXISTS idx_notifications_role ON notifications(role);
CREATE INDEX IF NOT EXISTS idx_notifications_exporter_id ON notifications(exporter_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_phyto_shipment ON phytosanitary_certificates(shipment_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_exporter_applications_exporter_id_unique
  ON exporter_applications (exporter_id)
  WHERE exporter_id IS NOT NULL AND exporter_id <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_exporter_applications_license_number_unique
  ON exporter_applications (license_number)
  WHERE license_number IS NOT NULL AND license_number <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_exporter_applications_ecta_license_number_unique
  ON exporter_applications (ecta_license_number)
  WHERE ecta_license_number IS NOT NULL AND ecta_license_number <> '';
CREATE INDEX IF NOT EXISTS idx_user_activity_log_user_id ON user_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_log_action ON user_activity_log(action);
CREATE INDEX IF NOT EXISTS idx_user_activity_log_target ON user_activity_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_log_created ON user_activity_log(created_at DESC);

-- ----------------------------------------------------------------------------
-- Schema Migrations Tracking
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS _schema_migrations (
    id SERIAL PRIMARY KEY,
    migration_name VARCHAR(255) UNIQUE NOT NULL,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO _schema_migrations (migration_name) VALUES ('001_baseline_schema') ON CONFLICT DO NOTHING;

