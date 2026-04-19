package handlers

import (
	"database/sql"
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"pos-backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// reportsTimezone is the single source of truth for what counts as a calendar
// day in this POS deployment. All date bucketing on the server uses this.
// (Asia/Karachi is UTC+5, no DST — operationally simple.)
const reportsTimezone = "Asia/Karachi"

// reportsBrandFallback is what we stamp on exports when neither
// `restaurant_name` nor `receipt_business_name` is configured in app_settings.
// Should never be hit on a properly-configured deployment.
const reportsBrandFallback = "POS"

// reportsBrand reads the venue's display name from app_settings. Mirrors the
// frontend lookup in [frontend/src/components/admin/reports/ReportsShell.tsx]:
// prefer `restaurant_name` (the General → Restaurant Name field that drives
// every in-app surface), fall back to `receipt_business_name` for older
// installs, then to a generic fallback so we never emit "Cafe Cova" on a
// restaurant that isn't Cafe Cova. Values in app_settings are JSONB strings,
// hence the trim of surrounding quotes.
func reportsBrand(db *sql.DB) string {
	for _, key := range []string{"restaurant_name", "receipt_business_name"} {
		var raw sql.NullString
		err := db.QueryRow(`SELECT value::text FROM app_settings WHERE key = $1`, key).Scan(&raw)
		if err != nil || !raw.Valid {
			continue
		}
		s := strings.TrimSpace(strings.Trim(raw.String, `"`))
		if s != "" {
			return s
		}
	}
	return reportsBrandFallback
}

// reportsBrandSlug turns a brand string into a filesystem-safe lowercase
// slug for use in CSV filenames. Non-alphanumeric runs collapse to a single
// dash. Empty input falls back to "pos".
func reportsBrandSlug(brand string) string {
	var b strings.Builder
	prevDash := false
	for _, r := range strings.ToLower(strings.TrimSpace(brand)) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			prevDash = false
		default:
			if !prevDash && b.Len() > 0 {
				b.WriteRune('-')
				prevDash = true
			}
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		return "pos"
	}
	return out
}

// reportsLocation is the loaded *time.Location for reportsTimezone. Falls back
// to a fixed UTC+5 zone if the system tzdata isn't available, so containers
// without /usr/share/zoneinfo (e.g. minimal Alpine images) still produce
// correct labels.
var reportsLocation = func() *time.Location {
	if loc, err := time.LoadLocation(reportsTimezone); err == nil {
		return loc
	}
	return time.FixedZone("PKT", 5*60*60)
}()

// ReportsHandler exposes /admin/reports/v2/* — the granular reporting module
// powering the redesigned Reports & Analytics page.
//
// Design rules every endpoint follows:
//  1. Range is required (`from`, `to` as ISO YYYY-MM-DD) and validated against
//     a 366-day max window to keep the database honest.
//  2. All date math runs `AT TIME ZONE 'Asia/Karachi'` — the dashboard is
//     read by humans whose business day matches the cafe's local clock.
//  3. Money series only count completed orders (status = 'completed') and
//     exclude voided line items, mirroring how the cashier sees a closed
//     check.
//  4. Every row that contains a date also carries a pre-formatted DD-MM-YYYY
//     `*_label` so the UI never re-formats on the client and exports stay
//     consistent.
//  5. The same range is used to compute a "previous period" of equal length
//     for KPI deltas — no more hardcoded growth percentages.
type ReportsHandler struct {
	db *sql.DB
}

func NewReportsHandler(db *sql.DB) *ReportsHandler {
	return &ReportsHandler{db: db}
}

// ─────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────

type reportsRange struct {
	From         time.Time // local-midnight in Asia/Karachi
	To           time.Time // local-midnight in Asia/Karachi
	FromDate     string    // ISO YYYY-MM-DD
	ToDate       string    // ISO YYYY-MM-DD
	PreviousFrom time.Time
	PreviousTo   time.Time
	PrevFromDate string
	PrevToDate   string
}

func (r reportsRange) DaysInclusive() int {
	return int(r.To.Sub(r.From).Hours()/24) + 1
}

// parseISODate parses YYYY-MM-DD; tolerates DD-MM-YYYY for endpoints (e.g.
// Orders Browser) that may be hit from a UI that displays DD-MM-YYYY.
func parseFlexibleDate(s string) (time.Time, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}, fmt.Errorf("date is required")
	}
	if t, err := time.Parse("2006-01-02", s); err == nil {
		return t, nil
	}
	if t, err := time.Parse("02-01-2006", s); err == nil {
		return t, nil
	}
	return time.Time{}, fmt.Errorf("invalid date %q (expected YYYY-MM-DD or DD-MM-YYYY)", s)
}

func parseReportsRange(c *gin.Context) (reportsRange, error) {
	from, err := parseFlexibleDate(c.Query("from"))
	if err != nil {
		return reportsRange{}, fmt.Errorf("from: %w", err)
	}
	to, err := parseFlexibleDate(c.Query("to"))
	if err != nil {
		return reportsRange{}, fmt.Errorf("to: %w", err)
	}
	if to.Before(from) {
		return reportsRange{}, fmt.Errorf("to must be on or after from")
	}
	days := int(to.Sub(from).Hours()/24) + 1
	if days > 366 {
		return reportsRange{}, fmt.Errorf("range is too large (max 366 days)")
	}

	// Previous-period: same length, immediately preceding.
	prevTo := from.AddDate(0, 0, -1)
	prevFrom := prevTo.AddDate(0, 0, -(days - 1))

	return reportsRange{
		From:         from,
		To:           to,
		FromDate:     from.Format("2006-01-02"),
		ToDate:       to.Format("2006-01-02"),
		PreviousFrom: prevFrom,
		PreviousTo:   prevTo,
		PrevFromDate: prevFrom.Format("2006-01-02"),
		PrevToDate:   prevTo.Format("2006-01-02"),
	}, nil
}

func ddmmyyyy(t time.Time) string { return t.Format("02-01-2006") }

func ddmmyyyyHHmm(t time.Time) string { return t.Format("02-01-2006 15:04") }

func reportsBadRequest(c *gin.Context, err error) {
	msg := err.Error()
	c.JSON(http.StatusBadRequest, models.APIResponse{
		Success: false,
		Message: "Invalid report parameters",
		Error:   &msg,
	})
}

