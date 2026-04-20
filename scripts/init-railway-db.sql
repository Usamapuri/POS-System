-- Combined initialization script for Railway PostgreSQL
--
-- Automatic (recommended): deploy the Go backend. On first startup, if the database has
-- no public.users table yet, it applies this same script from
-- backend/internal/database/embedded_railway_init.sql (keep both files in sync).
--
-- Manual one-off:
--   railway run psql $DATABASE_URL -f scripts/init-railway-db.sql

-- ============================================================
-- SCHEMA (from database/init/01_schema.sql)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'inventory_manager', 'counter', 'kitchen')),
    manager_pin VARCHAR(4),
    profile_image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_url TEXT;

CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    color VARCHAR(7),
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    image_url VARCHAR(500),
    barcode VARCHAR(50),
    sku VARCHAR(50) UNIQUE,
    is_available BOOLEAN DEFAULT true,
    preparation_time INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dining_tables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_number VARCHAR(20) UNIQUE NOT NULL,
    seating_capacity INTEGER DEFAULT 4,
    location VARCHAR(50),
    is_occupied BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(20) UNIQUE NOT NULL,
    table_id UUID REFERENCES dining_tables(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    customer_name VARCHAR(100),
    order_type VARCHAR(20) NOT NULL CHECK (order_type IN ('dine_in', 'takeout', 'delivery')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'confirmed', 'preparing', 'ready', 'served', 'completed', 'cancelled')) DEFAULT 'pending',
    subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    service_charge_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    checkout_payment_method VARCHAR(20) CHECK (checkout_payment_method IS NULL OR checkout_payment_method IN ('cash', 'card', 'online')),
    guest_count INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    served_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    kot_first_sent_at TIMESTAMP WITH TIME ZONE,
    kitchen_bumped_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    special_instructions TEXT,
    status VARCHAR(20) NOT NULL CHECK (status IN ('draft', 'sent', 'pending', 'preparing', 'ready', 'served', 'voided')) DEFAULT 'draft',
    kot_sent_at TIMESTAMP WITH TIME ZONE,
    kot_fire_generation INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('cash', 'credit_card', 'debit_card', 'digital_wallet', 'online')),
    amount DECIMAL(10,2) NOT NULL,
    reference_number VARCHAR(100),
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'refunded')) DEFAULT 'pending',
    processed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID REFERENCES stock_categories(id) ON DELETE SET NULL,
    name VARCHAR(150) NOT NULL,
    unit VARCHAR(30) NOT NULL DEFAULT 'each',
    quantity_on_hand DECIMAL(10,2) NOT NULL DEFAULT 0,
    reorder_level DECIMAL(10,2) NOT NULL DEFAULT 0,
    default_unit_cost DECIMAL(10,2),
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stock_item_id UUID NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
    movement_type VARCHAR(20) NOT NULL CHECK (movement_type IN ('purchase', 'issue', 'adjustment')),
    quantity DECIMAL(10,2) NOT NULL,
    unit_cost DECIMAL(10,2),
    total_cost DECIMAL(10,2),
    issued_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category VARCHAR(30) NOT NULL CHECK (category IN ('inventory_purchase', 'utilities', 'rent', 'salaries', 'maintenance', 'marketing', 'supplies', 'other')),
    amount DECIMAL(10,2) NOT NULL,
    description TEXT,
    reference_type VARCHAR(30),
    reference_id UUID,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_closings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    closing_date DATE UNIQUE NOT NULL,
    total_sales DECIMAL(10,2) NOT NULL DEFAULT 0,
    total_tax DECIMAL(10,2) NOT NULL DEFAULT 0,
    total_orders INTEGER NOT NULL DEFAULT 0,
    cash_sales DECIMAL(10,2) NOT NULL DEFAULT 0,
    card_sales DECIMAL(10,2) NOT NULL DEFAULT 0,
    digital_sales DECIMAL(10,2) NOT NULL DEFAULT 0,
    total_expenses DECIMAL(10,2) NOT NULL DEFAULT 0,
    net_profit DECIMAL(10,2) NOT NULL DEFAULT 0,
    opening_cash DECIMAL(10,2) NOT NULL DEFAULT 0,
    expected_cash DECIMAL(10,2) NOT NULL DEFAULT 0,
    actual_cash DECIMAL(10,2),
    cash_difference DECIMAL(10,2),
    notes TEXT,
    closed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    current_stock INTEGER NOT NULL DEFAULT 0,
    minimum_stock INTEGER DEFAULT 0,
    maximum_stock INTEGER DEFAULT 0,
    unit_cost DECIMAL(10,2),
    last_restocked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    previous_status VARCHAR(20),
    new_status VARCHAR(20) NOT NULL,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kitchen_stations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) UNIQUE NOT NULL,
    output_type VARCHAR(10) NOT NULL CHECK (output_type IN ('kds', 'printer')) DEFAULT 'kds',
    print_location VARCHAR(20) NOT NULL DEFAULT 'kitchen' CHECK (print_location IN ('kitchen', 'counter')),
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS category_station_map (
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    station_id UUID REFERENCES kitchen_stations(id) ON DELETE CASCADE,
    PRIMARY KEY (category_id, station_id)
);

