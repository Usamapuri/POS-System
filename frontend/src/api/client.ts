import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import type {
  APIResponse,
  PaginatedResponse,
  LoginRequest,
  LoginResponse,
  User,
  Product,
  Category,
  DiningTable,
  Order,
  Payment,
  CreateOrderRequest,
  OpenCounterTableTabRequest,
  UpdateOrderStatusRequest,
  ProcessPaymentRequest,
  PaymentSummary,
  DashboardStats,
  SalesReportItem,
  OrdersReportItem,
  TableStatus,
  OrderFilters,
  UpdateCounterOrderGuestRequest,
  UpdateCounterOrderServiceRequest,
  ProductFilters,
  TableFilters,
  StockCategory,
  StockItem,
  StockMovement,
  InventoryActivityEntry,
  StockAlert,
  UserBrief,
  StockSummary,
  AdvancedStockReport,
  Supplier,
  PurchaseOrderSummary,
  PurchaseOrderDetail,
  Expense,
  DailyClosing,
  PnLReport,
  CurrentDayStatus,
  ExpenseSummary,
  ExpenseIntelligenceReport,
  ExpenseCategoryDefinition,
  KitchenStation,
  VoidLogEntry,
  FireKOTResponse,
  PricingSettings,
  CounterServer,
  OverviewReport,
  DailySalesRow,
  HourlySalesReport,
  ItemSalesRow,
  TableSalesRow,
  PartySizeRow,
  OrdersBrowserResponse,
  ReportsExportId,
  DashboardOverview,
  DashboardPeriod,
  LivePulse,
  SalesTimeseries,
  DashboardTopItem,
  PaymentMixSlice,
  OrderTypeMixSlice,
  DashboardAlert,
} from '@/types';

class APIClient {
  private client: AxiosInstance;

  constructor() {
    const apiUrl = import.meta.env?.VITE_API_URL || 'http://localhost:8080/api/v1';
    console.log('🔧 API Client baseURL:', apiUrl);
    console.log('🔧 Environment VITE_API_URL:', import.meta.env?.VITE_API_URL);
    
    this.client = axios.create({
      baseURL: apiUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('pos_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor to handle auth errors
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('pos_token');
          localStorage.removeItem('pos_user');
          // Redirect to login page (avoid hard reload loops while already on /login)
          if (window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
        }
        return Promise.reject(error);
      }
    );
  }

  // Helper method to handle API responses
  private async request<T>(config: AxiosRequestConfig): Promise<T> {
    try {
      const response: AxiosResponse<T> = await this.client.request(config);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const data = error.response?.data as
          | {
              message?: string;
              error?: string;
              blocking_orders?: Array<{ id?: string; order_number?: string; status?: string }>;
            }
          | undefined;
        const parts = [data?.message, data?.error].filter(Boolean);
        let msg = parts.length > 0 ? parts.join(' — ') : error.message;
        if (data?.blocking_orders?.length) {
          const detail = data.blocking_orders
            .map((o) => `${o.order_number ?? o.id ?? '?'} (${o.status ?? 'unknown'})`)
            .join(', ');
          msg = `${msg}. Blocking: ${detail}`;
        }
        throw new Error(msg);
      }
      throw error;
    }
  }

  /**
   * Backend exposes POST /server/orders, /counter/orders, and /admin/orders — not POST /orders.
   * Order creation must use the route group that matches the logged-in role.
   */
  private getStoredUserRole(): string {
    try {
      const raw = localStorage.getItem('pos_user');
      if (raw) {
        const u = JSON.parse(raw) as { role?: string };
        if (u.role) return u.role;
      }
    } catch {
      /* ignore */
    }
    return 'server';
  }

  private getOrderCreatePath(): string {
    const role = this.getStoredUserRole();
    if (role === 'admin' || role === 'manager') return '/admin/orders';
    if (role === 'counter') return '/counter/orders';
    return '/server/orders';
  }

  private getProcessPaymentPath(orderId: string): string {
    const role = this.getStoredUserRole();
    if (role === 'admin' || role === 'manager') return `/admin/orders/${orderId}/payments`;
    if (role === 'counter') return `/counter/orders/${orderId}/payments`;
    return `/counter/orders/${orderId}/payments`;
  }

  // Authentication endpoints
  async login(credentials: LoginRequest): Promise<APIResponse<LoginResponse>> {
    return this.request({
      method: 'POST',
      url: '/auth/login',
      data: credentials,
    });
  }

  async logout(): Promise<APIResponse> {
    return this.request({
      method: 'POST',
      url: '/auth/logout',
    });
  }

  async getCurrentUser(): Promise<APIResponse<User>> {
    return this.request({
      method: 'GET',
      url: '/auth/me',
    });
  }

  // Product endpoints
  async getProducts(filters?: ProductFilters): Promise<PaginatedResponse<Product[]>> {
    return this.request({
      method: 'GET',
      url: '/products',
      params: filters,
    });
  }

  async getProduct(id: string): Promise<APIResponse<Product>> {
    return this.request({
      method: 'GET',
      url: `/products/${id}`,
    });
  }

