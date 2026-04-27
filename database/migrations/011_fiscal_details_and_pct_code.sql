-- Fiscal engine: per-order government sync state + menu PCT codes for FBR line items
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fiscal_details JSONB;
ALTER TABLE products ADD COLUMN IF NOT EXISTS pct_code VARCHAR(32) NOT NULL DEFAULT '9801.7000';
