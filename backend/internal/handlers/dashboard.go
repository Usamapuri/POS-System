package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"pos-backend/internal/config"
	"pos-backend/internal/models"
	"pos-backend/internal/realtime"
	"pos-backend/internal/util"

	"github.com/gin-gonic/gin"
)

// ────────────────────────────────────────────────────────────────────────────
// DashboardHandler — powers the redesigned admin dashboard.
//
// Design rules:
//  1. Every "calendar day" comparison runs `AT TIME ZONE` the BUSINESS
//     timezone (see util.BusinessTimezoneName()). No more naked CURRENT_DATE.
//  2. Money series only count `status = 'completed'` orders, mirroring how
//     the cashier sees a closed check.
//  3. Operational counts (active orders, in-kitchen) intentionally exclude
//     'completed' and 'cancelled'.
//  4. KPI tiles always include a same-length previous-period comparison so
//     deltas are real, never hardcoded.
//  5. Every bucket / row that contains a date carries a server-formatted
//     Label so the UI never reformats and can't accidentally collapse hourly
//     buckets into a single date label.
// ────────────────────────────────────────────────────────────────────────────

type DashboardHandler struct {
	db *sql.DB
}

func NewDashboardHandler(db *sql.DB) *DashboardHandler {
	return &DashboardHandler{db: db}
}

// helper: parse period from query — supports today / yesterday / 7d / 30d / cw / cm / custom
func (h *DashboardHandler) parsePeriod(c *gin.Context) (util.PeriodWindow, bool) {
	period := strings.TrimSpace(c.Query("period"))
	from := strings.TrimSpace(c.Query("from"))
	to := strings.TrimSpace(c.Query("to"))
	pw, err := util.ParseDashboardPeriod(period, from, to)
	if err != nil {
		msg := err.Error()
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "Invalid period",
			Error:   &msg,
		})
		return util.PeriodWindow{}, false
	}
	return pw, true
}

func (h *DashboardHandler) serverError(c *gin.Context, err error) {
	msg := err.Error()
	c.JSON(http.StatusInternalServerError, models.APIResponse{
		Success: false,
		Message: "Failed to build dashboard payload",
		Error:   &msg,
	})
}

// ────────────────────────────────────────────────────────────────────────────
// /admin/dashboard/overview
// ────────────────────────────────────────────────────────────────────────────

type dashboardAggregates struct {
	gross        float64
	discounts    float64
	netSales     float64
	tax          float64
	orders       int
	ordersPlaced int
	covers       int
	avgTicket    float64
	expenses     float64
}

func (h *DashboardHandler) loadAggregates(from, to string) (dashboardAggregates, error) {
	var a dashboardAggregates
	tz := util.BusinessTimezoneName()

	// Completed-order aggregates
	var (
		gross, disc, net, tax sql.NullFloat64
		orders, covers        sql.NullInt64
	)
	err := h.db.QueryRow(`
		SELECT
			COALESCE(SUM(subtotal), 0)                  AS gross,
			COALESCE(SUM(discount_amount), 0)           AS discounts,
			COALESCE(SUM(total_amount - tax_amount), 0) AS net,
			COALESCE(SUM(tax_amount), 0)                AS tax,
			COUNT(*)                                    AS orders,
			COALESCE(SUM(NULLIF(guest_count, 0)), 0)    AS covers
		FROM orders
		WHERE status = 'completed'
		  AND (created_at AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date
	`, from, to, tz).Scan(&gross, &disc, &net, &tax, &orders, &covers)
	if err != nil {
		return a, fmt.Errorf("aggregates: %w", err)
	}
	a.gross = nullableFloat(gross)
	a.discounts = nullableFloat(disc)
	a.netSales = nullableFloat(net)
	a.tax = nullableFloat(tax)
	a.orders = nullableInt(orders)
	a.covers = nullableInt(covers)
	if a.orders > 0 {
		a.avgTicket = a.netSales / float64(a.orders)
	}

	// Orders placed (any status, including cancelled / pending) — useful drop-off KPI.
	var placed sql.NullInt64
	if err := h.db.QueryRow(`
		SELECT COUNT(*)
		FROM orders
		WHERE (created_at AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date
	`, from, to, tz).Scan(&placed); err != nil {
		return a, fmt.Errorf("orders placed: %w", err)
	}
	a.ordersPlaced = nullableInt(placed)

	// Expenses for the period (uses expense_date — already a calendar day in DB tz).
	var exp sql.NullFloat64
	if err := h.db.QueryRow(`
		SELECT COALESCE(SUM(amount), 0)
		FROM expenses
		WHERE expense_date BETWEEN $1::date AND $2::date
	`, from, to).Scan(&exp); err != nil {
		return a, fmt.Errorf("expenses: %w", err)
	}
	a.expenses = nullableFloat(exp)

	return a, nil
}

