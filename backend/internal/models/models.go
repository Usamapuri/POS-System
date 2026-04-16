package models

import (
	"time"

	"github.com/google/uuid"
)

// User represents a system user/staff member
type User struct {
	ID           uuid.UUID `json:"id"`
	Username     string    `json:"username"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	FirstName    string    `json:"first_name"`
	LastName     string    `json:"last_name"`
	Role         string    `json:"role"` // admin, manager, server, counter, kitchen, store_manager
	ManagerPin   *string   `json:"manager_pin,omitempty"`
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
	IsOccupied      bool      `json:"is_occupied"`
	HasActiveOrder  bool      `json:"has_active_order"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// Order represents a customer order
type Order struct {
	ID             uuid.UUID    `json:"id"`
	OrderNumber    string       `json:"order_number"`
	TableID        *uuid.UUID   `json:"table_id"`
	UserID         *uuid.UUID   `json:"user_id"`
	CustomerName   *string      `json:"customer_name"`
	OrderType      string       `json:"order_type"` // dine_in, takeout, delivery
	Status         string       `json:"status"`     // pending, confirmed, preparing, ready, served, completed, cancelled
	Subtotal             float64  `json:"subtotal"`
	TaxAmount            float64  `json:"tax_amount"`
	DiscountAmount       float64  `json:"discount_amount"`
	ServiceChargeAmount  float64  `json:"service_charge_amount"`
	TotalAmount          float64  `json:"total_amount"`
	CheckoutPaymentMethod *string `json:"checkout_payment_method,omitempty"`
	GuestCount     int          `json:"guest_count"`
	Notes          *string      `json:"notes"`
	CreatedAt      time.Time    `json:"created_at"`
	UpdatedAt      time.Time    `json:"updated_at"`
	ServedAt       *time.Time   `json:"served_at"`
	CompletedAt    *time.Time   `json:"completed_at"`
	Table          *DiningTable `json:"table,omitempty"`
	User           *User        `json:"user,omitempty"`
	Items          []OrderItem  `json:"items,omitempty"`
	Payments       []Payment    `json:"payments,omitempty"`
}

// OrderItem represents an item within an order
type OrderItem struct {
	ID                  uuid.UUID `json:"id"`
	OrderID             uuid.UUID `json:"order_id"`
	ProductID           uuid.UUID `json:"product_id"`
	Quantity            int       `json:"quantity"`
	UnitPrice           float64   `json:"unit_price"`
	TotalPrice          float64   `json:"total_price"`
	SpecialInstructions *string   `json:"special_instructions"`
	Status              string    `json:"status"` // pending, preparing, ready, served
	CreatedAt           time.Time `json:"created_at"`
	UpdatedAt           time.Time `json:"updated_at"`
	Product             *Product  `json:"product,omitempty"`
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
	OrderType         string            `json:"order_type"`
	GuestCount        int               `json:"guest_count"`
	Items             []CreateOrderItem `json:"items"`
	Notes             *string           `json:"notes"`
	AssignedServerID  *uuid.UUID        `json:"assigned_server_id"`
}

// UpdateCheckoutIntentRequest sets displayed totals before payment (cash | card | online).
type UpdateCheckoutIntentRequest struct {
	CheckoutPaymentMethod string `json:"checkout_payment_method" binding:"required,oneof=cash card online"`
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

// LoginRequest represents the login request
type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// LoginResponse represents the login response
type LoginResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
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