func reportsServerError(c *gin.Context, err error) {
	msg := err.Error()
	c.JSON(http.StatusInternalServerError, models.APIResponse{
		Success: false,
		Message: "Failed to build report",
		Error:   &msg,
	})
}

// pctChange returns nil for previous=0 (avoids divide-by-zero AND avoids the
// classic "+∞%" UI). Otherwise: (current-previous)/previous*100.
func pctChange(current, previous float64) *float64 {
	if previous == 0 {
		return nil
	}
	v := (current - previous) / previous * 100
	return &v
}

func metricPair(current, previous float64) models.MetricPair {
	return models.MetricPair{
		Current:  current,
		Previous: previous,
		Delta:    current - previous,
		Pct:      pctChange(current, previous),
	}
}

func intMetricPair(current, previous int) models.IntMetricPair {
	return models.IntMetricPair{
		Current:  current,
		Previous: previous,
		Delta:    current - previous,
		Pct:      pctChange(float64(current), float64(previous)),
	}
}

func nullableFloat(v sql.NullFloat64) float64 {
	if v.Valid {
		return v.Float64
	}
	return 0
}

func nullableInt(v sql.NullInt64) int {
	if v.Valid {
		return int(v.Int64)
	}
	return 0
}

// ─────────────────────────────────────────────────────────────────────────
// /admin/reports/v2/overview
// ─────────────────────────────────────────────────────────────────────────

type overviewAggregates struct {
	gross         float64
	discounts     float64
	netSales      float64
	tax           float64
	serviceCharge float64
	orders        int
	covers        int
	avgCheck      float64
}

func (h *ReportsHandler) loadOverviewAggregates(from, to string) (overviewAggregates, error) {
	var a overviewAggregates
	var (
		gross, disc, net, tax, svc sql.NullFloat64
		orders, covers             sql.NullInt64
	)
	err := h.db.QueryRow(`
		WITH range_orders AS (
			SELECT *
			FROM orders
			WHERE status = 'completed'
			  AND (created_at AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date
		)
		SELECT
			COALESCE(SUM(subtotal), 0)               AS gross,
			COALESCE(SUM(discount_amount), 0)        AS discounts,
			COALESCE(SUM(total_amount - tax_amount), 0) AS net,
			COALESCE(SUM(tax_amount), 0)             AS tax,
			COALESCE(SUM(service_charge_amount), 0)  AS svc,
			COUNT(*)                                 AS orders,
			COALESCE(SUM(NULLIF(guest_count, 0)), 0) AS covers
		FROM range_orders
	`, from, to, reportsTimezone).Scan(&gross, &disc, &net, &tax, &svc, &orders, &covers)
	if err != nil {
		return a, err
	}
	a.gross = nullableFloat(gross)
	a.discounts = nullableFloat(disc)
	a.netSales = nullableFloat(net)
	a.tax = nullableFloat(tax)
	a.serviceCharge = nullableFloat(svc)
	a.orders = nullableInt(orders)
	a.covers = nullableInt(covers)
	if a.orders > 0 {
		a.avgCheck = a.netSales / float64(a.orders)
	}
	return a, nil
}

func (h *ReportsHandler) loadTenderMix(from, to string) ([]models.TenderMixRow, error) {
	// Combine successful payment rows with the order's
	// `checkout_payment_method` for orders that don't have a payments row
	// (e.g. cash sales recorded only via the checkout intent). Tender mix
	// pulls amount from the payment when present, else falls back to the
	// order's total. This matches how the cashier sees a closed check.
	rows, err := h.db.Query(`
		WITH range_orders AS (
			SELECT id, total_amount, checkout_payment_method
			FROM orders
			WHERE status = 'completed'
			  AND (created_at AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date
		),
		payment_methods AS (
			SELECT
				CASE p.payment_method
					WHEN 'credit_card' THEN 'card'
					WHEN 'debit_card'  THEN 'card'
					WHEN 'digital_wallet' THEN 'card'
					ELSE p.payment_method
				END AS method,
				p.amount,
				p.order_id
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
			SELECT method, amount, order_id FROM payment_methods
			UNION ALL
			SELECT method, amount, order_id FROM fallback
		)
		SELECT method, COALESCE(SUM(amount), 0) AS amount, COUNT(DISTINCT order_id) AS cnt
		FROM combined
		GROUP BY method
		ORDER BY amount DESC
	`, from, to, reportsTimezone)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// Use make() so an empty result serializes as `[]`, not `null`.
	// The frontend reads `overview.tender_mix.length`, which crashes on null.
	out := make([]models.TenderMixRow, 0)
	var total float64
	for rows.Next() {
		var r models.TenderMixRow
		var amt sql.NullFloat64
		var cnt sql.NullInt64
		if err := rows.Scan(&r.Method, &amt, &cnt); err != nil {
			return nil, err
		}
		r.Amount = nullableFloat(amt)
		r.Count = nullableInt(cnt)
		total += r.Amount
		out = append(out, r)
	}
	if total > 0 {
		for i := range out {
			out[i].Pct = (out[i].Amount / total) * 100
		}
	}
	return out, rows.Err()
}

// GetOverview powers the KPI tiles + tender mix donut at the top of the page.
func (h *ReportsHandler) GetOverview(c *gin.Context) {
	rng, err := parseReportsRange(c)
	if err != nil {
		reportsBadRequest(c, err)
		return
	}

	current, err := h.loadOverviewAggregates(rng.FromDate, rng.ToDate)
	if err != nil {
		reportsServerError(c, err)
		return
	}
	previous, err := h.loadOverviewAggregates(rng.PrevFromDate, rng.PrevToDate)
	if err != nil {
		reportsServerError(c, err)
		return
	}
	tender, err := h.loadTenderMix(rng.FromDate, rng.ToDate)
	if err != nil {
		reportsServerError(c, err)
		return
	}

	resp := models.OverviewReport{
		From:            rng.FromDate,
		To:              rng.ToDate,
		FromLabel:       ddmmyyyy(rng.From),
		ToLabel:         ddmmyyyy(rng.To),
		PreviousFrom:    rng.PrevFromDate,
		PreviousTo:      rng.PrevToDate,
		PreviousFromLbl: ddmmyyyy(rng.PreviousFrom),
		PreviousToLbl:   ddmmyyyy(rng.PreviousTo),
		Timezone:        reportsTimezone,
		GrossSales:      metricPair(current.gross, previous.gross),
		Discounts:       metricPair(current.discounts, previous.discounts),
		NetSales:        metricPair(current.netSales, previous.netSales),
		Tax:             metricPair(current.tax, previous.tax),
		ServiceCharge:   metricPair(current.serviceCharge, previous.serviceCharge),
		Orders:          intMetricPair(current.orders, previous.orders),
		Covers:          intMetricPair(current.covers, previous.covers),
		AverageCheck:    metricPair(current.avgCheck, previous.avgCheck),
		TenderMix:       tender,
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Overview report",
		Data:    resp,
	})
}

