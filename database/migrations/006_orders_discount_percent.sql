-- Persist the discount percentage alongside the discount amount so receipts
-- and UI can distinguish percent-based discounts from flat-amount discounts.
--
-- NULL  → discount was entered as a flat amount (or there's no discount).
-- 0-100 → discount was entered as a percentage of the order subtotal.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_percent DECIMAL(5,2) NULL;

-- Sanity guard: keep values in the legal 0–100 range when present.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_discount_percent_range;
ALTER TABLE orders ADD CONSTRAINT orders_discount_percent_range
    CHECK (discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100));
