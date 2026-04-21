import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TableSessionModal, type TableSession } from '@/components/counter/TableSessionModal'
import { KotPrintModal } from '@/components/counter/KotPrintModal'
import { CounterPaymentPanel } from '@/components/counter/CounterPaymentPanel'
import { CounterOrderTypeToggle } from '@/components/counter/CounterOrderTypeToggle'
import { TicketHeader } from '@/components/counter/rail/TicketHeader'
import { getTicketLifecycle, orderPayableRemaining } from '@/components/counter/rail/ticketState'
import { SentItemsSection } from '@/components/counter/rail/SentItemsSection'
import { UnsentItemsSection } from '@/components/counter/rail/UnsentItemsSection'
import { CashTenderPad } from '@/components/counter/rail/CashTenderPad'
import { ActionFooter } from '@/components/counter/rail/ActionFooter'
import { TablesPicker } from '@/components/counter/TablesPicker'
import {
  CounterCheckoutSuccessOverlay,
  type CheckoutCelebrationMode,
} from '@/components/counter/CounterCheckoutSuccessOverlay'
import {
  CounterGuestDetailsSection,
  toGuestDateInputValue,
} from '@/components/counter/CounterGuestDetailsSection'
import { CounterOrderHistorySection } from '@/components/counter/CounterOrderHistorySection'
import { CounterTableServiceSection } from '@/components/counter/CounterTableServiceSection'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Link } from '@tanstack/react-router'
import { useCounterHotkeys } from '@/hooks/useCounterHotkeys'
import { useEnabledOrderTypes } from '@/hooks/useEnabledOrderTypes'
import { computeCartTotals, mergePricingSettings } from '@/lib/counterPricing'
import { subscribeOrderReady } from '@/lib/kdsRealtime'
import { cn } from '@/lib/utils'
import { useCurrency } from '@/contexts/CurrencyContext'
import { toastHelpers } from '@/lib/toast-helpers'
import { getCashierNameFromStorage, parseReceiptSettings, printCustomerReceipt, type CustomerReceiptSettings } from '@/lib/printCustomerReceipt'
import { printPraTaxInvoice } from '@/lib/printPraTaxInvoice'
import { PraInvoicePromptModal } from '@/components/counter/PraInvoicePromptModal'
import {
  Search,
  Package,
  GripVertical,
  UtensilsCrossed,
} from 'lucide-react'
import { format } from 'date-fns'
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

