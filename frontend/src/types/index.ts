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
  role: 'admin' | 'manager' | 'cashier' | 'kitchen' | 'server' | 'counter' | 'store_manager';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

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
  is_occupied: boolean;
  has_active_order?: boolean;
  created_at: string;
  updated_at: string;
}

// Order Types
export interface Order {
  id: string;
  order_number: string;
  table_id?: string;
  user_id?: string;
  customer_name?: string;
  order_type: 'dine_in' | 'takeout' | 'delivery';
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'served' | 'completed' | 'cancelled';
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  service_charge_amount?: number;
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
  order_type: 'dine_in' | 'takeout' | 'delivery';
  guest_count?: number;
  items: CreateOrderItem[];
  notes?: string;
  /** Assigned server for dine-in (counter flow); maps to order.user_id on server */
  assigned_server_id?: string;
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

// Dashboard Types
export interface DashboardStats {
  today_orders: number;
  today_revenue: number;
  active_orders: number;
  occupied_tables: number;
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
export type ExpenseCategory = 'inventory_purchase' | 'utilities' | 'rent' | 'salaries' | 'maintenance' | 'marketing' | 'supplies' | 'other';

export interface Expense {
  id: string;
  category: ExpenseCategory;
  amount: number;
  description?: string;
  reference_type?: string;
  reference_id?: string;
  expense_date: string;
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

// Filter and Query Types
export interface OrderFilters {
  status?: string;
  order_type?: string;
  page?: number;
  per_page?: number;
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

