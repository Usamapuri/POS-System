-- Add default display currency (PKR) in app_settings.
-- Safe on existing DBs; upserts so re-running is OK.

INSERT INTO app_settings (key, value) VALUES ('currency', to_jsonb('PKR'::text))
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP;
