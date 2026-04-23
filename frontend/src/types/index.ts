// API Response Types
export interface APIResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T = any> {
  success: boolean;
  message: string;
  data: T;
  meta: MetaData;
}

export interface MetaData {
  current_page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

// User Types
export interface User {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: 'admin' | 'manager' | 'inventory_manager' | 'counter' | 'kitchen';
  is_active: boolean;
  created_at: string;
  updated_at: string;
  /** HTTPS image URL or data:image/* from a small local upload */
  profile_image_url?: string | null;
}

/** username may be the staff username or their email (same JSON field for backward compatibility). */
export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

// Category Types
export interface Category {
  id: string;
  name: string;
  description?: string;
  color?: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  /** Kitchen KOT routing — from category_station_map */
  kitchen_station_id?: string | null;
  kitchen_station_name?: string | null;
  kitchen_station_output_type?: 'kds' | 'printer' | null;
}

// Product Types
export interface Product {
  id: string;
  category_id?: string;
  name: string;
  description?: string;
  price: number;
  image_url?: string;
  barcode?: string;
  sku?: string;
  is_available: boolean;
  preparation_time: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  category?: Category;
}

// Table Types
export interface DiningTable {
  id: string;
  table_number: string;
  seating_capacity: number;
  location?: string;
  zone?: string;
  is_occupied: boolean;
  has_active_order?: boolean;
  map_x?: number;
  map_y?: number;
  map_w?: number;
  map_h?: number;
  map_rotation?: number;
  shape?: 'rectangle' | 'square' | 'round' | string;
  created_at: string;
  updated_at: string;
  /** Latest order created_at for this table (non-cancelled orders); server-computed */
  last_booked_at?: string | null;
}

// Order Types
export interface Order {
  id: string;
  order_number: string;
  table_id?: string;
  user_id?: string;
  customer_id?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  guest_birthday?: string;
  table_opened_at?: string;
  is_open_tab?: boolean;
  order_type: 'dine_in' | 'takeout' | 'delivery';
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'served' | 'completed' | 'cancelled';
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  /**
   * Discount percent (0–100) when the discount was entered as a percentage of
   * the subtotal; null/undefined when it was entered as a flat amount or
   * there is no discount. Receipts render "Discount (10%)" when this is set.
   */
  discount_percent?: number | null;
  service_charge_amount?: number;
  /** Flat delivery fee for delivery orders; not part of F&B tax base. */
  delivery_fee_amount?: number;
  total_amount: number;
  checkout_payment_method?: 'cash' | 'card' | 'online';
  guest_count?: number;
  /** First KOT fire time — drives KDS timer */
  kot_first_sent_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  served_at?: string;
  completed_at?: string;
  /** True once a PRA tax invoice slip has been printed for this order. */
  pra_invoice_printed?: boolean;
  /** Invoice number printed on the PRA slip, if any; typically empty during rollout. */
  pra_invoice_number?: string | null;
  /** Timestamp (ISO) when the PRA slip was last printed. */
  pra_invoice_printed_at?: string;
  table?: DiningTable;
  user?: User;
  items?: OrderItem[];
  payments?: Payment[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  special_instructions?: string;
  /** >1 means item came from a subsequent KOT fire (delta) */
  kot_fire_generation?: number;
  kot_sent_at?: string;
  status: 'draft' | 'sent' | 'pending' | 'preparing' | 'ready' | 'served' | 'voided';
  created_at: string;
  updated_at: string;
  product?: Product;
  notes?: string; // Alternative field name for special instructions
}

export interface CreateOrderRequest {
  table_id?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  guest_birthday?: string;
  order_type: 'dine_in' | 'takeout' | 'delivery';
  guest_count?: number;
  items: CreateOrderItem[];
  notes?: string;
  /** Assigned server for dine-in (counter flow); maps to order.user_id on server */
  assigned_server_id?: string;
}

/** Counter: open dine-in tab (order number + empty bill) after table session modal. */
export interface OpenCounterTableTabRequest {
  table_id: string;
  /** Omit or 0 if unknown — editable on the rail until checkout closes */
  guest_count?: number;
  /** Omit if no server yet — editable on the rail until checkout closes */
  assigned_server_id?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  guest_birthday?: string;
}

/** Counter: party size + assigned server on an open dine-in order */
export interface UpdateCounterOrderServiceRequest {
  guest_count: number;
  /** Empty string clears assigned server */
  assigned_server_id: string;
}

export interface CreateOrderItem {
  product_id: string;
  quantity: number;
  special_instructions?: string;
}

export interface UpdateOrderStatusRequest {
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'served' | 'completed' | 'cancelled';
  notes?: string;
}

// Payment Types
export interface Payment {
  id: string;
  order_id: string;
  payment_method: 'cash' | 'credit_card' | 'debit_card' | 'digital_wallet' | 'online';
  amount: number;
  reference_number?: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  processed_by?: string;
  processed_at?: string;
  created_at: string;
  processed_by_user?: User;
}

export interface ProcessPaymentRequest {
  payment_method: 'cash' | 'credit_card' | 'debit_card' | 'digital_wallet' | 'online';
  amount: number;
  reference_number?: string;
}

/** Matches backend pricing.Settings (fractions 0–1) */
export interface PricingSettings {
  tax_rate_cash: number;
  tax_rate_card: number;
  tax_rate_online: number;
  service_charge_rate: number;
}

export interface CounterServer {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
}

export interface PaymentSummary {
  order_id: string;
  total_amount: number;
  total_paid: number;
  pending_amount: number;
  remaining_amount: number;
  is_fully_paid: boolean;
  payment_count: number;
}

// Cart Types (Frontend Only)
export interface CartItem {
  product: Product;
  quantity: number;
  special_instructions?: string;
}

export interface Cart {
  items: CartItem[];
  subtotal: number;
  tax_amount: number;
  total_amount: number;
}

// Dashboard Types (legacy /admin/dashboard/stats — kept for backward compat)
export interface DashboardStats {
  today_orders: number;
  /** Total orders placed today, any status. Filled by the new backend. */
  today_orders_placed?: number;
  today_revenue: number;
  active_orders: number;
  occupied_tables: number;
}

// ───────────────────────────────────────────────────────────────────────────
// Dashboard v2 — typed payloads mirroring backend/internal/models/dashboard.go.
// All money is currency-major units. All *_label fields are pre-formatted
// DD-MM-YYYY (or HH:mm for sub-day buckets) — never reformat on the client.
// ───────────────────────────────────────────────────────────────────────────

export type DashboardPeriod =
  | 'today'
  | 'yesterday'
  | '7d'
  | '30d'
  | 'cw'
  | 'cm'
  | 'custom';

export interface DashboardOverview {
  period: DashboardPeriod;
  from: string;
  to: string;
  from_label: string;
  to_label: string;
  previous_from: string;
  previous_to: string;
  previous_from_label: string;
  previous_to_label: string;
  timezone: string;
  net_sales: MetricPair;
  gross_sales: MetricPair;
  tax: MetricPair;
  discounts: MetricPair;
  /** Completed orders only — matches the revenue denominator. */
  orders: IntMetricPair;
  /** All orders placed in the window (any status). Useful drop-off signal. */
  orders_placed: IntMetricPair;
  covers: IntMetricPair;
  avg_ticket: MetricPair;
  expenses: MetricPair;
  net_profit: MetricPair;
}

export interface LivePulse {
  active_orders: number;
  in_kitchen: number;
  ready_to_serve: number;
  /** Orders in active states but past the kitchen.stale_minutes window
   *  — hidden from the KDS, surfaced separately so they don't pollute the
   *  live ops gauges or kitchen-wait stats. */
  stale_orders_count: number;
  stale_threshold_minutes: number;
  occupied_tables: number;
  total_tables: number;
  avg_kitchen_wait_seconds: number;
  longest_running_seconds: number;
  voids_today_count: number;
  voids_today_amount: number;
  orders_today_count: number;
  revenue_today_so_far: number;
  drawer_reconciled: boolean;
  drawer_expected_cash: number;
  generated_at: string;
}

export interface SalesBucket {
  bucket_start: string;
  /** Server-formatted: "14:00" for hour, "18-04" for day, "Apr 26" for month. */
  label: string;
  orders: number;
  gross: number;
  tax: number;
  net: number;
}

export interface SalesTimeseries {
  period: DashboardPeriod;
  granularity: 'hour' | 'day' | 'month';
  from: string;
  to: string;
  current: SalesBucket[];
  prior: SalesBucket[];
}

export interface DashboardTopItem {
  product_id: string;
  name: string;
  category?: string | null;
  qty_sold: number;
  revenue: number;
  percent_of_net: number;
}

export interface PaymentMixSlice {
  method: string;
  label: string;
  count: number;
  amount: number;
  pct: number;
}

export interface OrderTypeMixSlice {
  order_type: string;
  label: string;
  count: number;
  amount: number;
  pct: number;
}

export type DashboardAlertSeverity = 'info' | 'warning' | 'critical';
export type DashboardAlertKind =
  | 'low_stock'
  | 'void_spike'
  | 'long_order'
  | 'stale_orders'
  | 'drawer_unreconciled'
  | 'no_sales';

export interface DashboardAlert {
  id: string;
  severity: DashboardAlertSeverity;
  kind: DashboardAlertKind;
  title: string;
  detail: string;
  /** Admin section id to navigate to when the user clicks the alert. */
  action_to?: string;
}

export type DashboardEventType =
  | 'order_created'
  | 'order_updated'
  | 'order_completed'
  | 'order_cancelled'
  | 'order_voided'
  | 'payment'
  | 'table_changed';

/** Activity feed entry derived from an SSE DashboardEvent. */
export interface DashboardActivityEntry {
  id: string;
  type: DashboardEventType;
  title: string;
  detail: string;
  amount?: number;
  order_id?: string;
  order_number?: string;
  /** Local ISO timestamp. */
  at: string;
}

export interface SalesReportItem {
  date: string;
  order_count: number;
  revenue: number;
}

export interface OrdersReportItem {
  status: string;
  count: number;
  avg_amount: number;
}

// ───────────────────────────────────────────────────────────────────────────
// Reports v2 — payload types mirroring backend/internal/models/models.go.
// ───────────────────────────────────────────────────────────────────────────

export interface MetricPair {
  current: number;
  previous: number;
  delta: number;
  /** null when previous is 0 — the UI should render "—" rather than "+∞%". */
  pct?: number | null;
}

export interface IntMetricPair {
  current: number;
  previous: number;
  delta: number;
  pct?: number | null;
}

export interface TenderMixRow {
  method: string;
  amount: number;
  count: number;
  pct: number;
}

export interface OverviewReport {
  from: string;
  to: string;
  from_label: string;
  to_label: string;
  previous_from: string;
  previous_to: string;
  previous_from_label: string;
  previous_to_label: string;
  timezone: string;
  gross_sales: MetricPair;
  discounts: MetricPair;
  net_sales: MetricPair;
  tax: MetricPair;
  service_charge: MetricPair;
  orders: IntMetricPair;
  covers: IntMetricPair;
  average_check: MetricPair;
  tender_mix: TenderMixRow[];
}

export interface DailySalesRow {
  date: string;
  date_label: string;
  orders: number;
  covers: number;
  gross: number;
  discounts: number;
  net: number;
  tax: number;
}

export interface HourlySeriesPoint {
  hour_start: string;
  hour_start_label: string;
  orders: number;
  net: number;
}

export interface HourlyHeatmapCell {
  dow: number;   // 0=Sunday … 6=Saturday
  hour: number;  // 0..23
  orders: number;
  net: number;
}

export interface HourlySalesReport {
  series: HourlySeriesPoint[];
  heatmap: HourlyHeatmapCell[];
}

export interface ItemSalesRow {
  product_id: string;
  name: string;
  category?: string | null;
  qty_sold: number;
  gross: number;
  net: number;
  orders_count: number;
  percent_of_net: number;
  avg_unit_price: number;
}

export interface TableSalesRow {
  table_id?: string | null;
  table_number: string;
  location?: string | null;
  zone?: string | null;
  seating_capacity?: number | null;
  parties: number;
  covers: number;
  net_sales: number;
  avg_check: number;
  avg_covers_per_party: number;
  revenue_per_cover: number;
}

export interface PartySizeRow {
  bucket: string;
  min_size: number;
  /** 0 means "no upper bound" (e.g. 9+ guests). */
  max_size: number;
  parties: number;
  covers: number;
  net_sales: number;
  avg_check: number;
  revenue_per_cover: number;
}

export interface OrdersBrowserRow {
  id: string;
  order_number: string;
  table_number?: string | null;
  server_name?: string | null;
  customer_name?: string | null;
  guest_count: number;
  total_amount: number;
  checkout_payment_method?: 'cash' | 'card' | 'online' | string | null;
  status: string;
  created_at: string;
  created_at_label: string;
  completed_at?: string | null;
  completed_at_label?: string | null;
  pra_invoice_printed: boolean;
  pra_invoice_number?: string | null;
  pra_invoice_printed_at?: string | null;
  pra_invoice_printed_at_label?: string | null;
  pra_invoice_reprint_count: number;
  pra_invoice_last_reprinted_at?: string | null;
  pra_invoice_last_reprinted_by_name?: string | null;
  pra_late_window_expires_at?: string | null;
  pra_late_window_seconds_remaining?: number | null;
  can_print_pra: boolean;
  can_print_pra_reason?: string | null;
}

export interface OrdersBrowserResponse {
  date: string;
  date_label: string;
  timezone: string;
  pra_window_days: number;
  orders: OrdersBrowserRow[];
}

export type ReportsExportId =
  | 'overview'
  | 'daily_sales'
  | 'hourly'
  | 'items'
  | 'tables'
  | 'party_size';

// Kitchen Types
export interface KitchenOrder {
  id: string;
  order_number: string;
  table_id?: string;
  table_number?: string;
  order_type: string;
  status: string;
  customer_name?: string;
  created_at: string;
  items?: OrderItem[];
}

// Table Status Types
export interface TableStatus {
  total_tables: number;
  occupied_tables: number;
  available_tables: number;
  occupancy_rate: number;
  by_location: LocationStats[];
}

export interface LocationStats {
  location: string;
  total_tables: number;
  occupied_tables: number;
  available_tables: number;
  occupancy_rate: number;
}

// Store Inventory Types
export interface StockCategory {
  id: string;
  name: string;
  description?: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  item_count?: number;
}

export interface StockItem {
  id: string;
  category_id?: string;
  name: string;
  unit: string;
  quantity_on_hand: number;
  reorder_level: number;
  default_unit_cost?: number;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  category?: StockCategory;
  /** Next expiry among open lots (YYYY-MM-DD), when tracked */
  earliest_expiry?: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact_name?: string;
  phone?: string;
  email?: string;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderSummary {
  id: string;
  supplier_id: string;
  supplier_name: string;
  status: string;
  expected_date?: string;
  notes?: string;
  created_at: string;
  total_ordered_qty: number;
}

export interface PurchaseOrderLine {
  id: string;
  stock_item_id: string;
  item_name: string;
  unit: string;
  quantity_ordered: number;
  unit_cost?: number;
  quantity_received: number;
}

export interface PurchaseOrderDetail {
  id: string;
  status: string;
  supplier_id: string;
  supplier_name: string;
  expected_date?: string;
  notes?: string;
  created_at: string;
  lines: PurchaseOrderLine[];
}

export interface StockMovement {
  id: string;
  stock_item_id: string;
  movement_type: 'purchase' | 'issue' | 'adjustment';
  quantity: number;
  unit_cost?: number;
  total_cost?: number;
  issued_to_user_id?: string;
  created_by?: string;
  note?: string;
  created_at: string;
  item_name?: string;
  item_unit?: string;
  issued_to_name?: string;
  created_by_name?: string;
  /** Present when a purchase was reversed (ledger row kept for audit) */
  voided_at?: string;
  void_reason?: string;
  /** Server: lot fully intact — void or cost correction allowed */
  purchase_can_void?: boolean;
}

/** Append-only row from GET /store/inventory-activity */
export interface InventoryActivityEntry {
  id: string;
  created_at: string;
  actor_id?: string;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  summary: string;
  metadata?: Record<string, unknown>;
}

export interface StockAlert {
  id: string;
  name: string;
  unit: string;
  quantity_on_hand: number;
  reorder_level: number;
  category_name: string;
}

export interface UserBrief {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
}

export interface StockSummary {
  overview: {
    total_items: number;
    total_value: number;
    low_stock_count: number;
  };
  categories: {
    category_name: string;
    total_items: number;
    total_value: number;
    low_stock_count: number;
  }[];
  weekly_usage: {
    week: string;
    purchase_qty: number;
    issue_qty: number;
    purchase_cost: number;
  }[];
}

export interface AdvancedStockReport {
  kpis: {
    total_stock_value: number;
    total_waste_value: number;
    turnover_rate: number;
    /** Sum of ABS(issue qty) × default unit cost in the selected period */
    issued_value_period?: number;
    /** Active items at or below reorder level */
    low_stock_count?: number;
    /** Days used for period filters (from query param, clamped server-side) */
    period_days?: number;
    /** Estimated days of stock at average daily issued-value burn; null if no issues in period */
    days_cover_estimate?: number | null;
    /** Waste value as % of issued value in period; null if no issues */
    waste_pct_of_issued?: number | null;
  };
  category_values: { name: string; value: number }[] | null;
  trends: { week: string; purchase_cost: number; issued_qty: number }[] | null;
  variance: {
    item_id: string;
    item_name: string;
    unit: string;
    category: string;
    starting_stock: number;
    purchased: number;
    issued: number;
    /** Net quantity from adjustment movements in the period (signed: +in, −out) */
    adjustment_net: number;
    actual_on_hand: number;
    expected: number;
    variance: number;
    unit_cost: number;
  }[] | null;
  waste: {
    item_name: string;
    category: string;
    unit: string;
    qty_wasted: number;
    reason: string;
    lost_value: number;
    date: string;
  }[] | null;
}

// Expense Types
/** Stored on each expense row; must match an `expense_category_defs.slug` (active) when creating/updating. */
export type ExpenseCategory = string;

/** Admin-managed catalog row (GET/POST/PUT/DELETE `/admin/expense-category-definitions`). */
export interface ExpenseCategoryDefinition {
  id: string;
  slug: string;
  label: string;
  color: string;
  sort_order: number;
  is_system: boolean;
  is_active: boolean;
}

export interface Expense {
  id: string;
  category: ExpenseCategory;
  amount: number;
  description?: string;
  reference_type?: string;
  reference_id?: string;
  expense_date: string;
  /** When the expense was recorded (use for ledger date+time display). */
  recorded_at?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  created_by_name?: string;
}

export interface DailyClosing {
  id: string;
  closing_date: string;
  total_sales: number;
  total_tax: number;
  total_orders: number;
  cash_sales: number;
  card_sales: number;
  digital_sales: number;
  total_expenses: number;
  net_profit: number;
  opening_cash: number;
  expected_cash: number;
  actual_cash?: number;
  cash_difference?: number;
  notes?: string;
  closed_by?: string;
  created_at: string;
  closed_by_name?: string;
}

export interface PnLRow {
  period: string;
  revenue: number;
  tax: number;
  orders: number;
  expenses: number;
  net_profit: number;
}

export interface PnLReport {
  period: string;
  from: string;
  to: string;
  rows: PnLRow[];
  summary: {
    total_revenue: number;
    total_tax: number;
    total_orders: number;
    total_expenses: number;
    net_profit: number;
  };
  expense_breakdown: { category: string; total: number }[];
}

export interface CurrentDayStatus {
  is_closed: boolean;
  date: string;
  total_sales: number;
  total_tax: number;
  total_orders: number;
  cash_sales: number;
  card_sales: number;
  digital_sales: number;
  total_expenses: number;
  net_profit: number;
  expense_categories?: { category: string; total: number }[];
}

export interface ExpenseSummary {
  categories: { category: string; count: number; total: number }[];
  grand_total: number;
  from: string;
  to: string;
}

/** GET /admin/reports/expense-intelligence — analytics for Expenses Intelligence tab */
export interface ExpenseIntelligenceKpis {
  total_sales: number;
  total_tax: number;
  total_orders: number;
  total_expenses: number;
  net_profit: number;
  expense_ratio: number;
  inventory_spend: number;
  inventory_to_sales_ratio: number;
  manual_expense_count: number;
  auto_linked_expense_count: number;
  prior_period_sales: number;
  prior_period_expenses: number;
  sales_change_pct: number;
  expenses_change_pct: number;
}

export interface ExpenseIntelligenceDayPoint {
  date: string;
  sales: number;
  expenses: number;
  net: number;
}

export interface ExpenseIntelligenceCategoryMix {
  category: string;
  total: number;
  pct: number;
}

export interface ExpenseIntelligenceCashStats {
  days_with_closing: number;
  avg_cash_difference: number;
  total_abs_cash_variance: number;
}

export interface ExpenseIntelligenceReport {
  period_days: number;
  from: string;
  to: string;
  kpis: ExpenseIntelligenceKpis;
  daily_trend: ExpenseIntelligenceDayPoint[];
  category_mix: ExpenseIntelligenceCategoryMix[];
  cash_closing_stats: ExpenseIntelligenceCashStats;
}

// Filter and Query Types
export interface OrderFilters {
  status?: string;
  order_type?: string;
  page?: number;
  per_page?: number;
  /** Inclusive YYYY-MM-DD (server date on `orders.created_at`) */
  date_from?: string;
  /** Inclusive YYYY-MM-DD */
  date_to?: string;
}

/** Counter: update guest / CRM fields on an open order */
export interface UpdateCounterOrderGuestRequest {
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  guest_birthday?: string;
}

export interface ProductFilters {
  category_id?: string;
  available?: boolean;
  search?: string;
  page?: number;
  per_page?: number;
}

export interface TableFilters {
  location?: string;
  occupied_only?: boolean;
  available_only?: boolean;
}

// KOT / Station Types
export interface KitchenStation {
  id: string;
  name: string;
  output_type: 'kds' | 'printer';
  /** Thermal slip: print at station vs checkout counter (hand off) */
  print_location?: 'kitchen' | 'counter';
  is_active: boolean;
  sort_order: number;
  created_at: string;
  category_ids?: string[];
}

export interface VoidLogEntry {
  id: string;
  order_id?: string;
  order_item_id?: string;
  voided_by?: string;
  authorized_by?: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  reason?: string;
  created_at: string;
  order_number?: string;
  voided_by_name?: string;
  authorized_name?: string;
}

export interface StationKOT {
  station_id: string;
  station_name: string;
  output_type: 'kds' | 'printer';
  print_location?: 'kitchen' | 'counter';
  payload: any;
}

export interface FireKOTResponse {
  kots: StationKOT[];
}

