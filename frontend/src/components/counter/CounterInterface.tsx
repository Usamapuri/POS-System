import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TableSessionModal, type TableSession } from '@/components/counter/TableSessionModal'
import { KotPrintModal } from '@/components/counter/KotPrintModal'
import { computeCartTotals, mergePricingSettings } from '@/lib/counterPricing'
import { subscribeOrderReady } from '@/lib/kdsRealtime'
import { cn } from '@/lib/utils'
import { useCurrency } from '@/contexts/CurrencyContext'
import { toastHelpers } from '@/lib/toast-helpers'
import { getCashierNameFromStorage, parseReceiptSettings, printCustomerReceipt } from '@/lib/printCustomerReceipt'
import {
  Plus,
  Minus,
  ShoppingCart,
  CreditCard,
  DollarSign,
  Check,
  Search,
  Package,
  Car,
  Users,
  Receipt,
  Globe,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import type {
  Product,
  Category,
  DiningTable,
  Order,
  OrderItem,
  CreateOrderRequest,
  ProcessPaymentRequest,
  StationKOT,
} from '@/types'

interface CartItem {
  product: Product
  quantity: number
  special_instructions?: string
}

function categoryColor(cat: Category | undefined, fallback: string): string {
  if (cat?.color && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(cat.color)) return cat.color
  let h = 0
  const s = (cat?.name ?? fallback) || 'x'
  for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i) * 17) % 360
  return `hsl(${h} 45% 42%)`
}

