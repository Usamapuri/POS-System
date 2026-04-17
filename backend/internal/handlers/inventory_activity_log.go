package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strings"
	"time"

	"pos-backend/internal/middleware"
	"pos-backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type sqlExecer interface {
	Exec(query string, args ...interface{}) (sql.Result, error)
}

func insertInventoryActivityLog(exec sqlExecer, actorID uuid.UUID, action, entityType string, entityID *string, summary string, metadata map[string]interface{}) error {
	var metaArg interface{}
	if len(metadata) > 0 {
		b, err := json.Marshal(metadata)
		if err != nil {
			return err
		}
		metaArg = b
	}
	if entityID != nil && *entityID != "" {
		_, err := exec.Exec(`
			INSERT INTO inventory_activity_log (actor_id, action, entity_type, entity_id, summary, metadata)
			VALUES ($1, $2, $3, $4::uuid, $5, $6)`,
			actorID, action, entityType, *entityID, summary, metaArg)
		return err
	}
	_, err := exec.Exec(`
		INSERT INTO inventory_activity_log (actor_id, action, entity_type, entity_id, summary, metadata)
		VALUES ($1, $2, $3, NULL, $4, $5)`,
		actorID, action, entityType, summary, metaArg)
	return err
}

// GetInventoryActivity returns paginated append-only inventory audit entries.
func (h *StockHandler) GetInventoryActivity(c *gin.Context) {
	page, perPage := parsePagination(c)
	offset := (page - 1) * perPage
	actionFilter := strings.TrimSpace(c.Query("action"))
	from := strings.TrimSpace(c.Query("from"))
	to := strings.TrimSpace(c.Query("to"))

	qb := `
		SELECT ial.id, ial.created_at, ial.actor_id,
		       COALESCE(TRIM(u.first_name || ' ' || u.last_name), '') AS actor_name,
		       ial.action, ial.entity_type, ial.entity_id, ial.summary, ial.metadata
		FROM inventory_activity_log ial
		LEFT JOIN users u ON u.id = ial.actor_id
		WHERE 1=1`
	args := []interface{}{}
	n := 0
	if actionFilter != "" {
		n++
		qb += fmt.Sprintf(" AND ial.action ILIKE $%d", n)
		args = append(args, "%"+actionFilter+"%")
	}
	if from != "" {
		n++
		qb += fmt.Sprintf(" AND ial.created_at >= $%d::date", n)
		args = append(args, from)
	}
	if to != "" {
		n++
		qb += fmt.Sprintf(" AND ial.created_at < ($%d::date + interval '1 day')", n)
		args = append(args, to)
	}

	var total int
	h.db.QueryRow("SELECT COUNT(*) FROM ("+qb+") q", args...).Scan(&total)

	qb += " ORDER BY ial.created_at DESC"
	n++
	qb += fmt.Sprintf(" LIMIT $%d", n)
	args = append(args, perPage)
	n++
	qb += fmt.Sprintf(" OFFSET $%d", n)
	args = append(args, offset)

	rows, err := h.db.Query(qb, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to fetch activity log", Error: strPtr(err.Error())})
		return
	}
	defer rows.Close()

	type row struct {
		ID         string          `json:"id"`
		CreatedAt  time.Time       `json:"created_at"`
		ActorID    *uuid.UUID      `json:"actor_id"`
		ActorName  string          `json:"actor_name"`
		Action     string          `json:"action"`
		EntityType string          `json:"entity_type"`
		EntityID   *uuid.UUID      `json:"entity_id"`
		Summary    string          `json:"summary"`
		Metadata   json.RawMessage `json:"metadata,omitempty"`
	}
	var out []row
	for rows.Next() {
		var r row
		var actorID sql.NullString
		var entityID sql.NullString
		var meta []byte
		if err := rows.Scan(&r.ID, &r.CreatedAt, &actorID, &r.ActorName, &r.Action, &r.EntityType, &entityID, &r.Summary, &meta); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to scan activity", Error: strPtr(err.Error())})
			return
		}
		if actorID.Valid {
			if uid, err := uuid.Parse(actorID.String); err == nil {
				r.ActorID = &uid
			}
		}
		if entityID.Valid {
			if uid, err := uuid.Parse(entityID.String); err == nil {
				r.EntityID = &uid
			}
		}
		if len(meta) > 0 {
			r.Metadata = json.RawMessage(meta)
		}
		out = append(out, r)
	}

	c.JSON(http.StatusOK, models.PaginatedResponse{
		Success: true, Message: "Inventory activity retrieved", Data: out,
		Meta: models.MetaData{CurrentPage: page, PerPage: perPage, Total: total, TotalPages: int(math.Ceil(float64(total) / float64(perPage)))},
	})
}

