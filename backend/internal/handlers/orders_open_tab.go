package handlers

import (
	"database/sql"
	"net/http"
	"strings"
	"time"

	"pos-backend/internal/middleware"
	"pos-backend/internal/models"
	"pos-backend/internal/pricing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// OpenCounterTableTab creates a dine-in order with no line items, assigns order number, sets table_opened_at.
func (h *OrderHandler) OpenCounterTableTab(c *gin.Context) {
	_, _, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, models.APIResponse{Success: false, Message: "Authentication required", Error: stringPtr("auth_required")})
		return
	}

	var req models.OpenCounterTableTabRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid request body", Error: stringPtr(err.Error())})
		return
	}

	guestCount := 0
	if req.GuestCount != nil {
		guestCount = *req.GuestCount
	}
	if guestCount < 0 {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Guest count cannot be negative", Error: stringPtr("guest_count_invalid")})
		return
	}

	// Opening a counter table tab always creates a dine_in order; reject if
	// dine_in has been disabled by admin. Safe fallbacks in isOrderTypeEnabled
	// keep the POS usable when the setting is missing or malformed.
	if enabled, err := isOrderTypeEnabled(h.db, "dine_in"); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to validate order type", Error: stringPtr(err.Error())})
		return
	} else if !enabled {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Dine-in is currently disabled. Enable it under Settings → Order Types.", Error: stringPtr("order_type_disabled")})
		return
	}

	var activeCount int
	if err := h.db.QueryRow(`
		SELECT COUNT(*) FROM orders
		WHERE table_id = $1::uuid AND status NOT IN ('completed', 'cancelled')
	`, req.TableID).Scan(&activeCount); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to check table", Error: stringPtr(err.Error())})
		return
	}
	if activeCount > 0 {
		c.JSON(http.StatusConflict, models.APIResponse{Success: false, Message: "This table already has an open order", Error: stringPtr("table_has_active_order")})
		return
	}

	tx, err := h.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to start transaction", Error: stringPtr(err.Error())})
		return
	}
	defer tx.Rollback()

	// Allocate order number inside the same transaction as INSERT so counter / released-pool
	// stays consistent if anything below fails.
	orderNumber, err := h.allocDailyOrderNumber(tx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to allocate order number", Error: stringPtr(err.Error())})
		return
	}

	var orderUserID interface{}
	if req.AssignedServerID != nil {
		var serverRole string
		if err := tx.QueryRow(`SELECT role FROM users WHERE id = $1 AND is_active = true`, *req.AssignedServerID).Scan(&serverRole); err != nil {
			if err == sql.ErrNoRows {
				c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid or inactive assigned server", Error: stringPtr("invalid_assigned_server")})
				return
			}
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to validate server", Error: stringPtr(err.Error())})
			return
		}
		if serverRole != "server" {
			c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Assigned user must be a server", Error: stringPtr("invalid_assigned_server")})
			return
		}
		orderUserID = *req.AssignedServerID
	}

	custID, err := resolveCustomerInTx(tx, req.CustomerName, req.CustomerEmail, req.CustomerPhone, req.GuestBirthday)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to resolve customer", Error: stringPtr(err.Error())})
		return
	}

	ps, err := pricing.LoadSettings(h.db)
	if err != nil {
		ps = pricing.Defaults
	}
	checkoutIntent := "cash"
	_, serviceCharge, taxAmount, totalAmount := pricing.ComputeTotals(0, 0, checkoutIntent, ps)

	openedAt := time.Now().UTC()
	orderID := uuid.New()

	var guestBD interface{}
	if req.GuestBirthday != nil && strings.TrimSpace(*req.GuestBirthday) != "" {
		t, e := time.Parse("2006-01-02", strings.TrimSpace(*req.GuestBirthday))
		if e == nil {
			guestBD = t.UTC()
		}
	}

	var custIDArg interface{}
	if custID != nil {
		custIDArg = *custID
	}

	_, err = tx.Exec(`
		INSERT INTO orders (
			id, order_number, table_id, user_id, customer_id, customer_name, customer_email, customer_phone,
			guest_birthday, table_opened_at, is_open_tab, order_type, status,
			subtotal, tax_amount, discount_amount, service_charge_amount, total_amount, guest_count, checkout_payment_method
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8,
			$9, $10, true, 'dine_in', 'pending',
			0, $11, 0, $12, $13, $14, $15
		)`,
		orderID, orderNumber, req.TableID, orderUserID, custIDArg,
		req.CustomerName, nullIfEmptyPtr(req.CustomerEmail), nullIfEmptyPtr(req.CustomerPhone),
		guestBD, openedAt,
		taxAmount, serviceCharge, totalAmount, guestCount, checkoutIntent,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to create open tab", Error: stringPtr(err.Error())})
		return
	}

	if _, err = tx.Exec(`UPDATE dining_tables SET is_occupied = true WHERE id = $1`, req.TableID); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to update table", Error: stringPtr(err.Error())})
		return
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to commit", Error: stringPtr(err.Error())})
		return
	}

	order, err := h.getOrderByID(orderID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Tab opened but failed to load order", Error: stringPtr(err.Error())})
		return
	}

	c.JSON(http.StatusCreated, models.APIResponse{Success: true, Message: "Table tab opened", Data: order})
}