// ─────────────────────────────────────────────────────────────────────────
// /admin/reports/v2/sales/daily
// ─────────────────────────────────────────────────────────────────────────

// GetDailySales returns one row per calendar day in the range. Days with no
// orders still appear as zero rows, so the chart and table never have gaps.
func (h *ReportsHandler) GetDailySales(c *gin.Context) {
	rng, err := parseReportsRange(c)
	if err != nil {
		reportsBadRequest(c, err)
		return
	}

	rows, err := h.db.Query(`
		WITH days AS (
			SELECT generate_series($1::date, $2::date, interval '1 day')::date AS d
		),
		agg AS (
			SELECT
				(created_at AT TIME ZONE $3)::date AS d,
				COUNT(*) AS orders,
				COALESCE(SUM(NULLIF(guest_count, 0)), 0) AS covers,
				COALESCE(SUM(subtotal), 0) AS gross,
				COALESCE(SUM(discount_amount), 0) AS discounts,
				COALESCE(SUM(total_amount - tax_amount), 0) AS net,
				COALESCE(SUM(tax_amount), 0) AS tax
			FROM orders
			WHERE status = 'completed'
			  AND (created_at AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date
			GROUP BY (created_at AT TIME ZONE $3)::date
		)
		SELECT
			days.d,
			COALESCE(agg.orders, 0),
			COALESCE(agg.covers, 0),
			COALESCE(agg.gross, 0),
			COALESCE(agg.discounts, 0),
			COALESCE(agg.net, 0),
			COALESCE(agg.tax, 0)
		FROM days
		LEFT JOIN agg ON agg.d = days.d
		ORDER BY days.d ASC
	`, rng.FromDate, rng.ToDate, reportsTimezone)
	if err != nil {
		reportsServerError(c, err)
		return
	}
	defer rows.Close()

	out := make([]models.DailySalesRow, 0, rng.DaysInclusive())
	for rows.Next() {
		var d time.Time
		var r models.DailySalesRow
		if err := rows.Scan(&d, &r.Orders, &r.Covers, &r.Gross, &r.Discounts, &r.Net, &r.Tax); err != nil {
			reportsServerError(c, err)
			return
		}
		r.Date = d.Format("2006-01-02")
		r.DateLabel = ddmmyyyy(d)
		out = append(out, r)
	}
	if err := rows.Err(); err != nil {
		reportsServerError(c, err)
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Daily sales report",
		Data:    out,
	})
}

// ─────────────────────────────────────────────────────────────────────────
// /admin/reports/v2/sales/hourly
// ─────────────────────────────────────────────────────────────────────────

// GetHourlySales returns two complementary shapes:
//   - series: one row per hour over the entire range (chart)
//   - heatmap: one row per (dow, hour-of-day) combo aggregated across days
func (h *ReportsHandler) GetHourlySales(c *gin.Context) {
	rng, err := parseReportsRange(c)
	if err != nil {
		reportsBadRequest(c, err)
		return
	}

	// Series — densified so empty hours render as zero (chart stays smooth).
	seriesRows, err := h.db.Query(`
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
				COALESCE(SUM(total_amount - tax_amount), 0) AS net
			FROM orders
			WHERE status = 'completed'
			  AND (created_at AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date
			GROUP BY date_trunc('hour', created_at AT TIME ZONE $3)
		)
		SELECT hours.h, COALESCE(agg.orders, 0), COALESCE(agg.net, 0)
		FROM hours
		LEFT JOIN agg ON agg.h_local = hours.h
		ORDER BY hours.h ASC
	`, rng.FromDate, rng.ToDate, reportsTimezone)
	if err != nil {
		reportsServerError(c, err)
		return
	}
	defer seriesRows.Close()

	series := make([]models.HourlySeriesPoint, 0)
	for seriesRows.Next() {
		var h time.Time
		var orders int
		var net float64
		if err := seriesRows.Scan(&h, &orders, &net); err != nil {
			reportsServerError(c, err)
			return
		}
		series = append(series, models.HourlySeriesPoint{
			HourStart:      h.Format(time.RFC3339),
			HourStartLabel: ddmmyyyyHHmm(h),
			Orders:         orders,
			Net:            net,
		})
	}
	if err := seriesRows.Err(); err != nil {
		reportsServerError(c, err)
		return
	}

	// Heatmap — densified to 7×24 = 168 cells regardless of data presence.
	heatmapRows, err := h.db.Query(`
		WITH grid AS (
			SELECT d.dow, h.hour
			FROM generate_series(0, 6) AS d(dow)
			CROSS JOIN generate_series(0, 23) AS h(hour)
		),
		agg AS (
			SELECT
				EXTRACT(DOW FROM (created_at AT TIME ZONE $3))::int AS dow,
				EXTRACT(HOUR FROM (created_at AT TIME ZONE $3))::int AS hour,
				COUNT(*) AS orders,
				COALESCE(SUM(total_amount - tax_amount), 0) AS net
			FROM orders
			WHERE status = 'completed'
			  AND (created_at AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date
			GROUP BY 1, 2
		)
		SELECT grid.dow, grid.hour, COALESCE(agg.orders, 0), COALESCE(agg.net, 0)
		FROM grid
		LEFT JOIN agg ON agg.dow = grid.dow AND agg.hour = grid.hour
		ORDER BY grid.dow, grid.hour
	`, rng.FromDate, rng.ToDate, reportsTimezone)
	if err != nil {
		reportsServerError(c, err)
		return
	}
	defer heatmapRows.Close()

	heatmap := make([]models.HourlyHeatmapCell, 0, 168)
	for heatmapRows.Next() {
		var cell models.HourlyHeatmapCell
		if err := heatmapRows.Scan(&cell.Dow, &cell.Hour, &cell.Orders, &cell.Net); err != nil {
			reportsServerError(c, err)
			return
		}
		heatmap = append(heatmap, cell)
	}
	if err := heatmapRows.Err(); err != nil {
		reportsServerError(c, err)
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Hourly sales report",
		Data: models.HourlySalesReport{
			Series:  series,
			Heatmap: heatmap,
		},
	})
}

