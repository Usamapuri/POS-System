-- Seed data for POS System

-- Insert default users
INSERT INTO users (username, email, password_hash, first_name, last_name, role, manager_pin) VALUES
('admin', 'admin@pos.com', '$2a$10$FPH.ONfAgquWmXjM3LE61OIgOPgXX8i.jOISCHZ2DpK2gg4krEWfO', 'Admin', 'User', 'admin', NULL),
('manager1', 'manager@pos.com', '$2a$10$FPH.ONfAgquWmXjM3LE61OIgOPgXX8i.jOISCHZ2DpK2gg4krEWfO', 'John', 'Manager', 'manager', '1234'),
('server1', 'server1@pos.com', '$2a$10$FPH.ONfAgquWmXjM3LE61OIgOPgXX8i.jOISCHZ2DpK2gg4krEWfO', 'Sarah', 'Smith', 'server', NULL),
('server2', 'server2@pos.com', '$2a$10$FPH.ONfAgquWmXjM3LE61OIgOPgXX8i.jOISCHZ2DpK2gg4krEWfO', 'Mike', 'Johnson', 'server', NULL),
('counter1', 'counter1@pos.com', '$2a$10$FPH.ONfAgquWmXjM3LE61OIgOPgXX8i.jOISCHZ2DpK2gg4krEWfO', 'Lisa', 'Davis', 'counter', NULL),
('counter2', 'counter2@pos.com', '$2a$10$FPH.ONfAgquWmXjM3LE61OIgOPgXX8i.jOISCHZ2DpK2gg4krEWfO', 'Tom', 'Wilson', 'counter', NULL),
('kitchen1', 'kitchen@pos.com', '$2a$10$FPH.ONfAgquWmXjM3LE61OIgOPgXX8i.jOISCHZ2DpK2gg4krEWfO', 'Chef', 'Williams', 'kitchen', NULL),
('store1', 'store@pos.com', '$2a$10$FPH.ONfAgquWmXjM3LE61OIgOPgXX8i.jOISCHZ2DpK2gg4krEWfO', 'Ali', 'Store', 'store_manager', NULL);

-- Insert categories
INSERT INTO categories (name, description, color, sort_order) VALUES
('Appetizers', 'Starter dishes and small plates', '#FF6B6B', 1),
('Main Courses', 'Primary dishes and entrees', '#4ECDC4', 2),
('Beverages', 'Drinks, sodas, and refreshments', '#45B7D1', 3),
('Desserts', 'Sweet treats and desserts', '#96CEB4', 4),
('Salads', 'Fresh salads and healthy options', '#FECA57', 5),
('Pizza', 'Various pizza options', '#FF9FF3', 6);

-- Insert products (prices in PKR; scaled from former USD demo at ~285 PKR per1 USD)
INSERT INTO products (category_id, name, description, price, sku, preparation_time, sort_order) VALUES
-- Appetizers
((SELECT id FROM categories WHERE name = 'Appetizers'), 'Buffalo Wings', 'Crispy chicken wings with buffalo sauce', 3702.15, 'APP001', 15, 1),
((SELECT id FROM categories WHERE name = 'Appetizers'), 'Mozzarella Sticks', 'Breaded mozzarella with marinara sauce', 2562.15, 'APP002', 10, 2),
((SELECT id FROM categories WHERE name = 'Appetizers'), 'Nachos Supreme', 'Tortilla chips with cheese, jalapeños, and toppings', 3274.65, 'APP003', 12, 3),
((SELECT id FROM categories WHERE name = 'Appetizers'), 'Onion Rings', 'Crispy beer-battered onion rings', 2277.15, 'APP004', 8, 4),