// GetOverview powers the KPI hero row + revenue/profit panel.
func (h *DashboardHandler) GetOverview(c *gin.Context) {
	pw, ok := h.parsePeriod(c)
	if !ok {
		return
	}

	current, err := h.loadAggregates(pw.FromISO(), pw.ToISO())
	if err != nil {
		h.serverError(c, err)
		return
	}
	prior, err := h.loadAggregates(pw.PreviousFromISO(), pw.PreviousToISO())
	if err != nil {
		h.serverError(c, err)
		return
	}

	resp := models.DashboardOverview{
		Period:          pw.Period,
		From:            pw.FromISO(),
		To:              pw.ToISO(),
		FromLabel:       pw.FromLabel(),
		ToLabel:         pw.ToLabel(),
		PreviousFrom:    pw.PreviousFromISO(),
		PreviousTo:      pw.PreviousToISO(),
		PreviousFromLbl: pw.PreviousFromLabel(),
		PreviousToLbl:   pw.PreviousToLabel(),
		Timezone:        util.BusinessTimezoneName(),

		NetSales:     metricPair(current.netSales, prior.netSales),
		GrossSales:   metricPair(current.gross, prior.gross),
		Tax:          metricPair(current.tax, prior.tax),
		Discounts:    metricPair(current.discounts, prior.discounts),
		Orders:       intMetricPair(current.orders, prior.orders),
		OrdersPlaced: intMetricPair(current.ordersPlaced, prior.ordersPlaced),
		Covers:       intMetricPair(current.covers, prior.covers),
		AvgTicket:    metricPair(current.avgTicket, prior.avgTicket),
		Expenses:     metricPair(current.expenses, prior.expenses),
		NetProfit:    metricPair(current.netSales-current.expenses, prior.netSales-prior.expenses),
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Dashboard overview",
		Data:    resp,
	})
}

// ────────────────────────────────────────────────────────────────────────────
// /admin/dashboard/live
// ────────────────────────────────────────────────────────────────────────────

