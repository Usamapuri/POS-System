import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TableSessionModal, type TableSession } from '@/components/counter/TableSessionModal'
import { KotPrintModal } from '@/components/counter/KotPrintModal'
import { CounterPaymentPanel } from '@/components/counter/CounterPaymentPanel'
import { CounterOrderTypeToggle } from '@/components/counter/CounterOrderTypeToggle'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  Check,
  Search,
  Package,
  ChevronDown,
  ChevronUp,
  Info,
  GripVertical,
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
  const raw = cat?.color?.trim()
  if (raw) {
    if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(raw)) return raw
    if (/^[0-9A-Fa-f]{6}$/.test(raw)) return `#${raw}`
    if (/^[0-9A-Fa-f]{3}$/.test(raw)) {
      const [a, b, c] = raw.split('')
      return `#${a}${a}${b}${b}${c}${c}`
    }
  }
  let h = 0
  const s = (cat?.name ?? fallback) || 'x'
  for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i) * 17) % 360
  return `hsl(${h} 45% 42%)`
}

/** Gradient tint that works for both hex and hsl() from categoryColor */
function categorySurfaceStyle(accent: string): { background: string } {
  return {
    background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 30%, var(--card)) 0%, var(--card) 58%)`,
  }
}

/** ~30% lighter: blend 30% toward white (RGB) or raise HSL lightness by 30% of distance to 100%. */
const ACCENT_LIGHTEN = 0.3

function lightenAccent(accent: string): string {
  const t = accent.trim()
  const hex6 = t.match(/^#([0-9A-Fa-f]{6})$/i)
  const hex3 = t.match(/^#([0-9A-Fa-f]{3})$/i)
  const mix = (c: number) => Math.round(c + (255 - c) * ACCENT_LIGHTEN)
  if (hex6) {
    const n = parseInt(hex6[1], 16)
    const r = mix((n >> 16) & 255)
    const g = mix((n >> 8) & 255)
    const b = mix(n & 255)
    return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`
  }
  if (hex3) {
    const [a, c, d] = hex3[1].split('')
    const r = mix(parseInt(a + a, 16))
    const g = mix(parseInt(c + c, 16))
    const b = mix(parseInt(d + d, 16))
    return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`
  }
  const hsl = t.match(/hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/)
  if (hsl) {
    const h = hsl[1]
    const s = hsl[2]
    const l = parseFloat(hsl[3])
    const newL = Math.min(100, l + (100 - l) * ACCENT_LIGHTEN)
    return `hsl(${h} ${s}% ${Math.round(newL * 10) / 10}%)`
  }
  return accent
}

/** Light text on dark accents, dark text on light accents (hex or hsl from categoryColor). */
function pickOnAccentText(accent: string): '#ffffff' | '#0a0a0a' {
  const t = accent.trim()
  const hex6 = t.match(/^#([0-9A-Fa-f]{6})$/i)
  const hex3 = t.match(/^#([0-9A-Fa-f]{3})$/i)
  let r = 90
  let g = 90
  let b = 90
  if (hex6) {
    const n = parseInt(hex6[1], 16)
    r = (n >> 16) & 255
    g = (n >> 8) & 255
    b = n & 255
  } else if (hex3) {
    const [a, c, d] = hex3[1].split('')
    r = parseInt(a + a, 16)
    g = parseInt(c + c, 16)
    b = parseInt(d + d, 16)
  } else {
    const hsl = t.match(/hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/)
    if (hsl) {
      const l = parseFloat(hsl[3])
      return l > 52 ? '#0a0a0a' : '#ffffff'
    }
  }
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return luminance > 0.55 ? '#0a0a0a' : '#ffffff'
}

function orderPayableRemaining(order: Order | null): number {
  if (!order) return 0
  const paid =
    order.payments?.filter((p) => p.status === 'completed').reduce((s, p) => s + p.amount, 0) ?? 0
  return Math.max(0, order.total_amount - paid)
}

const COUNTER_CHECKOUT_RAIL_KEY = 'pos-counter-checkout-rail-px'
const COUNTER_RAIL_DEFAULT = 448
const COUNTER_RAIL_MIN = 300

function readCheckoutRailWidth(): number {
  if (typeof window === 'undefined') return COUNTER_RAIL_DEFAULT
  const raw = localStorage.getItem(COUNTER_CHECKOUT_RAIL_KEY)
  const n = raw ? parseInt(raw, 10) : NaN
  return Number.isFinite(n) && n >= COUNTER_RAIL_MIN ? n : COUNTER_RAIL_DEFAULT
}

export function CounterInterface() {
  const [checkoutOpen, setCheckoutOpen] = useState(false)
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
  /** Brief highlight on product tile after a successful add-to-cart tap. */
  const [lastTappedProductId, setLastTappedProductId] = useState<string | null>(null)
  const tapFlashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Brief highlight on cart row after add / quantity bump (slightly longer than product tile). */
  const [lastCartFlashProductId, setLastCartFlashProductId] = useState<string | null>(null)
  const cartFlashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cartRowRefs = useRef<Record<string, HTMLTableRowElement | null>>({})
  const [cartLiveAnnouncement, setCartLiveAnnouncement] = useState<{ text: string; id: number }>({ text: '', id: 0 })
  const [existingItemsExpanded, setExistingItemsExpanded] = useState(false)

  const [checkoutRailPx, setCheckoutRailPx] = useState(readCheckoutRailWidth)
  const counterSplitRef = useRef<HTMLDivElement>(null)
  const railDragRef = useRef<{ startX: number; startW: number; maxW: number } | null>(null)

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

  useEffect(() => {
    return () => {
      if (tapFlashTimeoutRef.current != null) {
        clearTimeout(tapFlashTimeoutRef.current)
        tapFlashTimeoutRef.current = null
      }
      if (cartFlashTimeoutRef.current != null) {
        clearTimeout(cartFlashTimeoutRef.current)
        cartFlashTimeoutRef.current = null
      }
    }
  }, [])

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

  const ordersToCloseStrip = useMemo(() => {
    if (orderType === 'dine_in') return []
    return pendingOrders.filter((o) => o.order_type === orderType)
  }, [orderType, pendingOrders])

  const { data: paymentOrderDetail, isFetching: paymentOrderFetching } = useQuery({
    queryKey: ['order', selectedOrder?.id, 'payment-panel'],
    queryFn: async () => {
      const r = await apiClient.getOrder(selectedOrder!.id)
      if (!r.success || !r.data) throw new Error(r.message || 'Failed to load order')
      return r.data
    },
    enabled: Boolean(selectedOrder && checkoutOpen),
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
      if (orderType === 'dine_in' && !continuingOrderId) {
        throw new Error('Confirm the table session first (order was not opened).')
      }
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
      setCheckoutOpen(false)
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
    const wasExisting = Boolean(existingItem)
    if (existingItem) {
      setCart(
        cart.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        )
      )
    } else {
      setCart([...cart, { product, quantity: 1 }])
    }
    if (tapFlashTimeoutRef.current != null) clearTimeout(tapFlashTimeoutRef.current)
    setLastTappedProductId(product.id)
    tapFlashTimeoutRef.current = setTimeout(() => {
      tapFlashTimeoutRef.current = null
      setLastTappedProductId((current) => (current === product.id ? null : current))
    }, 180)

    if (cartFlashTimeoutRef.current != null) clearTimeout(cartFlashTimeoutRef.current)
    setLastCartFlashProductId(product.id)
    cartFlashTimeoutRef.current = setTimeout(() => {
      cartFlashTimeoutRef.current = null
      setLastCartFlashProductId((current) => (current === product.id ? null : current))
    }, 280)

    setCartLiveAnnouncement({
      text: wasExisting ? `Updated ${product.name} in cart` : `Added ${product.name} to cart`,
      id: Date.now(),
    })

    requestAnimationFrame(() => {
      cartRowRefs.current[product.id]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
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
    setCheckoutOpen(false)
    setSelectedOrder(null)
    setContinuingOrderId(null)
    setExistingOrder(null)
    setExistingItemsExpanded(false)
    setSelectedTable(table)
    setDineInSession(null)
    setSessionModalOpen(true)
  }

  const handleOccupiedTable = async (table: DiningTable) => {
    setCheckoutOpen(false)
    setSelectedOrder(null)
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
          customerName: o.customer_name,
          customerEmail: o.customer_email,
          customerPhone: o.customer_phone,
          guestBirthday: o.guest_birthday,
        })
        setCart([])
        setOrderNotes('')
        toastHelpers.success('Open order loaded', `Adding items to #${o.order_number}`)
      }
    } catch {
      toastHelpers.error('Table', 'Could not load the open order for this table.')
    }
  }

  const handleTableSessionConfirm = async (s: TableSession) => {
    if (!selectedTable) return
    try {
      const res = await apiClient.openCounterTableTab({
        table_id: selectedTable.id,
        guest_count: s.guestCount,
        assigned_server_id: s.serverId,
        customer_name: s.customerName,
        customer_email: s.customerEmail,
        customer_phone: s.customerPhone,
        guest_birthday: s.guestBirthday,
      })
      if (!res.success || !res.data) {
        toastHelpers.error('Table', res.message || 'Could not open table tab')
        return
      }
      setDineInSession(s)
      setContinuingOrderId(res.data.id)
      setExistingOrder(res.data)
      setSessionModalOpen(false)
      toastHelpers.success('Table opened', `Order #${res.data.order_number}`)
      queryClient.invalidateQueries({ queryKey: ['tables'] })
    } catch (e) {
      toastHelpers.error('Table', e instanceof Error ? e.message : 'Request failed')
    }
  }

  const cancelOpenTabMutation = useMutation({
    mutationFn: (orderId: string) => apiClient.cancelCounterOpenTab(orderId),
    onSuccess: (res) => {
      if (!res.success) {
        toastHelpers.error('Cancel tab', res.message || 'Could not cancel')
        return
      }
      setContinuingOrderId(null)
      setExistingOrder(null)
      setDineInSession(null)
      setSelectedTable(null)
      setCart([])
      setOrderNotes('')
      setCheckoutOpen(false)
      setSelectedOrder(null)
      queryClient.invalidateQueries({ queryKey: ['tables'] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      toastHelpers.success('Session cancelled', 'Table is free again.')
    },
    onError: (e: Error) => {
      toastHelpers.error('Cancel tab', e.message || 'Request failed')
    },
  })

  const handleSubmitCart = () => {
    if (cart.length === 0 || !canUseCart) return
    if (orderType === 'dine_in' && (!selectedTable || !dineInSession)) return
    submitCartMutation.mutate()
  }

  const selectPaymentOrder = (order: Order) => {
    setCheckoutOpen(true)
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

  const clampCheckoutRail = useCallback((w: number, containerWidth: number) => {
    const max = Math.max(
      COUNTER_RAIL_MIN + 160,
      Math.min(820, Math.floor(containerWidth * 0.56))
    )
    return Math.min(max, Math.max(COUNTER_RAIL_MIN, Math.round(w)))
  }, [])

  const beginCheckoutRailDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const root = counterSplitRef.current
      if (!root) return
      const cw = root.getBoundingClientRect().width
      const maxW = Math.max(
        COUNTER_RAIL_MIN + 160,
        Math.min(820, Math.floor(cw * 0.56))
      )
      railDragRef.current = { startX: e.clientX, startW: checkoutRailPx, maxW }
      const onMove = (ev: MouseEvent) => {
        const d = railDragRef.current
        if (!d) return
        const delta = d.startX - ev.clientX
        const nw = d.startW + delta
        setCheckoutRailPx(Math.min(d.maxW, Math.max(COUNTER_RAIL_MIN, Math.round(nw))))
      }
      const onUp = () => {
        railDragRef.current = null
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        document.body.style.removeProperty('-webkit-user-select')
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        setCheckoutRailPx((w) => {
          const cw2 = counterSplitRef.current?.getBoundingClientRect().width ?? 1200
          const clamped = clampCheckoutRail(w, cw2)
          try {
            localStorage.setItem(COUNTER_CHECKOUT_RAIL_KEY, String(clamped))
          } catch {
            /* ignore */
          }
          return clamped
        })
      }
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.body.style.setProperty('-webkit-user-select', 'none')
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [checkoutRailPx, clampCheckoutRail]
  )

  const resetCheckoutRailWidth = useCallback(() => {
    setCheckoutRailPx(COUNTER_RAIL_DEFAULT)
    try {
      localStorage.setItem(COUNTER_CHECKOUT_RAIL_KEY, String(COUNTER_RAIL_DEFAULT))
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    const onResize = () => {
      setCheckoutRailPx((w) => {
        const cw = counterSplitRef.current?.getBoundingClientRect().width ?? 1200
        return clampCheckoutRail(w, cw)
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [clampCheckoutRail])

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-row bg-background">
      <TableSessionModal
        open={sessionModalOpen}
        table={selectedTable}
        onOpenChange={setSessionModalOpen}
        onConfirm={handleTableSessionConfirm}
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

      <div ref={counterSplitRef} className="flex h-full min-h-0 min-w-0 flex-1 flex-row self-stretch">
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-r border-border bg-background">
        <div className="shrink-0 border-b border-border bg-card/95 px-4 py-3 backdrop-blur-sm sm:px-5 sm:py-4">
          <div className="mb-3">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Counter / Checkout</h1>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
              Choose order type, then add items from the menu. Checkout opens from the table session or from orders
              to close.
            </p>
          </div>

          <div className="mb-4">
            <CounterOrderTypeToggle
              value={orderType}
              onChange={(next) => {
                setOrderType(next)
                setDineInSession(null)
                setSelectedTable(null)
                setCheckoutOpen(false)
                setSelectedOrder(null)
              }}
            />
          </div>

          {ordersToCloseStrip.length > 0 && (
            <div className="mb-3">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-xs">
                Orders to close
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {ordersToCloseStrip.map((order) => (
                  <Button
                    key={order.id}
                    type="button"
                    size="sm"
                    variant={selectedOrder?.id === order.id && checkoutOpen ? 'default' : 'outline'}
                    className="shrink-0 h-auto min-h-11 flex-col items-stretch py-2 px-3"
                    disabled={checkoutIntentMutation.isPending}
                    onClick={() => selectPaymentOrder(order)}
                  >
                    <span className="font-semibold">#{order.order_number}</span>
                    <span className="text-xs opacity-90 tabular-nums">{formatCurrency(order.total_amount)}</span>
                  </Button>
                ))}
              </div>
            </div>
          )}

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
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
            {filteredProducts.map((product) => {
                const cat = product.category_id ? categoryById.get(product.category_id) : undefined
                const bg = categoryColor(cat, product.name)
                const disabled = !product.is_available || !canUseCart
                const showTapFlash = lastTappedProductId === product.id
                return (
                  <button
                    key={product.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => addToCart(product)}
                    className={cn(
                      'flex min-h-[108px] flex-col rounded-lg border border-border border-l-4 p-2.5 text-left shadow-sm select-none',
                      'transition-[transform,box-shadow,filter,outline] duration-100 [@media(prefers-reduced-motion:reduce)]:transition-none',
                      'active:scale-[0.96] active:brightness-[0.97] active:ring-2 active:ring-primary/40 active:ring-offset-2 [@media(prefers-reduced-motion:reduce)]:active:scale-100',
                      'disabled:pointer-events-none disabled:opacity-40'
                    )}
                    style={{
                      borderLeftColor: bg,
                      ...categorySurfaceStyle(bg),
                      ...(showTapFlash
                        ? {
                            outline: `2px solid ${bg}`,
                            outlineOffset: '3px',
                            zIndex: 1,
                          }
                        : {}),
                    }}
                  >
                    {/* Right column matches image height (h-20) so price bottom lines up with image bottom */}
                    <div className="flex min-h-0 flex-1 gap-2">
                      <div className="shrink-0">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="h-20 w-20 rounded-md object-cover bg-muted"
                          />
                        ) : (
                          <div className="flex h-20 w-20 items-center justify-center rounded-md bg-gradient-to-r from-orange-400 to-pink-500">
                            <Package className="h-10 w-10 text-white" />
                          </div>
                        )}
                      </div>
                      <div className="flex h-20 min-w-0 flex-1 flex-col overflow-hidden">
                        <span className="min-h-0 flex-1 overflow-hidden text-left text-base font-semibold leading-snug text-foreground line-clamp-3">
                          {product.name}
                        </span>
                        <span className="shrink-0 self-end text-sm font-normal tabular-nums text-primary">
                          {formatCurrency(product.price)}
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })}
          </div>
        </div>
        </div>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={checkoutRailPx}
          aria-valuemin={COUNTER_RAIL_MIN}
          aria-valuemax={820}
          title="Drag to resize checkout panel. Double-click to reset width."
          className="group relative z-10 flex w-3 shrink-0 cursor-col-resize select-none flex-col items-center border-x border-transparent bg-transparent hover:border-border/80 hover:bg-muted/50"
          onMouseDown={beginCheckoutRailDrag}
          onDoubleClick={(e) => {
            e.preventDefault()
            resetCheckoutRailWidth()
          }}
        >
          <span className="sr-only">Resize checkout column</span>
          <div className="pointer-events-none absolute inset-y-10 left-1/2 w-px -translate-x-1/2 rounded-full bg-border group-hover:bg-primary/60" />
          <GripVertical
            className="pointer-events-none relative my-auto h-5 w-5 text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden
          />
        </div>

        <div
          style={{ width: checkoutRailPx, maxWidth: '100%' }}
          className="flex h-full min-h-0 min-w-0 shrink-0 flex-col overflow-hidden border-l border-border bg-gradient-to-b from-card via-card to-muted/[0.35] shadow-[inset_1px_0_0_0_hsl(var(--border))]"
        >
          <div className="shrink-0 space-y-3 border-b border-border/80 bg-card/90 px-4 py-3 backdrop-blur-sm sm:px-5 sm:py-4">
            {orderType === 'dine_in' ? (
              <>
                <div className="grid max-h-[240px] grid-cols-2 gap-2.5 overflow-y-auto overscroll-contain pr-0.5 sm:grid-cols-3">
                  {sortedTables.map((table) => {
                    const occ = table.has_active_order ?? table.is_occupied
                    const previewLines =
                      selectedTable?.id === table.id && existingOrder?.items
                        ? existingOrder.items.filter((i) => i.status !== 'voided')
                        : null
                    return (
                      <div key={table.id} className="relative">
                        <Button
                          type="button"
                          variant={selectedTable?.id === table.id ? 'default' : 'outline'}
                          className={cn(
                            'min-h-[3.75rem] flex-col gap-0.5 px-1.5 py-2 text-sm font-semibold leading-tight w-full sm:min-h-[4rem]',
                            occ && 'pr-9',
                            occ &&
                              'opacity-95 border-emerald-400/70 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/35 dark:border-emerald-700/80 dark:text-emerald-100'
                          )}
                          onClick={() => {
                            if (occ) void handleOccupiedTable(table)
                            else handleFreeTable(table)
                          }}
                        >
                          {table.table_number}
                          <span className="text-[11px] font-medium opacity-80 sm:text-xs">
                            {occ ? 'Open · add items' : `${table.seating_capacity} seats`}
                          </span>
                        </Button>
                        {occ && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="secondary"
                                size="icon"
                                className="absolute right-0.5 top-1/2 h-7 w-7 -translate-y-1/2 z-10 shadow-sm"
                                aria-label="Quick bill preview"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Info className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="w-[min(100vw-2rem,22rem)] p-0"
                              onCloseAutoFocus={(e) => e.preventDefault()}
                            >
                              <div className="p-3 max-h-64 overflow-y-auto space-y-2">
                                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                  Table {table.table_number}
                                </div>
                                {previewLines && previewLines.length > 0 ? (
                                  <table className="w-full text-xs border border-border border-collapse">
                                    <thead>
                                      <tr className="bg-muted/60 border-b border-border">
                                        <th className="text-left font-medium py-1 px-1.5">Item</th>
                                        <th className="text-right font-medium py-1 px-1.5 w-10">Qty</th>
                                        <th className="text-center font-medium py-1 px-1.5 w-16">Status</th>
                                        <th className="text-right font-medium py-1 px-1.5 w-16">Amt</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {previewLines.map((item) => (
                                        <tr key={item.id} className="border-b border-border last:border-b-0">
                                          <td className="py-1 px-1.5 max-w-[100px] truncate">
                                            {item.product?.name ?? 'Item'}
                                          </td>
                                          <td className="py-1 px-1.5 text-right tabular-nums">{item.quantity}</td>
                                          <td className="py-1 px-1.5 text-center text-[10px] capitalize">
                                            {item.status}
                                          </td>
                                          <td className="py-1 px-1.5 text-right tabular-nums">
                                            {formatCurrency(item.total_price)}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                ) : (
                                  <p className="text-xs text-muted-foreground">
                                    Select this table to load the open tab, then open preview again for line items.
                                  </p>
                                )}
                              </div>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    )
                  })}
                </div>
                  {selectedTable && dineInSession && (
                    <div className="space-y-2.5 rounded-xl border border-border/70 bg-muted/30 p-3.5 text-[15px] leading-relaxed shadow-sm ring-1 ring-black/[0.04] dark:bg-muted/20 dark:ring-white/[0.06] sm:p-4">
                      <div>
                        <span className="text-sm text-muted-foreground">Table </span>
                        <span className="text-lg font-semibold tracking-tight">{selectedTable.table_number}</span>
                      </div>
                      {existingOrder && (
                        <div>
                          <span className="text-sm text-muted-foreground">Order </span>
                          <span className="text-lg font-semibold tracking-tight">#{existingOrder.order_number}</span>
                          {existingOrder.table_opened_at && (
                            <span className="mt-1 block text-sm text-muted-foreground">
                              Opened{' '}
                              {new Date(existingOrder.table_opened_at).toLocaleString(undefined, {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })}
                            </span>
                          )}
                        </div>
                      )}
                      <div>
                        <span className="text-sm text-muted-foreground">Guests </span>
                        <span className="font-semibold">{dineInSession.guestCount}</span>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">Server </span>
                        <span className="font-semibold">{dineInSession.serverDisplayName}</span>
                      </div>
                      {(dineInSession.customerName ||
                        dineInSession.customerEmail ||
                        dineInSession.customerPhone ||
                        dineInSession.guestBirthday) && (
                        <div className="space-y-1 border-t border-border/60 pt-2 text-sm">
                          {dineInSession.customerName && (
                            <div>
                              <span className="text-muted-foreground">Guest </span>
                              {dineInSession.customerName}
                            </div>
                          )}
                          {dineInSession.customerEmail && (
                            <div className="truncate" title={dineInSession.customerEmail}>
                              {dineInSession.customerEmail}
                            </div>
                          )}
                          {dineInSession.customerPhone && <div>{dineInSession.customerPhone}</div>}
                          {dineInSession.guestBirthday && <div>Birthday: {dineInSession.guestBirthday}</div>}
                        </div>
                      )}
                      {existingOrder?.is_open_tab && !existingOrder.kot_first_sent_at && continuingOrderId && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full mt-1"
                          disabled={cancelOpenTabMutation.isPending}
                          onClick={() => cancelOpenTabMutation.mutate(continuingOrderId)}
                        >
                          Cancel table session
                        </Button>
                      )}
                      {existingOrder &&
                        continuingOrderId &&
                        !checkoutOpen &&
                        orderPayableRemaining(existingOrder) > 0 && (
                          <Button
                            type="button"
                            className="w-full mt-2 h-11 text-sm font-semibold"
                            onClick={() => selectPaymentOrder(existingOrder)}
                          >
                            Checkout / Pay
                          </Button>
                        )}
                    </div>
                  )}
                </>
              ) : (
                <div>
                  <Label className="text-sm font-medium">Customer (optional)</Label>
                  <Input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="mt-1.5 h-11 text-base"
                  />
                </div>
              )}

            </div>

            <div
              className="counter-checkout-rail-scroll flex min-h-0 flex-1 flex-col gap-5 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5"
              aria-label="Order and checkout"
            >
              {checkoutOpen && selectedOrder && payOrder && (
                <section className="space-y-3">
                  <div className="sticky top-0 z-20 -mx-2 flex items-center justify-between gap-3 border-b border-border/70 bg-gradient-to-b from-card/95 to-card/80 px-2 pb-3 backdrop-blur-md supports-[backdrop-filter]:bg-card/75">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Payment</p>
                      <h3 className="text-base font-semibold tracking-tight sm:text-lg">Checkout</h3>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 font-medium"
                      onClick={() => {
                        setCheckoutOpen(false)
                        setSelectedOrder(null)
                      }}
                    >
                      Close
                    </Button>
                  </div>
                  <CounterPaymentPanel
                    payOrder={payOrder}
                    paymentCheckoutIntent={paymentCheckoutIntent}
                    onPaymentIntent={onPaymentIntent}
                    paymentOrderFetching={paymentOrderFetching}
                    billableItems={billableItems}
                    paymentTotals={paymentTotals}
                    formatCurrency={formatCurrency}
                    payAmount={payAmount}
                    referenceNumber={referenceNumber}
                    onReferenceNumberChange={setReferenceNumber}
                    discountMode={discountMode}
                    onDiscountModeChange={setDiscountMode}
                    discountValue={discountValue}
                    onDiscountValueChange={setDiscountValue}
                    discountMutationPending={discountMutation.isPending}
                    onApplyDiscount={() => {
                      if (!selectedOrder) return
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
                    processPaymentPending={processPaymentMutation.isPending}
                    onPrimaryPay={() => {
                      if (paymentCheckoutIntent === 'cash') setCashModalOpen(true)
                      else if (paymentCheckoutIntent === 'card') runCardPayment()
                      else runOnlinePayment()
                    }}
                  />
                </section>
              )}

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
                    <div className="overflow-x-auto px-2 pb-3">
                      <table className="w-full min-w-[300px] table-fixed border-collapse border border-border text-sm">
                        <colgroup>
                          <col style={{ width: '40%' }} />
                          <col style={{ width: '12%' }} />
                          <col style={{ width: '24%' }} />
                          <col style={{ width: '24%' }} />
                        </colgroup>
                        <thead>
                          <tr className="border-b border-border bg-muted/60">
                            <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Item
                            </th>
                            <th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Qty
                            </th>
                            <th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Amount
                            </th>
                            <th className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {existingOrder.items
                            .filter((i) => i.status !== 'voided')
                            .map((item) => {
                              const exCat = item.product?.category_id
                                ? categoryById.get(item.product.category_id)
                                : undefined
                              const exAccent = categoryColor(exCat, item.product?.name ?? 'Item')
                              return (
                              <tr
                                key={item.id}
                                className="border-b border-border last:border-b-0 border-l-[3px]"
                                style={{
                                  borderLeftColor: exAccent,
                                  backgroundColor: `color-mix(in srgb, ${exAccent} 10%, var(--card))`,
                                }}
                              >
                                <td className="min-w-0 px-2 py-2">
                                  <span className="line-clamp-2 font-medium leading-snug">
                                    {item.product?.name ?? 'Item'}
                                  </span>
                                </td>
                                <td className="px-2 py-2 text-right text-sm tabular-nums">{item.quantity}</td>
                                <td className="px-2 py-2 text-right text-sm font-medium tabular-nums">
                                  {formatCurrency(item.total_price)}
                                </td>
                                <td className="px-2 py-2 text-center">
                                  <span
                                    className={cn(
                                      'inline-block rounded px-1.5 py-0.5 text-[11px] font-medium capitalize sm:text-xs',
                                      item.status === 'sent' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
                                      item.status === 'preparing' &&
                                        'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
                                      item.status === 'ready' &&
                                        'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
                                      item.status === 'served' &&
                                        'bg-muted text-muted-foreground dark:bg-muted/80'
                                    )}
                                  >
                                    {item.status}
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              <span key={cartLiveAnnouncement.id} className="sr-only" aria-live="polite" aria-atomic="true">
                {cartLiveAnnouncement.text}
              </span>
              <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight">
                <ShoppingCart className="h-5 w-5 shrink-0 text-muted-foreground" />
                {continuingOrderId ? 'New items' : 'Cart'} ({cart.length})
              </h3>
              {cart.length === 0 ? (
                <p className="text-muted-foreground text-sm">Cart is empty</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[340px] table-fixed border-collapse text-sm">
                    <colgroup>
                      <col style={{ width: '38%' }} />
                      <col style={{ width: '22%' }} />
                      <col style={{ width: '24%' }} />
                      <col style={{ width: '16%' }} />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-border bg-muted/70">
                        <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Item
                        </th>
                        <th className="px-2 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Rate
                        </th>
                        <th className="px-1 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Qty
                        </th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {cart.map((item) => {
                        const lineTotal = item.product.price * item.quantity
                        const showCartFlash = lastCartFlashProductId === item.product.id
                        const lineCat = item.product.category_id
                          ? categoryById.get(item.product.category_id)
                          : undefined
                        const categoryAccent = categoryColor(lineCat, item.product.name)
                        return (
                          <tr
                            key={item.product.id}
                            ref={(el) => {
                              cartRowRefs.current[item.product.id] = el
                            }}
                            className={cn(
                              'border-b border-border last:border-b-0 border-l-[3px] transition-[box-shadow,filter]',
                              'hover:brightness-[0.985] dark:hover:brightness-[1.04]',
                              showCartFlash &&
                                'ring-1 ring-inset ring-primary/30 animate-pulse [@media(prefers-reduced-motion:reduce)]:animate-none'
                            )}
                            style={{
                              borderLeftColor: categoryAccent,
                              backgroundColor: `color-mix(in srgb, ${categoryAccent} 13%, var(--card))`,
                            }}
                          >
                            <td className="min-w-0 px-3 py-2.5 align-middle">
                              <span className="line-clamp-2 font-medium leading-snug text-foreground">
                                {item.product.name}
                              </span>
                            </td>
                            <td className="px-2 py-2.5 align-middle text-right text-sm tabular-nums text-muted-foreground">
                              {formatCurrency(item.product.price)}
                            </td>
                            <td className="px-1 py-2 align-middle">
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="outline"
                                  className="h-9 w-9 shrink-0 touch-manipulation"
                                  onClick={() => removeFromCart(item.product.id)}
                                  aria-label={`Decrease ${item.product.name}`}
                                >
                                  <Minus className="h-4 w-4" />
                                </Button>
                                <span className="min-w-[1.5rem] text-center text-sm font-semibold tabular-nums">
                                  {item.quantity}
                                </span>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="outline"
                                  className="h-9 w-9 shrink-0 touch-manipulation"
                                  onClick={() => addToCart(item.product)}
                                  aria-label={`Increase ${item.product.name}`}
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 align-middle text-right text-sm font-semibold tabular-nums">
                              {formatCurrency(lineTotal)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
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
              <div className="shrink-0 space-y-3 border-t border-border/90 bg-card/95 px-4 py-4 shadow-[0_-8px_30px_-12px_rgba(0,0,0,0.12)] backdrop-blur-md supports-[backdrop-filter]:bg-card/85 dark:shadow-[0_-8px_30px_-12px_rgba(0,0,0,0.45)] sm:px-5">
                <div className="text-sm font-semibold text-muted-foreground">Payment type (tax preview)</div>
                <div className="grid grid-cols-3 gap-2.5">
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
                      className="h-11 min-w-0 px-2 text-sm font-semibold sm:h-12"
                      onClick={() => setCreateCheckoutIntent(k)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                <div className="space-y-1.5 text-sm leading-relaxed">
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-medium tabular-nums">{formatCurrency(cartSubtotal)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Service charge</span>
                    <span className="font-medium tabular-nums">{formatCurrency(cartTotals.service)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Tax ({(cartTotals.taxRate * 100).toFixed(0)}%)</span>
                    <span className="font-medium tabular-nums">{formatCurrency(cartTotals.tax)}</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2 text-base font-bold tracking-tight sm:text-lg">
                    <span>Total</span>
                    <span className="tabular-nums">{formatCurrency(cartTotals.total)}</span>
                  </div>
                </div>

                <Button
                  className="h-12 w-full text-base font-semibold sm:h-14 sm:text-lg"
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
        </div>
      </div>
    </div>
  )
}
