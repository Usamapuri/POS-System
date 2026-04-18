package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"

	"pos-backend/internal/config"
	"pos-backend/internal/models"
	"pos-backend/internal/pricing"

	"github.com/gin-gonic/gin"
)

type SettingsHandler struct {
	db *sql.DB
}

func NewSettingsHandler(db *sql.DB) *SettingsHandler {
	return &SettingsHandler{db: db}
}

func (h *SettingsHandler) GetSetting(c *gin.Context) {
	key := c.Param("key")

	var value json.RawMessage
	err := h.db.QueryRow(`SELECT value FROM app_settings WHERE key = $1`, key).Scan(&value)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Setting not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to fetch setting", Error: strPtr(err.Error())})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{Success: true, Data: json.RawMessage(value)})
}

func (h *SettingsHandler) UpdateSetting(c *gin.Context) {
	key := c.Param("key")

	var body json.RawMessage
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid JSON body", Error: strPtr(err.Error())})
		return
	}

	// Per-key validation for keys that gate behavior. Anything else is
	// stored as-is (legacy behavior).
	if strings.HasPrefix(key, "kitchen.") {
		if err := validateKitchenSetting(key, body); err != nil {
			c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: err.Error()})
			return
		}
	}

	_, err := h.db.Exec(`
		INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
		ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
	`, key, body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to save setting", Error: strPtr(err.Error())})
		return
	}

	if strings.HasPrefix(key, "kitchen.") {
		config.InvalidateKitchenCache()
	}

	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Setting saved"})
}

func validateKitchenSetting(key string, raw json.RawMessage) error {
	switch key {
	case "kitchen.mode":
		var s string
		if err := json.Unmarshal(raw, &s); err != nil {
			return errBadValue("kitchen.mode must be a JSON string")
		}
		if !config.IsValidMode(s) {
			return errBadValue("kitchen.mode must be 'kds', 'kot_only', or 'hybrid'")
		}
	case "kitchen.urgency_minutes", "kitchen.stale_minutes", "kitchen.recall_window_seconds":
		var n float64
		if err := json.Unmarshal(raw, &n); err != nil {
			return errBadValue(key + " must be a number")
		}
		if n < 0 || n > 24*60 {
			return errBadValue(key + " out of range")
		}
	}
	return nil
}

type kitchenSettingError struct{ msg string }

func (e *kitchenSettingError) Error() string { return e.msg }

func errBadValue(msg string) error { return &kitchenSettingError{msg: msg} }

func (h *SettingsHandler) GetAllSettings(c *gin.Context) {
	rows, err := h.db.Query(`SELECT key, value FROM app_settings ORDER BY key`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to fetch settings", Error: strPtr(err.Error())})
		return
	}
	defer rows.Close()

	result := map[string]json.RawMessage{}
	for rows.Next() {
		var key string
		var value json.RawMessage
		rows.Scan(&key, &value)
		result[key] = value
	}

	c.JSON(http.StatusOK, models.APIResponse{Success: true, Data: result})
}

// GetPricingSettings returns tax and service charge rates for checkout UI.
func (h *SettingsHandler) GetPricingSettings(c *gin.Context) {
	p, err := pricing.LoadSettings(h.db)
	if err != nil {
		p = pricing.Defaults
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Data: p})
}
