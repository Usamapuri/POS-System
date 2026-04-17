package handlers

import (
	"database/sql"
	"net/http"
	"strconv"
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

	if req.GuestCount < 1 {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Guest count must be at least 1", Error: stringPtr("guest_count_required")})
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

	orderNumber, err := h.allocDailyOrderNumberStandalone(h.db)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to allocate order number", Error: stringPtr(err.Error())})
		return
	}

	tx, err := h.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to start transaction", Error: stringPtr(err.Error())})
		return
	}
	defer tx.Rollback()

	var serverRole string
	if err := tx.QueryRow(`SELECT role FROM users WHERE id = $1 AND is_active = true`, req.AssignedServerID).Scan(&serverRole); err != nil {
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
		orderID, orderNumber, req.TableID, req.AssignedServerID, custIDArg,
		req.CustomerName, nullIfEmptyPtr(req.CustomerEmail), nullIfEmptyPtr(req.CustomerPhone),
		guestBD, openedAt,
		taxAmount, serviceCharge, totalAmount, req.GuestCount, checkoutIntent,
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

// CancelCounterOpenTab abandons a counter dine-in tab before kitchen fire; releases order number for reuse.
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

	if !kotFirst.Valid {
		if err := releaseOrderSequenceTx(tx, orderNumber); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to release order number", Error: stringPtr(err.Error())})
			return
		}
	}

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

func releaseOrderSequenceTx(tx *sql.Tx, orderNumber string) error {
	parts := strings.Split(orderNumber, "-")
	if len(parts) != 2 {
		return nil
	}
	compact := parts[0]
	seq, aerr := strconv.Atoi(parts[1])
	if aerr != nil || len(compact) != 8 {
		return nil
	}
	bd := compact[:4] + "-" + compact[4:6] + "-" + compact[6:8]
	_, err := tx.Exec(`
		INSERT INTO released_order_sequences (business_date, seq) VALUES ($1::date, $2)
		ON CONFLICT DO NOTHING
	`, bd, seq)
	return err
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