// VoidPurchaseMovement reverses an erroneous purchase when no quantity has been consumed from its lot(s).
func (h *StockHandler) VoidPurchaseMovement(c *gin.Context) {
	movID := c.Param("id")
	userID, _, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, models.APIResponse{Success: false, Message: "Authentication required"})
		return
	}
	var req struct {
		Reason string `json:"reason" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid request (reason required)", Error: strPtr(err.Error())})
		return
	}
	if strings.TrimSpace(req.Reason) == "" {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "reason is required"})
		return
	}

	tx, err := h.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Transaction error", Error: strPtr(err.Error())})
		return
	}
	defer tx.Rollback()

	var movType string
	var qty float64
	var itemID string
	var voidedAt sql.NullTime
	err = tx.QueryRow(`
		SELECT movement_type, quantity, stock_item_id, voided_at
		FROM stock_movements WHERE id = $1 FOR UPDATE`, movID).Scan(&movType, &qty, &itemID, &voidedAt)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Movement not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to load movement", Error: strPtr(err.Error())})
		return
	}
	if movType != "purchase" {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Only purchase movements can be voided", Error: strPtr("not_purchase")})
		return
	}
	if voidedAt.Valid {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "This purchase was already voided", Error: strPtr("already_voided")})
		return
	}

	var partialLots int
	err = tx.QueryRow(`
		SELECT COUNT(*) FROM stock_batches
		WHERE stock_movement_id = $1::uuid
		  AND (initial_quantity - quantity_remaining) > 0.00001`, movID).Scan(&partialLots)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to check batches", Error: strPtr(err.Error())})
		return
	}
	if partialLots > 0 {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "Cannot void: some of this purchase has already been issued or adjusted out of inventory",
			Error:   strPtr("purchase_consumed"),
		})
		return
	}

	if _, err := tx.Exec(`DELETE FROM stock_batches WHERE stock_movement_id = $1::uuid`, movID); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to remove stock lots", Error: strPtr(err.Error())})
		return
	}
	if _, err := tx.Exec(`UPDATE stock_items SET quantity_on_hand = quantity_on_hand - $1 WHERE id = $2::uuid`, qty, itemID); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to reverse on-hand quantity", Error: strPtr(err.Error())})
		return
	}
	if _, err := tx.Exec(`DELETE FROM expenses WHERE reference_type = 'stock_movement' AND reference_id = $1::uuid`, movID); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to remove linked expense", Error: strPtr(err.Error())})
		return
	}
	if _, err := tx.Exec(`
		UPDATE stock_movements SET voided_at = CURRENT_TIMESTAMP, voided_by = $2::uuid, void_reason = $3
		WHERE id = $1::uuid`, movID, userID, strings.TrimSpace(req.Reason)); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to mark movement voided", Error: strPtr(err.Error())})
		return
	}

	var itemName string
	_ = tx.QueryRow(`SELECT name FROM stock_items WHERE id = $1::uuid`, itemID).Scan(&itemName)
	summary := fmt.Sprintf("Voided purchase: %s (−%.2f)", itemName, qty)
	meta := map[string]interface{}{
		"movement_id": movID,
		"stock_item_id": itemID,
		"quantity": qty,
	}
	if err := insertInventoryActivityLog(tx, userID, "inventory.purchase_void", "stock_movement", &movID, summary, meta); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to write activity log", Error: strPtr(err.Error())})
		return
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Commit failed", Error: strPtr(err.Error())})
		return
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Purchase voided; stock and expense reversed"})
}

// CorrectPurchaseMovementCost updates unit/total cost on a purchase when its lot is still untouched (wrong price entry).
func (h *StockHandler) CorrectPurchaseMovementCost(c *gin.Context) {
	movID := c.Param("id")
	userID, _, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, models.APIResponse{Success: false, Message: "Authentication required"})
		return
	}
	var req struct {
		UnitCost float64 `json:"unit_cost" binding:"required"`
		Reason   string  `json:"reason" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid request", Error: strPtr(err.Error())})
		return
	}
	if req.UnitCost < 0 {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "unit_cost cannot be negative"})
		return
	}
	if strings.TrimSpace(req.Reason) == "" {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "reason is required"})
		return
	}

	tx, err := h.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Transaction error", Error: strPtr(err.Error())})
		return
	}
	defer tx.Rollback()

	var movType string
	var qty float64
	var voidedAt sql.NullTime
	var oldUC sql.NullFloat64
	var oldTotal sql.NullFloat64
	err = tx.QueryRow(`
		SELECT movement_type, quantity, voided_at, unit_cost, total_cost
		FROM stock_movements WHERE id = $1::uuid FOR UPDATE`, movID).Scan(&movType, &qty, &voidedAt, &oldUC, &oldTotal)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Movement not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to load movement", Error: strPtr(err.Error())})
		return
	}
	if movType != "purchase" {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Only purchase movements can be corrected", Error: strPtr("not_purchase")})
		return
	}
	if voidedAt.Valid {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Cannot correct a voided purchase"})
		return
	}

	var partialLots int
	err = tx.QueryRow(`
		SELECT COUNT(*) FROM stock_batches
		WHERE stock_movement_id = $1::uuid
		  AND (initial_quantity - quantity_remaining) > 0.00001`, movID).Scan(&partialLots)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to check batches", Error: strPtr(err.Error())})
		return
	}
	if partialLots > 0 {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "Cannot correct cost: some of this purchase has already been consumed from inventory",
			Error:   strPtr("purchase_consumed"),
		})
		return
	}

	newTotal := qty * req.UnitCost
	if _, err := tx.Exec(`UPDATE stock_movements SET unit_cost = $1, total_cost = $2 WHERE id = $3::uuid`,
		req.UnitCost, newTotal, movID); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to update movement", Error: strPtr(err.Error())})
		return
	}
	if _, err := tx.Exec(`UPDATE stock_batches SET unit_cost = $1 WHERE stock_movement_id = $2::uuid`, req.UnitCost, movID); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to update stock lot cost", Error: strPtr(err.Error())})
		return
	}

	res, err := tx.Exec(`UPDATE expenses SET amount = $1, updated_at = CURRENT_TIMESTAMP
		WHERE reference_type = 'stock_movement' AND reference_id = $2::uuid`, newTotal, movID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to update expense", Error: strPtr(err.Error())})
		return
	}
	nAff, _ := res.RowsAffected()
	if nAff == 0 && newTotal > 0.000001 {
		var itemName string
		if err := tx.QueryRow(`SELECT si.name FROM stock_movements sm JOIN stock_items si ON si.id = sm.stock_item_id WHERE sm.id = $1::uuid`, movID).Scan(&itemName); err == nil {
			desc := itemName + " (purchase cost correction)"
			_, _ = tx.Exec(`INSERT INTO expenses (category, amount, description, reference_type, reference_id, expense_date, recorded_at, created_by)
				VALUES ('inventory_purchase', $1, $2, 'stock_movement', $3::uuid, CURRENT_DATE, CURRENT_TIMESTAMP, $4::uuid)`,
				newTotal, desc, movID, userID)
		}
	} else if nAff > 0 && newTotal <= 0.000001 {
		_, _ = tx.Exec(`DELETE FROM expenses WHERE reference_type = 'stock_movement' AND reference_id = $1::uuid`, movID)
	}

	var itemName string
	_ = tx.QueryRow(`SELECT si.name FROM stock_movements sm JOIN stock_items si ON si.id = sm.stock_item_id WHERE sm.id = $1::uuid`, movID).Scan(&itemName)

	oldUCv := 0.0
	if oldUC.Valid {
		oldUCv = oldUC.Float64
	}
	oldTot := 0.0
	if oldTotal.Valid {
		oldTot = oldTotal.Float64
	}
	summary := fmt.Sprintf("Corrected purchase cost: %s (unit %.4f → %.4f)", itemName, oldUCv, req.UnitCost)
	meta := map[string]interface{}{
		"movement_id":      movID,
		"previous_unit_cost": oldUCv,
		"new_unit_cost":    req.UnitCost,
		"previous_total":   oldTot,
		"new_total":        newTotal,
		"reason":           strings.TrimSpace(req.Reason),
	}
	if err := insertInventoryActivityLog(tx, userID, "inventory.purchase_cost_correct", "stock_movement", &movID, summary, meta); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to write activity log", Error: strPtr(err.Error())})
		return
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Commit failed", Error: strPtr(err.Error())})
		return
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Purchase cost updated"})
}
