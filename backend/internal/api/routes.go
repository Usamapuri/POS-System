package api

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"pos-backend/internal/config"
	"pos-backend/internal/handlers"
	"pos-backend/internal/middleware"
	"pos-backend/internal/models"
	"pos-backend/internal/realtime"
	"pos-backend/internal/util"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

// SetupRoutes configures all API routes
func SetupRoutes(router *gin.RouterGroup, db *sql.DB, authMiddleware gin.HandlerFunc) {
	// Initialize handlers
	authHandler := handlers.NewAuthHandler(db)
	orderHandler := handlers.NewOrderHandler(db)
	productHandler := handlers.NewProductHandler(db)
	paymentHandler := handlers.NewPaymentHandler(db)
	tableHandler := handlers.NewTableHandler(db)
	stockHandler := handlers.NewStockHandler(db)
	expenseHandler := handlers.NewExpenseHandler(db)
	closingHandler := handlers.NewDailyClosingHandler(db)
	stationHandler := handlers.NewStationHandler(db)
	kotHandler := handlers.NewKOTHandler(db)
	pinHandler := handlers.NewPinHandler(db)
	settingsHandler := handlers.NewSettingsHandler(db)
	counterHandler := handlers.NewCounterHandler(db)
	reportsHandler := handlers.NewReportsHandler(db)
	dashboardHandler := handlers.NewDashboardHandler(db)
	fiscalHandler := handlers.NewFiscalHandler(db)

	// Public routes (no authentication required)
	public := router.Group("/")
	{
		// Authentication routes
		public.POST("/auth/login", authHandler.Login)
		public.POST("/auth/logout", authHandler.Logout)
		// Self-service password flow. Both endpoints are deliberately public
		// (no JWT required) and rate-limited inside the handler. Responses
		// are generic so they don't leak which emails exist.
		public.POST("/auth/forgot-password", authHandler.ForgotPassword)
		public.POST("/auth/reset-password", authHandler.ResetPassword)
	}

	// Protected routes (authentication required)
	protected := router.Group("/")
	protected.Use(authMiddleware)
	{
		// Authentication routes
		protected.GET("/auth/me", authHandler.GetCurrentUser)
		// Authenticated self-service — user rotating their own password.
		// Requires the current password in the body as anti-session-hijack.
		protected.POST("/auth/change-password", authHandler.ChangePassword)

		// Product routes
		protected.GET("/products", productHandler.GetProducts)
		protected.GET("/products/:id", productHandler.GetProduct)
		protected.GET("/categories", productHandler.GetCategories)
		protected.GET("/categories/:id/products", productHandler.GetProductsByCategory)

		// Table routes
		protected.GET("/tables", tableHandler.GetTables)
		protected.GET("/tables/:id", tableHandler.GetTable)
		protected.GET("/tables/by-location", tableHandler.GetTablesByLocation)
		protected.GET("/tables/status", tableHandler.GetTableStatus)

		// Order routes (general view for all roles)
		protected.GET("/orders", orderHandler.GetOrders)
		protected.GET("/orders/:id", orderHandler.GetOrder)
		protected.PATCH("/orders/:id/status", orderHandler.UpdateOrderStatus)

		// Payment routes (counter/admin only)
		protected.GET("/orders/:id/payments", paymentHandler.GetPayments)
		protected.GET("/orders/:id/payment-summary", paymentHandler.GetPaymentSummary)

		// PIN verification (any authenticated user can verify)
		protected.POST("/verify-pin", pinHandler.VerifyPin)

		// Settings (read for all authenticated users)
		protected.GET("/settings/:key", settingsHandler.GetSetting)
		protected.GET("/settings", settingsHandler.GetAllSettings)
	}

	// KOT / order-line mutations — admin + counter + manager (floor/checkout). Kitchen is
	// intentionally excluded; KDS is observe / bump / status only.
	orderWrite := router.Group("/")
	orderWrite.Use(authMiddleware)
	orderWrite.Use(middleware.RequireRoles([]string{"counter", "manager", "admin"}))
	{
		orderWrite.POST("/orders/:id/fire-kot", kotHandler.FireKOT)
		orderWrite.POST("/orders/:id/items", kotHandler.AddItemsToOrder)
		orderWrite.DELETE("/orders/:id/items/:item_id", kotHandler.RemoveDraftItem)
		orderWrite.POST("/orders/:id/items/:item_id/void", kotHandler.VoidItem)
	}

	// Counter routes (all order types + payments; admins/managers use the same APIs from the admin shell)
	counter := router.Group("/counter")
	counter.Use(authMiddleware)
	counter.Use(middleware.RequireRoles([]string{"counter", "manager", "admin"}))
	{
		counter.GET("/servers", counterHandler.ListServers)
		counter.GET("/pricing", settingsHandler.GetPricingSettings)
		counter.GET("/tables/:table_id/active-order", orderHandler.GetActiveOrderByTable)
		counter.POST("/table-tabs", orderHandler.OpenCounterTableTab)
		counter.POST("/orders/:id/cancel-open-tab", orderHandler.CancelCounterOpenTab)
		counter.PATCH("/orders/:id/table", orderHandler.ReassignCounterOrderTable)
		counter.POST("/orders", orderHandler.CreateOrder) // All order types
		counter.PATCH("/orders/:id/checkout-intent", orderHandler.UpdateCheckoutIntent)
		counter.PATCH("/orders/:id/discount", orderHandler.ApplyOrderDiscount)
		counter.PATCH("/orders/:id/guest", orderHandler.UpdateCounterOrderGuest)
		counter.PATCH("/orders/:id/service", orderHandler.UpdateCounterOrderService)
		counter.POST("/orders/:id/payments", paymentHandler.ProcessPayment) // Process payments
		counter.POST("/orders/:id/pra-invoice", orderHandler.MarkPraInvoicePrinted)
	}

	// Menu + table CRUD — admins and managers (not checkout-only counter staff).
	adminMenu := router.Group("/admin")
	adminMenu.Use(authMiddleware)
	adminMenu.Use(middleware.RequireRoles([]string{"admin", "manager"}))
	{
		adminMenu.GET("/products", productHandler.GetProducts)
		adminMenu.GET("/categories", getAdminCategories(db))
		adminMenu.POST("/categories", createCategory(db))
		adminMenu.PUT("/categories/:id/station", stationHandler.SetCategoryKitchenStation)
		adminMenu.PUT("/categories/:id", updateCategory(db))
		adminMenu.DELETE("/categories/:id", deleteCategory(db))
		adminMenu.POST("/products", createProduct(db))
		adminMenu.PUT("/products/:id", updateProduct(db))
		adminMenu.DELETE("/products/:id", deleteProduct(db))

		adminMenu.GET("/tables", getAdminTables(db))
		adminMenu.POST("/tables", createTable(db))
		adminMenu.PUT("/tables/:id", updateTable(db))
		adminMenu.DELETE("/tables/:id", deleteTable(db))
	}

	// Void log audit — admins and managers (read-only list).
	adminVoidLog := router.Group("/admin")
	adminVoidLog.Use(authMiddleware)
	adminVoidLog.Use(middleware.RequireRoles([]string{"admin", "manager"}))
	{
		adminVoidLog.GET("/void-log", pinHandler.GetVoidLog)
	}

	// Staff listing — admins and managers (read-only list used by manage-staff page).
	adminStaffRead := router.Group("/admin")
	adminStaffRead.Use(authMiddleware)
	adminStaffRead.Use(middleware.RequireRoles([]string{"admin", "manager"}))
	{
		adminStaffRead.GET("/users", getAdminUsers(db))
	}

	// Staff + settings management for admin shell roles that can access those pages.
	adminManagerWrite := router.Group("/admin")
	adminManagerWrite.Use(authMiddleware)
	adminManagerWrite.Use(middleware.RequireRoles([]string{"admin", "manager"}))
	{
		// User management with pagination
		adminManagerWrite.POST("/users", createUser(db))
		adminManagerWrite.PUT("/users/:id", updateUser(db))
		adminManagerWrite.DELETE("/users/:id", deleteUser(db))
		// PIN management (void authorization PIN — set for admin/manager accounts)
		adminManagerWrite.PUT("/users/:id/pin", pinHandler.SetPin)
		// Settings management
		adminManagerWrite.PUT("/settings/:key", settingsHandler.UpdateSetting)
	}

	// Kitchen station configuration — admins + managers + kitchen.
	adminStations := router.Group("/admin")
	adminStations.Use(authMiddleware)
	adminStations.Use(middleware.RequireRoles([]string{"admin", "manager", "kitchen"}))
	{
		adminStations.GET("/stations", stationHandler.GetStations)
		adminStations.POST("/stations", stationHandler.CreateStation)
		adminStations.PUT("/stations/:id", stationHandler.UpdateStation)
		adminStations.DELETE("/stations/:id", stationHandler.DeleteStation)
		adminStations.POST("/stations/:id/categories", stationHandler.SetStationCategories)
		adminStations.GET("/stations/:id/categories", stationHandler.GetStationCategories)
		adminStations.POST("/stations/:id/test-kot", stationHandler.TestKOT)
	}

	// Admin-only routes (full owner dashboard, staff, settings, reports, …).
	adminOnly := router.Group("/admin")
	adminOnly.Use(authMiddleware)
	adminOnly.Use(middleware.RequireRoles([]string{"admin"}))
	{
		// Dashboard and monitoring
		// Legacy snapshot — kept for backward compatibility while clients
		// migrate to the new typed /dashboard/* endpoints below.
		adminOnly.GET("/dashboard/stats", getDashboardStats(db))
		adminOnly.GET("/reports/sales", getSalesReport(db))
		adminOnly.GET("/reports/orders", getOrdersReport(db))
		adminOnly.GET("/reports/income", getIncomeReport(db))

		// Dashboard v2 — typed, business-timezone-aware, with real
		// previous-period comparisons and server-formatted bucket labels.
		adminOnly.GET("/dashboard/overview", dashboardHandler.GetOverview)
		adminOnly.GET("/dashboard/live", dashboardHandler.GetLive)
		adminOnly.GET("/dashboard/sales-timeseries", dashboardHandler.GetSalesTimeseries)
		adminOnly.GET("/dashboard/top-items", dashboardHandler.GetTopItems)
		adminOnly.GET("/dashboard/payment-mix", dashboardHandler.GetPaymentMix)
		adminOnly.GET("/dashboard/order-type-mix", dashboardHandler.GetOrderTypeMix)
		adminOnly.GET("/dashboard/alerts", dashboardHandler.GetAlerts)

		// Reports v2 — granular, drill-down enterprise-grade reports
		// (powers the redesigned /admin/reports page). All endpoints honor
		// Asia/Karachi calendar days and return DD-MM-YYYY *_label fields.
		adminOnly.GET("/reports/v2/overview", reportsHandler.GetOverview)
		adminOnly.GET("/reports/v2/sales/daily", reportsHandler.GetDailySales)
		adminOnly.GET("/reports/v2/sales/hourly", reportsHandler.GetHourlySales)
		adminOnly.GET("/reports/v2/items", reportsHandler.GetItemSales)
		adminOnly.GET("/reports/v2/tables", reportsHandler.GetTableSales)
		adminOnly.GET("/reports/v2/party-size", reportsHandler.GetPartySizeReport)
		adminOnly.GET("/reports/v2/orders", reportsHandler.GetOrdersBrowser)
		adminOnly.GET("/reports/v2/export", reportsHandler.ExportReport)

		// Advanced order management
		adminOnly.POST("/orders", orderHandler.CreateOrder)
		adminOnly.POST("/orders/:id/payments", paymentHandler.ProcessPayment)
		adminOnly.POST("/orders/:id/pra-invoice", orderHandler.MarkPraInvoicePrinted)

		// Expense management
		adminOnly.GET("/expenses", expenseHandler.GetExpenses)
		adminOnly.POST("/expenses", expenseHandler.CreateExpense)
		adminOnly.PUT("/expenses/:id", expenseHandler.UpdateExpense)
		adminOnly.DELETE("/expenses/:id", expenseHandler.DeleteExpense)
		adminOnly.GET("/expenses/summary", expenseHandler.GetExpenseSummary)
		adminOnly.GET("/expenses/categories", expenseHandler.GetExpenseCategories)
		adminOnly.GET("/expense-category-definitions", expenseHandler.ListExpenseCategoryDefinitions)
		adminOnly.POST("/expense-category-definitions", expenseHandler.CreateExpenseCategoryDefinition)
		adminOnly.PUT("/expense-category-definitions/:id", expenseHandler.UpdateExpenseCategoryDefinition)
		adminOnly.DELETE("/expense-category-definitions/:id", expenseHandler.DeleteExpenseCategoryDefinition)

		// Daily closing
		adminOnly.GET("/daily-closings", closingHandler.GetDailyClosings)
		adminOnly.GET("/daily-closings/current", closingHandler.GetCurrentDayStatus)
		adminOnly.POST("/daily-closings", closingHandler.CloseDay)
		adminOnly.GET("/daily-closings/:date", closingHandler.GetDailyClosingByDate)

		// P&L Reports
		adminOnly.GET("/reports/pnl", expenseHandler.GetPnLReport)
		adminOnly.GET("/reports/expense-intelligence", expenseHandler.GetExpenseIntelligence)

		adminOnly.GET("/customers", listAdminCustomers(db))

		// Fiscal compliance (FBR/PRA/mock)
		adminOnly.GET("/fiscal/config", fiscalHandler.GetConfig)
		adminOnly.PUT("/fiscal/config", fiscalHandler.PutConfig)
		adminOnly.POST("/fiscal/test-connection", fiscalHandler.TestConnection)
	}

	// Store inventory routes
	store := router.Group("/store")
	store.Use(authMiddleware)
	store.Use(middleware.RequireRoles([]string{"admin", "inventory_manager"}))
	{
		store.GET("/stock-categories", stockHandler.GetStockCategories)
		store.POST("/stock-categories", stockHandler.CreateStockCategory)
		store.PUT("/stock-categories/:id", stockHandler.UpdateStockCategory)
		store.DELETE("/stock-categories/:id", stockHandler.DeleteStockCategory)

		store.GET("/stock-items", stockHandler.GetStockItems)
		store.GET("/stock-items/:id", stockHandler.GetStockItem)
		store.POST("/stock-items", stockHandler.CreateStockItem)
		store.PUT("/stock-items/:id", stockHandler.UpdateStockItem)
		store.DELETE("/stock-items/:id", stockHandler.DeleteStockItem)

		store.POST("/stock-items/:id/purchase", stockHandler.PurchaseStock)
		store.POST("/stock-items/:id/issue", stockHandler.IssueStock)
		store.POST("/stock-items/:id/adjust", stockHandler.AdjustStock)

		store.GET("/stock-alerts", stockHandler.GetStockAlerts)
		store.GET("/stock-reports/movements", stockHandler.GetMovementsReport)
		store.GET("/stock-reports/summary", stockHandler.GetStockSummary)
		store.GET("/stock-reports/advanced", stockHandler.GetAdvancedReport)
		store.GET("/inventory-activity", stockHandler.GetInventoryActivity)
		store.POST("/stock-movements/:id/void", stockHandler.VoidPurchaseMovement)
		store.POST("/stock-movements/:id/correct-purchase-cost", stockHandler.CorrectPurchaseMovementCost)
		store.GET("/users", stockHandler.GetStoreUsers)

		store.GET("/suppliers", stockHandler.ListSuppliers)
		store.POST("/suppliers", stockHandler.CreateSupplier)
		store.PUT("/suppliers/:id", stockHandler.UpdateSupplier)
		store.DELETE("/suppliers/:id", stockHandler.DeleteSupplier)

		store.GET("/purchase-orders", stockHandler.ListPurchaseOrders)
		store.GET("/purchase-orders/:id", stockHandler.GetPurchaseOrder)
		store.POST("/purchase-orders", stockHandler.CreatePurchaseOrder)
		store.POST("/purchase-orders/:id/submit", stockHandler.SubmitPurchaseOrder)
		store.POST("/purchase-orders/:id/cancel", stockHandler.CancelPurchaseOrder)
		store.POST("/purchase-orders/:id/receive", stockHandler.ReceivePurchaseOrder)
	}

	// Kitchen routes (kitchen staff access). Gated by venue Kitchen Mode:
	// if set to 'kot_only', all endpoints return kitchen_display_disabled.
	kitchen := router.Group("/kitchen")
	kitchen.Use(authMiddleware)
	kitchen.Use(middleware.RequireRoles([]string{"kitchen", "admin"}))
	kitchen.Use(middleware.RequireKDSEnabled(db))
	{
		kitchen.GET("/orders", getKitchenOrders(db))
		kitchen.GET("/recent-bumped", getRecentBumpedOrders(db))
		// Read-only stations list for the KDS station filter. Kitchen role
		// doesn't have /admin/stations access, so we expose a scoped alias.
		kitchen.GET("/stations", stationHandler.GetStations)
		kitchen.PATCH("/orders/:id/items/:item_id/status", updateOrderItemStatus(db))
		kitchen.POST("/orders/:id/bump", kotHandler.KitchenBump)
		kitchen.POST("/orders/:id/recall", kotHandler.RecallOrder)
	}

	// SSE stream: EventSource can't send custom headers, so we accept the
	// JWT via query string (?token=) as well as Authorization. The stream is
	// gated on the same role + mode rules as the kitchen REST endpoints.
	router.GET("/kitchen/stream", sseAuthMiddleware(), middleware.RequireRoles([]string{"kitchen", "admin"}), middleware.RequireKDSEnabled(db), kitchenStream())

	// Admin dashboard SSE — same auth pattern as /kitchen/stream. Pushes a
	// signal whenever orders, payments, tables, or voids change so the UI
	// can refresh live cards without polling.
	router.GET("/admin/dashboard/stream",
		sseAuthMiddleware(),
		middleware.RequireRoles([]string{"admin", "manager"}),
		dashboardHandler.DashboardStream(),
	)
}

