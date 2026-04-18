import { useReducer, useState, useCallback, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { TableFloorMap } from '@/components/tables/TableFloorMap'
import { isKotUnsentStatus } from './kotConstants'
import { useCurrency } from '@/contexts/CurrencyContext'
import { buildFloorTabs } from '@/lib/managedFloors'

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
  const [layoutLocationFilter, setLayoutLocationFilter] = useState<string>('Main Floor')
  const queryClient = useQueryClient()
  const { formatCurrency } = useCurrency()

  const openKotPrint = (kots: StationKOT[] | undefined) => {
    setLastFireKots(kots)
    setKotPrintOpen(true)
  }

  // Compose a mode-accurate success toast from the actual KOTs the backend
  // returned, instead of always claiming "Order is on the kitchen display."
  // — which is misleading in KOT-only venues or when every station printed.
  const fireKotSuccessToast = (kots: StationKOT[] | undefined) => {
    const list = kots ?? []
    const printerCount = list.filter((k) => k.output_type === 'printer').length
    const kdsCount = list.filter((k) => k.output_type === 'kds').length
    if (kdsCount > 0 && printerCount > 0) {
      toastHelpers.success(
        'KOT sent',
        `On the kitchen display (${kdsCount}) and printing at ${printerCount} station${printerCount === 1 ? '' : 's'}.`,
      )
    } else if (kdsCount > 0) {
      toastHelpers.success('KOT sent', 'Order is on the kitchen display.')
    } else if (printerCount > 0) {
      toastHelpers.success(
        'KOT sent',
        `Printing at ${printerCount} station${printerCount === 1 ? '' : 's'}.`,
      )
    } else {
      toastHelpers.success('KOT sent', 'Order routed to the kitchen.')
    }
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

  const { data: floorSettingRes } = useQuery({
    queryKey: ['settings', 'managed_floors'],
    queryFn: () => apiClient.getSetting('managed_floors'),
  })

  const floorTabs = useMemo(
    () =>
      buildFloorTabs(
        floorSettingRes?.data,
        (tables as DiningTable[]).map((t) => t.location || 'Main Floor')
      ),
    [floorSettingRes?.data, tables]
  )

  useEffect(() => {
    if (floorTabs.length === 0) return
    if (!floorTabs.includes(layoutLocationFilter)) {
      setLayoutLocationFilter(floorTabs.includes('Main Floor') ? 'Main Floor' : floorTabs[0])
    }
  }, [floorTabs, layoutLocationFilter])

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
        fireKotSuccessToast(fireRes.data?.kots)
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
      fireKotSuccessToast(fireRes.data?.kots)
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
    const visibleTables = tables.filter((t: any) => (t.location || 'Main Floor') === layoutLocationFilter)
    const availableTables = visibleTables.filter((t: any) => !(t.has_active_order ?? t.is_occupied))
    const occupiedTables = visibleTables.filter((t: any) => t.has_active_order ?? t.is_occupied)
    const hasLayout = tables.some((t: any) => typeof t.map_x === 'number' && typeof t.map_y === 'number')
    return (
      <div className="min-h-[calc(100vh-4rem)] flex flex-col p-6 bg-gray-50 dark:bg-gray-900">
        <div className="mb-6">
          <h2 className="text-3xl font-bold tracking-tight">Select a Table</h2>
          <p className="text-muted-foreground mt-1">Choose an available table to start a new order, or tap an occupied table to continue</p>
        </div>

        <div className="mb-3 flex flex-wrap gap-2 items-center">
          <div className="flex gap-2 overflow-x-auto">
            {floorTabs.map((loc) => (
              <Button
                key={loc}
                variant={layoutLocationFilter === loc ? 'default' : 'outline'}
                size="sm"
                onClick={() => setLayoutLocationFilter(loc)}
                className="whitespace-nowrap"
              >
                {loc}
              </Button>
            ))}
          </div>
        </div>

        {visibleTables.length === 0 ? (
          <div className="text-center py-12 text-gray-400 dark:text-gray-500">No tables configured</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-3 items-start">
            <div className="min-w-0 space-y-5">
              {hasLayout ? (
                <div>
                  <div className="flex flex-wrap gap-2 items-center text-xs mb-2">
                    <span className="rounded-full px-2 py-1 font-medium bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200">
                      Available
                    </span>
                    <span className="rounded-full px-2 py-1 font-medium bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100">
                      Occupied
                    </span>
                    <span className="rounded-full px-2 py-1 font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-100">
                      Pending
                    </span>
                  </div>
                  <TableFloorMap
                    tables={visibleTables}
                    selectedTableId={state.tableId ?? undefined}
                    viewportHeight={420}
                    showControls
                    onSelect={(table) => {
                      const order = (table as any).current_order
                      const occupied = table.has_active_order ?? table.is_occupied
                      dispatch({ type: 'SELECT_TABLE', tableId: table.id, tableName: table.table_number })
                      if (!occupied) {
                        return
                      }
                      if (order?.id) {
                        dispatch({ type: 'SET_GUEST_COUNT', guestCount: order.guest_count || 1 })
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
                  />
                </div>
              ) : null}

              {availableTables.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                    Available Tables
                  </h3>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 sm:gap-4">
                    {availableTables.map((table: any) => (
                      <button
                        key={table.id}
                        type="button"
                        onClick={() => dispatch({ type: 'SELECT_TABLE', tableId: table.id, tableName: table.table_number })}
                        className="p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-500 hover:shadow-md cursor-pointer text-center transition-all"
                      >
                        <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{table.table_number}</div>
                        <div className="text-xs text-gray-400 mt-1">{table.seating_capacity} seats</div>
                        {table.location && <div className="text-xs text-gray-400">{table.location}</div>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Card className="w-full border shadow-sm lg:sticky lg:top-4 lg:self-start">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Occupied tables</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 overflow-y-auto max-h-[min(560px,calc(100vh-14rem))] pt-0">
                {occupiedTables.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No occupied tables on this floor.</p>
                ) : (
                  occupiedTables.map((table: any) => {
                    const order = table.current_order
                    const server = order?.server
                    return (
                      <button
                        key={table.id}
                        type="button"
                        onClick={() => {
                          if (order?.id) {
                            dispatch({ type: 'SELECT_TABLE', tableId: table.id, tableName: table.table_number })
                            dispatch({ type: 'SET_GUEST_COUNT', guestCount: order.guest_count || 1 })
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
                        className="w-full rounded-xl border-2 border-orange-200 dark:border-orange-800/60 bg-orange-50 dark:bg-orange-950/40 p-3 text-left transition-all hover:border-orange-400 dark:hover:border-orange-600 hover:shadow-md"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="text-base font-bold text-gray-900 dark:text-gray-100 truncate">
                            {table.table_number}
                          </div>
                          <Badge variant="secondary" className="shrink-0 text-[10px] bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-200">
                            {order?.status?.toUpperCase() || 'ACTIVE'}
                          </Badge>
                        </div>
                        {order && (
                          <div className="space-y-1 mt-2">
                            <div className="text-xs text-gray-600 dark:text-gray-300">
                              #{order.order_number}
                              {order.guest_count > 0 && <span className="ml-1">· {order.guest_count} guests</span>}
                            </div>
                            {server && (
                              <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-medium">
                                <Users className="w-3 h-3 shrink-0" />
                                <span className="truncate">
                                  {server.first_name} {server.last_name}
                                </span>
                              </div>
                            )}
                            {order.total_amount > 0 && (
                              <div className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                                {formatCurrency(Number(order.total_amount))}
                              </div>
                            )}
                          </div>
                        )}
                      </button>
                    )
                  })
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    )
  }

  // Phase: Guest Count
  if (state.phase === 'guest_count') {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gray-50 dark:bg-gray-900">
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
    <div className="h-[calc(100vh-4rem)] flex overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* Left: Categories + Products */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <div className="p-3 bg-white dark:bg-gray-800 border-b dark:border-gray-700 flex items-center gap-3">
          {/* Order Type Tabs */}
          {enabledOrderTypes.length > 1 && (
            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5 mr-2">
              {enabledOrderTypes.map(type => {
                const Icon = ORDER_TYPE_ICONS[type.id] || Store
                return (
                  <button
                    key={type.id}
                    onClick={() => setOrderType(type.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      orderType === type.id
                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
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
        <div className="p-3 bg-white dark:bg-gray-800 border-b dark:border-gray-700 overflow-x-auto">
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
        <div className="p-3 bg-white dark:bg-gray-800 border-b dark:border-gray-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
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
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 text-left hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-sm transition-all"
              >
                <div className="font-medium text-sm text-gray-900 dark:text-gray-100 line-clamp-2">{product.name}</div>
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