// GetLive returns the current operational snapshot. Cheap enough to poll
// every 15s and to recompute on every SSE event.
//
// Live counts (active / in_kitchen / ready_to_serve) intentionally mirror
// the kitchen display query in routes.go (`getKitchenOrders`):
//  1. Status set is restricted to in-flight kitchen states
//     (confirmed / preparing / ready). Anything in `pending` hasn't been
//     accepted yet; `served` has already left the line.
//  2. Orders past `kitchen.stale_minutes` are excluded — a 21-hour-old
//     ticket isn't operationally "active", it's stuck. We surface those
//     separately as stale_orders_count + an alert so the operator can
//     close them out.
//
// This way, clicking "Active orders" on the dashboard always lands the
// operator on a kitchen view that contains exactly that many tickets —
// no more "14 active here, 0 there" inconsistency.
func (h *DashboardHandler) GetLive(c *gin.Context) {
	tz := util.BusinessTimezoneName()
	now := util.BusinessNow()
	today := now.Format("2006-01-02")

	kitchenSettings := config.LoadKitchen(h.db)
	staleMinutes := kitchenSettings.StaleMinutes
	if staleMinutes <= 0 {
		staleMinutes = 120 // safety net — match KitchenSettings default
	}

	var pulse models.LivePulse
	pulse.GeneratedAt = now.Format("02-01-2006 15:04:05")
	pulse.StaleThresholdMinutes = staleMinutes

	// Active / in-kitchen / ready — kitchen-display-equivalent semantics.
	var active, inKitchen, ready, stale sql.NullInt64
	if err := h.db.QueryRow(`
		WITH live AS (
			SELECT status
			FROM orders
			WHERE status IN ('confirmed', 'preparing', 'ready')
			  AND created_at > NOW() - ($1 || ' minutes')::interval
		),
		stuck AS (
			SELECT 1
			FROM orders
			WHERE status IN ('pending', 'confirmed', 'preparing', 'ready')
			  AND created_at <= NOW() - ($1 || ' minutes')::interval
		)
		SELECT
			(SELECT COUNT(*) FROM live)                                              AS active,
			(SELECT COUNT(*) FROM live WHERE status IN ('confirmed', 'preparing'))   AS in_kitchen,
			(SELECT COUNT(*) FROM live WHERE status = 'ready')                       AS ready,
			(SELECT COUNT(*) FROM stuck)                                             AS stale
	`, strconv.Itoa(staleMinutes)).Scan(&active, &inKitchen, &ready, &stale); err != nil {
		h.serverError(c, err)
		return
	}
	pulse.ActiveOrders = nullableInt(active)
	pulse.InKitchen = nullableInt(inKitchen)
	pulse.ReadyToServe = nullableInt(ready)
	pulse.StaleOrdersCount = nullableInt(stale)

	// Tables
	var occ, total sql.NullInt64
	if err := h.db.QueryRow(`
		SELECT
			COUNT(*) FILTER (WHERE is_occupied) AS occupied,
			COUNT(*)                            AS total
		FROM dining_tables
	`).Scan(&occ, &total); err != nil {
		h.serverError(c, err)
		return
	}
	pulse.OccupiedTables = nullableInt(occ)
	pulse.TotalTables = nullableInt(total)

	// Kitchen wait — same scope as the live counts above. A 21-hour stale
	// ticket would otherwise blow up the average and the "Longest" tile.
	var avgWait, longest sql.NullFloat64
	if err := h.db.QueryRow(`
		SELECT
			COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - kot_first_sent_at))), 0) AS avg_wait,
			COALESCE(MAX(EXTRACT(EPOCH FROM (NOW() - kot_first_sent_at))), 0) AS longest
		FROM orders
		WHERE status IN ('confirmed', 'preparing', 'ready')
		  AND kot_first_sent_at IS NOT NULL
		  AND created_at > NOW() - ($1 || ' minutes')::interval
	`, strconv.Itoa(staleMinutes)).Scan(&avgWait, &longest); err != nil {
		h.serverError(c, err)
		return
	}
	pulse.AvgKitchenWaitSeconds = int(nullableFloat(avgWait))
	pulse.LongestRunningSeconds = int(nullableFloat(longest))

	// Voids today
	var voidsCount sql.NullInt64
	var voidsAmt sql.NullFloat64
	if err := h.db.QueryRow(`
		SELECT COUNT(*), COALESCE(SUM(quantity * unit_price), 0)
		FROM void_log
		WHERE (created_at AT TIME ZONE $1)::date = $2::date
	`, tz, today).Scan(&voidsCount, &voidsAmt); err != nil {
		h.serverError(c, err)
		return
	}
	pulse.VoidsTodayCount = nullableInt(voidsCount)
	pulse.VoidsTodayAmount = nullableFloat(voidsAmt)

	// Today's revenue + order count (consistent: both filtered to completed)
	var todayCount sql.NullInt64
	var todayRev sql.NullFloat64
	if err := h.db.QueryRow(`
		SELECT COUNT(*), COALESCE(SUM(total_amount - tax_amount), 0)
		FROM orders
		WHERE status = 'completed'
		  AND (created_at AT TIME ZONE $1)::date = $2::date
	`, tz, today).Scan(&todayCount, &todayRev); err != nil {
		h.serverError(c, err)
		return
	}
	pulse.OrdersTodayCount = nullableInt(todayCount)
	pulse.RevenueTodaySoFar = nullableFloat(todayRev)

	// Drawer reconciliation status for today
	var hasClosing bool
	var actualCash sql.NullFloat64
	var expectedCash sql.NullFloat64
	if err := h.db.QueryRow(`
		SELECT
			(actual_cash IS NOT NULL) AS reconciled,
			actual_cash,
			expected_cash
		FROM daily_closings
		WHERE closing_date = $1::date
	`, today).Scan(&hasClosing, &actualCash, &expectedCash); err != nil {
		if err != sql.ErrNoRows {
			h.serverError(c, err)
			return
		}
	}
	pulse.DrawerReconciled = hasClosing && actualCash.Valid
	pulse.DrawerExpectedCash = nullableFloat(expectedCash)

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Live pulse",
		Data:    pulse,
	})
}

// ────────────────────────────────────────────────────────────────────────────
// /admin/dashboard/sales-timeseries
// ────────────────────────────────────────────────────────────────────────────

