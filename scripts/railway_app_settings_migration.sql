-- Idempotent: creates app_settings and upserts defaults (PKR + checkout rates + order types).
-- Safe to re-run; updates values on conflict.

CREATE TABLE IF NOT EXISTS app_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO app_settings (key, value) VALUES
('currency', to_jsonb('PKR'::text)),
('enabled_order_types', '[{"id": "dine_in", "label": "Dine In", "enabled": true}, {"id": "takeout", "label": "Takeaway", "enabled": true}, {"id": "delivery", "label": "Delivery", "enabled": false}, {"id": "foodpanda", "label": "Foodpanda", "enabled": false}]'::jsonb),
('tax_rate_cash', '0.15'::jsonb),
('tax_rate_card', '0.05'::jsonb),
('tax_rate_online', '0.15'::jsonb),
('service_charge_rate', '0.10'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP;