// Dashboard stats handler — DEPRECATED.
//
// New clients should use /admin/dashboard/overview + /admin/dashboard/live
// (see handlers/dashboard.go) which return typed payloads with prior-period
// comparisons and consistent semantics.
//
// This shim is kept so older clients don't break. Two bug fixes vs. the
// previous version:
//  1. today_orders and today_revenue are both filtered to status='completed'
//     so the two cards now share a denominator (no more "29 orders, but
//     revenue from only 16 of them").
//  2. "Today" is computed in the BUSINESS timezone, not the DB session
//     timezone, matching how orders.go numbers KOTs.
func getDashboardStats(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		stats := make(map[string]interface{})
		tz := util.BusinessTimezoneName()
		today := util.BusinessNow().Format("2006-01-02")

		// Today's completed orders (count + revenue come from the same row set)
		var todayOrders int
		var todayRevenue float64
		db.QueryRow(`
			SELECT COUNT(*), COALESCE(SUM(total_amount - tax_amount), 0)
			FROM orders
			WHERE status = 'completed'
			  AND (created_at AT TIME ZONE $1)::date = $2::date
		`, tz, today).Scan(&todayOrders, &todayRevenue)

		// Total orders placed today (any status) — useful drop-off signal.
		var todayPlaced int
		db.QueryRow(`
			SELECT COUNT(*)
			FROM orders
			WHERE (created_at AT TIME ZONE $1)::date = $2::date
		`, tz, today).Scan(&todayPlaced)

		var activeOrders int
		db.QueryRow(`
			SELECT COUNT(*) FROM orders WHERE status NOT IN ('completed', 'cancelled')
		`).Scan(&activeOrders)

		var occupiedTables int
		db.QueryRow(`
			SELECT COUNT(*) FROM dining_tables WHERE is_occupied = true
		`).Scan(&occupiedTables)

		stats["today_orders"] = todayOrders        // completed only — matches today_revenue
		stats["today_orders_placed"] = todayPlaced // any status — drop-off denominator
		stats["today_revenue"] = todayRevenue      // net of tax, completed orders only
		stats["active_orders"] = activeOrders
		stats["occupied_tables"] = occupiedTables

		c.JSON(200, gin.H{
			"success": true,
			"message": "Dashboard stats retrieved successfully",
			"data":    stats,
		})
	}
}

