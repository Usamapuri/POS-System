-- One-off migration for existing databases (docker volume / production).
-- Safe to run multiple times where supported (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS released_order_sequences (
    business_date DATE NOT NULL,
    seq INTEGER NOT NULL,
    released_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (business_date, seq)
);

CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255),
    phone VARCHAR(40),
    display_name VARCHAR(100),
    birthday DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS customers_email_lower_unique ON customers (lower(trim(email)))
    WHERE email IS NOT NULL AND trim(email) <> '';
CREATE UNIQUE INDEX IF NOT EXISTS customers_phone_unique ON customers (phone)
    WHERE phone IS NOT NULL AND trim(phone) <> '';

ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(40);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS guest_birthday DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_opened_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_open_tab BOOLEAN NOT NULL DEFAULT false;
