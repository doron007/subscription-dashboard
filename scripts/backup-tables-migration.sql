-- Backup & Recovery System Migration
-- Run this manually against the Supabase database.
-- Creates backup metadata + snapshot tables for all sub_* tables.

-- 1. Backup metadata table
CREATE TABLE IF NOT EXISTS sub_backup_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    trigger_type TEXT NOT NULL CHECK (trigger_type IN ('auto', 'manual')),
    label TEXT,
    row_counts JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_sub_backup_metadata_created_at
    ON sub_backup_metadata (created_at DESC);

-- 2. Backup vendors
CREATE TABLE IF NOT EXISTS sub_backup_vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    backup_id UUID NOT NULL REFERENCES sub_backup_metadata(id) ON DELETE CASCADE,
    source_id UUID NOT NULL,
    name TEXT,
    website TEXT,
    contact_email TEXT,
    logo_url TEXT,
    category TEXT,
    created_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sub_backup_vendors_backup_id
    ON sub_backup_vendors (backup_id);

-- 3. Backup subscriptions
CREATE TABLE IF NOT EXISTS sub_backup_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    backup_id UUID NOT NULL REFERENCES sub_backup_metadata(id) ON DELETE CASCADE,
    source_id UUID NOT NULL,
    vendor_id UUID,
    name TEXT,
    category TEXT,
    logo TEXT,
    renewal_date DATE,
    cost NUMERIC,
    billing_cycle TEXT,
    payment_method TEXT,
    payment_details TEXT,
    auto_renewal BOOLEAN,
    owner_name TEXT,
    owner_email TEXT,
    seats_total INTEGER,
    seats_used INTEGER,
    status TEXT,
    description TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sub_backup_subscriptions_backup_id
    ON sub_backup_subscriptions (backup_id);

-- 4. Backup invoices
CREATE TABLE IF NOT EXISTS sub_backup_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    backup_id UUID NOT NULL REFERENCES sub_backup_metadata(id) ON DELETE CASCADE,
    source_id UUID NOT NULL,
    vendor_id UUID,
    subscription_id UUID,
    invoice_number TEXT,
    invoice_date DATE,
    due_date DATE,
    total_amount NUMERIC,
    currency TEXT,
    status TEXT,
    file_url TEXT,
    created_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sub_backup_invoices_backup_id
    ON sub_backup_invoices (backup_id);

-- 5. Backup invoice line items
CREATE TABLE IF NOT EXISTS sub_backup_line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    backup_id UUID NOT NULL REFERENCES sub_backup_metadata(id) ON DELETE CASCADE,
    source_id UUID NOT NULL,
    invoice_id UUID,
    service_id UUID,
    description TEXT,
    quantity NUMERIC,
    unit_price NUMERIC,
    total_amount NUMERIC,
    period_start DATE,
    period_end DATE,
    billing_month_override DATE,
    created_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sub_backup_line_items_backup_id
    ON sub_backup_line_items (backup_id);

-- 6. Backup subscription services
CREATE TABLE IF NOT EXISTS sub_backup_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    backup_id UUID NOT NULL REFERENCES sub_backup_metadata(id) ON DELETE CASCADE,
    source_id UUID NOT NULL,
    subscription_id UUID,
    name TEXT,
    category TEXT,
    status TEXT,
    current_quantity NUMERIC,
    current_unit_price NUMERIC,
    currency TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sub_backup_services_backup_id
    ON sub_backup_services (backup_id);
