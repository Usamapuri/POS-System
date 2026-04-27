package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"pos-backend/internal/fiscal"
	"pos-backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type FiscalHandler struct {
	db *sql.DB
}

func NewFiscalHandler(db *sql.DB) *FiscalHandler {
	return &FiscalHandler{db: db}
}

// FiscalConfigPublic is safe to return to the admin UI (no raw API key).
type FiscalConfigPublic struct {
	Authority             string `json:"authority"`
	PosID                 string `json:"pos_id"`
	NTN                   string `json:"ntn"`
	IsSandbox             bool   `json:"is_sandbox"`
	STRN                  string `json:"strn,omitempty"`
	PNTN                  string `json:"pntn,omitempty"`
	PosRegistrationNumber string `json:"pos_registration_number,omitempty"`
	SFDProxyURL           string `json:"sfd_proxy_url,omitempty"`
	APIKeySet             bool   `json:"api_key_set"`
	APIKeyMasked          string `json:"api_key_masked,omitempty"`
}

type putFiscalConfigBody struct {
	Authority             string  `json:"authority"`
	PosID                 string  `json:"pos_id"`
	NTN                   string  `json:"ntn"`
	IsSandbox             *bool   `json:"is_sandbox"`
	STRN                  *string `json:"strn"`
	PNTN                  *string `json:"pntn"`
	PosRegistrationNumber *string `json:"pos_registration_number"`
	SFDProxyURL           *string `json:"sfd_proxy_url"`
	APIKey                *string `json:"api_key"`
}

func (h *FiscalHandler) GetConfig(c *gin.Context) {
	cfg, err := fiscal.LoadTaxConfig(h.db)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to load fiscal config", Error: stringPtr(err.Error())})
		return
	}
	pub := FiscalConfigPublic{
		Authority:             strings.TrimSpace(cfg.Authority),
		PosID:                 cfg.PosID,
		NTN:                   cfg.NTN,
		IsSandbox:             cfg.IsSandbox,
		STRN:                  cfg.STRN,
		PNTN:                  cfg.PNTN,
		PosRegistrationNumber: cfg.PosRegistrationNumber,
		SFDProxyURL:           cfg.SFDProxyURL,
		APIKeySet:             strings.TrimSpace(cfg.APIKeyEnc) != "",
	}
	if cfg.APIKeyPlain != "" {
		k := cfg.APIKeyPlain
		if len(k) > 4 {
			pub.APIKeyMasked = "****" + k[len(k)-4:]
		} else {
			pub.APIKeyMasked = "****"
		}
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Data: pub})
}

func (h *FiscalHandler) PutConfig(c *gin.Context) {
	var body putFiscalConfigBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid body", Error: stringPtr(err.Error())})
		return
	}
	cur, err := fiscal.LoadTaxConfig(h.db)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Load config failed", Error: stringPtr(err.Error())})
		return
	}
	st := cur.StoredTaxConfig
	st.Authority = strings.TrimSpace(body.Authority)
	st.PosID = strings.TrimSpace(body.PosID)
	st.NTN = strings.TrimSpace(body.NTN)
	if body.IsSandbox != nil {
		st.IsSandbox = *body.IsSandbox
	}
	if body.STRN != nil {
		st.STRN = strings.TrimSpace(*body.STRN)
	}
	if body.PNTN != nil {
		st.PNTN = strings.TrimSpace(*body.PNTN)
	}
	if body.PosRegistrationNumber != nil {
		st.PosRegistrationNumber = strings.TrimSpace(*body.PosRegistrationNumber)
	}
	if body.SFDProxyURL != nil {
		st.SFDProxyURL = strings.TrimSpace(*body.SFDProxyURL)
	}
	if body.APIKey != nil && strings.TrimSpace(*body.APIKey) != "" {
		enc, err := fiscal.EncryptAPIKey(strings.TrimSpace(*body.APIKey))
		if err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Encrypt API key failed", Error: stringPtr(err.Error())})
			return
		}
		st.APIKeyEnc = enc
	}
	raw, err := json.Marshal(st)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Marshal failed", Error: stringPtr(err.Error())})
		return
	}
	_, err = h.db.Exec(`
		INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
	`, fiscal.AppSettingsKeyFiscalTax, raw)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Save failed", Error: stringPtr(err.Error())})
		return
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Fiscal config saved"})
}

type testConnectionBody struct {
	Authority string `json:"authority"`
}

type testConnectionResponse struct {
	OK          bool   `json:"ok"`
	IRN         string `json:"irn"`
	QrCodeValue string `json:"qr_code_value"`
	Authority   string `json:"authority"`
	Raw         string `json:"raw,omitempty"`
	Error       string `json:"error,omitempty"`
}

