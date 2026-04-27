package fiscal

import (
	"database/sql"
	"encoding/json"
	"strings"
)

const AppSettingsKeyFiscalTax = "fiscal_tax_config"

// StoredTaxConfig is persisted JSON in app_settings (includes encrypted API key).
type StoredTaxConfig struct {
	Authority             string `json:"authority"`
	PosID                 string `json:"pos_id"`
	NTN                   string `json:"ntn"`
	IsSandbox             bool   `json:"is_sandbox"`
	STRN                  string `json:"strn,omitempty"`
	PNTN                  string `json:"pntn,omitempty"`
	PosRegistrationNumber string `json:"pos_registration_number,omitempty"`
	SFDProxyURL           string `json:"sfd_proxy_url,omitempty"`
	APIKeyEnc               string `json:"api_key_enc,omitempty"`
}

// LoadedTaxConfig is decrypted + validated view used by the factory.
type LoadedTaxConfig struct {
	StoredTaxConfig
	APIKeyPlain string
}

// LoadTaxConfig reads and decrypts fiscal_tax_config from app_settings.
func LoadTaxConfig(db *sql.DB) (LoadedTaxConfig, error) {
	var raw []byte
	err := db.QueryRow(`SELECT value FROM app_settings WHERE key = $1`, AppSettingsKeyFiscalTax).Scan(&raw)
	if err == sql.ErrNoRows {
		return LoadedTaxConfig{StoredTaxConfig: StoredTaxConfig{Authority: AuthorityNone, IsSandbox: true}}, nil
	}
	if err != nil {
		return LoadedTaxConfig{}, err
	}
	var st StoredTaxConfig
	if err := json.Unmarshal(raw, &st); err != nil {
		return LoadedTaxConfig{StoredTaxConfig: StoredTaxConfig{Authority: AuthorityNone, IsSandbox: true}}, nil
	}
	key, err := DecryptAPIKey(st.APIKeyEnc)
	if err != nil {
		key = ""
	}
	return LoadedTaxConfig{StoredTaxConfig: st, APIKeyPlain: key}, nil
}

func (c LoadedTaxConfig) HasLiveCredentials() bool {
	switch strings.ToUpper(strings.TrimSpace(c.Authority)) {
	case AuthorityFBR:
		return strings.TrimSpace(c.PosID) != "" &&
			strings.TrimSpace(c.NTN) != "" &&
			strings.TrimSpace(c.APIKeyPlain) != ""
	case AuthorityPRA:
		return strings.TrimSpace(c.PosID) != "" &&
			(strings.TrimSpace(c.PNTN) != "" || strings.TrimSpace(c.NTN) != "") &&
			strings.TrimSpace(c.APIKeyPlain) != ""
	default:
		return false
	}
}

// UseMockForAutoFiscalize: mock when authority NONE, sandbox, or missing creds.
func (c LoadedTaxConfig) UseMockForAutoFiscalize() bool {
	a := strings.ToUpper(strings.TrimSpace(c.Authority))
	if a == "" || a == AuthorityNone {
		return true
	}
	if c.IsSandbox {
		return true
	}
	if !c.HasLiveCredentials() {
		return true
	}
	return false
}
