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

	log.Println("Schema patches finished")
}
