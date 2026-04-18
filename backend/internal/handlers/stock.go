package handlers

import (
	"database/sql"
	"fmt"
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"pos-backend/internal/middleware"
	"pos-backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type StockHandler struct {
	db *sql.DB
}

func NewStockHandler(db *sql.DB) *StockHandler {
	return &StockHandler{db: db}
}

// ---------- Stock Categories ----------

func (h *StockHandler) GetStockCategories(c *gin.Context) {
	rows, err := h.db.Query(`
		SELECT sc.id, sc.name, sc.description, sc.sort_order, sc.is_active,
		       sc.created_at, sc.updated_at,
		       COUNT(si.id) AS item_count
		FROM stock_categories sc
		LEFT JOIN stock_items si ON si.category_id = sc.id AND si.is_active = true
		GROUP BY sc.id
		ORDER BY sc.sort_order ASC, sc.name ASC
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to fetch stock categories", Error: strPtr(err.Error())})
		return
	}
	defer rows.Close()

	var categories []models.StockCategory
	for rows.Next() {
		var cat models.StockCategory
		if err := rows.Scan(&cat.ID, &cat.Name, &cat.Description, &cat.SortOrder, &cat.IsActive, &cat.CreatedAt, &cat.UpdatedAt, &cat.ItemCount); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to scan category", Error: strPtr(err.Error())})
			return
		}
		categories = append(categories, cat)
	}

	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Stock categories retrieved", Data: categories})
}

func (h *StockHandler) CreateStockCategory(c *gin.Context) {
	var req struct {
		Name        string  `json:"name" binding:"required"`
		Description *string `json:"description"`
		SortOrder   int     `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid request", Error: strPtr(err.Error())})
		return
	}

	var id string
	err := h.db.QueryRow(`INSERT INTO stock_categories (name, description, sort_order) VALUES ($1,$2,$3) RETURNING id`,
		req.Name, req.Description, req.SortOrder).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to create category", Error: strPtr(err.Error())})
		return
	}

	if uid, _, _, ok := middleware.GetUserFromContext(c); ok {
		cid := id
		_ = insertInventoryActivityLog(h.db, uid, "inventory.category_create", "stock_category", &cid, "Created category: "+req.Name, map[string]interface{}{"name": req.Name})
	}
	c.JSON(http.StatusCreated, models.APIResponse{Success: true, Message: "Stock category created", Data: map[string]string{"id": id}})
}

