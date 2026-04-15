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

type ExpenseHandler struct {
	db *sql.DB
}

func NewExpenseHandler(db *sql.DB) *ExpenseHandler {
	return &ExpenseHandler{db: db}
}

func (h *ExpenseHandler) GetExpenses(c *gin.Context) {
	page, perPage := parsePagination(c)
	offset := (page - 1) * perPage
	category := c.Query("category")
	from := c.Query("from")
	to := c.Query("to")
	search := c.Query("search")

	qb := `SELECT e.id, e.category, e.amount, e.description, e.reference_type, e.reference_id,
	              e.expense_date, e.created_by, e.created_at, e.updated_at,
	              u.first_name, u.last_name
	       FROM expenses e
	       LEFT JOIN users u ON e.created_by = u.id
	       WHERE 1=1`
	args := []interface{}{}
	n := 0

	if category != "" {
		n++
		qb += fmt.Sprintf(" AND e.category = $%d", n)
		args = append(args, category)
	}
	if from != "" {
		n++
		qb += fmt.Sprintf(" AND e.expense_date >= $%d", n)
		args = append(args, from)
	}
	if to != "" {
		n++
		qb += fmt.Sprintf(" AND e.expense_date <= $%d", n)
		args = append(args, to)
	}
	if search != "" {
		n++
		qb += fmt.Sprintf(" AND e.description ILIKE $%d", n)
		args = append(args, "%"+search+"%")
	}

	var total int
	h.db.QueryRow("SELECT COUNT(*) FROM ("+qb+") q", args...).Scan(&total)

	qb += " ORDER BY e.expense_date DESC, e.created_at DESC"
	n++
	qb += fmt.Sprintf(" LIMIT $%d", n)
	args = append(args, perPage)
	n++
	qb += fmt.Sprintf(" OFFSET $%d", n)
	args = append(args, offset)

	rows, err := h.db.Query(qb, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to fetch expenses", Error: strPtr(err.Error())})
		return
	}
	defer rows.Close()

	var expenses []models.Expense
	for rows.Next() {
		var e models.Expense
		var fn, ln sql.NullString
		if err := rows.Scan(&e.ID, &e.Category, &e.Amount, &e.Description, &e.ReferenceType, &e.ReferenceID,
			&e.ExpenseDate, &e.CreatedBy, &e.CreatedAt, &e.UpdatedAt, &fn, &ln); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to scan expense", Error: strPtr(err.Error())})
			return
		}
		if fn.Valid {
			name := fn.String + " " + ln.String
			e.CreatedByName = &name
		}
		expenses = append(expenses, e)
	}

	c.JSON(http.StatusOK, models.PaginatedResponse{
		Success: true, Message: "Expenses retrieved", Data: expenses,
		Meta: models.MetaData{CurrentPage: page, PerPage: perPage, Total: total, TotalPages: int(math.Ceil(float64(total) / float64(perPage)))},
	})
}

func (h *ExpenseHandler) CreateExpense(c *gin.Context) {
	userID, _, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, models.APIResponse{Success: false, Message: "Authentication required"})
		return
	}

	var req struct {
		Category    string  `json:"category" binding:"required"`
		Amount      float64 `json:"amount" binding:"required"`
		Description *string `json:"description"`
		ExpenseDate *string `json:"expense_date"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid request", Error: strPtr(err.Error())})
		return
	}

	validCategories := map[string]bool{
		"inventory_purchase": true, "utilities": true, "rent": true, "salaries": true,
		"maintenance": true, "marketing": true, "supplies": true, "other": true,
	}
	if !validCategories[req.Category] {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid expense category"})
		return
	}

	expenseDate := time.Now().Format("2006-01-02")
	if req.ExpenseDate != nil && *req.ExpenseDate != "" {
		expenseDate = *req.ExpenseDate
	}

	var id string
	err := h.db.QueryRow(`INSERT INTO expenses (category, amount, description, expense_date, created_by)
		VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		req.Category, req.Amount, req.Description, expenseDate, userID).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to create expense", Error: strPtr(err.Error())})
		return
	}

	c.JSON(http.StatusCreated, models.APIResponse{Success: true, Message: "Expense created", Data: map[string]string{"id": id}})
}