// Sales report handler
func getSalesReport(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		period := c.DefaultQuery("period", "today") // today, week, month

		var query string
		switch period {
		case "week":
			query = `
				SELECT DATE(created_at) as date, COUNT(*) as order_count, SUM(total_amount) as revenue
				FROM orders 
				WHERE created_at >= CURRENT_DATE - INTERVAL '7 days' AND status = 'completed'
				GROUP BY DATE(created_at)
				ORDER BY date DESC
			`
		case "month":
			query = `
				SELECT DATE(created_at) as date, COUNT(*) as order_count, SUM(total_amount) as revenue
				FROM orders 
				WHERE created_at >= CURRENT_DATE - INTERVAL '30 days' AND status = 'completed'
				GROUP BY DATE(created_at)
				ORDER BY date DESC
			`
		default: // today
			query = `
				SELECT DATE_TRUNC('hour', created_at) as hour, COUNT(*) as order_count, SUM(total_amount) as revenue
				FROM orders 
				WHERE DATE(created_at) = CURRENT_DATE AND status = 'completed'
				GROUP BY DATE_TRUNC('hour', created_at)
				ORDER BY hour DESC
			`
		}

		rows, err := db.Query(query)
		if err != nil {
			c.JSON(500, gin.H{
				"success": false,
				"message": "Failed to fetch sales report",
				"error":   err.Error(),
			})
			return
		}
		defer rows.Close()

		var report []map[string]interface{}
		for rows.Next() {
			var date interface{}
			var orderCount int
			var revenue float64

			err := rows.Scan(&date, &orderCount, &revenue)
			if err != nil {
				c.JSON(500, gin.H{
					"success": false,
					"message": "Failed to scan sales data",
					"error":   err.Error(),
				})
				return
			}

			report = append(report, map[string]interface{}{
				"date":        date,
				"order_count": orderCount,
				"revenue":     revenue,
			})
		}

		c.JSON(200, gin.H{
			"success": true,
			"message": "Sales report retrieved successfully",
			"data":    report,
		})
	}
}

// listAdminCustomers returns CRM customers with visit counts (optional search q).
func listAdminCustomers(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		q := strings.TrimSpace(c.Query("q"))
		page := 1
		if p := c.Query("page"); p != "" {
			if n, err := strconv.Atoi(p); err == nil && n > 0 {
				page = n
			}
		}
		const perPage = 40
		offset := (page - 1) * perPage

		base := `
			SELECT c.id::text, c.email, c.phone, c.display_name, c.birthday, c.created_at, c.updated_at,
			       (SELECT COUNT(*)::int FROM orders o WHERE o.customer_id = c.id AND o.status <> 'cancelled') AS visit_count,
			       (SELECT MAX(o.created_at) FROM orders o WHERE o.customer_id = c.id AND o.status <> 'cancelled') AS last_visit_at
			FROM customers c
		`
		var rows *sql.Rows
		var err error
		if q != "" {
			pat := "%" + strings.ToLower(q) + "%"
			rows, err = db.Query(base+` WHERE lower(COALESCE(c.display_name,'')) LIKE $1 OR lower(COALESCE(c.email,'')) LIKE $1 OR COALESCE(c.phone,'') ILIKE $1
				ORDER BY last_visit_at DESC NULLS LAST, c.created_at DESC LIMIT $2 OFFSET $3`, pat, perPage, offset)
		} else {
			rows, err = db.Query(base+` ORDER BY last_visit_at DESC NULLS LAST, c.created_at DESC LIMIT $1 OFFSET $2`, perPage, offset)
		}
		if err != nil {
			c.JSON(500, gin.H{"success": false, "message": "Failed to list customers", "error": err.Error()})
			return
		}
		defer rows.Close()

		var list []map[string]interface{}
		for rows.Next() {
			var id, email, phone, display sql.NullString
			var bd sql.NullTime
			var createdAt, updatedAt interface{}
			var visitCount int
			var lastVisit sql.NullTime
			if err := rows.Scan(&id, &email, &phone, &display, &bd, &createdAt, &updatedAt, &visitCount, &lastVisit); err != nil {
				c.JSON(500, gin.H{"success": false, "message": "Failed to scan customer", "error": err.Error()})
				return
			}
			row := map[string]interface{}{
				"id":          id.String,
				"visit_count": visitCount,
				"created_at":  createdAt,
				"updated_at":  updatedAt,
			}
			if email.Valid {
				row["email"] = email.String
			}
			if phone.Valid {
				row["phone"] = phone.String
			}
			if display.Valid {
				row["display_name"] = display.String
			}
			if bd.Valid {
				row["birthday"] = bd.Time.Format("2006-01-02")
			}
			if lastVisit.Valid {
				row["last_visit_at"] = lastVisit.Time
			}
			list = append(list, row)
		}
		c.JSON(200, gin.H{"success": true, "message": "Customers retrieved", "data": list})
	}
}

// Orders report handler
func getOrdersReport(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get order statistics
		query := `
			SELECT 
				status,
				COUNT(*) as count,
				AVG(total_amount) as avg_amount
			FROM orders 
			WHERE DATE(created_at) = CURRENT_DATE
			GROUP BY status
		`

		rows, err := db.Query(query)
		if err != nil {
			c.JSON(500, gin.H{
				"success": false,
				"message": "Failed to fetch orders report",
				"error":   err.Error(),
			})
			return
		}
		defer rows.Close()

		var report []map[string]interface{}
		for rows.Next() {
			var status string
			var count int
			var avgAmount float64

			err := rows.Scan(&status, &count, &avgAmount)
			if err != nil {
				c.JSON(500, gin.H{
					"success": false,
					"message": "Failed to scan orders data",
					"error":   err.Error(),
				})
				return
			}

			report = append(report, map[string]interface{}{
				"status":     status,
				"count":      count,
				"avg_amount": avgAmount,
			})
		}

		c.JSON(200, gin.H{
			"success": true,
			"message": "Orders report retrieved successfully",
			"data":    report,
		})
	}
}

// Kitchen orders handler
func getKitchenOrders(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		status := c.DefaultQuery("status", "all")
		stationID := strings.TrimSpace(c.Query("station_id"))
		includeStale := c.Query("include_stale") == "true"
		settings := config.LoadKitchen(db)

		// Use a parameterized query so the stale threshold can be tuned
		// per venue without string interpolation risk.
		args := []interface{}{}
		idx := 1

		q := `
			SELECT DISTINCT o.id::text, o.order_number, o.table_id::text, o.order_type, o.status,
			       o.created_at, o.updated_at, o.customer_name, o.guest_count,
			       o.kot_first_sent_at,
			       t.table_number, t.location,
			       u.first_name, u.last_name
			FROM orders o
			LEFT JOIN dining_tables t ON o.table_id = t.id
			LEFT JOIN users u ON o.user_id = u.id
		`

		whereParts := []string{"o.status IN ('confirmed', 'preparing', 'ready')"}

		if status != "all" {
			whereParts = append(whereParts, fmt.Sprintf("o.status = $%d", idx))
			args = append(args, status)
			idx++
		}

		if !includeStale && settings.StaleMinutes > 0 {
			whereParts = append(whereParts,
				fmt.Sprintf("o.created_at > NOW() - ($%d || ' minutes')::interval", idx))
			args = append(args, strconv.Itoa(settings.StaleMinutes))
			idx++
		}

		if stationID != "" {
			if _, err := uuid.Parse(stationID); err == nil {
				q += `
					JOIN order_items oi ON oi.order_id = o.id
					JOIN products p ON oi.product_id = p.id
					JOIN category_station_map csm ON csm.category_id = p.category_id
				`
				whereParts = append(whereParts, fmt.Sprintf("csm.station_id = $%d::uuid", idx))
				whereParts = append(whereParts, "oi.status NOT IN ('draft','voided')")
				args = append(args, stationID)
				idx++
			}
		}

		q += " WHERE " + strings.Join(whereParts, " AND ")
		q += ` ORDER BY o.created_at ASC`

		rows, err := db.Query(q, args...)
		if err != nil {
			c.JSON(500, gin.H{
				"success": false,
				"message": "Failed to fetch kitchen orders",
				"error":   err.Error(),
			})
			return
		}
		defer rows.Close()

		type kitchenOrder struct {
			ID             string                   `json:"id"`
			OrderNumber    string                   `json:"order_number"`
			TableID        *string                  `json:"table_id"`
			OrderType      string                   `json:"order_type"`
			Status         string                   `json:"status"`
			CreatedAt      interface{}              `json:"created_at"`
			UpdatedAt      interface{}              `json:"updated_at"`
			CustomerName   string                   `json:"customer_name"`
			GuestCount     int                      `json:"guest_count"`
			KotFirstSentAt interface{}              `json:"kot_first_sent_at,omitempty"`
			Table          map[string]interface{}   `json:"table,omitempty"`
			Items          []map[string]interface{} `json:"items"`
			ServerName     string                   `json:"server_name,omitempty"`
		}

		var orders []kitchenOrder
		for rows.Next() {
			var o kitchenOrder
			var orderIDStr string
			var tableID, tableNumber, tableLocation sql.NullString
			var orderNumber, orderType, orderStatus, customerName sql.NullString
			var firstName, lastName sql.NullString
			var createdAt, updatedAt interface{}
			var guestCount sql.NullInt64
			var kotFirstSent sql.NullTime

			err := rows.Scan(&orderIDStr, &orderNumber, &tableID, &orderType, &orderStatus,
				&createdAt, &updatedAt, &customerName, &guestCount,
				&kotFirstSent,
				&tableNumber, &tableLocation,
				&firstName, &lastName)
			if err != nil {
				c.JSON(500, gin.H{
					"success": false,
					"message": "Failed to scan kitchen order",
					"error":   err.Error(),
				})
				return
			}

			o.ID = orderIDStr
			o.OrderNumber = orderNumber.String
			o.OrderType = orderType.String
			o.Status = orderStatus.String
			o.CustomerName = customerName.String
			o.GuestCount = 0
			if guestCount.Valid {
				o.GuestCount = int(guestCount.Int64)
			}
			o.CreatedAt = createdAt
			o.UpdatedAt = updatedAt

			if tableID.Valid {
				tid := tableID.String
				o.TableID = &tid
				o.Table = map[string]interface{}{
					"table_number": tableNumber.String,
					"location":     tableLocation.String,
				}
			}

			if firstName.Valid {
				o.ServerName = firstName.String + " " + lastName.String
			}
			if kotFirstSent.Valid {
				o.KotFirstSentAt = kotFirstSent.Time
			}

			orders = append(orders, o)
		}

		// Fetch items for each order (include voided for KDS strikethrough; exclude draft only)
		for i, order := range orders {
			items := fetchKitchenOrderItems(db, order.ID)
			orders[i].Items = items
		}

		c.JSON(200, gin.H{
			"success": true,
			"message": "Kitchen orders retrieved successfully",
			"data":    orders,
		})
	}
}