func (h *StockHandler) UpdateStockCategory(c *gin.Context) {
	catID := c.Param("id")
	var req struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
		SortOrder   *int    `json:"sort_order"`
		IsActive    *bool   `json:"is_active"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid request", Error: strPtr(err.Error())})
		return
	}

	sets, args, n := buildUpdates(map[string]interface{}{
		"name": req.Name, "description": req.Description, "sort_order": req.SortOrder, "is_active": req.IsActive,
	})
	if len(sets) == 0 {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "No fields to update"})
		return
	}
	sets = append(sets, "updated_at = CURRENT_TIMESTAMP")
	args = append(args, catID)
	query := fmt.Sprintf("UPDATE stock_categories SET %s WHERE id = $%d", strings.Join(sets, ", "), n+1)
	res, err := h.db.Exec(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to update category", Error: strPtr(err.Error())})
		return
	}
	if ra, _ := res.RowsAffected(); ra == 0 {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Category not found"})
		return
	}
	if uid, _, _, ok := middleware.GetUserFromContext(c); ok {
		cid := catID
		_ = insertInventoryActivityLog(h.db, uid, "inventory.category_update", "stock_category", &cid, "Updated stock category", map[string]interface{}{
			"name": req.Name, "description": req.Description, "sort_order": req.SortOrder, "is_active": req.IsActive,
		})
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Stock category updated"})
}

func (h *StockHandler) DeleteStockCategory(c *gin.Context) {
	catID := c.Param("id")
	var catName string
	_ = h.db.QueryRow("SELECT name FROM stock_categories WHERE id = $1", catID).Scan(&catName)
	var count int
	h.db.QueryRow("SELECT COUNT(*) FROM stock_items WHERE category_id = $1", catID).Scan(&count)
	if count > 0 {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Cannot delete category with existing items", Error: strPtr("category_has_items")})
		return
	}
	res, err := h.db.Exec("DELETE FROM stock_categories WHERE id = $1", catID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to delete category", Error: strPtr(err.Error())})
		return
	}
	if ra, _ := res.RowsAffected(); ra == 0 {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Category not found"})
		return
	}
	if uid, _, _, ok := middleware.GetUserFromContext(c); ok {
		cid := catID
		summary := "Deleted stock category"
		if catName != "" {
			summary = "Deleted stock category: " + catName
		}
		_ = insertInventoryActivityLog(h.db, uid, "inventory.category_delete", "stock_category", &cid, summary, map[string]interface{}{"name": catName})
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Stock category deleted"})
}

// ---------- Stock Items ----------

func (h *StockHandler) GetStockItems(c *gin.Context) {
	page, perPage := parsePagination(c)
	offset := (page - 1) * perPage
	categoryID := c.Query("category_id")
	search := c.Query("search")
	lowStockOnly := c.Query("low_stock") == "true"
	stockHealth := strings.TrimSpace(strings.ToLower(c.Query("stock_health")))

	qb := `SELECT si.id, si.category_id, si.name, si.unit, si.quantity_on_hand, si.reorder_level,
	              si.default_unit_cost, si.notes, si.is_active, si.created_at, si.updated_at,
	              sc.id, sc.name,
	              (SELECT MIN(sb.expiry_date)::text FROM stock_batches sb
	                 WHERE sb.stock_item_id = si.id AND sb.quantity_remaining > 0 AND sb.expiry_date IS NOT NULL) AS earliest_expiry
	       FROM stock_items si
	       LEFT JOIN stock_categories sc ON si.category_id = sc.id
	       WHERE si.is_active = true`
	args := []interface{}{}
	n := 0

	if categoryID != "" {
		n++
		qb += fmt.Sprintf(" AND si.category_id = $%d", n)
		args = append(args, categoryID)
	}
	if search != "" {
		n++
		qb += fmt.Sprintf(" AND si.name ILIKE $%d", n)
		args = append(args, "%"+search+"%")
	}
	if lowStockOnly {
		qb += " AND si.quantity_on_hand <= si.reorder_level"
	}
	if stockHealth == "low" {
		qb += " AND si.quantity_on_hand <= si.reorder_level"
	} else if stockHealth == "ok" {
		qb += " AND si.quantity_on_hand > si.reorder_level"
	}

	var total int
	countQ := "SELECT COUNT(*) FROM (" + qb + ") q"
	h.db.QueryRow(countQ, args...).Scan(&total)

	sortKey := strings.ToLower(strings.TrimSpace(c.DefaultQuery("sort", "category")))
	sortDir := strings.ToUpper(strings.TrimSpace(c.DefaultQuery("sort_dir", "asc")))
	if sortDir != "ASC" && sortDir != "DESC" {
		sortDir = "ASC"
	}
	orderParts := []string{}
	switch sortKey {
	case "name":
		orderParts = append(orderParts, "LOWER(si.name) "+sortDir)
	case "on_hand", "qty":
		orderParts = append(orderParts, "si.quantity_on_hand "+sortDir)
	case "reorder":
		orderParts = append(orderParts, "si.reorder_level "+sortDir)
	case "unit_cost", "cost":
		orderParts = append(orderParts, "si.default_unit_cost NULLS LAST "+sortDir)
	case "expiry":
		orderParts = append(orderParts, `(SELECT MIN(sb.expiry_date) FROM stock_batches sb WHERE sb.stock_item_id = si.id AND sb.quantity_remaining > 0.000001 AND sb.expiry_date IS NOT NULL) NULLS LAST `+sortDir)
	case "category":
		// Match legacy list: category display order, then item name (A–Z).
		orderParts = append(orderParts, "sc.sort_order "+sortDir, "LOWER(si.name) ASC")
	default:
		orderParts = append(orderParts, "sc.sort_order ASC", "LOWER(COALESCE(sc.name,'')) ASC")
	}
	if sortKey != "name" && sortKey != "category" {
		orderParts = append(orderParts, "LOWER(si.name) ASC")
	}
	orderParts = append(orderParts, "si.id ASC")
	qb += " ORDER BY " + strings.Join(orderParts, ", ")
	n++
	qb += fmt.Sprintf(" LIMIT $%d", n)
	args = append(args, perPage)
	n++
	qb += fmt.Sprintf(" OFFSET $%d", n)
	args = append(args, offset)

	rows, err := h.db.Query(qb, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to fetch stock items", Error: strPtr(err.Error())})
		return
	}
	defer rows.Close()

	var items []models.StockItem
	for rows.Next() {
		var item models.StockItem
		var catID sql.NullString
		var catName sql.NullString
		var earliest sql.NullString
		if err := rows.Scan(&item.ID, &item.CategoryID, &item.Name, &item.Unit, &item.QuantityOnHand, &item.ReorderLevel,
			&item.DefaultUnitCost, &item.Notes, &item.IsActive, &item.CreatedAt, &item.UpdatedAt,
			&catID, &catName, &earliest); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to scan item", Error: strPtr(err.Error())})
			return
		}
		if catID.Valid {
			uid, _ := uuid.Parse(catID.String)
			item.Category = &models.StockCategory{ID: uid, Name: catName.String}
		}
		if earliest.Valid && earliest.String != "" {
			s := earliest.String
			item.EarliestExpiry = &s
		}
		items = append(items, item)
	}

	c.JSON(http.StatusOK, models.PaginatedResponse{
		Success: true, Message: "Stock items retrieved", Data: items,
		Meta: models.MetaData{CurrentPage: page, PerPage: perPage, Total: total, TotalPages: int(math.Ceil(float64(total) / float64(perPage)))},
	})
}

func (h *StockHandler) GetStockItem(c *gin.Context) {
	itemID := c.Param("id")
	var item models.StockItem
	var catID sql.NullString
	var catName sql.NullString
	var earliest sql.NullString
	err := h.db.QueryRow(`
		SELECT si.id, si.category_id, si.name, si.unit, si.quantity_on_hand, si.reorder_level,
		       si.default_unit_cost, si.notes, si.is_active, si.created_at, si.updated_at,
		       sc.id, sc.name,
		       (SELECT MIN(sb.expiry_date)::text FROM stock_batches sb
		          WHERE sb.stock_item_id = si.id AND sb.quantity_remaining > 0 AND sb.expiry_date IS NOT NULL)
		FROM stock_items si
		LEFT JOIN stock_categories sc ON si.category_id = sc.id
		WHERE si.id = $1`, itemID).Scan(
		&item.ID, &item.CategoryID, &item.Name, &item.Unit, &item.QuantityOnHand, &item.ReorderLevel,
		&item.DefaultUnitCost, &item.Notes, &item.IsActive, &item.CreatedAt, &item.UpdatedAt,
		&catID, &catName, &earliest)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Stock item not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to fetch item", Error: strPtr(err.Error())})
		return
	}
	if catID.Valid {
		uid, _ := uuid.Parse(catID.String)
		item.Category = &models.StockCategory{ID: uid, Name: catName.String}
	}
	if earliest.Valid && earliest.String != "" {
		s := earliest.String
		item.EarliestExpiry = &s
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Stock item retrieved", Data: item})
}

func (h *StockHandler) CreateStockItem(c *gin.Context) {
	var req struct {
		CategoryID      *string  `json:"category_id"`
		Name            string   `json:"name" binding:"required"`
		Unit            string   `json:"unit" binding:"required"`
		QuantityOnHand  float64  `json:"quantity_on_hand"`
		ReorderLevel    float64  `json:"reorder_level"`
		DefaultUnitCost *float64 `json:"default_unit_cost"`
		Notes           *string  `json:"notes"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid request", Error: strPtr(err.Error())})
		return
	}

	var id string
	err := h.db.QueryRow(`
		INSERT INTO stock_items (category_id, name, unit, quantity_on_hand, reorder_level, default_unit_cost, notes)
		VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
		req.CategoryID, req.Name, req.Unit, req.QuantityOnHand, req.ReorderLevel, req.DefaultUnitCost, req.Notes).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to create item", Error: strPtr(err.Error())})
		return
	}
	if err := insertOpeningBatch(h.db, id, req.QuantityOnHand, req.DefaultUnitCost); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to create opening stock batch", Error: strPtr(err.Error())})
		return
	}
	if uid, _, _, ok := middleware.GetUserFromContext(c); ok {
		nid := id
		_ = insertInventoryActivityLog(h.db, uid, "inventory.item_create", "stock_item", &nid, "Created stock item: "+req.Name, map[string]interface{}{
			"name": req.Name, "unit": req.Unit, "quantity_on_hand": req.QuantityOnHand,
		})
	}
	c.JSON(http.StatusCreated, models.APIResponse{Success: true, Message: "Stock item created", Data: map[string]string{"id": id}})
}

func (h *StockHandler) UpdateStockItem(c *gin.Context) {
	itemID := c.Param("id")
	var req struct {
		CategoryID      *string  `json:"category_id"`
		Name            *string  `json:"name"`
		Unit            *string  `json:"unit"`
		ReorderLevel    *float64 `json:"reorder_level"`
		DefaultUnitCost *float64 `json:"default_unit_cost"`
		Notes           *string  `json:"notes"`
		IsActive        *bool    `json:"is_active"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid request", Error: strPtr(err.Error())})
		return
	}

	sets, args, n := buildUpdates(map[string]interface{}{
		"category_id": req.CategoryID, "name": req.Name, "unit": req.Unit,
		"reorder_level": req.ReorderLevel, "default_unit_cost": req.DefaultUnitCost,
		"notes": req.Notes, "is_active": req.IsActive,
	})
	if len(sets) == 0 {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "No fields to update"})
		return
	}
	sets = append(sets, "updated_at = CURRENT_TIMESTAMP")
	args = append(args, itemID)
	query := fmt.Sprintf("UPDATE stock_items SET %s WHERE id = $%d", strings.Join(sets, ", "), n+1)
	res, err := h.db.Exec(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to update item", Error: strPtr(err.Error())})
		return
	}
	if ra, _ := res.RowsAffected(); ra == 0 {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Stock item not found"})
		return
	}
	if uid, _, _, ok := middleware.GetUserFromContext(c); ok {
		iid := itemID
		_ = insertInventoryActivityLog(h.db, uid, "inventory.item_update", "stock_item", &iid, "Updated stock item", map[string]interface{}{
			"category_id": req.CategoryID, "name": req.Name, "unit": req.Unit, "reorder_level": req.ReorderLevel,
			"default_unit_cost": req.DefaultUnitCost, "notes": req.Notes, "is_active": req.IsActive,
		})
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Stock item updated"})
}

