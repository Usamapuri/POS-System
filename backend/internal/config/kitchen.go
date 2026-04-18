// Package config provides cached access to dynamic app_settings that gate
// Kitchen/KDS behavior. All reads go through a short-TTL cache so the hot
// kitchen paths (fire-kot, kitchen list) aren't billed a DB round-trip each
// request while still picking up admin changes within a few seconds.
package config

import (
	"database/sql"
	"encoding/json"
	"strings"
	"sync"
	"time"
)

// KitchenMode controls how orders are routed to printers/KDS and whether
// the /kitchen screens are exposed.
type KitchenMode string

const (
	KitchenModeKDS     KitchenMode = "kds"
	KitchenModeKOTOnly KitchenMode = "kot_only"
	KitchenModeHybrid  KitchenMode = "hybrid"
)

// KitchenSettings is the snapshot applied by handlers.
type KitchenSettings struct {
	Mode                KitchenMode
	UrgencyMinutes      int
	StaleMinutes        int
	RecallWindowSeconds int
}

var defaults = KitchenSettings{
	Mode:                KitchenModeKDS,
	UrgencyMinutes:      15,
	StaleMinutes:        120,
	RecallWindowSeconds: 300,
}

// Sensible key/value guards — admins can type anything, we refuse to let
// that produce nonsense downstream.
const (
	minUrgencyMinutes      = 1
	maxUrgencyMinutes      = 240
	minStaleMinutes        = 15
	maxStaleMinutes        = 1440
	minRecallWindowSeconds = 0
	maxRecallWindowSeconds = 3600
)

type cachedSnapshot struct {
	value   KitchenSettings
	expires time.Time
}

var (
	kitchenCacheMu sync.RWMutex
	kitchenCache   cachedSnapshot
)

// cacheTTL is deliberately short — a few seconds keeps the admin UX tight
// without hammering the DB. InvalidateKitchenCache is also called on PUT.
const cacheTTL = 5 * time.Second

// LoadKitchen returns the current kitchen settings, cached for cacheTTL.
// On any error we fall back to defaults so the system keeps functioning.
func LoadKitchen(db *sql.DB) KitchenSettings {
	kitchenCacheMu.RLock()
	snap := kitchenCache
	kitchenCacheMu.RUnlock()
	if time.Now().Before(snap.expires) {
		return snap.value
	}

	s := readKitchenSettings(db)

	kitchenCacheMu.Lock()
	kitchenCache = cachedSnapshot{value: s, expires: time.Now().Add(cacheTTL)}
	kitchenCacheMu.Unlock()
	return s
}

// InvalidateKitchenCache is called after PUT /admin/settings/:key so the
// admin sees their change reflected immediately in subsequent requests.
func InvalidateKitchenCache() {
	kitchenCacheMu.Lock()
	kitchenCache = cachedSnapshot{}
	kitchenCacheMu.Unlock()
}

// readKitchenSettings pulls the four kitchen.* keys from app_settings in a
// single query. Missing/invalid values fall through to defaults.
func readKitchenSettings(db *sql.DB) KitchenSettings {
	out := defaults
	if db == nil {
		return out
	}

	rows, err := db.Query(`
		SELECT key, value::text
		FROM app_settings
		WHERE key IN ('kitchen.mode','kitchen.urgency_minutes','kitchen.stale_minutes','kitchen.recall_window_seconds')
	`)
	if err != nil {
		return out
	}
	defer rows.Close()

	for rows.Next() {
		var key, raw string
		if err := rows.Scan(&key, &raw); err != nil {
			continue
		}
		switch key {
		case "kitchen.mode":
			if mode, ok := parseModeJSON(raw); ok {
				out.Mode = mode
			}
		case "kitchen.urgency_minutes":
			if n, ok := parseIntJSON(raw); ok {
				out.UrgencyMinutes = clamp(n, minUrgencyMinutes, maxUrgencyMinutes)
			}
		case "kitchen.stale_minutes":
			if n, ok := parseIntJSON(raw); ok {
				out.StaleMinutes = clamp(n, minStaleMinutes, maxStaleMinutes)
			}
		case "kitchen.recall_window_seconds":
			if n, ok := parseIntJSON(raw); ok {
				out.RecallWindowSeconds = clamp(n, minRecallWindowSeconds, maxRecallWindowSeconds)
			}
		}
	}
	return out
}

func parseModeJSON(raw string) (KitchenMode, bool) {
	var s string
	if err := json.Unmarshal([]byte(raw), &s); err == nil {
		switch strings.ToLower(strings.TrimSpace(s)) {
		case "kds":
			return KitchenModeKDS, true
		case "kot_only", "kot-only", "kotonly":
			return KitchenModeKOTOnly, true
		case "hybrid":
			return KitchenModeHybrid, true
		}
	}
	return "", false
}

func parseIntJSON(raw string) (int, bool) {
	var n int
	if err := json.Unmarshal([]byte(raw), &n); err == nil {
		return n, true
	}
	var f float64
	if err := json.Unmarshal([]byte(raw), &f); err == nil {
		return int(f), true
	}
	var s string
	if err := json.Unmarshal([]byte(raw), &s); err == nil {
		if n, ok := parseIntJSON(`"` + strings.TrimSpace(s) + `"`); ok {
			return n, true
		}
	}
	return 0, false
}

func clamp(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

// IsKDSEnabled reports whether the /kitchen screens and KDS routing behavior
// are active for the current venue.
func (s KitchenSettings) IsKDSEnabled() bool {
	return s.Mode == KitchenModeKDS || s.Mode == KitchenModeHybrid
}

// ForcePrinterOnly reports whether fire-kot should ignore station.output_type
// and treat every destination as a thermal printer.
func (s KitchenSettings) ForcePrinterOnly() bool {
	return s.Mode == KitchenModeKOTOnly
}

// IsValidMode returns true for the three accepted mode strings.
func IsValidMode(m string) bool {
	switch KitchenMode(strings.ToLower(strings.TrimSpace(m))) {
	case KitchenModeKDS, KitchenModeKOTOnly, KitchenModeHybrid:
		return true
	}
	return false
}