  async getCategories(activeOnly = true): Promise<APIResponse<Category[]>> {
    return this.request({
      method: 'GET',
      url: '/categories',
      params: { active_only: activeOnly },
    });
  }

  async getProductsByCategory(categoryId: string, availableOnly = true): Promise<APIResponse<Product[]>> {
    return this.request({
      method: 'GET',
      url: `/categories/${categoryId}/products`,
      params: { available_only: availableOnly },
    });
  }

  // Table endpoints
  async getTables(filters?: TableFilters): Promise<APIResponse<DiningTable[]>> {
    return this.request({
      method: 'GET',
      url: '/tables',
      params: filters,
    });
  }

  async getTable(id: string): Promise<APIResponse<DiningTable>> {
    return this.request({
      method: 'GET',
      url: `/tables/${id}`,
    });
  }

  async getTablesByLocation(): Promise<APIResponse<any[]>> {
    return this.request({
      method: 'GET',
      url: '/tables/by-location',
    });
  }

  async getTableStatus(): Promise<APIResponse<TableStatus>> {
    return this.request({
      method: 'GET',
      url: '/tables/status',
    });
  }

  // Order endpoints
  async getOrders(filters?: OrderFilters): Promise<PaginatedResponse<Order[]>> {
    return this.request({
      method: 'GET',
      url: '/orders',
      params: filters,
    });
  }

  async createOrder(order: CreateOrderRequest): Promise<APIResponse<Order>> {
    return this.request({
      method: 'POST',
      url: this.getOrderCreatePath(),
      data: order,
    });
  }

  async getOrder(id: string): Promise<APIResponse<Order>> {
    return this.request({
      method: 'GET',
      url: `/orders/${id}`,
    });
  }

  async updateOrderStatus(
    id: string,
    status: UpdateOrderStatusRequest['status'],
    notes?: string
  ): Promise<APIResponse<Order>> {
    const statusUpdate: UpdateOrderStatusRequest = { status, notes };
    return this.request({
      method: 'PATCH',
      url: `/orders/${id}/status`,
      data: statusUpdate,
    });
  }

  // Payment endpoints
  async processPayment(orderId: string, payment: ProcessPaymentRequest): Promise<APIResponse<Payment>> {
    return this.request({
      method: 'POST',
      url: this.getProcessPaymentPath(orderId),
      data: payment,
    });
  }

  async getPayments(orderId: string): Promise<APIResponse<Payment[]>> {
    return this.request({
      method: 'GET',
      url: `/orders/${orderId}/payments`,
    });
  }

  async getPaymentSummary(orderId: string): Promise<APIResponse<PaymentSummary>> {
    return this.request({
      method: 'GET',
      url: `/orders/${orderId}/payment-summary`,
    });
  }

  // Dashboard endpoints
  // ─── Legacy snapshot (kept for backward compatibility) ─────────────────
  /**
   * @deprecated Use {@link getDashboardOverview} + {@link getDashboardLive}
   * which return typed payloads with prior-period comparisons.
   */
  async getDashboardStats(): Promise<APIResponse<DashboardStats>> {
    return this.request({
      method: 'GET',
      url: '/admin/dashboard/stats',
    });
  }

  // ─── Dashboard v2 ─────────────────────────────────────────────────────
  // Typed, business-timezone-aware payloads with prior-period comparisons.
  // Powers the redesigned admin dashboard. See backend/internal/handlers/dashboard.go.

  /** Builds the params object for any dashboard v2 endpoint. */
  private dashboardParams(period: DashboardPeriod, from?: string, to?: string) {
    const params: Record<string, string> = { period };
    if (period === 'custom') {
      if (from) params.from = from;
      if (to) params.to = to;
    }
    return params;
  }

  async getDashboardOverview(
    period: DashboardPeriod,
    from?: string,
    to?: string,
  ): Promise<APIResponse<DashboardOverview>> {
    return this.request({
      method: 'GET',
      url: '/admin/dashboard/overview',
      params: this.dashboardParams(period, from, to),
    });
  }

  async getDashboardLive(): Promise<APIResponse<LivePulse>> {
    return this.request({
      method: 'GET',
      url: '/admin/dashboard/live',
    });
  }

  async getDashboardSalesTimeseries(
    period: DashboardPeriod,
    from?: string,
    to?: string,
  ): Promise<APIResponse<SalesTimeseries>> {
    return this.request({
      method: 'GET',
      url: '/admin/dashboard/sales-timeseries',
      params: this.dashboardParams(period, from, to),
    });
  }

  async getDashboardTopItems(
    period: DashboardPeriod,
    opts: { limit?: number; from?: string; to?: string } = {},
  ): Promise<APIResponse<DashboardTopItem[]>> {
    const params = this.dashboardParams(period, opts.from, opts.to);
    if (opts.limit) (params as Record<string, string | number>).limit = opts.limit;
    return this.request({
      method: 'GET',
      url: '/admin/dashboard/top-items',
      params,
    });
  }