// DeleteStockItem removes a stock item.
//
// Behavior:
//   - If the item still has remaining stock (on-hand > 0), deletion is blocked with a clear message.
//   - If the item is referenced by any purchase order line (draft or otherwise), deletion is blocked
//     with a count so the user knows why (FK is ON DELETE RESTRICT for auditability).
//   - If the item has any historical stock movements (purchase/issue/adjust), it is soft-deleted
//     (is_active = false) so historical reports / audit logs / FIFO batch history are preserved.
//     The item disappears from the inventory UI (which filters by is_active = true).
//   - Otherwise the row is hard-deleted.
func (h *StockHandler) DeleteStockItem(c *gin.Context) {
	itemID := c.Param("id")

	var (
		delName  string
		onHand   float64
		isActive bool
	)
	if err := h.db.QueryRow(`SELECT name, quantity_on_hand, is_active FROM stock_items WHERE id = $1`, itemID).
		Scan(&delName, &onHand, &isActive); err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Stock item not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to load item", Error: strPtr(err.Error())})
		return
	}

	if onHand > 0.00001 {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "Cannot delete: this item still has stock on hand. Issue or adjust it to zero first.",
			Error:   strPtr("item_has_stock"),
		})
		return
	}

	var poLineCount int
	if err := h.db.QueryRow(`SELECT COUNT(*) FROM purchase_order_lines WHERE stock_item_id = $1`, itemID).Scan(&poLineCount); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to check purchase orders", Error: strPtr(err.Error())})
		return
	}
	if poLineCount > 0 {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: fmt.Sprintf("Cannot delete: this item is on %d purchase order line(s). Cancel or remove those POs first, or archive the item instead.", poLineCount),
			Error:   strPtr("item_in_purchase_orders"),
		})
		return
	}

	var movementCount int
	if err := h.db.QueryRow(`SELECT COUNT(*) FROM stock_movements WHERE stock_item_id = $1`, itemID).Scan(&movementCount); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to check history", Error: strPtr(err.Error())})
		return
	}

	if movementCount > 0 {
		if !isActive {
			c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Stock item already archived"})
			return
		}
		if _, err := h.db.Exec(`UPDATE stock_items SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, itemID); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to archive item", Error: strPtr(err.Error())})
			return
		}
		if uid, _, _, ok := middleware.GetUserFromContext(c); ok {
			iid := itemID
			summary := "Archived stock item (history preserved)"
			if delName != "" {
				summary = "Archived stock item: " + delName + " (history preserved)"
			}
			_ = insertInventoryActivityLog(h.db, uid, "inventory.item_archive", "stock_item", &iid, summary, map[string]interface{}{
				"name":            delName,
				"movement_count":  movementCount,
				"reason":          "item had historical stock movements",
			})
		}
		c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Item archived (has historical stock activity, so history was preserved)"})
		return
	}

	res, err := h.db.Exec(`DELETE FROM stock_items WHERE id = $1`, itemID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to delete item", Error: strPtr(err.Error())})
		return
	}
	if ra, _ := res.RowsAffected(); ra == 0 {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Stock item not found"})
		return
	}
	if uid, _, _, ok := middleware.GetUserFromContext(c); ok {
		iid := itemID
		summary := "Deleted stock item"
		if delName != "" {
			summary = "Deleted stock item: " + delName
		}
		_ = insertInventoryActivityLog(h.db, uid, "inventory.item_delete", "stock_item", &iid, summary, map[string]interface{}{"name": delName})
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Stock item deleted"})
}

// ---------- Purchase & Issue ----------

func (h *StockHandler) PurchaseStock(c *gin.Context) {
	itemID := c.Param("id")
	userID, _, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, models.APIResponse{Success: false, Message: "Authentication required"})
		return
	}

	var req struct {
		Quantity            float64  `json:"quantity" binding:"required"`
		UnitCost            *float64 `json:"unit_cost"`
		Note                *string  `json:"note"`
		ExpiryDate          *string  `json:"expiry_date"` // YYYY-MM-DD
		SupplierID          *string  `json:"supplier_id"`
		PurchaseOrderID     *string  `json:"purchase_order_id"`
		PurchaseOrderLineID *string  `json:"purchase_order_line_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid request", Error: strPtr(err.Error())})
		return
	}
	if req.Quantity <= 0 {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Quantity must be positive"})
		return
	}

	var expiryPtr *time.Time
	if req.ExpiryDate != nil && strings.TrimSpace(*req.ExpiryDate) != "" {
		t, err := time.Parse("2006-01-02", strings.TrimSpace(*req.ExpiryDate))
		if err != nil {
			c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid expiry_date (use YYYY-MM-DD)", Error: strPtr(err.Error())})
			return
		}
		expiryPtr = &t
	}

	tx, err := h.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Transaction error", Error: strPtr(err.Error())})
		return
	}
	defer tx.Rollback()

	var totalCost *float64
	if req.UnitCost != nil {
		tc := req.Quantity * *req.UnitCost
		totalCost = &tc
	}

	var movementID string
	err = tx.QueryRow(`INSERT INTO stock_movements (stock_item_id, movement_type, quantity, unit_cost, total_cost, created_by, note, supplier_id, purchase_order_id)
		VALUES ($1, 'purchase', $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
		itemID, req.Quantity, req.UnitCost, totalCost, userID, req.Note, req.SupplierID, req.PurchaseOrderID).Scan(&movementID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to record purchase", Error: strPtr(err.Error())})
		return
	}

	updateCost := ""
	if req.UnitCost != nil {
		updateCost = ", default_unit_cost = $3"
	}
	qtyQuery := fmt.Sprintf("UPDATE stock_items SET quantity_on_hand = quantity_on_hand + $1 %s WHERE id = $2", updateCost)
	if req.UnitCost != nil {
		_, err = tx.Exec(qtyQuery, req.Quantity, itemID, req.UnitCost)
	} else {
		_, err = tx.Exec("UPDATE stock_items SET quantity_on_hand = quantity_on_hand + $1 WHERE id = $2", req.Quantity, itemID)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to update quantity", Error: strPtr(err.Error())})
		return
	}

	if err := insertPurchaseBatch(tx, itemID, movementID, req.Quantity, req.UnitCost, expiryPtr, req.PurchaseOrderLineID); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to record stock batch", Error: strPtr(err.Error())})
		return
	}

	var itemName string
	_ = tx.QueryRow("SELECT name FROM stock_items WHERE id = $1", itemID).Scan(&itemName)
	if totalCost != nil && *totalCost > 0 {
		desc := itemName
		if req.Note != nil && *req.Note != "" {
			desc = itemName + " - " + *req.Note
		}
		_, err = tx.Exec(`INSERT INTO expenses (category, amount, description, reference_type, reference_id, expense_date, recorded_at, created_by)
			VALUES ('inventory_purchase', $1, $2, 'stock_movement', $3, CURRENT_DATE, CURRENT_TIMESTAMP, $4)`,
			*totalCost, desc, movementID, userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to create expense record", Error: strPtr(err.Error())})
			return
		}
	}

	meta := map[string]interface{}{
		"movement_id": movementID, "stock_item_id": itemID, "quantity": req.Quantity,
	}
	if req.UnitCost != nil {
		meta["unit_cost"] = *req.UnitCost
	}
	if totalCost != nil {
		meta["total_cost"] = *totalCost
	}
	summary := fmt.Sprintf("Recorded purchase: %s +%.2f", itemName, req.Quantity)
	if err := insertInventoryActivityLog(tx, userID, "inventory.purchase", "stock_movement", &movementID, summary, meta); err != nil {
		msg, errPtr := activityLogInsertFailureResponse(err)
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: msg, Error: errPtr})
		return
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to commit purchase", Error: strPtr(err.Error())})
		return
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Purchase recorded successfully"})
}

func (h *StockHandler) IssueStock(c *gin.Context) {
	itemID := c.Param("id")
	userID, _, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, models.APIResponse{Success: false, Message: "Authentication required"})
		return
	}

	var req struct {
		Quantity        float64 `json:"quantity" binding:"required"`
		Unit            *string `json:"unit"`
		IssuedToUserID  string  `json:"issued_to_user_id" binding:"required"`
		Reason          *string `json:"reason"`
		Note            *string `json:"note"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid request", Error: strPtr(err.Error())})
		return
	}
	if req.Quantity <= 0 {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Quantity must be positive"})
		return
	}

	noteText := ""
	if req.Reason != nil && *req.Reason != "" {
		noteText = "[" + *req.Reason + "]"
	}
	if req.Note != nil && *req.Note != "" {
		if noteText != "" {
			noteText += " "
		}
		noteText += *req.Note
	}
	var notePtr *string
	if noteText != "" {
		notePtr = &noteText
	} else {
		notePtr = req.Note
	}

	tx, err := h.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Transaction error", Error: strPtr(err.Error())})
		return
	}
	defer tx.Rollback()

	var lockedQty float64
	var itemUnit string
	var defCost sql.NullFloat64
	err = tx.QueryRow(`SELECT quantity_on_hand, unit, default_unit_cost FROM stock_items WHERE id = $1 FOR UPDATE`, itemID).Scan(&lockedQty, &itemUnit, &defCost)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Stock item not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to lock stock item", Error: strPtr(err.Error())})
		return
	}

	deductQty := req.Quantity
	if req.Unit != nil && *req.Unit != "" && *req.Unit != itemUnit {
		converted, ok := convertUnits(req.Quantity, *req.Unit, itemUnit)
		if !ok {
			c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: fmt.Sprintf("Cannot convert from %s to %s", *req.Unit, itemUnit)})
			return
		}
		deductQty = converted
	}

	if lockedQty < deductQty {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: fmt.Sprintf("Insufficient stock (available: %.2f %s)", lockedQty, itemUnit), Error: strPtr("insufficient_stock")})
		return
	}

	var unitCostPtr *float64
	if defCost.Valid {
		v := defCost.Float64
		unitCostPtr = &v
	}
	if err := ensureBatchesMatchOnHand(tx, itemID, lockedQty, unitCostPtr); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to reconcile stock batches", Error: strPtr(err.Error())})
		return
	}
	if err := deductBatchesFIFO(tx, itemID, deductQty); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: err.Error(), Error: strPtr("batch_allocation")})
		return
	}

	negQty := -deductQty
	var issueMovID string
	err = tx.QueryRow(`INSERT INTO stock_movements (stock_item_id, movement_type, quantity, issued_to_user_id, created_by, note)
		VALUES ($1, 'issue', $2, $3, $4, $5) RETURNING id`, itemID, negQty, req.IssuedToUserID, userID, notePtr).Scan(&issueMovID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to record issue", Error: strPtr(err.Error())})
		return
	}
	var itemNameIssue string
	_ = tx.QueryRow("SELECT name FROM stock_items WHERE id = $1", itemID).Scan(&itemNameIssue)
	issMeta := map[string]interface{}{
		"movement_id": issueMovID, "stock_item_id": itemID, "quantity": deductQty, "issued_to_user_id": req.IssuedToUserID,
	}
	if notePtr != nil {
		issMeta["note"] = *notePtr
	}
	if err := insertInventoryActivityLog(tx, userID, "inventory.issue", "stock_movement", &issueMovID,
		fmt.Sprintf("Issued stock: %s −%.2f", itemNameIssue, deductQty), issMeta); err != nil {
		msg, errPtr := activityLogInsertFailureResponse(err)
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: msg, Error: errPtr})
		return
	}

	_, err = tx.Exec("UPDATE stock_items SET quantity_on_hand = quantity_on_hand - $1 WHERE id = $2", deductQty, itemID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to update quantity", Error: strPtr(err.Error())})
		return
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to commit issue", Error: strPtr(err.Error())})
		return
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Stock issued successfully"})
}