// fetchKitchenOrderItems loads line items for KDS (includes voided for strikethrough; excludes draft).
func fetchKitchenOrderItems(db *sql.DB, orderID string) []map[string]interface{} {
	itemRows, err := db.Query(`
		SELECT oi.id::text, oi.product_id::text, oi.quantity, oi.unit_price, oi.total_price,
		       oi.special_instructions, oi.status, oi.created_at, oi.updated_at,
		       oi.kot_sent_at, oi.kot_fire_generation,
		       p.name AS product_name, p.category_id::text
		FROM order_items oi
		JOIN products p ON oi.product_id = p.id
		WHERE oi.order_id = $1::uuid AND oi.status != 'draft'
		ORDER BY oi.created_at ASC
	`, orderID)
	if err != nil || itemRows == nil {
		return nil
	}
	defer itemRows.Close()

	var items []map[string]interface{}
	for itemRows.Next() {
		var itemID, productID string
		var productName string
		var categoryID sql.NullString
		var qty int
		var unitPrice, totalPrice float64
		var specialInstructions sql.NullString
		var itemStatus string
		var itemCreatedAt, itemUpdatedAt interface{}
		var kotSentAt sql.NullTime
		var kotFireGen int

		if err := itemRows.Scan(&itemID, &productID, &qty, &unitPrice, &totalPrice,
			&specialInstructions, &itemStatus, &itemCreatedAt, &itemUpdatedAt,
			&kotSentAt, &kotFireGen,
			&productName, &categoryID); err != nil {
			continue
		}

		catStr := ""
		if categoryID.Valid {
			catStr = categoryID.String
		}

		item := map[string]interface{}{
			"id":                   itemID,
			"order_id":             orderID,
			"product_id":           productID,
			"quantity":             qty,
			"unit_price":           unitPrice,
			"total_price":          totalPrice,
			"special_instructions": specialInstructions.String,
			"status":               itemStatus,
			"created_at":           itemCreatedAt,
			"updated_at":           itemUpdatedAt,
			"kot_fire_generation":  kotFireGen,
			"product": map[string]interface{}{
				"id":          productID,
				"name":        productName,
				"price":       unitPrice,
				"category_id": catStr,
			},
		}
		if kotSentAt.Valid {
			item["kot_sent_at"] = kotSentAt.Time
		}
		items = append(items, item)
	}
	return items
}

// Update order item status handler. Only 'sent' (untoggle/mark in-progress)
// and 'ready' (mark prepared) are accepted from the KDS. Every transition is
// recorded in kitchen_events for prep-time analytics and audit.
func updateOrderItemStatus(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		orderID := c.Param("id")
		itemID := c.Param("item_id")
		userID, _, _, _ := middleware.GetUserFromContext(c)

		var req struct {
			Status string `json:"status"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"success": false, "message": "Invalid request body", "error": err.Error()})
			return
		}

		nextStatus := strings.ToLower(strings.TrimSpace(req.Status))
		if nextStatus != "sent" && nextStatus != "ready" {
			c.JSON(400, gin.H{
				"success": false,
				"message": "Only 'sent' (un-prepare) and 'ready' (prepare) are allowed from the KDS",
				"error":   "invalid_item_status",
			})
			return
		}

		var currentStatus string
		err := db.QueryRow(`SELECT status FROM order_items WHERE id = $1 AND order_id = $2`, itemID, orderID).Scan(&currentStatus)
		if err != nil {
			c.JSON(404, gin.H{"success": false, "message": "Order item not found"})
			return
		}
		if currentStatus == "voided" {
			c.JSON(400, gin.H{"success": false, "message": "Voided items cannot be updated on KDS"})
			return
		}
		if currentStatus == "draft" {
			c.JSON(400, gin.H{"success": false, "message": "Draft items are not on KDS yet"})
			return
		}
		if currentStatus == nextStatus {
			c.JSON(200, gin.H{"success": true, "message": "No change"})
			return
		}

		tx, err := db.Begin()
		if err != nil {
			c.JSON(500, gin.H{"success": false, "message": "Transaction failed", "error": err.Error()})
			return
		}
		defer tx.Rollback()

		// Update status and prepared_at/by. Clearing prepared_at on 'sent'
		// keeps downstream analytics accurate when a cook undo-taps a row.
		if nextStatus == "ready" {
			var uid interface{}
			if userID != uuid.Nil {
				uid = userID.String()
			}
			_, err = tx.Exec(`
				UPDATE order_items
				SET status = 'ready', prepared_at = CURRENT_TIMESTAMP, prepared_by = NULLIF($1,'')::uuid,
				    updated_at = CURRENT_TIMESTAMP
				WHERE id = $2 AND order_id = $3
			`, strOrEmptyAPI(uid), itemID, orderID)
		} else {
			_, err = tx.Exec(`
				UPDATE order_items
				SET status = 'sent', prepared_at = NULL, prepared_by = NULL,
				    updated_at = CURRENT_TIMESTAMP
				WHERE id = $1 AND order_id = $2
			`, itemID, orderID)
		}
		if err != nil {
			c.JSON(500, gin.H{"success": false, "message": "Failed to update order item status", "error": err.Error()})
			return
		}

		// Keep order-level status in sync so bump/KDS rules see `preparing`
		// once the kitchen starts cooking. Only escalates on prepare —
		// un-preparing a single item doesn't downgrade the order.
		if nextStatus == "ready" {
			_, _ = tx.Exec(`
				UPDATE orders SET status = 'preparing', updated_at = CURRENT_TIMESTAMP
				WHERE id = $1::uuid AND status = 'confirmed'
			`, orderID)
		}

		eventType := "item_prepared"
		if nextStatus == "sent" {
			eventType = "item_unprepared"
		}
		if _, err := tx.Exec(`
			INSERT INTO kitchen_events (order_id, order_item_id, event_type, user_id, metadata)
			VALUES ($1::uuid, $2::uuid, $3, NULLIF($4,'')::uuid, $5::jsonb)
		`, orderID, itemID, eventType, strOrEmptyAPI(func() interface{} {
			if userID != uuid.Nil {
				return userID.String()
			}
			return nil
		}()), fmt.Sprintf(`{"previous_status":"%s"}`, currentStatus)); err != nil {
			c.JSON(500, gin.H{"success": false, "message": "Failed to log kitchen event", "error": err.Error()})
			return
		}

		if err := tx.Commit(); err != nil {
			c.JSON(500, gin.H{"success": false, "message": "Commit failed", "error": err.Error()})
			return
		}

		realtime.Publish(realtime.Event{
			Type:    "item_updated",
			OrderID: orderID,
			Extra: map[string]interface{}{
				"item_id":     itemID,
				"status":      nextStatus,
				"prev_status": currentStatus,
			},
		})

		c.JSON(200, gin.H{"success": true, "message": "Order item status updated"})
	}
}

func strOrEmptyAPI(v interface{}) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

// getRecentBumpedOrders returns orders bumped within the recall window so the
// KDS can render a "Recall" strip.
func getRecentBumpedOrders(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		settings := config.LoadKitchen(db)
		limit := 5
		if v := c.Query("limit"); v != "" {
			if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 20 {
				limit = n
			}
		}
		if settings.RecallWindowSeconds <= 0 {
			c.JSON(200, gin.H{"success": true, "data": []map[string]interface{}{}})
			return
		}

		rows, err := db.Query(`
			SELECT o.id::text, o.order_number, o.order_type, o.kitchen_bumped_at,
			       o.customer_name, t.table_number
			FROM orders o
			LEFT JOIN dining_tables t ON o.table_id = t.id
			WHERE o.status = 'ready'
			  AND o.kitchen_bumped_at IS NOT NULL
			  AND o.kitchen_bumped_at > NOW() - ($1 || ' seconds')::interval
			ORDER BY o.kitchen_bumped_at DESC
			LIMIT $2
		`, strconv.Itoa(settings.RecallWindowSeconds), limit)
		if err != nil {
			c.JSON(500, gin.H{"success": false, "message": "Failed to load recent bumped orders", "error": err.Error()})
			return
		}
		defer rows.Close()

		out := []map[string]interface{}{}
		for rows.Next() {
			var id, num, ot, custName sql.NullString
			var tableNum sql.NullString
			var bumpedAt sql.NullTime
			if err := rows.Scan(&id, &num, &ot, &bumpedAt, &custName, &tableNum); err != nil {
				continue
			}
			row := map[string]interface{}{
				"id":                id.String,
				"order_number":      num.String,
				"order_type":        ot.String,
				"customer_name":     custName.String,
				"kitchen_bumped_at": nil,
				"table_number":      nil,
			}
			if bumpedAt.Valid {
				row["kitchen_bumped_at"] = bumpedAt.Time
			}
			if tableNum.Valid {
				row["table_number"] = tableNum.String
			}
			out = append(out, row)
		}

		c.JSON(200, gin.H{"success": true, "data": out})
	}
}

// sseAuthMiddleware supports both Authorization: Bearer and ?token=, because
// the browser EventSource API can't set custom headers.
func sseAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		tok := c.GetHeader("Authorization")
		if strings.HasPrefix(tok, "Bearer ") {
			tok = strings.TrimPrefix(tok, "Bearer ")
		} else {
			tok = c.Query("token")
		}
		if tok == "" {
			c.AbortWithStatusJSON(401, gin.H{"success": false, "message": "Missing token"})
			return
		}
		claims, err := middleware.ValidateToken(tok)
		if err != nil {
			c.AbortWithStatusJSON(401, gin.H{"success": false, "message": "Invalid or expired token"})
			return
		}
		c.Set("user_id", claims.UserID)
		c.Set("username", claims.Username)
		c.Set("role", claims.Role)
		c.Next()
	}
}

// kitchenStream serves Server-Sent Events for KDS clients. It pushes a
// ready+heartbeat pair immediately so the client can render a "Live"
// indicator, then streams mutation events as handlers publish them.
func kitchenStream() gin.HandlerFunc {
	return func(c *gin.Context) {
		w := c.Writer
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("X-Accel-Buffering", "no")

		flusher, ok := w.(interface{ Flush() })
		if !ok {
			c.AbortWithStatusJSON(500, gin.H{"success": false, "message": "Streaming not supported"})
			return
		}

		events, unsubscribe := realtime.Default().Subscribe(64)
		defer unsubscribe()

		fmt.Fprintf(w, "event: ready\ndata: {\"ts\":\"%s\"}\n\n", time.Now().UTC().Format(time.RFC3339))
		flusher.Flush()

		heartbeat := time.NewTicker(20 * time.Second)
		defer heartbeat.Stop()

		clientGone := c.Request.Context().Done()

		for {
			select {
			case <-clientGone:
				return
			case ev, open := <-events:
				if !open {
					return
				}
				payload, _ := json.Marshal(ev)
				fmt.Fprintf(w, "event: %s\ndata: %s\n\n", safeEventName(ev.Type), payload)
				flusher.Flush()
			case <-heartbeat.C:
				fmt.Fprintf(w, ": ping %s\n\n", time.Now().UTC().Format(time.RFC3339))
				flusher.Flush()
			}
		}
	}
}

func safeEventName(t string) string {
	t = strings.ToLower(strings.TrimSpace(t))
	if t == "" {
		return "message"
	}
	out := make([]byte, 0, len(t))
	for _, r := range t {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' || r == '-' {
			out = append(out, byte(r))
		}
	}
	if len(out) == 0 {
		return "message"
	}
	return string(out)
}

// Admin handler - Income report
func getIncomeReport(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		period := c.DefaultQuery("period", "today") // today, week, month, year

		var query string
		switch period {
		case "week":
			query = `
				SELECT 
					DATE_TRUNC('day', created_at) as period,
					COUNT(*) as total_orders,
					SUM(total_amount) as gross_income,
					SUM(tax_amount) as tax_collected,
					SUM(total_amount - tax_amount) as net_income
				FROM orders 
				WHERE created_at >= CURRENT_DATE - INTERVAL '7 days' 
					AND status = 'completed'
				GROUP BY DATE_TRUNC('day', created_at)
				ORDER BY period DESC
			`
		case "month":
			query = `
				SELECT 
					DATE_TRUNC('day', created_at) as period,
					COUNT(*) as total_orders,
					SUM(total_amount) as gross_income,
					SUM(tax_amount) as tax_collected,
					SUM(total_amount - tax_amount) as net_income
				FROM orders 
				WHERE created_at >= CURRENT_DATE - INTERVAL '30 days' 
					AND status = 'completed'
				GROUP BY DATE_TRUNC('day', created_at)
				ORDER BY period DESC
			`
		case "year":
			query = `
				SELECT 
					DATE_TRUNC('month', created_at) as period,
					COUNT(*) as total_orders,
					SUM(total_amount) as gross_income,
					SUM(tax_amount) as tax_collected,
					SUM(total_amount - tax_amount) as net_income
				FROM orders 
				WHERE created_at >= CURRENT_DATE - INTERVAL '1 year' 
					AND status = 'completed'
				GROUP BY DATE_TRUNC('month', created_at)
				ORDER BY period DESC
			`
		default: // today
			query = `
				SELECT 
					DATE_TRUNC('hour', created_at) as period,
					COUNT(*) as total_orders,
					SUM(total_amount) as gross_income,
					SUM(tax_amount) as tax_collected,
					SUM(total_amount - tax_amount) as net_income
				FROM orders 
				WHERE DATE(created_at) = CURRENT_DATE 
					AND status = 'completed'
				GROUP BY DATE_TRUNC('hour', created_at)
				ORDER BY period DESC
			`
		}

		rows, err := db.Query(query)
		if err != nil {
			c.JSON(500, gin.H{
				"success": false,
				"message": "Failed to fetch income report",
				"error":   err.Error(),
			})
			return
		}
		defer rows.Close()

		var report []map[string]interface{}
		var totalGross, totalTax, totalNet float64
		var totalOrders int

		for rows.Next() {
			var period interface{}
			var orders int
			var gross, tax, net float64

			err := rows.Scan(&period, &orders, &gross, &tax, &net)
			if err != nil {
				c.JSON(500, gin.H{
					"success": false,
					"message": "Failed to scan income data",
					"error":   err.Error(),
				})
				return
			}

			totalOrders += orders
			totalGross += gross
			totalTax += tax
			totalNet += net

			report = append(report, map[string]interface{}{
				"period": period,
				"orders": orders,
				"gross":  gross,
				"tax":    tax,
				"net":    net,
			})
		}

		result := map[string]interface{}{
			"summary": map[string]interface{}{
				"total_orders":  totalOrders,
				"gross_income":  totalGross,
				"tax_collected": totalTax,
				"net_income":    totalNet,
			},
			"breakdown": report,
			"period":    period,
		}

		c.JSON(200, gin.H{
			"success": true,
			"message": "Income report retrieved successfully",
			"data":    result,
		})
	}
}

// Admin handler - Create category
func createCategory(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Name        string  `json:"name" binding:"required"`
			Description *string `json:"description"`
			Color       *string `json:"color"`
			SortOrder   int     `json:"sort_order"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{
				"success": false,
				"message": "Invalid request body",
				"error":   err.Error(),
			})
			return
		}

		var categoryID string
		err := db.QueryRow(`
			INSERT INTO categories (name, description, color, sort_order)
			VALUES ($1, $2, $3, $4)
			RETURNING id
		`, req.Name, req.Description, req.Color, req.SortOrder).Scan(&categoryID)

		if err != nil {
			c.JSON(500, gin.H{
				"success": false,
				"message": "Failed to create category",
				"error":   err.Error(),
			})
			return
		}

		c.JSON(201, gin.H{
			"success": true,
			"message": "Category created successfully",
			"data":    map[string]interface{}{"id": categoryID},
		})
	}
}