-- Main Courses
((SELECT id FROM categories WHERE name = 'Main Courses'), 'Grilled Chicken Breast', 'Seasoned grilled chicken with vegetables', 5412.15, 'MAIN001', 20, 1),
((SELECT id FROM categories WHERE name = 'Main Courses'), 'Beef Steak', 'Premium cut beef steak cooked to order', 7692.15, 'MAIN002', 25, 2),
((SELECT id FROM categories WHERE name = 'Main Courses'), 'Fish & Chips', 'Beer battered fish with crispy fries', 4842.15, 'MAIN003', 18, 3),
((SELECT id FROM categories WHERE name = 'Main Courses'), 'Pasta Carbonara', 'Creamy pasta with bacon and parmesan', 4557.15, 'MAIN004', 15, 4),
((SELECT id FROM categories WHERE name = 'Main Courses'), 'BBQ Ribs', 'Slow-cooked ribs with BBQ sauce', 6552.15, 'MAIN005', 30, 5),

-- Beverages
((SELECT id FROM categories WHERE name = 'Beverages'), 'Coca Cola', 'Classic cola soft drink', 852.15, 'BEV001', 0, 1),
((SELECT id FROM categories WHERE name = 'Beverages'), 'Fresh Orange Juice', 'Freshly squeezed orange juice', 1422.15, 'BEV002', 2, 2),
((SELECT id FROM categories WHERE name = 'Beverages'), 'Coffee', 'Freshly brewed coffee', 994.65, 'BEV003', 3, 3),
((SELECT id FROM categories WHERE name = 'Beverages'), 'Iced Tea', 'Refreshing iced tea', 852.15, 'BEV004', 1, 4),
((SELECT id FROM categories WHERE name = 'Beverages'), 'Milkshake - Vanilla', 'Creamy vanilla milkshake', 1707.15, 'BEV005', 4, 5),

-- Desserts
((SELECT id FROM categories WHERE name = 'Desserts'), 'Chocolate Cake', 'Rich chocolate cake with frosting', 1992.15, 'DES001', 5, 1),
((SELECT id FROM categories WHERE name = 'Desserts'), 'Apple Pie', 'Classic apple pie with cinnamon', 1707.15, 'DES002', 8, 2),
((SELECT id FROM categories WHERE name = 'Desserts'), 'Ice Cream Sundae', 'Vanilla ice cream with toppings', 1422.15, 'DES003', 3, 3),
((SELECT id FROM categories WHERE name = 'Desserts'), 'Cheesecake', 'New York style cheesecake', 2277.15, 'DES004', 5, 4),

-- Salads
((SELECT id FROM categories WHERE name = 'Salads'), 'Caesar Salad', 'Romaine lettuce with caesar dressing', 2847.15, 'SAL001', 8, 1),
((SELECT id FROM categories WHERE name = 'Salads'), 'Greek Salad', 'Fresh vegetables with feta cheese', 3417.15, 'SAL002', 10, 2),
((SELECT id FROM categories WHERE name = 'Salads'), 'Garden Salad', 'Mixed greens with vegetables', 2562.15, 'SAL003', 6, 3),

-- Pizza
((SELECT id FROM categories WHERE name = 'Pizza'), 'Margherita Pizza', 'Classic pizza with tomato, mozzarella, basil', 4272.15, 'PIZ001', 16, 1),
((SELECT id FROM categories WHERE name = 'Pizza'), 'Pepperoni Pizza', 'Pizza with pepperoni and cheese', 4842.15, 'PIZ002', 16, 2),
((SELECT id FROM categories WHERE name = 'Pizza'), 'Supreme Pizza', 'Pizza loaded with multiple toppings', 5697.15, 'PIZ003', 20, 3),
((SELECT id FROM categories WHERE name = 'Pizza'), 'Hawaiian Pizza', 'Pizza with ham and pineapple', 5127.15, 'PIZ004', 16, 4);

-- Insert dining tables
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
('TAKEOUT', 1, 'Takeout Counter');

-- Insert initial inventory
INSERT INTO inventory (product_id, current_stock, minimum_stock, maximum_stock, unit_cost) 
SELECT 
    id as product_id,
    50 as current_stock,
    10 as minimum_stock,
    100 as maximum_stock,
    price * 0.4 as unit_cost
