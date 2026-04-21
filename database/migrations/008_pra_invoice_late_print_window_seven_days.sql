-- Bump default PRA late-reprint window from 1 to 7 days for existing installs.
-- Mirrored in backend/internal/database/schema_patches.go (ApplySchemaPatches).
-- Sentinel row avoids re-applying on every boot and avoids clobbering an admin
-- who explicitly sets 1 day after migration.

INSERT INTO app_settings (key, value)
VALUES ('pra_invoice_late_print_window_legacy_default_migrated', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

UPDATE app_settings AS w
SET value = '7'::jsonb
FROM app_settings AS m
WHERE w.key = 'pra_invoice_late_print_window_days'
  AND w.value = '1'::jsonb
  AND m.key = 'pra_invoice_late_print_window_legacy_default_migrated'
  AND m.value = 'false'::jsonb;

UPDATE app_settings AS m
SET value = 'true'::jsonb
WHERE m.key = 'pra_invoice_late_print_window_legacy_default_migrated'
  AND m.value = 'false'::jsonb
  AND EXISTS (
    SELECT 1 FROM app_settings AS w
    WHERE w.key = 'pra_invoice_late_print_window_days'
      AND w.value IS DISTINCT FROM '1'::jsonb
  );
