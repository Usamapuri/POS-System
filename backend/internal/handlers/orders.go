package handlers

import (
	"database/sql"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"pos-backend/internal/middleware"
	"pos-backend/internal/models"
	"pos-backend/internal/pricing"
	"pos-backend/internal/realtime"
	"pos-backend/internal/util"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type OrderHandler struct {
	db *sql.DB
}

func NewOrderHandler(db *sql.DB) *OrderHandler {
	return &OrderHandler{db: db}
}

// GetOrders retrieves all orders with pagination and filtering
func (h *OrderHandler) GetOrders(c *gin.Context) {
	// Parse query parameters
	page := 1
	perPage := 20
	status := c.Query("status")
	orderType := c.Query("order_type")

	if pageStr := c.Query("page"); pageStr != "" {
		if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
			page = p
		}
	}

	if perPageStr := c.Query("per_page"); perPageStr != "" {
		if pp, err := strconv.Atoi(perPageStr); err == nil && pp > 0 && pp <= 100 {
			perPage = pp
		}
	}

	offset := (page - 1) * perPage

	// Build query with filters
	queryBuilder := `
		SELECT DISTINCT o.id, o.order_number, o.table_id, o.user_id, o.customer_id::text, o.customer_name,
		       o.customer_email, o.customer_phone, o.guest_birthday, o.table_opened_at, COALESCE(o.is_open_tab, false),
		       o.order_type, o.status, o.subtotal, o.tax_amount, o.discount_amount, o.discount_percent,
		       o.service_charge_amount, o.total_amount, o.checkout_payment_method, o.guest_count, o.notes, o.created_at, o.updated_at, o.served_at, o.completed_at,
		       COALESCE(o.pra_invoice_printed, false), o.pra_invoice_number, o.pra_invoice_printed_at,
		       t.table_number, t.location,
		       u.username, u.first_name, u.last_name
		FROM orders o
		LEFT JOIN dining_tables t ON o.table_id = t.id
		LEFT JOIN users u ON o.user_id = u.id
		WHERE 1=1
	`

	var args []interface{}
	argIndex := 0

	if status != "" {
		argIndex++
		queryBuilder += fmt.Sprintf(" AND o.status = $%d", argIndex)
		args = append(args, status)
	}

	if orderType != "" {
		argIndex++
		queryBuilder += fmt.Sprintf(" AND o.order_type = $%d", argIndex)
		args = append(args, orderType)
	}

	dateFrom := strings.TrimSpace(c.Query("date_from"))
	dateTo := strings.TrimSpace(c.Query("date_to"))
	if dateFrom != "" {
		argIndex++
		queryBuilder += fmt.Sprintf(" AND o.created_at::date >= $%d::date", argIndex)
		args = append(args, dateFrom)
	}
	if dateTo != "" {
		argIndex++
		queryBuilder += fmt.Sprintf(" AND o.created_at::date <= $%d::date", argIndex)
		args = append(args, dateTo)
	}

	// Count total records
	countQuery := "SELECT COUNT(*) FROM (" + queryBuilder + ") as count_query"
	var total int
	if err := h.db.QueryRow(countQuery, args...).Scan(&total); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to count orders",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	// Add ordering and pagination
	argIndex++
	queryBuilder += fmt.Sprintf(" ORDER BY o.created_at DESC LIMIT $%d", argIndex)
	args = append(args, perPage)
	
	argIndex++
	queryBuilder += fmt.Sprintf(" OFFSET $%d", argIndex)
	args = append(args, offset)

	rows, err := h.db.Query(queryBuilder, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to fetch orders",
			Error:   stringPtr(err.Error()),
		})
		return
	}
	defer rows.Close()

	var orders []models.Order
	for rows.Next() {
		var order models.Order
		var tableNumber, tableLocation sql.NullString
		var username, firstName, lastName sql.NullString
		var checkoutMethod sql.NullString
		var custIDns, custEmail, custPhone sql.NullString
		var guestBD sql.NullTime
		var tableOpened sql.NullTime
		var discountPct sql.NullFloat64
		var praInvoiceNumber sql.NullString
		var praInvoicePrintedAt sql.NullTime

		err := rows.Scan(
			&order.ID, &order.OrderNumber, &order.TableID, &order.UserID, &custIDns, &order.CustomerName,
			&custEmail, &custPhone, &guestBD, &tableOpened, &order.IsOpenTab,
			&order.OrderType, &order.Status, &order.Subtotal, &order.TaxAmount, &order.DiscountAmount, &discountPct,
			&order.ServiceChargeAmount, &order.TotalAmount, &checkoutMethod, &order.GuestCount, &order.Notes, &order.CreatedAt, &order.UpdatedAt, &order.ServedAt, &order.CompletedAt,
			&order.PraInvoicePrinted, &praInvoiceNumber, &praInvoicePrintedAt,
			&tableNumber, &tableLocation,
			&username, &firstName, &lastName,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{
				Success: false,
				Message: "Failed to scan order",
				Error:   stringPtr(err.Error()),
			})
			return
		}
		if checkoutMethod.Valid {
			s := checkoutMethod.String
			order.CheckoutPaymentMethod = &s
		}
		if discountPct.Valid {
			v := discountPct.Float64
			order.DiscountPercent = &v
		}
		if custIDns.Valid && custIDns.String != "" {
			if uid, e := uuid.Parse(custIDns.String); e == nil {
				order.CustomerID = &uid
			}
		}
		if custEmail.Valid {
			s := custEmail.String
			order.CustomerEmail = &s
		}
		if custPhone.Valid {
			s := custPhone.String
			order.CustomerPhone = &s
		}
		if guestBD.Valid {
			s := guestBD.Time.UTC().Format("2006-01-02")
			order.GuestBirthday = &s
		}
		if tableOpened.Valid {
			t := tableOpened.Time.UTC()
			order.TableOpenedAt = &t
		}
		if praInvoiceNumber.Valid {
			s := praInvoiceNumber.String
			order.PraInvoiceNumber = &s
		}
		if praInvoicePrintedAt.Valid {
			t := praInvoicePrintedAt.Time.UTC()
			order.PraInvoicePrintedAt = &t
		}

		// Add table info if available
		if tableNumber.Valid {
			order.Table = &models.DiningTable{
				TableNumber: tableNumber.String,
				Location:    &tableLocation.String,
			}
		}

		// Add user info if available
		if username.Valid {
			order.User = &models.User{
				Username:  username.String,
				FirstName: firstName.String,
				LastName:  lastName.String,
			}
		}

		// Load order items
		if err := h.loadOrderItems(&order); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{
				Success: false,
				Message: "Failed to load order items",
				Error:   stringPtr(err.Error()),
			})
			return
		}

		orders = append(orders, order)
	}

	totalPages := (total + perPage - 1) / perPage

	c.JSON(http.StatusOK, models.PaginatedResponse{
		Success: true,
		Message: "Orders retrieved successfully",
		Data:    orders,
		Meta: models.MetaData{
			CurrentPage: page,
			PerPage:     perPage,
			Total:       total,
			TotalPages:  totalPages,
		},
	})
}

