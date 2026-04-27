package models

import (
	"time"

	"github.com/google/uuid"
)

// FiscalDetails is persisted in orders.fiscal_details (JSONB) for FBR/PRA sync state.
type FiscalDetails struct {
	Status          string     `json:"status"` // SYNCED | PENDING | FAILED
	IRN             string     `json:"irn,omitempty"`
	QrCodeValue     string     `json:"qr_code_value,omitempty"`
	LastSyncAttempt *time.Time `json:"last_sync_attempt,omitempty"`
	ErrorLog        *string    `json:"error_log,omitempty"`
	Authority       string     `json:"authority,omitempty"` // FBR | PRA | MOCK | NONE
	RawResponse     string     `json:"raw_response,omitempty"`
}

// User represents a system user/staff member
type User struct {
	ID           uuid.UUID `json:"id"`
	Username     string    `json:"username"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	FirstName    string    `json:"first_name"`
	LastName     string    `json:"last_name"`
	Role         string    `json:"role"` // admin, manager, inventory_manager, counter, kitchen
	ManagerPin   *string   `json:"manager_pin,omitempty"`
	ProfileImageURL *string `json:"profile_image_url,omitempty"`
	IsActive     bool      `json:"is_active"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// Category represents a product category
type Category struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Description *string   `json:"description"`
	Color       *string   `json:"color"`
	SortOrder   int       `json:"sort_order"`
	IsActive    bool      `json:"is_active"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
	// Populated when joined with category_station_map (one station per category in UI)
	KitchenStationID     *uuid.UUID `json:"kitchen_station_id,omitempty"`
	KitchenStationName   *string    `json:"kitchen_station_name,omitempty"`
	KitchenStationOutput *string    `json:"kitchen_station_output_type,omitempty"`
}

// Product represents a menu item/product
type Product struct {
	ID              uuid.UUID  `json:"id"`
	CategoryID      *uuid.UUID `json:"category_id"`
	Name            string     `json:"name"`
	Description     *string    `json:"description"`
	Price           float64    `json:"price"`
	ImageURL        *string    `json:"image_url"`
	Barcode         *string    `json:"barcode"`
	SKU             *string    `json:"sku"`
	IsAvailable     bool       `json:"is_available"`
	PreparationTime int        `json:"preparation_time"` // in minutes
	SortOrder       int        `json:"sort_order"`
	PctCode         string     `json:"pct_code"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
	Category        *Category  `json:"category,omitempty"`
}