  async getDashboardPaymentMix(
    period: DashboardPeriod,
    from?: string,
    to?: string,
  ): Promise<APIResponse<PaymentMixSlice[]>> {
    return this.request({
      method: 'GET',
      url: '/admin/dashboard/payment-mix',
      params: this.dashboardParams(period, from, to),
    });
  }

  async getDashboardOrderTypeMix(
    period: DashboardPeriod,
    from?: string,
    to?: string,
  ): Promise<APIResponse<OrderTypeMixSlice[]>> {
    return this.request({
      method: 'GET',
      url: '/admin/dashboard/order-type-mix',
      params: this.dashboardParams(period, from, to),
    });
  }

  async getDashboardAlerts(): Promise<APIResponse<DashboardAlert[]>> {
    return this.request({
      method: 'GET',
      url: '/admin/dashboard/alerts',
    });
  }
  // The SSE stream URL is built inside the useDashboardStream hook (see
  // src/lib/dashboardStream.ts), mirroring the kitchen-stream convention.

  async getSalesReport(period: 'today' | 'week' | 'month' = 'today'): Promise<APIResponse<SalesReportItem[]>> {
    return this.request({
      method: 'GET',
      url: '/admin/reports/sales',
      params: { period },
    });
  }

  async getOrdersReport(): Promise<APIResponse<OrdersReportItem[]>> {
    return this.request({
      method: 'GET',
      url: '/admin/reports/orders',
    });
  }

  /**
   * @deprecated Use {@link getDashboardSalesTimeseries} which returns
   * server-formatted bucket labels (no more duplicate-date rendering bug)
   * and a same-length prior-period series.
   */
  async getIncomeReport(period: 'today' | 'week' | 'month' | 'year' = 'today'): Promise<APIResponse<any>> {
    return this.request({
      method: 'GET',
      url: '/admin/reports/income',
      params: { period },
    });
  }

  // ─── Reports v2 ──────────────────────────────────────────────────────────
  // All v2 endpoints share a `from`/`to` ISO YYYY-MM-DD contract. The UI
  // displays DD-MM-YYYY but always sends ISO on the wire.

  async getReportsOverview(from: string, to: string): Promise<APIResponse<OverviewReport>> {
    return this.request({
      method: 'GET',
      url: '/admin/reports/v2/overview',
      params: { from, to },
    });
  }

  async getDailySalesReport(from: string, to: string): Promise<APIResponse<DailySalesRow[]>> {
    return this.request({
      method: 'GET',
      url: '/admin/reports/v2/sales/daily',
      params: { from, to },
    });
  }

  async getHourlySalesReport(from: string, to: string): Promise<APIResponse<HourlySalesReport>> {
    return this.request({
      method: 'GET',
      url: '/admin/reports/v2/sales/hourly',
      params: { from, to },
    });
  }

  async getItemSalesReport(
    from: string,
    to: string,
    opts: { search?: string; category_id?: string; sort?: 'qty' | 'gross' | 'net'; limit?: number } = {},
  ): Promise<APIResponse<ItemSalesRow[]>> {
    const params: Record<string, string | number> = { from, to };
    if (opts.search && opts.search.trim() !== '') params.search = opts.search.trim();
    if (opts.category_id) params.category_id = opts.category_id;
    if (opts.sort) params.sort = opts.sort;
    if (opts.limit) params.limit = opts.limit;
    return this.request({
      method: 'GET',
      url: '/admin/reports/v2/items',
      params,
    });
  }

  async getTableSalesReport(from: string, to: string): Promise<APIResponse<TableSalesRow[]>> {
    return this.request({
      method: 'GET',
      url: '/admin/reports/v2/tables',
      params: { from, to },
    });
  }

  async getPartySizeReport(from: string, to: string): Promise<APIResponse<PartySizeRow[]>> {
    return this.request({
      method: 'GET',
      url: '/admin/reports/v2/party-size',
      params: { from, to },
    });
  }

  /**
   * Returns a lightweight list of orders for one business day, including the
   * computed PRA late-print eligibility per order. Used by the Reports →
   * Orders Browser tab.
   *
   * `date` accepts ISO YYYY-MM-DD or DD-MM-YYYY. `praFilter` defaults to 'all'.
   */
  async getOrdersBrowser(
    date: string,
    opts: { search?: string; pra_filter?: 'all' | 'printed' | 'not_printed' | 'eligible' } = {},
  ): Promise<APIResponse<OrdersBrowserResponse>> {
    const params: Record<string, string> = { date };
    if (opts.search && opts.search.trim() !== '') params.search = opts.search.trim();
    if (opts.pra_filter) params.pra_filter = opts.pra_filter;
    return this.request({
      method: 'GET',
      url: '/admin/reports/v2/orders',
      params,
    });
  }