// Admin handler - Update category
func updateCategory(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		categoryID := c.Param("id")

		var req struct {
			Name        *string `json:"name"`
			Description *string `json:"description"`
			Color       *string `json:"color"`
			SortOrder   *int    `json:"sort_order"`
			IsActive    *bool   `json:"is_active"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{
				"success": false,
				"message": "Invalid request body",
				"error":   err.Error(),
			})
			return
		}

		// Build dynamic update query
		updates := []string{}
		args := []interface{}{}
		argCount := 1

		if req.Name != nil {
			updates = append(updates, fmt.Sprintf("name = $%d", argCount))
			args = append(args, *req.Name)
			argCount++
		}
		if req.Description != nil {
			updates = append(updates, fmt.Sprintf("description = $%d", argCount))
			args = append(args, req.Description)
			argCount++
		}
		if req.Color != nil {
			updates = append(updates, fmt.Sprintf("color = $%d", argCount))
			args = append(args, req.Color)
			argCount++
		}
		if req.SortOrder != nil {
			updates = append(updates, fmt.Sprintf("sort_order = $%d", argCount))
			args = append(args, *req.SortOrder)
			argCount++
		}
		if req.IsActive != nil {
			updates = append(updates, fmt.Sprintf("is_active = $%d", argCount))
			args = append(args, *req.IsActive)
			argCount++
		}

		if len(updates) == 0 {
			c.JSON(400, gin.H{
				"success": false,
				"message": "No fields to update",
			})
			return
		}

		updates = append(updates, "updated_at = CURRENT_TIMESTAMP")
		args = append(args, categoryID)

		query := fmt.Sprintf(`
			UPDATE categories 
			SET %s 
			WHERE id = $%d
		`, strings.Join(updates, ", "), argCount)

		result, err := db.Exec(query, args...)
		if err != nil {
			c.JSON(500, gin.H{
				"success": false,
				"message": "Failed to update category",
				"error":   err.Error(),
			})
			return
		}

		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			c.JSON(404, gin.H{
				"success": false,
				"message": "Category not found",
			})
			return
		}

		c.JSON(200, gin.H{
			"success": true,
			"message": "Category updated successfully",
		})
	}
}

// Admin handler - Delete category
func deleteCategory(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		categoryID := c.Param("id")

		// Check if category has products
		var productCount int
		db.QueryRow("SELECT COUNT(*) FROM products WHERE category_id = $1", categoryID).Scan(&productCount)

		if productCount > 0 {
			c.JSON(400, gin.H{
				"success": false,
				"message": "Cannot delete category with existing products",
				"error":   "category_has_products",
			})
			return
		}

		result, err := db.Exec("DELETE FROM categories WHERE id = $1", categoryID)
		if err != nil {
			c.JSON(500, gin.H{
				"success": false,
				"message": "Failed to delete category",
				"error":   err.Error(),
			})
			return
		}

		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			c.JSON(404, gin.H{
				"success": false,
				"message": "Category not found",
			})
			return
		}

		c.JSON(200, gin.H{
			"success": true,
			"message": "Category deleted successfully",
		})
	}
}

// Admin handler - Create product
func createProduct(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			CategoryID      *string `json:"category_id"`
			Name            string  `json:"name" binding:"required"`
			Description     *string `json:"description"`
			Price           float64 `json:"price" binding:"required"`
			ImageURL        *string `json:"image_url"`
			Barcode         *string `json:"barcode"`
			SKU             *string `json:"sku"`
			PctCode         *string `json:"pct_code"`
			PreparationTime int     `json:"preparation_time"`
			SortOrder       int     `json:"sort_order"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{
				"success": false,
				"message": "Invalid request body",
				"error":   err.Error(),
			})
			return
		}

		pct := "9801.7000"
		if req.PctCode != nil && strings.TrimSpace(*req.PctCode) != "" {
			pct = strings.TrimSpace(*req.PctCode)
		}
		var productID string
		err := db.QueryRow(`
			INSERT INTO products (category_id, name, description, price, image_url, barcode, sku, preparation_time, sort_order, pct_code)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
			RETURNING id
		`, req.CategoryID, req.Name, req.Description, req.Price, req.ImageURL, req.Barcode, req.SKU, req.PreparationTime, req.SortOrder, pct).Scan(&productID)

		if err != nil {
			c.JSON(500, gin.H{
				"success": false,
				"message": "Failed to create product",
				"error":   err.Error(),
			})
			return
		}

		c.JSON(201, gin.H{
			"success": true,
			"message": "Product created successfully",
			"data":    map[string]interface{}{"id": productID},
		})
	}
}