// ─────────────────────────────────────────────────────────────────────────
// /admin/reports/v2/items
// ─────────────────────────────────────────────────────────────────────────

// GetItemSales returns item-wise sales within the range. Optional filters:
// `search` (case-insensitive substring on product name), `category_id`, and
// `sort` (qty|gross|net — default net). `limit` is capped at 1000.
func (h *ReportsHandler) GetItemSales(c *gin.Context) {
	rng, err := parseReportsRange(c)
	if err != nil {
		reportsBadRequest(c, err)
		return
	}
	search := strings.TrimSpace(c.Query("search"))
	categoryID := strings.TrimSpace(c.Query("category_id"))
	sortKey := c.DefaultQuery("sort", "net")
	switch sortKey {
	case "qty", "gross", "net":
	default:
		sortKey = "net"
	}
	limit := 1000
	if v, err := strconv.Atoi(c.Query("limit")); err == nil && v > 0 && v <= 1000 {
		limit = v
	}

	args := []interface{}{rng.FromDate, rng.ToDate, reportsTimezone}
	conds := []string{
		"o.status = 'completed'",
		"oi.status <> 'voided'",
		"(o.created_at AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date",
	}
	if search != "" {
		args = append(args, "%"+strings.ToLower(search)+"%")
		conds = append(conds, fmt.Sprintf("LOWER(p.name) LIKE $%d", len(args)))
	}
	if categoryID != "" {
		if _, err := uuid.Parse(categoryID); err == nil {
			args = append(args, categoryID)
			conds = append(conds, fmt.Sprintf("p.category_id = $%d", len(args)))
		}
	}

	orderBy := "net DESC"
	switch sortKey {
	case "qty":
		orderBy = "qty_sold DESC"
	case "gross":
		orderBy = "gross DESC"
	}

	args = append(args, limit)
	limitParam := fmt.Sprintf("$%d", len(args))

	q := fmt.Sprintf(`
		WITH item_agg AS (
			SELECT
				p.id            AS product_id,
				p.name          AS name,
				c.name          AS category,
				SUM(oi.quantity)                   AS qty_sold,
				SUM(oi.quantity * oi.unit_price)   AS gross,
				SUM(oi.total_price)                AS net,
				COUNT(DISTINCT o.id)               AS orders_count
			FROM order_items oi
			JOIN orders o    ON o.id = oi.order_id
			JOIN products p  ON p.id = oi.product_id
			LEFT JOIN categories c ON c.id = p.category_id
			WHERE %s
			GROUP BY p.id, p.name, c.name
		),
		totals AS (
			SELECT COALESCE(SUM(net), 0) AS grand_net FROM item_agg
		)
		SELECT
			ia.product_id,
			ia.name,
			ia.category,
			ia.qty_sold,
			ia.gross,
			ia.net,
			ia.orders_count,
			CASE WHEN totals.grand_net > 0
				THEN (ia.net / totals.grand_net) * 100
				ELSE 0
			END AS percent_of_net,
			CASE WHEN ia.qty_sold > 0
				THEN ia.gross / ia.qty_sold
				ELSE 0
			END AS avg_unit_price
		FROM item_agg ia
		CROSS JOIN totals
		ORDER BY %s
		LIMIT %s
	`, strings.Join(conds, " AND "), orderBy, limitParam)

	rows, err := h.db.Query(q, args...)
	if err != nil {
		reportsServerError(c, err)
		return
	}
	defer rows.Close()

	out := make([]models.ItemSalesRow, 0)
	for rows.Next() {
		var r models.ItemSalesRow
		var category sql.NullString
		if err := rows.Scan(&r.ProductID, &r.Name, &category, &r.QtySold, &r.Gross, &r.Net, &r.OrdersCount, &r.PercentOfNet, &r.AvgUnitPrice); err != nil {
			reportsServerError(c, err)
			return
		}
		if category.Valid {
			s := category.String
			r.Category = &s
		}
		out = append(out, r)
	}
	if err := rows.Err(); err != nil {
		reportsServerError(c, err)
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Item sales report",
		Data:    out,
	})
}

// ─────────────────────────────────────────────────────────────────────────
// /admin/reports/v2/tables
// ─────────────────────────────────────────────────────────────────────────

// GetTableSales aggregates parties, covers and net per dining table. Orders
// without a table_id are bucketed under a synthetic "Walk-in / Takeout" row
// so the totals on the page reconcile with the Overview KPIs.
func (h *ReportsHandler) GetTableSales(c *gin.Context) {
	rng, err := parseReportsRange(c)
	if err != nil {
		reportsBadRequest(c, err)
		return
	}

	rows, err := h.db.Query(`
		WITH range_orders AS (
			SELECT *
			FROM orders
			WHERE status = 'completed'
			  AND (created_at AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date
		),
		agg AS (
			SELECT
				ro.table_id,
				COUNT(*) AS parties,
				COALESCE(SUM(NULLIF(ro.guest_count, 0)), 0) AS covers,
				COALESCE(SUM(ro.total_amount - ro.tax_amount), 0) AS net_sales
			FROM range_orders ro
			GROUP BY ro.table_id
		)
		SELECT
			a.table_id,
			COALESCE(t.table_number, 'Walk-in / Takeout') AS table_number,
			t.location,
			t.zone,
			t.seating_capacity,
			a.parties,
			a.covers,
			a.net_sales
		FROM agg a
		LEFT JOIN dining_tables t ON t.id = a.table_id
		ORDER BY a.net_sales DESC
	`, rng.FromDate, rng.ToDate, reportsTimezone)
	if err != nil {
		reportsServerError(c, err)
		return
	}
	defer rows.Close()

	out := make([]models.TableSalesRow, 0)
	for rows.Next() {
		var r models.TableSalesRow
		var tableID sql.NullString
		var location, zone sql.NullString
		var seating sql.NullInt64
		if err := rows.Scan(&tableID, &r.TableNumber, &location, &zone, &seating, &r.Parties, &r.Covers, &r.NetSales); err != nil {
			reportsServerError(c, err)
			return
		}
		if tableID.Valid {
			if id, err := uuid.Parse(tableID.String); err == nil {
				r.TableID = &id
			}
		}
		if location.Valid {
			s := location.String
			r.Location = &s
		}
		if zone.Valid {
			s := zone.String
			r.Zone = &s
		}
		if seating.Valid {
			n := int(seating.Int64)
			r.SeatingCapacity = &n
		}
		if r.Parties > 0 {
			r.AvgCheck = r.NetSales / float64(r.Parties)
			r.AvgCoversPerParty = float64(r.Covers) / float64(r.Parties)
		}
		if r.Covers > 0 {
			r.RevenuePerCover = r.NetSales / float64(r.Covers)
		}
		out = append(out, r)
	}
	if err := rows.Err(); err != nil {
		reportsServerError(c, err)
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Table sales report",
		Data:    out,
	})
}

