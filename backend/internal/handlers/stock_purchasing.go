package handlers

import (
	"database/sql"
	"fmt"
	"math"
	"net/http"
	"strings"
	"time"

	"pos-backend/internal/middleware"
	"pos-backend/internal/models"

	"github.com/gin-gonic/gin"
)

// ---------- Suppliers ----------

func (h *StockHandler) ListSuppliers(c *gin.Context) {
	rows, err := h.db.Query(`SELECT id, name, contact_name, phone, email, notes, is_active, created_at, updated_at
		FROM suppliers WHERE is_active = true ORDER BY name ASC`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to list suppliers", Error: strPtr(err.Error())})
		return
	}
	defer rows.Close()

	type row struct {
		ID          string    `json:"id"`
		Name        string    `json:"name"`
		ContactName *string   `json:"contact_name"`
		Phone       *string   `json:"phone"`
		Email       *string   `json:"email"`
		Notes       *string   `json:"notes"`
		IsActive    bool      `json:"is_active"`
		CreatedAt   time.Time `json:"created_at"`
		UpdatedAt   time.Time `json:"updated_at"`
	}
	var out []row
	for rows.Next() {
		var r row
		var cn, ph, em, nt sql.NullString
		if err := rows.Scan(&r.ID, &r.Name, &cn, &ph, &em, &nt, &r.IsActive, &r.CreatedAt, &r.UpdatedAt); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to scan supplier", Error: strPtr(err.Error())})
			return
		}
		if cn.Valid {
			s := cn.String
			r.ContactName = &s
		}
		if ph.Valid {
			s := ph.String
			r.Phone = &s
		}
		if em.Valid {
			s := em.String
			r.Email = &s
		}
		if nt.Valid {
			s := nt.String
			r.Notes = &s
		}
		out = append(out, r)
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Suppliers retrieved", Data: out})
}

func (h *StockHandler) CreateSupplier(c *gin.Context) {
	var req struct {
		Name        string  `json:"name" binding:"required"`
		ContactName *string `json:"contact_name"`
		Phone       *string `json:"phone"`
		Email       *string `json:"email"`
		Notes       *string `json:"notes"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid request", Error: strPtr(err.Error())})
		return
	}
	var id string
	err := h.db.QueryRow(`INSERT INTO suppliers (name, contact_name, phone, email, notes) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
		req.Name, req.ContactName, req.Phone, req.Email, req.Notes).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to create supplier", Error: strPtr(err.Error())})
		return
	}
	c.JSON(http.StatusCreated, models.APIResponse{Success: true, Message: "Supplier created", Data: map[string]string{"id": id}})
}