func (h *ExpenseHandler) UpdateExpense(c *gin.Context) {
	expID := c.Param("id")

	var refType sql.NullString
	h.db.QueryRow("SELECT reference_type FROM expenses WHERE id = $1", expID).Scan(&refType)
	if refType.Valid && refType.String != "" {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Cannot edit auto-linked expenses"})
		return
	}

	var req struct {
		Category    *string  `json:"category"`
		Amount      *float64 `json:"amount"`
		Description *string  `json:"description"`
		ExpenseDate *string  `json:"expense_date"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid request", Error: strPtr(err.Error())})
		return
	}

	sets, args, n := buildUpdates(map[string]interface{}{
		"category": req.Category, "amount": req.Amount, "description": req.Description, "expense_date": req.ExpenseDate,
	})
	if len(sets) == 0 {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "No fields to update"})
		return
	}
	sets = append(sets, "updated_at = CURRENT_TIMESTAMP")
	args = append(args, expID)
	query := fmt.Sprintf("UPDATE expenses SET %s WHERE id = $%d", strings.Join(sets, ", "), n+1)
	res, err := h.db.Exec(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to update expense", Error: strPtr(err.Error())})
		return
	}
	if ra, _ := res.RowsAffected(); ra == 0 {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Expense not found"})
		return
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Expense updated"})
}

func (h *ExpenseHandler) DeleteExpense(c *gin.Context) {
	expID := c.Param("id")

	var refType sql.NullString
	h.db.QueryRow("SELECT reference_type FROM expenses WHERE id = $1", expID).Scan(&refType)
	if refType.Valid && refType.String != "" {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Cannot delete auto-linked expenses"})
		return
	}

	res, err := h.db.Exec("DELETE FROM expenses WHERE id = $1", expID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to delete expense", Error: strPtr(err.Error())})
		return
	}
	if ra, _ := res.RowsAffected(); ra == 0 {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Expense not found"})
		return
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Expense deleted"})
}

func (h *ExpenseHandler) GetExpenseSummary(c *gin.Context) {
	from := c.DefaultQuery("from", time.Now().Format("2006-01-02"))
	to := c.DefaultQuery("to", time.Now().Format("2006-01-02"))

	rows, err := h.db.Query(`
		SELECT category, COUNT(*) as count, COALESCE(SUM(amount), 0) as total
		FROM expenses
		WHERE expense_date >= $1 AND expense_date <= $2
		GROUP BY category
		ORDER BY total DESC
	`, from, to)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to fetch summary", Error: strPtr(err.Error())})
		return
	}
	defer rows.Close()

	type CategoryTotal struct {
		Category string  `json:"category"`
		Count    int     `json:"count"`
		Total    float64 `json:"total"`
	}

	var categories []CategoryTotal
	var grandTotal float64
	for rows.Next() {
		var ct CategoryTotal
		rows.Scan(&ct.Category, &ct.Count, &ct.Total)
		grandTotal += ct.Total
		categories = append(categories, ct)
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true, Message: "Expense summary retrieved",
		Data: map[string]interface{}{
			"categories":  categories,
			"grand_total": grandTotal,
			"from":        from,
			"to":          to,
		},
	})
}

func (h *ExpenseHandler) GetExpenseCategories(c *gin.Context) {
	rows, err := h.db.Query(`
		SELECT category, COUNT(*) as count, COALESCE(SUM(amount), 0) as total
		FROM expenses
		GROUP BY category
		ORDER BY total DESC
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to fetch categories", Error: strPtr(err.Error())})
		return
	}
	defer rows.Close()

	type CatInfo struct {
		Category string  `json:"category"`
		Count    int     `json:"count"`
		Total    float64 `json:"total"`
	}

	var cats []CatInfo
	for rows.Next() {
		var ci CatInfo
		rows.Scan(&ci.Category, &ci.Count, &ci.Total)
		cats = append(cats, ci)
	}

	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Expense categories retrieved", Data: cats})
}

// ---------- P&L Report ----------