export function CounterInterface() {
  const [activeTab, setActiveTab] = useState<'create' | 'payment'>('create')
  const [orderType, setOrderType] = useState<'dine_in' | 'takeout' | 'delivery'>('dine_in')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedTable, setSelectedTable] = useState<DiningTable | null>(null)
  const [dineInSession, setDineInSession] = useState<TableSession | null>(null)
  const [sessionModalOpen, setSessionModalOpen] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [orderNotes, setOrderNotes] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [createCheckoutIntent, setCreateCheckoutIntent] = useState<'cash' | 'card' | 'online'>('cash')

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [paymentCheckoutIntent, setPaymentCheckoutIntent] = useState<'cash' | 'card' | 'online'>('cash')
  const [cashReceived, setCashReceived] = useState('')
  const [cashModalOpen, setCashModalOpen] = useState(false)
  const [referenceNumber, setReferenceNumber] = useState('')
  const [discountMode, setDiscountMode] = useState<'amount' | 'percent'>('amount')
  const [discountValue, setDiscountValue] = useState('')
  const [kotPrintOpen, setKotPrintOpen] = useState(false)
  const [lastFireKots, setLastFireKots] = useState<StationKOT[] | undefined>(undefined)
  /** When set, cart adds lines to this existing table order (occupied table flow). */
  const [continuingOrderId, setContinuingOrderId] = useState<string | null>(null)
  /** Full order data when continuing an existing order (includes items already sent to kitchen). */
  const [existingOrder, setExistingOrder] = useState<Order | null>(null)
  const [existingItemsExpanded, setExistingItemsExpanded] = useState(false)

  const queryClient = useQueryClient()
  const { formatCurrency } = useCurrency()

  useEffect(() => {
    return subscribeOrderReady((e) => {
      toastHelpers.success(
        'Ready for pickup',
        `Order #${e.orderNumber} — kitchen bumped (${Math.floor(e.completionSeconds / 60)}m ${e.completionSeconds % 60}s)`
      )
      queryClient.invalidateQueries({ queryKey: ['tables'] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['counterPendingOrders'] })
    })
  }, [queryClient])

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiClient.getCategories().then((res) => res.data),
  })

  const { data: products = [] } = useQuery({
    queryKey: ['products', selectedCategory],
    queryFn: () => {
      if (selectedCategory === 'all') {
        return apiClient.getProducts().then((res) => res.data)
      }
      return apiClient.getProductsByCategory(selectedCategory).then((res) => res.data)
    },
  })

  const { data: tables = [] } = useQuery({
    queryKey: ['tables'],
    queryFn: () => apiClient.getTables().then((res) => res.data),
  })

  const { data: pricingRaw } = useQuery({
    queryKey: ['counterPricing'],
    queryFn: () => apiClient.getCounterPricing().then((r) => (r.success && r.data ? r.data : null)),
  })

  const pricing = useMemo(() => mergePricingSettings(pricingRaw), [pricingRaw])

  const { data: pendingOrders = [] } = useQuery({
    queryKey: ['counterPendingOrders'],
    queryFn: async () => {
      const r = await apiClient.getOrders({ per_page: 100 })
      const list = Array.isArray(r.data) ? r.data : []
      return list.filter((o) => o.status === 'ready' || o.status === 'served')
    },
  })

  const { data: paymentOrderDetail, isFetching: paymentOrderFetching } = useQuery({
    queryKey: ['order', selectedOrder?.id, 'payment-panel'],
    queryFn: async () => {
      const r = await apiClient.getOrder(selectedOrder!.id)
      if (!r.success || !r.data) throw new Error(r.message || 'Failed to load order')
      return r.data
    },
    enabled: Boolean(activeTab === 'payment' && selectedOrder),
  })

  const orderForPayment = paymentOrderDetail ?? selectedOrder ?? null
  /** Resolved order for payment panel (always defined when an order is selected). */
  const payOrder = selectedOrder ? (orderForPayment ?? selectedOrder) : null

  const submitCartMutation = useMutation({
    mutationFn: async (): Promise<{ orderId: string; mode: 'new' | 'continue' }> => {
      const lines = cart.map((item) => ({
        product_id: item.product.id,
        quantity: item.quantity,
        special_instructions: item.special_instructions,
      }))
      if (continuingOrderId) {
        const res = await apiClient.addItemsToOrder(continuingOrderId, lines)
        if (!res.success) {
          throw new Error(res.message || 'Could not add items to order')
        }
        return { orderId: continuingOrderId, mode: 'continue' }
      }
      const orderData: CreateOrderRequest = {
        table_id: orderType === 'dine_in' ? selectedTable?.id : undefined,
        customer_name: customerName || undefined,
        order_type: orderType,
        guest_count: orderType === 'dine_in' ? dineInSession!.guestCount : 0,
        assigned_server_id: orderType === 'dine_in' ? dineInSession!.serverId : undefined,
        items: lines,
        notes: orderNotes || undefined,
      }
      const res = await apiClient.createCounterOrder(orderData)
      if (!res.success || !res.data?.id) {
        throw new Error(res.message || 'Could not create order')
      }
      return { orderId: res.data.id, mode: 'new' }
    },
    onSuccess: async (result) => {
      setCart([])
      setOrderNotes('')
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['tables'] })
      queryClient.invalidateQueries({ queryKey: ['counterPendingOrders'] })

      if (result.mode === 'new') {
        setSelectedTable(null)
        setDineInSession(null)
        setCustomerName('')
        setContinuingOrderId(null)
        setExistingOrder(null)
        setExistingItemsExpanded(false)
      } else {
        setExistingOrder(null)
        setExistingItemsExpanded(false)
        setContinuingOrderId(null)
        setSelectedTable(null)
        setDineInSession(null)
      }

      try {
        const fr = await apiClient.fireKOT(result.orderId)
        if (!fr.success) {
          toastHelpers.error('Kitchen (KOT)', fr.message || 'Could not send order to the kitchen display.')
        } else {
          toastHelpers.success(
            result.mode === 'continue' ? 'Add-on sent' : 'Sent to kitchen',
            result.mode === 'continue' ? 'New items were sent to the kitchen.' : 'Order is on the KDS queue.'
          )
          setLastFireKots(fr.data?.kots)
          setKotPrintOpen(true)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Request failed'
        toastHelpers.error('Kitchen (KOT)', msg)
      }
      queryClient.invalidateQueries({ queryKey: ['newEnhancedKitchenOrders'] })
    },
  })

  const processPaymentMutation = useMutation({
    mutationFn: ({ orderId, paymentData }: { orderId: string; paymentData: ProcessPaymentRequest }) =>
      apiClient.processCounterPayment(orderId, paymentData),
    onSuccess: async (_data, variables) => {
      setSelectedOrder(null)
      setCashReceived('')
      setReferenceNumber('')
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['counterPendingOrders'] })
      queryClient.invalidateQueries({ queryKey: ['tables'] })
      try {
        const orderRes = await apiClient.getOrder(variables.orderId)
        const settingsRes = await queryClient.fetchQuery({
          queryKey: ['settings', 'all'],
          queryFn: () => apiClient.getAllSettings(),
        })
        if (orderRes.success && orderRes.data && settingsRes.success && settingsRes.data) {
          printCustomerReceipt(orderRes.data, parseReceiptSettings(settingsRes.data as Record<string, unknown>), {
            cashierName: getCashierNameFromStorage(),
            paymentMethod: variables.paymentData.payment_method,
            paidAt: new Date(),
            formatAmount: formatCurrency,
          })
        }
      } catch {
        /* receipt is optional */
      }
    },
  })

  const checkoutIntentMutation = useMutation({
    mutationFn: ({
      orderId,
      intent,
    }: {
      orderId: string
      intent: 'cash' | 'card' | 'online'
    }) => apiClient.updateCheckoutIntent(orderId, { checkout_payment_method: intent }),
    onSuccess: (res) => {
      if (res.success && res.data) setSelectedOrder(res.data)
      queryClient.invalidateQueries({ queryKey: ['counterPendingOrders'] })
    },
  })

  const discountMutation = useMutation({
    mutationFn: ({
      orderId,
      discount_amount,
      discount_percent,
    }: {
      orderId: string
      discount_amount?: number
      discount_percent?: number
    }) => apiClient.applyOrderDiscount(orderId, { discount_amount, discount_percent }),
    onSuccess: (res, vars) => {
      if (res.success && res.data) setSelectedOrder(res.data)
      setDiscountValue('')
      queryClient.invalidateQueries({ queryKey: ['order', vars.orderId, 'payment-panel'] })
      queryClient.invalidateQueries({ queryKey: ['counterPendingOrders'] })
    },
  })

  const categoryById = useMemo(() => {
    const m = new Map<string, Category>()
    ;(categories as Category[]).forEach((c) => m.set(c.id, c))
    return m
  }, [categories])

  const filteredProducts = products.filter(
    (product) =>
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (product.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
  )

  const sortedTables = useMemo(() => {
    const arr = [...tables]
    arr.sort((a, b) => String(a.table_number).localeCompare(String(b.table_number), undefined, { numeric: true }))
    return arr
  }, [tables])

  const canUseCart =
    orderType !== 'dine_in' || (selectedTable !== null && dineInSession !== null)

  const cartSubtotal = cart.reduce((t, item) => t + item.product.price * item.quantity, 0)
  const cartTotals = computeCartTotals(cartSubtotal, 0, createCheckoutIntent, pricing)

  const addToCart = (product: Product) => {
    if (!canUseCart) return
    const existingItem = cart.find((item) => item.product.id === product.id)
    if (existingItem) {
      setCart(
        cart.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        )
      )
    } else {
      setCart([...cart, { product, quantity: 1 }])
    }
  }

  const removeFromCart = (productId: string) => {
    const existingItem = cart.find((item) => item.product.id === productId)
    if (existingItem && existingItem.quantity > 1) {
      setCart(
        cart.map((item) =>
          item.product.id === productId ? { ...item, quantity: item.quantity - 1 } : item
        )
      )
    } else {
      setCart(cart.filter((item) => item.product.id !== productId))
    }
  }

  const handleFreeTable = (table: DiningTable) => {
    setContinuingOrderId(null)
    setExistingOrder(null)
    setExistingItemsExpanded(false)
    setSelectedTable(table)
    setDineInSession(null)
    setSessionModalOpen(true)
  }

  const handleOccupiedTable = async (table: DiningTable) => {
    try {
      const res = await apiClient.getActiveOrderForTable(table.id)
      if (res.success && res.data) {
        const o = res.data
        setContinuingOrderId(o.id)
        setExistingOrder(o)
        setExistingItemsExpanded(false)
        setSelectedTable(table)
        const disp =
          o.user && (o.user.first_name || o.user.last_name)
            ? `${o.user.first_name} ${o.user.last_name}`.trim()
            : o.user?.username ?? '—'
        setDineInSession({
          guestCount: Math.max(1, o.guest_count ?? 1),
          serverId: o.user_id ?? '',
          serverDisplayName: disp,
        })
        setCart([])
        setOrderNotes('')
        toastHelpers.success('Open order loaded', `Adding items to #${o.order_number}`)
      }
    } catch {
      toastHelpers.error('Table', 'Could not load the open order for this table.')
    }
  }

  const handleSubmitCart = () => {
    if (cart.length === 0 || !canUseCart) return
    if (orderType === 'dine_in' && (!selectedTable || !dineInSession)) return
    submitCartMutation.mutate()
  }

  const selectPaymentOrder = (order: Order) => {
    setSelectedOrder(order)
    const intent = order.checkout_payment_method ?? 'cash'
    setPaymentCheckoutIntent(intent)
    checkoutIntentMutation.mutate({ orderId: order.id, intent })
  }

  const paymentTotals = useMemo(() => {
    if (!payOrder) return null
    return computeCartTotals(
      payOrder.subtotal,
      payOrder.discount_amount,
      paymentCheckoutIntent,
      pricing
    )
  }, [payOrder, paymentCheckoutIntent, pricing])

  const onPaymentIntent = (intent: 'cash' | 'card' | 'online') => {
    if (!selectedOrder) return
    setPaymentCheckoutIntent(intent)
    checkoutIntentMutation.mutate({ orderId: selectedOrder.id, intent })
  }

  const remaining =
    payOrder &&
    (payOrder.total_amount -
      (payOrder.payments?.filter((p) => p.status === 'completed').reduce((s, p) => s + p.amount, 0) ?? 0))

  const payAmount = remaining ?? 0

  const billableItems: OrderItem[] = useMemo(() => {
    const items = payOrder?.items ?? []
    return items.filter((i) => i.status !== 'voided')
  }, [payOrder?.items])

  const runCardPayment = () => {
    if (!selectedOrder || payAmount <= 0) return
    processPaymentMutation.mutate({
      orderId: selectedOrder.id,
      paymentData: {
        payment_method: 'credit_card',
        amount: payAmount,
        reference_number: referenceNumber || undefined,
      },
    })
  }

  const runOnlinePayment = () => {
    if (!selectedOrder || payAmount <= 0) return
    processPaymentMutation.mutate({
      orderId: selectedOrder.id,
      paymentData: {
        payment_method: 'online',
        amount: payAmount,
        reference_number: referenceNumber || undefined,
      },
    })
  }

  const runCashPayment = () => {
    if (!selectedOrder || payAmount <= 0) return
    const received = parseFloat(cashReceived || '0')
    if (received < payAmount) return
    processPaymentMutation.mutate({
      orderId: selectedOrder.id,
      paymentData: { payment_method: 'cash', amount: payAmount },
    })
    setCashModalOpen(false)
    setCashReceived('')
  }

  const changeDue =
    cashReceived && selectedOrder ? Math.max(0, parseFloat(cashReceived || '0') - payAmount) : 0

  return (
    <div className="flex h-screen bg-background">
      <TableSessionModal
        open={sessionModalOpen}
        table={selectedTable}
        onOpenChange={setSessionModalOpen}
        onConfirm={(s) => setDineInSession(s)}
      />

      <KotPrintModal open={kotPrintOpen} onOpenChange={setKotPrintOpen} kots={lastFireKots} />

      {cashModalOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card border border-border rounded-xl shadow-lg max-w-md w-full p-6 space-y-4">
            <h3 className="text-xl font-semibold">Cash payment</h3>
            <p className="text-muted-foreground text-sm">Amount due: {formatCurrency(payAmount)}</p>
            <div>
              <Label>Amount received</Label>
              <Input
                className="h-12 text-2xl font-bold mt-1"
                inputMode="decimal"
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="text-3xl font-bold text-center py-2">
              Change due: {formatCurrency(changeDue)}
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setCashModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={parseFloat(cashReceived || '0') < payAmount || processPaymentMutation.isPending}
                onClick={runCashPayment}
              >
                Complete
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="w-2/3 border-r border-border overflow-hidden flex flex-col min-w-0">
        <div className="p-4 border-b border-border bg-card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold">Counter / Checkout</h1>
              <p className="text-muted-foreground">Create orders and process payments</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant={activeTab === 'create' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTab('create')}
              >
                Create Order
              </Button>
              <Button
                variant={activeTab === 'payment' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTab('payment')}
              >
                Process Payment
              </Button>
            </div>
          </div>

          {activeTab === 'create' && (
            <>
              <div className="flex gap-2 mb-4 flex-wrap">
                <Button
                  variant={orderType === 'dine_in' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setOrderType('dine_in')
                    setDineInSession(null)
                    setSelectedTable(null)
                  }}
                >
                  <Users className="w-4 h-4 mr-1" />
                  Dine-In
                </Button>
                <Button
                  variant={orderType === 'takeout' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setOrderType('takeout')
                    setDineInSession(null)
                    setSelectedTable(null)
                  }}
                >
                  <Package className="w-4 h-4 mr-1" />
                  Takeout
                </Button>
                <Button
                  variant={orderType === 'delivery' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setOrderType('delivery')
                    setDineInSession(null)
                    setSelectedTable(null)
                  }}
                >
                  <Car className="w-4 h-4 mr-1" />
                  Delivery
                </Button>
              </div>

              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-11"
                />
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1">
                <Button
                  variant={selectedCategory === 'all' ? 'default' : 'outline'}
                  size="sm"
                  className="shrink-0"
                  onClick={() => setSelectedCategory('all')}
                >
                  All
                </Button>
                {(categories as Category[]).map((category) => (
                  <Button
                    key={category.id}
                    variant={selectedCategory === category.id ? 'default' : 'outline'}
                    size="sm"
                    className="shrink-0"
                    onClick={() => setSelectedCategory(category.id)}
                  >
                    {category.name}
                  </Button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {activeTab === 'create' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
              {filteredProducts.map((product) => {
                const cat = product.category_id ? categoryById.get(product.category_id) : undefined
                const bg = categoryColor(cat, product.name)
                const disabled = !product.is_available || !canUseCart
                return (
                  <button
                    key={product.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => addToCart(product)}
                    className="rounded-lg border border-border text-left p-3 min-h-[88px] flex flex-col justify-between transition-opacity disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98] shadow-sm"
                    style={{ background: `linear-gradient(135deg, ${bg}22 0%, var(--card) 55%)` }}
                  >
                    <span className="font-semibold text-sm leading-tight line-clamp-2">{product.name}</span>
                    <span className="text-base font-bold text-primary mt-1">{formatCurrency(product.price)}</span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Orders ready for payment</h3>
              {pendingOrders.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Receipt className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No orders ready for payment</p>
                </div>
              ) : (
                pendingOrders.map((order) => (
                  <button
                    key={order.id}
                    type="button"
                    disabled={checkoutIntentMutation.isPending}
                    className={`w-full text-left rounded-lg border p-4 transition-all ${
                      selectedOrder?.id === order.id ? 'ring-2 ring-primary border-primary' : 'border-border hover:bg-muted/50'
                    }`}
                    onClick={() => selectPaymentOrder(order)}
                  >
                    <div className="flex justify-between gap-2">
                      <div>
                        <div className="font-semibold">#{order.order_number}</div>
                        <div className="text-sm text-muted-foreground">
                          {order.table?.table_number && `Table ${order.table.table_number} · `}
                          {order.items?.length ?? 0} items
                        </div>
                      </div>
                      <div className="text-lg font-bold">{formatCurrency(order.total_amount)}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <div className="w-1/3 flex flex-col flex-1 min-h-0 bg-card border-l border-border min-w-[320px]">
        {activeTab === 'create' ? (
          <>
            <div className="shrink-0 p-4 border-b border-border space-y-3">
              {orderType === 'dine_in' ? (
                <>
                  <div className="grid grid-cols-3 gap-2 max-h-[200px] overflow-y-auto">
                    {sortedTables.map((table) => {
                      const occ = table.has_active_order ?? table.is_occupied
                      return (
                        <Button
                          key={table.id}
                          type="button"
                          variant={selectedTable?.id === table.id ? 'default' : 'outline'}
                          className={cn(
                            'h-14 flex-col text-xs',
                            occ &&
                              'opacity-95 border-emerald-400/70 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/35 dark:border-emerald-700/80 dark:text-emerald-100'
                          )}
                          onClick={() => {
                            if (occ) void handleOccupiedTable(table)
                            else handleFreeTable(table)
                          }}
                        >
                          {table.table_number}
                          <span className="opacity-80">
                            {occ ? 'Open · add items' : `${table.seating_capacity} seats`}
                          </span>
                        </Button>
                      )
                    })}
                  </div>
                  {selectedTable && dineInSession && (
                    <div className="rounded-md bg-muted/60 p-3 text-sm space-y-1">
                      <div>
                        <span className="text-muted-foreground">Table </span>
                        <span className="font-semibold">{selectedTable.table_number}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Guests </span>
                        <span className="font-semibold">{dineInSession.guestCount}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Server / Waiter </span>
                        <span className="font-semibold">{dineInSession.serverDisplayName}</span>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div>
                  <Label className="text-sm">Customer (optional)</Label>
                  <Input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="mt-1 h-11"
                  />
                </div>
              )}

            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
              {existingOrder?.items && existingOrder.items.filter((i) => i.status !== 'voided').length > 0 && (
                <div className="rounded-md border border-border bg-muted/20">
                  <button
                    type="button"
                    onClick={() => setExistingItemsExpanded((prev) => !prev)}
                    className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/40 transition-colors rounded-md"
                  >
                    <span className="text-sm font-medium">
                      Order #{existingOrder.order_number} items ({existingOrder.items.filter((i) => i.status !== 'voided').length})
                    </span>
                    {existingItemsExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                  {existingItemsExpanded && (
                    <div className="px-3 pb-3 space-y-2">
                      {existingOrder.items
                        .filter((i) => i.status !== 'voided')
                        .map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between gap-2 py-1.5 text-sm border-b border-border last:border-0"
                          >
                            <div className="flex-1 min-w-0">
                              <span className="truncate">{item.product?.name ?? 'Item'}</span>
                              <span className="text-muted-foreground ml-2">x{item.quantity}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-muted-foreground">{formatCurrency(item.total_price)}</span>
                              <span
                                className={cn(
                                  'text-xs px-1.5 py-0.5 rounded capitalize',
                                  item.status === 'sent' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
                                  item.status === 'preparing' && 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
                                  item.status === 'ready' && 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
                                  item.status === 'served' && 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                                )}
                              >
                                {item.status}
                              </span>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}

              <h3 className="font-semibold flex items-center gap-2">
                <ShoppingCart className="w-4 h-4" />
                {continuingOrderId ? 'New items' : 'Cart'} ({cart.length})
              </h3>
              {cart.length === 0 ? (
                <p className="text-muted-foreground text-sm">Cart is empty</p>
              ) : (
                <div className="space-y-2">
                  {cart.map((item) => (
                    <div
                      key={item.product.id}
                      className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/40"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate text-sm">{item.product.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatCurrency(item.product.price)} each
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => removeFromCart(item.product.id)}>
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="w-8 text-center font-medium">{item.quantity}</span>
                        <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => addToCart(item.product)}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {cart.length > 0 && (
                <div className="mt-4">
                  <Label className="text-sm">Notes</Label>
                  <Input
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    className="mt-1"
                    placeholder="Optional"
                  />
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="shrink-0 p-4 border-t border-border space-y-3">
                <div className="text-sm font-medium text-muted-foreground">Payment type (for tax preview)</div>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ['cash', 'Cash'],
                      ['card', 'Card'],
                      ['online', 'Online'],
                    ] as const
                  ).map(([k, label]) => (
                    <Button
                      key={k}
                      type="button"
                      size="sm"
                      variant={createCheckoutIntent === k ? 'default' : 'outline'}
                      className="h-12"
                      onClick={() => setCreateCheckoutIntent(k)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>{formatCurrency(cartSubtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Service charge</span>
                    <span>{formatCurrency(cartTotals.service)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tax ({(cartTotals.taxRate * 100).toFixed(0)}%)</span>
                    <span>{formatCurrency(cartTotals.tax)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold pt-2 border-t border-border">
                    <span>Total</span>
                    <span>{formatCurrency(cartTotals.total)}</span>
                  </div>
                </div>

                <Button
                  className="w-full h-14 text-lg"
                  disabled={
                    !canUseCart ||
                    cart.length === 0 ||
                    submitCartMutation.isPending ||
                    (orderType === 'dine_in' && (!selectedTable || !dineInSession))
                  }
                  onClick={handleSubmitCart}
                >
                  {submitCartMutation.isPending ? (
                    'Sending…'
                  ) : (
                    <>
                      <Check className="w-5 h-5 mr-2" />
                      {continuingOrderId ? 'Add items & fire KOT' : 'Place order'}
                    </>
                  )}
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full">
            {selectedOrder && payOrder ? (
              <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="p-4 border-b border-border space-y-2 shrink-0">
                  <div className="font-semibold text-lg">#{payOrder.order_number}</div>
                  {payOrder.table?.table_number && (
                    <div className="text-sm text-muted-foreground">
                      Table {payOrder.table.table_number}
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2 pt-2">
                    <Button
                      type="button"
                      size="lg"
                      className="h-14 text-base"
                      variant={paymentCheckoutIntent === 'cash' ? 'default' : 'outline'}
                      onClick={() => onPaymentIntent('cash')}
                    >
                      <DollarSign className="w-5 h-5 mr-1" />
                      CASH
                    </Button>
                    <Button
                      type="button"
                      size="lg"
                      className="h-14 text-base"
                      variant={paymentCheckoutIntent === 'card' ? 'default' : 'outline'}
                      onClick={() => onPaymentIntent('card')}
                    >
                      <CreditCard className="w-5 h-5 mr-1" />
                      CARD
                    </Button>
                    <Button
                      type="button"
                      size="lg"
                      className="h-14 text-base"
                      variant={paymentCheckoutIntent === 'online' ? 'default' : 'outline'}
                      onClick={() => onPaymentIntent('online')}
                    >
                      <Globe className="w-5 h-5 mr-1" />
                      ONLINE
                    </Button>
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-4 border-b border-border">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    Items charged
                  </div>
                  {billableItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {paymentOrderFetching ? 'Loading line items…' : 'No billable line items.'}
                    </p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {billableItems.map((line) => (
                        <li
                          key={line.id}
                          className="flex justify-between gap-3 border-b border-border/60 pb-2 last:border-0 last:pb-0"
                        >
                          <div className="min-w-0">
                            <div className="font-medium leading-tight">
                              {line.product?.name ?? 'Item'} × {line.quantity}
                            </div>
                            {line.special_instructions ? (
                              <div className="text-xs text-muted-foreground truncate">{line.special_instructions}</div>
                            ) : null}
                          </div>
                          <div className="shrink-0 font-medium tabular-nums">{formatCurrency(line.total_price)}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="p-4 space-y-2 text-sm shrink-0">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>{formatCurrency(payOrder.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Discount</span>
                    <span>-{formatCurrency(payOrder.discount_amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Service</span>
                    <span>{formatCurrency(payOrder.service_charge_amount ?? paymentTotals?.service ?? 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>
                      Tax ({paymentTotals ? (paymentTotals.taxRate * 100).toFixed(0) : '—'}%)
                    </span>
                    <span>{formatCurrency(payOrder.tax_amount)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold pt-2 border-t border-border">
                    <span>Total</span>
                    <span>{formatCurrency(payOrder.total_amount)}</span>
                  </div>

                  <div className="pt-2 space-y-2">
                    <Label className="text-xs text-muted-foreground">Discount (counter)</Label>
                    <div className="flex gap-2">
                      <div className="grid grid-cols-2 gap-1 shrink-0">
                        <Button
                          type="button"
                          size="sm"
                          variant={discountMode === 'amount' ? 'default' : 'outline'}
                          className="h-9"
                          onClick={() => setDiscountMode('amount')}
                        >
                          $
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={discountMode === 'percent' ? 'default' : 'outline'}
                          className="h-9"
                          onClick={() => setDiscountMode('percent')}
                        >
                          %
                        </Button>
                      </div>
                      <Input
                        inputMode="decimal"
                        className="h-9"
                        placeholder={discountMode === 'percent' ? 'e.g. 10' : '0.00'}
                        value={discountValue}
                        onChange={(e) => setDiscountValue(e.target.value)}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-9 shrink-0"
                        disabled={discountMutation.isPending}
                        onClick={() => {
                          const raw = parseFloat(discountValue || '0')
                          if (Number.isNaN(raw) || raw < 0) return
                          if (discountMode === 'percent') {
                            if (raw === 0) {
                              discountMutation.mutate({ orderId: selectedOrder.id, discount_amount: 0 })
                            } else {
                              discountMutation.mutate({ orderId: selectedOrder.id, discount_percent: raw })
                            }
                          } else {
                            discountMutation.mutate({
                              orderId: selectedOrder.id,
                              discount_amount: raw,
                            })
                          }
                        }}
                      >
                        Apply
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Enter 0 and apply to clear discount.</p>
                  </div>
                </div>

                <div className="p-4 border-t border-border space-y-3 mt-auto shrink-0">
                  <div className="text-xs text-muted-foreground">
                    Reference (card / online optional)
                  </div>
                  <Input
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder="Txn / ref / Easypass id"
                  />
                  <Button
                    className="w-full h-14 text-lg"
                    variant="default"
                    disabled={payAmount <= 0 || processPaymentMutation.isPending}
                    onClick={() => {
                      if (paymentCheckoutIntent === 'cash') setCashModalOpen(true)
                      else if (paymentCheckoutIntent === 'card') runCardPayment()
                      else runOnlinePayment()
                    }}
                  >
                    {paymentCheckoutIntent === 'cash' && (
                      <>
                        <DollarSign className="w-5 h-5 mr-2" />
                        Pay {formatCurrency(payAmount)} — Cash
                      </>
                    )}
                    {paymentCheckoutIntent === 'card' && (
                      <>
                        <CreditCard className="w-5 h-5 mr-2" />
                        Pay {formatCurrency(payAmount)} — Card
                      </>
                    )}
                    {paymentCheckoutIntent === 'online' && (
                      <>
                        <Globe className="w-5 h-5 mr-2" />
                        Pay {formatCurrency(payAmount)} — Online
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground p-8">
                <div className="text-center">
                  <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Select an order</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