func (h *StockHandler) UpdateSupplier(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Name        *string `json:"name"`
		ContactName *string `json:"contact_name"`
		Phone       *string `json:"phone"`
		Email       *string `json:"email"`
		Notes       *string `json:"notes"`
		IsActive    *bool   `json:"is_active"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid request", Error: strPtr(err.Error())})
		return
	}
	sets, args, n := buildUpdates(map[string]interface{}{
		"name": req.Name, "contact_name": req.ContactName, "phone": req.Phone, "email": req.Email, "notes": req.Notes, "is_active": req.IsActive,
	})
	if len(sets) == 0 {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "No fields to update"})
		return
	}
	sets = append(sets, "updated_at = CURRENT_TIMESTAMP")
	args = append(args, id)
	q := fmt.Sprintf("UPDATE suppliers SET %s WHERE id = $%d", strings.Join(sets, ", "), n+1)
	res, err := h.db.Exec(q, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to update supplier", Error: strPtr(err.Error())})
		return
	}
	if ra, _ := res.RowsAffected(); ra == 0 {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Supplier not found"})
		return
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Supplier updated"})
}

func (h *StockHandler) DeleteSupplier(c *gin.Context) {
	id := c.Param("id")
	var n int
	h.db.QueryRow(`SELECT COUNT(*) FROM purchase_orders WHERE supplier_id = $1`, id).Scan(&n)
	if n > 0 {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Cannot delete supplier with purchase orders", Error: strPtr("supplier_has_pos")})
		return
	}
	res, err := h.db.Exec(`DELETE FROM suppliers WHERE id = $1`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to delete supplier", Error: strPtr(err.Error())})
		return
	}
	if ra, _ := res.RowsAffected(); ra == 0 {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Supplier not found"})
		return
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Supplier deleted"})
}

// ---------- Purchase orders ----------

type poLineIn struct {
	StockItemID      string   `json:"stock_item_id" binding:"required"`
	QuantityOrdered  float64  `json:"quantity_ordered" binding:"required"`
	UnitCost         *float64 `json:"unit_cost"`
}

func (h *StockHandler) ListPurchaseOrders(c *gin.Context) {
	page, perPage := parsePagination(c)
	offset := (page - 1) * perPage
	status := strings.TrimSpace(c.Query("status"))

	qb := `SELECT po.id, po.supplier_id, s.name, po.status, po.expected_date, po.notes, po.created_at,
	              (SELECT COALESCE(SUM(pol.quantity_ordered),0) FROM purchase_order_lines pol WHERE pol.purchase_order_id = po.id)
	       FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id WHERE 1=1`
	args := []interface{}{}
	n := 0
	if status != "" {
		n++
		qb += fmt.Sprintf(" AND po.status = $%d", n)
		args = append(args, status)
	}
	countQ := `SELECT COUNT(*) FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id WHERE 1=1`
	countArgs := []interface{}{}
	cn := 0
	if status != "" {
		cn++
		countQ += fmt.Sprintf(" AND po.status = $%d", cn)
		countArgs = append(countArgs, status)
	}
	var total int
	h.db.QueryRow(countQ, countArgs...).Scan(&total)
	n++
	qb += fmt.Sprintf(" ORDER BY po.created_at DESC LIMIT $%d", n)
	args = append(args, perPage)
	n++
	qb += fmt.Sprintf(" OFFSET $%d", n)
	args = append(args, offset)

	rows, err := h.db.Query(qb, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to list purchase orders", Error: strPtr(err.Error())})
		return
	}
	defer rows.Close()

	type poRow struct {
		ID           string     `json:"id"`
		SupplierID   string     `json:"supplier_id"`
		SupplierName string     `json:"supplier_name"`
		Status       string     `json:"status"`
		ExpectedDate *string    `json:"expected_date"`
		Notes        *string    `json:"notes"`
		CreatedAt    time.Time  `json:"created_at"`
		TotalOrdered float64    `json:"total_ordered_qty"`
	}
	var list []poRow
	for rows.Next() {
		var r poRow
		var exp sql.NullString
		if err := rows.Scan(&r.ID, &r.SupplierID, &r.SupplierName, &r.Status, &exp, &r.Notes, &r.CreatedAt, &r.TotalOrdered); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to scan PO", Error: strPtr(err.Error())})
			return
		}
		if exp.Valid {
			r.ExpectedDate = &exp.String
		}
		list = append(list, r)
	}
	c.JSON(http.StatusOK, models.PaginatedResponse{
		Success: true, Message: "Purchase orders retrieved", Data: list,
		Meta: models.MetaData{CurrentPage: page, PerPage: perPage, Total: total, TotalPages: int(math.Ceil(float64(total) / float64(perPage)))},
	})
}

func (h *StockHandler) GetPurchaseOrder(c *gin.Context) {
	poID := c.Param("id")
	var status string
	var supplierID, supplierName string
	var exp sql.NullString
	var notes sql.NullString
	var createdAt time.Time
	err := h.db.QueryRow(`
		SELECT po.status, po.supplier_id, s.name, po.expected_date, po.notes, po.created_at
		FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id WHERE po.id = $1`, poID).Scan(&status, &supplierID, &supplierName, &exp, &notes, &createdAt)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Purchase order not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to load PO", Error: strPtr(err.Error())})
		return
	}
	rows, err := h.db.Query(`
		SELECT pol.id, pol.stock_item_id, si.name, si.unit, pol.quantity_ordered, pol.unit_cost, pol.quantity_received
		FROM purchase_order_lines pol JOIN stock_items si ON si.id = pol.stock_item_id
		WHERE pol.purchase_order_id = $1 ORDER BY pol.created_at ASC`, poID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to load lines", Error: strPtr(err.Error())})
		return
	}
	defer rows.Close()
	var lines []models.PurchaseOrderLineDetail
	for rows.Next() {
		var ln models.PurchaseOrderLineDetail
		var uc sql.NullFloat64
		if err := rows.Scan(&ln.ID, &ln.StockItemID, &ln.ItemName, &ln.Unit, &ln.QuantityOrdered, &uc, &ln.QuantityReceived); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to scan line", Error: strPtr(err.Error())})
			return
		}
		if uc.Valid {
			v := uc.Float64
			ln.UnitCost = &v
		}
		lines = append(lines, ln)
	}
	var expPtr *string
	if exp.Valid {
		s := exp.String
		expPtr = &s
	}
	out := models.PurchaseOrderDetail{
		ID: poID, Status: status, SupplierID: supplierID, SupplierName: supplierName,
		ExpectedDate: expPtr, Notes: nullStrToPtr(notes), CreatedAt: createdAt, Lines: lines,
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Purchase order retrieved", Data: out})
}

func nullStrToPtr(ns sql.NullString) *string {
	if !ns.Valid {
		return nil
	}
	s := ns.String
	return &s
}

func (h *StockHandler) CreatePurchaseOrder(c *gin.Context) {
	userID, _, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, models.APIResponse{Success: false, Message: "Authentication required"})
		return
	}
	var req struct {
		SupplierID    string    `json:"supplier_id" binding:"required"`
		ExpectedDate  *string   `json:"expected_date"`
		Notes         *string   `json:"notes"`
		Lines         []poLineIn `json:"lines" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid request", Error: strPtr(err.Error())})
		return
	}
	if len(req.Lines) == 0 {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "At least one line is required"})
		return
	}

	tx, err := h.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Transaction error", Error: strPtr(err.Error())})
		return
	}
	defer tx.Rollback()

	var exp interface{}
	if req.ExpectedDate != nil && strings.TrimSpace(*req.ExpectedDate) != "" {
		exp = strings.TrimSpace(*req.ExpectedDate)
	} else {
		exp = nil
	}

	var poID string
	err = tx.QueryRow(`
		INSERT INTO purchase_orders (supplier_id, status, expected_date, notes, created_by)
		VALUES ($1, 'draft', $2, $3, $4) RETURNING id`,
		req.SupplierID, exp, req.Notes, userID).Scan(&poID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to create PO", Error: strPtr(err.Error())})
		return
	}
	for _, ln := range req.Lines {
		if ln.QuantityOrdered <= 0 {
			c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Line quantity must be positive"})
			return
		}
		if _, err := tx.Exec(`INSERT INTO purchase_order_lines (purchase_order_id, stock_item_id, quantity_ordered, unit_cost)
			VALUES ($1, $2, $3, $4)`, poID, ln.StockItemID, ln.QuantityOrdered, ln.UnitCost); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to add PO line", Error: strPtr(err.Error())})
			return
		}
	}
	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Commit failed", Error: strPtr(err.Error())})
		return
	}
	c.JSON(http.StatusCreated, models.APIResponse{Success: true, Message: "Purchase order created", Data: map[string]string{"id": poID}})
}

