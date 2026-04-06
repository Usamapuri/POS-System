-- Combined initialization script for Railway PostgreSQL
-- Run this once after creating the Railway PostgreSQL service:
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
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'manager', 'server', 'counter', 'kitchen')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

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
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    served_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    special_instructions TEXT,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'preparing', 'ready', 'served')) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('cash', 'credit_card', 'debit_card', 'digital_wallet')),
    amount DECIMAL(10,2) NOT NULL,
    reference_number VARCHAR(100),
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'refunded')) DEFAULT 'pending',
    processed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    processed_at TIMESTAMP WITH TIME ZONE,
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

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_table_id ON orders(table_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_is_available ON products(is_available);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON inventory(product_id);

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

-- ============================================================
-- SEED DATA (from database/init/02_seed_data.sql)
-- ============================================================

INSERT INTO users (username, email, password_hash, first_name, last_name, role) VALUES
('admin', 'admin@pos.com', '$2a$10$FPH.ONfAgquWmXjM3LE61OIgOPgXX8i.jOISCHZ2DpK2gg4krEWfO', 'Admin', 'User', 'admin'),
('manager1', 'manager@pos.com', '$2a$10$FPH.ONfAgquWmXjM3LE61OIgOPgXX8i.jOISCHZ2DpK2gg4krEWfO', 'John', 'Manager', 'manager'),
('server1', 'server1@pos.com', '$2a$10$FPH.ONfAgquWmXjM3LE61OIgOPgXX8i.jOISCHZ2DpK2gg4krEWfO', 'Sarah', 'Smith', 'server'),
('server2', 'server2@pos.com', '$2a$10$FPH.ONfAgquWmXjM3LE61OIgOPgXX8i.jOISCHZ2DpK2gg4krEWfO', 'Mike', 'Johnson', 'server'),
('counter1', 'counter1@pos.com', '$2a$10$FPH.ONfAgquWmXjM3LE61OIgOPgXX8i.jOISCHZ2DpK2gg4krEWfO', 'Lisa', 'Davis', 'counter'),
('counter2', 'counter2@pos.com', '$2a$10$FPH.ONfAgquWmXjM3LE61OIgOPgXX8i.jOISCHZ2DpK2gg4krEWfO', 'Tom', 'Wilson', 'counter'),
('kitchen1', 'kitchen@pos.com', '$2a$10$FPH.ONfAgquWmXjM3LE61OIgOPgXX8i.jOISCHZ2DpK2gg4krEWfO', 'Chef', 'Williams', 'kitchen')
ON CONFLICT (username) DO NOTHING;

INSERT INTO categories (name, description, color, sort_order) VALUES
('Appetizers', 'Starter dishes and small plates', '#FF6B6B', 1),
('Main Courses', 'Primary dishes and entrees', '#4ECDC4', 2),
('Beverages', 'Drinks, sodas, and refreshments', '#45B7D1', 3),
('Desserts', 'Sweet treats and desserts', '#96CEB4', 4),
('Salads', 'Fresh salads and healthy options', '#FECA57', 5),
('Pizza', 'Various pizza options', '#FF9FF3', 6)
ON CONFLICT DO NOTHING;

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
ON CONFLICT DO NOTHING;