// GetSalesTimeseries returns the current period plus a same-length prior
// period, both densified so the chart never has gaps. Bucket granularity is
// inferred from the period.
func (h *DashboardHandler) GetSalesTimeseries(c *gin.Context) {
	pw, ok := h.parsePeriod(c)
	if !ok {
		return
	}

	current, err := h.loadTimeseries(pw.FromISO(), pw.ToISO(), pw.Granularity)
	if err != nil {
		h.serverError(c, err)
		return
	}
	prior, err := h.loadTimeseries(pw.PreviousFromISO(), pw.PreviousToISO(), pw.Granularity)
	if err != nil {
		h.serverError(c, err)
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Sales timeseries",
		Data: models.SalesTimeseries{
			Period:      pw.Period,
			Granularity: pw.Granularity,
			From:        pw.FromISO(),
			To:          pw.ToISO(),
			Current:     current,
			Prior:       prior,
		},
	})
}

func (h *DashboardHandler) loadTimeseries(from, to, granularity string) ([]models.SalesBucket, error) {
	tz := util.BusinessTimezoneName()

	var query string
	switch granularity {
	case "hour":
		// Hour buckets, densified across the entire range so morning/late-night
		// gaps still appear as zero bars.
		query = `
			WITH bounds AS (
				SELECT
					($1::date AT TIME ZONE $3) AS lo,
					(($2::date + interval '1 day') AT TIME ZONE $3) AS hi
			),
			hours AS (
				SELECT generate_series(
					date_trunc('hour', (SELECT lo FROM bounds)),
					date_trunc('hour', (SELECT hi FROM bounds) - interval '1 hour'),
					interval '1 hour'
				) AS h
			),
			agg AS (
				SELECT
					date_trunc('hour', created_at AT TIME ZONE $3) AS h_local,
					COUNT(*) AS orders,
					COALESCE(SUM(subtotal), 0)                  AS gross,
					COALESCE(SUM(tax_amount), 0)                AS tax,
					COALESCE(SUM(total_amount - tax_amount), 0) AS net
				FROM orders
				WHERE status = 'completed'
				  AND (created_at AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date
				GROUP BY date_trunc('hour', created_at AT TIME ZONE $3)
			)
			SELECT hours.h, COALESCE(agg.orders, 0), COALESCE(agg.gross, 0), COALESCE(agg.tax, 0), COALESCE(agg.net, 0)
			FROM hours
			LEFT JOIN agg ON agg.h_local = hours.h
			ORDER BY hours.h ASC
		`
	case "month":
		query = `
			WITH months AS (
				SELECT generate_series(
					date_trunc('month', $1::date),
					date_trunc('month', $2::date),
					interval '1 month'
				)::date AS m
			),
			agg AS (
				SELECT
					date_trunc('month', (created_at AT TIME ZONE $3)::date)::date AS m,
					COUNT(*) AS orders,
					COALESCE(SUM(subtotal), 0)                  AS gross,
					COALESCE(SUM(tax_amount), 0)                AS tax,
					COALESCE(SUM(total_amount - tax_amount), 0) AS net
				FROM orders
				WHERE status = 'completed'
				  AND (created_at AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date
				GROUP BY 1
			)
			SELECT months.m, COALESCE(agg.orders, 0), COALESCE(agg.gross, 0), COALESCE(agg.tax, 0), COALESCE(agg.net, 0)
			FROM months
			LEFT JOIN agg ON agg.m = months.m
			ORDER BY months.m ASC
		`
	default: // day
		query = `
			WITH days AS (
				SELECT generate_series($1::date, $2::date, interval '1 day')::date AS d
			),
			agg AS (
				SELECT
					(created_at AT TIME ZONE $3)::date AS d,
					COUNT(*) AS orders,
					COALESCE(SUM(subtotal), 0)                  AS gross,
					COALESCE(SUM(tax_amount), 0)                AS tax,
					COALESCE(SUM(total_amount - tax_amount), 0) AS net
				FROM orders
				WHERE status = 'completed'
				  AND (created_at AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date
				GROUP BY (created_at AT TIME ZONE $3)::date
			)
			SELECT days.d, COALESCE(agg.orders, 0), COALESCE(agg.gross, 0), COALESCE(agg.tax, 0), COALESCE(agg.net, 0)
			FROM days
			LEFT JOIN agg ON agg.d = days.d
			ORDER BY days.d ASC
		`
	}

	rows, err := h.db.Query(query, from, to, tz)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]models.SalesBucket, 0)
	for rows.Next() {
		var b models.SalesBucket
		if err := rows.Scan(&b.BucketStart, &b.Orders, &b.Gross, &b.Tax, &b.Net); err != nil {
			return nil, err
		}
		b.Label = formatBucketLabel(b.BucketStart, granularity)
		out = append(out, b)
	}
	return out, rows.Err()
}

