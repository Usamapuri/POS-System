-- Per-order delivery fee (from settings; stored for historical receipts)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0;