// CancelCounterOpenTab abandons a counter dine-in tab before kitchen fire. The order row keeps its
// order_number (unique) for audit; display sequences are not returned to the reuse pool.
func (h *OrderHandler) CancelCounterOpenTab(c *gin.Context) {
	_, _, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, models.APIResponse{Success: false, Message: "Authentication required", Error: stringPtr("auth_required")})
		return
	}

	orderID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid order ID", Error: stringPtr("invalid_uuid")})
		return
	}

	tx, err := h.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to start transaction", Error: stringPtr(err.Error())})
		return
	}
	defer tx.Rollback()

	var orderNumber, status string
	var tableIDns sql.NullString
	var kotFirst sql.NullTime
	var payCompleted int
	err = tx.QueryRow(`
		SELECT o.order_number, o.status, o.table_id::text, o.kot_first_sent_at,
		       (SELECT COUNT(*) FROM payments p WHERE p.order_id = o.id AND p.status = 'completed')
		FROM orders o WHERE o.id = $1::uuid FOR UPDATE
	`, orderID).Scan(&orderNumber, &status, &tableIDns, &kotFirst, &payCompleted)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Order not found", Error: stringPtr("order_not_found")})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to load order", Error: stringPtr(err.Error())})
		return
	}

	if status == "completed" || status == "cancelled" {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Order cannot be cancelled", Error: stringPtr("invalid_status")})
		return
	}
	if payCompleted > 0 {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Cannot cancel an order with completed payments", Error: stringPtr("has_payments")})
		return
	}

	var badItems int
	if err := tx.QueryRow(`
		SELECT COUNT(*) FROM order_items WHERE order_id = $1::uuid
		AND status IN ('sent','preparing','ready','served')
	`, orderID).Scan(&badItems); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to check items", Error: stringPtr(err.Error())})
		return
	}
	if badItems > 0 {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Cannot cancel after items were sent to the kitchen", Error: stringPtr("items_already_sent")})
		return
	}

	if _, err := tx.Exec(`DELETE FROM order_items WHERE order_id = $1::uuid`, orderID); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to clear line items", Error: stringPtr(err.Error())})
		return
	}

	if _, err := tx.Exec(`UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1::uuid`, orderID); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to cancel order", Error: stringPtr(err.Error())})
		return
	}

	// Do not return the display sequence to released_order_sequences: the cancelled row still
	// holds order_number (UNIQUE), so reusing the same number would cause duplicate key on new tabs.

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to commit", Error: stringPtr(err.Error())})
		return
	}

	if tableIDns.Valid {
		tid, perr := uuid.Parse(tableIDns.String)
		if perr == nil {
			var remaining int
			_ = h.db.QueryRow(`
				SELECT COUNT(*) FROM orders WHERE table_id = $1::uuid AND status NOT IN ('completed','cancelled')
			`, tid).Scan(&remaining)
			if remaining == 0 {
				_, _ = h.db.Exec(`UPDATE dining_tables SET is_occupied = false WHERE id = $1::uuid`, tid)
			}
		}
	}

	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Open tab cancelled", Data: nil})
}