// DiningTable represents a table or dining area
type DiningTable struct {
	ID              uuid.UUID `json:"id"`
	TableNumber     string    `json:"table_number"`
	SeatingCapacity int       `json:"seating_capacity"`
	Location        *string   `json:"location"`
	Zone            *string   `json:"zone,omitempty"`
	IsOccupied      bool      `json:"is_occupied"`
	HasActiveOrder  bool      `json:"has_active_order"`
	MapX            *float64  `json:"map_x,omitempty"`
	MapY            *float64  `json:"map_y,omitempty"`
	MapW            *float64  `json:"map_w,omitempty"`
	MapH            *float64  `json:"map_h,omitempty"`
	MapRotation     *int      `json:"map_rotation,omitempty"`
	Shape           *string   `json:"shape,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
	// LastBookedAt is the latest order created_at for this table (non-cancelled orders only); computed in API, not stored.
	LastBookedAt *time.Time `json:"last_booked_at,omitempty"`
}

// Order represents a customer order
type Order struct {
	ID             uuid.UUID    `json:"id"`
	OrderNumber    string       `json:"order_number"`
	TableID        *uuid.UUID   `json:"table_id"`
	UserID         *uuid.UUID   `json:"user_id"`
	CustomerID     *uuid.UUID   `json:"customer_id,omitempty"`
	CustomerName   *string      `json:"customer_name"`
	CustomerEmail  *string      `json:"customer_email,omitempty"`
	CustomerPhone  *string      `json:"customer_phone,omitempty"`
	GuestBirthday  *string      `json:"guest_birthday,omitempty"` // YYYY-MM-DD
	TableOpenedAt  *time.Time   `json:"table_opened_at,omitempty"`
	IsOpenTab      bool         `json:"is_open_tab"`
	OrderType      string       `json:"order_type"` // dine_in, takeout, delivery
	// Status: one of pending | confirmed | preparing | ready | served | completed | cancelled.
	// See OrderStatus* constants above.
	Status         string       `json:"status"`
	Subtotal             float64  `json:"subtotal"`
	TaxAmount            float64  `json:"tax_amount"`
	DiscountAmount       float64  `json:"discount_amount"`
	// DiscountPercent is NULL when the discount was entered as a flat amount
	// (or there is no discount); 0-100 when entered as a percentage of
	// Subtotal. Frontends use this to render "Discount (10%)" on receipts.
	DiscountPercent      *float64 `json:"discount_percent,omitempty"`
	ServiceChargeAmount  float64  `json:"service_charge_amount"`
	DeliveryFeeAmount    float64  `json:"delivery_fee_amount"`
	TotalAmount          float64  `json:"total_amount"`
	CheckoutPaymentMethod *string `json:"checkout_payment_method,omitempty"`
	GuestCount     int          `json:"guest_count"`
	Notes          *string      `json:"notes"`
	CreatedAt      time.Time    `json:"created_at"`
	UpdatedAt      time.Time    `json:"updated_at"`
	ServedAt       *time.Time   `json:"served_at"`
	CompletedAt    *time.Time   `json:"completed_at"`
	// PRA tax invoice metadata — set only when a second PRA slip is printed.
	PraInvoicePrinted   bool       `json:"pra_invoice_printed"`
	PraInvoiceNumber    *string    `json:"pra_invoice_number,omitempty"`
	PraInvoicePrintedAt *time.Time `json:"pra_invoice_printed_at,omitempty"`
	// FBR/PRA fiscal sync (JSONB) — not loaded on all list queries; use detail endpoints when needed.
	FiscalDetails *FiscalDetails `json:"fiscal_details,omitempty"`
	Table          *DiningTable   `json:"table,omitempty"`
	User           *User        `json:"user,omitempty"`
	Items          []OrderItem  `json:"items,omitempty"`
	Payments       []Payment    `json:"payments,omitempty"`
}

// Customer is a CRM guest record linked from orders.
type Customer struct {
	ID          uuid.UUID  `json:"id"`
	Email       *string    `json:"email,omitempty"`
	Phone       *string    `json:"phone,omitempty"`
	DisplayName *string    `json:"display_name,omitempty"`
	Birthday    *string    `json:"birthday,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	VisitCount  int        `json:"visit_count,omitempty"`
	LastVisitAt *time.Time `json:"last_visit_at,omitempty"`
}

// Order status ladder — mirror of the DB CHECK constraint. Use these when
// comparing/writing the field so a typo becomes a compile error.
const (
	OrderStatusPending    = "pending"
	OrderStatusConfirmed  = "confirmed"
	OrderStatusPreparing  = "preparing"
	OrderStatusReady      = "ready"
	OrderStatusServed     = "served"
	OrderStatusCompleted  = "completed"
	OrderStatusCancelled  = "cancelled"
)

// OrderItem status ladder — includes KDS/KOT flow states in addition to the
// simpler order ladder:
//   draft      → line added to an open tab/order, not yet fired
//   pending    → created as part of a non–dine-in order, not yet fired
//   sent       → fired to a KDS station, waiting for the cook
//   preparing  → legacy; current KDS flows use sent → ready
//   ready      → prepared (or printed to a printer station, which is instantly ready)
//   served     → picked up / handed off to the guest
//   voided     → removed after fire; requires manager PIN
const (
	OrderItemStatusDraft     = "draft"
	OrderItemStatusPending   = "pending"
	OrderItemStatusSent      = "sent"
	OrderItemStatusPreparing = "preparing"
	OrderItemStatusReady     = "ready"
	OrderItemStatusServed    = "served"
	OrderItemStatusVoided    = "voided"
)

// OrderItem represents an item within an order.
type OrderItem struct {
	ID                  uuid.UUID  `json:"id"`
	OrderID             uuid.UUID  `json:"order_id"`
	ProductID           uuid.UUID  `json:"product_id"`
	Quantity            int        `json:"quantity"`
	UnitPrice           float64    `json:"unit_price"`
	TotalPrice          float64    `json:"total_price"`
	SpecialInstructions *string    `json:"special_instructions"`
	// Status: one of draft | pending | sent | preparing | ready | served | voided.
	// See OrderItemStatus* constants above for full meaning and lifecycle.
	Status              string     `json:"status"`
	// PreparedAt / PreparedBy are set when a KDS station marks the line ready.
	// Null for printer stations and for lines that are still in progress.
	PreparedAt          *time.Time `json:"prepared_at,omitempty"`
	PreparedBy          *uuid.UUID `json:"prepared_by,omitempty"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`
	Product             *Product   `json:"product,omitempty"`
}

