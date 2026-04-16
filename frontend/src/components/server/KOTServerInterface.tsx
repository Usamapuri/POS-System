import { useReducer, useState, useCallback, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search, Users, ChefHat, Store, Bike, ShoppingBag } from 'lucide-react'
import type { Product, DiningTable, OrderItem, StationKOT } from '@/types'
import { KOTSidebar } from './KOTSidebar'
import { PinEntryModal } from './PinEntryModal'
import { subscribeOrderReady } from '@/lib/kdsRealtime'
import { KotPrintModal } from '@/components/counter/KotPrintModal'
import { toastHelpers } from '@/lib/toast-helpers'
import { isKotUnsentStatus } from './kotConstants'
import { useCurrency } from '@/contexts/CurrencyContext'

interface OrderTypeConfig {
  id: string
  label: string
  enabled: boolean
}

type ItemStatus = 'draft' | 'pending' | 'sent' | 'preparing' | 'ready' | 'served' | 'voided'

export interface KOTItem {
  id: string
  product_id: string
  product_name: string
  quantity: number
  unit_price: number
  special_instructions: string
  status: ItemStatus
  category_id?: string
}

interface KOTState {
  orderId: string | null
  tableId: string | null
  tableName: string | null
  guestCount: number
  items: KOTItem[]
  phase: 'table_select' | 'guest_count' | 'ordering'
  pinModal: { open: boolean; itemId: string | null; itemName: string; qty: number; price: number }
}

type KOTAction =
  | { type: 'SELECT_TABLE'; tableId: string; tableName: string }
  | { type: 'SET_GUEST_COUNT'; guestCount: number }
  | { type: 'ADD_ITEM'; product: Product }
  | { type: 'UPDATE_QTY'; itemId: string; qty: number }
  | { type: 'REMOVE_DRAFT'; itemId: string }
  | { type: 'MARK_SENT'; itemIds: string[] }
  | { type: 'REQUEST_VOID'; itemId: string; itemName: string; qty: number; price: number }
  | { type: 'CONFIRM_VOID'; itemId: string }
  | { type: 'CLOSE_PIN_MODAL' }
  | { type: 'ORDER_CREATED'; orderId: string; items: KOTItem[] }
  | { type: 'SYNC_ITEMS'; items: KOTItem[] }
  | { type: 'RESET' }

const initialState: KOTState = {
  orderId: null,
  tableId: null,
  tableName: null,
  guestCount: 0,
  items: [],
  phase: 'table_select',
  pinModal: { open: false, itemId: null, itemName: '', qty: 0, price: 0 },
}

function kotReducer(state: KOTState, action: KOTAction): KOTState {
  switch (action.type) {
    case 'SELECT_TABLE':
      return { ...state, tableId: action.tableId, tableName: action.tableName, phase: 'guest_count' }
    case 'SET_GUEST_COUNT':
      return { ...state, guestCount: action.guestCount, phase: 'ordering' }
    case 'ADD_ITEM': {
      const existing = state.items.find(
        i => i.product_id === action.product.id && isKotUnsentStatus(i.status)
      )
      if (existing) {
        return {
          ...state,
          items: state.items.map(i =>
            i.id === existing.id ? { ...i, quantity: i.quantity + 1 } : i
          ),
        }
      }
      const newItem: KOTItem = {
        id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        product_id: action.product.id,
        product_name: action.product.name,
        quantity: 1,
        unit_price: action.product.price,
        special_instructions: '',
        status: 'draft',
        category_id: action.product.category_id,
      }
      return { ...state, items: [...state.items, newItem] }
    }
    case 'UPDATE_QTY':
      return {
        ...state,
        items: state.items.map(i =>
          i.id === action.itemId ? { ...i, quantity: Math.max(1, action.qty) } : i
        ),
      }
    case 'REMOVE_DRAFT':
      return { ...state, items: state.items.filter(i => i.id !== action.itemId) }
    case 'MARK_SENT':
      return {
        ...state,
        items: state.items.map(i =>
          action.itemIds.includes(i.id) ? { ...i, status: 'sent' as ItemStatus } : i
        ),
      }
    case 'REQUEST_VOID':
      return {
        ...state,
        pinModal: { open: true, itemId: action.itemId, itemName: action.itemName, qty: action.qty, price: action.price },
      }
    case 'CONFIRM_VOID':
      return {
        ...state,
        items: state.items.map(i =>
          i.id === action.itemId ? { ...i, status: 'voided' as ItemStatus } : i
        ),
        pinModal: { open: false, itemId: null, itemName: '', qty: 0, price: 0 },
      }
    case 'CLOSE_PIN_MODAL':
      return { ...state, pinModal: { open: false, itemId: null, itemName: '', qty: 0, price: 0 } }
    case 'ORDER_CREATED':
      return { ...state, orderId: action.orderId, items: action.items }
    case 'SYNC_ITEMS':
      return { ...state, items: action.items }
    case 'RESET':
      return initialState
    default:
      return state
  }
}

