-- Phase 5: Add Line Items for Granular Reporting
ALTER TABLE sub_subscriptions 
ADD COLUMN line_items JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN sub_subscriptions.line_items IS 'Array of granular cost items (e.g. AWS S3, EC2)';
