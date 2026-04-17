-- Custom expense categories + recorded_at for expense ledger display (existing DBs)

CREATE TABLE IF NOT EXISTS expense_category_defs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(64) UNIQUE NOT NULL,
    label VARCHAR(120) NOT NULL,
    color VARCHAR(80) NOT NULL DEFAULT 'bg-muted text-muted-foreground',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_system BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

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
WHERE NOT EXISTS (SELECT 1 FROM expense_category_defs WHERE expense_category_defs.slug = v.slug);

ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_category_check;

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ;

UPDATE expenses SET recorded_at = COALESCE(
    recorded_at,
    (expense_date::timestamp AT TIME ZONE 'UTC')
) WHERE recorded_at IS NULL;

ALTER TABLE expenses ALTER COLUMN recorded_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE expenses ALTER COLUMN recorded_at SET NOT NULL;

ALTER TABLE expenses ALTER COLUMN category TYPE VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_expenses_recorded_at ON expenses(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_expense_category_defs_slug ON expense_category_defs(slug);
CREATE INDEX IF NOT EXISTS idx_expense_category_defs_active ON expense_category_defs(is_active) WHERE is_active = true;

DROP TRIGGER IF EXISTS update_expense_category_defs_updated_at ON expense_category_defs;
CREATE TRIGGER update_expense_category_defs_updated_at
    BEFORE UPDATE ON expense_category_defs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