const ORDER_TYPE_ICONS: Record<string, any> = {
  dine_in: Store,
  takeout: ShoppingBag,
  delivery: Bike,
}

export function KOTServerInterface() {
  const [state, dispatch] = useReducer(kotReducer, initialState)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [guestInput, setGuestInput] = useState('')
  const [orderType, setOrderType] = useState<string>('dine_in')
  const [fireBusy, setFireBusy] = useState(false)
  const [kotPrintOpen, setKotPrintOpen] = useState(false)
  const [lastFireKots, setLastFireKots] = useState<StationKOT[] | undefined>(undefined)
  const queryClient = useQueryClient()
  const { formatCurrency } = useCurrency()

  const openKotPrint = (kots: StationKOT[] | undefined) => {
    setLastFireKots(kots)
    setKotPrintOpen(true)
  }

  useEffect(() => {
    return subscribeOrderReady((e) => {
      toastHelpers.success(
        'Ready for pickup',
        `Order #${e.orderNumber} — kitchen bumped (${Math.floor(e.completionSeconds / 60)}m ${e.completionSeconds % 60}s)`
      )
      queryClient.invalidateQueries({ queryKey: ['tables'] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    })
  }, [queryClient])

  const { data: enabledOrderTypes = [] } = useQuery<OrderTypeConfig[]>({
    queryKey: ['settings', 'enabled_order_types'],
    queryFn: async () => {
      const res = await apiClient.getSetting('enabled_order_types')
      if (res.success && res.data) {
        return (res.data as OrderTypeConfig[]).filter(t => t.enabled)
      }
      return [{ id: 'dine_in', label: 'Dine In', enabled: true }]
    },
  })

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await apiClient.getCategories()
      return res.data || []
    },
  })

  const { data: products = [] } = useQuery({
    queryKey: ['products', selectedCategory],
    queryFn: async () => {
      let res
      if (selectedCategory === 'all') {
        res = await apiClient.getProducts()
      } else {
        res = await apiClient.getProductsByCategory(selectedCategory)
      }
      return res.data || []
    },
  })

  const { data: tables = [] } = useQuery({
    queryKey: ['tables'],
    queryFn: async () => {
      const res = await apiClient.getTables()
      return res.data || []
    },
  })

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      const draftItems = state.items.filter(i => isKotUnsentStatus(i.status))
      const res = await apiClient.createOrder({
        table_id: state.tableId!,
        order_type: 'dine_in',
        guest_count: state.guestCount,
        items: draftItems.map(i => ({
          product_id: i.product_id,
          quantity: i.quantity,
          special_instructions: i.special_instructions || undefined,
        })),
      })
      return res
    },
    onSuccess: (res) => {
      if (res.success && res.data) {
        const order = res.data
        const mappedItems: KOTItem[] = (order.items || []).map((oi: OrderItem) => ({
          id: oi.id,
          product_id: oi.product_id,
          product_name: oi.product?.name || '',
          quantity: oi.quantity,
          unit_price: oi.unit_price,
          special_instructions: oi.special_instructions || '',
          status: oi.status as ItemStatus,
          category_id: oi.product?.category_id,
        }))
        dispatch({ type: 'ORDER_CREATED', orderId: order.id, items: mappedItems })
        queryClient.invalidateQueries({ queryKey: ['tables'] })
      }
    },
  })

  const addItemsMutation = useMutation({
    mutationFn: async () => {
      const draftItems = state.items.filter(i => isKotUnsentStatus(i.status))
      return apiClient.addItemsToOrder(
        state.orderId!,
        draftItems.map(i => ({
          product_id: i.product_id,
          quantity: i.quantity,
          special_instructions: i.special_instructions || undefined,
        }))
      )
    },
    onSuccess: () => {
      refreshOrder()
    },
  })

  const fireKOTMutation = useMutation({
    mutationFn: async () => {
      if (!state.orderId) {
        await createOrderMutation.mutateAsync()
        return null
      }

      const draftItems = state.items.filter(i => isKotUnsentStatus(i.status))
      if (draftItems.some(i => i.id.startsWith('draft-'))) {
        await addItemsMutation.mutateAsync()
        await new Promise(r => setTimeout(r, 300))
      }

      return apiClient.fireKOT(state.orderId)
    },
    onSuccess: (res) => {
      if (res?.success) {
        refreshOrder()
        openKotPrint(res.data?.kots)
      }
    },
  })

  const refreshOrder = useCallback(async () => {
    if (!state.orderId) return
    const res = await apiClient.getOrder(state.orderId)
    if (res.success && res.data) {
      const mapped: KOTItem[] = (res.data.items || []).map((oi: OrderItem) => ({
        id: oi.id,
        product_id: oi.product_id,
        product_name: oi.product?.name || oi.product_id,
        quantity: oi.quantity,
        unit_price: oi.unit_price,
        special_instructions: oi.special_instructions || '',
        status: oi.status as ItemStatus,
        category_id: oi.product?.category_id,
      }))
      const localDrafts = state.items.filter(
        i => i.status === 'draft' && i.id.startsWith('draft-')
      )
      dispatch({ type: 'SYNC_ITEMS', items: [...mapped, ...localDrafts] })
    }
  }, [state.orderId, state.items])

  const handleVoidSuccess = (itemId: string) => {
    dispatch({ type: 'CONFIRM_VOID', itemId })
    refreshOrder()
  }

  const filteredProducts = useMemo(() => {
    const seen = new Set<string>()
    const uniq = products.filter((p: Product) => {
      if (seen.has(p.id)) return false
      seen.add(p.id)
      return true
    })
    const q = searchTerm.trim().toLowerCase()
    if (!q) return uniq
    return uniq.filter((p: Product) => p.name.toLowerCase().includes(q))
  }, [products, searchTerm])

  const handleFireKOT = async () => {
    const unsentItems = state.items.filter(i => isKotUnsentStatus(i.status))
    if (unsentItems.length === 0) {
      toastHelpers.error('Nothing to send', 'Add items or wait for the order to sync.')
      return
    }

    setFireBusy(true)
    try {
      if (!state.orderId) {
        const res = await apiClient.createServerOrder({
          table_id: state.tableId!,
          order_type: orderType,
          guest_count: state.guestCount,
          items: unsentItems.map(i => ({
            product_id: i.product_id,
            quantity: i.quantity,
            special_instructions: i.special_instructions || undefined,
          })),
        })
        if (!res.success || !res.data) {
          toastHelpers.error('Could not create order', res.message || 'Unknown error')
          return
        }
        const order = res.data
        dispatch({
          type: 'ORDER_CREATED',
          orderId: order.id,
          items: (order.items || []).map((oi: OrderItem) => ({
            id: oi.id,
            product_id: oi.product_id,
            product_name: oi.product?.name || '',
            quantity: oi.quantity,
            unit_price: oi.unit_price,
            special_instructions: oi.special_instructions || '',
            status: oi.status as ItemStatus,
            category_id: oi.product?.category_id,
          })),
        })
        queryClient.invalidateQueries({ queryKey: ['tables'] })
        const fireRes = await apiClient.fireKOT(order.id)
        if (!fireRes.success) {
          toastHelpers.error('Fire KOT failed', fireRes.message || 'Could not send to kitchen')
          return
        }
        toastHelpers.success('KOT sent', 'Order is on the kitchen display.')
        openKotPrint(fireRes.data?.kots)
        const orderRes = await apiClient.getOrder(order.id)
        if (orderRes.success && orderRes.data) {
          dispatch({
            type: 'SYNC_ITEMS',
            items: (orderRes.data.items || []).map((oi: OrderItem) => ({
              id: oi.id,
              product_id: oi.product_id,
              product_name: oi.product?.name || '',
              quantity: oi.quantity,
              unit_price: oi.unit_price,
              special_instructions: oi.special_instructions || '',
              status: oi.status as ItemStatus,
              category_id: oi.product?.category_id,
            })),
          })
        }
        queryClient.invalidateQueries({ queryKey: ['newEnhancedKitchenOrders'] })
        return
      }

      const localUnsent = unsentItems.filter(i => i.id.startsWith('draft-'))
      if (localUnsent.length > 0) {
        await apiClient.addItemsToOrder(
          state.orderId,
          localUnsent.map(i => ({
            product_id: i.product_id,
            quantity: i.quantity,
            special_instructions: i.special_instructions || undefined,
          }))
        )
      }
      const fireRes = await apiClient.fireKOT(state.orderId)
      if (!fireRes.success) {
        toastHelpers.error('Fire KOT failed', fireRes.message || 'Could not send to kitchen')
        return
      }
      toastHelpers.success('KOT sent', 'Order is on the kitchen display.')
      openKotPrint(fireRes.data?.kots)
      await refreshOrder()
      queryClient.invalidateQueries({ queryKey: ['newEnhancedKitchenOrders'] })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Request failed'
      toastHelpers.error('Fire KOT failed', msg)
    } finally {
      setFireBusy(false)
    }
  }

  // Phase: Table Selection
  if (state.phase === 'table_select') {
    const availableTables = tables.filter((t: any) => !t.is_occupied)
    const occupiedTables = tables.filter((t: any) => t.is_occupied)
    return (
      <div className="min-h-[calc(100vh-4rem)] flex flex-col p-6 bg-gray-50">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Select a Table</h2>
          <p className="text-gray-500 mt-1">Choose an available table to start a new order, or tap an occupied table to continue</p>
        </div>

        {/* Available Tables */}
        {availableTables.length > 0 && (
          <>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Available Tables</h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4 mb-8">
              {availableTables.map((table: any) => (
                <button
                  key={table.id}
                  onClick={() => dispatch({ type: 'SELECT_TABLE', tableId: table.id, tableName: table.table_number })}
                  className="p-4 rounded-xl border-2 border-gray-200 bg-white hover:border-blue-500 hover:shadow-md cursor-pointer text-center transition-all"
                >
                  <div className="text-lg font-bold text-gray-900">{table.table_number}</div>
                  <div className="text-xs text-gray-400 mt-1">{table.seating_capacity} seats</div>
                  {table.location && <div className="text-xs text-gray-400">{table.location}</div>}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Occupied Tables */}
        {occupiedTables.length > 0 && (
          <>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Occupied Tables</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {occupiedTables.map((table: any) => {
                const order = table.current_order
                const server = order?.server
                return (
                  <button
                    key={table.id}
                    onClick={() => {
                      if (order?.id) {
                        dispatch({ type: 'SELECT_TABLE', tableId: table.id, tableName: table.table_number })
                        dispatch({ type: 'SET_GUEST_COUNT', guestCount: order.guest_count || 1 })
                        // Load existing order
                        ;(async () => {
                          const res = await apiClient.getOrder(order.id)
                          if (res.success && res.data) {
                            const mapped: KOTItem[] = (res.data.items || []).map((oi: OrderItem) => ({
                              id: oi.id,
                              product_id: oi.product_id,
                              product_name: oi.product?.name || '',
                              quantity: oi.quantity,
                              unit_price: oi.unit_price,
                              special_instructions: oi.special_instructions || '',
                              status: oi.status as ItemStatus,
                              category_id: oi.product?.category_id,
                            }))
                            dispatch({ type: 'ORDER_CREATED', orderId: order.id, items: mapped })
                          }
                        })()
                      }
                    }}
                    className="p-4 rounded-xl border-2 border-orange-200 bg-orange-50 hover:border-orange-400 hover:shadow-md cursor-pointer text-left transition-all"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-lg font-bold text-gray-900">{table.table_number}</div>
                      <Badge variant="secondary" className="text-[10px] bg-orange-100 text-orange-700">
                        {order?.status?.toUpperCase() || 'ACTIVE'}
                      </Badge>
                    </div>
                    {order && (
                      <div className="space-y-1 mt-2">
                        <div className="text-xs text-gray-600">
                          #{order.order_number}
                          {order.guest_count > 0 && <span className="ml-1">· {order.guest_count} guests</span>}
                        </div>
                        {server && (
                          <div className="flex items-center gap-1 text-xs text-blue-600 font-medium">
                            <Users className="w-3 h-3" />
                            {server.first_name} {server.last_name}
                          </div>
                        )}
                        {order.total_amount > 0 && (
                          <div className="text-xs font-semibold text-gray-700">{formatCurrency(Number(order.total_amount))}</div>
                        )}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </>
        )}

        {tables.length === 0 && (
          <div className="text-center py-12 text-gray-400">No tables configured</div>
        )}
      </div>
    )
  }

  // Phase: Guest Count
  if (state.phase === 'guest_count') {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gray-50">
        <Card className="w-96">
          <CardContent className="pt-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-3">
                <Users className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">Table {state.tableName}</h3>
              <p className="text-gray-500 mt-1">How many guests?</p>
            </div>
            <div className="flex gap-3 mb-4">
              {[1, 2, 3, 4, 5, 6].map(n => (
                <button
                  key={n}
                  onClick={() => {
                    setGuestInput(String(n))
                    dispatch({ type: 'SET_GUEST_COUNT', guestCount: n })
                  }}
                  className="flex-1 p-3 rounded-lg border-2 border-gray-200 hover:border-blue-500 hover:bg-blue-50 font-bold text-lg transition-all"
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                placeholder="Or enter count..."
                value={guestInput}
                onChange={e => setGuestInput(e.target.value)}
                className="flex-1"
              />
              <Button
                onClick={() => {
                  const count = parseInt(guestInput) || 1
                  dispatch({ type: 'SET_GUEST_COUNT', guestCount: count })
                }}
                disabled={!guestInput || parseInt(guestInput) < 1}
              >
                Continue
              </Button>
            </div>
            <Button
              variant="ghost"
              className="w-full mt-3"
              onClick={() => dispatch({ type: 'RESET' })}
            >
              Back to Tables
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Phase: Ordering (3-column layout)
  return (
    <div className="h-[calc(100vh-4rem)] flex overflow-hidden bg-gray-50">
      {/* Left: Categories + Products */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <div className="p-3 bg-white border-b flex items-center gap-3">
          {/* Order Type Tabs */}
          {enabledOrderTypes.length > 1 && (
            <div className="flex bg-gray-100 rounded-lg p-0.5 mr-2">
              {enabledOrderTypes.map(type => {
                const Icon = ORDER_TYPE_ICONS[type.id] || Store
                return (
                  <button
                    key={type.id}
                    onClick={() => setOrderType(type.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      orderType === type.id
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {type.label}
                  </button>
                )
              })}
            </div>
          )}
          <Badge variant="outline" className="text-sm font-medium">
            <ChefHat className="w-3 h-3 mr-1" />
            Table {state.tableName}
          </Badge>
          <Badge variant="secondary" className="text-sm">
            <Users className="w-3 h-3 mr-1" />
            {state.guestCount} guest{state.guestCount !== 1 ? 's' : ''}
          </Badge>
          {state.orderId && (
            <Badge variant="outline" className="text-sm text-blue-600 border-blue-200">
              Order Active
            </Badge>
          )}
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => dispatch({ type: 'RESET' })}>
            Close Table
          </Button>
        </div>

        {/* Category chips */}
        <div className="p-3 bg-white border-b overflow-x-auto">
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All
            </button>
            {categories.map((cat: any) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat.id
                    ? 'text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                style={selectedCategory === cat.id ? { backgroundColor: cat.color || '#111' } : {}}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="p-3 bg-white border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search menu..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {filteredProducts.map((product: Product) => (
              <button
                key={product.id}
                onClick={() => dispatch({ type: 'ADD_ITEM', product })}
                className="bg-white rounded-xl border border-gray-200 p-3 text-left hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <div className="font-medium text-sm text-gray-900 line-clamp-2">{product.name}</div>
                <div className="text-lg font-bold text-blue-600 mt-1">{formatCurrency(product.price)}</div>
                {product.preparation_time > 0 && (
                  <div className="text-xs text-gray-400 mt-1">{product.preparation_time} min</div>
                )}
              </button>
            ))}
          </div>
          {filteredProducts.length === 0 && (
            <div className="text-center py-12 text-gray-400">No products found</div>
          )}
        </div>
      </div>

      {/* Right: KOT Sidebar */}
      <KOTSidebar
        items={state.items}
        tableName={state.tableName || ''}
        guestCount={state.guestCount}
        orderId={state.orderId}
        onUpdateQty={(id, qty) => dispatch({ type: 'UPDATE_QTY', itemId: id, qty })}
        onRemoveDraft={(id) => dispatch({ type: 'REMOVE_DRAFT', itemId: id })}
        onRequestVoid={(id, name, qty, price) => dispatch({ type: 'REQUEST_VOID', itemId: id, itemName: name, qty, price })}
        onFireKOT={handleFireKOT}
        isFireLoading={fireBusy || fireKOTMutation.isPending || createOrderMutation.isPending}
      />

      {/* PIN Modal */}
      {state.pinModal.open && state.pinModal.itemId && (
        <PinEntryModal
          orderId={state.orderId!}
          itemId={state.pinModal.itemId}
          itemName={state.pinModal.itemName}
          quantity={state.pinModal.qty}
          unitPrice={state.pinModal.price}
          onSuccess={(itemId) => handleVoidSuccess(itemId)}
          onClose={() => dispatch({ type: 'CLOSE_PIN_MODAL' })}
        />
      )}

      <KotPrintModal open={kotPrintOpen} onOpenChange={setKotPrintOpen} kots={lastFireKots} />
    </div>
  )
}
