package handlers

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"pos-backend/internal/middleware"
	"pos-backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type KOTHandler struct {
	db *sql.DB
}

func NewKOTHandler(db *sql.DB) *KOTHandler {
	return &KOTHandler{db: db}
}

type kotItem struct {
	ID                  uuid.UUID `json:"id"`
	ProductID           uuid.UUID `json:"product_id"`
	ProductName         string    `json:"product_name"`
	Quantity            int       `json:"quantity"`
	SpecialInstructions *string   `json:"special_instructions"`
	CategoryID          uuid.UUID `json:"category_id"`
}

type stationKOT struct {
	StationID      uuid.UUID   `json:"station_id"`
	StationName    string      `json:"station_name"`
	OutputType     string      `json:"output_type"`
	PrintLocation  string      `json:"print_location"` // kitchen | counter (meaningful for printer; kds uses kitchen)
	Payload        interface{} `json:"payload"`
}

type kdsPayload struct {
	StationID   uuid.UUID `json:"station_id"`
	StationName string    `json:"station_name"`
	OrderNumber string    `json:"order_number"`
	TableNumber string    `json:"table_number"`
	Items       []kotItem `json:"items"`
	FiredAt     time.Time `json:"fired_at"`
	IsVoid      bool      `json:"is_void"`
}