CREATE TABLE IF NOT EXISTS void_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL,
    voided_by UUID REFERENCES users(id) ON DELETE SET NULL,
    authorized_by UUID REFERENCES users(id) ON DELETE SET NULL,
    item_name VARCHAR(100) NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_table_id ON orders(table_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_is_available ON products(is_available);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_items_category_id ON stock_items(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_reference ON expenses(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_daily_closings_date ON daily_closings(closing_date);
CREATE INDEX IF NOT EXISTS idx_stock_movements_item_created ON stock_movements(stock_item_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type_created ON stock_movements(movement_type, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_issued_to ON stock_movements(issued_to_user_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_supplier ON stock_movements(supplier_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_po ON stock_movements(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_po ON purchase_order_lines(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_stock_batches_fifo ON stock_batches(stock_item_id, expiry_date NULLS LAST, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_batches_remaining ON stock_batches(stock_item_id) WHERE quantity_remaining > 0;
CREATE INDEX IF NOT EXISTS idx_void_log_order ON void_log(order_id);
CREATE INDEX IF NOT EXISTS idx_void_log_date ON void_log(created_at);
CREATE INDEX IF NOT EXISTS idx_category_station ON category_station_map(station_id);

CREATE UNIQUE INDEX IF NOT EXISTS categories_name_unique ON categories (name);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_product_id_unique ON inventory (product_id);

CREATE TABLE IF NOT EXISTS app_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_categories_updated_at ON categories;
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_dining_tables_updated_at ON dining_tables;
CREATE TRIGGER update_dining_tables_updated_at BEFORE UPDATE ON dining_tables FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_order_items_updated_at ON order_items;
CREATE TRIGGER update_order_items_updated_at BEFORE UPDATE ON order_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_inventory_updated_at ON inventory;
CREATE TRIGGER update_inventory_updated_at BEFORE UPDATE ON inventory FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_stock_categories_updated_at ON stock_categories;
CREATE TRIGGER update_stock_categories_updated_at BEFORE UPDATE ON stock_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_stock_items_updated_at ON stock_items;
CREATE TRIGGER update_stock_items_updated_at BEFORE UPDATE ON stock_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_suppliers_updated_at ON suppliers;
CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_purchase_orders_updated_at ON purchase_orders;
CREATE TRIGGER update_purchase_orders_updated_at BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_purchase_order_lines_updated_at ON purchase_order_lines;
CREATE TRIGGER update_purchase_order_lines_updated_at BEFORE UPDATE ON purchase_order_lines FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_expenses_updated_at ON expenses;
CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- SEED DATA (from database/init/02_seed_data.sql)
-- ============================================================

INSERT INTO users (username, email, password_hash, first_name, last_name, role, profile_image_url) VALUES
('admin', 'admin@pos.com', '$2a$10$FPH.ONfAgquWmXjM3LE61OIgOPgXX8i.jOISCHZ2DpK2gg4krEWfO', 'Admin', 'User', 'admin', 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f60e.png'),
('inventory1', 'inventory@pos.com', '$2a$10$FPH.ONfAgquWmXjM3LE61OIgOPgXX8i.jOISCHZ2DpK2gg4krEWfO', 'Sam', 'Inventory', 'inventory_manager', 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f917.png'),
('counter1', 'counter1@pos.com', '$2a$10$FPH.ONfAgquWmXjM3LE61OIgOPgXX8i.jOISCHZ2DpK2gg4krEWfO', 'Lisa', 'Davis', 'counter', 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f606.png'),
('counter2', 'counter2@pos.com', '$2a$10$FPH.ONfAgquWmXjM3LE61OIgOPgXX8i.jOISCHZ2DpK2gg4krEWfO', 'Tom', 'Wilson', 'counter', 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f60a.png'),
('kitchen1', 'kitchen@pos.com', '$2a$10$FPH.ONfAgquWmXjM3LE61OIgOPgXX8i.jOISCHZ2DpK2gg4krEWfO', 'Chef', 'Williams', 'kitchen', 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f973.png')
ON CONFLICT (username) DO NOTHING;

INSERT INTO categories (name, description, color, sort_order) VALUES
('Appetizers', 'Starter dishes and small plates', '#FF6B6B', 1),
('Main Courses', 'Primary dishes and entrees', '#4ECDC4', 2),
('Beverages', 'Drinks, sodas, and refreshments', '#45B7D1', 3),
('Desserts', 'Sweet treats and desserts', '#96CEB4', 4),
('Salads', 'Fresh salads and healthy options', '#FECA57', 5),
('Pizza', 'Various pizza options', '#FF9FF3', 6)
ON CONFLICT (name) DO NOTHING;

INSERT INTO products (category_id, name, description, price, sku, preparation_time, sort_order) VALUES
((SELECT id FROM categories WHERE name = 'Appetizers'), 'Buffalo Wings', 'Crispy chicken wings with buffalo sauce', 12.99, 'APP001', 15, 1),
((SELECT id FROM categories WHERE name = 'Appetizers'), 'Mozzarella Sticks', 'Breaded mozzarella with marinara sauce', 8.99, 'APP002', 10, 2),
((SELECT id FROM categories WHERE name = 'Appetizers'), 'Nachos Supreme', 'Tortilla chips with cheese, jalapeños, and toppings', 11.49, 'APP003', 12, 3),
((SELECT id FROM categories WHERE name = 'Appetizers'), 'Onion Rings', 'Crispy beer-battered onion rings', 7.99, 'APP004', 8, 4),
((SELECT id FROM categories WHERE name = 'Main Courses'), 'Grilled Chicken Breast', 'Seasoned grilled chicken with vegetables', 18.99, 'MAIN001', 20, 1),
((SELECT id FROM categories WHERE name = 'Main Courses'), 'Beef Steak', 'Premium cut beef steak cooked to order', 26.99, 'MAIN002', 25, 2),
((SELECT id FROM categories WHERE name = 'Main Courses'), 'Fish & Chips', 'Beer battered fish with crispy fries', 16.99, 'MAIN003', 18, 3),
((SELECT id FROM categories WHERE name = 'Main Courses'), 'Pasta Carbonara', 'Creamy pasta with bacon and parmesan', 15.99, 'MAIN004', 15, 4),
((SELECT id FROM categories WHERE name = 'Main Courses'), 'BBQ Ribs', 'Slow-cooked ribs with BBQ sauce', 22.99, 'MAIN005', 30, 5),
((SELECT id FROM categories WHERE name = 'Beverages'), 'Coca Cola', 'Classic cola soft drink', 2.99, 'BEV001', 0, 1),
((SELECT id FROM categories WHERE name = 'Beverages'), 'Fresh Orange Juice', 'Freshly squeezed orange juice', 4.99, 'BEV002', 2, 2),
((SELECT id FROM categories WHERE name = 'Beverages'), 'Coffee', 'Freshly brewed coffee', 3.49, 'BEV003', 3, 3),
((SELECT id FROM categories WHERE name = 'Beverages'), 'Iced Tea', 'Refreshing iced tea', 2.99, 'BEV004', 1, 4),
((SELECT id FROM categories WHERE name = 'Beverages'), 'Milkshake - Vanilla', 'Creamy vanilla milkshake', 5.99, 'BEV005', 4, 5),
((SELECT id FROM categories WHERE name = 'Desserts'), 'Chocolate Cake', 'Rich chocolate cake with frosting', 6.99, 'DES001', 5, 1),
((SELECT id FROM categories WHERE name = 'Desserts'), 'Apple Pie', 'Classic apple pie with cinnamon', 5.99, 'DES002', 8, 2),
((SELECT id FROM categories WHERE name = 'Desserts'), 'Ice Cream Sundae', 'Vanilla ice cream with toppings', 4.99, 'DES003', 3, 3),
((SELECT id FROM categories WHERE name = 'Desserts'), 'Cheesecake', 'New York style cheesecake', 7.99, 'DES004', 5, 4),
((SELECT id FROM categories WHERE name = 'Salads'), 'Caesar Salad', 'Romaine lettuce with caesar dressing', 9.99, 'SAL001', 8, 1),
((SELECT id FROM categories WHERE name = 'Salads'), 'Greek Salad', 'Fresh vegetables with feta cheese', 11.99, 'SAL002', 10, 2),
((SELECT id FROM categories WHERE name = 'Salads'), 'Garden Salad', 'Mixed greens with vegetables', 8.99, 'SAL003', 6, 3),
((SELECT id FROM categories WHERE name = 'Pizza'), 'Margherita Pizza', 'Classic pizza with tomato, mozzarella, basil', 14.99, 'PIZ001', 16, 1),
((SELECT id FROM categories WHERE name = 'Pizza'), 'Pepperoni Pizza', 'Pizza with pepperoni and cheese', 16.99, 'PIZ002', 16, 2),
((SELECT id FROM categories WHERE name = 'Pizza'), 'Supreme Pizza', 'Pizza loaded with multiple toppings', 19.99, 'PIZ003', 20, 3),
((SELECT id FROM categories WHERE name = 'Pizza'), 'Hawaiian Pizza', 'Pizza with ham and pineapple', 17.99, 'PIZ004', 16, 4)
ON CONFLICT (sku) DO NOTHING;

INSERT INTO dining_tables (table_number, seating_capacity, location) VALUES
('T01', 2, 'Main Floor'),
('T02', 4, 'Main Floor'),
('T03', 4, 'Main Floor'),
('T04', 6, 'Main Floor'),
('T05', 2, 'Main Floor'),
('T06', 4, 'Window Side'),
('T07', 4, 'Window Side'),
('T08', 8, 'Private Room'),
('T09', 2, 'Patio'),
('T10', 4, 'Patio'),
('BAR01', 1, 'Bar Counter'),
('BAR02', 1, 'Bar Counter'),
('BAR03', 1, 'Bar Counter'),
('TAKEOUT', 1, 'Takeout Counter')
ON CONFLICT (table_number) DO NOTHING;

INSERT INTO inventory (product_id, current_stock, minimum_stock, maximum_stock, unit_cost)
SELECT id, 50, 10, 100, price * 0.4
FROM products
ON CONFLICT (product_id) DO NOTHING;

-- Store Inventory Seed Data
INSERT INTO stock_categories (name, description, sort_order) VALUES
('Produce', 'Vegetables, fruits, and fresh items', 1),
('Protein', 'Chicken, beef, fish, and other meats', 2),
('Dairy', 'Milk, cheese, butter, and eggs', 3),
('Dry Goods', 'Rice, flour, spices, and pantry staples', 4),
('Beverages Supplies', 'Tea, coffee beans, syrups, and drink mixes', 5),
('Cleaning', 'Cleaning agents, sanitizers, and supplies', 6),
('Bathroom Supplies', 'Tissue, soap, air fresheners', 7),
('Packaging', 'Takeout boxes, bags, napkins, and cutlery', 8);

INSERT INTO stock_items (category_id, name, unit, quantity_on_hand, reorder_level, default_unit_cost, notes) VALUES
((SELECT id FROM stock_categories WHERE name = 'Produce'), 'Potatoes', 'kg', 50, 10, 1.20, NULL),
((SELECT id FROM stock_categories WHERE name = 'Produce'), 'Onions', 'kg', 30, 8, 0.90, NULL),
((SELECT id FROM stock_categories WHERE name = 'Produce'), 'Tomatoes', 'kg', 20, 5, 2.00, NULL),
((SELECT id FROM stock_categories WHERE name = 'Produce'), 'Lettuce', 'each', 15, 5, 1.50, 'Iceberg heads'),
((SELECT id FROM stock_categories WHERE name = 'Protein'), 'Chicken Breast', 'kg', 25, 8, 6.50, 'Boneless'),
((SELECT id FROM stock_categories WHERE name = 'Protein'), 'Beef Steak Cuts', 'kg', 12, 5, 14.00, 'Premium cuts'),
((SELECT id FROM stock_categories WHERE name = 'Protein'), 'Fish Fillets', 'kg', 10, 4, 9.00, 'Cod fillets'),
((SELECT id FROM stock_categories WHERE name = 'Dairy'), 'Mozzarella Cheese', 'kg', 8, 3, 7.50, NULL),
((SELECT id FROM stock_categories WHERE name = 'Dairy'), 'Butter', 'kg', 6, 2, 5.00, 'Unsalted'),
((SELECT id FROM stock_categories WHERE name = 'Dairy'), 'Eggs', 'dozen', 10, 3, 3.50, NULL),
((SELECT id FROM stock_categories WHERE name = 'Dry Goods'), 'Flour', 'kg', 40, 10, 0.80, 'All-purpose'),
((SELECT id FROM stock_categories WHERE name = 'Dry Goods'), 'Rice', 'kg', 30, 10, 1.50, 'Basmati'),
((SELECT id FROM stock_categories WHERE name = 'Dry Goods'), 'Cooking Oil', 'liter', 15, 5, 2.50, 'Vegetable oil'),
((SELECT id FROM stock_categories WHERE name = 'Beverages Supplies'), 'Coffee Beans', 'kg', 5, 2, 12.00, 'Arabica blend'),
((SELECT id FROM stock_categories WHERE name = 'Beverages Supplies'), 'Tea Bags', 'box', 8, 3, 4.00, '100 bags per box'),
((SELECT id FROM stock_categories WHERE name = 'Cleaning'), 'Floor Cleaner', 'liter', 10, 3, 3.00, NULL),
((SELECT id FROM stock_categories WHERE name = 'Cleaning'), 'Dish Soap', 'liter', 8, 3, 2.50, NULL),
((SELECT id FROM stock_categories WHERE name = 'Cleaning'), 'Sanitizer Spray', 'bottle', 12, 4, 4.50, NULL),
((SELECT id FROM stock_categories WHERE name = 'Bathroom Supplies'), 'Air Freshener', 'can', 6, 2, 3.00, NULL),
((SELECT id FROM stock_categories WHERE name = 'Bathroom Supplies'), 'Toilet Paper', 'pack', 10, 4, 8.00, '12-roll pack'),
((SELECT id FROM stock_categories WHERE name = 'Bathroom Supplies'), 'Hand Soap', 'bottle', 8, 3, 2.50, 'Liquid pump'),
((SELECT id FROM stock_categories WHERE name = 'Packaging'), 'Takeout Boxes', 'pack', 20, 5, 6.00, '50 per pack'),
((SELECT id FROM stock_categories WHERE name = 'Packaging'), 'Paper Napkins', 'pack', 15, 5, 3.00, '500 per pack');

INSERT INTO suppliers (name, contact_name, phone, email, notes) VALUES
('Fresh Farms Co', 'Receiving', '+92-300-1110001', 'orders@freshfarms.example', 'Produce supplier'),
('Metro Supplies', 'Accounts', '+92-300-1110002', 'metro@example', 'Dry goods and packaging');

INSERT INTO purchase_orders (supplier_id, status, expected_date, notes, created_by) VALUES
((SELECT id FROM suppliers WHERE name = 'Fresh Farms Co'), 'ordered', CURRENT_DATE + 5, 'Weekly produce top-up', (SELECT id FROM users WHERE username = 'inventory1'));

INSERT INTO purchase_order_lines (purchase_order_id, stock_item_id, quantity_ordered, unit_cost, quantity_received) VALUES
((SELECT id FROM purchase_orders ORDER BY created_at DESC LIMIT 1),
 (SELECT id FROM stock_items WHERE name = 'Lettuce'), 20, 1.50, 0),
((SELECT id FROM purchase_orders ORDER BY created_at DESC LIMIT 1),
 (SELECT id FROM stock_items WHERE name = 'Tomatoes'), 15, 2.00, 0);

INSERT INTO stock_movements (stock_item_id, movement_type, quantity, unit_cost, total_cost, issued_to_user_id, created_by, note, created_at) VALUES
((SELECT id FROM stock_items WHERE name = 'Potatoes'), 'purchase', 50, 1.20, 60.00, NULL, (SELECT id FROM users WHERE username = 'inventory1'), 'Initial stock purchase', CURRENT_TIMESTAMP - INTERVAL '7 days'),
((SELECT id FROM stock_items WHERE name = 'Chicken Breast'), 'purchase', 25, 6.50, 162.50, NULL, (SELECT id FROM users WHERE username = 'inventory1'), 'Weekly meat order', CURRENT_TIMESTAMP - INTERVAL '5 days'),
((SELECT id FROM stock_items WHERE name = 'Potatoes'), 'issue', -5, NULL, NULL, (SELECT id FROM users WHERE username = 'kitchen1'), (SELECT id FROM users WHERE username = 'inventory1'), 'Issued to kitchen for prep', CURRENT_TIMESTAMP - INTERVAL '3 days'),
((SELECT id FROM stock_items WHERE name = 'Floor Cleaner'), 'purchase', 10, 3.00, 30.00, NULL, (SELECT id FROM users WHERE username = 'inventory1'), 'Cleaning supplies restock', CURRENT_TIMESTAMP - INTERVAL '4 days'),
((SELECT id FROM stock_items WHERE name = 'Floor Cleaner'), 'issue', -2, NULL, NULL, (SELECT id FROM users WHERE username = 'counter1'), (SELECT id FROM users WHERE username = 'inventory1'), 'Issued to cleaning staff', CURRENT_TIMESTAMP - INTERVAL '2 days'),
((SELECT id FROM stock_items WHERE name = 'Air Freshener'), 'purchase', 6, 3.00, 18.00, NULL, (SELECT id FROM users WHERE username = 'inventory1'), 'Bathroom supplies', CURRENT_TIMESTAMP - INTERVAL '6 days'),
((SELECT id FROM stock_items WHERE name = 'Coffee Beans'), 'purchase', 5, 12.00, 60.00, NULL, (SELECT id FROM users WHERE username = 'inventory1'), 'Coffee bean order', CURRENT_TIMESTAMP - INTERVAL '3 days'),
((SELECT id FROM stock_items WHERE name = 'Coffee Beans'), 'issue', -1, NULL, NULL, (SELECT id FROM users WHERE username = 'counter1'), (SELECT id FROM users WHERE username = 'inventory1'), 'For counter coffee machine', CURRENT_TIMESTAMP - INTERVAL '1 day');

INSERT INTO stock_batches (stock_item_id, quantity_remaining, initial_quantity, unit_cost, expiry_date, stock_movement_id, purchase_order_line_id)
SELECT si.id, si.quantity_on_hand, si.quantity_on_hand, si.default_unit_cost, NULL, NULL, NULL
FROM stock_items si
WHERE si.quantity_on_hand > 0;

INSERT INTO expenses (category, amount, description, reference_type, reference_id, expense_date, created_by, created_at) VALUES
('inventory_purchase', 60.00, 'Potatoes - Initial stock purchase', 'stock_movement', (SELECT id FROM stock_movements WHERE note = 'Initial stock purchase' LIMIT 1), CURRENT_DATE - INTERVAL '7 days', (SELECT id FROM users WHERE username = 'inventory1'), CURRENT_TIMESTAMP - INTERVAL '7 days'),
('inventory_purchase', 162.50, 'Chicken Breast - Weekly meat order', 'stock_movement', (SELECT id FROM stock_movements WHERE note = 'Weekly meat order' LIMIT 1), CURRENT_DATE - INTERVAL '5 days', (SELECT id FROM users WHERE username = 'inventory1'), CURRENT_TIMESTAMP - INTERVAL '5 days'),
('inventory_purchase', 30.00, 'Floor Cleaner - Cleaning supplies restock', 'stock_movement', (SELECT id FROM stock_movements WHERE note = 'Cleaning supplies restock' LIMIT 1), CURRENT_DATE - INTERVAL '4 days', (SELECT id FROM users WHERE username = 'inventory1'), CURRENT_TIMESTAMP - INTERVAL '4 days'),
('inventory_purchase', 18.00, 'Air Freshener - Bathroom supplies', 'stock_movement', (SELECT id FROM stock_movements WHERE note = 'Bathroom supplies' LIMIT 1), CURRENT_DATE - INTERVAL '6 days', (SELECT id FROM users WHERE username = 'inventory1'), CURRENT_TIMESTAMP - INTERVAL '6 days'),
('inventory_purchase', 60.00, 'Coffee Beans - Coffee bean order', 'stock_movement', (SELECT id FROM stock_movements WHERE note = 'Coffee bean order' LIMIT 1), CURRENT_DATE - INTERVAL '3 days', (SELECT id FROM users WHERE username = 'inventory1'), CURRENT_TIMESTAMP - INTERVAL '3 days'),
('utilities', 250.00, 'Monthly electricity bill', NULL, NULL, CURRENT_DATE - INTERVAL '5 days', (SELECT id FROM users WHERE username = 'admin'), CURRENT_TIMESTAMP - INTERVAL '5 days'),
('utilities', 80.00, 'Water bill', NULL, NULL, CURRENT_DATE - INTERVAL '5 days', (SELECT id FROM users WHERE username = 'admin'), CURRENT_TIMESTAMP - INTERVAL '5 days'),
('rent', 2000.00, 'Monthly shop rent', NULL, NULL, CURRENT_DATE - INTERVAL '1 day', (SELECT id FROM users WHERE username = 'admin'), CURRENT_TIMESTAMP - INTERVAL '1 day'),
('maintenance', 150.00, 'Plumber - kitchen sink repair', NULL, NULL, CURRENT_DATE - INTERVAL '2 days', (SELECT id FROM users WHERE username = 'admin'), CURRENT_TIMESTAMP - INTERVAL '2 days'),
('salaries', 500.00, 'Weekly staff wages advance', NULL, NULL, CURRENT_DATE - INTERVAL '3 days', (SELECT id FROM users WHERE username = 'admin'), CURRENT_TIMESTAMP - INTERVAL '3 days'),
('supplies', 45.00, 'Office stationery and receipt paper', NULL, NULL, CURRENT_DATE - INTERVAL '4 days', (SELECT id FROM users WHERE username = 'admin'), CURRENT_TIMESTAMP - INTERVAL '4 days'),
('other', 35.00, 'Pest control service', NULL, NULL, CURRENT_DATE - INTERVAL '6 days', (SELECT id FROM users WHERE username = 'admin'), CURRENT_TIMESTAMP - INTERVAL '6 days');
