-- Run on existing databases that were created before counter pricing columns.
-- Safe to run once; ignore errors if columns already exist.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_charge_amount DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_payment_method VARCHAR(20);
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_checkout_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_checkout_payment_method_check
  CHECK (checkout_payment_method IS NULL OR checkout_payment_method IN ('cash', 'card', 'online'));

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_payment_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_payment_method_check
  CHECK (payment_method IN ('cash', 'credit_card', 'debit_card', 'digital_wallet', 'online'));
