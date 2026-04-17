-- Inventory activity log + voidable purchases (run on existing DBs; fresh installs use init/01_schema.sql)

ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS void_reason TEXT;

CREATE TABLE IF NOT EXISTS inventory_activity_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(80) NOT NULL,
    entity_type VARCHAR(40) NOT NULL,
    entity_id UUID,
    summary TEXT NOT NULL,
    metadata JSONB,
    correlation_id UUID
);

CREATE INDEX IF NOT EXISTS idx_inventory_activity_created ON inventory_activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_activity_action ON inventory_activity_log(action);
CREATE INDEX IF NOT EXISTS idx_inventory_activity_entity ON inventory_activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_voided ON stock_movements(voided_at) WHERE voided_at IS NOT NULL;