// Admin handler - Update product
func updateProduct(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		productID := c.Param("id")

		var req struct {
			CategoryID      *string  `json:"category_id"`
			Name            *string  `json:"name"`
			Description     *string  `json:"description"`
			Price           *float64 `json:"price"`
			ImageURL        *string  `json:"image_url"`
			Barcode         *string  `json:"barcode"`
			SKU             *string  `json:"sku"`
			PctCode         *string  `json:"pct_code"`
			IsAvailable     *bool    `json:"is_available"`
			PreparationTime *int     `json:"preparation_time"`
			SortOrder       *int     `json:"sort_order"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{
				"success": false,
				"message": "Invalid request body",
				"error":   err.Error(),
			})
			return
		}

		// Build dynamic update query
		updates := []string{}
		args := []interface{}{}
		argCount := 1

		if req.CategoryID != nil {
			updates = append(updates, fmt.Sprintf("category_id = $%d", argCount))
			args = append(args, req.CategoryID)
			argCount++
		}
		if req.Name != nil {
			updates = append(updates, fmt.Sprintf("name = $%d", argCount))
			args = append(args, *req.Name)
			argCount++
		}
		if req.Description != nil {
			updates = append(updates, fmt.Sprintf("description = $%d", argCount))
			args = append(args, req.Description)
			argCount++
		}
		if req.Price != nil {
			updates = append(updates, fmt.Sprintf("price = $%d", argCount))
			args = append(args, *req.Price)
			argCount++
		}
		if req.ImageURL != nil {
			updates = append(updates, fmt.Sprintf("image_url = $%d", argCount))
			args = append(args, req.ImageURL)
			argCount++
		}
		if req.Barcode != nil {
			updates = append(updates, fmt.Sprintf("barcode = $%d", argCount))
			args = append(args, req.Barcode)
			argCount++
		}
		if req.SKU != nil {
			updates = append(updates, fmt.Sprintf("sku = $%d", argCount))
			args = append(args, req.SKU)
			argCount++
		}
		if req.PctCode != nil {
			pc := strings.TrimSpace(*req.PctCode)
			if pc == "" {
				pc = "9801.7000"
			}
			updates = append(updates, fmt.Sprintf("pct_code = $%d", argCount))
			args = append(args, pc)
			argCount++
		}
		if req.IsAvailable != nil {
			updates = append(updates, fmt.Sprintf("is_available = $%d", argCount))
			args = append(args, *req.IsAvailable)
			argCount++
		}
		if req.PreparationTime != nil {
			updates = append(updates, fmt.Sprintf("preparation_time = $%d", argCount))
			args = append(args, *req.PreparationTime)
			argCount++
		}
		if req.SortOrder != nil {
			updates = append(updates, fmt.Sprintf("sort_order = $%d", argCount))
			args = append(args, *req.SortOrder)
			argCount++
		}

		if len(updates) == 0 {
			c.JSON(400, gin.H{
				"success": false,
				"message": "No fields to update",
			})
			return
		}

		updates = append(updates, "updated_at = CURRENT_TIMESTAMP")
		args = append(args, productID)

		query := fmt.Sprintf(`
			UPDATE products 
			SET %s 
			WHERE id = $%d
		`, strings.Join(updates, ", "), argCount)

		result, err := db.Exec(query, args...)
		if err != nil {
			c.JSON(500, gin.H{
				"success": false,
				"message": "Failed to update product",
				"error":   err.Error(),
			})
			return
		}

		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			c.JSON(404, gin.H{
				"success": false,
				"message": "Product not found",
			})
			return
		}

		c.JSON(200, gin.H{
			"success": true,
			"message": "Product updated successfully",
		})
	}
}

// Admin handler - Delete product
func deleteProduct(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		productID := c.Param("id")

		// Check if product is used in any active orders (exclude voided lines; they no longer count as active use)
		var orderCount int
		err := db.QueryRow(`
			SELECT COUNT(*)
			FROM order_items oi
			JOIN orders o ON oi.order_id = o.id
			WHERE oi.product_id = $1
			  AND oi.status != 'voided'
			  AND o.status NOT IN ('completed', 'cancelled')
		`, productID).Scan(&orderCount)
		if err != nil {
			c.JSON(500, gin.H{
				"success": false,
				"message": "Failed to check product orders",
				"error":   err.Error(),
			})
			return
		}

		if orderCount > 0 {
			blocking := make([]gin.H, 0, 5)
			rows, qerr := db.Query(`
				SELECT o.id::text, o.order_number, o.status
				FROM orders o
				WHERE EXISTS (
					SELECT 1 FROM order_items oi
					WHERE oi.order_id = o.id AND oi.product_id = $1 AND oi.status != 'voided'
				)
				AND o.status NOT IN ('completed', 'cancelled')
				ORDER BY o.updated_at DESC
				LIMIT 5
			`, productID)
			if qerr == nil {
				defer rows.Close()
				for rows.Next() {
					var id, orderNumber, status string
					if rows.Scan(&id, &orderNumber, &status) == nil {
						blocking = append(blocking, gin.H{
							"id":           id,
							"order_number": orderNumber,
							"status":       status,
						})
					}
				}
			}
			c.JSON(400, gin.H{
				"success":         false,
				"message":         "Cannot delete product with active orders",
				"error":           "product_has_active_orders",
				"blocking_orders": blocking,
			})
			return
		}

		result, err := db.Exec("DELETE FROM products WHERE id = $1", productID)
		if err != nil {
			c.JSON(500, gin.H{
				"success": false,
				"message": "Failed to delete product",
				"error":   err.Error(),
			})
			return
		}

		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			c.JSON(404, gin.H{
				"success": false,
				"message": "Product not found",
			})
			return
		}

		c.JSON(200, gin.H{
			"success": true,
			"message": "Product deleted successfully",
		})
	}
}

// Admin handler - Create table
func createTable(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			TableNumber     string   `json:"table_number" binding:"required"`
			SeatingCapacity int      `json:"seating_capacity"`
			Location        *string  `json:"location"`
			Zone            *string  `json:"zone"`
			MapX            *float64 `json:"map_x"`
			MapY            *float64 `json:"map_y"`
			MapW            *float64 `json:"map_w"`
			MapH            *float64 `json:"map_h"`
			MapRotation     *int     `json:"map_rotation"`
			Shape           *string  `json:"shape"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{
				"success": false,
				"message": "Invalid request body",
				"error":   err.Error(),
			})
			return
		}

		var tableID string
		err := db.QueryRow(`
			INSERT INTO dining_tables (table_number, seating_capacity, location, zone, map_x, map_y, map_w, map_h, map_rotation, shape)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
			RETURNING id
		`, req.TableNumber, req.SeatingCapacity, req.Location, req.Zone, req.MapX, req.MapY, req.MapW, req.MapH, req.MapRotation, req.Shape).Scan(&tableID)

		if err != nil {
			if util.IsDuplicateDiningTableNumber(err) {
				c.JSON(409, gin.H{
					"success": false,
					"message": util.DuplicateTableNumberMessage,
				})
				return
			}
			c.JSON(500, gin.H{
				"success": false,
				"message": "Failed to create table",
				"error":   err.Error(),
			})
			return
		}

		c.JSON(201, gin.H{
			"success": true,
			"message": "Table created successfully",
			"data":    map[string]interface{}{"id": tableID},
		})
	}
}

// Admin handler - Update table
func updateTable(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		tableID := c.Param("id")

		var req struct {
			TableNumber     *string  `json:"table_number"`
			SeatingCapacity *int     `json:"seating_capacity"`
			Location        *string  `json:"location"`
			Zone            *string  `json:"zone"`
			IsOccupied      *bool    `json:"is_occupied"`
			MapX            *float64 `json:"map_x"`
			MapY            *float64 `json:"map_y"`
			MapW            *float64 `json:"map_w"`
			MapH            *float64 `json:"map_h"`
			MapRotation     *int     `json:"map_rotation"`
			Shape           *string  `json:"shape"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{
				"success": false,
				"message": "Invalid request body",
				"error":   err.Error(),
			})
			return
		}

		// Build dynamic update query
		updates := []string{}
		args := []interface{}{}
		argCount := 1

		if req.TableNumber != nil {
			updates = append(updates, fmt.Sprintf("table_number = $%d", argCount))
			args = append(args, *req.TableNumber)
			argCount++
		}
		if req.SeatingCapacity != nil {
			updates = append(updates, fmt.Sprintf("seating_capacity = $%d", argCount))
			args = append(args, *req.SeatingCapacity)
			argCount++
		}
		if req.Location != nil {
			updates = append(updates, fmt.Sprintf("location = $%d", argCount))
			args = append(args, req.Location)
			argCount++
		}
		if req.Zone != nil {
			updates = append(updates, fmt.Sprintf("zone = $%d", argCount))
			args = append(args, req.Zone)
			argCount++
		}
		if req.IsOccupied != nil {
			updates = append(updates, fmt.Sprintf("is_occupied = $%d", argCount))
			args = append(args, *req.IsOccupied)
			argCount++
		}
		if req.MapX != nil {
			updates = append(updates, fmt.Sprintf("map_x = $%d", argCount))
			args = append(args, *req.MapX)
			argCount++
		}
		if req.MapY != nil {
			updates = append(updates, fmt.Sprintf("map_y = $%d", argCount))
			args = append(args, *req.MapY)
			argCount++
		}
		if req.MapW != nil {
			updates = append(updates, fmt.Sprintf("map_w = $%d", argCount))
			args = append(args, *req.MapW)
			argCount++
		}
		if req.MapH != nil {
			updates = append(updates, fmt.Sprintf("map_h = $%d", argCount))
			args = append(args, *req.MapH)
			argCount++
		}
		if req.MapRotation != nil {
			updates = append(updates, fmt.Sprintf("map_rotation = $%d", argCount))
			args = append(args, *req.MapRotation)
			argCount++
		}
		if req.Shape != nil {
			updates = append(updates, fmt.Sprintf("shape = $%d", argCount))
			args = append(args, *req.Shape)
			argCount++
		}

		if len(updates) == 0 {
			c.JSON(400, gin.H{
				"success": false,
				"message": "No fields to update",
			})
			return
		}

		updates = append(updates, "updated_at = CURRENT_TIMESTAMP")
		args = append(args, tableID)

		query := fmt.Sprintf(`
			UPDATE dining_tables 
			SET %s 
			WHERE id = $%d
		`, strings.Join(updates, ", "), argCount)

		result, err := db.Exec(query, args...)
		if err != nil {
			if util.IsDuplicateDiningTableNumber(err) {
				c.JSON(409, gin.H{
					"success": false,
					"message": util.DuplicateTableNumberMessage,
				})
				return
			}
			c.JSON(500, gin.H{
				"success": false,
				"message": "Failed to update table",
				"error":   err.Error(),
			})
			return
		}

		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			c.JSON(404, gin.H{
				"success": false,
				"message": "Table not found",
			})
			return
		}

		c.JSON(200, gin.H{
			"success": true,
			"message": "Table updated successfully",
		})
	}
}

// Admin handler - Delete table
func deleteTable(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		tableID := c.Param("id")

		// Check if table has active orders
		var orderCount int
		db.QueryRow(`
			SELECT COUNT(*) 
			FROM orders 
			WHERE table_id = $1 AND status NOT IN ('completed', 'cancelled')
		`, tableID).Scan(&orderCount)

		if orderCount > 0 {
			c.JSON(400, gin.H{
				"success": false,
				"message": "Cannot delete table with active orders",
				"error":   "table_has_active_orders",
			})
			return
		}

		result, err := db.Exec("DELETE FROM dining_tables WHERE id = $1", tableID)
		if err != nil {
			c.JSON(500, gin.H{
				"success": false,
				"message": "Failed to delete table",
				"error":   err.Error(),
			})
			return
		}

		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			c.JSON(404, gin.H{
				"success": false,
				"message": "Table not found",
			})
			return
		}

		c.JSON(200, gin.H{
			"success": true,
			"message": "Table deleted successfully",
		})
	}
}

// Admin handler - Create user
// isPlatformAdminUser reports whether a user row has is_platform_admin=true.
// Returns false on any error (missing row, DB hiccup, invalid UUID) — callers
// use this as a guard, and "don't know → not platform-admin" would leak the
// existence of the support account; "don't know → platform-admin" (true on
// error) would falsely 404 legitimate customer admins. False on error splits
// the difference toward the safer UX: a real customer admin sees their
// expected update/delete behavior, and an attacker probing with invalid IDs
// gets nothing useful. The actual platform-admin guard remains strong
// because the flag check happens over a bound parameter.
func isPlatformAdminUser(db *sql.DB, userID string) bool {
	var isPlatform bool
	if err := db.QueryRow(
		`SELECT is_platform_admin FROM users WHERE id = $1`, userID,
	).Scan(&isPlatform); err != nil {
		return false
	}
	return isPlatform
}

func createUser(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Username        string  `json:"username" binding:"required"`
			Email           string  `json:"email" binding:"required"`
			Password        string  `json:"password" binding:"required"`
			FirstName       string  `json:"first_name" binding:"required"`
			LastName        string  `json:"last_name" binding:"required"`
			Role            string  `json:"role" binding:"required"`
			ProfileImageURL *string `json:"profile_image_url"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{
				"success": false,
				"message": "Invalid request body",
				"error":   err.Error(),
			})
			return
		}

		if !util.ValidStaffRole(req.Role) {
			c.JSON(400, gin.H{
				"success": false,
				"message": "Invalid role. Allowed: admin, manager, inventory_manager, counter, kitchen",
			})
			return
		}

		// Hash password
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			c.JSON(500, gin.H{
				"success": false,
				"message": "Failed to hash password",
				"error":   err.Error(),
			})
			return
		}

		var userID string
		err = db.QueryRow(`
			INSERT INTO users (username, email, password_hash, first_name, last_name, role, profile_image_url)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
			RETURNING id
		`, req.Username, req.Email, string(hashedPassword), req.FirstName, req.LastName, req.Role, req.ProfileImageURL).Scan(&userID)

		if err != nil {
			c.JSON(500, gin.H{
				"success": false,
				"message": "Failed to create user",
				"error":   err.Error(),
			})
			return
		}

		c.JSON(201, gin.H{
			"success": true,
			"message": "User created successfully",
			"data":    map[string]interface{}{"id": userID},
		})
	}
}