func (h *KOTHandler) FireKOT(c *gin.Context) {
	orderID := c.Param("id")
	userID, _, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, models.APIResponse{Success: false, Message: "Authentication required"})
		return
	}

	var orderNumber, tableNumber, serverDisplay string
	var orderCreatedAt time.Time
	err := h.db.QueryRow(`
		SELECT o.order_number,
			COALESCE(dt.table_number, 'N/A'),
			COALESCE(NULLIF(TRIM(CONCAT_WS(' ', su.first_name, su.last_name)), ''), su.username, '—'),
			o.created_at
		FROM orders o
		LEFT JOIN dining_tables dt ON o.table_id = dt.id
		LEFT JOIN users su ON o.user_id = su.id
		WHERE o.id = $1`, orderID).Scan(&orderNumber, &tableNumber, &serverDisplay, &orderCreatedAt)
	if err != nil {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Order not found"})
		return
	}

	// Non–dine-in orders are created with item status `pending`; dine-in uses `draft` until fire.
	rows, err := h.db.Query(`
		SELECT oi.id, oi.product_id, p.name, oi.quantity, oi.special_instructions, COALESCE(p.category_id, '00000000-0000-0000-0000-000000000000')
		FROM order_items oi
		JOIN products p ON oi.product_id = p.id
		WHERE oi.order_id = $1 AND oi.status IN ('draft', 'pending')
	`, orderID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to fetch draft items", Error: strPtr(err.Error())})
		return
	}
	defer rows.Close()

	var draftItems []kotItem
	for rows.Next() {
		var ki kotItem
		rows.Scan(&ki.ID, &ki.ProductID, &ki.ProductName, &ki.Quantity, &ki.SpecialInstructions, &ki.CategoryID)
		draftItems = append(draftItems, ki)
	}

	if len(draftItems) == 0 {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "No unsent items to fire (need draft or pending lines)"})
		return
	}

	// Next fire generation must be read outside the write transaction (avoids poisoning the tx on error).
	var maxGen int
	err = h.db.QueryRow(`
		SELECT COALESCE(MAX(kot_fire_generation), 0) FROM order_items
		WHERE order_id = $1::uuid AND status IN ('sent','preparing','ready','served','voided')`, orderID).Scan(&maxGen)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to read KOT generation", Error: strPtr(err.Error())})
		return
	}
	nextGen := maxGen + 1
	if nextGen < 1 {
		nextGen = 1
	}
	now := time.Now()

	type stInfo struct {
		id            uuid.UUID
		name          string
		outputType    string
		printLocation string
	}
	stationItems := map[string][]kotItem{}
	stationMeta := map[string]stInfo{}
	itemToKey := map[uuid.UUID]string{}

	for _, item := range draftItems {
		var stationID uuid.UUID
		var stationName, outputType, printLocation string
		err := h.db.QueryRow(`
			SELECT ks.id, ks.name, ks.output_type, COALESCE(NULLIF(TRIM(ks.print_location), ''), 'kitchen')
			FROM category_station_map csm
			JOIN kitchen_stations ks ON csm.station_id = ks.id
			WHERE csm.category_id = $1 AND ks.is_active = true
			LIMIT 1
		`, item.CategoryID).Scan(&stationID, &stationName, &outputType, &printLocation)
		if err != nil {
			stationName = "Main Kitchen"
			outputType = "kds"
			printLocation = "kitchen"
			err2 := h.db.QueryRow(`
				SELECT id, COALESCE(NULLIF(TRIM(print_location), ''), 'kitchen')
				FROM kitchen_stations WHERE name = 'Main Kitchen' OR sort_order = 1 ORDER BY sort_order LIMIT 1`).Scan(&stationID, &printLocation)
			if err2 != nil {
				_ = h.db.QueryRow(`
					SELECT id, COALESCE(NULLIF(TRIM(print_location), ''), 'kitchen')
					FROM kitchen_stations WHERE is_active = true ORDER BY sort_order LIMIT 1`).Scan(&stationID, &printLocation)
			}
		}
		if outputType == "kds" {
			printLocation = "kitchen"
		} else if printLocation != "counter" {
			printLocation = "kitchen"
		}

		key := stationID.String()
		itemToKey[item.ID] = key
		stationItems[key] = append(stationItems[key], item)
		if _, exists := stationMeta[key]; !exists {
			stationMeta[key] = stInfo{id: stationID, name: stationName, outputType: outputType, printLocation: printLocation}
		}
	}

	var printerIDs, kdsIDs []string
	for _, item := range draftItems {
		key := itemToKey[item.ID]
		meta := stationMeta[key]
		idq := "'" + item.ID.String() + "'"
		if meta.outputType == "printer" {
			printerIDs = append(printerIDs, idq)
		} else {
			kdsIDs = append(kdsIDs, idq)
		}
	}

	tx, err := h.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to start transaction", Error: strPtr(err.Error())})
		return
	}
	defer tx.Rollback()

	if len(printerIDs) > 0 {
		_, err = tx.Exec(fmt.Sprintf(`
			UPDATE order_items SET status = 'ready', kot_sent_at = $1, kot_fire_generation = $2
			WHERE id IN (%s)`, strings.Join(printerIDs, ",")), now, nextGen)
		if err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to update printer line items", Error: strPtr(err.Error())})
			return
		}
	}
	if len(kdsIDs) > 0 {
		_, err = tx.Exec(fmt.Sprintf(`
			UPDATE order_items SET status = 'sent', kot_sent_at = $1, kot_fire_generation = $2
			WHERE id IN (%s)`, strings.Join(kdsIDs, ",")), now, nextGen)
		if err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to update KDS line items", Error: strPtr(err.Error())})
			return
		}
	}

	_, err = tx.Exec(`
		UPDATE orders SET
			status = CASE WHEN status = 'pending' THEN 'confirmed' ELSE status END,
			kot_first_sent_at = COALESCE(kot_first_sent_at, $2),
			is_open_tab = false
		WHERE id = $1::uuid`, orderID, now)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to update order status", Error: strPtr(err.Error())})
		return
	}

	if err := markOrderReadyIfNoKitchenPendingTx(tx, orderID, userID, now); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to finalize order readiness", Error: strPtr(err.Error())})
		return
	}

	var kots []stationKOT
	for key, items := range stationItems {
		meta := stationMeta[key]
		pl := meta.printLocation
		if meta.outputType == "kds" {
			pl = "kitchen"
		}
		kot := stationKOT{StationID: meta.id, StationName: meta.name, OutputType: meta.outputType, PrintLocation: pl}
		if meta.outputType == "printer" {
			kot.Payload = buildPrinterKOT(orderNumber, tableNumber, serverDisplay, meta.name, items, orderCreatedAt, now, false)
		} else {
			kot.Payload = kdsPayload{
				StationID: meta.id, StationName: meta.name,
				OrderNumber: orderNumber, TableNumber: tableNumber,
				Items: items, FiredAt: now, IsVoid: false,
			}
		}
		kots = append(kots, kot)
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to commit KOT", Error: strPtr(err.Error())})
		return
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: fmt.Sprintf("KOT fired: %d items to %d station(s)", len(draftItems), len(kots)), Data: map[string]interface{}{"kots": kots}})
}