func (h *ExpenseHandler) GetPnLReport(c *gin.Context) {
	period := c.DefaultQuery("period", "daily")
	from := c.Query("from")
	to := c.Query("to")

	if from == "" {
		switch period {
		case "hourly":
			from = time.Now().Format("2006-01-02")
		case "daily":
			from = time.Now().AddDate(0, 0, -30).Format("2006-01-02")
		case "weekly":
			from = time.Now().AddDate(0, -3, 0).Format("2006-01-02")
		case "monthly":
			from = time.Now().AddDate(-1, 0, 0).Format("2006-01-02")
		default:
			from = time.Now().AddDate(0, 0, -30).Format("2006-01-02")
		}
	}
	if to == "" {
		to = time.Now().Format("2006-01-02")
	}

	var truncExpr string
	switch period {
	case "hourly":
		truncExpr = "DATE_TRUNC('hour', ts)"
	case "weekly":
		truncExpr = "DATE_TRUNC('week', ts)"
	case "monthly":
		truncExpr = "DATE_TRUNC('month', ts)"
	default:
		truncExpr = "DATE_TRUNC('day', ts)"
	}

	query := fmt.Sprintf(`
		WITH revenue AS (
			SELECT %s AS bucket,
			       COALESCE(SUM(total_amount), 0) AS total_revenue,
			       COALESCE(SUM(tax_amount), 0) AS total_tax,
			       COUNT(*) AS order_count
			FROM orders
			WHERE status = 'completed'
			  AND created_at::date >= $1 AND created_at::date <= $2
			GROUP BY bucket
		),
		expense AS (
			SELECT %s AS bucket,
			       COALESCE(SUM(amount), 0) AS total_expense
			FROM expenses
			WHERE expense_date >= $1 AND expense_date <= $2
			GROUP BY bucket
		),
		all_buckets AS (
			SELECT bucket FROM revenue
			UNION
			SELECT bucket FROM expense
		)
		SELECT ab.bucket,
		       COALESCE(r.total_revenue, 0),
		       COALESCE(r.total_tax, 0),
		       COALESCE(r.order_count, 0),
		       COALESCE(e.total_expense, 0),
		       COALESCE(r.total_revenue, 0) - COALESCE(e.total_expense, 0) AS net_profit
		FROM all_buckets ab
		LEFT JOIN revenue r ON r.bucket = ab.bucket
		LEFT JOIN expense e ON e.bucket = ab.bucket
		ORDER BY ab.bucket ASC
	`,
		strings.Replace(truncExpr, "ts", "created_at", 1),
		strings.Replace(truncExpr, "ts", "expense_date::timestamp", 1),
	)

	rows, err := h.db.Query(query, from, to)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to generate P&L report", Error: strPtr(err.Error())})
		return
	}
	defer rows.Close()

	type PnLRow struct {
		Period    time.Time `json:"period"`
		Revenue   float64   `json:"revenue"`
		Tax       float64   `json:"tax"`
		Orders    int       `json:"orders"`
		Expenses  float64   `json:"expenses"`
		NetProfit float64   `json:"net_profit"`
	}

	var pnlRows []PnLRow
	var sumRevenue, sumTax, sumExpenses, sumProfit float64
	var sumOrders int

	for rows.Next() {
		var r PnLRow
		if err := rows.Scan(&r.Period, &r.Revenue, &r.Tax, &r.Orders, &r.Expenses, &r.NetProfit); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to scan P&L row", Error: strPtr(err.Error())})
			return
		}
		sumRevenue += r.Revenue
		sumTax += r.Tax
		sumOrders += r.Orders
		sumExpenses += r.Expenses
		sumProfit += r.NetProfit
		pnlRows = append(pnlRows, r)
	}

	expCatRows, _ := h.db.Query(`
		SELECT category, COALESCE(SUM(amount), 0) AS total
		FROM expenses
		WHERE expense_date >= $1 AND expense_date <= $2
		GROUP BY category
		ORDER BY total DESC
	`, from, to)
	defer func() {
		if expCatRows != nil {
			expCatRows.Close()
		}
	}()

	type CatBreakdown struct {
		Category string  `json:"category"`
		Total    float64 `json:"total"`
	}
	var catBreakdown []CatBreakdown
	if expCatRows != nil {
		for expCatRows.Next() {
			var cb CatBreakdown
			expCatRows.Scan(&cb.Category, &cb.Total)
			catBreakdown = append(catBreakdown, cb)
		}
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true, Message: "P&L report generated",
		Data: map[string]interface{}{
			"period":    period,
			"from":      from,
			"to":        to,
			"rows":      pnlRows,
			"summary": map[string]interface{}{
				"total_revenue":  sumRevenue,
				"total_tax":      sumTax,
				"total_orders":   sumOrders,
				"total_expenses": sumExpenses,
				"net_profit":     sumProfit,
			},
			"expense_breakdown": catBreakdown,
		},
	})
}

// ---------- Daily Closing ----------

type DailyClosingHandler struct {
	db *sql.DB
}

func NewDailyClosingHandler(db *sql.DB) *DailyClosingHandler {
	return &DailyClosingHandler{db: db}
}