func formatBucketLabel(t time.Time, granularity string) string {
	loc := util.BusinessLocation()
	local := t.In(loc)
	switch granularity {
	case "hour":
		return local.Format("15:04")
	case "month":
		return local.Format("Jan 06")
	default:
		return local.Format("02-01")
	}
}

// ────────────────────────────────────────────────────────────────────────────
// /admin/dashboard/top-items
// ────────────────────────────────────────────────────────────────────────────

// GetTopItems returns the highest-revenue items in the period (default top 5).
// Voided lines are excluded.
func (h *DashboardHandler) GetTopItems(c *gin.Context) {
	pw, ok := h.parsePeriod(c)
	if !ok {
		return
	}

	limit := 5
	if v, err := strconv.Atoi(c.DefaultQuery("limit", "5")); err == nil && v > 0 && v <= 50 {
		limit = v
	}

	tz := util.BusinessTimezoneName()
	rows, err := h.db.Query(`
		WITH range_orders AS (
			SELECT id
			FROM orders
			WHERE status = 'completed'
			  AND (created_at AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date
		),
		line_revenue AS (
			SELECT
				oi.product_id,
				SUM(oi.quantity)    AS qty_sold,
				SUM(oi.total_price) AS revenue
			FROM order_items oi
			JOIN range_orders o ON o.id = oi.order_id
			WHERE oi.status <> 'voided'
			GROUP BY oi.product_id
		),
		total AS (
			SELECT COALESCE(SUM(revenue), 0) AS net FROM line_revenue
		)
		SELECT
			lr.product_id,
			COALESCE(p.name, '(deleted item)') AS name,
			c.name                              AS category,
			lr.qty_sold,
			lr.revenue,
			CASE WHEN (SELECT net FROM total) > 0
				 THEN (lr.revenue / (SELECT net FROM total)) * 100
				 ELSE 0
			END AS percent_of_net
		FROM line_revenue lr
		LEFT JOIN products   p ON p.id = lr.product_id
		LEFT JOIN categories c ON c.id = p.category_id
		ORDER BY lr.revenue DESC
		LIMIT $4
	`, pw.FromISO(), pw.ToISO(), tz, limit)
	if err != nil {
		h.serverError(c, err)
		return
	}
	defer rows.Close()

	out := make([]models.DashboardTopItem, 0, limit)
	for rows.Next() {
		var it models.DashboardTopItem
		var category sql.NullString
		var pid sql.NullString
		if err := rows.Scan(&pid, &it.Name, &category, &it.QtySold, &it.Revenue, &it.PercentOfNet); err != nil {
			h.serverError(c, err)
			return
		}
		if pid.Valid {
			it.ProductID = pid.String
		}
		if category.Valid {
			cat := category.String
			it.Category = &cat
		}
		out = append(out, it)
	}
	if err := rows.Err(); err != nil {
		h.serverError(c, err)
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Top items",
		Data:    out,
	})
}

// ────────────────────────────────────────────────────────────────────────────
// /admin/dashboard/payment-mix
// ────────────────────────────────────────────────────────────────────────────

func paymentMethodLabel(method string) string {
	switch method {
	case "cash":
		return "Cash"
	case "credit_card":
		return "Credit Card"
	case "debit_card":
		return "Debit Card"
	case "card":
		return "Card"
	case "digital_wallet":
		return "Digital Wallet"
	case "online":
		return "Online"
	default:
		if method == "" {
			return "Other"
		}
		return titleCaseWords(strings.ReplaceAll(method, "_", " "))
	}
}