// orderPayableRemaining + lifecycle helpers live in rail/ticketState

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
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [guestBirthday, setGuestBirthday] = useState('')
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
  /**
   * Context for the post-payment PRA tax invoice prompt. When non-null, the
   * PraInvoicePromptModal is shown; the captured order/settings/payment are
   * reused to build the second slip without re-querying the server.
   */
  const [praPromptContext, setPraPromptContext] = useState<{
    order: Order
    settings: CustomerReceiptSettings
    paymentMethod: string
    paidAt: Date
  } | null>(null)
  const [praPrinting, setPraPrinting] = useState(false)
  /** Full-screen thank-you after a completed payment (customer-facing terminal). */
  const [checkoutCelebration, setCheckoutCelebration] = useState<CheckoutCelebrationMode | null>(null)
  const [historyReadOnlyOrder, setHistoryReadOnlyOrder] = useState<Order | null>(null)
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
  const [tableTransferOpen, setTableTransferOpen] = useState(false)
  const [tablesPickerOpen, setTablesPickerOpen] = useState(false)
  /**
   * Inline affirmation after items fire to the kitchen. Replaces the previous
   * floating "Add-on sent" toast that overlapped the Totals + primary CTA in
   * the ticket rail. Auto-clears after a few seconds.
   */
  const [firedConfirmation, setFiredConfirmation] = useState<
    { count: number; mode: 'new' | 'continue' } | null
  >(null)
  const firedConfirmationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /**
   * Inline banner shown above the remaining-balance row inside the checkout
   * dialog after a partial payment is recorded. Replaces a toast that would
   * otherwise float away from the operator's point of focus.
   */
  const [partialPaymentBanner, setPartialPaymentBanner] = useState<string | null>(null)

  const [checkoutRailPx, setCheckoutRailPx] = useState(readCheckoutRailWidth)
  const counterSplitRef = useRef<HTMLDivElement>(null)
  const railDragRef = useRef<{ startX: number; startW: number; maxW: number } | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const railScrollRef = useRef<HTMLDivElement>(null)

  const queryClient = useQueryClient()
  const { formatCurrency } = useCurrency()

  const { enabledIds: enabledOrderTypeIds } = useEnabledOrderTypes()

  // If an admin disables the currently-selected order type mid-session,
  // auto-switch to the first enabled type and clear transient session state
  // (table, customer, checkout) so the cashier isn't stuck on a hidden tab.
  // Mirrors the reset logic in CounterOrderTypeToggle's onChange handler below.
  useEffect(() => {
    if (enabledOrderTypeIds.size === 0) return
    if (enabledOrderTypeIds.has(orderType)) return
    const fallback = (['dine_in', 'takeout', 'delivery'] as const).find((t) =>
      enabledOrderTypeIds.has(t)
    )
    if (!fallback) return
    setOrderType(fallback)
    setDineInSession(null)
    setSelectedTable(null)
    setCheckoutOpen(false)
    setSelectedOrder(null)
    setCustomerName('')
    setCustomerEmail('')
    setCustomerPhone('')
    setGuestBirthday('')
  }, [enabledOrderTypeIds, orderType])

  const dismissCheckoutCelebration = useCallback(() => {
    setCheckoutCelebration(null)
  }, [])

  // Mark this route so the shadcn ToastViewport repositions to top-center
  // (see index.css -> body[data-counter-route="true"]). The default bottom-right
  // viewport would otherwise overlap the Totals + primary CTA on the checkout rail.
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.body.setAttribute('data-counter-route', 'true')
    return () => {
      document.body.removeAttribute('data-counter-route')
    }
  }, [])

  // Clear the partial-payment affirmation whenever the checkout dialog closes
  // or the operator switches to a different order so a stale banner never
  // leaks across tickets.
  useEffect(() => {
    if (!checkoutOpen) setPartialPaymentBanner(null)
  }, [checkoutOpen, selectedOrder?.id])

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
      if (firedConfirmationTimeoutRef.current != null) {
        clearTimeout(firedConfirmationTimeoutRef.current)
        firedConfirmationTimeoutRef.current = null
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
      // Include any non-terminal order with a payable balance so the
      // "Orders to close" strip is meaningful for all order types:
      //  - dine_in tabs that are still open and owe money
      //  - takeout orders ready/served waiting to be rung out
      //  - delivery orders pending close-out
      // Terminal states (completed, cancelled) are excluded; fully-paid
      // tickets are filtered out via orderPayableRemaining so the strip
      // only shows tickets that genuinely need to be closed.
      const OPEN_STATUSES = new Set(['pending', 'confirmed', 'preparing', 'ready', 'served'])
      return list.filter(
        (o) => OPEN_STATUSES.has(o.status) && orderPayableRemaining(o) > 0
      )
    },
  })

  const ordersToCloseStrip = useMemo(
    () => pendingOrders.filter((o) => o.order_type === orderType),
    [orderType, pendingOrders]
  )

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
    mutationFn: async (): Promise<{
      orderId: string
      mode: 'new' | 'continue'
      itemCount: number
    }> => {
      const lines = cart.map((item) => ({
        product_id: item.product.id,
        quantity: item.quantity,
        special_instructions: item.special_instructions,
      }))
      const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0)
      if (orderType === 'dine_in' && !continuingOrderId) {
        throw new Error('Confirm the table session first (order was not opened).')
      }
      if (continuingOrderId) {
        const res = await apiClient.addItemsToOrder(continuingOrderId, lines)
        if (!res.success) {
          throw new Error(res.message || 'Could not add items to order')
        }
        return { orderId: continuingOrderId, mode: 'continue', itemCount }
      }
      const orderData: CreateOrderRequest = {
        table_id: orderType === 'dine_in' ? selectedTable?.id : undefined,
        customer_name: customerName.trim() || undefined,
        customer_email: customerEmail.trim() || undefined,
        customer_phone: customerPhone.trim() || undefined,
        guest_birthday: guestBirthday.trim() || undefined,
        order_type: orderType,
        guest_count: orderType === 'dine_in' ? (dineInSession?.guestCount ?? 0) : 0,
        assigned_server_id:
          orderType === 'dine_in' && dineInSession?.serverId
            ? dineInSession.serverId
            : undefined,
        items: lines,
        notes: orderNotes || undefined,
      }
      const res = await apiClient.createCounterOrder(orderData)
      if (!res.success || !res.data?.id) {
        throw new Error(res.message || 'Could not create order')
      }
      return { orderId: res.data.id, mode: 'new', itemCount }
    },
    onSuccess: async (result) => {
      setCart([])
      setOrderNotes('')
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['tables'] })
      queryClient.invalidateQueries({ queryKey: ['counterPendingOrders'] })

      try {
        const fr = await apiClient.fireKOT(result.orderId)
        if (!fr.success) {
          toastHelpers.error('Kitchen (KOT)', fr.message || 'Could not send order to the kitchen.')
        } else {
          // Inline affirmation in the ticket header instead of a floating toast
          // that would overlap the Totals + primary CTA on the checkout rail.
          if (firedConfirmationTimeoutRef.current != null) {
            clearTimeout(firedConfirmationTimeoutRef.current)
          }
          setFiredConfirmation({ count: result.itemCount, mode: result.mode })
          firedConfirmationTimeoutRef.current = setTimeout(() => {
            setFiredConfirmation(null)
            firedConfirmationTimeoutRef.current = null
          }, 3500)
          setLastFireKots(fr.data?.kots)
          setKotPrintOpen(true)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Request failed'
        toastHelpers.error('Kitchen (KOT)', msg)
      }
      queryClient.invalidateQueries({ queryKey: ['newEnhancedKitchenOrders'] })

      const ref = await apiClient.getOrder(result.orderId)
      if (ref.success && ref.data && ref.data.status !== 'completed' && ref.data.status !== 'cancelled') {
        const od = ref.data
        setExistingOrder(od)
        setContinuingOrderId(od.id)
        // Keep checkout / payment rail in sync with fired items (was stale until full refresh).
        setSelectedOrder((prev) => (prev?.id === od.id ? od : prev))
        queryClient.setQueryData(['order', od.id, 'payment-panel'], od)
        setExistingItemsExpanded(false)
        setCustomerName(od.customer_name ?? '')
        setCustomerEmail(od.customer_email ?? '')
        setCustomerPhone(od.customer_phone ?? '')
        setGuestBirthday(toGuestDateInputValue(od.guest_birthday))
        if (orderType === 'dine_in') {
          setDineInSession((prev) => {
            const disp =
              od.user && (od.user.first_name || od.user.last_name)
                ? `${od.user.first_name} ${od.user.last_name}`.trim()
                : od.user?.username ?? ''
            const base: TableSession = prev ?? {
              guestCount: 0,
              serverId: '',
              serverDisplayName: '',
              customerName: undefined,
              customerEmail: undefined,
              customerPhone: undefined,
              guestBirthday: undefined,
            }
            return {
              ...base,
              guestCount: od.guest_count ?? 0,
              serverId: od.user_id ?? '',
              serverDisplayName: disp,
              customerName: od.customer_name ?? undefined,
              customerEmail: od.customer_email ?? undefined,
              customerPhone: od.customer_phone ?? undefined,
              guestBirthday: toGuestDateInputValue(od.guest_birthday) || undefined,
            }
          })
        }
      }
    },
  })

  const processPaymentMutation = useMutation({
    mutationFn: async ({
      orderId,
      paymentData,
    }: {
      orderId: string
      paymentData: ProcessPaymentRequest
    }) => {
      const res = await apiClient.processCounterPayment(orderId, paymentData)
      if (!res.success) {
        throw new Error(res.message || 'Payment could not be processed')
      }
      return res
    },
    onError: (err: Error) => {
      toastHelpers.error('Payment', err.message || 'Payment failed')
    },
    onSuccess: async (_data, variables) => {
      let orderAfter: Order | null = null
      try {
        const orderRes = await apiClient.getOrder(variables.orderId)
        if (orderRes.success && orderRes.data) orderAfter = orderRes.data
      } catch {
        /* order fetch optional for branching */
      }

      // If we cannot refetch, assume check closed (payment API already succeeded).
      const fullyPaid = orderAfter == null ? true : orderAfter.status === 'completed'

      if (fullyPaid) {
        setCheckoutCelebration(orderType)
        setPartialPaymentBanner(null)
        setSelectedOrder(null)
        setCheckoutOpen(false)
        setCashModalOpen(false)
        setCashReceived('')
        setReferenceNumber('')
        setDiscountValue('')
        setExistingOrder(null)
        setContinuingOrderId(null)
        setSelectedTable(null)
        setDineInSession(null)
        setCustomerName('')
        setCustomerEmail('')
        setCustomerPhone('')
        setGuestBirthday('')
        setCart([])
        setExistingItemsExpanded(false)
        queryClient.removeQueries({ queryKey: ['order', variables.orderId, 'payment-panel'] })
      } else {
        // Inline banner inside the checkout dialog (above the remaining-balance
        // ledger) rather than a floating toast that pulls the operator's eye
        // away from the payment rail.
        setPartialPaymentBanner(
          orderAfter
            ? 'Remaining balance still due on this check.'
            : 'Refresh the order if totals look wrong.'
        )
        setCashModalOpen(false)
        setCashReceived('')
        setReferenceNumber('')
        if (orderAfter) {
          setSelectedOrder(orderAfter)
          setExistingOrder((prev) => (prev?.id === orderAfter.id ? orderAfter : prev))
          queryClient.setQueryData(['order', variables.orderId, 'payment-panel'], orderAfter)
          setCustomerName(orderAfter.customer_name ?? '')
          setCustomerEmail(orderAfter.customer_email ?? '')
          setCustomerPhone(orderAfter.customer_phone ?? '')
          setGuestBirthday(toGuestDateInputValue(orderAfter.guest_birthday))
          if (orderAfter.order_type === 'dine_in') {
            setDineInSession((prev) => {
              const disp =
                orderAfter.user && (orderAfter.user.first_name || orderAfter.user.last_name)
                  ? `${orderAfter.user.first_name} ${orderAfter.user.last_name}`.trim()
                  : orderAfter.user?.username ?? ''
              const base: TableSession = prev ?? {
                guestCount: 0,
                serverId: '',
                serverDisplayName: '',
                customerName: undefined,
                customerEmail: undefined,
                customerPhone: undefined,
                guestBirthday: undefined,
              }
              return {
                ...base,
                guestCount: orderAfter.guest_count ?? 0,
                serverId: orderAfter.user_id ?? '',
                serverDisplayName: disp,
                customerName: orderAfter.customer_name ?? base.customerName,
                customerEmail: orderAfter.customer_email ?? base.customerEmail,
                customerPhone: orderAfter.customer_phone ?? base.customerPhone,
                guestBirthday:
                  toGuestDateInputValue(orderAfter.guest_birthday) || base.guestBirthday,
              }
            })
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['counterPendingOrders'] })
      queryClient.invalidateQueries({ queryKey: ['tables'] })

      try {
        const orderRes =
          orderAfter != null
            ? { success: true as const, data: orderAfter }
            : await apiClient.getOrder(variables.orderId)
        const settingsRes = await queryClient.fetchQuery({
          queryKey: ['settings', 'all'],
          queryFn: () => apiClient.getAllSettings(),
        })
        if (orderRes.success && orderRes.data && settingsRes.success && settingsRes.data) {
          const paidAt = new Date()
          const paymentMethod = variables.paymentData.payment_method
          const receiptSettings = parseReceiptSettings(
            settingsRes.data as Record<string, unknown>,
          )
          printCustomerReceipt(orderRes.data, receiptSettings, {
            cashierName: getCashierNameFromStorage(),
            paymentMethod,
            paidAt,
            formatAmount: formatCurrency,
          })

          // If the PRA tax invoice feature is enabled and the order is fully
          // paid (status: completed), surface the post-payment prompt. Skip
          // stays the default path — we never auto-print the PRA slip.
          if (
            receiptSettings.praInvoiceEnabled &&
            orderRes.data.status === 'completed'
          ) {
            setPraPromptContext({
              order: orderRes.data,
              settings: receiptSettings,
              paymentMethod,
              paidAt,
            })
          }
        }
      } catch {
        /* receipt is optional */
      }
    },
  })

  /**
   * Dismiss the PRA tax invoice prompt without printing — the main receipt
   * already went to the printer, nothing else needs to happen.
   */
  const handlePraSkip = useCallback(() => {
    setPraPromptContext(null)
  }, [])

  /**
   * Print the PRA tax invoice slip, persist the print event, then dismiss.
   * Persistence failures don't block the printed slip — the receipt is
   * already in the customer's hand, so we log rather than surface an error.
   */
  const handlePraPrint = useCallback(async () => {
    if (!praPromptContext || praPrinting) return
    setPraPrinting(true)
    try {
      const { order, settings, paymentMethod, paidAt } = praPromptContext
      const { invoiceNumber, printed } = await printPraTaxInvoice(order, settings, {
        cashierName: getCashierNameFromStorage(),
        paymentMethod,
        paidAt,
        formatAmount: formatCurrency,
      })
      // Only record the print event when the print window actually opened.
      // If the browser's popup blocker intercepted the window, the cashier
      // still sees the prompt close — but we do not lie to the audit trail.
      if (printed) {
        try {
          await apiClient.markPraInvoicePrinted(order.id, invoiceNumber || undefined)
          queryClient.invalidateQueries({ queryKey: ['orders'] })
          queryClient.invalidateQueries({ queryKey: ['order', order.id] })
        } catch {
          /* audit log is best-effort; print already succeeded */
        }
      }
    } finally {
      setPraPrinting(false)
      setPraPromptContext(null)
    }
  }, [praPromptContext, praPrinting, formatCurrency, queryClient])

  const checkoutIntentMutation = useMutation({
    mutationFn: ({
      orderId,
      intent,
    }: {
      orderId: string
      intent: 'cash' | 'card' | 'online'
    }) => apiClient.updateCheckoutIntent(orderId, { checkout_payment_method: intent }),
    onSuccess: (res, variables) => {
      if (res.success && res.data) {
        const order = res.data
        setSelectedOrder(order)
        queryClient.setQueryData(['order', variables.orderId, 'payment-panel'], order)
        // Keep the rail "On order" section in sync whenever checkout intent updates;
        // the returned order is always the ticket being rung out (variables.orderId).
        if (order.id === variables.orderId) {
          setExistingOrder(order)
        }
      }
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
      if (res.success && res.data) {
        setSelectedOrder(res.data)
        setExistingOrder((prev) => (prev?.id === res.data!.id ? res.data! : prev))
      }
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

  const tableStats = useMemo(() => {
    let open = 0
    let free = 0
    for (const t of sortedTables) {
      const occ = t.has_active_order ?? t.is_occupied
      if (occ) open += 1
      else free += 1
    }
    return { total: sortedTables.length, open, free }
  }, [sortedTables])

  const canUseCart =
    orderType !== 'dine_in' ||
    (selectedTable !== null && dineInSession !== null) ||
    Boolean(
      continuingOrderId &&
        existingOrder?.id === continuingOrderId &&
        existingOrder.order_type === 'dine_in'
    )

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
          guestCount: o.guest_count ?? 0,
          serverId: o.user_id ?? '',
          serverDisplayName: disp,
          customerName: o.customer_name,
          customerEmail: o.customer_email,
          customerPhone: o.customer_phone,
          guestBirthday: o.guest_birthday,
        })
        setCustomerName(o.customer_name ?? '')
        setCustomerEmail(o.customer_email ?? '')
        setCustomerPhone(o.customer_phone ?? '')
        setGuestBirthday(toGuestDateInputValue(o.guest_birthday))
        setCart([])
        setOrderNotes('')
        // Intentionally no toast: the rail immediately re-renders with the loaded
        // order (order number, items, table badge) — the UI itself is the affirmation.
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
        ...(s.serverId ? { assigned_server_id: s.serverId } : {}),
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
      setCustomerName(s.customerName ?? res.data.customer_name ?? '')
      setCustomerEmail(s.customerEmail ?? res.data.customer_email ?? '')
      setCustomerPhone(s.customerPhone ?? res.data.customer_phone ?? '')
      setGuestBirthday(s.guestBirthday ?? toGuestDateInputValue(res.data.guest_birthday))
      setSessionModalOpen(false)
      // Intentionally no toast: the newly-opened tab appears in the rail header
      // (order number, table badge, guest/server meta) as visible confirmation.
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

  const reassignTableMutation = useMutation({
    mutationFn: ({ orderId, tableId }: { orderId: string; tableId: string }) =>
      apiClient.reassignCounterOrderTable(orderId, { table_id: tableId }),
    onSuccess: (res) => {
      if (!res.success || !res.data) {
        toastHelpers.error('Change table', res.message || 'Could not reassign table')
        return
      }
      setExistingOrder(res.data)
      setSelectedTable(res.data.table ?? null)
      setTableTransferOpen(false)
      queryClient.invalidateQueries({ queryKey: ['tables'] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['counterPendingOrders'] })
      // Intentionally no toast: the table badge in the ticket header flips to the
      // new table number, which is clearer than a floating banner.
    },
    onError: (e: Error) => {
      toastHelpers.error('Change table', e.message || 'Request failed')
    },
  })

  const handleSubmitCart = () => {
    if (cart.length === 0 || !canUseCart) return
    submitCartMutation.mutate()
  }

  const selectPaymentOrder = (order: Order) => {
    setCheckoutOpen(true)
    setSelectedOrder(order)
    const intent = order.checkout_payment_method ?? 'cash'
    setPaymentCheckoutIntent(intent)
    checkoutIntentMutation.mutate({ orderId: order.id, intent })
  }

  /**
   * Apply a fetched active order to counter rail state (continuing tab, guests,
   * dine-in table session). Does not open/close checkout — callers decide.
   */
  const applyActiveOrderToCounterState = useCallback(
    (od: Order) => {
      setExistingOrder(od)
      setContinuingOrderId(od.id)
      setExistingItemsExpanded(false)
      setCustomerName(od.customer_name ?? '')
      setCustomerEmail(od.customer_email ?? '')
      setCustomerPhone(od.customer_phone ?? '')
      setGuestBirthday(toGuestDateInputValue(od.guest_birthday))
      if (od.order_type === 'dine_in') {
        const tbl =
          (od.table_id ? sortedTables.find((t) => t.id === od.table_id) : undefined) ?? od.table ?? null
        if (tbl) {
          setSelectedTable(tbl)
          const disp =
            od.user && (od.user.first_name || od.user.last_name)
              ? `${od.user.first_name} ${od.user.last_name}`.trim()
              : od.user?.username ?? '—'
          setDineInSession({
            guestCount: od.guest_count ?? 0,
            serverId: od.user_id ?? '',
            serverDisplayName: disp,
            customerName: od.customer_name ?? undefined,
            customerEmail: od.customer_email ?? undefined,
            customerPhone: od.customer_phone ?? undefined,
            guestBirthday: toGuestDateInputValue(od.guest_birthday) || undefined,
          })
        } else {
          setSelectedTable(null)
          setDineInSession(null)
          if (od.table_id) {
            toastHelpers.error(
              'Table',
              'Could not resolve this check’s table on the floor map. Use Pick a table.'
            )
          }
        }
      } else {
        setSelectedTable(null)
        setDineInSession(null)
      }
    },
    [sortedTables]
  )

  /** Load full ticket context then open payment — fixes dine-in menu when using Orders to close. */
  const ordersStripCheckoutMutation = useMutation({
    mutationFn: async ({
      order,
      orderTypeAtClick,
    }: {
      order: Order
      orderTypeAtClick: typeof orderType
    }) => {
      const r = await apiClient.getOrder(order.id)
      if (!r.success || !r.data) {
        throw new Error(r.message || 'Could not load order')
      }
      return { od: r.data, orderTypeAtClick }
    },
    onSuccess: ({ od, orderTypeAtClick }) => {
      if (od.order_type !== orderTypeAtClick) {
        toastHelpers.error(
          'Orders',
          `Switch to ${od.order_type === 'dine_in' ? 'Dine-in' : od.order_type} mode to work this ticket.`
        )
        return
      }
      applyActiveOrderToCounterState(od)
      setCart([])
      setOrderNotes('')
      selectPaymentOrder(od)
    },
    onError: (e: Error) => {
      toastHelpers.error('Orders', e.message || 'Could not load order')
    },
  })

  const handleGuestUpdated = useCallback((order: Order) => {
    setExistingOrder(order)
    setSelectedOrder((prev) => (prev?.id === order.id ? order : prev))
    setCustomerName(order.customer_name ?? '')
    setCustomerEmail(order.customer_email ?? '')
    setCustomerPhone(order.customer_phone ?? '')
    setGuestBirthday(toGuestDateInputValue(order.guest_birthday))
    setDineInSession((prev) =>
      prev && orderType === 'dine_in'
        ? {
            ...prev,
            customerName: order.customer_name ?? undefined,
            customerEmail: order.customer_email ?? undefined,
            customerPhone: order.customer_phone ?? undefined,
            guestBirthday: toGuestDateInputValue(order.guest_birthday) || undefined,
          }
        : prev
    )
  }, [orderType])

  const handleServiceUpdated = useCallback((order: Order) => {
    setExistingOrder(order)
    setSelectedOrder((prev) => (prev?.id === order.id ? order : prev))
    const disp =
      order.user && (order.user.first_name || order.user.last_name)
        ? `${order.user.first_name} ${order.user.last_name}`.trim()
        : order.user?.username ?? ''
    setDineInSession((prev) =>
      prev && orderType === 'dine_in'
        ? {
            ...prev,
            guestCount: order.guest_count ?? 0,
            serverId: order.user_id ?? '',
            serverDisplayName: disp,
          }
        : prev
    )
  }, [orderType])

  const handleSelectHistoryOrder = useCallback(
    async (o: Order) => {
      if (o.status === 'completed' || o.status === 'cancelled') {
        const full = await apiClient.getOrder(o.id)
        setHistoryReadOnlyOrder(full.success && full.data ? full.data : o)
        return
      }
      const r = await apiClient.getOrder(o.id)
      if (!r.success || !r.data) {
        toastHelpers.error('Orders', r.message || 'Could not load order')
        return
      }
      const od = r.data
      if (od.order_type !== orderType) {
        toastHelpers.error(
          'Orders',
          `Switch to ${od.order_type === 'dine_in' ? 'Dine-in' : od.order_type} mode to work this ticket.`
        )
        return
      }
      setCheckoutOpen(false)
      setSelectedOrder(null)
      applyActiveOrderToCounterState(od)
      // Intentionally no toast: the rail re-renders with the loaded ticket's
      // order number, items, and status — the UI itself is the affirmation.
    },
    [orderType, applyActiveOrderToCounterState]
  )

  const openTableTransferDialog = () => {
    if (!existingOrder?.id) return
    setTableTransferOpen(true)
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

  const ticketLifecycle = useMemo(
    () =>
      getTicketLifecycle({
        order: existingOrder ?? payOrder,
        cartCount: cart.length,
        checkoutOpen,
        payableRemaining: payAmount,
      }),
    [existingOrder, payOrder, cart.length, checkoutOpen, payAmount]
  )

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
      let lastShift = e.shiftKey
      const onMove = (ev: MouseEvent) => {
        const d = railDragRef.current
        if (!d) return
        lastShift = ev.shiftKey
        const delta = d.startX - ev.clientX
        const nw = d.startW + delta
        setCheckoutRailPx(Math.min(d.maxW, Math.max(COUNTER_RAIL_MIN, Math.round(nw))))
      }
      const SNAP_POINTS = [400, 480, 560, 640]
      const onUp = () => {
        const useSnap = !lastShift
        railDragRef.current = null
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        document.body.style.removeProperty('-webkit-user-select')
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        setCheckoutRailPx((w) => {
          const cw2 = counterSplitRef.current?.getBoundingClientRect().width ?? 1200
          let next = clampCheckoutRail(w, cw2)
          if (useSnap) {
            const snap = SNAP_POINTS.reduce((acc, p) =>
              Math.abs(p - next) < Math.abs(acc - next) ? p : acc
            , next)
            if (Math.abs(snap - next) <= 22) next = clampCheckoutRail(snap, cw2)
          }
          try {
            localStorage.setItem(COUNTER_CHECKOUT_RAIL_KEY, String(next))
          } catch {
            /* ignore */
          }
          return next
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

  useEffect(() => {
    if (!checkoutOpen) return
    const t = window.setTimeout(() => {
      const firstTender = document.querySelector<HTMLButtonElement>(
        '[aria-labelledby="tender-input-heading"] button[aria-pressed]'
      )
      firstTender?.focus()
    }, 40)
    return () => window.clearTimeout(t)
  }, [checkoutOpen])

  const handleCounterEscape = useCallback(() => {
    if (historyReadOnlyOrder) {
      setHistoryReadOnlyOrder(null)
      return
    }
    if (checkoutCelebration != null) {
      dismissCheckoutCelebration()
      return
    }
    if (cashModalOpen) {
      setCashModalOpen(false)
      setCashReceived('')
      return
    }
    if (checkoutOpen) {
      setCheckoutOpen(false)
      setSelectedOrder(null)
    }
  }, [historyReadOnlyOrder, checkoutCelebration, dismissCheckoutCelebration, cashModalOpen, checkoutOpen])

  useCounterHotkeys({
    onSend: () => {
      if (cart.length === 0 || !canUseCart) return
      submitCartMutation.mutate()
    },
    onPay: () => {
      if (existingOrder && continuingOrderId && !checkoutOpen && orderPayableRemaining(existingOrder) > 0) {
        selectPaymentOrder(existingOrder)
      }
    },
    onFocusDiscount: () => {
      if (!checkoutOpen) return
      const el = document.querySelector<HTMLInputElement>(
        'input[placeholder^="e.g. 10"], input[placeholder="0.00"]'
      )
      el?.focus()
    },
    onEscape: handleCounterEscape,
    onFocusSearch: () => searchInputRef.current?.focus(),
    onOpenTables: () => {
      if (orderType !== 'dine_in') return
      setTablesPickerOpen(true)
    },
    onFocusCart: () => {
      railScrollRef.current?.scrollTo({ top: railScrollRef.current.scrollHeight, behavior: 'smooth' })
    },
  })

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-row bg-background">
      <TableSessionModal
        open={sessionModalOpen}
        table={selectedTable}
        onOpenChange={setSessionModalOpen}
        onConfirm={handleTableSessionConfirm}
      />

      <TablesPicker
        open={tablesPickerOpen}
        onOpenChange={setTablesPickerOpen}
        mode="select"
        tables={sortedTables}
        currentTableId={selectedTable?.id ?? null}
        onSelectFreeTable={handleFreeTable}
        onSelectOccupiedTable={(table) => {
          void handleOccupiedTable(table)
        }}
      />

      <TablesPicker
        open={tableTransferOpen}
        onOpenChange={setTableTransferOpen}
        mode="transfer"
        tables={sortedTables}
        currentTableId={selectedTable?.id ?? null}
        onSelectFreeTable={handleFreeTable}
        onSelectOccupiedTable={(table) => {
          void handleOccupiedTable(table)
        }}
        onConfirmTransfer={(table) => {
          if (!existingOrder?.id) return
          reassignTableMutation.mutate({ orderId: existingOrder.id, tableId: table.id })
        }}
        isTransferring={reassignTableMutation.isPending}
      />

      <KotPrintModal open={kotPrintOpen} onOpenChange={setKotPrintOpen} kots={lastFireKots} />

      <PraInvoicePromptModal
        open={praPromptContext != null}
        onSkip={handlePraSkip}
        onPrint={handlePraPrint}
        busy={praPrinting}
      />

      {checkoutCelebration != null && (
        <CounterCheckoutSuccessOverlay
          mode={checkoutCelebration}
          onDismiss={dismissCheckoutCelebration}
        />
      )}

      <Dialog open={historyReadOnlyOrder != null} onOpenChange={(open) => !open && setHistoryReadOnlyOrder(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {historyReadOnlyOrder ? `Order #${historyReadOnlyOrder.order_number}` : 'Order'}
            </DialogTitle>
            <DialogDescription className="space-y-1 text-left">
              <span className="block capitalize text-muted-foreground">
                {historyReadOnlyOrder?.status?.replace('_', ' ')} ·{' '}
                {historyReadOnlyOrder && formatCurrency(historyReadOnlyOrder.total_amount)}
              </span>
              {historyReadOnlyOrder?.created_at && (
                <span className="block text-xs text-muted-foreground">
                  {format(new Date(historyReadOnlyOrder.created_at), "MMM d, yyyy 'at' h:mm a")}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This ticket is closed. Use order history above to find open checks, or open{' '}
            <Link
              to="/admin/reports"
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              Reports
            </Link>{' '}
            for deeper analysis.
          </p>
          {historyReadOnlyOrder?.pra_invoice_printed ? (
            <div className="mt-2 flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium">PRA tax invoice printed</p>
                {historyReadOnlyOrder.pra_invoice_number ? (
                  <p className="text-[11px] text-muted-foreground truncate">
                    Invoice #{historyReadOnlyOrder.pra_invoice_number}
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={praPrinting}
                onClick={async () => {
                  if (!historyReadOnlyOrder) return
                  setPraPrinting(true)
                  try {
                    const settingsRes = await queryClient.fetchQuery({
                      queryKey: ['settings', 'all'],
                      queryFn: () => apiClient.getAllSettings(),
                    })
                    if (!settingsRes.success || !settingsRes.data) return
                    const cfg = parseReceiptSettings(
                      settingsRes.data as Record<string, unknown>,
                    )
                    const paidAt = historyReadOnlyOrder.completed_at
                      ? new Date(historyReadOnlyOrder.completed_at)
                      : new Date()
                    const method =
                      historyReadOnlyOrder.checkout_payment_method ?? 'cash'
                    const { invoiceNumber, printed } = await printPraTaxInvoice(
                      historyReadOnlyOrder,
                      cfg,
                      {
                        cashierName: getCashierNameFromStorage(),
                        paymentMethod: method,
                        paidAt,
                        formatAmount: formatCurrency,
                      },
                    )
                    if (printed) {
                      try {
                        await apiClient.markPraInvoicePrinted(
                          historyReadOnlyOrder.id,
                          invoiceNumber || undefined,
                        )
                        queryClient.invalidateQueries({ queryKey: ['orders'] })
                        queryClient.invalidateQueries({
                          queryKey: ['order', historyReadOnlyOrder.id],
                        })
                      } catch {
                        /* audit log is best-effort */
                      }
                    }
                  } finally {
                    setPraPrinting(false)
                  }
                }}
              >
                {praPrinting ? 'Printing…' : 'Reprint PRA'}
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <div ref={counterSplitRef} className="flex h-full min-h-0 min-w-0 flex-1 flex-row self-stretch">
        <main
          aria-label="Counter workspace"
          className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-r border-border bg-background"
        >
        <div className="shrink-0 border-b border-border bg-card/95 px-6 py-6 backdrop-blur-sm">
          <div className="mb-3">
            <h1 className="text-3xl font-bold tracking-tight">Checkout Counter</h1>
            <p className="mt-1 text-muted-foreground">
              Choose order type, then add items from the menu
            </p>
          </div>

          <div className="mb-4">
            {enabledOrderTypeIds.size === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                No order types are currently enabled. Ask an admin to enable at least one
                order type under Settings &rarr; Order Types.
              </div>
            ) : (
              <CounterOrderTypeToggle
                value={orderType}
                enabledIds={enabledOrderTypeIds}
                onChange={(next) => {
                  setOrderType(next)
                  setDineInSession(null)
                  setSelectedTable(null)
                  setCheckoutOpen(false)
                  setSelectedOrder(null)
                  setCustomerName('')
                  setCustomerEmail('')
                  setCustomerPhone('')
                  setGuestBirthday('')
                }}
              />
            )}
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
                    disabled={
                      checkoutIntentMutation.isPending || ordersStripCheckoutMutation.isPending
                    }
                    onClick={() =>
                      ordersStripCheckoutMutation.mutate({ order, orderTypeAtClick: orderType })
                    }
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
              ref={searchInputRef}
              placeholder="Search products... (press /)"
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
          {filteredProducts.length === 0 && searchTerm.trim().length > 0 ? (
            <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
              <p className="text-sm font-medium">No products match &ldquo;{searchTerm}&rdquo;.</p>
              <p className="text-xs text-muted-foreground">
                Try a different keyword or clear the search box.
              </p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2" aria-hidden>
              {Array.from({ length: 10 }).map((_, idx) => (
                <div
                  key={`skeleton-${idx}`}
                  className="h-[108px] rounded-lg border border-border bg-muted/40 animate-pulse"
                />
              ))}
            </div>
          ) : (
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
          )}
        </div>
        </main>

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

        <aside
          aria-label="Ticket"
          style={{ width: checkoutRailPx, maxWidth: '100%' }}
          className="grid h-full min-h-0 min-w-0 shrink-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden border-l border-border bg-gradient-to-b from-card via-card to-muted/[0.35] shadow-[inset_1px_0_0_0_hsl(var(--border))]"
        >
          <div className="shrink-0 space-y-3 bg-card/90 backdrop-blur-sm">
            <TicketHeader
              orderType={orderType}
              selectedTable={selectedTable}
              existingOrder={existingOrder}
              dineInSession={dineInSession}
              customerName={customerName || existingOrder?.customer_name || ''}
              checkoutOpen={checkoutOpen}
              lifecycle={ticketLifecycle}
              continuingOrderId={continuingOrderId}
              firedConfirmation={firedConfirmation}
              onChangeTable={existingOrder && continuingOrderId ? openTableTransferDialog : undefined}
              onCloseCheckout={checkoutOpen ? () => {
                setCheckoutOpen(false)
                setSelectedOrder(null)
              } : undefined}
            />
            <div className="space-y-3 border-b border-border/80 px-4 pb-3 sm:px-5 sm:pb-4">
              {orderType === 'dine_in' ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Tables
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
                      <span>
                        {tableStats.open} open · {tableStats.free} free
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant={selectedTable ? 'outline' : 'default'}
                        className="h-8 gap-1.5"
                        onClick={() => setTablesPickerOpen(true)}
                      >
                        <UtensilsCrossed className="h-3.5 w-3.5" aria-hidden />
                        {selectedTable ? 'Change' : 'Pick a table'}
                      </Button>
                    </div>
                  </div>
                  {selectedTable && dineInSession && (
                    <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3 text-sm">
                      {existingOrder?.is_open_tab && !existingOrder.kot_first_sent_at && continuingOrderId && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full"
                          disabled={cancelOpenTabMutation.isPending}
                          onClick={() => cancelOpenTabMutation.mutate(continuingOrderId)}
                        >
                          Cancel session
                        </Button>
                      )}
                      {existingOrder &&
                        continuingOrderId &&
                        !checkoutOpen &&
                        orderPayableRemaining(existingOrder) > 0 && (
                          <Button
                            type="button"
                            className="h-10 w-full text-sm font-semibold"
                            onClick={() => selectPaymentOrder(existingOrder)}
                          >
                            Checkout / Pay
                          </Button>
                        )}
                    </div>
                  )}
                </>
              ) : (
                existingOrder && (
                  <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3 text-sm">
                    <div className="text-xs text-muted-foreground">
                      Active ticket{' '}
                      <span className="font-semibold text-foreground">#{existingOrder.order_number}</span>
                    </div>
                    {continuingOrderId &&
                      !checkoutOpen &&
                      orderPayableRemaining(existingOrder) > 0 && (
                        <Button
                          type="button"
                          className="h-10 w-full text-sm font-semibold"
                          onClick={() => selectPaymentOrder(existingOrder)}
                        >
                          Checkout / Pay
                        </Button>
                      )}
                  </div>
                )
              )}

              {orderType === 'dine_in' && (
                <CounterTableServiceSection
                  existingOrder={existingOrder}
                  onServiceUpdated={handleServiceUpdated}
                />
              )}

              <CounterGuestDetailsSection
                customerName={customerName}
                setCustomerName={setCustomerName}
                customerEmail={customerEmail}
                setCustomerEmail={setCustomerEmail}
                customerPhone={customerPhone}
                setCustomerPhone={setCustomerPhone}
                guestBirthday={guestBirthday}
                setGuestBirthday={setGuestBirthday}
                existingOrder={existingOrder}
                onGuestUpdated={handleGuestUpdated}
              />

              <CounterOrderHistorySection
                orderType={orderType}
                formatCurrency={formatCurrency}
                onSelectOrder={handleSelectHistoryOrder}
              />
            </div>
            </div>

            <div
              ref={railScrollRef}
              className="counter-checkout-rail-scroll flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5"
              aria-label="Order and checkout"
            >
              {checkoutOpen && selectedOrder && payOrder && (
                <section className="space-y-3">
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
                      if (paymentCheckoutIntent === 'cash') {
                        setCashModalOpen(true)
                        if (!cashReceived) setCashReceived(payAmount.toFixed(2))
                      } else if (paymentCheckoutIntent === 'card') runCardPayment()
                      else runOnlinePayment()
                    }}
                    partialPaymentBanner={partialPaymentBanner}
                    onDismissPartialPaymentBanner={() => setPartialPaymentBanner(null)}
                  />

                  {cashModalOpen && (
                    <CashTenderPad
                      amountDue={payAmount}
                      received={cashReceived}
                      onReceivedChange={setCashReceived}
                      onCancel={() => {
                        setCashModalOpen(false)
                        setCashReceived('')
                      }}
                      onComplete={runCashPayment}
                      formatCurrency={formatCurrency}
                      processing={processPaymentMutation.isPending}
                    />
                  )}
                </section>
              )}

              <SentItemsSection
                order={existingOrder}
                categoryById={categoryById}
                categoryColor={categoryColor}
                formatCurrency={formatCurrency}
                defaultExpanded={existingItemsExpanded}
              />

              <UnsentItemsSection
                cart={cart}
                categoryById={categoryById}
                categoryColor={categoryColor}
                formatCurrency={formatCurrency}
                continuing={Boolean(continuingOrderId)}
                onIncrement={addToCart}
                onDecrement={removeFromCart}
                flashProductId={lastCartFlashProductId}
                cartRowRefs={cartRowRefs}
                notes={orderNotes}
                onNotesChange={setOrderNotes}
                liveAnnouncementId={cartLiveAnnouncement.id}
                liveAnnouncementText={cartLiveAnnouncement.text}
              />
            </div>

            <div className="border-t border-border/90 bg-card/95 backdrop-blur-md">
              {cart.length > 0 && !checkoutOpen && (
                <div className="px-4 pt-3 sm:px-5">
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Payment type (tax preview)
                  </div>
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
                        className="h-10 min-w-0 px-2 text-sm font-semibold"
                        onClick={() => setCreateCheckoutIntent(k)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              <ActionFooter
                mode={cart.length > 0 ? 'compose' : checkoutOpen ? 'checkout' : 'idle'}
                totals={
                  cart.length === 0
                    ? null
                    : {
                        subtotal: cartSubtotal,
                        service: cartTotals.service,
                        tax: cartTotals.tax,
                        taxRate: cartTotals.taxRate,
                        serviceRate: cartTotals.serviceRate,
                        total: cartTotals.total,
                      }
                }
                showCloseCheckoutWithCompose={checkoutOpen}
                formatCurrency={formatCurrency}
                primaryLabel={continuingOrderId ? 'Add items & fire KOT' : 'Place order & Fire'}
                onPrimary={handleSubmitCart}
                primaryDisabled={
                  !canUseCart ||
                  cart.length === 0 ||
                  submitCartMutation.isPending ||
                  (orderType === 'dine_in' &&
                    !continuingOrderId &&
                    (!selectedTable || !dineInSession))
                }
                primaryPending={submitCartMutation.isPending}
                disabledHint={
                  cart.length === 0 && !checkoutOpen
                    ? orderType === 'dine_in' && !selectedTable
                      ? 'Pick a table to start a session.'
                      : 'Add items to enable the primary action.'
                    : undefined
                }
                onCloseCheckout={() => {
                  setCheckoutOpen(false)
                  setSelectedOrder(null)
                }}
              />
            </div>
        </aside>
      </div>
    </div>
  )
}