FROM products;

-- Sample orders (amounts in PKR;10% tax on subtotal for demo rows)
INSERT INTO orders (order_number, table_id, user_id, order_type, status, subtotal, tax_amount, total_amount, guest_count) VALUES
('20260101-001', (SELECT id FROM dining_tables WHERE table_number = 'T02'), (SELECT id FROM users WHERE username = 'server1'), 'dine_in', 'pending', 10818.60, 1081.86, 11900.46, 2),
('20260101-002', (SELECT id FROM dining_tables WHERE table_number = 'T05'), (SELECT id FROM users WHERE username = 'server2'), 'dine_in', 'preparing', 5412.15, 541.22, 5953.37, 2),
('20260101-003', (SELECT id FROM dining_tables WHERE table_number = 'TAKEOUT'), (SELECT id FROM users WHERE username = 'counter1'), 'takeout', 'ready', 4272.15, 427.22, 4699.37, 1);

INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price, status) VALUES
((SELECT id FROM orders WHERE order_number = '20260101-001'), (SELECT id FROM products WHERE sku = 'APP001'), 1, 3702.15, 3702.15, 'draft'),
((SELECT id FROM orders WHERE order_number = '20260101-001'), (SELECT id FROM products WHERE sku = 'MAIN001'), 1, 5412.15, 5412.15, 'draft'),
((SELECT id FROM orders WHERE order_number = '20260101-001'), (SELECT id FROM products WHERE sku = 'BEV001'), 2, 852.15, 1704.30, 'draft'),
((SELECT id FROM orders WHERE order_number = '20260101-002'), (SELECT id FROM products WHERE sku = 'MAIN001'), 1, 5412.15, 5412.15, 'sent'),
((SELECT id FROM orders WHERE order_number = '20260101-003'), (SELECT id FROM products WHERE sku = 'PIZ001'), 1, 4272.15, 4272.15, 'ready');

INSERT INTO payments (order_id, payment_method, amount, status, processed_by, processed_at) VALUES
((SELECT id FROM orders WHERE order_number = '20260101-003'), 'cash', 4699.37, 'completed', (SELECT id FROM users WHERE username = 'counter1'), CURRENT_TIMESTAMP);

UPDATE orders SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE order_number = '20260101-003';

-- ============================================================
-- Store Inventory Seed Data
-- ============================================================

-- Stock categories
INSERT INTO stock_categories (name, description, sort_order) VALUES
('Produce', 'Vegetables, fruits, and fresh items', 1),
('Protein', 'Chicken, beef, fish, and other meats', 2),
('Dairy', 'Milk, cheese, butter, and eggs', 3),
('Dry Goods', 'Rice, flour, spices, and pantry staples', 4),
('Beverages Supplies', 'Tea, coffee beans, syrups, and drink mixes', 5),
('Cleaning', 'Cleaning agents, sanitizers, and supplies', 6),
('Bathroom Supplies', 'Tissue, soap, air fresheners', 7),
('Packaging', 'Takeout boxes, bags, napkins, and cutlery', 8);

-- Stock items
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