// Payment represents a payment transaction
type Payment struct {
	ID              uuid.UUID  `json:"id"`
	OrderID         uuid.UUID  `json:"order_id"`
	PaymentMethod   string     `json:"payment_method"` // cash, credit_card, debit_card, digital_wallet
	Amount          float64    `json:"amount"`
	ReferenceNumber *string    `json:"reference_number"`
	Status          string     `json:"status"` // pending, completed, failed, refunded
	ProcessedBy     *uuid.UUID `json:"processed_by"`
	ProcessedAt     *time.Time `json:"processed_at"`
	CreatedAt       time.Time  `json:"created_at"`
	ProcessedByUser *User      `json:"processed_by_user,omitempty"`
}

// StockCategory represents a store inventory category (produce, cleaning, etc.)
type StockCategory struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Description *string   `json:"description"`
	SortOrder   int       `json:"sort_order"`
	IsActive    bool      `json:"is_active"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
	ItemCount   int       `json:"item_count,omitempty"`
}

// StockItem represents an individual store inventory item
type StockItem struct {
	ID              uuid.UUID      `json:"id"`
	CategoryID      *uuid.UUID     `json:"category_id"`
	Name            string         `json:"name"`
	Unit            string         `json:"unit"`
	QuantityOnHand  float64        `json:"quantity_on_hand"`
	ReorderLevel    float64        `json:"reorder_level"`
	DefaultUnitCost *float64       `json:"default_unit_cost"`
	Notes           *string        `json:"notes"`
	IsActive        bool           `json:"is_active"`
	CreatedAt       time.Time      `json:"created_at"`
	UpdatedAt       time.Time      `json:"updated_at"`
	Category        *StockCategory `json:"category,omitempty"`
	EarliestExpiry  *string        `json:"earliest_expiry,omitempty"` // YYYY-MM-DD from open lots
}

// PurchaseOrderLineDetail is one line on a purchase order (API response).
type PurchaseOrderLineDetail struct {
	ID               string   `json:"id"`
	StockItemID      string   `json:"stock_item_id"`
	ItemName         string   `json:"item_name"`
	Unit             string   `json:"unit"`
	QuantityOrdered  float64  `json:"quantity_ordered"`
	UnitCost         *float64 `json:"unit_cost,omitempty"`
	QuantityReceived float64  `json:"quantity_received"`
}

// PurchaseOrderDetail is the GET /store/purchase-orders/:id payload.
type PurchaseOrderDetail struct {
	ID            string                    `json:"id"`
	Status        string                    `json:"status"`
	SupplierID    string                    `json:"supplier_id"`
	SupplierName  string                    `json:"supplier_name"`
	ExpectedDate  *string                   `json:"expected_date,omitempty"`
	Notes         *string                   `json:"notes,omitempty"`
	CreatedAt     time.Time                 `json:"created_at"`
	Lines         []PurchaseOrderLineDetail `json:"lines"`
}

// StockMovement represents a purchase, issue, or adjustment
type StockMovement struct {
	ID              uuid.UUID  `json:"id"`
	StockItemID     uuid.UUID  `json:"stock_item_id"`
	MovementType    string     `json:"movement_type"` // purchase, issue, adjustment
	Quantity        float64    `json:"quantity"`
	UnitCost        *float64   `json:"unit_cost"`
	TotalCost       *float64   `json:"total_cost"`
	IssuedToUserID  *uuid.UUID `json:"issued_to_user_id"`
	CreatedBy       *uuid.UUID `json:"created_by"`
	Note            *string    `json:"note"`
	CreatedAt       time.Time  `json:"created_at"`
	StockItem       *StockItem `json:"stock_item,omitempty"`
	IssuedToUser    *User      `json:"issued_to_user,omitempty"`
	CreatedByUser   *User      `json:"created_by_user,omitempty"`
}

// Inventory represents product inventory (legacy menu-stock stub)
type Inventory struct {
	ID              uuid.UUID  `json:"id"`
	ProductID       uuid.UUID  `json:"product_id"`
	CurrentStock    int        `json:"current_stock"`
	MinimumStock    int        `json:"minimum_stock"`
	MaximumStock    int        `json:"maximum_stock"`
	UnitCost        *float64   `json:"unit_cost"`
	LastRestockedAt *time.Time `json:"last_restocked_at"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
	Product         *Product   `json:"product,omitempty"`
}

