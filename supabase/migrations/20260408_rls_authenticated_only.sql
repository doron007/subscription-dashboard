-- Migration: Replace always-true RLS policies with authenticated-only access
-- Date: 2026-04-08
-- Context: Security audit found all sub_ tables had RLS enabled but with
--   always-true policies (e.g., "using (true)"), providing zero actual protection.
--   This migration restricts access to authenticated users only.
--
-- Access pattern:
--   - Browser client: anon key + Supabase Auth session → "authenticated" role
--   - Server API routes: anon key + user cookies → "authenticated" role
--   - Admin client (SAP, backups, reports): service_role key → bypasses RLS entirely
--
-- Tables NOT touched:
--   - sub_backup_*, sub_etl_overrides: already locked down (RLS on, no policies = service_role only)
--   - sub_profiles: not in scope (separate auth table)
--   - Non-sub_ tables: belong to other projects sharing this Supabase instance

BEGIN;

-- ============================================================
-- sub_assignments
-- ============================================================
DROP POLICY IF EXISTS "Public assignments access" ON sub_assignments;
CREATE POLICY "Authenticated users only" ON sub_assignments
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- sub_devices
-- ============================================================
DROP POLICY IF EXISTS "Public devices access" ON sub_devices;
CREATE POLICY "Authenticated users only" ON sub_devices
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- sub_employees
-- ============================================================
DROP POLICY IF EXISTS "Public employees access" ON sub_employees;
CREATE POLICY "Authenticated users only" ON sub_employees
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- sub_invoice_line_items
-- ============================================================
DROP POLICY IF EXISTS "Public line items access" ON sub_invoice_line_items;
CREATE POLICY "Authenticated users only" ON sub_invoice_line_items
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- sub_invoices
-- ============================================================
DROP POLICY IF EXISTS "Public invoices access" ON sub_invoices;
CREATE POLICY "Authenticated users only" ON sub_invoices
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- sub_subscription_services
-- ============================================================
DROP POLICY IF EXISTS "Public services access" ON sub_subscription_services;
CREATE POLICY "Authenticated users only" ON sub_subscription_services
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- sub_subscriptions
-- ============================================================
DROP POLICY IF EXISTS "Enable all access for all users" ON sub_subscriptions;
CREATE POLICY "Authenticated users only" ON sub_subscriptions
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- sub_transactions
-- ============================================================
DROP POLICY IF EXISTS "Public transactions access" ON sub_transactions;
CREATE POLICY "Authenticated users only" ON sub_transactions
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- sub_vendors
-- ============================================================
DROP POLICY IF EXISTS "Public vendors access" ON sub_vendors;
CREATE POLICY "Authenticated users only" ON sub_vendors
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMIT;