// Admin handler - Update user
func updateUser(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.Param("id")

		// Protect platform-admin rows from tampering by customer admins.
		// Without this guard, a curious customer admin could rename, disable,
		// or reset the password on the bhookly_support account via the
		// standard /admin/users/:id endpoint and lock us out of their
		// deployment. Mirrors the filter in getAdminUsers.
		if isPlatformAdminUser(db, userID) {
			c.JSON(404, gin.H{
				"success": false,
				"message": "User not found",
			})
			return
		}

		var req struct {
			Username        *string `json:"username"`
			Email           *string `json:"email"`
			Password        *string `json:"password"`
			FirstName       *string `json:"first_name"`
			LastName        *string `json:"last_name"`
			Role            *string `json:"role"`
			IsActive        *bool   `json:"is_active"`
			ProfileImageURL *string `json:"profile_image_url"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{
				"success": false,
				"message": "Invalid request body",
				"error":   err.Error(),
			})
			return
		}

		// Build dynamic update query
		updates := []string{}
		args := []interface{}{}
		argCount := 1

		if req.Username != nil {
			updates = append(updates, fmt.Sprintf("username = $%d", argCount))
			args = append(args, *req.Username)
			argCount++
		}
		if req.Email != nil {
			updates = append(updates, fmt.Sprintf("email = $%d", argCount))
			args = append(args, *req.Email)
			argCount++
		}
		if req.Password != nil {
			hashedPassword, err := bcrypt.GenerateFromPassword([]byte(*req.Password), bcrypt.DefaultCost)
			if err != nil {
				c.JSON(500, gin.H{
					"success": false,
					"message": "Failed to hash password",
					"error":   err.Error(),
				})
				return
			}
			updates = append(updates, fmt.Sprintf("password_hash = $%d", argCount))
			args = append(args, string(hashedPassword))
			argCount++
		}
		if req.FirstName != nil {
			updates = append(updates, fmt.Sprintf("first_name = $%d", argCount))
			args = append(args, *req.FirstName)
			argCount++
		}
		if req.LastName != nil {
			updates = append(updates, fmt.Sprintf("last_name = $%d", argCount))
			args = append(args, *req.LastName)
			argCount++
		}
		if req.Role != nil {
			if !util.ValidStaffRole(*req.Role) {
				c.JSON(400, gin.H{
					"success": false,
					"message": "Invalid role. Allowed: admin, manager, inventory_manager, counter, kitchen",
				})
				return
			}
			updates = append(updates, fmt.Sprintf("role = $%d", argCount))
			args = append(args, *req.Role)
			argCount++
		}
		if req.IsActive != nil {
			updates = append(updates, fmt.Sprintf("is_active = $%d", argCount))
			args = append(args, *req.IsActive)
			argCount++
		}
		if req.ProfileImageURL != nil {
			if strings.TrimSpace(*req.ProfileImageURL) == "" {
				updates = append(updates, "profile_image_url = NULL")
			} else {
				updates = append(updates, fmt.Sprintf("profile_image_url = $%d", argCount))
				args = append(args, strings.TrimSpace(*req.ProfileImageURL))
				argCount++
			}
		}

		if len(updates) == 0 {
			c.JSON(400, gin.H{
				"success": false,
				"message": "No fields to update",
			})
			return
		}

		updates = append(updates, "updated_at = CURRENT_TIMESTAMP")
		args = append(args, userID)

		query := fmt.Sprintf(`
			UPDATE users 
			SET %s 
			WHERE id = $%d
		`, strings.Join(updates, ", "), argCount)

		result, err := db.Exec(query, args...)
		if err != nil {
			c.JSON(500, gin.H{
				"success": false,
				"message": "Failed to update user",
				"error":   err.Error(),
			})
			return
		}

		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			c.JSON(404, gin.H{
				"success": false,
				"message": "User not found",
			})
			return
		}

		c.JSON(200, gin.H{
			"success": true,
			"message": "User updated successfully",
		})
	}
}

// Admin handler - Delete user
func deleteUser(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.Param("id")

		// Protect platform-admin rows — see updateUser for rationale.
		if isPlatformAdminUser(db, userID) {
			c.JSON(404, gin.H{
				"success": false,
				"message": "User not found",
			})
			return
		}

		// Prevent deletion if user has associated orders
		var orderCount int
		db.QueryRow("SELECT COUNT(*) FROM orders WHERE user_id = $1", userID).Scan(&orderCount)

		if orderCount > 0 {
			c.JSON(400, gin.H{
				"success": false,
				"message": "Cannot delete user with existing orders",
				"error":   "user_has_orders",
			})
			return
		}

		result, err := db.Exec("DELETE FROM users WHERE id = $1", userID)
		if err != nil {
			c.JSON(500, gin.H{
				"success": false,
				"message": "Failed to delete user",
				"error":   err.Error(),
			})
			return
		}

		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			c.JSON(404, gin.H{
				"success": false,
				"message": "User not found",
			})
			return
		}

		c.JSON(200, gin.H{
			"success": true,
			"message": "User deleted successfully",
		})
	}
}

// Admin handler - Get users with pagination
func getAdminUsers(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Parse pagination parameters
		page := 1
		perPage := 20
		role := c.Query("role")
		isActive := c.Query("active")
		search := c.Query("search")

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

		// Build query with filters.
		// is_platform_admin = false hides the bhookly support account from
		// the customer's Users admin page. The account is still fully
		// functional for login, it just never shows up in lists or
		// update/delete endpoints for non-platform callers. See
		// updateUser / deleteUser below for the matching write-side guards.
		queryBuilder := "SELECT id, username, email, first_name, last_name, role, is_active, created_at, last_login_at, profile_image_url, CASE WHEN manager_pin IS NOT NULL THEN true ELSE false END as has_pin FROM users WHERE is_platform_admin = false"
		args := []interface{}{}
		argCount := 0

		if role != "" {
			argCount++
			queryBuilder += fmt.Sprintf(" AND role = $%d", argCount)
			args = append(args, role)
		}

		if isActive != "" {
			argCount++
			queryBuilder += fmt.Sprintf(" AND is_active = $%d", argCount)
			args = append(args, isActive == "true")
		}

		if search != "" {
			argCount++
			queryBuilder += fmt.Sprintf(" AND (first_name ILIKE $%d OR last_name ILIKE $%d OR username ILIKE $%d OR email ILIKE $%d)", argCount, argCount, argCount, argCount)
			args = append(args, "%"+search+"%")
		}

		// Count total records
		countQuery := "SELECT COUNT(*) FROM (" + queryBuilder + ") as count_query"
		var total int
		if err := db.QueryRow(countQuery, args...).Scan(&total); err != nil {
			c.JSON(500, gin.H{
				"success": false,
				"message": "Failed to count users",
				"error":   err.Error(),
			})
			return
		}

		// Add ordering and pagination
		queryBuilder += " ORDER BY created_at DESC"
		argCount++
		queryBuilder += fmt.Sprintf(" LIMIT $%d", argCount)
		args = append(args, perPage)

		argCount++
		queryBuilder += fmt.Sprintf(" OFFSET $%d", argCount)
		args = append(args, offset)

		rows, err := db.Query(queryBuilder, args...)
		if err != nil {
			c.JSON(500, gin.H{
				"success": false,
				"message": "Failed to fetch users",
				"error":   err.Error(),
			})
			return
		}
		defer rows.Close()

		var users []map[string]interface{}
		for rows.Next() {
			var user map[string]interface{} = make(map[string]interface{})
			var id, username, email, firstName, lastName, userRole string
			var isActive, hasPin bool
			var createdAt time.Time
			var lastLoginAt sql.NullTime
			var profileURL sql.NullString

			err := rows.Scan(&id, &username, &email, &firstName, &lastName, &userRole, &isActive, &createdAt, &lastLoginAt, &profileURL, &hasPin)
			if err != nil {
				c.JSON(500, gin.H{
					"success": false,
					"message": "Failed to scan user data",
					"error":   err.Error(),
				})
				return
			}

			user["id"] = id
			user["username"] = username
			user["email"] = email
			user["first_name"] = firstName
			user["last_name"] = lastName
			user["role"] = userRole
			user["is_active"] = isActive
			user["created_at"] = createdAt
			user["has_pin"] = hasPin
			if lastLoginAt.Valid {
				user["last_login_at"] = lastLoginAt.Time
			} else {
				user["last_login_at"] = nil
			}
			if profileURL.Valid && strings.TrimSpace(profileURL.String) != "" {
				user["profile_image_url"] = strings.TrimSpace(profileURL.String)
			} else {
				user["profile_image_url"] = nil
			}

			users = append(users, user)
		}

		totalPages := (total + perPage - 1) / perPage

		c.JSON(200, gin.H{
			"success": true,
			"message": "Users retrieved successfully",
			"data":    users,
			"meta": gin.H{
				"current_page": page,
				"per_page":     perPage,
				"total":        total,
				"total_pages":  totalPages,
			},
		})
	}
}

// Admin handler - Get categories with pagination
func getAdminCategories(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Parse pagination parameters
		page := 1
		perPage := 20
		activeOnly := c.Query("active_only") == "true"
		search := c.Query("search")

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

		// Build query with filters (include kitchen station for menu routing)
		queryBuilder := `SELECT c.id, c.name, c.description, c.color, c.sort_order, c.is_active, c.created_at, c.updated_at,
			(SELECT csm.station_id::text FROM category_station_map csm WHERE csm.category_id = c.id LIMIT 1),
			(SELECT ks.name FROM category_station_map csm JOIN kitchen_stations ks ON ks.id = csm.station_id WHERE csm.category_id = c.id LIMIT 1),
			(SELECT ks.output_type FROM category_station_map csm JOIN kitchen_stations ks ON ks.id = csm.station_id WHERE csm.category_id = c.id LIMIT 1)
			FROM categories c WHERE 1=1`
		args := []interface{}{}
		argCount := 0

		if activeOnly {
			queryBuilder += " AND c.is_active = true"
		}

		if search != "" {
			argCount++
			queryBuilder += fmt.Sprintf(" AND (c.name ILIKE $%d OR c.description ILIKE $%d)", argCount, argCount)
			args = append(args, "%"+search+"%")
		}

		// Count total records
		countQuery := "SELECT COUNT(*) FROM categories c WHERE 1=1"
		countArgs := []interface{}{}
		countArg := 0
		if activeOnly {
			countQuery += " AND c.is_active = true"
		}
		if search != "" {
			countArg++
			countQuery += fmt.Sprintf(" AND (c.name ILIKE $%d OR c.description ILIKE $%d)", countArg, countArg)
			countArgs = append(countArgs, "%"+search+"%")
		}
		var total int
		if err := db.QueryRow(countQuery, countArgs...).Scan(&total); err != nil {
			c.JSON(500, gin.H{
				"success": false,
				"message": "Failed to count categories",
				"error":   err.Error(),
			})
			return
		}

		// Add ordering and pagination
		queryBuilder += " ORDER BY c.sort_order ASC, c.name ASC"
		argCount++
		queryBuilder += fmt.Sprintf(" LIMIT $%d", argCount)
		args = append(args, perPage)

		argCount++
		queryBuilder += fmt.Sprintf(" OFFSET $%d", argCount)
		args = append(args, offset)

		rows, err := db.Query(queryBuilder, args...)
		if err != nil {
			c.JSON(500, gin.H{
				"success": false,
				"message": "Failed to fetch categories",
				"error":   err.Error(),
			})
			return
		}
		defer rows.Close()

		var categories []models.Category
		for rows.Next() {
			var category models.Category
			var stationIDStr, stationName, stationOut sql.NullString

			err := rows.Scan(
				&category.ID, &category.Name, &category.Description, &category.Color,
				&category.SortOrder, &category.IsActive, &category.CreatedAt, &category.UpdatedAt,
				&stationIDStr, &stationName, &stationOut,
			)
			if err != nil {
				c.JSON(500, gin.H{
					"success": false,
					"message": "Failed to scan category",
					"error":   err.Error(),
				})
				return
			}
			if stationIDStr.Valid && stationIDStr.String != "" {
				if uid, perr := uuid.Parse(stationIDStr.String); perr == nil {
					category.KitchenStationID = &uid
				}
			}
			if stationName.Valid {
				s := stationName.String
				category.KitchenStationName = &s
			}
			if stationOut.Valid {
				o := stationOut.String
				category.KitchenStationOutput = &o
			}

			categories = append(categories, category)
		}

		totalPages := (total + perPage - 1) / perPage

		c.JSON(200, gin.H{
			"success": true,
			"message": "Categories retrieved successfully",
			"data":    categories,
			"meta": gin.H{
				"current_page": page,
				"per_page":     perPage,
				"total":        total,
				"total_pages":  totalPages,
			},
		})
	}
}

// Admin handler - Get tables with pagination
func getAdminTables(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Parse pagination parameters
		page := 1
		perPage := 20
		location := c.Query("location")
		status := c.Query("status") // "occupied", "available", or empty for all
		search := c.Query("search")

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
			SELECT t.id, t.table_number, t.seating_capacity, t.location, t.zone, t.is_occupied,
			       t.map_x, t.map_y, t.map_w, t.map_h, t.map_rotation, t.shape,
			       t.created_at, t.updated_at,
			       o.id as order_id, o.order_number, o.customer_name, o.status as order_status,
			       o.created_at as order_created_at, o.total_amount
			FROM dining_tables t
			LEFT JOIN LATERAL (
				SELECT id, order_number, customer_name, status, created_at, total_amount
				FROM orders
				WHERE table_id = t.id AND status NOT IN ('completed', 'cancelled')
				ORDER BY created_at DESC
				LIMIT 1
			) o ON true
			WHERE 1=1
		`

		args := []interface{}{}
		argCount := 0

		if location != "" {
			argCount++
			queryBuilder += fmt.Sprintf(" AND t.location ILIKE $%d", argCount)
			args = append(args, "%"+location+"%")
		}

		if status == "occupied" {
			queryBuilder += " AND t.is_occupied = true"
		} else if status == "available" {
			queryBuilder += " AND t.is_occupied = false"
		}

		if search != "" {
			argCount++
			queryBuilder += fmt.Sprintf(" AND (t.table_number ILIKE $%d OR t.location ILIKE $%d)", argCount, argCount)
			args = append(args, "%"+search+"%")
		}

		// Count total records
		countQuery := "SELECT COUNT(*) FROM (" + queryBuilder + ") as count_query"
		var total int
		if err := db.QueryRow(countQuery, args...).Scan(&total); err != nil {
			c.JSON(500, gin.H{
				"success": false,
				"message": "Failed to count tables",
				"error":   err.Error(),
			})
			return
		}

		// Add ordering and pagination
		queryBuilder += " ORDER BY t.table_number ASC"
		argCount++
		queryBuilder += fmt.Sprintf(" LIMIT $%d", argCount)
		args = append(args, perPage)

		argCount++
		queryBuilder += fmt.Sprintf(" OFFSET $%d", argCount)
		args = append(args, offset)

		rows, err := db.Query(queryBuilder, args...)
		if err != nil {
			c.JSON(500, gin.H{
				"success": false,
				"message": "Failed to fetch tables",
				"error":   err.Error(),
			})
			return
		}
		defer rows.Close()

		var tables []map[string]interface{}
		for rows.Next() {
			var table models.DiningTable
			var orderID, orderNumber, customerName, orderStatus sql.NullString
			var orderCreatedAt sql.NullTime
			var totalAmount sql.NullFloat64

			err := rows.Scan(
				&table.ID, &table.TableNumber, &table.SeatingCapacity, &table.Location, &table.Zone, &table.IsOccupied,
				&table.MapX, &table.MapY, &table.MapW, &table.MapH, &table.MapRotation, &table.Shape,
				&table.CreatedAt, &table.UpdatedAt,
				&orderID, &orderNumber, &customerName, &orderStatus, &orderCreatedAt, &totalAmount,
			)
			if err != nil {
				c.JSON(500, gin.H{
					"success": false,
					"message": "Failed to scan table",
					"error":   err.Error(),
				})
				return
			}

			// Create table data with current order info
			tableData := map[string]interface{}{
				"id":               table.ID,
				"table_number":     table.TableNumber,
				"seating_capacity": table.SeatingCapacity,
				"location":         table.Location,
				"zone":             table.Zone,
				"is_occupied":      table.IsOccupied,
				"has_active_order": orderID.Valid,
				"map_x":            table.MapX,
				"map_y":            table.MapY,
				"map_w":            table.MapW,
				"map_h":            table.MapH,
				"map_rotation":     table.MapRotation,
				"shape":            table.Shape,
				"created_at":       table.CreatedAt,
				"updated_at":       table.UpdatedAt,
				"current_order":    nil,
			}

			// Add current order info if available
			if orderID.Valid {
				tableData["current_order"] = map[string]interface{}{
					"id":            orderID.String,
					"order_number":  orderNumber.String,
					"customer_name": customerName.String,
					"status":        orderStatus.String,
					"created_at":    orderCreatedAt.Time,
					"total_amount":  totalAmount.Float64,
				}
			}

			tables = append(tables, tableData)
		}

		totalPages := (total + perPage - 1) / perPage

		c.JSON(200, gin.H{
			"success": true,
			"message": "Tables retrieved successfully",
			"data":    tables,
			"meta": gin.H{
				"current_page": page,
				"per_page":     perPage,
				"total":        total,
				"total_pages":  totalPages,
			},
		})
	}
}

// Helper function to convert string to pointer
func stringPtr(s string) *string {
	return &s
}