func (h *StockHandler) AdjustStock(c *gin.Context) {
	itemID := c.Param("id")
	userID, _, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, models.APIResponse{Success: false, Message: "Authentication required"})
		return
	}

	var req struct {
		QuantityDelta float64  `json:"quantity_delta" binding:"required"`
		UnitCost      *float64 `json:"unit_cost"`
		Reason        *string  `json:"reason"`
		Note          *string  `json:"note"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid request", Error: strPtr(err.Error())})
		return
	}
	if math.Abs(req.QuantityDelta) < 0.000001 {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "quantity_delta must be non-zero"})
		return
	}

	noteText := ""
	if req.Reason != nil && strings.TrimSpace(*req.Reason) != "" {
		noteText = "[" + strings.TrimSpace(*req.Reason) + "]"
	}
	if req.Note != nil && strings.TrimSpace(*req.Note) != "" {
		if noteText != "" {
			noteText += " "
		}
		noteText += strings.TrimSpace(*req.Note)
	}
	var notePtr *string
	if noteText != "" {
		notePtr = &noteText
	}

	tx, err := h.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Transaction error", Error: strPtr(err.Error())})
		return
	}
	defer tx.Rollback()

	var lockedQty float64
	var defCost sql.NullFloat64
	err = tx.QueryRow(`SELECT quantity_on_hand, default_unit_cost FROM stock_items WHERE id = $1 FOR UPDATE`, itemID).Scan(&lockedQty, &defCost)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Stock item not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to lock stock item", Error: strPtr(err.Error())})
		return
	}

	delta := req.QuantityDelta
	if lockedQty+delta < -0.000001 {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: fmt.Sprintf("Adjustment would make quantity negative (on hand: %.4f)", lockedQty), Error: strPtr("insufficient_stock")})
		return
	}

	var unitCostPtr *float64
	if req.UnitCost != nil {
		unitCostPtr = req.UnitCost
	} else if defCost.Valid {
		v := defCost.Float64
		unitCostPtr = &v
	}

	if delta > 0 {
		if err := ensureBatchesMatchOnHand(tx, itemID, lockedQty, unitCostPtr); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to reconcile stock batches", Error: strPtr(err.Error())})
			return
		}
		var movementID string
		err = tx.QueryRow(`INSERT INTO stock_movements (stock_item_id, movement_type, quantity, created_by, note)
			VALUES ($1, 'adjustment', $2, $3, $4) RETURNING id`,
			itemID, delta, userID, notePtr).Scan(&movementID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to record adjustment", Error: strPtr(err.Error())})
			return
		}
		if _, err = tx.Exec(`UPDATE stock_items SET quantity_on_hand = quantity_on_hand + $1 WHERE id = $2`, delta, itemID); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to update quantity", Error: strPtr(err.Error())})
			return
		}
		if err := insertPurchaseBatch(tx, itemID, movementID, delta, unitCostPtr, nil, nil); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to record stock batch", Error: strPtr(err.Error())})
			return
		}
		var adjItemName string
		_ = tx.QueryRow("SELECT name FROM stock_items WHERE id = $1", itemID).Scan(&adjItemName)
		adjMeta := map[string]interface{}{"movement_id": movementID, "stock_item_id": itemID, "quantity_delta": delta}
		if err := insertInventoryActivityLog(tx, userID, "inventory.adjust", "stock_movement", &movementID,
			fmt.Sprintf("Stock adjustment: %s %+g", adjItemName, delta), adjMeta); err != nil {
			msg, errPtr := activityLogInsertFailureResponse(err)
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: msg, Error: errPtr})
			return
		}
	} else {
		deductQty := -delta
		if err := ensureBatchesMatchOnHand(tx, itemID, lockedQty, unitCostPtr); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to reconcile stock batches", Error: strPtr(err.Error())})
			return
		}
		if err := deductBatchesFIFO(tx, itemID, deductQty); err != nil {
			c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: err.Error(), Error: strPtr("batch_allocation")})
			return
		}
		var negAdjID string
		err = tx.QueryRow(`INSERT INTO stock_movements (stock_item_id, movement_type, quantity, created_by, note)
			VALUES ($1, 'adjustment', $2, $3, $4) RETURNING id`, itemID, delta, userID, notePtr).Scan(&negAdjID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to record adjustment", Error: strPtr(err.Error())})
			return
		}
		if _, err = tx.Exec(`UPDATE stock_items SET quantity_on_hand = quantity_on_hand + $1 WHERE id = $2`, delta, itemID); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to update quantity", Error: strPtr(err.Error())})
			return
		}
		var adjItemName2 string
		_ = tx.QueryRow("SELECT name FROM stock_items WHERE id = $1", itemID).Scan(&adjItemName2)
		adjMeta2 := map[string]interface{}{"movement_id": negAdjID, "stock_item_id": itemID, "quantity_delta": delta}
		if err := insertInventoryActivityLog(tx, userID, "inventory.adjust", "stock_movement", &negAdjID,
			fmt.Sprintf("Stock adjustment: %s %+g", adjItemName2, delta), adjMeta2); err != nil {
			msg, errPtr := activityLogInsertFailureResponse(err)
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: msg, Error: errPtr})
			return
		}
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to commit adjustment", Error: strPtr(err.Error())})
		return
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Stock adjusted successfully"})
}

// ---------- Alerts ----------

func (h *StockHandler) GetStockAlerts(c *gin.Context) {
	rows, err := h.db.Query(`
		SELECT si.id, si.name, si.unit, si.quantity_on_hand, si.reorder_level,
		       sc.name AS category_name
		FROM stock_items si
		LEFT JOIN stock_categories sc ON si.category_id = sc.id
		WHERE si.is_active = true AND si.quantity_on_hand <= si.reorder_level
		ORDER BY (si.quantity_on_hand / NULLIF(si.reorder_level,0)) ASC, si.name ASC
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to fetch alerts", Error: strPtr(err.Error())})
		return
	}
	defer rows.Close()

	type AlertItem struct {
		ID             uuid.UUID `json:"id"`
		Name           string    `json:"name"`
		Unit           string    `json:"unit"`
		QuantityOnHand float64   `json:"quantity_on_hand"`
		ReorderLevel   float64   `json:"reorder_level"`
		CategoryName   string    `json:"category_name"`
	}

	var alerts []AlertItem
	for rows.Next() {
		var a AlertItem
		var catName sql.NullString
		if err := rows.Scan(&a.ID, &a.Name, &a.Unit, &a.QuantityOnHand, &a.ReorderLevel, &catName); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to scan alert", Error: strPtr(err.Error())})
			return
		}
		a.CategoryName = catName.String
		alerts = append(alerts, a)
	}

	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Stock alerts retrieved", Data: alerts})
}