// ReassignCounterOrderTable moves an active dine-in order to a new table with transactional occupancy updates.
func (h *OrderHandler) ReassignCounterOrderTable(c *gin.Context) {
	userID, _, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, models.APIResponse{Success: false, Message: "Authentication required", Error: stringPtr("auth_required")})
		return
	}

	orderID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid order ID", Error: stringPtr("invalid_uuid")})
		return
	}

	var req models.ReassignCounterTableRequest
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

	var (
		status        string
		orderType     string
		currentTable  uuid.UUID
		currentTableN string
	)
	// Lock the order row only. PostgreSQL rejects FOR UPDATE when it would apply to the nullable side of an outer join.
	if err := tx.QueryRow(`
		SELECT o.status, o.order_type, o.table_id,
		       COALESCE((SELECT dt.table_number FROM dining_tables dt WHERE dt.id = o.table_id), '')
		FROM orders o
		WHERE o.id = $1::uuid
		FOR UPDATE
	`, orderID).Scan(&status, &orderType, &currentTable, &currentTableN); err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Order not found", Error: stringPtr("order_not_found")})
			return
		}
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to load order", Error: stringPtr(err.Error())})
		return
	}

	if orderType != "dine_in" {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Only dine-in orders can be reassigned", Error: stringPtr("invalid_order_type")})
		return
	}
	if status == "completed" || status == "cancelled" {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Order cannot be reassigned in current status", Error: stringPtr("invalid_status")})
		return
	}
	if currentTable == req.TableID {
		c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Order already assigned to this table", Data: nil})
		return
	}

	var targetExists bool
	var targetTableNumber string
	if err := tx.QueryRow(`
		SELECT true, COALESCE(table_number, '')
		FROM dining_tables
		WHERE id = $1::uuid
		FOR UPDATE
	`, req.TableID).Scan(&targetExists, &targetTableNumber); err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Destination table not found", Error: stringPtr("table_not_found")})
			return
		}
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to validate destination table", Error: stringPtr(err.Error())})
		return
	}
	if !targetExists {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Destination table not found", Error: stringPtr("table_not_found")})
		return
	}

	var destinationBusy int
	if err := tx.QueryRow(`
		SELECT COUNT(*)
		FROM orders
		WHERE table_id = $1::uuid
		  AND id <> $2::uuid
		  AND status NOT IN ('completed', 'cancelled')
	`, req.TableID, orderID).Scan(&destinationBusy); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to check destination table", Error: stringPtr(err.Error())})
		return
	}
	if destinationBusy > 0 {
		c.JSON(http.StatusConflict, models.APIResponse{Success: false, Message: "Destination table already has an active order", Error: stringPtr("table_has_active_order")})
		return
	}

	if _, err := tx.Exec(`
		UPDATE orders
		SET table_id = $1::uuid, updated_at = CURRENT_TIMESTAMP
		WHERE id = $2::uuid
	`, req.TableID, orderID); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to reassign table", Error: stringPtr(err.Error())})
		return
	}

	note := strings.TrimSpace("Table moved from " + currentTableN + " to " + targetTableNumber)
	if req.Notes != nil && strings.TrimSpace(*req.Notes) != "" {
		note += " — " + strings.TrimSpace(*req.Notes)
	}
	if _, err := tx.Exec(`
		INSERT INTO order_status_history (id, order_id, previous_status, new_status, changed_by, notes)
		VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, $6)
	`, uuid.New(), orderID, status, status, userID, note); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to write order history", Error: stringPtr(err.Error())})
		return
	}

	if _, err := tx.Exec(`UPDATE dining_tables SET is_occupied = true WHERE id = $1::uuid`, req.TableID); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to mark destination occupied", Error: stringPtr(err.Error())})
		return
	}

	var remaining int
	if err := tx.QueryRow(`
		SELECT COUNT(*)
		FROM orders
		WHERE table_id = $1::uuid
		  AND status NOT IN ('completed', 'cancelled')
	`, currentTable).Scan(&remaining); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to check source table", Error: stringPtr(err.Error())})
		return
	}
	if remaining == 0 {
		if _, err := tx.Exec(`UPDATE dining_tables SET is_occupied = false WHERE id = $1::uuid`, currentTable); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to release source table", Error: stringPtr(err.Error())})
			return
		}
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to commit reassignment", Error: stringPtr(err.Error())})
		return
	}

	order, err := h.getOrderByID(orderID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Table reassigned but failed to load order", Error: stringPtr(err.Error())})
		return
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Order table reassigned", Data: order})
}

