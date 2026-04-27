package fiscal

import (
	"context"
	"time"

	"github.com/google/uuid"
)

const (
	AuthorityFBR  = "FBR"
	AuthorityPRA  = "PRA"
	AuthorityNone = "NONE"
	AuthorityMock = "MOCK"

	StatusSynced  = "SYNCED"
	StatusPending = "PENDING"
	StatusFailed  = "FAILED"
)

// FiscalOrderInput is the normalized payload for fiscalization strategies.
type FiscalOrderInput struct {
	OrderID         uuid.UUID
	OrderNumber     string
	USIN            string
	BuyerName       string
	OccurredAt      time.Time
	Subtotal        float64
	TaxAmount       float64
	ServiceAmount   float64
	DeliveryAmount  float64
	DiscountAmount  float64
	TotalAmount     float64
	CheckoutIntent  string
	Items           []FiscalLineItem
	IsTest          bool
}

// FiscalLineItem is one sale line with PCT code from products.
type FiscalLineItem struct {
	Name           string
	PctCode        string
	Quantity       int
	UnitPrice      float64
	LineTotal      float64
	AllocatedTax   float64 // approximated share of order tax for line
	ValueBeforeTax float64
}

// FiscalResult is returned by strategies; persisted into orders.fiscal_details.
type FiscalResult struct {
	Status       string
	IRN          string
	QrCodeValue  string
	Authority    string
	ErrorMessage string
	RawResponse  string
}

// Fiscalizer is implemented by FBR, PRA, and Mock strategies.
type Fiscalizer interface {
	Fiscalize(ctx context.Context, in FiscalOrderInput) (FiscalResult, error)
}