func (h *KOTHandler) VoidItem(c *gin.Context) {
	orderID := c.Param("id")
	itemID := c.Param("item_id")
	userID, _, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, models.APIResponse{Success: false, Message: "Authentication required"})
		return
	}

	var req struct {
		Pin    string `json:"pin" binding:"required"`
		Reason string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "PIN is required", Error: strPtr(err.Error())})
		return
	}
	if len(req.Pin) != 4 {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "PIN must be 4 digits"})
		return
	}

	var managerID uuid.UUID
	var managerName string
	err := h.db.QueryRow(`SELECT id, first_name || ' ' || last_name FROM users WHERE manager_pin = $1 AND role IN ('manager','admin') AND is_active = true LIMIT 1`, req.Pin).Scan(&managerID, &managerName)
	if err != nil {
		c.JSON(http.StatusForbidden, models.APIResponse{Success: false, Message: "Invalid manager PIN"})
		return
	}

	var itemStatus, productName string
	var qty int
	var unitPrice float64
	var categoryID uuid.UUID
	err = h.db.QueryRow(`
		SELECT oi.status, p.name, oi.quantity, oi.unit_price, COALESCE(p.category_id, '00000000-0000-0000-0000-000000000000')
		FROM order_items oi JOIN products p ON oi.product_id = p.id
		WHERE oi.id = $1 AND oi.order_id = $2
	`, itemID, orderID).Scan(&itemStatus, &productName, &qty, &unitPrice, &categoryID)
	if err != nil {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Item not found"})
		return
	}

	if itemStatus != "sent" && itemStatus != "preparing" && itemStatus != "ready" {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: fmt.Sprintf("Cannot void item with status '%s'. Only sent/preparing/ready items can be voided.", itemStatus)})
		return
	}

	tx, _ := h.db.Begin()
	defer tx.Rollback()

	_, err = tx.Exec(`UPDATE order_items SET status = 'voided' WHERE id = $1`, itemID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to void item", Error: strPtr(err.Error())})
		return
	}

	reasonPtr := &req.Reason
	if req.Reason == "" {
		reasonPtr = nil
	}
	_, err = tx.Exec(`INSERT INTO void_log (order_id, order_item_id, voided_by, authorized_by, item_name, quantity, unit_price, reason) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		orderID, itemID, userID, managerID, productName, qty, unitPrice, reasonPtr)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to log void", Error: strPtr(err.Error())})
		return
	}

	// Recalculate order totals excluding voided items
	var newSubtotal float64
	tx.QueryRow(`SELECT COALESCE(SUM(total_price),0) FROM order_items WHERE order_id = $1 AND status != 'voided'`, orderID).Scan(&newSubtotal)
	newTax := newSubtotal * 0.10
	newTotal := newSubtotal + newTax
	tx.Exec(`UPDATE orders SET subtotal = $1, tax_amount = $2, total_amount = $3 WHERE id = $4`, newSubtotal, newTax, newTotal, orderID)

	// Build VOID KOT for the station
	var voidKOT *stationKOT
	var stationID uuid.UUID
	var stationName, outputType string
	sErr := h.db.QueryRow(`
		SELECT ks.id, ks.name, ks.output_type FROM category_station_map csm
		JOIN kitchen_stations ks ON csm.station_id = ks.id
		WHERE csm.category_id = $1 AND ks.is_active = true LIMIT 1
	`, categoryID).Scan(&stationID, &stationName, &outputType)
	if sErr == nil {
		var orderNumber, tableNumber, voidServer string
		var voidOrderCreated time.Time
		h.db.QueryRow(`
			SELECT o.order_number, COALESCE(dt.table_number,'N/A'),
				COALESCE(NULLIF(TRIM(CONCAT_WS(' ', su.first_name, su.last_name)), ''), su.username, '—'),
				o.created_at
			FROM orders o
			LEFT JOIN dining_tables dt ON o.table_id = dt.id
			LEFT JOIN users su ON o.user_id = su.id
			WHERE o.id = $1`, orderID).Scan(&orderNumber, &tableNumber, &voidServer, &voidOrderCreated)

		voidItems := []kotItem{{ProductName: productName, Quantity: qty}}
		now := time.Now()
		sk := stationKOT{StationID: stationID, StationName: stationName, OutputType: outputType}
		if outputType == "printer" {
			sk.Payload = buildPrinterKOT(orderNumber, tableNumber, voidServer, stationName, voidItems, voidOrderCreated, now, true)
		} else {
			sk.Payload = kdsPayload{StationID: stationID, StationName: stationName, OrderNumber: orderNumber, TableNumber: tableNumber, Items: voidItems, FiredAt: now, IsVoid: true}
		}
		voidKOT = &sk
	}

	tx.Commit()
	c.JSON(http.StatusOK, models.APIResponse{
		Success: true, Message: fmt.Sprintf("Item '%s' voided. Authorized by %s", productName, managerName),
		Data: map[string]interface{}{"void_kot": voidKOT, "authorized_by": managerName},
	})
}

// AddItemsToOrder adds new draft items to an existing order
func (h *KOTHandler) AddItemsToOrder(c *gin.Context) {
	orderID := c.Param("id")

	var req struct {
		Items []struct {
			ProductID           uuid.UUID `json:"product_id" binding:"required"`
			Quantity            int       `json:"quantity" binding:"required"`
			SpecialInstructions *string   `json:"special_instructions"`
		} `json:"items" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid request", Error: strPtr(err.Error())})
		return
	}

	tx, _ := h.db.Begin()
	defer tx.Rollback()

	for _, item := range req.Items {
		var price float64
		err := h.db.QueryRow(`SELECT price FROM products WHERE id = $1 AND is_available = true`, item.ProductID).Scan(&price)
		if err != nil {
			c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: fmt.Sprintf("Product %s not available", item.ProductID)})
			return
		}
		totalPrice := price * float64(item.Quantity)
		_, err = tx.Exec(`INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price, special_instructions, status)
			VALUES ($1,$2,$3,$4,$5,$6,'draft')`, orderID, item.ProductID, item.Quantity, price, totalPrice, item.SpecialInstructions)
		if err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to add item", Error: strPtr(err.Error())})
			return
		}
	}

	// Recalculate totals
	var newSubtotal float64
	tx.QueryRow(`SELECT COALESCE(SUM(total_price),0) FROM order_items WHERE order_id = $1 AND status != 'voided'`, orderID).Scan(&newSubtotal)
	newTax := newSubtotal * 0.10
	newTotal := newSubtotal + newTax
	tx.Exec(`UPDATE orders SET subtotal = $1, tax_amount = $2, total_amount = $3 WHERE id = $4`, newSubtotal, newTax, newTotal, orderID)

	tx.Commit()
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: fmt.Sprintf("%d item(s) added as draft", len(req.Items))})
}

