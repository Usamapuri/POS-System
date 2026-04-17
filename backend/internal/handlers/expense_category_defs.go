package handlers

import (
	"database/sql"
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"pos-backend/internal/middleware"
	"pos-backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// ExpenseCategoryDefinition is a row in expense_category_defs (admin-managed catalog).
type ExpenseCategoryDefinition struct {
	ID        string `json:"id"`
	Slug      string `json:"slug"`
	Label     string `json:"label"`
	Color     string `json:"color"`
	SortOrder int    `json:"sort_order"`
	IsSystem  bool   `json:"is_system"`
	IsActive  bool   `json:"is_active"`
}

func slugifyExpenseCategoryLabel(label string) string {
	var b strings.Builder
	lastUnd := false
	for _, r := range strings.TrimSpace(strings.ToLower(label)) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			lastUnd = false
			continue
		}
		if (r == '_' || r == ' ' || r == '-') && b.Len() > 0 && !lastUnd {
			b.WriteByte('_')
			lastUnd = true
		}
	}
	s := strings.Trim(b.String(), "_")
	re := regexp.MustCompile(`_+`)
	s = re.ReplaceAllString(s, "_")
	if s == "" {
		s = "category"
	}
	if len(s) > 64 {
		s = s[:64]
	}
	return s
}

func (h *ExpenseHandler) uniqueExpenseCategorySlug(base string) (string, error) {
	slug := base
	for i := 0; i < 50; i++ {
		var n int
		if err := h.db.QueryRow(`SELECT COUNT(*) FROM expense_category_defs WHERE slug = $1`, slug).Scan(&n); err != nil {
			return "", err
		}
		if n == 0 {
			return slug, nil
		}
		suffix := fmt.Sprintf("_%d", i+2)
		max := 64 - len(suffix)
		if max < 1 {
			return "", fmt.Errorf("slug overflow")
		}
		if len(base) > max {
			base = base[:max]
		}
		slug = base + suffix
	}
	return "", fmt.Errorf("could not allocate unique slug")
}

func (h *ExpenseHandler) expenseCategorySlugActive(slug string) (bool, error) {
	var n int
	err := h.db.QueryRow(
		`SELECT COUNT(*) FROM expense_category_defs WHERE slug = $1 AND is_active = true`,
		slug,
	).Scan(&n)
	return n > 0, err
}

// ListExpenseCategoryDefinitions returns all category rows for admin UI (including inactive).
func (h *ExpenseHandler) ListExpenseCategoryDefinitions(c *gin.Context) {
	rows, err := h.db.Query(`
		SELECT id::text, slug, label, color, sort_order, is_system, is_active
		FROM expense_category_defs
		ORDER BY sort_order ASC, label ASC
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to list expense categories", Error: strPtr(err.Error())})
		return
	}
	defer rows.Close()

	var out []ExpenseCategoryDefinition
	for rows.Next() {
		var d ExpenseCategoryDefinition
		if err := rows.Scan(&d.ID, &d.Slug, &d.Label, &d.Color, &d.SortOrder, &d.IsSystem, &d.IsActive); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to scan category", Error: strPtr(err.Error())})
			return
		}
		out = append(out, d)
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Expense category definitions retrieved", Data: out})
}

func (h *ExpenseHandler) CreateExpenseCategoryDefinition(c *gin.Context) {
	_, _, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, models.APIResponse{Success: false, Message: "Authentication required"})
		return
	}
	var req struct {
		Label     string `json:"label" binding:"required"`
		Color     string `json:"color"`
		SortOrder *int   `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid request", Error: strPtr(err.Error())})
		return
	}
	label := strings.TrimSpace(req.Label)
	if label == "" {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Label is required"})
		return
	}
	base := slugifyExpenseCategoryLabel(label)
	slug, slugErr := h.uniqueExpenseCategorySlug(base)
	if slugErr != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Could not create slug", Error: strPtr(slugErr.Error())})
		return
	}
	color := strings.TrimSpace(req.Color)
	if color == "" {
		color = "bg-muted text-muted-foreground"
	}
	sortOrder := 50
	if req.SortOrder != nil {
		sortOrder = *req.SortOrder
	}
	var id string
	err := h.db.QueryRow(`
		INSERT INTO expense_category_defs (slug, label, color, sort_order, is_system, is_active)
		VALUES ($1, $2, $3, $4, false, true) RETURNING id::text`,
		slug, label, color, sortOrder,
	).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to create category", Error: strPtr(err.Error())})
		return
	}
	c.JSON(http.StatusCreated, models.APIResponse{Success: true, Message: "Category created", Data: map[string]string{"id": id, "slug": slug}})
}

func (h *ExpenseHandler) UpdateExpenseCategoryDefinition(c *gin.Context) {
	id := c.Param("id")
	if _, err := uuid.Parse(id); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid id"})
		return
	}
	var req struct {
		Label     *string `json:"label"`
		Color     *string `json:"color"`
		SortOrder *int    `json:"sort_order"`
		IsActive  *bool   `json:"is_active"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid request", Error: strPtr(err.Error())})
		return
	}
	sets, args, n := buildUpdates(map[string]interface{}{
		"label": req.Label, "color": req.Color, "sort_order": req.SortOrder, "is_active": req.IsActive,
	})
	if len(sets) == 0 {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "No fields to update"})
		return
	}
	sets = append(sets, "updated_at = CURRENT_TIMESTAMP")
	args = append(args, id)
	q := fmt.Sprintf("UPDATE expense_category_defs SET %s WHERE id = $%d", strings.Join(sets, ", "), n+1)
	res, err := h.db.Exec(q, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to update category", Error: strPtr(err.Error())})
		return
	}
	if ra, _ := res.RowsAffected(); ra == 0 {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Category not found"})
		return
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Category updated"})
}

func (h *ExpenseHandler) DeleteExpenseCategoryDefinition(c *gin.Context) {
	id := c.Param("id")
	if _, err := uuid.Parse(id); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid id"})
		return
	}
	var slug string
	var isSystem bool
	err := h.db.QueryRow(`SELECT slug, is_system FROM expense_category_defs WHERE id = $1`, id).Scan(&slug, &isSystem)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Category not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to load category", Error: strPtr(err.Error())})
		return
	}
	if isSystem {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Cannot delete a system category", Error: strPtr("system_category")})
		return
	}
	var used int
	h.db.QueryRow(`SELECT COUNT(*) FROM expenses WHERE category = $1`, slug).Scan(&used)
	if used > 0 {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: fmt.Sprintf("Cannot delete: %d expense(s) still use this category. Reassign or delete those expenses first.", used),
			Error:   strPtr("category_in_use"),
		})
		return
	}
	if _, err := h.db.Exec(`DELETE FROM expense_category_defs WHERE id = $1 AND is_system = false`, id); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to delete category", Error: strPtr(err.Error())})
		return
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Category deleted"})
}