// ─────────────────────────────────────────────────────────────────────────
// /admin/reports/v2/party-size
// ─────────────────────────────────────────────────────────────────────────

type partyBucket struct {
	label string
	min   int
	max   int // 0 means "no upper bound"
}

var partyBuckets = []partyBucket{
	{"1 guest", 1, 1},
	{"2 guests", 2, 2},
	{"3-4 guests", 3, 4},
	{"5-6 guests", 5, 6},
	{"7-8 guests", 7, 8},
	{"9+ guests", 9, 0},
}

// GetPartySizeReport buckets dine-in parties by guest_count and reports
// covers, net, avg check, and revenue per cover for each bucket. Orders with
// guest_count = 0 (typically takeout) are excluded.
func (h *ReportsHandler) GetPartySizeReport(c *gin.Context) {
	rng, err := parseReportsRange(c)
	if err != nil {
		reportsBadRequest(c, err)
		return
	}

	rows, err := h.db.Query(`
		WITH range_orders AS (
			SELECT guest_count, total_amount, tax_amount
			FROM orders
			WHERE status = 'completed'
			  AND COALESCE(guest_count, 0) > 0
			  AND (created_at AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date
		)
		SELECT
			CASE
				WHEN guest_count = 1 THEN '1 guest'
				WHEN guest_count = 2 THEN '2 guests'
				WHEN guest_count BETWEEN 3 AND 4 THEN '3-4 guests'
				WHEN guest_count BETWEEN 5 AND 6 THEN '5-6 guests'
				WHEN guest_count BETWEEN 7 AND 8 THEN '7-8 guests'
				ELSE '9+ guests'
			END AS bucket,
			COUNT(*) AS parties,
			SUM(guest_count) AS covers,
			COALESCE(SUM(total_amount - tax_amount), 0) AS net_sales
		FROM range_orders
		GROUP BY bucket
	`, rng.FromDate, rng.ToDate, reportsTimezone)
	if err != nil {
		reportsServerError(c, err)
		return
	}
	defer rows.Close()

	byLabel := map[string]models.PartySizeRow{}
	for rows.Next() {
		var label string
		var parties, covers int
		var net float64
		if err := rows.Scan(&label, &parties, &covers, &net); err != nil {
			reportsServerError(c, err)
			return
		}
		row := models.PartySizeRow{
			Bucket:   label,
			Parties:  parties,
			Covers:   covers,
			NetSales: net,
		}
		if parties > 0 {
			row.AvgCheck = net / float64(parties)
		}
		if covers > 0 {
			row.RevenuePerCover = net / float64(covers)
		}
		byLabel[label] = row
	}
	if err := rows.Err(); err != nil {
		reportsServerError(c, err)
		return
	}

	out := make([]models.PartySizeRow, 0, len(partyBuckets))
	for _, b := range partyBuckets {
		row, ok := byLabel[b.label]
		if !ok {
			row = models.PartySizeRow{Bucket: b.label}
		}
		row.MinSize = b.min
		row.MaxSize = b.max
		out = append(out, row)
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Party size report",
		Data:    out,
	})
}

// ─────────────────────────────────────────────────────────────────────────
// /admin/reports/v2/orders  — Orders Browser tab
// ─────────────────────────────────────────────────────────────────────────