-- Sample stock movements
INSERT INTO stock_movements (stock_item_id, movement_type, quantity, unit_cost, total_cost, issued_to_user_id, created_by, note, created_at) VALUES
((SELECT id FROM stock_items WHERE name = 'Potatoes'), 'purchase', 50, 1.20, 60.00, NULL, (SELECT id FROM users WHERE username = 'store1'), 'Initial stock purchase', CURRENT_TIMESTAMP - INTERVAL '7 days'),
((SELECT id FROM stock_items WHERE name = 'Chicken Breast'), 'purchase', 25, 6.50, 162.50, NULL, (SELECT id FROM users WHERE username = 'store1'), 'Weekly meat order', CURRENT_TIMESTAMP - INTERVAL '5 days'),
((SELECT id FROM stock_items WHERE name = 'Potatoes'), 'issue', -5, NULL, NULL, (SELECT id FROM users WHERE username = 'kitchen1'), (SELECT id FROM users WHERE username = 'store1'), 'Issued to kitchen for prep', CURRENT_TIMESTAMP - INTERVAL '3 days'),
((SELECT id FROM stock_items WHERE name = 'Floor Cleaner'), 'purchase', 10, 3.00, 30.00, NULL, (SELECT id FROM users WHERE username = 'store1'), 'Cleaning supplies restock', CURRENT_TIMESTAMP - INTERVAL '4 days'),
((SELECT id FROM stock_items WHERE name = 'Floor Cleaner'), 'issue', -2, NULL, NULL, (SELECT id FROM users WHERE username = 'server1'), (SELECT id FROM users WHERE username = 'store1'), 'Issued to cleaning staff', CURRENT_TIMESTAMP - INTERVAL '2 days'),
((SELECT id FROM stock_items WHERE name = 'Air Freshener'), 'purchase', 6, 3.00, 18.00, NULL, (SELECT id FROM users WHERE username = 'store1'), 'Bathroom supplies', CURRENT_TIMESTAMP - INTERVAL '6 days'),
((SELECT id FROM stock_items WHERE name = 'Coffee Beans'), 'purchase', 5, 12.00, 60.00, NULL, (SELECT id FROM users WHERE username = 'store1'), 'Coffee bean order', CURRENT_TIMESTAMP - INTERVAL '3 days'),
((SELECT id FROM stock_items WHERE name = 'Coffee Beans'), 'issue', -1, NULL, NULL, (SELECT id FROM users WHERE username = 'counter1'), (SELECT id FROM users WHERE username = 'store1'), 'For counter coffee machine', CURRENT_TIMESTAMP - INTERVAL '1 day');

-- ============================================================
-- Expenses Seed Data (auto-linked to stock purchases + manual)
-- ============================================================