// GetOrder retrieves a specific order by ID
func (h *OrderHandler) GetOrder(c *gin.Context) {
	orderID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "Invalid order ID",
			Error:   stringPtr("invalid_uuid"),
		})
		return
	}

	order, err := h.getOrderByID(orderID)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, models.APIResponse{
			Success: false,
			Message: "Order not found",
			Error:   stringPtr("order_not_found"),
		})
		return
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to fetch order",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Order retrieved successfully",
		Data:    order,
	})
}

// GetActiveOrderByTable returns the latest non-terminal order for a table (counter: add items to an open bill).
func (h *OrderHandler) GetActiveOrderByTable(c *gin.Context) {
	tableIDStr := c.Param("table_id")
	tid, err := uuid.Parse(tableIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "Invalid table id",
			Error:   stringPtr("invalid_uuid"),
		})
		return
	}

	var orderID uuid.UUID
	err = h.db.QueryRow(`
		SELECT o.id FROM orders o
		WHERE o.table_id = $1::uuid
		AND o.status NOT IN ('completed', 'cancelled')
		ORDER BY o.created_at DESC
		LIMIT 1
	`, tid).Scan(&orderID)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, models.APIResponse{
			Success: false,
			Message: "No active order for this table",
			Error:   stringPtr("no_active_order"),
		})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to look up order",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	order, err := h.getOrderByID(orderID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to load order",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Active order",
		Data:    order,
	})
}

