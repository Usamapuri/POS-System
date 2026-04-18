package models

import "time"

// ────────────────────────────────────────────────────────────────────────────
// Dashboard payload types — shared with the frontend.
//
// Design rules (mirrors reports v2):
//   1. All money is currency-major units (PKR).
//   2. All dates are computed in BUSINESS_TIMEZONE on the server; every row
//      that contains a timestamp also carries a pre-formatted *_label so the
//      UI never has to reformat.
//   3. KPI tiles use MetricPair / IntMetricPair from models.go for current vs
//      previous-period comparison so deltas are always real, never hardcoded.
// ────────────────────────────────────────────────────────────────────────────

// DashboardOverview powers the KPI hero row + revenue/profit panel.
type DashboardOverview struct {
	Period          string         `json:"period"`              // canonical period id (today/yesterday/7d/30d/cw/cm/custom)
	From            string         `json:"from"`                // ISO YYYY-MM-DD
	To              string         `json:"to"`                  // ISO YYYY-MM-DD
	FromLabel       string         `json:"from_label"`          // DD-MM-YYYY
	ToLabel         string         `json:"to_label"`            // DD-MM-YYYY
	PreviousFrom    string         `json:"previous_from"`
	PreviousTo      string         `json:"previous_to"`
	PreviousFromLbl string         `json:"previous_from_label"`
	PreviousToLbl   string         `json:"previous_to_label"`
	Timezone        string         `json:"timezone"`

	// Headline KPIs (with prior-period comparison).
	NetSales     MetricPair    `json:"net_sales"`
	GrossSales   MetricPair    `json:"gross_sales"`
	Tax          MetricPair    `json:"tax"`
	Discounts    MetricPair    `json:"discounts"`
	Orders       IntMetricPair `json:"orders"`        // completed orders
	OrdersPlaced IntMetricPair `json:"orders_placed"` // all orders, any status
	Covers       IntMetricPair `json:"covers"`
	AvgTicket    MetricPair    `json:"avg_ticket"`

	// Profitability — expenses are scoped to the period as well so the panel
	// mirrors the operator's mental model ("net profit for what I'm looking at").
	Expenses  MetricPair `json:"expenses"`
	NetProfit MetricPair `json:"net_profit"`
}

// LivePulse is a real-time snapshot of operational state. It is intentionally
// cheap to compute so it can be polled every 15-30s and pushed via SSE.
//
// Counts are scoped to match the kitchen display's view of "live" orders:
// in-flight statuses (confirmed/preparing/ready) AND created within the
// kitchen.stale_minutes window. Anything older is reported separately as
// `stale_orders_count` so operators can spot stuck tickets without those
// rows polluting the live ops gauges.
type LivePulse struct {
	ActiveOrders          int     `json:"active_orders"`         // matches kitchen display
	InKitchen             int     `json:"in_kitchen"`            // confirmed + preparing, fired
	ReadyToServe          int     `json:"ready_to_serve"`        // status='ready', not yet served
	StaleOrdersCount      int     `json:"stale_orders_count"`    // active-status but past stale threshold
	StaleThresholdMinutes int     `json:"stale_threshold_minutes"`
	OccupiedTables        int     `json:"occupied_tables"`
	TotalTables           int     `json:"total_tables"`
	AvgKitchenWaitSeconds int     `json:"avg_kitchen_wait_seconds"` // non-stale running orders only
	LongestRunningSeconds int     `json:"longest_running_seconds"`  // single longest non-stale order
	VoidsTodayCount       int     `json:"voids_today_count"`
	VoidsTodayAmount      float64 `json:"voids_today_amount"`
	OrdersTodayCount      int     `json:"orders_today_count"`
	RevenueTodaySoFar     float64 `json:"revenue_today_so_far"`
	DrawerReconciled      bool    `json:"drawer_reconciled"`
	DrawerExpectedCash    float64 `json:"drawer_expected_cash"`
	GeneratedAt           string  `json:"generated_at"` // DD-MM-YYYY HH:mm:ss
}

// SalesBucket is one bar/point on the sales timeseries. Label is server-formatted.
type SalesBucket struct {
	BucketStart time.Time `json:"bucket_start"`
	Label       string    `json:"label"` // hour: "14:00"; day: "18-04"; month: "Apr 26"
	Orders      int       `json:"orders"`
	Gross       float64   `json:"gross"`
	Tax         float64   `json:"tax"`
	Net         float64   `json:"net"`
}

// SalesTimeseries powers the hourly/daily chart with a comparison overlay.
type SalesTimeseries struct {
	Period      string        `json:"period"`
	Granularity string        `json:"granularity"` // "hour" | "day" | "month"
	From        string        `json:"from"`
	To          string        `json:"to"`
	Current     []SalesBucket `json:"current"`
	Prior       []SalesBucket `json:"prior"` // same number of buckets, prior equal-length window
}

// DashboardTopItem is one row of the top-sellers list.
type DashboardTopItem struct {
	ProductID    string  `json:"product_id"`
	Name         string  `json:"name"`
	Category     *string `json:"category,omitempty"`
	QtySold      int     `json:"qty_sold"`
	Revenue      float64 `json:"revenue"`
	PercentOfNet float64 `json:"percent_of_net"`
}

// PaymentMixSlice is one slice of the payment-method donut.
type PaymentMixSlice struct {
	Method string  `json:"method"` // raw method id (cash, credit_card, debit_card, digital_wallet, online)
	Label  string  `json:"label"`  // human label ("Cash", "Card", "Digital Wallet", "Online")
	Count  int     `json:"count"`
	Amount float64 `json:"amount"`
	Pct    float64 `json:"pct"`
}

// OrderTypeMixSlice is one slice of the order-type bar.
type OrderTypeMixSlice struct {
	OrderType string  `json:"order_type"`
	Label     string  `json:"label"`
	Count     int     `json:"count"`
	Amount    float64 `json:"amount"`
	Pct       float64 `json:"pct"`
}

// DashboardAlert is a single actionable alert in the alerts panel.
type DashboardAlert struct {
	ID       string `json:"id"`
	Severity string `json:"severity"` // "info" | "warning" | "critical"
	Kind     string `json:"kind"`     // "low_stock" | "void_spike" | "long_order" | "drawer_unreconciled" | "no_sales"
	Title    string `json:"title"`
	Detail   string `json:"detail"`
	ActionTo string `json:"action_to,omitempty"` // admin section id, e.g. "inventory", "void-log"
}

// ActivityEvent is an entry in the live activity feed.
type ActivityEvent struct {
	ID        string    `json:"id"`
	Kind      string    `json:"kind"` // "order_created" | "order_completed" | "payment" | "void"
	Title     string    `json:"title"`
	Detail    string    `json:"detail"`
	Amount    float64   `json:"amount,omitempty"`
	At        time.Time `json:"at"`
	AtLabel   string    `json:"at_label"` // HH:mm:ss
}

// DashboardEvent is the envelope sent over the SSE stream.
type DashboardEvent struct {
	Type    string      `json:"type"` // "live" | "alert" | "activity" | "ready" | "ping"
	Payload interface{} `json:"payload,omitempty"`
	At      time.Time   `json:"at"`
}