// RemoveDraftItem removes a draft item from an order
func (h *KOTHandler) RemoveDraftItem(c *gin.Context) {
	orderID := c.Param("id")
	itemID := c.Param("item_id")

	var status string
	err := h.db.QueryRow(`SELECT status FROM order_items WHERE id = $1 AND order_id = $2`, itemID, orderID).Scan(&status)
	if err != nil {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Item not found"})
		return
	}
	if status != "draft" && status != "pending" {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Only unsent items (draft or pending) can be removed"})
		return
	}

	h.db.Exec(`DELETE FROM order_items WHERE id = $1`, itemID)

	var newSubtotal float64
	h.db.QueryRow(`SELECT COALESCE(SUM(total_price),0) FROM order_items WHERE order_id = $1 AND status != 'voided'`, orderID).Scan(&newSubtotal)
	newTax := newSubtotal * 0.10
	newTotal := newSubtotal + newTax
	h.db.Exec(`UPDATE orders SET subtotal = $1, tax_amount = $2, total_amount = $3 WHERE id = $4`, newSubtotal, newTax, newTotal, orderID)

	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Draft item removed"})
}

// KitchenBump marks the order complete at the pass: food ready for server pickup, removes from active KDS.
func (h *KOTHandler) KitchenBump(c *gin.Context) {
	orderIDStr := c.Param("id")
	parsed, err := uuid.Parse(orderIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid order id"})
		return
	}
	userID, _, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, models.APIResponse{Success: false, Message: "Authentication required"})
		return
	}

	idStr := parsed.String()
	var prevStatus string
	var kotFirst sql.NullTime
	var tableID sql.NullString
	err = h.db.QueryRow(`
		SELECT status, kot_first_sent_at, table_id FROM orders WHERE id = $1::uuid`, idStr).Scan(&prevStatus, &kotFirst, &tableID)
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Order not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to load order", Error: strPtr(err.Error())})
		return
	}
	if prevStatus == "ready" {
		c.JSON(http.StatusOK, models.APIResponse{
			Success: true,
			Message: "Order already at pass",
			Data: map[string]interface{}{
				"order_id":         idStr,
				"ready_for_pickup": true,
			},
		})
		return
	}

	if prevStatus != "confirmed" && prevStatus != "preparing" {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Order is not active on KDS"})
		return
	}

	bumpedAt := time.Now()
	var completionSeconds int
	if kotFirst.Valid {
		completionSeconds = int(bumpedAt.Sub(kotFirst.Time).Seconds())
	}

	tx, err := h.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Transaction failed", Error: strPtr(err.Error())})
		return
	}
	defer tx.Rollback()

	res, err := tx.Exec(`
		UPDATE orders SET status = 'ready', kitchen_bumped_at = $2, updated_at = CURRENT_TIMESTAMP
		WHERE id = $1::uuid AND status IN ('confirmed','preparing')`, idStr, bumpedAt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to bump order", Error: strPtr(err.Error())})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		c.JSON(http.StatusConflict, models.APIResponse{Success: false, Message: "Order could not be bumped — status may have changed. Refresh the line."})
		return
	}

	_, err = tx.Exec(`
		INSERT INTO order_status_history (order_id, previous_status, new_status, changed_by, notes)
		VALUES ($1::uuid, $2, 'ready', $3, $4)`,
		idStr, prevStatus, userID, fmt.Sprintf("kitchen_bump completion_seconds=%d", completionSeconds))
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to log status", Error: strPtr(err.Error())})
		return
	}

	if err = tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Commit failed", Error: strPtr(err.Error())})
		return
	}

	var tableIDOut interface{}
	if tableID.Valid {
		tableIDOut = tableID.String
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Order bumped — ready for pickup",
		Data: map[string]interface{}{
			"order_id":           idStr,
			"completion_seconds": completionSeconds,
			"kitchen_bumped_at":  bumpedAt,
			"table_id":           tableIDOut,
			"ready_for_pickup":   true,
		},
	})
}