// CreateOrder creates a new order
func (h *OrderHandler) CreateOrder(c *gin.Context) {
	userID, _, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, models.APIResponse{
			Success: false,
			Message: "Authentication required",
			Error:   stringPtr("auth_required"),
		})
		return
	}

	var req models.CreateOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "Invalid request body",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	// Validate request
	if len(req.Items) == 0 {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "Order must contain at least one item",
			Error:   stringPtr("empty_order"),
		})
		return
	}

	// Reject creation if this order_type has been disabled by admin. Safe
	// fallbacks in isOrderTypeEnabled keep the POS usable when the setting
	// is missing, malformed, or names an unknown id.
	if enabled, err := isOrderTypeEnabled(h.db, req.OrderType); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to validate order type",
			Error:   stringPtr(err.Error()),
		})
		return
	} else if !enabled {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "This order type is currently disabled. Enable it under Settings → Order Types.",
			Error:   stringPtr("order_type_disabled"),
		})
		return
	}

	// Daily order number in its own transaction so counter failures cannot abort the order tx (pq: current transaction is aborted).
	orderNumber, err := h.allocDailyOrderNumberStandalone(h.db)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to allocate order number",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	// Start transaction
	tx, err := h.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to start transaction",
			Error:   stringPtr(err.Error()),
		})
		return
	}
	defer tx.Rollback()

	// Calculate totals
	var subtotal float64
	for _, item := range req.Items {
		var price float64
		if scanErr := tx.QueryRow("SELECT price FROM products WHERE id = $1 AND is_available = true", item.ProductID).Scan(&price); scanErr != nil {
			if scanErr == sql.ErrNoRows {
				c.JSON(http.StatusBadRequest, models.APIResponse{
					Success: false,
					Message: "Product not found or not available",
					Error:   stringPtr("product_not_found"),
				})
				return
			}
			c.JSON(http.StatusInternalServerError, models.APIResponse{
				Success: false,
				Message: "Failed to fetch product price",
				Error:   stringPtr(scanErr.Error()),
			})
			return
		}
		subtotal += price * float64(item.Quantity)
	}

	ps, err := pricing.LoadSettings(h.db)
	if err != nil {
		ps = pricing.Defaults
	}

	orderUserID := userID
	if req.AssignedServerID != nil {
		var serverRole string
		srvErr := tx.QueryRow(`SELECT role FROM users WHERE id = $1 AND is_active = true`, *req.AssignedServerID).Scan(&serverRole)
		if srvErr != nil || !util.AssignableFloorStaffRole(serverRole) {
			c.JSON(http.StatusBadRequest, models.APIResponse{
				Success: false,
				Message: "Invalid or inactive assigned staff for this order",
				Error:   stringPtr("invalid_assigned_server"),
			})
			return
		}
		orderUserID = *req.AssignedServerID
	}

	checkoutIntent := "cash"
	_, serviceCharge, taxAmount, totalAmount := pricing.ComputeTotals(subtotal, 0, checkoutIntent, ps)

	// Create order
	orderID := uuid.New()
	var guestBD interface{}
	if req.GuestBirthday != nil && strings.TrimSpace(*req.GuestBirthday) != "" {
		if t, e := time.Parse("2006-01-02", strings.TrimSpace(*req.GuestBirthday)); e == nil {
			guestBD = t.UTC()
		}
	}

	var custID interface{}
	custUUID, rerr := resolveCustomerInTx(tx, req.CustomerName, req.CustomerEmail, req.CustomerPhone, req.GuestBirthday)
	if rerr != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to resolve customer",
			Error:   stringPtr(rerr.Error()),
		})
		return
	}
	if custUUID != nil {
		custID = *custUUID
	}

	orderQuery := `
		INSERT INTO orders (id, order_number, table_id, user_id, customer_id, customer_name, customer_email, customer_phone,
		                   guest_birthday, table_opened_at, is_open_tab, order_type, status,
		                   subtotal, tax_amount, discount_amount, service_charge_amount, total_amount, guest_count, notes, checkout_payment_method)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
		                   $9, NULL, false, $10, $11,
		                   $12, $13, $14, $15, $16, $17, $18, $19)
	`

	_, err = tx.Exec(orderQuery, orderID, orderNumber, req.TableID, orderUserID, custID, req.CustomerName,
		nullIfEmptyPtr(req.CustomerEmail), nullIfEmptyPtr(req.CustomerPhone),
		guestBD,
		req.OrderType, "pending", subtotal, taxAmount, 0, serviceCharge, totalAmount, req.GuestCount, req.Notes, checkoutIntent)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to create order",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	// Create order items
	for _, item := range req.Items {
		var price float64
		if scanErr := tx.QueryRow("SELECT price FROM products WHERE id = $1", item.ProductID).Scan(&price); scanErr != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{
				Success: false,
				Message: "Failed to fetch product price",
				Error:   stringPtr(scanErr.Error()),
			})
			return
		}

		totalPrice := price * float64(item.Quantity)
		itemID := uuid.New()

		itemQuery := `
			INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, total_price, special_instructions, status)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		`

		itemStatus := "draft"
		if req.OrderType != "dine_in" {
			itemStatus = "pending"
		}

		if _, execErr := tx.Exec(itemQuery, itemID, orderID, item.ProductID, item.Quantity, price, totalPrice, item.SpecialInstructions, itemStatus); execErr != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{
				Success: false,
				Message: "Failed to create order item",
				Error:   stringPtr(execErr.Error()),
			})
			return
		}
	}

	// Update table status if dine-in
	if req.OrderType == "dine_in" && req.TableID != nil {
		_, err = tx.Exec("UPDATE dining_tables SET is_occupied = true WHERE id = $1", *req.TableID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{
				Success: false,
				Message: "Failed to update table status",
				Error:   stringPtr(err.Error()),
			})
			return
		}
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to commit transaction",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	// Fetch and return the created order
	order, err := h.getOrderByID(orderID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Order created but failed to fetch details",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	// Notify the admin dashboard so live ops cards refresh instantly.
	realtime.PublishDashboard(realtime.DashboardEvent{
		Type:        "order_created",
		Title:       "New order",
		Detail:      fmt.Sprintf("Order %s · %s", order.OrderNumber, order.OrderType),
		Amount:      order.TotalAmount,
		OrderID:     order.ID.String(),
		OrderNumber: order.OrderNumber,
	})

	c.JSON(http.StatusCreated, models.APIResponse{
		Success: true,
		Message: "Order created successfully",
		Data:    order,
	})
}

// UpdateCheckoutIntent updates tax/service/total for the selected payment type (cash | card | online).
func (h *OrderHandler) UpdateCheckoutIntent(c *gin.Context) {
	orderID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid order ID", Error: stringPtr("invalid_uuid")})
		return
	}

	var req models.UpdateCheckoutIntentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid request body", Error: stringPtr(err.Error())})
		return
	}

	tx, err := h.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to start transaction", Error: stringPtr(err.Error())})
		return
	}
	defer tx.Rollback()

	var st string
	if err := tx.QueryRow(`SELECT status FROM orders WHERE id = $1`, orderID).Scan(&st); err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Order not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to load order", Error: stringPtr(err.Error())})
		return
	}
	if st == "completed" || st == "cancelled" {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Order cannot be updated", Error: stringPtr("invalid_order_status")})
		return
	}

	if err := h.recalcOrderTotalsTx(tx, orderID, req.CheckoutPaymentMethod); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to update totals", Error: stringPtr(err.Error())})
		return
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to commit", Error: stringPtr(err.Error())})
		return
	}

	order, err := h.getOrderByID(orderID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to load order", Error: stringPtr(err.Error())})
		return
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Checkout intent updated", Data: order})
}