// GetPaymentMix returns one slice per payment method for the period. Combines
// the payments table with the order's checkout_payment_method fallback so
// cash sales recorded only via checkout intent still appear.
func (h *DashboardHandler) GetPaymentMix(c *gin.Context) {
	pw, ok := h.parsePeriod(c)
	if !ok {
		return
	}

	tz := util.BusinessTimezoneName()
	rows, err := h.db.Query(`
		WITH range_orders AS (
			SELECT id, total_amount, checkout_payment_method
			FROM orders
			WHERE status = 'completed'
			  AND (created_at AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date
		),
		paid AS (
			SELECT p.payment_method AS method, p.amount, p.order_id
			FROM payments p
			JOIN range_orders o ON o.id = p.order_id
			WHERE p.status = 'completed'
		),
		fallback AS (
			SELECT
				COALESCE(o.checkout_payment_method, 'cash') AS method,
				o.total_amount AS amount,
				o.id AS order_id
			FROM range_orders o
			WHERE NOT EXISTS (
				SELECT 1 FROM payments p WHERE p.order_id = o.id AND p.status = 'completed'
			)
		),
		combined AS (
			SELECT method, amount, order_id FROM paid
			UNION ALL
			SELECT method, amount, order_id FROM fallback
		)
		SELECT method, COUNT(DISTINCT order_id) AS cnt, COALESCE(SUM(amount), 0) AS amount
		FROM combined
		GROUP BY method
		ORDER BY amount DESC
	`, pw.FromISO(), pw.ToISO(), tz)
	if err != nil {
		h.serverError(c, err)
		return
	}
	defer rows.Close()

	out := make([]models.PaymentMixSlice, 0, 4)
	var total float64
	for rows.Next() {
		var s models.PaymentMixSlice
		if err := rows.Scan(&s.Method, &s.Count, &s.Amount); err != nil {
			h.serverError(c, err)
			return
		}
		s.Label = paymentMethodLabel(s.Method)
		total += s.Amount
		out = append(out, s)
	}
	if err := rows.Err(); err != nil {
		h.serverError(c, err)
		return
	}
	if total > 0 {
		for i := range out {
			out[i].Pct = (out[i].Amount / total) * 100
		}
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Payment mix",
		Data:    out,
	})
}

// ────────────────────────────────────────────────────────────────────────────
// /admin/dashboard/order-type-mix
// ────────────────────────────────────────────────────────────────────────────

func orderTypeLabel(t string) string {
	switch t {
	case "dine_in":
		return "Dine-in"
	case "takeout":
		return "Takeout"
	case "takeaway":
		return "Takeaway"
	case "delivery":
		return "Delivery"
	case "counter":
		return "Counter"
	default:
		if t == "" {
			return "Other"
		}
		return titleCaseWords(strings.ReplaceAll(t, "_", " "))
	}
}

// titleCaseWords upper-cases the first letter of each whitespace-separated
// word and lower-cases the rest. ASCII-only — sufficient for our enum
// fallbacks (cash/card/etc) and avoids pulling in golang.org/x/text just to
// replace the deprecated strings.Title.
func titleCaseWords(s string) string {
	if s == "" {
		return s
	}
	out := make([]byte, 0, len(s))
	upNext := true
	for i := 0; i < len(s); i++ {
		ch := s[i]
		if ch == ' ' || ch == '-' || ch == '_' {
			out = append(out, ch)
			upNext = true
			continue
		}
		if upNext {
			if ch >= 'a' && ch <= 'z' {
				ch -= 'a' - 'A'
			}
			upNext = false
		} else {
			if ch >= 'A' && ch <= 'Z' {
				ch += 'a' - 'A'
			}
		}
		out = append(out, ch)
	}
	return string(out)
}

// GetOrderTypeMix returns one slice per order_type in the period.
func (h *DashboardHandler) GetOrderTypeMix(c *gin.Context) {
	pw, ok := h.parsePeriod(c)
	if !ok {
		return
	}

	tz := util.BusinessTimezoneName()
	rows, err := h.db.Query(`
		SELECT
			COALESCE(NULLIF(order_type, ''), 'other') AS order_type,
			COUNT(*)                                  AS cnt,
			COALESCE(SUM(total_amount), 0)            AS amount
		FROM orders
		WHERE status = 'completed'
		  AND (created_at AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date
		GROUP BY 1
		ORDER BY amount DESC
	`, pw.FromISO(), pw.ToISO(), tz)
	if err != nil {
		h.serverError(c, err)
		return
	}
	defer rows.Close()

	out := make([]models.OrderTypeMixSlice, 0, 4)
	var total float64
	for rows.Next() {
		var s models.OrderTypeMixSlice
		if err := rows.Scan(&s.OrderType, &s.Count, &s.Amount); err != nil {
			h.serverError(c, err)
			return
		}
		s.Label = orderTypeLabel(s.OrderType)
		total += s.Amount
		out = append(out, s)
	}
	if err := rows.Err(); err != nil {
		h.serverError(c, err)
		return
	}
	if total > 0 {
		for i := range out {
			out[i].Pct = (out[i].Amount / total) * 100
		}
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Order type mix",
		Data:    out,
	})
}

// ────────────────────────────────────────────────────────────────────────────
// /admin/dashboard/alerts
// ────────────────────────────────────────────────────────────────────────────