  /**
   * Downloads a report as a CSV file in the user's browser. Filename comes
   * from the backend Content-Disposition header so naming stays consistent
   * (DD-MM-YYYY range, with cafe-cova prefix).
   */
  async exportReportCsv(
    report: ReportsExportId,
    from: string,
    to: string,
    extra: Record<string, string> = {},
  ): Promise<void> {
    const response = await this.client.get('/admin/reports/v2/export', {
      params: { report, from, to, format: 'csv', ...extra },
      responseType: 'blob',
    });
    const blob = response.data as Blob;
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // Try to honour the server-provided filename; fall back to a sensible name.
    const cd = response.headers['content-disposition'] as string | undefined;
    const match = cd && /filename="?([^"]+)"?/i.exec(cd);
    a.download = match ? match[1] : `cafe-cova_${report}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }

  // Kitchen endpoints
  async getKitchenOrders(
    statusOrOptions?: string | { status?: string; station_id?: string; include_stale?: boolean },
  ): Promise<APIResponse<Order[]>> {
    const opts = typeof statusOrOptions === 'string' ? { status: statusOrOptions } : statusOrOptions ?? {}
    const params: Record<string, string> = {}
    if (opts.status && opts.status !== 'all') params.status = opts.status
    if (opts.station_id) params.station_id = opts.station_id
    if (opts.include_stale) params.include_stale = 'true'
    return this.request({
      method: 'GET',
      url: '/kitchen/orders',
      params,
    });
  }

  async updateOrderItemStatus(orderId: string, itemId: string, status: string): Promise<APIResponse> {
    return this.request({
      method: 'PATCH',
      url: `/kitchen/orders/${orderId}/items/${itemId}/status`,
      data: { status },
    });
  }

  /** Kitchen bump: order ready for pickup, removes from active KDS */
  async kitchenBumpOrder(orderId: string): Promise<
    APIResponse<{
      order_id: string
      completion_seconds: number
      kitchen_bumped_at: string
      table_id?: string | null
      ready_for_pickup: boolean
    }>
  > {
    return this.request({
      method: 'POST',
      url: `/kitchen/orders/${orderId}/bump`,
    });
  }

  /** Recall a bumped order back to the line (within kitchen.recall_window_seconds). */
  async recallOrder(orderId: string): Promise<APIResponse<{ order_id: string; status: string }>> {
    return this.request({
      method: 'POST',
      url: `/kitchen/orders/${orderId}/recall`,
    });
  }

  /** Kitchen-scoped read-only stations list (works for kitchen, admin, manager). */
  async getKitchenStations(): Promise<APIResponse<KitchenStation[]>> {
    return this.request({ method: 'GET', url: '/kitchen/stations' });
  }

  /** Recently bumped orders (for the KDS recall strip). */
  async getRecentBumpedOrders(limit = 5): Promise<
    APIResponse<
      Array<{
        id: string
        order_number: string
        order_type: string
        customer_name?: string
        table_number?: string | null
        kitchen_bumped_at?: string | null
      }>
    >
  > {
    return this.request({
      method: 'GET',
      url: '/kitchen/recent-bumped',
      params: { limit },
    });
  }

  // Role-specific order creation (KOT / server UI: same body as createOrder; URL follows current role)
  async createServerOrder(order: CreateOrderRequest): Promise<APIResponse<Order>> {
    return this.createOrder(order);
  }

  async createCounterOrder(order: CreateOrderRequest): Promise<APIResponse<Order>> {
    return this.request({
      method: 'POST',
      url: '/counter/orders',
      data: order,
    });
  }

  // Counter payment processing
  async processCounterPayment(orderId: string, payment: ProcessPaymentRequest): Promise<APIResponse<Payment>> {
    return this.request({
      method: 'POST',
      url: `/counter/orders/${orderId}/payments`,
      data: payment,
    });
  }

  /**
   * Marks an order as having had its optional PRA (Punjab Revenue Authority)
   * tax invoice slip printed. Safe to call multiple times — the backend
   * refreshes the `pra_invoice_printed_at` timestamp and preserves the
   * existing `pra_invoice_number` when the caller doesn't supply a new one.
   *
   * `invoiceNumber` is optional so the current rollout (which prints the slip
   * with a blank number field) can still log the print event; once a real
   * PRA-issued number is wired up, pass it here.
   */
  async markPraInvoicePrinted(
    orderId: string,
    invoiceNumber?: string,
  ): Promise<APIResponse<null>> {
    const body: { pra_invoice_number?: string } = {};
    if (invoiceNumber && invoiceNumber.trim() !== '') {
      body.pra_invoice_number = invoiceNumber.trim();
    }
    return this.request({
      method: 'POST',
      url: `/counter/orders/${orderId}/pra-invoice`,
      data: body,
    });
  }

  async getCounterServers(q?: string): Promise<APIResponse<CounterServer[]>> {
    return this.request({
      method: 'GET',
      url: '/counter/servers',
      params: q ? { q } : undefined,
    });
  }

  /** Latest open order for a table (pending…served) — for counter add-ons to occupied tables. */
  async getActiveOrderForTable(tableId: string): Promise<APIResponse<Order>> {
    return this.request({
      method: 'GET',
      url: `/counter/tables/${tableId}/active-order`,
    });
  }

  /** Open dine-in tab: assigns order number, table_opened_at, empty line items. */
  async openCounterTableTab(body: OpenCounterTableTabRequest): Promise<APIResponse<Order>> {
    return this.request({
      method: 'POST',
      url: '/counter/table-tabs',
      data: body,
    });
  }

  /** Abandon tab before kitchen fire; releases order number for reuse. */
  async cancelCounterOpenTab(orderId: string): Promise<APIResponse<null>> {
    return this.request({
      method: 'POST',
      url: `/counter/orders/${orderId}/cancel-open-tab`,
    });
  }

  /** Reassign active dine-in order to another table. */
  async reassignCounterOrderTable(
    orderId: string,
    body: { table_id: string; notes?: string }
  ): Promise<APIResponse<Order>> {
    return this.request({
      method: 'PATCH',
      url: `/counter/orders/${orderId}/table`,
      data: body,
    });
  }

  async getAdminCustomers(params?: { q?: string; page?: number }): Promise<APIResponse<Record<string, unknown>[]>> {
    return this.request({
      method: 'GET',
      url: '/admin/customers',
      params,
    });
  }

  async getCounterPricing(): Promise<APIResponse<PricingSettings>> {
    return this.request({ method: 'GET', url: '/counter/pricing' });
  }

  async updateCheckoutIntent(
    orderId: string,
    body: { checkout_payment_method: 'cash' | 'card' | 'online' }
  ): Promise<APIResponse<Order>> {
    return this.request({
      method: 'PATCH',
      url: `/counter/orders/${orderId}/checkout-intent`,
      data: body,
    });
  }

  async applyOrderDiscount(
    orderId: string,
    body: { discount_amount?: number; discount_percent?: number }
  ): Promise<APIResponse<Order>> {
    return this.request({
      method: 'PATCH',
      url: `/counter/orders/${orderId}/discount`,
      data: body,
    });
  }

  async updateCounterOrderGuest(
    orderId: string,
    body: UpdateCounterOrderGuestRequest
  ): Promise<APIResponse<Order>> {
    return this.request({
      method: 'PATCH',
      url: `/counter/orders/${orderId}/guest`,
      data: body,
    });
  }

  async updateCounterOrderService(
    orderId: string,
    body: UpdateCounterOrderServiceRequest
  ): Promise<APIResponse<Order>> {
    return this.request({
      method: 'PATCH',
      url: `/counter/orders/${orderId}/service`,
      data: body,
    });
  }

  // User management endpoints (Admin only)
  async getUsers(params?: { page?: number; limit?: number; per_page?: number; search?: string; role?: string }): Promise<APIResponse<User[]>> {
    return this.request({
      method: 'GET',
      url: '/admin/users',
      params,
    });
  }

  async createUser(userData: any): Promise<APIResponse<User>> {
    return this.request({
      method: 'POST',
      url: '/admin/users',
      data: userData,
    });
  }

  async updateUser(id: string, userData: any): Promise<APIResponse<User>> {
    return this.request({
      method: 'PUT',
      url: `/admin/users/${id}`,
      data: userData,
    });
  }

  async deleteUser(id: string): Promise<APIResponse> {
    return this.request({
      method: 'DELETE',
      url: `/admin/users/${id}`,
    });
  }

  // Admin-specific product management
  async createProduct(productData: any): Promise<APIResponse<Product>> {
    return this.request({ method: 'POST', url: '/admin/products', data: productData });
  }

  async updateProduct(id: string, productData: any): Promise<APIResponse<Product>> {
    return this.request({ method: 'PUT', url: `/admin/products/${id}`, data: productData });
  }

  async deleteProduct(id: string): Promise<APIResponse> {
    return this.request({ method: 'DELETE', url: `/admin/products/${id}` });
  }

  // Admin-specific category management  
  async createCategory(categoryData: any): Promise<APIResponse<Category>> {
    return this.request({ method: 'POST', url: '/admin/categories', data: categoryData });
  }

  async updateCategory(id: string, categoryData: any): Promise<APIResponse<Category>> {
    return this.request({ method: 'PUT', url: `/admin/categories/${id}`, data: categoryData });
  }

  async deleteCategory(id: string): Promise<APIResponse> {
    return this.request({ method: 'DELETE', url: `/admin/categories/${id}` });
  }

  // Admin products endpoint with pagination
  async getAdminProducts(params?: { page?: number, per_page?: number, limit?: number, search?: string, category_id?: string }): Promise<APIResponse<Product[]>> {
    // Normalize params (handle both per_page and limit)
    const normalizedParams = {
      page: params?.page,
      per_page: params?.per_page || params?.limit,
      search: params?.search,
      category_id: params?.category_id
    }
    
    return this.request({ 
      method: 'GET', 
      url: '/admin/products',
      params: normalizedParams
    });
  }

  // Admin categories endpoint with pagination
  async getAdminCategories(params?: { page?: number, per_page?: number, limit?: number, search?: string, active_only?: boolean }): Promise<APIResponse<Category[]>> {
    // Normalize params (handle both per_page and limit)
    const normalizedParams = {
      page: params?.page,
      per_page: params?.per_page || params?.limit,
      search: params?.search,
      active_only: params?.active_only
    }
    
    return this.request({ 
      method: 'GET', 
      url: '/admin/categories',
      params: normalizedParams
    });
  }

  // Admin tables endpoint with pagination
  async getAdminTables(params?: { page?: number, limit?: number, search?: string, status?: string }): Promise<APIResponse<DiningTable[]>> {
    return this.request({ 
      method: 'GET', 
      url: '/admin/tables',
      params 
    });
  }

  // Admin-specific table management
  async createTable(tableData: any): Promise<APIResponse<DiningTable>> {
    return this.request({ method: 'POST', url: '/admin/tables', data: tableData });
  }

  async updateTable(id: string, tableData: any): Promise<APIResponse<DiningTable>> {
    return this.request({ method: 'PUT', url: `/admin/tables/${id}`, data: tableData });
  }

  async deleteTable(id: string): Promise<APIResponse> {
    return this.request({ method: 'DELETE', url: `/admin/tables/${id}` });
  }

  // Store Inventory endpoints
  async getStockCategories(): Promise<APIResponse<StockCategory[]>> {
    return this.request({ method: 'GET', url: '/store/stock-categories' });
  }

  async createStockCategory(data: { name: string; description?: string; sort_order?: number }): Promise<APIResponse<{ id: string }>> {
    return this.request({ method: 'POST', url: '/store/stock-categories', data });
  }

  async updateStockCategory(id: string, data: Partial<StockCategory>): Promise<APIResponse> {
    return this.request({ method: 'PUT', url: `/store/stock-categories/${id}`, data });
  }

  async deleteStockCategory(id: string): Promise<APIResponse> {
    return this.request({ method: 'DELETE', url: `/store/stock-categories/${id}` });
  }

  async getStockItems(params?: {
    page?: number;
    per_page?: number;
    category_id?: string;
    search?: string;
    low_stock?: string;
    stock_health?: 'low' | 'ok';
    sort?: 'category' | 'name' | 'on_hand' | 'reorder' | 'unit_cost' | 'expiry';
    sort_dir?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<StockItem[]>> {
    return this.request({ method: 'GET', url: '/store/stock-items', params });
  }

  async getStockItem(id: string): Promise<APIResponse<StockItem>> {
    return this.request({ method: 'GET', url: `/store/stock-items/${id}` });
  }

  async createStockItem(data: { category_id?: string; name: string; unit: string; quantity_on_hand?: number; reorder_level?: number; default_unit_cost?: number; notes?: string }): Promise<APIResponse<{ id: string }>> {
    return this.request({ method: 'POST', url: '/store/stock-items', data });
  }

  async updateStockItem(id: string, data: Partial<StockItem>): Promise<APIResponse> {
    return this.request({ method: 'PUT', url: `/store/stock-items/${id}`, data });
  }

  async deleteStockItem(id: string): Promise<APIResponse> {
    return this.request({ method: 'DELETE', url: `/store/stock-items/${id}` });
  }

  async purchaseStock(
    itemId: string,
    data: {
      quantity: number;
      unit_cost?: number;
      note?: string;
      expiry_date?: string;
      supplier_id?: string;
      purchase_order_id?: string;
      purchase_order_line_id?: string;
    }
  ): Promise<APIResponse> {
    return this.request({ method: 'POST', url: `/store/stock-items/${itemId}/purchase`, data });
  }

  async issueStock(itemId: string, data: { quantity: number; unit?: string; issued_to_user_id: string; reason?: string; note?: string }): Promise<APIResponse> {
    return this.request({ method: 'POST', url: `/store/stock-items/${itemId}/issue`, data });
  }

  async adjustStock(
    itemId: string,
    data: { quantity_delta: number; unit_cost?: number; reason?: string; note?: string }
  ): Promise<APIResponse> {
    return this.request({ method: 'POST', url: `/store/stock-items/${itemId}/adjust`, data });
  }

  async getStockAlerts(): Promise<APIResponse<StockAlert[]>> {
    return this.request({ method: 'GET', url: '/store/stock-alerts' });
  }

  async getStockMovements(params?: { page?: number; per_page?: number; category_id?: string; type?: string; from?: string; to?: string }): Promise<PaginatedResponse<StockMovement[]>> {
    return this.request({ method: 'GET', url: '/store/stock-reports/movements', params });
  }

  async getStockSummary(period?: string): Promise<APIResponse<StockSummary>> {
    return this.request({ method: 'GET', url: '/store/stock-reports/summary', params: { period } });
  }

  async getAdvancedStockReport(period?: string): Promise<APIResponse<AdvancedStockReport>> {
    return this.request({ method: 'GET', url: '/store/stock-reports/advanced', params: { period } });
  }

  async getInventoryActivity(params?: {
    page?: number;
    per_page?: number;
    action?: string;
    from?: string;
    to?: string;
  }): Promise<PaginatedResponse<InventoryActivityEntry[]>> {
    return this.request({ method: 'GET', url: '/store/inventory-activity', params });
  }

  async voidPurchaseMovement(movementId: string, data: { reason: string }): Promise<APIResponse> {
    return this.request({ method: 'POST', url: `/store/stock-movements/${movementId}/void`, data });
  }

  async correctPurchaseMovementCost(
    movementId: string,
    data: { unit_cost: number; reason: string }
  ): Promise<APIResponse> {
    return this.request({ method: 'POST', url: `/store/stock-movements/${movementId}/correct-purchase-cost`, data });
  }

  async getStoreUsers(): Promise<APIResponse<UserBrief[]>> {
    return this.request({ method: 'GET', url: '/store/users' });
  }

  async listSuppliers(): Promise<APIResponse<Supplier[]>> {
    return this.request({ method: 'GET', url: '/store/suppliers' });
  }

  async createSupplier(data: {
    name: string;
    contact_name?: string;
    phone?: string;
    email?: string;
    notes?: string;
  }): Promise<APIResponse<{ id: string }>> {
    return this.request({ method: 'POST', url: '/store/suppliers', data });
  }

  async updateSupplier(id: string, data: Partial<Supplier>): Promise<APIResponse> {
    return this.request({ method: 'PUT', url: `/store/suppliers/${id}`, data });
  }

  async deleteSupplier(id: string): Promise<APIResponse> {
    return this.request({ method: 'DELETE', url: `/store/suppliers/${id}` });
  }

  async listPurchaseOrders(params?: { page?: number; per_page?: number; status?: string }): Promise<PaginatedResponse<PurchaseOrderSummary[]>> {
    return this.request({ method: 'GET', url: '/store/purchase-orders', params });
  }

  async getPurchaseOrder(id: string): Promise<APIResponse<PurchaseOrderDetail>> {
    return this.request({ method: 'GET', url: `/store/purchase-orders/${id}` });
  }

  async createPurchaseOrder(data: {
    supplier_id: string;
    expected_date?: string;
    notes?: string;
    lines: { stock_item_id: string; quantity_ordered: number; unit_cost?: number }[];
  }): Promise<APIResponse<{ id: string }>> {
    return this.request({ method: 'POST', url: '/store/purchase-orders', data });
  }

  async submitPurchaseOrder(id: string): Promise<APIResponse> {
    return this.request({ method: 'POST', url: `/store/purchase-orders/${id}/submit` });
  }

  async cancelPurchaseOrder(id: string): Promise<APIResponse> {
    return this.request({ method: 'POST', url: `/store/purchase-orders/${id}/cancel` });
  }

  async receivePurchaseOrder(
    id: string,
    data: { lines: { line_id: string; quantity_received: number; unit_cost?: number; expiry_date?: string }[] }
  ): Promise<APIResponse> {
    return this.request({ method: 'POST', url: `/store/purchase-orders/${id}/receive`, data });
  }

  // Expense endpoints
  async getExpenses(params?: {
    page?: number;
    per_page?: number;
    category?: string;
    from?: string;
    to?: string;
    search?: string;
    sort_by?: 'expense_date' | 'amount' | 'category' | 'created_at';
    sort_dir?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<Expense[]>> {
    return this.request({ method: 'GET', url: '/admin/expenses', params });
  }

  async createExpense(data: {
    category: string;
    amount: number;
    description?: string;
    expense_date?: string;
    recorded_at?: string;
  }): Promise<APIResponse<{ id: string }>> {
    return this.request({ method: 'POST', url: '/admin/expenses', data });
  }

  async updateExpense(id: string, data: {
    category?: string;
    amount?: number;
    description?: string;
    expense_date?: string;
    recorded_at?: string;
  }): Promise<APIResponse> {
    return this.request({ method: 'PUT', url: `/admin/expenses/${id}`, data });
  }

  async deleteExpense(id: string): Promise<APIResponse> {
    return this.request({ method: 'DELETE', url: `/admin/expenses/${id}` });
  }

  async getExpenseSummary(params?: { from?: string; to?: string }): Promise<APIResponse<ExpenseSummary>> {
    return this.request({ method: 'GET', url: '/admin/expenses/summary', params });
  }

  async getExpenseCategories(): Promise<APIResponse<{ category: string; count: number; total: number }[]>> {
    return this.request({ method: 'GET', url: '/admin/expenses/categories' });
  }

  async getExpenseCategoryDefinitions(): Promise<APIResponse<ExpenseCategoryDefinition[]>> {
    return this.request({ method: 'GET', url: '/admin/expense-category-definitions' });
  }

  async createExpenseCategoryDefinition(data: { label: string; color?: string; sort_order?: number }): Promise<APIResponse<{ id: string; slug: string }>> {
    return this.request({ method: 'POST', url: '/admin/expense-category-definitions', data });
  }

  async updateExpenseCategoryDefinition(
    id: string,
    data: { label?: string; color?: string; sort_order?: number; is_active?: boolean }
  ): Promise<APIResponse> {
    return this.request({ method: 'PUT', url: `/admin/expense-category-definitions/${id}`, data });
  }

  async deleteExpenseCategoryDefinition(id: string): Promise<APIResponse> {
    return this.request({ method: 'DELETE', url: `/admin/expense-category-definitions/${id}` });
  }

  // Daily Closing endpoints
  async getDailyClosings(params?: { page?: number; per_page?: number }): Promise<PaginatedResponse<DailyClosing[]>> {
    return this.request({ method: 'GET', url: '/admin/daily-closings', params });
  }

  async getCurrentDayStatus(): Promise<APIResponse<CurrentDayStatus>> {
    return this.request({ method: 'GET', url: '/admin/daily-closings/current' });
  }

  async closeDay(data: { opening_cash: number; actual_cash: number; notes?: string }): Promise<APIResponse> {
    return this.request({ method: 'POST', url: '/admin/daily-closings', data });
  }

  async getDailyClosingByDate(date: string): Promise<APIResponse<DailyClosing>> {
    return this.request({ method: 'GET', url: `/admin/daily-closings/${date}` });
  }

  // P&L Report endpoint
  async getPnLReport(params?: { period?: string; from?: string; to?: string }): Promise<APIResponse<PnLReport>> {
    return this.request({ method: 'GET', url: '/admin/reports/pnl', params });
  }

  async getExpenseIntelligence(params?: { period_days?: number }): Promise<APIResponse<ExpenseIntelligenceReport>> {
    return this.request({ method: 'GET', url: '/admin/reports/expense-intelligence', params });
  }

  // KOT endpoints
  async fireKOT(orderId: string): Promise<APIResponse<FireKOTResponse>> {
    return this.request({ method: 'POST', url: `/orders/${orderId}/fire-kot` });
  }

  async addItemsToOrder(orderId: string, items: { product_id: string; quantity: number; special_instructions?: string }[]): Promise<APIResponse> {
    return this.request({ method: 'POST', url: `/orders/${orderId}/items`, data: { items } });
  }

  async removeDraftItem(orderId: string, itemId: string): Promise<APIResponse> {
    return this.request({ method: 'DELETE', url: `/orders/${orderId}/items/${itemId}` });
  }

  async voidItem(orderId: string, itemId: string, data: { pin: string; reason: string }): Promise<APIResponse> {
    return this.request({ method: 'POST', url: `/orders/${orderId}/items/${itemId}/void`, data });
  }

  // PIN verification
  async verifyPin(pin: string): Promise<APIResponse<{ valid: boolean; user_name?: string }>> {
    return this.request({ method: 'POST', url: '/verify-pin', data: { pin } });
  }

  // Kitchen Station management (admin)
  async getStations(): Promise<APIResponse<KitchenStation[]>> {
    return this.request({ method: 'GET', url: '/admin/stations' });
  }

  async createStation(data: {
    name: string;
    output_type: string;
    sort_order?: number;
    print_location?: 'kitchen' | 'counter';
  }): Promise<APIResponse<KitchenStation>> {
    return this.request({ method: 'POST', url: '/admin/stations', data });
  }

  async updateStation(id: string, data: Partial<KitchenStation>): Promise<APIResponse> {
    return this.request({ method: 'PUT', url: `/admin/stations/${id}`, data });
  }

  async deleteStation(id: string): Promise<APIResponse> {
    return this.request({ method: 'DELETE', url: `/admin/stations/${id}` });
  }

  async setStationCategories(stationId: string, categoryIds: string[]): Promise<APIResponse> {
    return this.request({ method: 'POST', url: `/admin/stations/${stationId}/categories`, data: { category_ids: categoryIds } });
  }

  async getStationCategories(stationId: string): Promise<APIResponse<string[]>> {
    return this.request({ method: 'GET', url: `/admin/stations/${stationId}/categories` });
  }

  /** Assign category to exactly one kitchen station (or clear with null). */
  async setCategoryKitchenStation(categoryId: string, stationId: string | null): Promise<APIResponse> {
    return this.request({
      method: 'PUT',
      url: `/admin/categories/${categoryId}/station`,
      data: { station_id: stationId },
    });
  }

  // PIN management (admin)
  async setUserPin(userId: string, pin: string): Promise<APIResponse> {
    return this.request({ method: 'PUT', url: `/admin/users/${userId}/pin`, data: { pin } });
  }

  // Void log (admin)
  async getVoidLog(params?: { page?: number; per_page?: number; from?: string; to?: string; user_id?: string }): Promise<PaginatedResponse<VoidLogEntry[]>> {
    return this.request({ method: 'GET', url: '/admin/void-log', params });
  }

  // App Settings
  async getSetting(key: string): Promise<APIResponse<any>> {
    return this.request({ method: 'GET', url: `/settings/${key}` });
  }

  async updateSetting(key: string, value: any): Promise<APIResponse<any>> {
    return this.request({ method: 'PUT', url: `/admin/settings/${key}`, data: value });
  }

  async getAllSettings(): Promise<APIResponse<Record<string, any>>> {
    return this.request({ method: 'GET', url: '/settings' });
  }

  // Utility methods
  setAuthToken(token: string): void {
    localStorage.setItem('pos_token', token);
  }

  clearAuth(): void {
    localStorage.removeItem('pos_token');
    localStorage.removeItem('pos_user');
  }

  getAuthToken(): string | null {
    return localStorage.getItem('pos_token');
  }

  isAuthenticated(): boolean {
    return !!this.getAuthToken();
  }
}

// Create and export a singleton instance
export const apiClient = new APIClient();
export default apiClient;

