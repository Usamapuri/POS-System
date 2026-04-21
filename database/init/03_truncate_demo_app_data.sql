-- Truncate demo / tenant app data for a re-seed, without dropping schema.
-- Keeps: expense_category_defs (catalog from schema), and user `bhookly_support` if present.
-- Tables that reference `orders` (e.g. kitchen_events) are cleared by TRUNCATE … CASCADE.
--
-- Run before database/init/02_seed_data.sql:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/init/03_truncate_demo_app_data.sql
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/init/02_seed_data.sql
--
-- Or: go run ./cmd/seeddemo from backend/ (wraps both in transactions).

TRUNCATE TABLE
    void_log,
    order_status_history,
    order_items,
    payments,
    orders,
    inventory,
    category_station_map,
    kitchen_stations,
    products,
    categories,
    dining_tables,
    customers,
    stock_batches,
    stock_movements,
    purchase_order_lines,
    purchase_orders,
    suppliers,
    stock_items,
    stock_categories,
    inventory_activity_log,
    expenses,
    daily_closings,
    app_settings,
    order_number_counters,
    released_order_sequences
RESTART IDENTITY CASCADE;

-- Remove all staff except hidden platform support (re-seed replaces demo users).
DELETE FROM users
WHERE username IS DISTINCT FROM 'bhookly_support';