func (h *DailyClosingHandler) GetDailyClosings(c *gin.Context) {
	page, perPage := parsePagination(c)
	offset := (page - 1) * perPage

	var total int
	h.db.QueryRow("SELECT COUNT(*) FROM daily_closings").Scan(&total)

	rows, err := h.db.Query(`
		SELECT dc.id, dc.closing_date, dc.total_sales, dc.total_tax, dc.total_orders,
		       dc.cash_sales, dc.card_sales, dc.digital_sales, dc.total_expenses, dc.net_profit,
		       dc.opening_cash, dc.expected_cash, dc.actual_cash, dc.cash_difference,
		       dc.notes, dc.closed_by, dc.created_at,
		       u.first_name, u.last_name
		FROM daily_closings dc
		LEFT JOIN users u ON dc.closed_by = u.id
		ORDER BY dc.closing_date DESC
		LIMIT $1 OFFSET $2
	`, perPage, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to fetch closings", Error: strPtr(err.Error())})
		return
	}
	defer rows.Close()

	var closings []models.DailyClosing
	for rows.Next() {
		var dc models.DailyClosing
		var fn, ln sql.NullString
		if err := rows.Scan(&dc.ID, &dc.ClosingDate, &dc.TotalSales, &dc.TotalTax, &dc.TotalOrders,
			&dc.CashSales, &dc.CardSales, &dc.DigitalSales, &dc.TotalExpenses, &dc.NetProfit,
			&dc.OpeningCash, &dc.ExpectedCash, &dc.ActualCash, &dc.CashDifference,
			&dc.Notes, &dc.ClosedBy, &dc.CreatedAt, &fn, &ln); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to scan closing", Error: strPtr(err.Error())})
			return
		}
		if fn.Valid {
			name := fn.String + " " + ln.String
			dc.ClosedByName = &name
		}
		closings = append(closings, dc)
	}

	c.JSON(http.StatusOK, models.PaginatedResponse{
		Success: true, Message: "Daily closings retrieved", Data: closings,
		Meta: models.MetaData{CurrentPage: page, PerPage: perPage, Total: total, TotalPages: int(math.Ceil(float64(total) / float64(perPage)))},
	})
}

func (h *DailyClosingHandler) GetCurrentDayStatus(c *gin.Context) {
	today := time.Now().Format("2006-01-02")

	var exists bool
	h.db.QueryRow("SELECT EXISTS(SELECT 1 FROM daily_closings WHERE closing_date = $1)", today).Scan(&exists)
	if exists {
		c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Day already closed", Data: map[string]interface{}{"is_closed": true, "date": today}})
		return
	}

	var totalSales, totalTax, cashSales, cardSales, digitalSales float64
	var totalOrders int

	h.db.QueryRow(`
		SELECT COALESCE(SUM(o.total_amount), 0),
		       COALESCE(SUM(o.tax_amount), 0),
		       COUNT(*)
		FROM orders o
		WHERE o.status = 'completed' AND DATE(o.completed_at) = $1
	`, today).Scan(&totalSales, &totalTax, &totalOrders)

	h.db.QueryRow(`
		SELECT COALESCE(SUM(CASE WHEN p.payment_method = 'cash' THEN p.amount ELSE 0 END), 0),
		       COALESCE(SUM(CASE WHEN p.payment_method IN ('credit_card', 'debit_card') THEN p.amount ELSE 0 END), 0),
		       COALESCE(SUM(CASE WHEN p.payment_method = 'digital_wallet' THEN p.amount ELSE 0 END), 0)
		FROM payments p
		JOIN orders o ON p.order_id = o.id
		WHERE p.status = 'completed' AND DATE(o.completed_at) = $1
	`, today).Scan(&cashSales, &cardSales, &digitalSales)

	var totalExpenses float64
	h.db.QueryRow(`SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE expense_date = $1`, today).Scan(&totalExpenses)

	type ExpenseCat struct {
		Category string  `json:"category"`
		Total    float64 `json:"total"`
	}
	expRows, _ := h.db.Query(`SELECT category, COALESCE(SUM(amount), 0) FROM expenses WHERE expense_date = $1 GROUP BY category ORDER BY SUM(amount) DESC`, today)
	var expCats []ExpenseCat
	if expRows != nil {
		defer expRows.Close()
		for expRows.Next() {
			var ec ExpenseCat
			expRows.Scan(&ec.Category, &ec.Total)
			expCats = append(expCats, ec)
		}
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true, Message: "Current day status",
		Data: map[string]interface{}{
			"is_closed":      false,
			"date":           today,
			"total_sales":    totalSales,
			"total_tax":      totalTax,
			"total_orders":   totalOrders,
			"cash_sales":     cashSales,
			"card_sales":     cardSales,
			"digital_sales":  digitalSales,
			"total_expenses": totalExpenses,
			"net_profit":     totalSales - totalExpenses,
			"expense_categories": expCats,
		},
	})
}

