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
  OrderItem,
  Payment,
  CreateOrderRequest,
  UpdateOrderStatusRequest,
  ProcessPaymentRequest,
  PaymentSummary,
  DashboardStats,
  SalesReportItem,
  OrdersReportItem,
  KitchenOrder,
  TableStatus,
  OrderFilters,
  ProductFilters,
  TableFilters,
  StockCategory,
  StockItem,
  StockMovement,
  StockAlert,
  UserBrief,
  StockSummary,
  AdvancedStockReport,
  Expense,
  DailyClosing,
  PnLReport,
  CurrentDayStatus,
  ExpenseSummary,
  KitchenStation,
  VoidLogEntry,
  FireKOTResponse,
  PricingSettings,
  CounterServer,
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
        const data = error.response?.data as { message?: string; error?: string } | undefined;
        const parts = [data?.message, data?.error].filter(Boolean);
        throw new Error(parts.length > 0 ? parts.join(' — ') : error.message);
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

  async updateOrderStatus(id: string, status: OrderStatus, notes?: string): Promise<APIResponse<Order>> {
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
  async getDashboardStats(): Promise<APIResponse<DashboardStats>> {
    return this.request({
      method: 'GET',
      url: '/admin/dashboard/stats',
    });
  }

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

  async getIncomeReport(period: 'today' | 'week' | 'month' | 'year' = 'today'): Promise<APIResponse<any>> {
    return this.request({
      method: 'GET',
      url: '/admin/reports/income',
      params: { period },
    });
  }

  // Kitchen endpoints
  async getKitchenOrders(status?: string): Promise<APIResponse<Order[]>> {
    return this.request({
      method: 'GET',
      url: '/kitchen/orders',
      params: status && status !== 'all' ? { status } : {},
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
      method: 'PATCH',
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

  async getStockItems(params?: { page?: number; per_page?: number; category_id?: string; search?: string; low_stock?: string }): Promise<PaginatedResponse<StockItem[]>> {
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

  async purchaseStock(itemId: string, data: { quantity: number; unit_cost?: number; note?: string }): Promise<APIResponse> {
    return this.request({ method: 'POST', url: `/store/stock-items/${itemId}/purchase`, data });
  }

  async issueStock(itemId: string, data: { quantity: number; unit?: string; issued_to_user_id: string; reason?: string; note?: string }): Promise<APIResponse> {
    return this.request({ method: 'POST', url: `/store/stock-items/${itemId}/issue`, data });
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

  async getStoreUsers(): Promise<APIResponse<UserBrief[]>> {
    return this.request({ method: 'GET', url: '/store/users' });
  }

  // Expense endpoints
  async getExpenses(params?: { page?: number; per_page?: number; category?: string; from?: string; to?: string; search?: string }): Promise<PaginatedResponse<Expense[]>> {
    return this.request({ method: 'GET', url: '/admin/expenses', params });
  }

  async createExpense(data: { category: string; amount: number; description?: string; expense_date?: string }): Promise<APIResponse<{ id: string }>> {
    return this.request({ method: 'POST', url: '/admin/expenses', data });
  }

  async updateExpense(id: string, data: { category?: string; amount?: number; description?: string; expense_date?: string }): Promise<APIResponse> {
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

