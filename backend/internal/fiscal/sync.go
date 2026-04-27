package fiscal

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"

	"pos-backend/internal/models"
)

// EnqueueFiscalSync runs fiscalization in the background (non-blocking for callers).
func EnqueueFiscalSync(db *sql.DB, orderID uuid.UUID) {
	go runFiscalSync(db, orderID)
}

func runFiscalSync(db *sql.DB, orderID uuid.UUID) {
	var fdJSON sql.NullString
	_ = db.QueryRow(`SELECT fiscal_details::text FROM orders WHERE id = $1`, orderID).Scan(&fdJSON)
	if fdJSON.Valid && fdJSON.String != "" && fdJSON.String != "null" {
		var cur models.FiscalDetails
		if json.Unmarshal([]byte(fdJSON.String), &cur) == nil && cur.Status == StatusSynced && strings.TrimSpace(cur.IRN) != "" {
			return
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()

	cfg, err := LoadTaxConfig(db)
	if err != nil {
		log.Printf("fiscal: load config: %v", err)
		return
	}

	in, err := buildFiscalInput(ctx, db, orderID, cfg)
	if err != nil {
		log.Printf("fiscal: build input %s: %v", orderID, err)
		_ = persistFiscalDetails(db, orderID, models.FiscalDetails{
			Status:    StatusPending,
			Authority: strings.ToUpper(strings.TrimSpace(cfg.Authority)),
			ErrorLog:  strPtr(err.Error()),
		})
		return
	}

	z := NewFiscalizerForAuto(cfg)
	res, err := z.Fiscalize(ctx, in)
	if err != nil {
		now := time.Now().UTC()
		_ = persistFiscalDetails(db, orderID, models.FiscalDetails{
			Status:          StatusPending,
			Authority:       pickAuthority(cfg, in),
			ErrorLog:        strPtr(err.Error()),
			LastSyncAttempt: &now,
		})
		return
	}
	status := res.Status
	if status == "" {
		if res.IRN != "" {
			status = StatusSynced
		} else {
			status = StatusPending
		}
	}
	if res.ErrorMessage != "" && status == StatusSynced {
		status = StatusPending
	}
	now := time.Now().UTC()
	fd := models.FiscalDetails{
		Status:          status,
		IRN:             res.IRN,
		QrCodeValue:     res.QrCodeValue,
		Authority:       res.Authority,
		LastSyncAttempt: &now,
		RawResponse:     trimRaw(res.RawResponse),
	}
	if res.ErrorMessage != "" {
		fd.ErrorLog = strPtr(res.ErrorMessage)
	}
	if err := persistFiscalDetails(db, orderID, fd); err != nil {
		log.Printf("fiscal: persist %s: %v", orderID, err)
	}
}

func pickAuthority(cfg LoadedTaxConfig, _ FiscalOrderInput) string {
	if cfg.UseMockForAutoFiscalize() {
		return AuthorityMock
	}
	return strings.ToUpper(strings.TrimSpace(cfg.Authority))
}

func trimRaw(s string) string {
	if len(s) > 8000 {
		return s[:8000] + "…"
	}
	return s
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func persistFiscalDetails(db *sql.DB, orderID uuid.UUID, fd models.FiscalDetails) error {
	b, err := json.Marshal(fd)
	if err != nil {
		return err
	}
	_, err = db.Exec(`UPDATE orders SET fiscal_details = $1::jsonb, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, string(b), orderID)
	return err
}

func buildFiscalInput(ctx context.Context, db *sql.DB, orderID uuid.UUID, cfg LoadedTaxConfig) (FiscalOrderInput, error) {
	var in FiscalOrderInput
	in.OrderID = orderID
	var buyer sql.NullString
	var checkout sql.NullString
	err := db.QueryRow(`
		SELECT o.order_number, o.customer_name, o.created_at, o.subtotal, o.tax_amount,
		       o.service_charge_amount, o.delivery_fee_amount, o.discount_amount, o.total_amount,
		       o.checkout_payment_method
		FROM orders o WHERE o.id = $1
	`, orderID).Scan(
		&in.OrderNumber, &buyer, &in.OccurredAt,
		&in.Subtotal, &in.TaxAmount, &in.ServiceAmount, &in.DeliveryAmount, &in.DiscountAmount, &in.TotalAmount,
		&checkout,
	)
	if err != nil {
		return in, err
	}
	if buyer.Valid {
		in.BuyerName = strings.TrimSpace(buyer.String)
	}
	if in.BuyerName == "" {
		in.BuyerName = "Walk-in"
	}
	if checkout.Valid {
		in.CheckoutIntent = checkout.String
	}
	idStr := strings.ReplaceAll(orderID.String(), "-", "")
	short := idStr
	if len(short) > 8 {
		short = short[:8]
	}
	in.USIN = fmt.Sprintf("%s-%s", in.OrderNumber, short)

	rows, err := db.QueryContext(ctx, `
		SELECT oi.quantity, oi.unit_price, oi.total_price, p.name, COALESCE(NULLIF(TRIM(p.pct_code), ''), '9801.7000')
		FROM order_items oi
		JOIN products p ON p.id = oi.product_id
		WHERE oi.order_id = $1 AND oi.status != 'voided'
	`, orderID)
	if err != nil {
		return in, err
	}
	defer rows.Close()

	taxPool := in.TaxAmount
	lineCount := 0
	var lines []FiscalLineItem
	for rows.Next() {
		var qty int
		var up, tp float64
		var name, pct string
		if err := rows.Scan(&qty, &up, &tp, &name, &pct); err != nil {
			return in, err
		}
		lineCount++
		lines = append(lines, FiscalLineItem{
			Name:           name,
			PctCode:        pct,
			Quantity:       qty,
			UnitPrice:      up,
			LineTotal:      tp,
			ValueBeforeTax: tp,
		})
	}
	sub := in.Subtotal - in.DiscountAmount
	if sub < 0 {
		sub = 0
	}
	for i := range lines {
		if sub > 0 && taxPool > 0 {
			lines[i].AllocatedTax = taxPool * (lines[i].LineTotal / sub)
		}
		vb := lines[i].LineTotal - lines[i].AllocatedTax
		if vb < 0 {
			vb = 0
		}
		lines[i].ValueBeforeTax = vb
	}
	in.Items = lines
	return in, nil
}