// OrderStatusHistory tracks order status changes
type OrderStatusHistory struct {
	ID             uuid.UUID  `json:"id"`
	OrderID        uuid.UUID  `json:"order_id"`
	PreviousStatus *string    `json:"previous_status"`
	NewStatus      string     `json:"new_status"`
	ChangedBy      *uuid.UUID `json:"changed_by"`
	Notes          *string    `json:"notes"`
	CreatedAt      time.Time  `json:"created_at"`
	ChangedByUser  *User      `json:"changed_by_user,omitempty"`
}

// Expense represents a cash outflow record
type Expense struct {
	ID            uuid.UUID  `json:"id"`
	Category      string     `json:"category"`
	Amount        float64    `json:"amount"`
	Description   *string    `json:"description"`
	ReferenceType *string    `json:"reference_type"`
	ReferenceID   *uuid.UUID `json:"reference_id"`
	ExpenseDate   string     `json:"expense_date"`
	RecordedAt    time.Time  `json:"recorded_at"`
	CreatedBy     *uuid.UUID `json:"created_by"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
	CreatedByName *string    `json:"created_by_name,omitempty"`
}

// DailyClosing represents an end-of-day reconciliation snapshot
type DailyClosing struct {
	ID             uuid.UUID  `json:"id"`
	ClosingDate    string     `json:"closing_date"`
	TotalSales     float64    `json:"total_sales"`
	TotalTax       float64    `json:"total_tax"`
	TotalOrders    int        `json:"total_orders"`
	CashSales      float64    `json:"cash_sales"`
	CardSales      float64    `json:"card_sales"`
	DigitalSales   float64    `json:"digital_sales"`
	TotalExpenses  float64    `json:"total_expenses"`
	NetProfit      float64    `json:"net_profit"`
	OpeningCash    float64    `json:"opening_cash"`
	ExpectedCash   float64    `json:"expected_cash"`
	ActualCash     *float64   `json:"actual_cash"`
	CashDifference *float64   `json:"cash_difference"`
	Notes          *string    `json:"notes"`
	ClosedBy       *uuid.UUID `json:"closed_by"`
	CreatedAt      time.Time  `json:"created_at"`
	ClosedByName   *string    `json:"closed_by_name,omitempty"`
}

// KitchenStation represents a KOT routing destination
type KitchenStation struct {
	ID             uuid.UUID   `json:"id"`
	Name           string      `json:"name"`
	OutputType     string      `json:"output_type"` // kds, printer
	PrintLocation  string      `json:"print_location"` // kitchen | counter (thermal slip routing)
	IsActive       bool        `json:"is_active"`
	SortOrder      int         `json:"sort_order"`
	CreatedAt      time.Time   `json:"created_at"`
	Categories     []uuid.UUID `json:"category_ids,omitempty"`
}

// VoidLogEntry represents an audit record for voided items
type VoidLogEntry struct {
	ID             uuid.UUID  `json:"id"`
	OrderID        *uuid.UUID `json:"order_id"`
	OrderItemID    *uuid.UUID `json:"order_item_id"`
	VoidedBy       *uuid.UUID `json:"voided_by"`
	AuthorizedBy   *uuid.UUID `json:"authorized_by"`
	ItemName       string     `json:"item_name"`
	Quantity       int        `json:"quantity"`
	UnitPrice      float64    `json:"unit_price"`
	Reason         *string    `json:"reason"`
	CreatedAt      time.Time  `json:"created_at"`
	OrderNumber    *string    `json:"order_number,omitempty"`
	VoidedByName   *string    `json:"voided_by_name,omitempty"`
	AuthorizedName *string    `json:"authorized_name,omitempty"`
}

// Request/Response DTOs

// CreateOrderRequest represents the request to create a new order
type CreateOrderRequest struct {
	TableID           *uuid.UUID        `json:"table_id"`
	CustomerName      *string           `json:"customer_name"`
	CustomerEmail     *string           `json:"customer_email"`
	CustomerPhone     *string           `json:"customer_phone"`
	GuestBirthday     *string           `json:"guest_birthday"` // YYYY-MM-DD
	OrderType         string            `json:"order_type"`
	GuestCount        int               `json:"guest_count"`
	Items             []CreateOrderItem `json:"items"`
	Notes             *string           `json:"notes"`
	AssignedServerID  *uuid.UUID        `json:"assigned_server_id"`
}

// OpenCounterTableTabRequest opens a dine-in tab from the counter (order number + empty cart).
type OpenCounterTableTabRequest struct {
	TableID          uuid.UUID  `json:"table_id" binding:"required"`
	GuestCount       *int       `json:"guest_count"`            // optional; default 0; editable later on the rail
	AssignedServerID *uuid.UUID `json:"assigned_server_id"`     // optional; order.user_id NULL until set
	CustomerName     *string    `json:"customer_name"`
	CustomerEmail    *string    `json:"customer_email"`
	CustomerPhone    *string    `json:"customer_phone"`
	GuestBirthday    *string    `json:"guest_birthday"` // YYYY-MM-DD
}

// UpdateCounterOrderServiceRequest sets party size and assigned server on an open dine-in order (counter).
type UpdateCounterOrderServiceRequest struct {
	GuestCount       int    `json:"guest_count" binding:"gte=0"`
	AssignedServerID string `json:"assigned_server_id"` // empty string clears assigned server (user_id NULL)
}

// ReassignCounterTableRequest moves an active dine-in order to a different table.
type ReassignCounterTableRequest struct {
	TableID uuid.UUID `json:"table_id" binding:"required"`
	Notes   *string   `json:"notes"`
}

// UpdateCheckoutIntentRequest sets displayed totals before payment (cash | card | online).
type UpdateCheckoutIntentRequest struct {
	CheckoutPaymentMethod string `json:"checkout_payment_method" binding:"required,oneof=cash card online"`
}

// UpdateCounterOrderGuestRequest updates optional guest / CRM fields on an open order (counter).
type UpdateCounterOrderGuestRequest struct {
	CustomerName  *string `json:"customer_name"`
	CustomerEmail *string `json:"customer_email"`
	CustomerPhone *string `json:"customer_phone"`
	GuestBirthday *string `json:"guest_birthday"` // YYYY-MM-DD or empty to clear
}

// ApplyOrderDiscountRequest sets order discount at checkout (counter). Use discount_amount, or discount_percent (0–100) to derive amount from subtotal.
type ApplyOrderDiscountRequest struct {
	DiscountAmount  float64  `json:"discount_amount"`
	DiscountPercent *float64 `json:"discount_percent,omitempty"`
}

// CreateOrderItem represents an item in the order creation request
type CreateOrderItem struct {
	ProductID           uuid.UUID `json:"product_id"`
	Quantity            int       `json:"quantity"`
	SpecialInstructions *string   `json:"special_instructions"`
}

// UpdateOrderStatusRequest represents the request to update order status
type UpdateOrderStatusRequest struct {
	Status string  `json:"status"`
	Notes  *string `json:"notes"`
}

// ProcessPaymentRequest represents the request to process a payment
type ProcessPaymentRequest struct {
	PaymentMethod   string  `json:"payment_method"`
	Amount          float64 `json:"amount"`
	ReferenceNumber *string `json:"reference_number"`
}

// LoginRequest represents the login request. Username holds either the
// staff username or their email address; the backend matches both.
type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// LoginResponse represents the login response
type LoginResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

// ForgotPasswordRequest initiates a password reset. `Email` is matched
// case-insensitively against users.email. The response is always 200 with a
// generic message — never leak whether an email is registered.
type ForgotPasswordRequest struct {
	Email string `json:"email"`
}

// ResetPasswordRequest completes a password reset using the one-time token
// delivered by email. NewPassword must be at least 8 characters; enforcement
// lives in the handler so we can emit a consistent error code.
type ResetPasswordRequest struct {
	Token       string `json:"token"`
	NewPassword string `json:"new_password"`
}

// ChangePasswordRequest is used by an already-authenticated user to rotate
// their own password. CurrentPassword protects against session-hijack scenarios
// where an attacker has an active JWT but not the actual password.
type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

// APIResponse represents a generic API response
type APIResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
	Error   *string     `json:"error,omitempty"`
}

// PaginatedResponse represents a paginated API response
type PaginatedResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message"`
	Data    interface{} `json:"data"`
	Meta    MetaData    `json:"meta"`
}

