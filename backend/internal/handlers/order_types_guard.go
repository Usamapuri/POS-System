package handlers

import (
	"database/sql"
	"encoding/json"
)

// orderTypeConfigRow matches the shape persisted in app_settings.enabled_order_types
// by the Admin UI (see frontend/src/components/admin/AdminSettings.tsx).
type orderTypeConfigRow struct {
	ID      string `json:"id"`
	Enabled bool   `json:"enabled"`
}

// isOrderTypeEnabled returns true when the given order_type is permitted for
// new order creation per the admin setting.
//
// Safe defaults (all return true) are applied when:
//   - The setting row is missing (fresh install, never configured).
//   - The setting value fails to parse as JSON (corrupted config).
//   - The given orderType id is not present in the config (e.g. a custom
//     channel the admin UI never managed — we don't block unknown ids here).
//
// These fallbacks mirror the frontend hook so a broken settings table never
// wedges the POS. Only an explicit row with {enabled: false} blocks creation.
func isOrderTypeEnabled(db *sql.DB, orderType string) (bool, error) {
	if orderType == "" {
		return true, nil
	}

	var raw []byte
	err := db.QueryRow(`SELECT value FROM app_settings WHERE key = 'enabled_order_types'`).Scan(&raw)
	if err == sql.ErrNoRows {
		return true, nil
	}
	if err != nil {
		return false, err
	}

	var rows []orderTypeConfigRow
	if err := json.Unmarshal(raw, &rows); err != nil {
		// Malformed JSON — don't block the cashier over bad config.
		return true, nil
	}

	for _, r := range rows {
		if r.ID == orderType {
			return r.Enabled, nil
		}
	}
	// Unknown id is not managed by the current admin UI; allow.
	return true, nil
}