// ---------- Reports ----------

func (h *StockHandler) GetMovementsReport(c *gin.Context) {
	page, perPage := parsePagination(c)
	offset := (page - 1) * perPage
	categoryID := c.Query("category_id")
	movementType := c.Query("type")
	from := c.Query("from")
	to := c.Query("to")

	qb := `SELECT sm.id, sm.stock_item_id, sm.movement_type, sm.quantity, sm.unit_cost, sm.total_cost,
	              sm.issued_to_user_id, sm.created_by, sm.note, sm.created_at,
	              si.name AS item_name, si.unit,
	              iu.first_name AS issued_fn, iu.last_name AS issued_ln,
	              cu.first_name AS created_fn, cu.last_name AS created_ln,
	              sm.voided_at, sm.void_reason,
	              (sm.movement_type = 'purchase' AND sm.voided_at IS NULL AND NOT EXISTS (
	                  SELECT 1 FROM stock_batches sb
	                  WHERE sb.stock_movement_id = sm.id
	                    AND (sb.initial_quantity - sb.quantity_remaining) > 0.00001
	              )) AS purchase_can_void
	       FROM stock_movements sm
	       JOIN stock_items si ON sm.stock_item_id = si.id
	       LEFT JOIN users iu ON sm.issued_to_user_id = iu.id
	       LEFT JOIN users cu ON sm.created_by = cu.id
	       WHERE 1=1`
	args := []interface{}{}
	n := 0

	if categoryID != "" {
		n++
		qb += fmt.Sprintf(" AND si.category_id = $%d", n)
		args = append(args, categoryID)
	}
	if movementType != "" {
		n++
		qb += fmt.Sprintf(" AND sm.movement_type = $%d", n)
		args = append(args, movementType)
	}
	if from != "" {
		n++
		qb += fmt.Sprintf(" AND sm.created_at >= $%d", n)
		args = append(args, from)
	}
	if to != "" {
		if t, err := time.Parse("2006-01-02", to); err == nil {
			t = t.AddDate(0, 0, 1)
			n++
			qb += fmt.Sprintf(" AND sm.created_at < $%d", n)
			args = append(args, t.Format("2006-01-02"))
		}
	}

	var total int
	h.db.QueryRow("SELECT COUNT(*) FROM ("+qb+") q", args...).Scan(&total)

	qb += " ORDER BY sm.created_at DESC"
	n++
	qb += fmt.Sprintf(" LIMIT $%d", n)
	args = append(args, perPage)
	n++
	qb += fmt.Sprintf(" OFFSET $%d", n)
	args = append(args, offset)

	rows, err := h.db.Query(qb, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to fetch movements", Error: strPtr(err.Error())})
		return
	}
	defer rows.Close()

	type MovementRow struct {
		ID               uuid.UUID  `json:"id"`
		StockItemID      uuid.UUID  `json:"stock_item_id"`
		MovementType     string     `json:"movement_type"`
		Quantity         float64    `json:"quantity"`
		UnitCost         *float64   `json:"unit_cost"`
		TotalCost        *float64   `json:"total_cost"`
		IssuedToUserID   *uuid.UUID `json:"issued_to_user_id"`
		CreatedBy        *uuid.UUID `json:"created_by"`
		Note             *string    `json:"note"`
		CreatedAt        time.Time  `json:"created_at"`
		ItemName         string     `json:"item_name"`
		ItemUnit         string     `json:"item_unit"`
		IssuedToName     *string    `json:"issued_to_name"`
		CreatedByName    *string    `json:"created_by_name"`
		VoidedAt         *time.Time `json:"voided_at"`
		VoidReason       *string    `json:"void_reason"`
		PurchaseCanVoid  bool       `json:"purchase_can_void"`
	}

	var movements []MovementRow
	for rows.Next() {
		var m MovementRow
		var issuedFN, issuedLN, createdFN, createdLN sql.NullString
		var voidAt sql.NullTime
		var voidReason sql.NullString
		if err := rows.Scan(&m.ID, &m.StockItemID, &m.MovementType, &m.Quantity, &m.UnitCost, &m.TotalCost,
			&m.IssuedToUserID, &m.CreatedBy, &m.Note, &m.CreatedAt,
			&m.ItemName, &m.ItemUnit, &issuedFN, &issuedLN, &createdFN, &createdLN,
			&voidAt, &voidReason, &m.PurchaseCanVoid); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to scan movement", Error: strPtr(err.Error())})
			return
		}
		if issuedFN.Valid {
			name := issuedFN.String + " " + issuedLN.String
			m.IssuedToName = &name
		}
		if createdFN.Valid {
			name := createdFN.String + " " + createdLN.String
			m.CreatedByName = &name
		}
		if voidAt.Valid {
			t := voidAt.Time
			m.VoidedAt = &t
		}
		if voidReason.Valid && voidReason.String != "" {
			s := voidReason.String
			m.VoidReason = &s
		}
		movements = append(movements, m)
	}

	c.JSON(http.StatusOK, models.PaginatedResponse{
		Success: true, Message: "Movements retrieved", Data: movements,
		Meta: models.MetaData{CurrentPage: page, PerPage: perPage, Total: total, TotalPages: int(math.Ceil(float64(total) / float64(perPage)))},
	})
}