// markOrderReadyIfNoKitchenPendingTx sets order to ready when nothing is waiting on KDS (sent/preparing)
// or unfired (draft/pending). Used when all lines are thermal-printer (ready) or voided.
func markOrderReadyIfNoKitchenPendingTx(tx *sql.Tx, orderID string, userID uuid.UUID, now time.Time) error {
	var pending int
	err := tx.QueryRow(`
		SELECT COUNT(*) FROM order_items
		WHERE order_id = $1::uuid AND status IN ('sent','preparing','draft','pending')`, orderID).Scan(&pending)
	if err != nil {
		return err
	}
	if pending > 0 {
		return nil
	}
	var prev string
	err = tx.QueryRow(`SELECT status FROM orders WHERE id = $1::uuid`, orderID).Scan(&prev)
	if err != nil {
		return err
	}
	if prev != "pending" && prev != "confirmed" && prev != "preparing" {
		return nil
	}
	res, err := tx.Exec(`
		UPDATE orders SET status = 'ready', kitchen_bumped_at = COALESCE(kitchen_bumped_at, $2), updated_at = CURRENT_TIMESTAMP
		WHERE id = $1::uuid AND status IN ('pending','confirmed','preparing')`, orderID, now)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return nil
	}
	var changedBy interface{}
	if userID != uuid.Nil {
		changedBy = userID
	}
	_, err = tx.Exec(`
		INSERT INTO order_status_history (order_id, previous_status, new_status, changed_by, notes)
		VALUES ($1::uuid, $2, 'ready', $3, $4)`,
		orderID, prev, changedBy, "auto_ready_thermal_kot_no_kds_pending")
	return err
}

func buildPrinterKOT(orderNo, tableNo, serverName, station string, items []kotItem, orderPlacedAt, firedAt time.Time, isVoid bool) string {
	var b strings.Builder
	b.WriteString("================================\n")
	if isVoid {
		b.WriteString("       *** VOID KOT ***\n")
	} else {
		b.WriteString("         KITCHEN ORDER\n")
	}
	b.WriteString("================================\n")
	b.WriteString(fmt.Sprintf("Station:  %s\n", station))
	b.WriteString(fmt.Sprintf("Order:    %s\n", orderNo))
	b.WriteString(fmt.Sprintf("Table:    %s\n", tableNo))
	b.WriteString(fmt.Sprintf("Server:   %s\n", serverName))
	b.WriteString(fmt.Sprintf("Placed:   %s\n", orderPlacedAt.Format("2006-01-02 15:04")))
	b.WriteString(fmt.Sprintf("Fired:    %s\n", firedAt.Format("15:04:05")))
	b.WriteString("--------------------------------\n")
	for _, item := range items {
		line := fmt.Sprintf("  %dx  %s", item.Quantity, item.ProductName)
		b.WriteString(line + "\n")
		if item.SpecialInstructions != nil && *item.SpecialInstructions != "" {
			b.WriteString(fmt.Sprintf("       >> %s\n", *item.SpecialInstructions))
		}
	}
	b.WriteString("================================\n")
	return b.String()
}