// GetAlerts returns a small set of actionable alerts. Each alert can carry
// an ActionTo that the UI uses to navigate to the right admin section.
func (h *DashboardHandler) GetAlerts(c *gin.Context) {
	tz := util.BusinessTimezoneName()
	now := util.BusinessNow()
	today := now.Format("2006-01-02")

	alerts := make([]models.DashboardAlert, 0, 8)

	// 1. Low / out-of-stock store inventory items
	{
		var low int
		var sample sql.NullString
		_ = h.db.QueryRow(`
			SELECT COUNT(*),
				(SELECT name FROM stock_items
				 WHERE is_active AND reorder_level > 0 AND quantity_on_hand <= reorder_level
				 ORDER BY (reorder_level - quantity_on_hand) DESC LIMIT 1)
			FROM stock_items
			WHERE is_active AND reorder_level > 0 AND quantity_on_hand <= reorder_level
		`).Scan(&low, &sample)
		if low > 0 {
			detail := fmt.Sprintf("%d item(s) at or below reorder level", low)
			if sample.Valid {
				detail = fmt.Sprintf("%s (e.g. %s)", detail, sample.String)
			}
			alerts = append(alerts, models.DashboardAlert{
				ID:       "low_stock",
				Severity: severityForLowStock(low),
				Kind:     "low_stock",
				Title:    "Low stock",
				Detail:   detail,
				ActionTo: "inventory",
			})
		}
	}

	// 2. Long-running orders (open > 45 min, but not yet stale). Stale
	// tickets get a separate, higher-severity alert below — the "slow"
	// alert is for tickets the kitchen should still be able to recover.
	{
		kitchenSettings := config.LoadKitchen(h.db)
		staleMinutes := kitchenSettings.StaleMinutes
		if staleMinutes <= 0 {
			staleMinutes = 120
		}
		var longOpen int
		_ = h.db.QueryRow(`
			SELECT COUNT(*) FROM orders
			WHERE status IN ('confirmed', 'preparing', 'ready')
			  AND kot_first_sent_at IS NOT NULL
			  AND NOW() - kot_first_sent_at > interval '45 minutes'
			  AND created_at > NOW() - ($1 || ' minutes')::interval
		`, strconv.Itoa(staleMinutes)).Scan(&longOpen)
		if longOpen > 0 {
			alerts = append(alerts, models.DashboardAlert{
				ID:       "long_order",
				Severity: "warning",
				Kind:     "long_order",
				Title:    "Slow tickets",
				Detail:   fmt.Sprintf("%d order(s) have been in the kitchen over 45 min", longOpen),
				ActionTo: "kitchen",
			})
		}
	}

	// 2b. Stale / stuck orders — past the kitchen.stale_minutes window but
	// still in an active status. These don't show on the kitchen display
	// (by design — they'd clutter the line). Operators need to know about
	// them so they can close the loop manually.
	{
		kitchenSettings := config.LoadKitchen(h.db)
		staleMinutes := kitchenSettings.StaleMinutes
		if staleMinutes <= 0 {
			staleMinutes = 120
		}
		var stuck int
		var oldest sql.NullFloat64
		_ = h.db.QueryRow(`
			SELECT
				COUNT(*),
				COALESCE(MAX(EXTRACT(EPOCH FROM (NOW() - created_at))/3600.0), 0) AS oldest_hours
			FROM orders
			WHERE status IN ('pending', 'confirmed', 'preparing', 'ready')
			  AND created_at <= NOW() - ($1 || ' minutes')::interval
		`, strconv.Itoa(staleMinutes)).Scan(&stuck, &oldest)
		if stuck > 0 {
			severity := "warning"
			if stuck >= 10 || nullableFloat(oldest) >= 24 {
				severity = "critical"
			}
			detail := fmt.Sprintf(
				"%d order(s) past the %d-min kitchen window — oldest %s ago. They're hidden from the KDS; cancel or complete them to clean up.",
				stuck, staleMinutes, formatHoursMinutes(nullableFloat(oldest)),
			)
			alerts = append(alerts, models.DashboardAlert{
				ID:       "stale_orders",
				Severity: severity,
				Kind:     "stale_orders",
				Title:    "Stuck orders",
				Detail:   detail,
				ActionTo: "reports", // Reports → Orders Browser is the cleanup surface
			})
		}
	}

	// 3. Voids spike — today's void count vs 7-day daily average
	{
		var todayV int
		var avg7 sql.NullFloat64
		_ = h.db.QueryRow(`
			SELECT COUNT(*) FROM void_log
			WHERE (created_at AT TIME ZONE $1)::date = $2::date
		`, tz, today).Scan(&todayV)
		_ = h.db.QueryRow(`
			SELECT COALESCE(AVG(daily_count), 0) FROM (
				SELECT COUNT(*) AS daily_count
				FROM void_log
				WHERE (created_at AT TIME ZONE $1)::date BETWEEN ($2::date - interval '7 days')::date AND ($2::date - interval '1 day')::date
				GROUP BY (created_at AT TIME ZONE $1)::date
			) t
		`, tz, today).Scan(&avg7)
		baseline := nullableFloat(avg7)
		if todayV > 0 && baseline >= 1 && float64(todayV) > baseline*2 {
			alerts = append(alerts, models.DashboardAlert{
				ID:       "void_spike",
				Severity: "warning",
				Kind:     "void_spike",
				Title:    "Voids elevated",
				Detail:   fmt.Sprintf("%d voids today (avg %.1f over last 7 days)", todayV, baseline),
				ActionTo: "void-log",
			})
		}
	}

	// 4. Drawer not yet reconciled (only after 6 PM business time, when it
	// matters operationally).
	if now.Hour() >= 18 {
		var hasClosing bool
		var actualCash sql.NullFloat64
		err := h.db.QueryRow(`
			SELECT TRUE, actual_cash FROM daily_closings WHERE closing_date = $1::date
		`, today).Scan(&hasClosing, &actualCash)
		reconciled := err == nil && hasClosing && actualCash.Valid
		if !reconciled {
			alerts = append(alerts, models.DashboardAlert{
				ID:       "drawer_unreconciled",
				Severity: "info",
				Kind:     "drawer_unreconciled",
				Title:    "Drawer not closed",
				Detail:   "Today's cash drawer hasn't been reconciled yet",
				ActionTo: "expenses",
			})
		}
	}

	// 5. No sales today by lunchtime
	if now.Hour() >= 13 {
		var todayCompleted int
		_ = h.db.QueryRow(`
			SELECT COUNT(*) FROM orders
			WHERE status = 'completed'
			  AND (created_at AT TIME ZONE $1)::date = $2::date
		`, tz, today).Scan(&todayCompleted)
		if todayCompleted == 0 {
			alerts = append(alerts, models.DashboardAlert{
				ID:       "no_sales",
				Severity: "info",
				Kind:     "no_sales",
				Title:    "No sales recorded yet",
				Detail:   "Nothing has rung up today — check that the counter is open",
				ActionTo: "counter",
			})
		}
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Dashboard alerts",
		Data:    alerts,
	})
}