// GetOrdersBrowser returns a lightweight list of orders for ONE business day,
// designed for the Reports → Orders Browser tab so admins/managers can find a
// past order and reprint a PRA tax invoice. The window-eligibility for a
// reprint is computed inline (Asia/Karachi end-of-day + window_days) so the
// UI can show a disabled button with an exact expiry tooltip.
func (h *ReportsHandler) GetOrdersBrowser(c *gin.Context) {
	dateStr := c.Query("date")
	if dateStr == "" {
		dateStr = time.Now().UTC().Format("2006-01-02")
	}
	day, err := parseFlexibleDate(dateStr)
	if err != nil {
		reportsBadRequest(c, err)
		return
	}
	dayISO := day.Format("2006-01-02")

	search := strings.ToLower(strings.TrimSpace(c.Query("search")))
	praFilter := c.DefaultQuery("pra_filter", "all")

	_, windowDays := loadPraLatePrintPolicy(h.db)

	args := []interface{}{dayISO, reportsTimezone, windowDays}
	conds := []string{
		"(o.created_at AT TIME ZONE $2)::date = $1::date",
	}
	if search != "" {
		args = append(args, "%"+search+"%")
		// Match order number, table number, customer name, server name.
		conds = append(conds, fmt.Sprintf(`(
			LOWER(o.order_number) LIKE $%d
			OR LOWER(COALESCE(t.table_number, '')) LIKE $%d
			OR LOWER(COALESCE(o.customer_name, '')) LIKE $%d
			OR LOWER(COALESCE(u.first_name || ' ' || u.last_name, '')) LIKE $%d
			OR LOWER(COALESCE(u.username, '')) LIKE $%d
		)`, len(args), len(args), len(args), len(args), len(args)))
	}

	q := fmt.Sprintf(`
		SELECT
			o.id,
			o.order_number,
			t.table_number,
			TRIM(COALESCE(u.first_name || ' ' || u.last_name, u.username)) AS server_name,
			o.customer_name,
			COALESCE(o.guest_count, 0) AS guest_count,
			o.total_amount,
			o.checkout_payment_method,
			o.status,
			o.created_at,
			o.completed_at,
			COALESCE(o.pra_invoice_printed, false) AS pra_invoice_printed,
			o.pra_invoice_number,
			o.pra_invoice_printed_at,
			COALESCE(o.pra_invoice_reprint_count, 0) AS pra_invoice_reprint_count,
			o.pra_invoice_last_reprinted_at,
			TRIM(COALESCE(reprintedBy.first_name || ' ' || reprintedBy.last_name, reprintedBy.username)) AS pra_last_reprinted_by_name,
			(date_trunc('day', COALESCE(o.completed_at, o.created_at) AT TIME ZONE $2)
				+ make_interval(days => $3 + 1)
				- interval '1 microsecond')
				AT TIME ZONE $2 AS pra_window_expires_at
		FROM orders o
		LEFT JOIN dining_tables t ON t.id = o.table_id
		LEFT JOIN users u          ON u.id = o.user_id
		LEFT JOIN users reprintedBy ON reprintedBy.id = o.pra_invoice_last_reprinted_by
		WHERE %s
		ORDER BY o.created_at DESC
		LIMIT 500
	`, strings.Join(conds, " AND "))

	rows, err := h.db.Query(q, args...)
	if err != nil {
		reportsServerError(c, err)
		return
	}
	defer rows.Close()

	now := time.Now()
	all := make([]models.OrdersBrowserRow, 0)
	for rows.Next() {
		var r models.OrdersBrowserRow
		var (
			tableNumber sql.NullString
			serverName  sql.NullString
			customer    sql.NullString
			payment     sql.NullString
			completedAt sql.NullTime
			praNumber   sql.NullString
			praPrintAt  sql.NullTime
			lastReAt    sql.NullTime
			lastReBy    sql.NullString
			windowExp   sql.NullTime
		)
		if err := rows.Scan(
			&r.ID, &r.OrderNumber, &tableNumber, &serverName, &customer,
			&r.GuestCount, &r.TotalAmount, &payment, &r.Status,
			&r.CreatedAt, &completedAt,
			&r.PraInvoicePrinted, &praNumber, &praPrintAt,
			&r.PraInvoiceReprintCount, &lastReAt, &lastReBy,
			&windowExp,
		); err != nil {
			reportsServerError(c, err)
			return
		}
		if tableNumber.Valid && tableNumber.String != "" {
			s := tableNumber.String
			r.TableNumber = &s
		}
		if serverName.Valid && strings.TrimSpace(serverName.String) != "" {
			s := strings.TrimSpace(serverName.String)
			r.ServerName = &s
		}
		if customer.Valid && customer.String != "" {
			s := customer.String
			r.CustomerName = &s
		}
		if payment.Valid && payment.String != "" {
			s := payment.String
			r.CheckoutPaymentMethod = &s
		}
		r.CreatedAtLabel = ddmmyyyyHHmm(r.CreatedAt.In(reportsLocation))
		if completedAt.Valid {
			t := completedAt.Time.UTC()
			r.CompletedAt = &t
			lbl := ddmmyyyyHHmm(completedAt.Time.In(reportsLocation))
			r.CompletedAtLabel = &lbl
		}
		if praNumber.Valid && praNumber.String != "" {
			s := praNumber.String
			r.PraInvoiceNumber = &s
		}
		if praPrintAt.Valid {
			t := praPrintAt.Time.UTC()
			r.PraInvoicePrintedAt = &t
			lbl := ddmmyyyyHHmm(praPrintAt.Time.In(reportsLocation))
			r.PraInvoicePrintedAtLabel = &lbl
		}
		if lastReAt.Valid {
			t := lastReAt.Time.UTC()
			r.PraInvoiceLastReprintedAt = &t
		}
		if lastReBy.Valid && strings.TrimSpace(lastReBy.String) != "" {
			s := strings.TrimSpace(lastReBy.String)
			r.PraInvoiceLastReprintedByName = &s
		}
		if windowExp.Valid {
			exp := windowExp.Time.UTC()
			r.PraLateWindowExpiresAt = &exp
			secs := int64(exp.Sub(now).Seconds())
			r.PraLateWindowSecondsRemaining = &secs
		}

		// can_print_pra logic mirrors backend MarkPraInvoicePrinted enforcement
		// for non-overrides. The frontend renders the disabled state from this.
		canPrint := false
		var reason string
		switch {
		case r.Status != "completed":
			reason = "Order is not completed yet"
		case !r.PraInvoicePrinted:
			canPrint = true
		case windowExp.Valid && now.After(windowExp.Time):
			reason = fmt.Sprintf("Reprint window expired on %s", ddmmyyyyHHmm(windowExp.Time.In(reportsLocation)))
		default:
			canPrint = true
		}
		r.CanPrintPra = canPrint
		if !canPrint && reason != "" {
			r.CanPrintPraReason = &reason
		}

		all = append(all, r)
	}
	if err := rows.Err(); err != nil {
		reportsServerError(c, err)
		return
	}

	// Apply PRA filter in Go so it's easy to reason about and to avoid bloating
	// the SQL further. The list is already capped at 500 rows.
	filtered := make([]models.OrdersBrowserRow, 0, len(all))
	for _, r := range all {
		switch praFilter {
		case "printed":
			if r.PraInvoicePrinted {
				filtered = append(filtered, r)
			}
		case "not_printed":
			if !r.PraInvoicePrinted {
				filtered = append(filtered, r)
			}
		case "eligible":
			if r.CanPrintPra {
				filtered = append(filtered, r)
			}
		default:
			filtered = append(filtered, r)
		}
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Orders for day",
		Data: gin.H{
			"date":               dayISO,
			"date_label":         ddmmyyyy(day),
			"timezone":           reportsTimezone,
			"pra_window_days":    windowDays,
			"orders":             filtered,
		},
	})
}

// ─────────────────────────────────────────────────────────────────────────
// /admin/reports/v2/export — CSV export for any of the reports above
// ─────────────────────────────────────────────────────────────────────────