// MetaData represents pagination metadata
type MetaData struct {
	CurrentPage int `json:"current_page"`
	PerPage     int `json:"per_page"`
	Total       int `json:"total"`
	TotalPages  int `json:"total_pages"`
}

// ───────────────────────────────────────────────────────────────────────────
// Reports v2 — payload types shared with the frontend.
// All money is currency-major units (e.g. PKR), all timestamps are UTC, and
// all *_label fields are pre-formatted DD-MM-YYYY for direct rendering.
// ───────────────────────────────────────────────────────────────────────────

// MetricPair captures a current value plus the comparable value from the
// previous equal-length window. Pct is `nil` when the previous value is zero
// (avoids divide-by-zero and lets the UI render "—" instead of "+∞%").
type MetricPair struct {
	Current  float64  `json:"current"`
	Previous float64  `json:"previous"`
	Delta    float64  `json:"delta"`
	Pct      *float64 `json:"pct,omitempty"`
}

// IntMetricPair is the integer-valued counterpart of MetricPair (orders, covers).
type IntMetricPair struct {
	Current  int      `json:"current"`
	Previous int      `json:"previous"`
	Delta    int      `json:"delta"`
	Pct      *float64 `json:"pct,omitempty"`
}

// TenderMixRow is one slice of the payment-method donut.
type TenderMixRow struct {
	Method string  `json:"method"`
	Amount float64 `json:"amount"`
	Count  int     `json:"count"`
	Pct    float64 `json:"pct"`
}