func (h *DailyClosingHandler) CloseDay(c *gin.Context) {
	userID, _, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, models.APIResponse{Success: false, Message: "Authentication required"})
		return
	}

	var req struct {
		OpeningCash float64 `json:"opening_cash"`
		ActualCash  float64 `json:"actual_cash"`
		Notes       *string `json:"notes"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid request", Error: strPtr(err.Error())})
		return
	}

	today := time.Now().Format("2006-01-02")

	var exists bool
	h.db.QueryRow("SELECT EXISTS(SELECT 1 FROM daily_closings WHERE closing_date = $1)", today).Scan(&exists)
	if exists {
		c.JSON(http.StatusConflict, models.APIResponse{Success: false, Message: "Day has already been closed"})
		return
	}

	var totalSales, totalTax, cashSales, cardSales, digitalSales float64
	var totalOrders int

	h.db.QueryRow(`
		SELECT COALESCE(SUM(o.total_amount), 0), COALESCE(SUM(o.tax_amount), 0), COUNT(*)
		FROM orders o WHERE o.status = 'completed' AND DATE(o.completed_at) = $1
	`, today).Scan(&totalSales, &totalTax, &totalOrders)

	h.db.QueryRow(`
		SELECT COALESCE(SUM(CASE WHEN p.payment_method = 'cash' THEN p.amount ELSE 0 END), 0),
		       COALESCE(SUM(CASE WHEN p.payment_method IN ('credit_card', 'debit_card') THEN p.amount ELSE 0 END), 0),
		       COALESCE(SUM(CASE WHEN p.payment_method = 'digital_wallet' THEN p.amount ELSE 0 END), 0)
		FROM payments p
		JOIN orders o ON p.order_id = o.id
		WHERE p.status = 'completed' AND DATE(o.completed_at) = $1
	`, today).Scan(&cashSales, &cardSales, &digitalSales)

	var totalExpenses float64
	h.db.QueryRow(`SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE expense_date = $1`, today).Scan(&totalExpenses)

	expectedCash := req.OpeningCash + cashSales
	cashDifference := req.ActualCash - expectedCash
	netProfit := totalSales - totalExpenses

	var id string
	err := h.db.QueryRow(`
		INSERT INTO daily_closings (closing_date, total_sales, total_tax, total_orders,
		       cash_sales, card_sales, digital_sales, total_expenses, net_profit,
		       opening_cash, expected_cash, actual_cash, cash_difference, notes, closed_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
		today, totalSales, totalTax, totalOrders,
		cashSales, cardSales, digitalSales, totalExpenses, netProfit,
		req.OpeningCash, expectedCash, req.ActualCash, cashDifference, req.Notes, userID).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to close day", Error: strPtr(err.Error())})
		return
	}

	c.JSON(http.StatusCreated, models.APIResponse{
		Success: true, Message: "Day closed successfully",
		Data: map[string]interface{}{
			"id":              id,
			"closing_date":    today,
			"total_sales":     totalSales,
			"total_expenses":  totalExpenses,
			"net_profit":      netProfit,
			"expected_cash":   expectedCash,
			"actual_cash":     req.ActualCash,
			"cash_difference": cashDifference,
		},
	})
}

func (h *DailyClosingHandler) GetDailyClosingByDate(c *gin.Context) {
	date := c.Param("date")
	if _, err := time.Parse("2006-01-02", date); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid date format, use YYYY-MM-DD"})
		return
	}

	var dc models.DailyClosing
	var fn, ln sql.NullString
	err := h.db.QueryRow(`
		SELECT dc.id, dc.closing_date, dc.total_sales, dc.total_tax, dc.total_orders,
		       dc.cash_sales, dc.card_sales, dc.digital_sales, dc.total_expenses, dc.net_profit,
		       dc.opening_cash, dc.expected_cash, dc.actual_cash, dc.cash_difference,
		       dc.notes, dc.closed_by, dc.created_at,
		       u.first_name, u.last_name
		FROM daily_closings dc
		LEFT JOIN users u ON dc.closed_by = u.id
		WHERE dc.closing_date = $1
	`, date).Scan(&dc.ID, &dc.ClosingDate, &dc.TotalSales, &dc.TotalTax, &dc.TotalOrders,
		&dc.CashSales, &dc.CardSales, &dc.DigitalSales, &dc.TotalExpenses, &dc.NetProfit,
		&dc.OpeningCash, &dc.ExpectedCash, &dc.ActualCash, &dc.CashDifference,
		&dc.Notes, &dc.ClosedBy, &dc.CreatedAt, &fn, &ln)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "No closing found for this date"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to fetch closing", Error: strPtr(err.Error())})
		return
	}
	if fn.Valid {
		name := fn.String + " " + ln.String
		dc.ClosedByName = &name
	}

	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Daily closing retrieved", Data: dc})
}
