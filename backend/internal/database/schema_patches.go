package database

import (
	"database/sql"
	"log"
)

// ApplySchemaPatches runs idempotent DDL so existing DB volumes (created
// before newer columns or tables) match what handlers expect. It is invoked
// from main.go on every backend boot, so production picks up new schema as
// soon as the backend container restarts (Railway redeploys trigger this
// automatically — see backend/railway.json watchPatterns).
//
// MIRROR INVARIANT — please read before adding a migration:
//
//  1. Every new file in `database/migrations/NNN_*.sql` MUST also be
//     reflected here as idempotent DDL in the same PR. The raw SQL files
//     are a human-readable history; this Go function is what production
//     actually executes.
//  2. Every statement MUST be safely re-runnable on an already-up-to-date
//     database. Use `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT
//     EXISTS`, `DROP CONSTRAINT IF EXISTS` before re-adding constraints,
//     `INSERT … WHERE NOT EXISTS` / `ON CONFLICT DO NOTHING` for seed rows,
//     etc. Failures are logged (never fatal) so one broken patch can't
//     prevent the rest from running, but a non-idempotent statement will
//     spam logs every boot.
//  3. Order matters when patches depend on each other (e.g. add a column
//     before adding a CHECK constraint on it). Append new logical groups
//     at the bottom of this function rather than splicing into existing
//     blocks.
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
		// discount_percent: NULL for flat-amount discounts (or no discount),
		// 0-100 when entered as a percentage. Matches migrations/006.
		`ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_percent DECIMAL(5,2)`,
		`ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_discount_percent_range`,
		`ALTER TABLE orders ADD CONSTRAINT orders_discount_percent_range CHECK (discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100))`,
		`ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_payment_method_check`,
		`ALTER TABLE payments ADD CONSTRAINT payments_payment_method_check CHECK (payment_method IN ('cash', 'credit_card', 'debit_card', 'digital_wallet', 'online'))`,
		`ALTER TABLE dining_tables ADD COLUMN IF NOT EXISTS zone VARCHAR(100)`,
		`ALTER TABLE dining_tables ADD COLUMN IF NOT EXISTS map_x DOUBLE PRECISION`,
		`ALTER TABLE dining_tables ADD COLUMN IF NOT EXISTS map_y DOUBLE PRECISION`,
		`ALTER TABLE dining_tables ADD COLUMN IF NOT EXISTS map_w DOUBLE PRECISION`,
		`ALTER TABLE dining_tables ADD COLUMN IF NOT EXISTS map_h DOUBLE PRECISION`,
		`ALTER TABLE dining_tables ADD COLUMN IF NOT EXISTS map_rotation INTEGER`,
		`ALTER TABLE dining_tables ADD COLUMN IF NOT EXISTS shape VARCHAR(20)`,
		// PRA tax invoice — optional second receipt slip. Columns nullable with
		// safe defaults so existing rows remain valid.
		`ALTER TABLE orders ADD COLUMN IF NOT EXISTS pra_invoice_printed BOOLEAN NOT NULL DEFAULT false`,
		`ALTER TABLE orders ADD COLUMN IF NOT EXISTS pra_invoice_number VARCHAR(64)`,
		`ALTER TABLE orders ADD COLUMN IF NOT EXISTS pra_invoice_printed_at TIMESTAMP WITH TIME ZONE`,
		// PRA late-print audit (Reports → Orders Browser → Reprint PRA).
		// Tracks how many times an invoice was reprinted (excluding the first
		// initial print) and who/when did the most recent reprint.
		`ALTER TABLE orders ADD COLUMN IF NOT EXISTS pra_invoice_reprint_count INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE orders ADD COLUMN IF NOT EXISTS pra_invoice_last_reprinted_at TIMESTAMP WITH TIME ZONE`,
		`ALTER TABLE orders ADD COLUMN IF NOT EXISTS pra_invoice_last_reprinted_by UUID REFERENCES users(id) ON DELETE SET NULL`,
		// Reports v2 — speed up hourly/daily aggregations and the Orders Browser
		// day-scoped query. All partial / functional indexes; safe to add.
		`CREATE INDEX IF NOT EXISTS idx_orders_completed_status ON orders(completed_at) WHERE status = 'completed'`,
		`CREATE INDEX IF NOT EXISTS idx_orders_created_status ON orders(created_at, status)`,
		`CREATE INDEX IF NOT EXISTS idx_orders_pra_printed_at ON orders(pra_invoice_printed_at) WHERE pra_invoice_printed = true`,
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

	// PRA late-print policy — used by counter-side MarkPraInvoicePrinted to
	// decide whether a "reprint after the fact" is allowed. Settings UI is in
	// Admin → Settings → PRA tax invoice; admins always bypass this window via
	// the /admin/orders/:id/pra-invoice route.
	praLateDefaults := []struct {
		key string
		val string
	}{
		{"pra_invoice_late_print_enabled", "true"},
		{"pra_invoice_late_print_window_days", "1"},
	}
	for _, d := range praLateDefaults {
		if _, err := db.Exec(
			`INSERT INTO app_settings (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO NOTHING`,
			d.key, d.val,
		); err != nil {
			log.Printf("schema patch: %s default: %v", d.key, err)
		}
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

	// Store purchasing (suppliers, purchase orders, FIFO batches) — migrations/001.
	// Keeps older dev/prod DBs compatible with handlers/stock_purchasing.go and
	// handlers/stock_batches.go without the operator having to run migrate scripts.
	storePurchasing := []string{
		`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,
		`CREATE TABLE IF NOT EXISTS suppliers (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			name VARCHAR(150) NOT NULL,
			contact_name VARCHAR(100),
			phone VARCHAR(40),
			email VARCHAR(120),
			notes TEXT,
			is_active BOOLEAN DEFAULT true,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS purchase_orders (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
			status VARCHAR(24) NOT NULL DEFAULT 'draft'
				CHECK (status IN ('draft','ordered','partially_received','received','cancelled')),
			expected_date DATE,
			notes TEXT,
			created_by UUID REFERENCES users(id) ON DELETE SET NULL,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS purchase_order_lines (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
			stock_item_id UUID NOT NULL REFERENCES stock_items(id) ON DELETE RESTRICT,
			quantity_ordered DECIMAL(10,2) NOT NULL CHECK (quantity_ordered > 0),
			unit_cost DECIMAL(10,2),
			quantity_received DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		)`,
		`ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL`,
		`ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL`,
		`CREATE TABLE IF NOT EXISTS stock_batches (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			stock_item_id UUID NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
			quantity_remaining DECIMAL(10,2) NOT NULL CHECK (quantity_remaining >= 0),
			initial_quantity DECIMAL(10,2) NOT NULL CHECK (initial_quantity > 0),
			unit_cost DECIMAL(10,2),
			expiry_date DATE,
			stock_movement_id UUID REFERENCES stock_movements(id) ON DELETE SET NULL,
			purchase_order_line_id UUID REFERENCES purchase_order_lines(id) ON DELETE SET NULL,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_stock_batches_fifo ON stock_batches (stock_item_id, expiry_date NULLS LAST, created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_stock_batches_remaining ON stock_batches (stock_item_id) WHERE quantity_remaining > 0`,
		`CREATE INDEX IF NOT EXISTS idx_stock_movements_supplier ON stock_movements(supplier_id)`,
		`CREATE INDEX IF NOT EXISTS idx_stock_movements_po ON stock_movements(purchase_order_id)`,
		`CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id)`,
		`CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_po ON purchase_order_lines(purchase_order_id)`,
		`ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check`,
		`ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_movement_type_check
			CHECK (movement_type IN ('purchase', 'issue', 'adjustment'))`,
	}
	for _, q := range storePurchasing {
		if _, err := db.Exec(q); err != nil {
			log.Printf("schema patch (store-purchasing): %v", err)
		}
	}

	// User profile image (migrations/003) — referenced by getAdminUsers SELECT.
	if _, err := db.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_url TEXT`); err != nil {
		log.Printf("schema patch: users.profile_image_url: %v", err)
	}

	// Self-service password flow + bhookly platform-admin (migrations/004).
	// See database/migrations/004_auth_password_reset.sql for column semantics.
	authPasswordReset := []string{
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token_hash TEXT`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMPTZ`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_requested_at TIMESTAMPTZ`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_updated_at TIMESTAMPTZ`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT false`,
		`CREATE INDEX IF NOT EXISTS idx_users_password_reset_token_hash
			ON users(password_reset_token_hash)
			WHERE password_reset_token_hash IS NOT NULL`,
	}
	for _, q := range authPasswordReset {
		if _, err := db.Exec(q); err != nil {
			log.Printf("schema patch (auth-password-reset): %v", err)
		}
	}

	// Expense categories + recorded_at (migrations/005).
	expenseLedger := []string{
		`CREATE TABLE IF NOT EXISTS expense_category_defs (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			slug VARCHAR(64) UNIQUE NOT NULL,
			label VARCHAR(120) NOT NULL,
			color VARCHAR(80) NOT NULL DEFAULT 'bg-muted text-muted-foreground',
			sort_order INTEGER NOT NULL DEFAULT 0,
			is_system BOOLEAN NOT NULL DEFAULT false,
			is_active BOOLEAN NOT NULL DEFAULT true,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		)`,
		`ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_category_check`,
		`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ`,
		`UPDATE expenses SET recorded_at = COALESCE(recorded_at, (expense_date::timestamp AT TIME ZONE 'UTC')) WHERE recorded_at IS NULL`,
		`ALTER TABLE expenses ALTER COLUMN recorded_at SET DEFAULT CURRENT_TIMESTAMP`,
		`ALTER TABLE expenses ALTER COLUMN recorded_at SET NOT NULL`,
		`ALTER TABLE expenses ALTER COLUMN category TYPE VARCHAR(64)`,
		`CREATE INDEX IF NOT EXISTS idx_expenses_recorded_at ON expenses(recorded_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_expense_category_defs_slug ON expense_category_defs(slug)`,
		`CREATE INDEX IF NOT EXISTS idx_expense_category_defs_active ON expense_category_defs(is_active) WHERE is_active = true`,
	}
	for _, q := range expenseLedger {
		if _, err := db.Exec(q); err != nil {
			log.Printf("schema patch (expense-ledger): %v", err)
		}
	}
	// Seed default expense category defs (idempotent via WHERE NOT EXISTS).
	if _, err := db.Exec(`
		INSERT INTO expense_category_defs (slug, label, color, sort_order, is_system)
		SELECT v.slug, v.label, v.color, v.sort_order, v.is_system
		FROM (VALUES
			('inventory_purchase', 'Inventory Purchase', 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200', 10, true),
			('utilities', 'Utilities', 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200', 20, false),
			('rent', 'Rent', 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200', 30, false),
			('salaries', 'Salaries', 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200', 40, false),
			('maintenance', 'Maintenance', 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200', 50, false),
			('marketing', 'Marketing', 'bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-200', 60, false),
			('supplies', 'Supplies', 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200', 70, false),
			('other', 'Other', 'bg-muted text-muted-foreground', 100, false)
		) AS v(slug, label, color, sort_order, is_system)
		WHERE NOT EXISTS (SELECT 1 FROM expense_category_defs WHERE expense_category_defs.slug = v.slug)
	`); err != nil {
		log.Printf("schema patch: expense_category_defs seed: %v", err)
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

	// Guarantee at least one active kitchen station exists. The Railway
	// embedded bootstrap (embedded_railway_init.sql) creates the
	// kitchen_stations table but never seeds rows — only the local-dev
	// init/02_seed_data.sql does. Without this, FireKOT's fallback path in
	// handlers/kot.go would be forced to use uuid.Nil as station_id, which
	// then violates kitchen_events_station_id_fkey on insert. Idempotent:
	// the WHERE NOT EXISTS clause makes this a no-op once any station row
	// is present (whether seeded here, by 02_seed_data, or by an admin).
	if _, err := db.Exec(`
		INSERT INTO kitchen_stations (name, output_type, print_location, sort_order, is_active)
		SELECT 'Main Kitchen', 'kds', 'kitchen', 1, true
		WHERE NOT EXISTS (SELECT 1 FROM kitchen_stations)
	`); err != nil {
		log.Printf("schema patch: kitchen_stations default seed: %v", err)
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