// OverviewReport powers the top KPI tiles + tender-mix donut on the Reports
// dashboard. All metrics include a previous-period comparison.
type OverviewReport struct {
	From            string         `json:"from"`              // ISO YYYY-MM-DD
	To              string         `json:"to"`                // ISO YYYY-MM-DD
	FromLabel       string         `json:"from_label"`        // DD-MM-YYYY
	ToLabel         string         `json:"to_label"`          // DD-MM-YYYY
	PreviousFrom    string         `json:"previous_from"`     // ISO YYYY-MM-DD
	PreviousTo      string         `json:"previous_to"`       // ISO YYYY-MM-DD
	PreviousFromLbl string         `json:"previous_from_label"`
	PreviousToLbl   string         `json:"previous_to_label"`
	Timezone        string         `json:"timezone"`
	GrossSales      MetricPair     `json:"gross_sales"`
	Discounts       MetricPair     `json:"discounts"`
	NetSales        MetricPair     `json:"net_sales"`
	Tax             MetricPair     `json:"tax"`
	ServiceCharge   MetricPair     `json:"service_charge"`
	Orders          IntMetricPair  `json:"orders"`
	Covers          IntMetricPair  `json:"covers"`
	AverageCheck    MetricPair     `json:"average_check"`
	TenderMix       []TenderMixRow `json:"tender_mix"`
}

// DailySalesRow is one row of the day-by-day sales table.
type DailySalesRow struct {
	Date      string  `json:"date"`       // ISO YYYY-MM-DD
	DateLabel string  `json:"date_label"` // DD-MM-YYYY
	Orders    int     `json:"orders"`
	Covers    int     `json:"covers"`
	Gross     float64 `json:"gross"`
	Discounts float64 `json:"discounts"`
	Net       float64 `json:"net"`
	Tax       float64 `json:"tax"`
}

// HourlySeriesPoint is one hour bucket on the hourly time series.
type HourlySeriesPoint struct {
	HourStart      string  `json:"hour_start"`       // ISO timestamp
	HourStartLabel string  `json:"hour_start_label"` // DD-MM-YYYY HH:mm
	Orders         int     `json:"orders"`
	Net            float64 `json:"net"`
}

// HourlyHeatmapCell is one cell of the day-of-week × hour-of-day heatmap.
// Dow runs 0..6 (0 = Sunday, 6 = Saturday), Hour runs 0..23.
type HourlyHeatmapCell struct {
	Dow    int     `json:"dow"`
	Hour   int     `json:"hour"`
	Orders int     `json:"orders"`
	Net    float64 `json:"net"`
}

