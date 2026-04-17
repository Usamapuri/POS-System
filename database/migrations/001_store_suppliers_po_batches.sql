-- Migration: store purchasing (suppliers, purchase orders, FIFO batches) + stock_movements columns
-- Safe to run multiple times (idempotent) on PostgreSQL 15+.
-- Fixes: relation "suppliers" does not exist; relation "stock_batches" does not exist
--   make db-migrate-store-purchasing
--   ./scripts/migrate-store-purchasing.sh
--
-- NOTE: stock_batches is created BEFORE the movement_type CHECK change so that if the
-- constraint step fails on legacy data, FIFO tables still exist (CreateStockItem / purchases need them).

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Ensure updated_at helper exists (matches 01_schema.sql)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1) Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL,
    contact_name VARCHAR(100),
    phone VARCHAR(40),
    email VARCHAR(120),
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2) Purchase orders
CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    status VARCHAR(24) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'ordered', 'partially_received', 'received', 'cancelled')),
    expected_date DATE,
    notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3) PO lines
CREATE TABLE IF NOT EXISTS purchase_order_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    stock_item_id UUID NOT NULL REFERENCES stock_items(id) ON DELETE RESTRICT,
    quantity_ordered DECIMAL(10,2) NOT NULL CHECK (quantity_ordered > 0),
    unit_cost DECIMAL(10,2),
    quantity_received DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4) stock_movements: link purchases to supplier / PO (if columns missing)
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL;

-- 5) FIFO lots (before movement_type CHECK — see file header)
CREATE TABLE IF NOT EXISTS stock_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stock_item_id UUID NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
    quantity_remaining DECIMAL(10,2) NOT NULL CHECK (quantity_remaining >= 0),
    initial_quantity DECIMAL(10,2) NOT NULL CHECK (initial_quantity > 0),
    unit_cost DECIMAL(10,2),
    expiry_date DATE,
    stock_movement_id UUID REFERENCES stock_movements(id) ON DELETE SET NULL,
    purchase_order_line_id UUID REFERENCES purchase_order_lines(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6) Indexes (safe if table already existed)
CREATE INDEX IF NOT EXISTS idx_stock_batches_fifo ON stock_batches (stock_item_id, expiry_date NULLS LAST, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_batches_remaining ON stock_batches (stock_item_id) WHERE quantity_remaining > 0;
CREATE INDEX IF NOT EXISTS idx_stock_movements_supplier ON stock_movements(supplier_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_po ON stock_movements(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_po ON purchase_order_lines(purchase_order_id);

-- 7) movement_type must allow 'adjustment' (may error if invalid legacy rows exist — batches already created above)
ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_movement_type_check
    CHECK (movement_type IN ('purchase', 'issue', 'adjustment'));

-- 8) Triggers for updated_at (same spelling as database/init/01_schema.sql)
DROP TRIGGER IF EXISTS update_suppliers_updated_at ON suppliers;
CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_purchase_orders_updated_at ON purchase_orders;
CREATE TRIGGER update_purchase_orders_updated_at BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_purchase_order_lines_updated_at ON purchase_order_lines;
CREATE TRIGGER update_purchase_order_lines_updated_at BEFORE UPDATE ON purchase_order_lines FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