// ExportReport streams the requested report as a CSV file. PDF export is
// produced client-side by opening the report in a print-friendly window —
// keeps the backend dependency-free and gives operators full preview control
// before saving. Future work can add real server-rendered PDFs without
// breaking this contract.
func (h *ReportsHandler) ExportReport(c *gin.Context) {
	report := strings.TrimSpace(c.Query("report"))
	if report == "" {
		reportsBadRequest(c, fmt.Errorf("report query parameter is required"))
		return
	}
	rng, err := parseReportsRange(c)
	if err != nil {
		reportsBadRequest(c, err)
		return
	}

	brand := reportsBrand(h.db)
	slug := reportsBrandSlug(brand)
	filename := fmt.Sprintf("%s_%s_%s_to_%s.csv", slug, report, ddmmyyyy(rng.From), ddmmyyyy(rng.To))
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", `attachment; filename="`+filename+`"`)

	// UTF-8 BOM so Excel imports unicode (e.g. PKR symbol) cleanly.
	if _, err := c.Writer.Write([]byte{0xEF, 0xBB, 0xBF}); err != nil {
		return
	}
	w := csv.NewWriter(c.Writer)
	defer w.Flush()

	// Universal header rows — operator gets the date range + timezone in any export.
	_ = w.Write([]string{brand})
	_ = w.Write([]string{"Report", report})
	_ = w.Write([]string{"From", ddmmyyyy(rng.From), "To", ddmmyyyy(rng.To), "Timezone", reportsTimezone})
	_ = w.Write([]string{})

	switch report {
	case "daily_sales":
		err = h.exportDailySalesCSV(w, rng)
	case "items":
		err = h.exportItemSalesCSV(w, rng, c)
	case "tables":
		err = h.exportTableSalesCSV(w, rng)
	case "party_size":
		err = h.exportPartySizeCSV(w, rng)
	case "hourly":
		err = h.exportHourlySeriesCSV(w, rng)
	case "overview":
		err = h.exportOverviewCSV(w, rng)
	default:
		reportsBadRequest(c, fmt.Errorf("unknown report %q", report))
		return
	}
	if err != nil {
		// Headers may have been flushed already; we can't recover the response
		// status cleanly, but logging via the framework is enough.
		_ = w.Write([]string{"ERROR", err.Error()})
	}
}

func (h *ReportsHandler) exportDailySalesCSV(w *csv.Writer, rng reportsRange) error {
	rows, err := h.db.Query(`
		SELECT
			(o.created_at AT TIME ZONE $3)::date AS d,
			COUNT(*),
			COALESCE(SUM(NULLIF(o.guest_count, 0)), 0),
			COALESCE(SUM(o.subtotal), 0),
			COALESCE(SUM(o.discount_amount), 0),
			COALESCE(SUM(o.total_amount - o.tax_amount), 0),
			COALESCE(SUM(o.tax_amount), 0)
		FROM orders o
		WHERE o.status = 'completed'
		  AND (o.created_at AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date
		GROUP BY d
		ORDER BY d
	`, rng.FromDate, rng.ToDate, reportsTimezone)
	if err != nil {
		return err
	}
	defer rows.Close()
	_ = w.Write([]string{"Date", "Orders", "Covers", "Gross", "Discounts", "Net", "Tax"})
	for rows.Next() {
		var d time.Time
		var orders, covers int
		var gross, disc, net, tax float64
		if err := rows.Scan(&d, &orders, &covers, &gross, &disc, &net, &tax); err != nil {
			return err
		}
		_ = w.Write([]string{
			ddmmyyyy(d),
			strconv.Itoa(orders),
			strconv.Itoa(covers),
			strconv.FormatFloat(gross, 'f', 2, 64),
			strconv.FormatFloat(disc, 'f', 2, 64),
			strconv.FormatFloat(net, 'f', 2, 64),
			strconv.FormatFloat(tax, 'f', 2, 64),
		})
	}
	return rows.Err()
}