// formatHoursMinutes renders e.g. 25.5 → "1d 1h", 9.27 → "9h 16m".
func formatHoursMinutes(hours float64) string {
	if hours <= 0 {
		return "0m"
	}
	totalMin := int(hours * 60)
	d := totalMin / (60 * 24)
	rem := totalMin % (60 * 24)
	h := rem / 60
	m := rem % 60
	if d > 0 {
		return fmt.Sprintf("%dd %dh", d, h)
	}
	if h > 0 {
		return fmt.Sprintf("%dh %02dm", h, m)
	}
	return fmt.Sprintf("%dm", m)
}

func severityForLowStock(n int) string {
	switch {
	case n >= 10:
		return "critical"
	case n >= 3:
		return "warning"
	default:
		return "info"
	}
}

// ────────────────────────────────────────────────────────────────────────────
// /admin/dashboard/stream — Server-Sent Events
//
// Mirrors /kitchen/stream auth (?token= JWT). Each subscribed event triggers
// a `live` payload recompute on the client (the client invalidates its
// React Query cache; authoritative numbers are still fetched over REST).
// ────────────────────────────────────────────────────────────────────────────

// DashboardStream returns a gin.HandlerFunc that streams DashboardEvent
// frames as Server-Sent Events.
func (h *DashboardHandler) DashboardStream() gin.HandlerFunc {
	return func(c *gin.Context) {
		w := c.Writer
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("X-Accel-Buffering", "no")

		flusher, ok := w.(interface{ Flush() })
		if !ok {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
				"success": false, "message": "Streaming not supported",
			})
			return
		}

		events, unsubscribe := realtime.DefaultDashboard().Subscribe(64)
		defer unsubscribe()

		// Initial ready ping so the client can show "Live"
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
				fmt.Fprintf(w, "event: %s\ndata: %s\n\n", safeDashboardEventName(ev.Type), payload)
				flusher.Flush()
			case <-heartbeat.C:
				fmt.Fprintf(w, ": ping %s\n\n", time.Now().UTC().Format(time.RFC3339))
				flusher.Flush()
			}
		}
	}
}

func safeDashboardEventName(t string) string {
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