// TestConnection posts a 1.00 PKR dummy sale to the selected authority (live HTTP, not auto-mock).
func (h *FiscalHandler) TestConnection(c *gin.Context) {
	var body testConnectionBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid body", Error: stringPtr(err.Error())})
		return
	}
	cfg, err := fiscal.LoadTaxConfig(h.db)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Load config", Error: stringPtr(err.Error())})
		return
	}
	auth := strings.ToUpper(strings.TrimSpace(body.Authority))
	if auth == "" {
		auth = strings.ToUpper(strings.TrimSpace(cfg.Authority))
	}
	z := fiscal.NewFiscalizerForTestConnection(auth, cfg)
	in := fiscal.FiscalOrderInput{
		OrderID:         uuid.New(),
		OrderNumber:     "TEST-1",
		USIN:            "TEST-USIN-1",
		BuyerName:       "Sandbox Test",
		OccurredAt:      time.Now().UTC(),
		Subtotal:        1.0,
		TaxAmount:       0.0,
		ServiceAmount:   0,
		DeliveryAmount:  0,
		DiscountAmount:  0,
		TotalAmount:     1.0,
		CheckoutIntent:  "cash",
		IsTest:          true,
		Items: []fiscal.FiscalLineItem{{
			Name: "Test item", PctCode: "9801.7000", Quantity: 1, UnitPrice: 1, LineTotal: 1, ValueBeforeTax: 1, AllocatedTax: 0,
		}},
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
	defer cancel()
	res, err := z.Fiscalize(ctx, in)
	if err != nil {
		c.JSON(http.StatusOK, models.APIResponse{Success: true, Data: testConnectionResponse{OK: false, Authority: auth, Error: err.Error()}})
		return
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Data: testConnectionResponse{
		OK:          res.IRN != "" || res.QrCodeValue != "" || res.Status == fiscal.StatusSynced,
		IRN:         res.IRN,
		QrCodeValue: res.QrCodeValue,
		Authority:   res.Authority,
		Raw:         res.RawResponse,
	}})
}

// Audit row for GET /admin/fiscal/audit
type fiscalAuditRow struct {
	OrderID       string     `json:"order_id"`
	OrderNumber   string     `json:"order_number"`
	TotalAmount   float64    `json:"total_amount"`
	TaxAmount     float64    `json:"tax_amount"`
	Authority     string     `json:"authority"`
	Status        string     `json:"status"`
	CompletedAt   *time.Time `json:"completed_at,omitempty"`
}

func (h *FiscalHandler) Audit(c *gin.Context) {
	limit := 50
	rows, err := h.db.Query(`
		SELECT o.id::text, o.order_number, o.total_amount, o.tax_amount,
		       COALESCE(o.fiscal_details->>'authority', ''),
		       COALESCE(o.fiscal_details->>'status', ''),
		       o.completed_at
		FROM orders o
		WHERE o.status = 'completed'
		ORDER BY o.completed_at DESC NULLS LAST, o.created_at DESC
		LIMIT $1
	`, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Query failed", Error: stringPtr(err.Error())})
		return
	}
	defer rows.Close()
	var out []fiscalAuditRow
	for rows.Next() {
		var r fiscalAuditRow
		var comp sql.NullTime
		if err := rows.Scan(&r.OrderID, &r.OrderNumber, &r.TotalAmount, &r.TaxAmount, &r.Authority, &r.Status, &comp); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Scan", Error: stringPtr(err.Error())})
			return
		}
		if comp.Valid {
			t := comp.Time.UTC()
			r.CompletedAt = &t
		}
		out = append(out, r)
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Data: out})
}

func (h *FiscalHandler) Retry(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid id"})
		return
	}
	_, _ = h.db.Exec(`UPDATE orders SET fiscal_details = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, id)
	fiscal.EnqueueFiscalSync(h.db, id)
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Fiscal sync queued"})
}

func (h *FiscalHandler) GetFiscalOrder(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid id"})
		return
	}
	var raw []byte
	var on, tot, tax float64
	err = h.db.QueryRow(`
		SELECT o.order_number, o.total_amount, o.tax_amount, o.fiscal_details
		FROM orders o WHERE o.id = $1
	`, id).Scan(&on, &tot, &tax, &raw)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Order not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Error: stringPtr(err.Error())})
		return
	}
	var fd models.FiscalDetails
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &fd)
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Data: map[string]interface{}{
		"order_id":       id.String(),
		"order_number":   on,
		"total_amount":   tot,
		"tax_amount":     tax,
		"fiscal_details": fd,
	}})
}