func (h *StockHandler) SubmitPurchaseOrder(c *gin.Context) {
	poID := c.Param("id")
	res, err := h.db.Exec(`UPDATE purchase_orders SET status = 'ordered', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'draft'`, poID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to submit PO", Error: strPtr(err.Error())})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "PO not found or not in draft status"})
		return
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Purchase order submitted"})
}

func (h *StockHandler) CancelPurchaseOrder(c *gin.Context) {
	poID := c.Param("id")
	res, err := h.db.Exec(`UPDATE purchase_orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status IN ('draft', 'ordered', 'partially_received')`, poID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to cancel PO", Error: strPtr(err.Error())})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "PO cannot be cancelled"})
		return
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Purchase order cancelled"})
}

type receiveLine struct {
	LineID           string   `json:"line_id" binding:"required"`
	QuantityReceived float64  `json:"quantity_received" binding:"required"`
	UnitCost         *float64 `json:"unit_cost"`
	ExpiryDate       *string  `json:"expiry_date"`
}

func (h *StockHandler) ReceivePurchaseOrder(c *gin.Context) {
	poID := c.Param("id")
	userID, _, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, models.APIResponse{Success: false, Message: "Authentication required"})
		return
	}
	var req struct {
		Lines []receiveLine `json:"lines" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid request", Error: strPtr(err.Error())})
		return
	}

	tx, err := h.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Transaction error", Error: strPtr(err.Error())})
		return
	}
	defer tx.Rollback()

	var poStatus string
	err = tx.QueryRow(`SELECT status FROM purchase_orders WHERE id = $1 FOR UPDATE`, poID).Scan(&poStatus)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Purchase order not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to lock PO", Error: strPtr(err.Error())})
		return
	}
	if poStatus != "ordered" && poStatus != "partially_received" {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "PO cannot receive in current status"})
		return
	}

	for _, rl := range req.Lines {
		if rl.QuantityReceived <= 0 {
			continue
		}
		var stockItemID string
		var ordered, already float64
		var lineUnitCost sql.NullFloat64
		err = tx.QueryRow(`
			SELECT stock_item_id, quantity_ordered, quantity_received, unit_cost
			FROM purchase_order_lines WHERE id = $1 AND purchase_order_id = $2 FOR UPDATE`,
			rl.LineID, poID).Scan(&stockItemID, &ordered, &already, &lineUnitCost)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Unknown line: " + rl.LineID})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to load line", Error: strPtr(err.Error())})
			return
		}
		if already+rl.QuantityReceived > ordered+0.0001 {
			c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: fmt.Sprintf("Receive qty exceeds open qty for line %s", rl.LineID)})
			return
		}
		uc := rl.UnitCost
		if uc == nil && lineUnitCost.Valid {
			v := lineUnitCost.Float64
			uc = &v
		}
		var totalCost *float64
		if uc != nil {
			t := rl.QuantityReceived * *uc
			totalCost = &t
		}

		var movementID string
		note := fmt.Sprintf("PO %s line receive", poID[:8])
		err = tx.QueryRow(`INSERT INTO stock_movements (stock_item_id, movement_type, quantity, unit_cost, total_cost, created_by, note, supplier_id, purchase_order_id)
			VALUES ($1, 'purchase', $2, $3, $4, $5, $6,
			  (SELECT supplier_id FROM purchase_orders WHERE id = $7), $7) RETURNING id`,
			stockItemID, rl.QuantityReceived, uc, totalCost, userID, note, poID).Scan(&movementID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to record movement", Error: strPtr(err.Error())})
			return
		}

		updateCost := ""
		args := []interface{}{rl.QuantityReceived, stockItemID}
		if uc != nil {
			updateCost = ", default_unit_cost = $3"
			args = append(args, *uc)
		}
		q := fmt.Sprintf("UPDATE stock_items SET quantity_on_hand = quantity_on_hand + $1 %s WHERE id = $2", updateCost)
		if _, err = tx.Exec(q, args...); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to update stock", Error: strPtr(err.Error())})
			return
		}

		var expPtr *time.Time
		if rl.ExpiryDate != nil && strings.TrimSpace(*rl.ExpiryDate) != "" {
			expTime, perr := time.Parse("2006-01-02", strings.TrimSpace(*rl.ExpiryDate))
			if perr != nil {
				c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid expiry_date"})
				return
			}
			expPtr = &expTime
		}
		lineIDCopy := rl.LineID
		if err := insertPurchaseBatch(tx, stockItemID, movementID, rl.QuantityReceived, uc, expPtr, &lineIDCopy); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to record batch", Error: strPtr(err.Error())})
			return
		}

		if _, err := tx.Exec(`UPDATE purchase_order_lines SET quantity_received = quantity_received + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
			rl.QuantityReceived, rl.LineID); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to update line", Error: strPtr(err.Error())})
			return
		}

		if totalCost != nil && *totalCost > 0 {
			var itemName string
			tx.QueryRow("SELECT name FROM stock_items WHERE id = $1", stockItemID).Scan(&itemName)
			desc := itemName + " (PO receive)"
			if _, err := tx.Exec(`INSERT INTO expenses (category, amount, description, reference_type, reference_id, expense_date, created_by)
				VALUES ('inventory_purchase', $1, $2, 'stock_movement', $3::uuid, CURRENT_DATE, $4)`,
				*totalCost, desc, movementID, userID); err != nil {
				c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to record expense", Error: strPtr(err.Error())})
				return
			}
		}
	}

	var open float64
	tx.QueryRow(`
		SELECT COALESCE(SUM(pol.quantity_ordered - pol.quantity_received), 0)
		FROM purchase_order_lines pol WHERE pol.purchase_order_id = $1`, poID).Scan(&open)
	newStatus := "received"
	if open > 0.0001 {
		newStatus = "partially_received"
	}
	if _, err := tx.Exec(`UPDATE purchase_orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, newStatus, poID); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to update PO status", Error: strPtr(err.Error())})
		return
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Commit failed", Error: strPtr(err.Error())})
		return
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Purchase order received"})
}
