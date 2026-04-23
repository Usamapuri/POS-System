package pricing

import (
	"database/sql"
	"encoding/json"
	"math"
)

// Settings holds tax and service rates from app_settings (0–1 fractions).
type Settings struct {
	TaxRateCash         float64 `json:"tax_rate_cash"`
	TaxRateCard         float64 `json:"tax_rate_card"`
	TaxRateOnline       float64 `json:"tax_rate_online"`
	ServiceChargeRate   float64 `json:"service_charge_rate"`
}

// Defaults when keys are missing in DB.
var Defaults = Settings{
	TaxRateCash:       0.15,
	TaxRateCard:       0.05,
	TaxRateOnline:     0.15,
	ServiceChargeRate: 0.10,
}

// LoadSettings reads app_settings keys; falls back to Defaults for missing keys.
func LoadSettings(db *sql.DB) (Settings, error) {
	s := Defaults
	keys := []struct {
		key string
		dst *float64
	}{
		{"tax_rate_cash", &s.TaxRateCash},
		{"tax_rate_card", &s.TaxRateCard},
		{"tax_rate_online", &s.TaxRateOnline},
		{"service_charge_rate", &s.ServiceChargeRate},
	}
	for _, k := range keys {
		var raw []byte
		err := db.QueryRow(`SELECT value FROM app_settings WHERE key = $1`, k.key).Scan(&raw)
		if err != nil {
			continue
		}
		var v float64
		if err := json.Unmarshal(raw, &v); err != nil {
			continue
		}
		*k.dst = v
	}
	return s, nil
}

// TaxRateForCheckoutIntent uses UI bucket: cash | card | online.
func TaxRateForCheckoutIntent(intent string, s Settings) float64 {
	switch intent {
	case "card":
		return s.TaxRateCard
	case "online":
		return s.TaxRateOnline
	default:
		return s.TaxRateCash
	}
}

// TaxRateForPaymentMethod maps persisted payment_method to tax rate.
func TaxRateForPaymentMethod(method string, s Settings) float64 {
	switch method {
	case "credit_card", "debit_card", "digital_wallet":
		return s.TaxRateCard
	case "online":
		return s.TaxRateOnline
	case "cash":
		return s.TaxRateCash
	default:
		return s.TaxRateCash
	}
}

// CheckoutIntentFromPaymentMethod maps DB payment to UI intent for stored checkout_payment_method.
func CheckoutIntentFromPaymentMethod(method string) string {
	switch method {
	case "credit_card", "debit_card", "digital_wallet":
		return "card"
	case "online":
		return "online"
	default:
		return "cash"
	}
}

// ComputeTotals applies the global service rate and no delivery fee (backward-compatible).
func ComputeTotals(subtotal, discount float64, checkoutIntent string, s Settings) (taxable, serviceCharge, tax, total float64) {
	return ComputeTotalsEx(subtotal, discount, checkoutIntent, s, s.ServiceChargeRate, 0)
}

// ComputeTotalsEx: service on taxable F&B; tax on same taxable; delivery fee is a flat add-on (not in tax base).
func ComputeTotalsEx(subtotal, discount float64, checkoutIntent string, s Settings, serviceChargeRate, deliveryFee float64) (taxable, serviceCharge, tax, total float64) {
	taxable = subtotal - discount
	if taxable < 0 {
		taxable = 0
	}
	serviceCharge = roundMoney(taxable * serviceChargeRate)
	tr := TaxRateForCheckoutIntent(checkoutIntent, s)
	tax = roundMoney(taxable * tr)
	if deliveryFee < 0 {
		deliveryFee = 0
	}
	deliveryFee = roundMoney(deliveryFee)
	total = roundMoney(taxable + serviceCharge + tax + deliveryFee)
	return
}

// ComputeTotalsFromPaymentMethod uses the global service rate and no delivery fee.
func ComputeTotalsFromPaymentMethod(subtotal, discount float64, paymentMethod string, s Settings) (taxable, serviceCharge, tax, total float64) {
	return ComputeTotalsFromPaymentMethodEx(subtotal, discount, paymentMethod, s, s.ServiceChargeRate, 0)
}

// ComputeTotalsFromPaymentMethodEx uses the payment method for the tax rate; service and delivery as passed.
func ComputeTotalsFromPaymentMethodEx(subtotal, discount float64, paymentMethod string, s Settings, serviceChargeRate, deliveryFee float64) (taxable, serviceCharge, tax, total float64) {
	taxable = subtotal - discount
	if taxable < 0 {
		taxable = 0
	}
	serviceCharge = roundMoney(taxable * serviceChargeRate)
	tr := TaxRateForPaymentMethod(paymentMethod, s)
	tax = roundMoney(taxable * tr)
	if deliveryFee < 0 {
		deliveryFee = 0
	}
	deliveryFee = roundMoney(deliveryFee)
	total = roundMoney(taxable + serviceCharge + tax + deliveryFee)
	return
}

func roundMoney(v float64) float64 {
	return math.Round(v*100) / 100
}
