-- Daily order number sequence (YYYYMMDD-001, …). Safe to run on existing DBs.
CREATE TABLE IF NOT EXISTS order_number_counters (
    business_date DATE PRIMARY KEY,
    last_value INTEGER NOT NULL CHECK (last_value > 0)
);