// ApplyOrderDiscount applies a discount at counter checkout (authenticated counter/admin).
func (h *OrderHandler) ApplyOrderDiscount(c *gin.Context) {
	orderID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid order ID", Error: stringPtr("invalid_uuid")})
		return
	}

	var req models.ApplyOrderDiscountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid request body", Error: stringPtr(err.Error())})
		return
	}

	tx, err := h.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to start transaction", Error: stringPtr(err.Error())})
		return
	}
	defer tx.Rollback()

	var subtotal, discount float64
	var st string
	var checkout sql.NullString
	if err := tx.QueryRow(`SELECT subtotal, discount_amount, status, checkout_payment_method FROM orders WHERE id = $1`, orderID).Scan(&subtotal, &discount, &st, &checkout); err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Order not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to load order", Error: stringPtr(err.Error())})
		return
	}
	if st == "completed" || st == "cancelled" {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Order cannot be updated", Error: stringPtr("invalid_order_status")})
		return
	}

	finalDiscount := req.DiscountAmount
	// persistedPct is what we store in orders.discount_percent. It's a pointer
	// so we can write SQL NULL when the caller provided a flat amount (or
	// cleared the discount entirely). Only a positive explicit percent from
	// the request survives as a non-NULL value.
	var persistedPct *float64
	if req.DiscountPercent != nil && *req.DiscountPercent > 0 {
		p := *req.DiscountPercent
		if p > 100 {
			p = 100
		}
		finalDiscount = subtotal * (p / 100)
		persistedPct = &p
	}
	if finalDiscount < 0 {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid discount", Error: stringPtr("invalid_discount")})
		return
	}
	if finalDiscount > subtotal {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Discount cannot exceed subtotal", Error: stringPtr("discount_too_large")})
		return
	}

	intent := "cash"
	if checkout.Valid && checkout.String != "" {
		intent = checkout.String
	}

	if _, err := tx.Exec(
		`UPDATE orders SET discount_amount = $1, discount_percent = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
		finalDiscount, persistedPct, orderID,
	); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to update discount", Error: stringPtr(err.Error())})
		return
	}

	if err := h.recalcOrderTotalsTx(tx, orderID, intent); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to recalculate totals", Error: stringPtr(err.Error())})
		return
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to commit", Error: stringPtr(err.Error())})
		return
	}

	order, err := h.getOrderByID(orderID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to load order", Error: stringPtr(err.Error())})
		return
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Discount applied", Data: order})
}

// UpdateCounterOrderGuest updates guest / CRM fields on an order that is not completed or cancelled.
func (h *OrderHandler) UpdateCounterOrderGuest(c *gin.Context) {
	orderID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid order ID", Error: stringPtr("invalid_uuid")})
		return
	}

	var req models.UpdateCounterOrderGuestRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid request body", Error: stringPtr(err.Error())})
		return
	}

	tx, err := h.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to start transaction", Error: stringPtr(err.Error())})
		return
	}
	defer tx.Rollback()

	var st string
	if err := tx.QueryRow(`SELECT status FROM orders WHERE id = $1::uuid FOR UPDATE`, orderID).Scan(&st); err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Order not found", Error: stringPtr("order_not_found")})
			return
		}
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to load order", Error: stringPtr(err.Error())})
		return
	}
	if st == "completed" || st == "cancelled" {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Guest details cannot be changed for this order", Error: stringPtr("invalid_order_status")})
		return
	}

	name := stringPtrVal(req.CustomerName)
	email := stringPtrVal(req.CustomerEmail)
	phone := stringPtrVal(req.CustomerPhone)
	bdayStr := stringPtrVal(req.GuestBirthday)

	var guestBD interface{}
	if strings.TrimSpace(bdayStr) != "" {
		if t, e := time.Parse("2006-01-02", strings.TrimSpace(bdayStr)); e == nil {
			guestBD = t.UTC()
		}
	}

	custUUID, rerr := resolveCustomerInTx(tx, strPtrOrNil(name), strPtrOrNil(email), strPtrOrNil(phone), strPtrOrNil(bdayStr))
	if rerr != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to resolve customer", Error: stringPtr(rerr.Error())})
		return
	}
	var custID interface{}
	if custUUID != nil {
		custID = *custUUID
	}

	_, err = tx.Exec(`
		UPDATE orders SET
			customer_id = $1,
			customer_name = NULLIF(trim($2::text), ''),
			customer_email = NULLIF(trim($3::text), ''),
			customer_phone = NULLIF(trim($4::text), ''),
			guest_birthday = $5,
			updated_at = CURRENT_TIMESTAMP
		WHERE id = $6::uuid
	`, custID, name, email, phone, guestBD, orderID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to update guest details", Error: stringPtr(err.Error())})
		return
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to commit", Error: stringPtr(err.Error())})
		return
	}

	order, err := h.getOrderByID(orderID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Updated but failed to load order", Error: stringPtr(err.Error())})
		return
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Guest details updated", Data: order})
}

func stringPtrVal(p *string) string {
	if p == nil {
		return ""
	}
	return strings.TrimSpace(*p)
}

func strPtrOrNil(s string) *string {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	v := strings.TrimSpace(s)
	return &v
}

func (h *OrderHandler) recalcOrderTotalsTx(tx *sql.Tx, orderID uuid.UUID, checkoutIntent string) error {
	var subtotal, discount float64
	if err := tx.QueryRow(`SELECT subtotal, discount_amount FROM orders WHERE id = $1`, orderID).Scan(&subtotal, &discount); err != nil {
		return err
	}
	ps, err := pricing.LoadSettings(h.db)
	if err != nil {
		ps = pricing.Defaults
	}
	_, svc, tax, total := pricing.ComputeTotals(subtotal, discount, checkoutIntent, ps)
	_, err = tx.Exec(`
		UPDATE orders SET tax_amount = $1, service_charge_amount = $2, total_amount = $3, checkout_payment_method = $4, updated_at = CURRENT_TIMESTAMP
		WHERE id = $5
	`, tax, svc, total, checkoutIntent, orderID)
	return err
}

// UpdateOrderStatus updates the status of an order
func (h *OrderHandler) UpdateOrderStatus(c *gin.Context) {
	orderID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "Invalid order ID",
			Error:   stringPtr("invalid_uuid"),
		})
		return
	}

	userID, _, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, models.APIResponse{
			Success: false,
			Message: "Authentication required",
			Error:   stringPtr("auth_required"),
		})
		return
	}

	var req models.UpdateOrderStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "Invalid request body",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	// Validate status
	validStatuses := []string{"pending", "confirmed", "preparing", "ready", "served", "completed", "cancelled"}
	isValidStatus := false
	for _, status := range validStatuses {
		if req.Status == status {
			isValidStatus = true
			break
		}
	}

	if !isValidStatus {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "Invalid order status",
			Error:   stringPtr("invalid_status"),
		})
		return
	}

	// Start transaction
	tx, err := h.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to start transaction",
			Error:   stringPtr(err.Error()),
		})
		return
	}
	defer tx.Rollback()

	// Get current order status
	var currentStatus string
	err = tx.QueryRow("SELECT status FROM orders WHERE id = $1", orderID).Scan(&currentStatus)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, models.APIResponse{
			Success: false,
			Message: "Order not found",
			Error:   stringPtr("order_not_found"),
		})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to fetch current order status",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	// Update order status
	updateQuery := "UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP"
	args := []interface{}{req.Status, orderID}

	// Set served_at or completed_at timestamps
	if req.Status == "served" {
		updateQuery += ", served_at = CURRENT_TIMESTAMP"
	} else if req.Status == "completed" {
		updateQuery += ", completed_at = CURRENT_TIMESTAMP"
	}

	updateQuery += " WHERE id = $2"

	_, err = tx.Exec(updateQuery, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to update order status",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	// Log status change in history
	historyQuery := `
		INSERT INTO order_status_history (order_id, previous_status, new_status, changed_by, notes)
		VALUES ($1, $2, $3, $4, $5)
	`
	_, err = tx.Exec(historyQuery, orderID, currentStatus, req.Status, userID, req.Notes)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to log status change",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	// If order is completed or cancelled, free up the table
	if (req.Status == "completed" || req.Status == "cancelled") {
		_, err = tx.Exec(`
			UPDATE dining_tables 
			SET is_occupied = false 
			WHERE id IN (SELECT table_id FROM orders WHERE id = $1 AND table_id IS NOT NULL)
		`, orderID)
		if err != nil {
			// Log error but don't fail the transaction
			fmt.Printf("Warning: Failed to update table status: %v\n", err)
		}
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to commit transaction",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	// Push KDS-relevant transitions to SSE subscribers.
	if req.Status == "served" || req.Status == "completed" || req.Status == "cancelled" {
		evType := req.Status
		if req.Status == "completed" || req.Status == "cancelled" {
			evType = "served" // KDS only cares about ticket leaving the board
		}
		realtime.Publish(realtime.Event{
			Type:    evType,
			OrderID: orderID.String(),
			Extra:   map[string]interface{}{"status": req.Status},
		})
	}

	// Push admin-dashboard signal for any state transition so the live pulse
	// + KPI cards stay in sync.
	{
		dashType := "order_updated"
		title := "Order updated"
		switch req.Status {
		case "completed":
			dashType = "order_completed"
			title = "Order completed"
		case "cancelled":
			dashType = "order_cancelled"
			title = "Order cancelled"
		case "served":
			title = "Order served"
		}
		realtime.PublishDashboard(realtime.DashboardEvent{
			Type:    dashType,
			Title:   title,
			Detail:  fmt.Sprintf("Status → %s", req.Status),
			OrderID: orderID.String(),
			Extra:   map[string]interface{}{"status": req.Status},
		})
	}

	// Fetch and return the updated order
	order, err := h.getOrderByID(orderID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Order updated but failed to fetch details",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Order status updated successfully",
		Data:    order,
	})
}

// Helper functions

func (h *OrderHandler) getOrderByID(orderID uuid.UUID) (*models.Order, error) {
	var order models.Order
	var tableNumber, tableLocation sql.NullString
	var username, firstName, lastName sql.NullString

	query := `
		SELECT o.id, o.order_number, o.table_id, o.user_id, o.customer_id::text, o.customer_name,
		       o.customer_email, o.customer_phone, o.guest_birthday, o.table_opened_at, COALESCE(o.is_open_tab, false),
		       o.order_type, o.status, o.subtotal, o.tax_amount, o.discount_amount, o.discount_percent,
		       o.service_charge_amount, o.total_amount, o.checkout_payment_method, o.guest_count, o.notes, o.created_at, o.updated_at, o.served_at, o.completed_at,
		       COALESCE(o.pra_invoice_printed, false), o.pra_invoice_number, o.pra_invoice_printed_at,
		       t.table_number, t.location,
		       u.username, u.first_name, u.last_name
		FROM orders o
		LEFT JOIN dining_tables t ON o.table_id = t.id
		LEFT JOIN users u ON o.user_id = u.id
		WHERE o.id = $1
	`

	var checkoutMethod sql.NullString
	var custIDns, custEmail, custPhone sql.NullString
	var guestBD sql.NullTime
	var tableOpened sql.NullTime
	var discountPct sql.NullFloat64
	var praInvoiceNumber sql.NullString
	var praInvoicePrintedAt sql.NullTime
	err := h.db.QueryRow(query, orderID).Scan(
		&order.ID, &order.OrderNumber, &order.TableID, &order.UserID, &custIDns, &order.CustomerName,
		&custEmail, &custPhone, &guestBD, &tableOpened, &order.IsOpenTab,
		&order.OrderType, &order.Status, &order.Subtotal, &order.TaxAmount, &order.DiscountAmount, &discountPct,
		&order.ServiceChargeAmount, &order.TotalAmount, &checkoutMethod, &order.GuestCount, &order.Notes, &order.CreatedAt, &order.UpdatedAt, &order.ServedAt, &order.CompletedAt,
		&order.PraInvoicePrinted, &praInvoiceNumber, &praInvoicePrintedAt,
		&tableNumber, &tableLocation,
		&username, &firstName, &lastName,
	)

	if err != nil {
		return nil, err
	}

	if checkoutMethod.Valid {
		s := checkoutMethod.String
		order.CheckoutPaymentMethod = &s
	}
	if discountPct.Valid {
		v := discountPct.Float64
		order.DiscountPercent = &v
	}
	if custIDns.Valid && custIDns.String != "" {
		if uid, e := uuid.Parse(custIDns.String); e == nil {
			order.CustomerID = &uid
		}
	}
	if custEmail.Valid {
		s := custEmail.String
		order.CustomerEmail = &s
	}
	if custPhone.Valid {
		s := custPhone.String
		order.CustomerPhone = &s
	}
	if guestBD.Valid {
		s := guestBD.Time.UTC().Format("2006-01-02")
		order.GuestBirthday = &s
	}
	if tableOpened.Valid {
		t := tableOpened.Time.UTC()
		order.TableOpenedAt = &t
	}
	if praInvoiceNumber.Valid {
		s := praInvoiceNumber.String
		order.PraInvoiceNumber = &s
	}
	if praInvoicePrintedAt.Valid {
		t := praInvoicePrintedAt.Time.UTC()
		order.PraInvoicePrintedAt = &t
	}

	// Add table info if available
	if tableNumber.Valid {
		order.Table = &models.DiningTable{
			TableNumber: tableNumber.String,
			Location:    &tableLocation.String,
		}
	}

	// Add user info if available
	if username.Valid {
		order.User = &models.User{
			Username:  username.String,
			FirstName: firstName.String,
			LastName:  lastName.String,
		}
	}

	// Load order items
	if err := h.loadOrderItems(&order); err != nil {
		return nil, err
	}

	// Load payments
	if err := h.loadOrderPayments(&order); err != nil {
		return nil, err
	}

	return &order, nil
}

func (h *OrderHandler) loadOrderItems(order *models.Order) error {
	query := `
		SELECT oi.id, oi.product_id, oi.quantity, oi.unit_price, oi.total_price, 
		       oi.special_instructions, oi.status, oi.created_at, oi.updated_at,
		       p.name, p.description, p.price, p.preparation_time
		FROM order_items oi
		JOIN products p ON oi.product_id = p.id
		WHERE oi.order_id = $1
		ORDER BY oi.created_at
	`

	rows, err := h.db.Query(query, order.ID)
	if err != nil {
		return err
	}
	defer rows.Close()

	var items []models.OrderItem
	for rows.Next() {
		var item models.OrderItem
		var productName, productDescription string
		var productPrice float64
		var preparationTime int

		err := rows.Scan(
			&item.ID, &item.ProductID, &item.Quantity, &item.UnitPrice, &item.TotalPrice,
			&item.SpecialInstructions, &item.Status, &item.CreatedAt, &item.UpdatedAt,
			&productName, &productDescription, &productPrice, &preparationTime,
		)
		if err != nil {
			return err
		}

		item.OrderID = order.ID
		item.Product = &models.Product{
			ID:              item.ProductID,
			Name:            productName,
			Description:     &productDescription,
			Price:           productPrice,
			PreparationTime: preparationTime,
		}

		items = append(items, item)
	}

	order.Items = items
	return nil
}

func (h *OrderHandler) loadOrderPayments(order *models.Order) error {
	query := `
		SELECT p.id, p.payment_method, p.amount, p.reference_number, p.status, 
		       p.processed_by, p.processed_at, p.created_at,
		       u.username, u.first_name, u.last_name
		FROM payments p
		LEFT JOIN users u ON p.processed_by = u.id
		WHERE p.order_id = $1
		ORDER BY p.created_at
	`

	rows, err := h.db.Query(query, order.ID)
	if err != nil {
		return err
	}
	defer rows.Close()

	var payments []models.Payment
	for rows.Next() {
		var payment models.Payment
		var username, firstName, lastName sql.NullString

		err := rows.Scan(
			&payment.ID, &payment.PaymentMethod, &payment.Amount, &payment.ReferenceNumber,
			&payment.Status, &payment.ProcessedBy, &payment.ProcessedAt, &payment.CreatedAt,
			&username, &firstName, &lastName,
		)
		if err != nil {
			return err
		}

		payment.OrderID = order.ID

		// Add processed by user info if available
		if username.Valid {
			payment.ProcessedByUser = &models.User{
				Username:  username.String,
				FirstName: firstName.String,
				LastName:  lastName.String,
			}
		}

		payments = append(payments, payment)
	}

	order.Payments = payments
	return nil
}

// allocDailyOrderNumberStandalone reserves the next display sequence in a short transaction, then commits.
// Kept separate from the order INSERT transaction so counter failures cannot abort the order tx.
func (h *OrderHandler) allocDailyOrderNumberStandalone(db *sql.DB) (string, error) {
	tx, err := db.Begin()
	if err != nil {
		return "", err
	}
	defer tx.Rollback()

	s, err := h.allocDailyOrderNumber(tx)
	if err != nil {
		return "", err
	}
	if err := tx.Commit(); err != nil {
		return "", err
	}
	return s, nil
}

func (h *OrderHandler) allocDailyOrderNumber(tx *sql.Tx) (string, error) {
	loc := time.Local
	if tz := os.Getenv("BUSINESS_TIMEZONE"); tz != "" {
		if l, err := time.LoadLocation(tz); err == nil {
			loc = l
		}
	}
	day := time.Now().In(loc).Format("2006-01-02")

	var claimed sql.NullInt64
	err := tx.QueryRow(`
		WITH c AS (
			SELECT seq FROM released_order_sequences
			WHERE business_date = $1::date
			ORDER BY seq ASC
			LIMIT 1
			FOR UPDATE SKIP LOCKED
		)
		DELETE FROM released_order_sequences r
		USING c
		WHERE r.business_date = $1::date AND r.seq = c.seq
		RETURNING r.seq
	`, day).Scan(&claimed)
	if err != nil && err != sql.ErrNoRows {
		return "", err
	}
	if err == nil && claimed.Valid {
		compact := strings.ReplaceAll(day, "-", "")
		candidate := fmt.Sprintf("%s-%03d", compact, int(claimed.Int64))
		var taken int
		if err := tx.QueryRow(`SELECT COUNT(*) FROM orders WHERE order_number = $1`, candidate).Scan(&taken); err != nil {
			return "", err
		}
		if taken == 0 {
			return candidate, nil
		}
		// A row still holds this number (e.g. cancelled tab kept the same order_number); skip reuse and bump counter.
	}

	var n int
	err = tx.QueryRow(`
		INSERT INTO order_number_counters (business_date, last_value)
		VALUES ($1::date, 1)
		ON CONFLICT (business_date)
		DO UPDATE SET last_value = order_number_counters.last_value + 1
		RETURNING last_value
	`, day).Scan(&n)
	if err != nil {
		return "", err
	}
	compact := strings.ReplaceAll(day, "-", "")
	return fmt.Sprintf("%s-%03d", compact, n), nil
}

// loadPraLatePrintPolicy reads the configurable late-print policy from
// app_settings. Falls back to safe defaults (enabled, 7 days) if the keys are
// missing or malformed — never blocks a user over bad config.
//
// The window is defined inclusively: an order completed on day D is eligible
// until end-of-day D + window_days in Asia/Karachi local time. window_days=0
// therefore means "same business day only".
func loadPraLatePrintPolicy(db *sql.DB) (enabled bool, windowDays int) {
	enabled = true
	windowDays = 7

	var raw []byte
	if err := db.QueryRow(`SELECT value FROM app_settings WHERE key = 'pra_invoice_late_print_enabled'`).Scan(&raw); err == nil {
		s := strings.TrimSpace(string(raw))
		if s == "false" {
			enabled = false
		}
	}
	if err := db.QueryRow(`SELECT value FROM app_settings WHERE key = 'pra_invoice_late_print_window_days'`).Scan(&raw); err == nil {
		s := strings.TrimSpace(string(raw))
		s = strings.Trim(s, "\"")
		if n, err := strconv.Atoi(s); err == nil {
			if n < 0 {
				n = 0
			}
			if n > 7 {
				n = 7
			}
			windowDays = n
		}
	}
	return
}

// MarkPraInvoicePrinted records that a PRA (Punjab Revenue Authority) tax
// invoice slip was printed for an order. The invoice number is optional —
// callers that don't yet have a real PRA-issued number may omit it; the
// printed_at timestamp always reflects the most recent print.
//
// Reprint policy:
//   - The first print (pra_invoice_printed = false → true) is always allowed
//     (subject to admin policy on whether PRA invoices are enabled at all).
//   - A reprint is allowed when one of:
//       (a) the caller's role is admin (override), OR
//       (b) the configurable late-print window in app_settings has not yet
//           expired. The window is computed in Asia/Karachi local time and
//           defaults to one week (window_days=7): end of the local calendar day
//           that is window_days full days after the order's business day.
//   - When a reprint is rejected the response is 409 Conflict and includes
//     the original printed_at timestamp + the computed window expiry so the
//     UI can show a clear, dated tooltip.
//   - Reprints stamp pra_invoice_reprint_count, pra_invoice_last_reprinted_at
//     and pra_invoice_last_reprinted_by for audit.
func (h *OrderHandler) MarkPraInvoicePrinted(c *gin.Context) {
	orderID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "Invalid order ID",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	var body struct {
		PraInvoiceNumber *string `json:"pra_invoice_number,omitempty"`
	}
	_ = c.ShouldBindJSON(&body)

	var invoiceNum interface{}
	if body.PraInvoiceNumber != nil {
		trimmed := strings.TrimSpace(*body.PraInvoiceNumber)
		if trimmed != "" {
			if len(trimmed) > 64 {
				trimmed = trimmed[:64]
			}
			invoiceNum = trimmed
		}
	}

	userID, _, role, _ := middleware.GetUserFromContext(c)
	isManagerOverride := role == "admin"

	lateEnabled, windowDays := loadPraLatePrintPolicy(h.db)

	// Pull the current state plus the computed window-expiry timestamp. The
	// SQL keeps the timezone math in the database for a single source of truth.
	var (
		alreadyPrinted   bool
		printedAt        sql.NullTime
		windowExpiresAt  sql.NullTime
		referenceMoment  sql.NullTime // completed_at, falling back to created_at
	)
	err = h.db.QueryRow(`
		SELECT
			COALESCE(pra_invoice_printed, false),
			pra_invoice_printed_at,
			COALESCE(completed_at, created_at) AS reference_moment,
			(date_trunc('day', COALESCE(completed_at, created_at) AT TIME ZONE 'Asia/Karachi')
				+ make_interval(days => $2 + 1)
				- interval '1 microsecond')
				AT TIME ZONE 'Asia/Karachi' AS window_expires_at
		FROM orders
		WHERE id = $1
	`, orderID, windowDays).Scan(&alreadyPrinted, &printedAt, &referenceMoment, &windowExpiresAt)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, models.APIResponse{
			Success: false,
			Message: "Order not found",
		})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to load order",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	// Window enforcement applies only to non-overrides AND only when the
	// invoice has been printed at least once before (i.e. this is a reprint).
	// First prints are never blocked by the late-print window.
	if alreadyPrinted && !isManagerOverride {
		if !lateEnabled {
			c.JSON(http.StatusConflict, models.APIResponse{
				Success: false,
				Message: "PRA invoice reprints are disabled in settings",
				Error:   stringPtr("pra_reprint_disabled"),
			})
			return
		}
		if windowExpiresAt.Valid && time.Now().After(windowExpiresAt.Time) {
			expires := windowExpiresAt.Time.UTC()
			payload := gin.H{
				"window_expires_at": expires,
				"window_days":       windowDays,
			}
			if printedAt.Valid {
				payload["pra_invoice_printed_at"] = printedAt.Time.UTC()
			}
			c.JSON(http.StatusConflict, gin.H{
				"success": false,
				"message": "PRA invoice reprint window has expired",
				"error":   "pra_reprint_window_expired",
				"data":    payload,
			})
			return
		}
	}

	// Audit fields only apply to reprints (pre-existing printed=true).
	var actor interface{}
	if userID != uuid.Nil {
		actor = userID
	}
	var execErr error
	if alreadyPrinted {
		_, execErr = h.db.Exec(`
			UPDATE orders
			SET pra_invoice_number = COALESCE($2, pra_invoice_number),
			    pra_invoice_printed_at = CURRENT_TIMESTAMP,
			    pra_invoice_reprint_count = COALESCE(pra_invoice_reprint_count, 0) + 1,
			    pra_invoice_last_reprinted_at = CURRENT_TIMESTAMP,
			    pra_invoice_last_reprinted_by = $3,
			    updated_at = CURRENT_TIMESTAMP
			WHERE id = $1
		`, orderID, invoiceNum, actor)
	} else {
		_, execErr = h.db.Exec(`
			UPDATE orders
			SET pra_invoice_printed = true,
			    pra_invoice_number = COALESCE($2, pra_invoice_number),
			    pra_invoice_printed_at = CURRENT_TIMESTAMP,
			    updated_at = CURRENT_TIMESTAMP
			WHERE id = $1
		`, orderID, invoiceNum)
	}
	if execErr != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to mark PRA invoice printed",
			Error:   stringPtr(execErr.Error()),
		})
		return
	}

	msg := "PRA invoice marked as printed"
	if alreadyPrinted {
		msg = "PRA invoice reprint recorded"
	}
	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: msg,
	})
}