func (h *StockHandler) GetStockSummary(c *gin.Context) {
	period := c.DefaultQuery("period", "week") // week, month

	interval := "7 days"
	if period == "month" {
		interval = "30 days"
	}

	type CategorySummary struct {
		CategoryName   string  `json:"category_name"`
		TotalItems     int     `json:"total_items"`
		TotalValue     float64 `json:"total_value"`
		LowStockCount  int     `json:"low_stock_count"`
	}

	catRows, err := h.db.Query(`
		SELECT sc.name,
		       COUNT(si.id) AS total_items,
		       COALESCE(SUM(si.quantity_on_hand * COALESCE(si.default_unit_cost, 0)), 0) AS total_value,
		       COUNT(CASE WHEN si.quantity_on_hand <= si.reorder_level THEN 1 END) AS low_stock
		FROM stock_categories sc
		LEFT JOIN stock_items si ON si.category_id = sc.id AND si.is_active = true
		WHERE sc.is_active = true
		GROUP BY sc.id, sc.name, sc.sort_order
		ORDER BY sc.sort_order ASC
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to fetch summary", Error: strPtr(err.Error())})
		return
	}
	defer catRows.Close()

	var categories []CategorySummary
	for catRows.Next() {
		var cs CategorySummary
		catRows.Scan(&cs.CategoryName, &cs.TotalItems, &cs.TotalValue, &cs.LowStockCount)
		categories = append(categories, cs)
	}

	type WeeklyUsage struct {
		Week          string  `json:"week"`
		PurchaseQty   float64 `json:"purchase_qty"`
		IssueQty      float64 `json:"issue_qty"`
		PurchaseCost  float64 `json:"purchase_cost"`
	}

	usageRows, err := h.db.Query(fmt.Sprintf(`
		SELECT DATE_TRUNC('week', sm.created_at)::date AS week,
		       COALESCE(SUM(CASE WHEN sm.movement_type = 'purchase' THEN sm.quantity ELSE 0 END), 0),
		       COALESCE(SUM(CASE WHEN sm.movement_type = 'issue' THEN ABS(sm.quantity) ELSE 0 END), 0),
		       COALESCE(SUM(CASE WHEN sm.movement_type = 'purchase' THEN COALESCE(sm.total_cost,0) ELSE 0 END), 0)
		FROM stock_movements sm
		WHERE sm.created_at >= CURRENT_DATE - INTERVAL '%s'
		  AND (sm.movement_type <> 'purchase' OR sm.voided_at IS NULL)
		GROUP BY DATE_TRUNC('week', sm.created_at)
		ORDER BY week DESC
	`, interval))
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to fetch usage", Error: strPtr(err.Error())})
		return
	}
	defer usageRows.Close()

	var usage []WeeklyUsage
	for usageRows.Next() {
		var wu WeeklyUsage
		var weekDate time.Time
		usageRows.Scan(&weekDate, &wu.PurchaseQty, &wu.IssueQty, &wu.PurchaseCost)
		wu.Week = weekDate.Format("2006-01-02")
		usage = append(usage, wu)
	}

	var totalItems int
	var totalValue float64
	var lowStockCount int
	h.db.QueryRow(`SELECT COUNT(*), COALESCE(SUM(quantity_on_hand * COALESCE(default_unit_cost,0)),0),
	               COUNT(CASE WHEN quantity_on_hand <= reorder_level THEN 1 END)
	               FROM stock_items WHERE is_active = true`).Scan(&totalItems, &totalValue, &lowStockCount)

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true, Message: "Stock summary retrieved",
		Data: map[string]interface{}{
			"overview": map[string]interface{}{
				"total_items":     totalItems,
				"total_value":     totalValue,
				"low_stock_count": lowStockCount,
			},
			"categories":  categories,
			"weekly_usage": usage,
		},
	})
}

// ---------- Advanced Reports ----------

func (h *StockHandler) GetAdvancedReport(c *gin.Context) {
	// Safely parse and clamp period (days) so we can reuse it in INTERVAL and for
	// time-normalised KPIs such as "days of cover". PostgreSQL rejects intervals
	// beyond a year or two expressed this way, so we clamp to 366.
	periodStr := c.DefaultQuery("period", "30")
	periodDays, err := strconv.Atoi(periodStr)
	if err != nil || periodDays <= 0 {
		periodDays = 30
	}
	if periodDays > 366 {
		periodDays = 366
	}
	periodStr = strconv.Itoa(periodDays)

	// 1. KPI: total stock value (current on-hand valuation).
	var totalStockValue float64
	if err := h.db.QueryRow(`
		SELECT COALESCE(SUM(quantity_on_hand * COALESCE(default_unit_cost,0)),0)
		FROM stock_items
		WHERE is_active = true
	`).Scan(&totalStockValue); err != nil {
		log.Printf("GetAdvancedReport total_stock_value: %v", err)
	}

	// 2. KPI: total waste value in period (issues with spoilage/waste or RTV tag).
	var totalWasteValue float64
	if err := h.db.QueryRow(fmt.Sprintf(`
		SELECT COALESCE(SUM(ABS(sm.quantity) * COALESCE(si.default_unit_cost,0)),0)
		FROM stock_movements sm
		JOIN stock_items si ON sm.stock_item_id = si.id
		WHERE sm.movement_type = 'issue'
		  AND (sm.note ILIKE '%%[Spoilage/Waste]%%' OR sm.note ILIKE '%%[Return to Vendor]%%')
		  AND sm.created_at >= CURRENT_DATE - INTERVAL '%s days'
		  AND sm.voided_at IS NULL
	`, periodStr)).Scan(&totalWasteValue); err != nil {
		log.Printf("GetAdvancedReport total_waste_value: %v", err)
	}

	// 3. KPI: total issued cost in period (proxy for COGS), powers turnover & days cover.
	var totalIssuedCost float64
	if err := h.db.QueryRow(fmt.Sprintf(`
		SELECT COALESCE(SUM(ABS(sm.quantity) * COALESCE(si.default_unit_cost,0)),0)
		FROM stock_movements sm
		JOIN stock_items si ON sm.stock_item_id = si.id
		WHERE sm.movement_type = 'issue'
		  AND sm.created_at >= CURRENT_DATE - INTERVAL '%s days'
		  AND sm.voided_at IS NULL
	`, periodStr)).Scan(&totalIssuedCost); err != nil {
		log.Printf("GetAdvancedReport total_issued_cost: %v", err)
	}
	turnoverRate := 0.0
	if totalStockValue > 0 {
		turnoverRate = totalIssuedCost / totalStockValue
	}

	// 4. KPI: low stock count (items at or below reorder level).
	var lowStockCount int
	if err := h.db.QueryRow(`
		SELECT COUNT(*) FROM stock_items
		WHERE is_active = true AND quantity_on_hand <= reorder_level
	`).Scan(&lowStockCount); err != nil {
		log.Printf("GetAdvancedReport low_stock_count: %v", err)
	}

	// Derived KPIs.
	var daysCover *float64
	if totalIssuedCost > 0 {
		avgDaily := totalIssuedCost / float64(periodDays)
		if avgDaily > 0 {
			d := totalStockValue / avgDaily
			daysCover = &d
		}
	}
	var wastePctOfIssued *float64
	if totalIssuedCost > 0 {
		p := (totalWasteValue / totalIssuedCost) * 100.0
		wastePctOfIssued = &p
	}

	// 5. Category value distribution for donut chart.
	type CatValue struct {
		Name  string  `json:"name"`
		Value float64 `json:"value"`
	}
	catValues := []CatValue{}
	catRows, err := h.db.Query(`
		SELECT COALESCE(sc.name, 'Uncategorized'),
		       COALESCE(SUM(si.quantity_on_hand * COALESCE(si.default_unit_cost,0)),0)
		FROM stock_items si
		LEFT JOIN stock_categories sc ON si.category_id = sc.id
		WHERE si.is_active = true
		GROUP BY sc.name
		HAVING SUM(si.quantity_on_hand * COALESCE(si.default_unit_cost,0)) > 0
		ORDER BY 2 DESC
	`)
	if err != nil {
		log.Printf("GetAdvancedReport category_values: %v", err)
	} else {
		defer catRows.Close()
		for catRows.Next() {
			var cv CatValue
			if scanErr := catRows.Scan(&cv.Name, &cv.Value); scanErr != nil {
				log.Printf("GetAdvancedReport category_values scan: %v", scanErr)
				continue
			}
			catValues = append(catValues, cv)
		}
	}

	// 6. Purchase cost vs issued qty trend (weekly buckets).
	type TrendRow struct {
		Week         string  `json:"week"`
		PurchaseCost float64 `json:"purchase_cost"`
		IssuedQty    float64 `json:"issued_qty"`
	}
	trends := []TrendRow{}
	trendRows, err := h.db.Query(fmt.Sprintf(`
		SELECT DATE_TRUNC('week', sm.created_at)::date AS week,
		       COALESCE(SUM(CASE WHEN sm.movement_type='purchase' THEN COALESCE(sm.total_cost,0) ELSE 0 END),0),
		       COALESCE(SUM(CASE WHEN sm.movement_type='issue' THEN ABS(sm.quantity) ELSE 0 END),0)
		FROM stock_movements sm
		WHERE sm.created_at >= CURRENT_DATE - INTERVAL '%s days'
		  AND sm.voided_at IS NULL
		GROUP BY DATE_TRUNC('week', sm.created_at)
		ORDER BY week ASC
	`, periodStr))
	if err != nil {
		log.Printf("GetAdvancedReport trends: %v", err)
	} else {
		defer trendRows.Close()
		for trendRows.Next() {
			var tr TrendRow
			var weekDate time.Time
			if scanErr := trendRows.Scan(&weekDate, &tr.PurchaseCost, &tr.IssuedQty); scanErr != nil {
				log.Printf("GetAdvancedReport trends scan: %v", scanErr)
				continue
			}
			tr.Week = weekDate.Format("Jan 02")
			trends = append(trends, tr)
		}
	}

	// 7. Variance report: per-item starting stock, purchased, issued, current on-hand, variance.
	type VarianceRow struct {
		ItemID        string  `json:"item_id"`
		ItemName      string  `json:"item_name"`
		Unit          string  `json:"unit"`
		Category      string  `json:"category"`
		StartingStock float64 `json:"starting_stock"`
		Purchased     float64 `json:"purchased"`
		Issued        float64 `json:"issued"`
		AdjustmentNet float64 `json:"adjustment_net"`
		ActualOnHand  float64 `json:"actual_on_hand"`
		Expected      float64 `json:"expected"`
		Variance      float64 `json:"variance"`
		UnitCost      float64 `json:"unit_cost"`
	}
	variances := []VarianceRow{}
	varRows, err := h.db.Query(fmt.Sprintf(`
		SELECT si.id, si.name, si.unit,
		       COALESCE(sc.name,'Uncategorized'),
		       COALESCE(si.default_unit_cost, 0),
		       si.quantity_on_hand,
		       COALESCE(SUM(CASE WHEN sm.movement_type='purchase' THEN sm.quantity ELSE 0 END),0) AS purchased,
		       COALESCE(SUM(CASE WHEN sm.movement_type='issue' THEN ABS(sm.quantity) ELSE 0 END),0) AS issued,
		       COALESCE(SUM(CASE WHEN sm.movement_type='adjustment' THEN sm.quantity ELSE 0 END),0) AS adjustment_net
		FROM stock_items si
		LEFT JOIN stock_categories sc ON si.category_id = sc.id
		LEFT JOIN stock_movements sm ON sm.stock_item_id = si.id
		  AND sm.created_at >= CURRENT_DATE - INTERVAL '%s days'
		  AND sm.voided_at IS NULL
		WHERE si.is_active = true
		GROUP BY si.id, si.name, si.unit, sc.name, si.default_unit_cost, si.quantity_on_hand
		ORDER BY si.name ASC
	`, periodStr))
	if err != nil {
		log.Printf("GetAdvancedReport variance: %v", err)
	} else {
		defer varRows.Close()
		for varRows.Next() {
			var vr VarianceRow
			if scanErr := varRows.Scan(&vr.ItemID, &vr.ItemName, &vr.Unit, &vr.Category,
				&vr.UnitCost, &vr.ActualOnHand, &vr.Purchased, &vr.Issued, &vr.AdjustmentNet); scanErr != nil {
				log.Printf("GetAdvancedReport variance scan: %v", scanErr)
				continue
			}
			// Starting = on-hand today minus net period changes.
			vr.StartingStock = vr.ActualOnHand - vr.Purchased + vr.Issued - vr.AdjustmentNet
			vr.Expected = vr.StartingStock + vr.Purchased - vr.Issued + vr.AdjustmentNet
			vr.Variance = vr.ActualOnHand - vr.Expected
			variances = append(variances, vr)
		}
	}

	// 8. Waste & spoilage breakdown.
	type WasteRow struct {
		ItemName  string  `json:"item_name"`
		Category  string  `json:"category"`
		Unit      string  `json:"unit"`
		QtyWasted float64 `json:"qty_wasted"`
		Reason    string  `json:"reason"`
		LostValue float64 `json:"lost_value"`
		Date      string  `json:"date"`
	}
	wastes := []WasteRow{}
	wasteRows, err := h.db.Query(fmt.Sprintf(`
		SELECT si.name, COALESCE(sc.name,'Uncategorized'), si.unit,
		       ABS(sm.quantity),
		       COALESCE(sm.note, ''),
		       ABS(sm.quantity) * COALESCE(si.default_unit_cost,0),
		       sm.created_at::date
		FROM stock_movements sm
		JOIN stock_items si ON sm.stock_item_id = si.id
		LEFT JOIN stock_categories sc ON si.category_id = sc.id
		WHERE sm.movement_type = 'issue'
		  AND (sm.note ILIKE '%%[Spoilage/Waste]%%' OR sm.note ILIKE '%%[Return to Vendor]%%')
		  AND sm.created_at >= CURRENT_DATE - INTERVAL '%s days'
		  AND sm.voided_at IS NULL
		ORDER BY sm.created_at DESC
	`, periodStr))
	if err != nil {
		log.Printf("GetAdvancedReport waste: %v", err)
	} else {
		defer wasteRows.Close()
		for wasteRows.Next() {
			var wr WasteRow
			var dt time.Time
			if scanErr := wasteRows.Scan(&wr.ItemName, &wr.Category, &wr.Unit, &wr.QtyWasted, &wr.Reason, &wr.LostValue, &dt); scanErr != nil {
				log.Printf("GetAdvancedReport waste scan: %v", scanErr)
				continue
			}
			wr.Date = dt.Format("2006-01-02")
			if wr.Reason != "" {
				start := strings.Index(wr.Reason, "[")
				end := strings.Index(wr.Reason, "]")
				if start >= 0 && end > start {
					wr.Reason = wr.Reason[start+1 : end]
				}
			}
			wastes = append(wastes, wr)
		}
	}

	kpis := map[string]interface{}{
		"total_stock_value":    totalStockValue,
		"total_waste_value":    totalWasteValue,
		"turnover_rate":        turnoverRate,
		"issued_value_period":  totalIssuedCost,
		"low_stock_count":      lowStockCount,
		"period_days":          periodDays,
		"days_cover_estimate":  daysCover,
		"waste_pct_of_issued":  wastePctOfIssued,
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true, Message: "Advanced report retrieved",
		Data: map[string]interface{}{
			"kpis":            kpis,
			"category_values": catValues,
			"trends":          trends,
			"variance":        variances,
			"waste":           wastes,
		},
	})
}

// ---------- User list for issue-to dropdown ----------

func (h *StockHandler) GetStoreUsers(c *gin.Context) {
	rows, err := h.db.Query(`SELECT id, first_name, last_name, role FROM users WHERE is_active = true ORDER BY first_name ASC`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to fetch users", Error: strPtr(err.Error())})
		return
	}
	defer rows.Close()

	type UserBrief struct {
		ID        uuid.UUID `json:"id"`
		FirstName string    `json:"first_name"`
		LastName  string    `json:"last_name"`
		Role      string    `json:"role"`
	}
	var users []UserBrief
	for rows.Next() {
		var u UserBrief
		rows.Scan(&u.ID, &u.FirstName, &u.LastName, &u.Role)
		users = append(users, u)
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Users retrieved", Data: users})
}

// ---------- helpers ----------

func strPtr(s string) *string { return &s }

func parsePagination(c *gin.Context) (int, int) {
	page := 1
	perPage := 20
	if p, err := strconv.Atoi(c.Query("page")); err == nil && p > 0 {
		page = p
	}
	if pp, err := strconv.Atoi(c.Query("per_page")); err == nil && pp > 0 && pp <= 100 {
		perPage = pp
	}
	return page, perPage
}

func buildUpdates(fields map[string]interface{}) ([]string, []interface{}, int) {
	sets := []string{}
	args := []interface{}{}
	n := 0
	for col, val := range fields {
		if val == nil {
			continue
		}
		switch v := val.(type) {
		case *string:
			if v == nil {
				continue
			}
			n++
			sets = append(sets, fmt.Sprintf("%s = $%d", col, n))
			args = append(args, *v)
		case *int:
			if v == nil {
				continue
			}
			n++
			sets = append(sets, fmt.Sprintf("%s = $%d", col, n))
			args = append(args, *v)
		case *float64:
			if v == nil {
				continue
			}
			n++
			sets = append(sets, fmt.Sprintf("%s = $%d", col, n))
			args = append(args, *v)
		case *bool:
			if v == nil {
				continue
			}
			n++
			sets = append(sets, fmt.Sprintf("%s = $%d", col, n))
			args = append(args, *v)
		}
	}
	return sets, args, n
}

func convertUnits(qty float64, from, to string) (float64, bool) {
	type pair struct{ from, to string }
	factors := map[pair]float64{
		{"g", "kg"}:     0.001,
		{"kg", "g"}:     1000,
		{"ml", "liter"}:  0.001,
		{"liter", "ml"}: 1000,
		{"oz", "lb"}:    0.0625,
		{"lb", "oz"}:    16,
		{"oz", "g"}:     28.3495,
		{"g", "oz"}:     0.035274,
		{"lb", "kg"}:    0.453592,
		{"kg", "lb"}:    2.20462,
		{"ml", "oz"}:    0.033814,
		{"oz", "ml"}:    29.5735,
		{"liter", "oz"}: 33.814,
		{"oz", "liter"}: 0.0295735,
	}
	if f, ok := factors[pair{from, to}]; ok {
		return qty * f, true
	}
	return 0, false
}
