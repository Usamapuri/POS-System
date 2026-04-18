package database

import (
	"database/sql"
	"log"
)

// ApplySchemaPatches runs idempotent DDL so existing DB volumes (created before newer columns
// or tables) match what handlers expect. Mirrors scripts/counter_pricing_migration.sql.
func ApplySchemaPatches(db *sql.DB) {
	log.Println("Applying idempotent schema patches…")

	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS order_number_counters (
			business_date DATE PRIMARY KEY,
			last_value INTEGER NOT NULL CHECK (last_value > 0)
		)`); err != nil {
		log.Printf("schema patch: order_number_counters: %v", err)
	}

	stmts := []string{
		`ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_charge_amount DECIMAL(10,2) NOT NULL DEFAULT 0`,
		`ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_payment_method VARCHAR(20)`,
		`ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_checkout_payment_method_check`,
		`ALTER TABLE orders ADD CONSTRAINT orders_checkout_payment_method_check CHECK (checkout_payment_method IS NULL OR checkout_payment_method IN ('cash', 'card', 'online'))`,
		`ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_payment_method_check`,
		`ALTER TABLE payments ADD CONSTRAINT payments_payment_method_check CHECK (payment_method IN ('cash', 'credit_card', 'debit_card', 'digital_wallet', 'online'))`,
		`ALTER TABLE dining_tables ADD COLUMN IF NOT EXISTS zone VARCHAR(100)`,
		`ALTER TABLE dining_tables ADD COLUMN IF NOT EXISTS map_x DOUBLE PRECISION`,
		`ALTER TABLE dining_tables ADD COLUMN IF NOT EXISTS map_y DOUBLE PRECISION`,
		`ALTER TABLE dining_tables ADD COLUMN IF NOT EXISTS map_w DOUBLE PRECISION`,
		`ALTER TABLE dining_tables ADD COLUMN IF NOT EXISTS map_h DOUBLE PRECISION`,
		`ALTER TABLE dining_tables ADD COLUMN IF NOT EXISTS map_rotation INTEGER`,
		`ALTER TABLE dining_tables ADD COLUMN IF NOT EXISTS shape VARCHAR(20)`,
	}
	for _, q := range stmts {
		if _, err := db.Exec(q); err != nil {
			log.Printf("schema patch warning: %v", err)
		}
	}

	if _, err := db.Exec(`
		ALTER TABLE kitchen_stations ADD COLUMN IF NOT EXISTS print_location VARCHAR(20) DEFAULT 'kitchen'
	`); err != nil {
		log.Printf("schema patch: kitchen_stations.print_location: %v", err)
	}
	if _, err := db.Exec(`
		UPDATE kitchen_stations SET print_location = 'kitchen' WHERE print_location IS NULL OR TRIM(print_location) = ''
	`); err != nil {
		log.Printf("schema patch: kitchen_stations.print_location backfill: %v", err)
	}
	if _, err := db.Exec(`
		ALTER TABLE kitchen_stations ALTER COLUMN print_location SET DEFAULT 'kitchen'
	`); err != nil {
		log.Printf("schema patch: kitchen_stations.print_location default: %v", err)
	}
	if _, err := db.Exec(`
		ALTER TABLE kitchen_stations DROP CONSTRAINT IF EXISTS kitchen_stations_print_location_check
	`); err != nil {
		log.Printf("schema patch: drop print_location check: %v", err)
	}
	if _, err := db.Exec(`
		ALTER TABLE kitchen_stations ADD CONSTRAINT kitchen_stations_print_location_check
		CHECK (print_location IN ('kitchen', 'counter'))
	`); err != nil {
		log.Printf("schema patch: add print_location check: %v", err)
	}

	if _, err := db.Exec(`
		INSERT INTO app_settings (key, value) VALUES ('currency', '"PKR"'::jsonb)
		ON CONFLICT (key) DO NOTHING
	`); err != nil {
		log.Printf("schema patch: app_settings.currency default: %v", err)
	}

	crmOpenTab := []string{
		`CREATE TABLE IF NOT EXISTS released_order_sequences (
			business_date DATE NOT NULL,
			seq INTEGER NOT NULL,
			released_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (business_date, seq)
		)`,
		`CREATE TABLE IF NOT EXISTS customers (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			email VARCHAR(255),
			phone VARCHAR(40),
			display_name VARCHAR(100),
			birthday DATE,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS customers_email_lower_unique ON customers (lower(trim(email)))
			WHERE email IS NOT NULL AND trim(email) <> ''`,
		`CREATE UNIQUE INDEX IF NOT EXISTS customers_phone_unique ON customers (phone)
			WHERE phone IS NOT NULL AND trim(phone) <> ''`,
		`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL`,
		`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255)`,
		`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(40)`,
		`ALTER TABLE orders ADD COLUMN IF NOT EXISTS guest_birthday DATE`,
		`ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_opened_at TIMESTAMP WITH TIME ZONE`,
		`ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_open_tab BOOLEAN NOT NULL DEFAULT false`,
	}
	for _, q := range crmOpenTab {
		if _, err := db.Exec(q); err != nil {
			log.Printf("schema patch (crm/open-tab): %v", err)
		}
	}

	inventoryActivity := []string{
		`ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ`,
		`ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES users(id) ON DELETE SET NULL`,
		`ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS void_reason TEXT`,
		`CREATE TABLE IF NOT EXISTS inventory_activity_log (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
			actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
			action VARCHAR(80) NOT NULL,
			entity_type VARCHAR(40) NOT NULL,
			entity_id UUID,
			summary TEXT NOT NULL,
			metadata JSONB,
			correlation_id UUID
		)`,
		`CREATE INDEX IF NOT EXISTS idx_inventory_activity_created ON inventory_activity_log(created_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_inventory_activity_action ON inventory_activity_log(action)`,
		`CREATE INDEX IF NOT EXISTS idx_inventory_activity_entity ON inventory_activity_log(entity_type, entity_id)`,
		`CREATE INDEX IF NOT EXISTS idx_stock_movements_voided ON stock_movements(voided_at) WHERE voided_at IS NOT NULL`,
	}
	for _, q := range inventoryActivity {
		if _, err := db.Exec(q); err != nil {
			log.Printf("schema patch (inventory-activity): %v", err)
		}
	}

	// KDS/KOT overhaul: prepared-at tracking, station urgency override, events audit log.
	kdsPatches := []string{
		`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS prepared_at TIMESTAMPTZ`,
		`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS prepared_by UUID REFERENCES users(id) ON DELETE SET NULL`,
		`ALTER TABLE kitchen_stations ADD COLUMN IF NOT EXISTS urgency_minutes INTEGER`,
		`CREATE TABLE IF NOT EXISTS kitchen_events (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
			order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL,
			event_type VARCHAR(40) NOT NULL CHECK (event_type IN (
				'fired','item_started','item_prepared','item_unprepared',
				'bumped','recalled','voided','served'
			)),
			station_id UUID REFERENCES kitchen_stations(id) ON DELETE SET NULL,
			user_id UUID REFERENCES users(id) ON DELETE SET NULL,
			metadata JSONB,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_kitchen_events_order_created ON kitchen_events(order_id, created_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_kitchen_events_type_created ON kitchen_events(event_type, created_at DESC)`,
	}
	for _, q := range kdsPatches {
		if _, err := db.Exec(q); err != nil {
			log.Printf("schema patch (kds): %v", err)
		}
	}

	// Seed KDS/KOT app_settings with smart defaults.
	// Mode default picks 'kds' if any active KDS station exists, else 'kot_only'.
	if _, err := db.Exec(`
		INSERT INTO app_settings (key, value)
		SELECT 'kitchen.mode',
			CASE WHEN EXISTS (SELECT 1 FROM kitchen_stations WHERE is_active = true AND output_type = 'kds')
				THEN '"kds"'::jsonb ELSE '"kot_only"'::jsonb END
		ON CONFLICT (key) DO NOTHING
	`); err != nil {
		log.Printf("schema patch: kitchen.mode default: %v", err)
	}
	kdsDefaults := []struct {
		key string
		val string
	}{
		{"kitchen.urgency_minutes", "15"},
		{"kitchen.stale_minutes", "120"},
		{"kitchen.recall_window_seconds", "300"},
	}
	for _, d := range kdsDefaults {
		if _, err := db.Exec(
			`INSERT INTO app_settings (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO NOTHING`,
			d.key, d.val,
		); err != nil {
			log.Printf("schema patch: %s default: %v", d.key, err)
		}
	}

	log.Println("Schema patches finished")
}
