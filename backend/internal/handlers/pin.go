package handlers

import (
	"database/sql"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"

	"pos-backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type PinHandler struct {
	db *sql.DB
}

func NewPinHandler(db *sql.DB) *PinHandler {
	return &PinHandler{db: db}
}

func (h *PinHandler) SetPin(c *gin.Context) {
	userID := c.Param("id")
	var req struct {
		Pin string `json:"pin" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid request", Error: strPtr(err.Error())})
		return
	}
	if len(req.Pin) != 4 {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "PIN must be exactly 4 digits"})
		return
	}
	for _, ch := range req.Pin {
		if ch < '0' || ch > '9' {
			c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "PIN must contain only digits"})
			return
		}
	}

	var role string
	err := h.db.QueryRow(`SELECT role FROM users WHERE id = $1`, userID).Scan(&role)
	if err != nil {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "User not found"})
		return
	}
	if role != "admin" && role != "manager" {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Void authorization PINs can only be set for admin or manager accounts"})
		return
	}

	var existingUserID uuid.UUID
	dupErr := h.db.QueryRow(`SELECT id FROM users WHERE manager_pin = $1 AND id != $2`, req.Pin, userID).Scan(&existingUserID)
	if dupErr == nil {
		c.JSON(http.StatusConflict, models.APIResponse{Success: false, Message: "This PIN is already in use by another user"})
		return
	}

	_, err = h.db.Exec(`UPDATE users SET manager_pin = $1 WHERE id = $2`, req.Pin, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to set PIN", Error: strPtr(err.Error())})
		return
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "PIN updated successfully"})
}

func (h *PinHandler) VerifyPin(c *gin.Context) {
	var req struct {
		Pin string `json:"pin" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid request"})
		return
	}

	var userName string
	err := h.db.QueryRow(`SELECT first_name || ' ' || last_name FROM users WHERE manager_pin = $1 AND role IN ('admin', 'manager') AND is_active = true LIMIT 1`, req.Pin).Scan(&userName)
	if err != nil {
		c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "PIN verification result", Data: map[string]interface{}{"valid": false}})
		return
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "PIN verification result", Data: map[string]interface{}{"valid": true, "user_name": userName}})
}

func (h *PinHandler) GetVoidLog(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "20"))
	if page < 1 {
		page = 1
	}
	if perPage < 1 || perPage > 100 {
		perPage = 20
	}
	offset := (page - 1) * perPage

	fromDate := c.Query("from")
	toDate := c.Query("to")
	userFilter := c.Query("user_id")
	voidedByFilter := c.Query("voided_by")
	authorizedByFilter := c.Query("authorized_by")
	reasonFilter := c.Query("reason")
	orderNumberFilter := strings.TrimSpace(c.Query("order_number"))
	minValueStr := c.Query("min_value")

	where := "WHERE 1=1"
	args := []interface{}{}
	argN := 0

	if fromDate != "" {
		argN++
		where += fmt.Sprintf(" AND vl.created_at >= $%d::date", argN)
		args = append(args, fromDate)
	}
	if toDate != "" {
		argN++
		// Use exclusive upper bound on the next day to avoid including
		// rows timestamped exactly at midnight of the day after `to`.
		where += fmt.Sprintf(" AND vl.created_at < $%d::date + INTERVAL '1 day'", argN)
		args = append(args, toDate)
	}
	// Legacy combined filter: matches voider OR authorizer.
	if userFilter != "" {
		argN++
		where += fmt.Sprintf(" AND (vl.voided_by = $%d OR vl.authorized_by = $%d)", argN, argN)
		args = append(args, userFilter)
	}
	if voidedByFilter != "" {
		argN++
		where += fmt.Sprintf(" AND vl.voided_by = $%d", argN)
		args = append(args, voidedByFilter)
	}
	if authorizedByFilter != "" {
		argN++
		where += fmt.Sprintf(" AND vl.authorized_by = $%d", argN)
		args = append(args, authorizedByFilter)
	}
	if reasonFilter != "" {
		argN++
		where += fmt.Sprintf(" AND vl.reason = $%d", argN)
		args = append(args, reasonFilter)
	}
	if orderNumberFilter != "" {
		argN++
		where += fmt.Sprintf(" AND o.order_number ILIKE $%d", argN)
		args = append(args, "%"+orderNumberFilter+"%")
	}
	if minValueStr != "" {
		if minVal, perr := strconv.ParseFloat(minValueStr, 64); perr == nil && minVal > 0 {
			argN++
			where += fmt.Sprintf(" AND (vl.unit_price * vl.quantity) >= $%d", argN)
			args = append(args, minVal)
		}
	}

	// Count uses the same join graph because some filters reference `o`.
	countQuery := fmt.Sprintf(`
		SELECT COUNT(*)
		FROM void_log vl
		LEFT JOIN orders o ON vl.order_id = o.id
		%s
	`, where)
	var total int
	if err := h.db.QueryRow(countQuery, args...).Scan(&total); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to count void log", Error: strPtr(err.Error())})
		return
	}

	argN++
	limitArg := argN
	argN++
	offsetArg := argN
	args = append(args, perPage, offset)

	query := fmt.Sprintf(`
		SELECT vl.id, vl.order_id, vl.order_item_id, vl.voided_by, vl.authorized_by,
		       vl.item_name, vl.quantity, vl.unit_price, vl.reason, vl.created_at,
		       o.order_number,
		       u1.first_name || ' ' || u1.last_name,
		       u2.first_name || ' ' || u2.last_name
		FROM void_log vl
		LEFT JOIN orders o ON vl.order_id = o.id
		LEFT JOIN users u1 ON vl.voided_by = u1.id
		LEFT JOIN users u2 ON vl.authorized_by = u2.id
		%s
		ORDER BY vl.created_at DESC, vl.id DESC
		LIMIT $%d OFFSET $%d
	`, where, limitArg, offsetArg)

	rows, err := h.db.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to fetch void log", Error: strPtr(err.Error())})
		return
	}
	defer rows.Close()

	entries := make([]models.VoidLogEntry, 0)
	for rows.Next() {
		var e models.VoidLogEntry
		if scanErr := rows.Scan(&e.ID, &e.OrderID, &e.OrderItemID, &e.VoidedBy, &e.AuthorizedBy,
			&e.ItemName, &e.Quantity, &e.UnitPrice, &e.Reason, &e.CreatedAt,
			&e.OrderNumber, &e.VoidedByName, &e.AuthorizedName); scanErr != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to read void log row", Error: strPtr(scanErr.Error())})
			return
		}
		entries = append(entries, e)
	}
	if rowsErr := rows.Err(); rowsErr != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Void log query error", Error: strPtr(rowsErr.Error())})
		return
	}

	totalPages := int(math.Ceil(float64(total) / float64(perPage)))
	c.JSON(http.StatusOK, models.PaginatedResponse{
		Success: true, Message: "Void log retrieved",
		Data: entries,
		Meta: models.MetaData{CurrentPage: page, PerPage: perPage, Total: total, TotalPages: totalPages},
	})
}