INSERT INTO expenses (category, amount, description, reference_type, reference_id, expense_date, created_by, created_at) VALUES
('inventory_purchase', 60.00, 'Potatoes - Initial stock purchase', 'stock_movement', (SELECT id FROM stock_movements WHERE note = 'Initial stock purchase' LIMIT 1), CURRENT_DATE - INTERVAL '7 days', (SELECT id FROM users WHERE username = 'store1'), CURRENT_TIMESTAMP - INTERVAL '7 days'),
('inventory_purchase', 162.50, 'Chicken Breast - Weekly meat order', 'stock_movement', (SELECT id FROM stock_movements WHERE note = 'Weekly meat order' LIMIT 1), CURRENT_DATE - INTERVAL '5 days', (SELECT id FROM users WHERE username = 'store1'), CURRENT_TIMESTAMP - INTERVAL '5 days'),
('inventory_purchase', 30.00, 'Floor Cleaner - Cleaning supplies restock', 'stock_movement', (SELECT id FROM stock_movements WHERE note = 'Cleaning supplies restock' LIMIT 1), CURRENT_DATE - INTERVAL '4 days', (SELECT id FROM users WHERE username = 'store1'), CURRENT_TIMESTAMP - INTERVAL '4 days'),
('inventory_purchase', 18.00, 'Air Freshener - Bathroom supplies', 'stock_movement', (SELECT id FROM stock_movements WHERE note = 'Bathroom supplies' LIMIT 1), CURRENT_DATE - INTERVAL '6 days', (SELECT id FROM users WHERE username = 'store1'), CURRENT_TIMESTAMP - INTERVAL '6 days'),
('inventory_purchase', 60.00, 'Coffee Beans - Coffee bean order', 'stock_movement', (SELECT id FROM stock_movements WHERE note = 'Coffee bean order' LIMIT 1), CURRENT_DATE - INTERVAL '3 days', (SELECT id FROM users WHERE username = 'store1'), CURRENT_TIMESTAMP - INTERVAL '3 days'),
('utilities', 250.00, 'Monthly electricity bill', NULL, NULL, CURRENT_DATE - INTERVAL '5 days', (SELECT id FROM users WHERE username = 'admin'), CURRENT_TIMESTAMP - INTERVAL '5 days'),
('utilities', 80.00, 'Water bill', NULL, NULL, CURRENT_DATE - INTERVAL '5 days', (SELECT id FROM users WHERE username = 'admin'), CURRENT_TIMESTAMP - INTERVAL '5 days'),
('rent', 2000.00, 'Monthly shop rent', NULL, NULL, CURRENT_DATE - INTERVAL '1 day', (SELECT id FROM users WHERE username = 'admin'), CURRENT_TIMESTAMP - INTERVAL '1 day'),
('maintenance', 150.00, 'Plumber - kitchen sink repair', NULL, NULL, CURRENT_DATE - INTERVAL '2 days', (SELECT id FROM users WHERE username = 'manager1'), CURRENT_TIMESTAMP - INTERVAL '2 days'),
('salaries', 500.00, 'Weekly staff wages advance', NULL, NULL, CURRENT_DATE - INTERVAL '3 days', (SELECT id FROM users WHERE username = 'admin'), CURRENT_TIMESTAMP - INTERVAL '3 days'),
('supplies', 45.00, 'Office stationery and receipt paper', NULL, NULL, CURRENT_DATE - INTERVAL '4 days', (SELECT id FROM users WHERE username = 'manager1'), CURRENT_TIMESTAMP - INTERVAL '4 days'),
('other', 35.00, 'Pest control service', NULL, NULL, CURRENT_DATE - INTERVAL '6 days', (SELECT id FROM users WHERE username = 'admin'), CURRENT_TIMESTAMP - INTERVAL '6 days');

-- ============================================================
-- Kitchen Stations & Category Mapping
-- ============================================================

INSERT INTO kitchen_stations (name, output_type, sort_order) VALUES
('Main Kitchen', 'kds', 1),
('Bar', 'kds', 2),
('Bakery', 'printer', 3);

INSERT INTO category_station_map (category_id, station_id) VALUES
((SELECT id FROM categories WHERE name = 'Appetizers'), (SELECT id FROM kitchen_stations WHERE name = 'Main Kitchen')),
((SELECT id FROM categories WHERE name = 'Main Courses'), (SELECT id FROM kitchen_stations WHERE name = 'Main Kitchen')),
((SELECT id FROM categories WHERE name = 'Salads'), (SELECT id FROM kitchen_stations WHERE name = 'Main Kitchen')),
((SELECT id FROM categories WHERE name = 'Pizza'), (SELECT id FROM kitchen_stations WHERE name = 'Main Kitchen')),
((SELECT id FROM categories WHERE name = 'Beverages'), (SELECT id FROM kitchen_stations WHERE name = 'Bar')),
((SELECT id FROM categories WHERE name = 'Desserts'), (SELECT id FROM kitchen_stations WHERE name = 'Bakery'));

-- App Settings
INSERT INTO app_settings (key, value) VALUES
('currency', to_jsonb('PKR'::text)),
('enabled_order_types', '[{"id": "dine_in", "label": "Dine In", "enabled": true}, {"id": "takeout", "label": "Takeaway", "enabled": true}, {"id": "delivery", "label": "Delivery", "enabled": false}, {"id": "foodpanda", "label": "Foodpanda", "enabled": false}]'::jsonb),
('currency', '"PKR"'::jsonb),
('tax_rate_cash', '0.15'::jsonb),
('tax_rate_card', '0.05'::jsonb),
('tax_rate_online', '0.15'::jsonb),
('service_charge_rate', '0.10'::jsonb)
ON CONFLICT (key) DO NOTHING;