func (h *ReportsHandler) exportItemSalesCSV(w *csv.Writer, rng reportsRange, c *gin.Context) error {
	search := strings.TrimSpace(c.Query("search"))
	categoryID := strings.TrimSpace(c.Query("category_id"))

	args := []interface{}{rng.FromDate, rng.ToDate, reportsTimezone}
	conds := []string{
		"o.status = 'completed'",
		"oi.status <> 'voided'",
		"(o.created_at AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date",
	}
	if search != "" {
		args = append(args, "%"+strings.ToLower(search)+"%")
		conds = append(conds, fmt.Sprintf("LOWER(p.name) LIKE $%d", len(args)))
	}
	if categoryID != "" {
		if _, err := uuid.Parse(categoryID); err == nil {
			args = append(args, categoryID)
			conds = append(conds, fmt.Sprintf("p.category_id = $%d", len(args)))
		}
	}

	q := fmt.Sprintf(`
		SELECT p.name, c.name, SUM(oi.quantity), SUM(oi.quantity * oi.unit_price), SUM(oi.total_price), COUNT(DISTINCT o.id)
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		JOIN products p ON p.id = oi.product_id
		LEFT JOIN categories c ON c.id = p.category_id
		WHERE %s
		GROUP BY p.id, p.name, c.name
		ORDER BY SUM(oi.total_price) DESC
	`, strings.Join(conds, " AND "))

	rows, err := h.db.Query(q, args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	_ = w.Write([]string{"Item", "Category", "Qty Sold", "Gross", "Net", "Orders"})
	for rows.Next() {
		var name string
		var category sql.NullString
		var qty, orders int
		var gross, net float64
		if err := rows.Scan(&name, &category, &qty, &gross, &net, &orders); err != nil {
			return err
		}
		cat := ""
		if category.Valid {
			cat = category.String
		}
		_ = w.Write([]string{
			name,
			cat,
			strconv.Itoa(qty),
			strconv.FormatFloat(gross, 'f', 2, 64),
			strconv.FormatFloat(net, 'f', 2, 64),
			strconv.Itoa(orders),
		})
	}
	return rows.Err()
}

func (h *ReportsHandler) exportTableSalesCSV(w *csv.Writer, rng reportsRange) error {
	rows, err := h.db.Query(`
		SELECT
			COALESCE(t.table_number, 'Walk-in / Takeout'),
			COALESCE(t.location, ''),
			COALESCE(t.zone, ''),
			COALESCE(t.seating_capacity, 0),
			COUNT(*) AS parties,
			COALESCE(SUM(NULLIF(o.guest_count, 0)), 0) AS covers,
			COALESCE(SUM(o.total_amount - o.tax_amount), 0) AS net
		FROM orders o
		LEFT JOIN dining_tables t ON t.id = o.table_id
		WHERE o.status = 'completed'
		  AND (o.created_at AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date
		GROUP BY t.id, t.table_number, t.location, t.zone, t.seating_capacity
		ORDER BY net DESC
	`, rng.FromDate, rng.ToDate, reportsTimezone)
	if err != nil {
		return err
	}
	defer rows.Close()
	_ = w.Write([]string{"Table", "Location", "Zone", "Seating Capacity", "Parties", "Covers", "Net Sales", "Avg Check", "Avg Covers / Party", "Revenue / Cover"})
	for rows.Next() {
		var table, location, zone string
		var seating, parties, covers int
		var net float64
		if err := rows.Scan(&table, &location, &zone, &seating, &parties, &covers, &net); err != nil {
			return err
		}
		var avgCheck, avgCovers, revPerCover float64
		if parties > 0 {
			avgCheck = net / float64(parties)
			avgCovers = float64(covers) / float64(parties)
		}
		if covers > 0 {
			revPerCover = net / float64(covers)
		}
		_ = w.Write([]string{
			table, location, zone, strconv.Itoa(seating),
			strconv.Itoa(parties), strconv.Itoa(covers),
			strconv.FormatFloat(net, 'f', 2, 64),
			strconv.FormatFloat(avgCheck, 'f', 2, 64),
			strconv.FormatFloat(avgCovers, 'f', 2, 64),
			strconv.FormatFloat(revPerCover, 'f', 2, 64),
		})
	}
	return rows.Err()
}

func (h *ReportsHandler) exportPartySizeCSV(w *csv.Writer, rng reportsRange) error {
	rows, err := h.db.Query(`
		SELECT
			CASE
				WHEN guest_count = 1 THEN '1 guest'
				WHEN guest_count = 2 THEN '2 guests'
				WHEN guest_count BETWEEN 3 AND 4 THEN '3-4 guests'
				WHEN guest_count BETWEEN 5 AND 6 THEN '5-6 guests'
				WHEN guest_count BETWEEN 7 AND 8 THEN '7-8 guests'
				ELSE '9+ guests'
			END AS bucket,
			COUNT(*),
			SUM(guest_count),
			COALESCE(SUM(total_amount - tax_amount), 0)
		FROM orders
		WHERE status = 'completed'
		  AND COALESCE(guest_count, 0) > 0
		  AND (created_at AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date
		GROUP BY bucket
		ORDER BY MIN(guest_count)
	`, rng.FromDate, rng.ToDate, reportsTimezone)
	if err != nil {
		return err
	}
	defer rows.Close()
	_ = w.Write([]string{"Party Size", "Parties", "Covers", "Net Sales", "Avg Check", "Revenue / Cover"})
	for rows.Next() {
		var bucket string
		var parties, covers int
		var net float64
		if err := rows.Scan(&bucket, &parties, &covers, &net); err != nil {
			return err
		}
		var avg, rpc float64
		if parties > 0 {
			avg = net / float64(parties)
		}
		if covers > 0 {
			rpc = net / float64(covers)
		}
		_ = w.Write([]string{
			bucket,
			strconv.Itoa(parties),
			strconv.Itoa(covers),
			strconv.FormatFloat(net, 'f', 2, 64),
			strconv.FormatFloat(avg, 'f', 2, 64),
			strconv.FormatFloat(rpc, 'f', 2, 64),
		})
	}
	return rows.Err()
}

func (h *ReportsHandler) exportHourlySeriesCSV(w *csv.Writer, rng reportsRange) error {
	rows, err := h.db.Query(`
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
				COALESCE(SUM(total_amount - tax_amount), 0) AS net
			FROM orders
			WHERE status = 'completed'
			  AND (created_at AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date
			GROUP BY date_trunc('hour', created_at AT TIME ZONE $3)
		)
		SELECT hours.h, COALESCE(agg.orders, 0), COALESCE(agg.net, 0)
		FROM hours
		LEFT JOIN agg ON agg.h_local = hours.h
		ORDER BY hours.h ASC
	`, rng.FromDate, rng.ToDate, reportsTimezone)
	if err != nil {
		return err
	}
	defer rows.Close()
	_ = w.Write([]string{"Hour Start", "Orders", "Net Sales"})
	for rows.Next() {
		var h time.Time
		var orders int
		var net float64
		if err := rows.Scan(&h, &orders, &net); err != nil {
			return err
		}
		_ = w.Write([]string{
			ddmmyyyyHHmm(h),
			strconv.Itoa(orders),
			strconv.FormatFloat(net, 'f', 2, 64),
		})
	}
	return rows.Err()
}

func (h *ReportsHandler) exportOverviewCSV(w *csv.Writer, rng reportsRange) error {
	current, err := h.loadOverviewAggregates(rng.FromDate, rng.ToDate)
	if err != nil {
		return err
	}
	previous, err := h.loadOverviewAggregates(rng.PrevFromDate, rng.PrevToDate)
	if err != nil {
		return err
	}
	tender, err := h.loadTenderMix(rng.FromDate, rng.ToDate)
	if err != nil {
		return err
	}

	_ = w.Write([]string{"Metric", "Current", "Previous", "Delta"})
	rowF := func(label string, cur, prev float64) {
		_ = w.Write([]string{
			label,
			strconv.FormatFloat(cur, 'f', 2, 64),
			strconv.FormatFloat(prev, 'f', 2, 64),
			strconv.FormatFloat(cur-prev, 'f', 2, 64),
		})
	}
	rowI := func(label string, cur, prev int) {
		_ = w.Write([]string{
			label,
			strconv.Itoa(cur),
			strconv.Itoa(prev),
			strconv.Itoa(cur - prev),
		})
	}
	rowF("Gross Sales", current.gross, previous.gross)
	rowF("Discounts", current.discounts, previous.discounts)
	rowF("Net Sales", current.netSales, previous.netSales)
	rowF("Tax", current.tax, previous.tax)
	rowF("Service Charge", current.serviceCharge, previous.serviceCharge)
	rowI("Orders", current.orders, previous.orders)
	rowI("Covers", current.covers, previous.covers)
	rowF("Average Check", current.avgCheck, previous.avgCheck)

	_ = w.Write([]string{})
	_ = w.Write([]string{"Tender", "Amount", "Orders", "Pct"})
	for _, t := range tender {
		_ = w.Write([]string{
			t.Method,
			strconv.FormatFloat(t.Amount, 'f', 2, 64),
			strconv.Itoa(t.Count),
			strconv.FormatFloat(t.Pct, 'f', 2, 64),
		})
	}
	return nil
}