// UpdateCounterOrderService sets party size and assigned server on an open dine-in order (counter).
func (h *OrderHandler) UpdateCounterOrderService(c *gin.Context) {
	_, _, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, models.APIResponse{Success: false, Message: "Authentication required", Error: stringPtr("auth_required")})
		return
	}

	orderID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid order ID", Error: stringPtr("invalid_uuid")})
		return
	}

	var req models.UpdateCounterOrderServiceRequest
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

	var st, ot string
	if err := tx.QueryRow(`SELECT status, order_type FROM orders WHERE id = $1::uuid FOR UPDATE`, orderID).Scan(&st, &ot); err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Order not found", Error: stringPtr("order_not_found")})
			return
		}
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to load order", Error: stringPtr(err.Error())})
		return
	}
	if ot != "dine_in" {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Only dine-in orders support table service fields", Error: stringPtr("invalid_order_type")})
		return
	}
	if st == "completed" || st == "cancelled" {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Order cannot be updated in this status", Error: stringPtr("invalid_order_status")})
		return
	}

	var userArg interface{}
	rawSrv := strings.TrimSpace(req.AssignedServerID)
	if rawSrv == "" {
		userArg = nil
	} else {
		sid, perr := uuid.Parse(rawSrv)
		if perr != nil {
			c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid assigned server id", Error: stringPtr("invalid_uuid")})
			return
		}
		var serverRole string
		if err := tx.QueryRow(`SELECT role FROM users WHERE id = $1 AND is_active = true`, sid).Scan(&serverRole); err != nil {
			if err == sql.ErrNoRows {
				c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid or inactive assigned server", Error: stringPtr("invalid_assigned_server")})
				return
			}
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to validate server", Error: stringPtr(err.Error())})
			return
		}
		if serverRole != "server" {
			c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Assigned user must be a server", Error: stringPtr("invalid_assigned_server")})
			return
		}
		userArg = sid
	}

	if _, err := tx.Exec(`UPDATE orders SET guest_count = $1, user_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3::uuid`, req.GuestCount, userArg, orderID); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to update order", Error: stringPtr(err.Error())})
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
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Table service updated", Data: order})
}

func nullIfEmptyPtr(p *string) interface{} {
	if p == nil {
		return nil
	}
	s := strings.TrimSpace(*p)
	if s == "" {
		return nil
	}
	return s
}

func resolveCustomerInTx(tx *sql.Tx, displayName, email, phone, guestBirthday *string) (*uuid.UUID, error) {
	em := ""
	if email != nil {
		em = strings.TrimSpace(strings.ToLower(*email))
	}
	ph := ""
	if phone != nil {
		ph = strings.TrimSpace(*phone)
	}
	nm := ""
	if displayName != nil {
		nm = strings.TrimSpace(*displayName)
	}
	var bd sql.NullTime
	if guestBirthday != nil && strings.TrimSpace(*guestBirthday) != "" {
		t, e := time.Parse("2006-01-02", strings.TrimSpace(*guestBirthday))
		if e == nil {
			bd = sql.NullTime{Time: t.UTC(), Valid: true}
		}
	}

	if em == "" && ph == "" && nm == "" && !bd.Valid {
		return nil, nil
	}

	var id uuid.UUID
	if em != "" {
		err := tx.QueryRow(`SELECT id FROM customers WHERE lower(trim(email)) = $1`, em).Scan(&id)
		if err == nil {
			_, _ = tx.Exec(`UPDATE customers SET updated_at = CURRENT_TIMESTAMP,
				display_name = COALESCE(NULLIF($2,''), display_name),
				phone = COALESCE(NULLIF($3,''), phone),
				birthday = COALESCE($4, birthday)
				WHERE id = $1`, id, nm, ph, nullableDateArg(bd))
			return &id, nil
		}
		if err != sql.ErrNoRows {
			return nil, err
		}
	}
	if ph != "" {
		err := tx.QueryRow(`SELECT id FROM customers WHERE phone = $1`, ph).Scan(&id)
		if err == nil {
			_, _ = tx.Exec(`UPDATE customers SET updated_at = CURRENT_TIMESTAMP,
				display_name = COALESCE(NULLIF($2,''), display_name),
				email = COALESCE(NULLIF($3,''), email),
				birthday = COALESCE($4, birthday)
				WHERE id = $1`, id, nm, em, nullableDateArg(bd))
			return &id, nil
		}
		if err != sql.ErrNoRows {
			return nil, err
		}
	}

	id = uuid.New()
	var emArg, phArg, nmArg interface{}
	if em != "" {
		emArg = em
	}
	if ph != "" {
		phArg = ph
	}
	if nm != "" {
		nmArg = nm
	}
	_, err := tx.Exec(`INSERT INTO customers (id, email, phone, display_name, birthday) VALUES ($1,$2,$3,$4,$5)`,
		id, emArg, phArg, nmArg, nullableDateArg(bd))
	if err != nil {
		return nil, err
	}
	return &id, nil
}

func nullableDateArg(nt sql.NullTime) interface{} {
	if !nt.Valid {
		return nil
	}
	return nt.Time
}