// HourlySalesReport carries both shapes the UI needs.
type HourlySalesReport struct {
	Series  []HourlySeriesPoint `json:"series"`
	Heatmap []HourlyHeatmapCell `json:"heatmap"`
}

// ItemSalesRow is one row of the item-wise sales table.
type ItemSalesRow struct {
	ProductID     uuid.UUID `json:"product_id"`
	Name          string    `json:"name"`
	Category      *string   `json:"category,omitempty"`
	QtySold       int       `json:"qty_sold"`
	Gross         float64   `json:"gross"`
	Net           float64   `json:"net"`
	OrdersCount   int       `json:"orders_count"`
	PercentOfNet  float64   `json:"percent_of_net"`
	AvgUnitPrice  float64   `json:"avg_unit_price"`
}

// TableSalesRow is one row of the per-table summary.
type TableSalesRow struct {
	TableID            *uuid.UUID `json:"table_id"`
	TableNumber        string     `json:"table_number"`
	Location           *string    `json:"location,omitempty"`
	Zone               *string    `json:"zone,omitempty"`
	SeatingCapacity    *int       `json:"seating_capacity,omitempty"`
	Parties            int        `json:"parties"`
	Covers             int        `json:"covers"`
	NetSales           float64    `json:"net_sales"`
	AvgCheck           float64    `json:"avg_check"`
	AvgCoversPerParty  float64    `json:"avg_covers_per_party"`
	RevenuePerCover    float64    `json:"revenue_per_cover"`
}

// PartySizeRow is one bucket of the party-size breakdown.
type PartySizeRow struct {
	Bucket          string  `json:"bucket"`
	MinSize         int     `json:"min_size"`
	MaxSize         int     `json:"max_size"` // 0 means "no upper bound"
	Parties         int     `json:"parties"`
	Covers          int     `json:"covers"`
	NetSales        float64 `json:"net_sales"`
	AvgCheck        float64 `json:"avg_check"`
	RevenuePerCover float64 `json:"revenue_per_cover"`
}

// OrdersBrowserRow is one row of the day-scoped Orders Browser tab. Fields
// are intentionally lightweight — the UI fetches the full Order on demand
// before printing a PRA invoice.
type OrdersBrowserRow struct {
	ID                            uuid.UUID  `json:"id"`
	OrderNumber                   string     `json:"order_number"`
	TableNumber                   *string    `json:"table_number,omitempty"`
	ServerName                    *string    `json:"server_name,omitempty"`
	CustomerName                  *string    `json:"customer_name,omitempty"`
	GuestCount                    int        `json:"guest_count"`
	TotalAmount                   float64    `json:"total_amount"`
	CheckoutPaymentMethod         *string    `json:"checkout_payment_method,omitempty"`
	Status                        string     `json:"status"`
	CreatedAt                     time.Time  `json:"created_at"`
	CreatedAtLabel                string     `json:"created_at_label"` // DD-MM-YYYY HH:mm
	CompletedAt                   *time.Time `json:"completed_at,omitempty"`
	CompletedAtLabel              *string    `json:"completed_at_label,omitempty"`
	PraInvoicePrinted             bool       `json:"pra_invoice_printed"`
	PraInvoiceNumber              *string    `json:"pra_invoice_number,omitempty"`
	PraInvoicePrintedAt           *time.Time `json:"pra_invoice_printed_at,omitempty"`
	PraInvoicePrintedAtLabel      *string    `json:"pra_invoice_printed_at_label,omitempty"`
	PraInvoiceReprintCount        int        `json:"pra_invoice_reprint_count"`
	PraInvoiceLastReprintedAt     *time.Time `json:"pra_invoice_last_reprinted_at,omitempty"`
	PraInvoiceLastReprintedByName *string    `json:"pra_invoice_last_reprinted_by_name,omitempty"`
	PraLateWindowExpiresAt        *time.Time `json:"pra_late_window_expires_at,omitempty"`
	PraLateWindowSecondsRemaining *int64     `json:"pra_late_window_seconds_remaining,omitempty"`
	CanPrintPra                   bool       `json:"can_print_pra"`
	CanPrintPraReason             *string    `json:"can_print_pra_reason,omitempty"`
}
