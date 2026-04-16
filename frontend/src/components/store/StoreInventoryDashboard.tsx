import { useState, useCallback, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import type { StockCategory, StockItem, StockMovement, StockAlert, UserBrief, AdvancedStockReport } from '@/types'
import { useCurrency } from '@/contexts/CurrencyContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Package, AlertTriangle, TrendingUp, Plus, Search, ArrowDownCircle, ArrowUpCircle,
  Boxes, BarChart3, ShoppingCart, Tag, X, ChevronLeft, ChevronRight, CheckCircle2, XCircle,
  MoreVertical, Trash2, Pencil, DollarSign, Recycle, RefreshCw,
} from 'lucide-react'
import {
  PieChart, Pie, Cell, Tooltip as ReTooltip, Legend, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
} from 'recharts'

// ─── Unit conversion ─────────────────────────────────────────────

const UNIT_OPTIONS = {
  weight: [
    { value: 'kg', label: 'Kilograms (kg)' },
    { value: 'g', label: 'Grams (g)' },
    { value: 'lb', label: 'Pounds (lb)' },
    { value: 'oz', label: 'Ounces (oz)' },
    { value: 'liter', label: 'Liters (L)' },
    { value: 'ml', label: 'Milliliters (ml)' },
  ],
  quantity: [
    { value: 'each', label: 'Each / Piece' },
    { value: 'pack', label: 'Pack' },
    { value: 'box', label: 'Box' },
    { value: 'bag', label: 'Bag' },
    { value: 'bottle', label: 'Bottle' },
    { value: 'can', label: 'Can' },
    { value: 'roll', label: 'Roll' },
    { value: 'dozen', label: 'Dozen' },
    { value: 'pair', label: 'Pair' },
    { value: 'set', label: 'Set' },
  ],
} as const

const CONVERSION_FACTORS: Record<string, Record<string, number>> = {
  g:     { kg: 0.001, oz: 0.035274, lb: 0.00220462 },
  kg:    { g: 1000, oz: 35.274, lb: 2.20462 },
  oz:    { g: 28.3495, kg: 0.0283495, lb: 0.0625 },
  lb:    { g: 453.592, kg: 0.453592, oz: 16 },
  ml:    { liter: 0.001 },
  liter: { ml: 1000 },
}

function convertUnits(qty: number, fromUnit: string, toUnit: string): number | null {
  if (fromUnit === toUnit) return qty
  const factor = CONVERSION_FACTORS[fromUnit]?.[toUnit]
  if (factor == null) return null
  return qty * factor
}

function getCompatibleUnits(unit: string): string[] {
  const weightUnits = ['kg', 'g', 'lb', 'oz']
  const volumeUnits = ['liter', 'ml']
  if (weightUnits.includes(unit)) return weightUnits
  if (volumeUnits.includes(unit)) return volumeUnits
  return [unit]
}

const ISSUE_REASONS = [
  { value: 'General Kitchen Use', label: 'General Kitchen Use' },
  { value: 'Spoilage/Waste', label: 'Spoilage / Waste' },
  { value: 'Return to Vendor', label: 'Return to Vendor' },
  { value: 'Staff Use', label: 'Staff Use' },
  { value: 'Cleaning', label: 'Cleaning' },
  { value: 'Other', label: 'Other' },
] as const

type UnitMode = 'weight' | 'quantity'
type Toast = { id: number; type: 'success' | 'error'; message: string }
let toastIdCounter = 0

type Tab = 'items' | 'categories' | 'alerts' | 'movements' | 'reports'
type ModalState =
  | { kind: 'none' }
  | { kind: 'addItem' }
  | { kind: 'editItem'; item: StockItem }
  | { kind: 'purchase'; item: StockItem }
  | { kind: 'issue'; item: StockItem }
  | { kind: 'addCategory' }
  | { kind: 'editCategory'; category: StockCategory }

type StockStatusFilter = '' | 'low' | 'ok'

export function StoreInventoryDashboard() {
  const qc = useQueryClient()
  const { formatCurrency, currencyCode } = useCurrency()
  const [tab, setTab] = useState<Tab>('items')
  const [modal, setModal] = useState<ModalState>({ kind: 'none' })
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStatus, setFilterStatus] = useState<StockStatusFilter>('')
  const [itemPage, setItemPage] = useState(1)
  const [movPage, setMovPage] = useState(1)
  const [movType, setMovType] = useState('')
  const [movFrom, setMovFrom] = useState('')
  const [movTo, setMovTo] = useState('')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    const id = ++toastIdCounter
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])

  const { data: categoriesRes } = useQuery({ queryKey: ['stockCategories'], queryFn: () => apiClient.getStockCategories() })
  const categories = categoriesRes?.data ?? []

  const { data: itemsRes, isLoading: itemsLoading } = useQuery({
    queryKey: ['stockItems', itemPage, filterCategory, search],
    queryFn: () => apiClient.getStockItems({ page: itemPage, per_page: 15, category_id: filterCategory || undefined, search: search || undefined }),
  })
  const allItems = itemsRes?.data ?? []
  const itemsMeta = itemsRes?.meta

  const items = filterStatus
    ? allItems.filter((i: StockItem) => {
        const isLow = i.quantity_on_hand <= i.reorder_level
        return filterStatus === 'low' ? isLow : !isLow
      })
    : allItems

  const { data: alertsRes } = useQuery({ queryKey: ['stockAlerts'], queryFn: () => apiClient.getStockAlerts() })
  const alerts: StockAlert[] = alertsRes?.data ?? []

  const { data: usersRes } = useQuery({ queryKey: ['storeUsers'], queryFn: () => apiClient.getStoreUsers() })
  const users: UserBrief[] = usersRes?.data ?? []

  const { data: movRes } = useQuery({
    queryKey: ['stockMovements', movPage, movType, movFrom, movTo, filterCategory],
    queryFn: () => apiClient.getStockMovements({ page: movPage, per_page: 20, type: movType || undefined, from: movFrom || undefined, to: movTo || undefined, category_id: filterCategory || undefined }),
    enabled: tab === 'movements',
  })
  const movements: StockMovement[] = movRes?.data ?? []
  const movMeta = movRes?.meta

  const [reportPeriod, setReportPeriod] = useState('30')
  const { data: advancedRes, isLoading: reportLoading } = useQuery({
    queryKey: ['advancedStockReport', reportPeriod],
    queryFn: () => apiClient.getAdvancedStockReport(reportPeriod),
    enabled: tab === 'reports',
  })
  const advancedReport: AdvancedStockReport | undefined = advancedRes?.data

  const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'items', label: 'Inventory', icon: <Package className="w-4 h-4" /> },
    { id: 'categories', label: 'Categories', icon: <Tag className="w-4 h-4" /> },
    { id: 'alerts', label: 'Alerts', icon: <AlertTriangle className="w-4 h-4" />, badge: alerts.length },
    { id: 'movements', label: 'Movements', icon: <Boxes className="w-4 h-4" /> },
    { id: 'reports', label: 'Reports', icon: <BarChart3 className="w-4 h-4" /> },
  ]

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Store Inventory</h1>
          <p className="text-muted-foreground text-sm">Manage supplies, purchases, and issues</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setModal({ kind: 'addItem' })} size="sm">
            <Plus className="w-4 h-4 mr-1" /> Add Item
          </Button>
          <Button onClick={() => setModal({ kind: 'addCategory' })} variant="outline" size="sm">
            <Plus className="w-4 h-4 mr-1" /> Add Category
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50"><Package className="w-5 h-5 text-blue-600" /></div>
              <div>
                <p className="text-2xl font-bold">{allItems.length > 0 ? itemsMeta?.total ?? '—' : '—'}</p>
                <p className="text-xs text-muted-foreground">Total Items</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-50"><AlertTriangle className="w-5 h-5 text-red-600" /></div>
              <div>
                <p className="text-2xl font-bold">{alerts.length}</p>
                <p className="text-xs text-muted-foreground">Low Stock</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-50"><Tag className="w-5 h-5 text-green-600" /></div>
              <div>
                <p className="text-2xl font-bold">{categories.length}</p>
                <p className="text-xs text-muted-foreground">Categories</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-50"><TrendingUp className="w-5 h-5 text-purple-600" /></div>
              <div>
                <p className="text-2xl font-bold">{advancedReport?.kpis?.total_stock_value != null ? formatCurrency(advancedReport.kpis.total_stock_value) : '—'}</p>
                <p className="text-xs text-muted-foreground">Stock Value</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-1 border-b pb-0">
        {tabs.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setItemPage(1); setMovPage(1) }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {t.icon} {t.label}
            {t.badge != null && t.badge > 0 && <Badge variant="destructive" className="ml-1 text-xs px-1.5 py-0">{t.badge}</Badge>}
          </button>
        ))}
      </div>

      {tab === 'items' && <ItemsTab items={items} categories={categories} meta={itemsMeta} loading={itemsLoading}
        search={search} setSearch={setSearch} filterCategory={filterCategory} setFilterCategory={setFilterCategory}
        filterStatus={filterStatus} setFilterStatus={setFilterStatus}
        page={itemPage} setPage={setItemPage} setModal={setModal} qc={qc} showToast={showToast}
        selectedIds={selectedIds} setSelectedIds={setSelectedIds} />}
      {tab === 'categories' && <CategoriesTab categories={categories} setModal={setModal} qc={qc} showToast={showToast} />}
      {tab === 'alerts' && <AlertsTab alerts={alerts} setModal={setModal} items={allItems} />}
      {tab === 'movements' && <MovementsTab movements={movements} meta={movMeta} page={movPage} setPage={setMovPage}
        movType={movType} setMovType={setMovType} movFrom={movFrom} setMovFrom={setMovFrom} movTo={movTo} setMovTo={setMovTo} />}
      {tab === 'reports' && <ReportsTab report={advancedReport} loading={reportLoading} period={reportPeriod} setPeriod={setReportPeriod} />}

      {modal.kind !== 'none' && <ModalOverlay onClose={() => setModal({ kind: 'none' })}>
        {modal.kind === 'addItem' && <AddItemForm categories={categories} onClose={() => setModal({ kind: 'none' })} qc={qc} showToast={showToast} />}
        {modal.kind === 'editItem' && <EditItemForm item={modal.item} categories={categories} onClose={() => setModal({ kind: 'none' })} qc={qc} showToast={showToast} />}
        {modal.kind === 'purchase' && <PurchaseForm item={modal.item} onClose={() => setModal({ kind: 'none' })} qc={qc} showToast={showToast} />}
        {modal.kind === 'issue' && <IssueForm item={modal.item} users={users} onClose={() => setModal({ kind: 'none' })} qc={qc} showToast={showToast} />}
        {modal.kind === 'addCategory' && <AddCategoryForm onClose={() => setModal({ kind: 'none' })} qc={qc} showToast={showToast} />}
        {modal.kind === 'editCategory' && <EditCategoryForm category={modal.category} onClose={() => setModal({ kind: 'none' })} qc={qc} showToast={showToast} />}
      </ModalOverlay>}

      <div className="fixed bottom-4 right-4 z-[60] space-y-2">
        {toasts.map(t => (
          <div key={t.id} className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-in slide-in-from-right ${t.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
            {t.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
            {t.message}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Meatball / 3-dot menu ───────────────────────────────────────

function MeatballMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} className="p-1 rounded hover:bg-muted transition-colors">
        <MoreVertical className="w-4 h-4 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-popover border rounded-lg shadow-lg py-1 min-w-[140px]"
          onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  )
}

function MenuItem({ icon, label, destructive, onClick }: { icon: React.ReactNode; label: string; destructive?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted transition-colors ${destructive ? 'text-red-600 hover:bg-red-50' : ''}`}>
      {icon}
      {label}
    </button>
  )
}

// ─── Items Tab (redesigned) ──────────────────────────────────────

function ItemsTab({ items, categories, meta, loading, search, setSearch, filterCategory, setFilterCategory,
  filterStatus, setFilterStatus, page, setPage, setModal, qc, showToast, selectedIds, setSelectedIds }: any) {
  const { formatCurrency } = useCurrency()
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiClient.deleteStockItem(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['stockItems'] }); qc.invalidateQueries({ queryKey: ['stockCategories'] }); showToast('success', 'Item deleted') },
    onError: (err: Error) => showToast('error', err.message || 'Failed to delete item'),
  })

  const allChecked = items.length > 0 && items.every((i: StockItem) => selectedIds.has(i.id))
  const someChecked = selectedIds.size > 0

  function toggleAll() {
    if (allChecked) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(items.map((i: StockItem) => i.id)))
    }
  }

  function toggleOne(id: string) {
    setSelectedIds((prev: Set<string>) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const bulkSelectedItems = items.filter((i: StockItem) => selectedIds.has(i.id))

  async function runBulkDeleteStock() {
    const ids = [...selectedIds] as string[]
    const idToName = new Map(bulkSelectedItems.map((i: StockItem) => [i.id, i.name]))
    setBulkBusy(true)
    try {
      const results = await Promise.allSettled(ids.map((id) => apiClient.deleteStockItem(id)))
      let ok = 0
      const fails: string[] = []
      results.forEach((r, i) => {
        const id = ids[i]
        const label = idToName.get(id) || id
        if (r.status === 'fulfilled') {
          if (r.value.success) ok++
          else fails.push(`${label}: ${r.value.message || 'Failed'}`)
        } else {
          const err = r.reason instanceof Error ? r.reason.message : String(r.reason)
          fails.push(`${label}: ${err}`)
        }
      })
      qc.invalidateQueries({ queryKey: ['stockItems'] })
      qc.invalidateQueries({ queryKey: ['stockCategories'] })
      setSelectedIds(new Set())
      setBulkDeleteOpen(false)
      if (fails.length === 0) {
        showToast('success', `Deleted ${ok} item(s).`)
      } else {
        showToast(
          'error',
          `Deleted ${ok}; ${fails.length} failed. ${fails.slice(0, 3).join('; ')}${fails.length > 3 ? '…' : ''}`
        )
      }
    } finally {
      setBulkBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Search + Filter bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Search items..."
            className="w-full pl-9 pr-3 py-2 border rounded-md text-sm bg-background" />
        </div>
        <select value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setPage(1) }}
          className="border rounded-md px-3 py-2 text-sm bg-background">
          <option value="">All Categories</option>
          {categories.map((c: StockCategory) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value as StockStatusFilter); setPage(1) }}
          className="border rounded-md px-3 py-2 text-sm bg-background">
          <option value="">All Status</option>
          <option value="low">Low Stock</option>
          <option value="ok">OK</option>
        </select>
      </div>

      {/* Bulk actions bar */}
      {someChecked && (
        <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-lg px-4 py-2.5">
          <span className="text-sm font-medium">{selectedIds.size} item{selectedIds.size > 1 ? 's' : ''} selected</span>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={selectedIds.size !== 1}
            title={
              selectedIds.size !== 1
                ? 'Select exactly one item to record a purchase for that line'
                : 'Record purchase for the selected item'
            }
            onClick={() => {
              const first = items.find((i: StockItem) => selectedIds.has(i.id))
              if (first) setModal({ kind: 'purchase', item: first })
            }}
          >
            <ArrowDownCircle className="w-3 h-3 mr-1" /> Record purchase
          </Button>
          <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => setBulkDeleteOpen(true)}>
            <Trash2 className="w-3 h-3 mr-1" /> Delete selected…
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}>
            Clear
          </Button>
        </div>
      )}

      <Dialog open={bulkDeleteOpen} onOpenChange={(o) => !bulkBusy && setBulkDeleteOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {selectedIds.size} inventory item(s)?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>This cannot be undone. Stock history may be affected depending on server rules.</p>
                <ul className="list-disc pl-4 space-y-1 text-foreground">
                  {bulkSelectedItems.slice(0, 5).map((i: StockItem) => (
                    <li key={i.id}>{i.name}</li>
                  ))}
                </ul>
                {bulkSelectedItems.length > 5 && (
                  <p>and {bulkSelectedItems.length - 5} more…</p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)} disabled={bulkBusy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void runBulkDeleteStock()} disabled={bulkBusy}>
              {bulkBusy ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="w-10 px-3 py-3">
                <input type="checkbox" checked={allChecked} onChange={toggleAll}
                  className="rounded border-gray-300 cursor-pointer" />
              </th>
              <th className="text-left px-4 py-3 font-medium">Item</th>
              <th className="text-left px-4 py-3 font-medium">Category</th>
              <th className="text-right px-4 py-3 font-medium">On Hand</th>
              <th className="text-right px-4 py-3 font-medium">Reorder Lvl</th>
              <th className="text-right px-4 py-3 font-medium">Unit Cost</th>
              <th className="text-center px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No items found</td></tr>}
            {items.map((item: StockItem) => {
              const low = item.quantity_on_hand <= item.reorder_level
              return (
                <tr key={item.id} className={`hover:bg-muted/30 ${selectedIds.has(item.id) ? 'bg-primary/5' : ''}`}>
                  <td className="w-10 px-3 py-3">
                    <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleOne(item.id)}
                      className="rounded border-gray-300 cursor-pointer" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{item.name}</div>
                    <div className="text-xs text-muted-foreground">{item.unit}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{item.category?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`inline-flex items-center gap-1.5 font-semibold ${low ? 'text-red-600' : 'text-green-700'}`}>
                      {!low && <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />}
                      {item.quantity_on_hand} {item.unit}
                      {low && <Badge variant="destructive" className="text-[10px] px-1.5 py-0 ml-1">LOW</Badge>}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{item.reorder_level} {item.unit}</td>
                  <td className="px-4 py-3 text-right">{item.default_unit_cost != null ? formatCurrency(item.default_unit_cost) : '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-center">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setModal({ kind: 'purchase', item })}>
                        <ArrowDownCircle className="w-3 h-3 mr-1" /> Purchase
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setModal({ kind: 'issue', item })}>
                        <ArrowUpCircle className="w-3 h-3 mr-1" /> Issue
                      </Button>
                      <MeatballMenu>
                        <MenuItem icon={<Pencil className="w-3.5 h-3.5" />} label="Edit" onClick={() => setModal({ kind: 'editItem', item })} />
                        <MenuItem icon={<Trash2 className="w-3.5 h-3.5" />} label="Delete" destructive
                          onClick={() => { if (confirm(`Delete "${item.name}"?`)) deleteMut.mutate(item.id) }} />
                      </MeatballMenu>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {meta && meta.total_pages > 1 && <Pagination page={page} totalPages={meta.total_pages} setPage={setPage} />}
    </div>
  )
}

// ─── Other tab components (unchanged) ────────────────────────────

function CategoriesTab({ categories, setModal, qc, showToast }: any) {
  const deleteMut = useMutation({
    mutationFn: (id: string) => apiClient.deleteStockCategory(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['stockCategories'] }); showToast('success', 'Category deleted') },
    onError: (err: Error) => showToast('error', err.message || 'Failed to delete category'),
  })

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((cat: StockCategory) => (
        <Card key={cat.id}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{cat.name}</CardTitle>
              <Badge variant="secondary" className="text-xs">{cat.item_count ?? 0} items</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {cat.description && <p className="text-sm text-muted-foreground mb-3">{cat.description}</p>}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setModal({ kind: 'editCategory', category: cat })}>Edit</Button>
              <Button size="sm" variant="ghost" className="text-xs h-7 text-destructive"
                onClick={() => { if (confirm(`Delete "${cat.name}"?`)) deleteMut.mutate(cat.id) }}>Delete</Button>
            </div>
          </CardContent>
        </Card>
      ))}
      {categories.length === 0 && <p className="text-muted-foreground col-span-full text-center py-8">No categories yet.</p>}
    </div>
  )
}

function AlertsTab({ alerts, setModal, items }: { alerts: StockAlert[]; setModal: (m: ModalState) => void; items: StockItem[] }) {
  if (alerts.length === 0) return (
    <div className="text-center py-12 text-muted-foreground">
      <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-green-500" />
      <p className="font-medium">All stock levels are healthy</p>
    </div>
  )
  return (
    <div className="space-y-3">
      {alerts.map(a => {
        const matchedItem = items.find((i: StockItem) => i.id === a.id)
        return (
          <Card key={a.id} className="border-red-200 bg-red-50/30">
            <CardContent className="py-3 px-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                <div>
                  <p className="font-medium">{a.name}</p>
                  <p className="text-xs text-muted-foreground">{a.category_name} &middot; {a.quantity_on_hand} {a.unit} remaining (reorder at {a.reorder_level})</p>
                </div>
              </div>
              {matchedItem && (
                <Button size="sm" variant="outline" className="text-xs h-7 shrink-0" onClick={() => setModal({ kind: 'purchase', item: matchedItem })}>
                  <ShoppingCart className="w-3 h-3 mr-1" /> Restock
                </Button>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function MovementsTab({ movements, meta, page, setPage, movType, setMovType, movFrom, setMovFrom, movTo, setMovTo }: any) {
  const { formatCurrency } = useCurrency()
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <select value={movType} onChange={e => { setMovType(e.target.value); setPage(1) }} className="border rounded-md px-3 py-2 text-sm bg-background">
          <option value="">All Types</option>
          <option value="purchase">Purchase</option>
          <option value="issue">Issue</option>
          <option value="adjustment">Adjustment</option>
        </select>
        <input type="date" value={movFrom} onChange={e => { setMovFrom(e.target.value); setPage(1) }} className="border rounded-md px-3 py-2 text-sm bg-background" />
        <span className="text-sm text-muted-foreground">to</span>
        <input type="date" value={movTo} onChange={e => { setMovTo(e.target.value); setPage(1) }} className="border rounded-md px-3 py-2 text-sm bg-background" />
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">Item</th>
              <th className="text-left px-4 py-3 font-medium">Type</th>
              <th className="text-right px-4 py-3 font-medium">Qty</th>
              <th className="text-right px-4 py-3 font-medium">Cost</th>
              <th className="text-left px-4 py-3 font-medium">Issued To</th>
              <th className="text-left px-4 py-3 font-medium">By</th>
              <th className="text-left px-4 py-3 font-medium">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {movements.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No movements found</td></tr>}
            {movements.map((m: StockMovement) => (
              <tr key={m.id} className="hover:bg-muted/30">
                <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{new Date(m.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-2 font-medium">{m.item_name}</td>
                <td className="px-4 py-2">
                  <Badge variant={m.movement_type === 'purchase' ? 'default' : m.movement_type === 'issue' ? 'secondary' : 'outline'} className="text-xs capitalize">
                    {m.movement_type}
                  </Badge>
                </td>
                <td className={`px-4 py-2 text-right font-medium ${m.quantity < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {m.quantity > 0 ? '+' : ''}{m.quantity} {m.item_unit}
                </td>
                <td className="px-4 py-2 text-right">{m.total_cost != null ? formatCurrency(m.total_cost) : '—'}</td>
                <td className="px-4 py-2 text-muted-foreground">{m.issued_to_name ?? '—'}</td>
                <td className="px-4 py-2 text-muted-foreground">{m.created_by_name ?? '—'}</td>
                <td className="px-4 py-2 text-muted-foreground max-w-[200px] truncate">{m.note ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {meta && meta.total_pages > 1 && <Pagination page={page} totalPages={meta.total_pages} setPage={setPage} />}
    </div>
  )
}

const DONUT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

function ReportsTab({ report, loading, period, setPeriod }: {
  report: AdvancedStockReport | undefined; loading: boolean;
  period: string; setPeriod: (p: string) => void;
}) {
  const { formatCurrency } = useCurrency()
  const [varSearch, setVarSearch] = useState('')
  const [varSort, setVarSort] = useState<'variance' | 'name' | 'value'>('variance')

  if (loading || !report) return (
    <div className="text-center py-16 text-muted-foreground">
      <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin opacity-50" />
      <p className="font-medium">Loading report data...</p>
    </div>
  )

  const { kpis, category_values, trends, variance, waste } = report

  const catData = category_values ?? []
  const totalCatValue = catData.reduce((s, c) => s + c.value, 0)
  const catDataWithPct = catData.map(c => ({ ...c, pct: totalCatValue > 0 ? (c.value / totalCatValue * 100) : 0 }))

  const trendData = trends ?? []
  const varianceData = variance ?? []
  const wasteData = waste ?? []

  const filteredVariance = varianceData
    .filter(v => !varSearch || v.item_name.toLowerCase().includes(varSearch.toLowerCase()) || v.category.toLowerCase().includes(varSearch.toLowerCase()))
    .sort((a, b) => {
      if (varSort === 'variance') return Math.abs(b.variance) - Math.abs(a.variance)
      if (varSort === 'value') return Math.abs(b.variance * b.unit_cost) - Math.abs(a.variance * a.unit_cost)
      return a.item_name.localeCompare(b.item_name)
    })

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Inventory Intelligence</h3>
        <select value={period} onChange={e => setPeriod(e.target.value)}
          className="border rounded-md px-3 py-2 text-sm bg-background">
          <option value="7">Last 7 Days</option>
          <option value="14">Last 14 Days</option>
          <option value="30">Last 30 Days</option>
          <option value="60">Last 60 Days</option>
          <option value="90">Last 90 Days</option>
        </select>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-50">
                <DollarSign className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatCurrency(kpis.total_stock_value)}</p>
                <p className="text-xs text-muted-foreground">Total Stock Value</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={kpis.total_waste_value > 0 ? 'border-red-200' : ''}>
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${kpis.total_waste_value > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                <Recycle className={`w-5 h-5 ${kpis.total_waste_value > 0 ? 'text-red-600' : 'text-gray-400'}`} />
              </div>
              <div>
                <p className={`text-2xl font-bold ${kpis.total_waste_value > 0 ? 'text-red-600' : ''}`}>
                  {formatCurrency(kpis.total_waste_value)}
                </p>
                <p className="text-xs text-muted-foreground">Waste & Spoilage Loss</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-50">
                <RefreshCw className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{kpis.turnover_rate.toFixed(2)}x</p>
                <p className="text-xs text-muted-foreground">Inventory Turnover Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Charts Row ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Donut: Category Value Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Value Distribution by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {catData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No categorized stock data.</p>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={220}>
                  <PieChart>
                    <Pie data={catDataWithPct} dataKey="value" nameKey="name" cx="50%" cy="50%"
                      innerRadius={55} outerRadius={90} paddingAngle={2} strokeWidth={0}>
                      {catDataWithPct.map((_, i) => (
                        <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                      ))}
                    </Pie>
                    <ReTooltip formatter={(val: number) => formatCurrency(val)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1.5 text-sm min-w-0">
                  {catDataWithPct.map((c, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                      <span className="truncate flex-1">{c.name}</span>
                      <span className="text-muted-foreground font-medium tabular-nums">{c.pct.toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dual-Line: Purchase Cost vs Issued Qty */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Purchase Cost vs Issued Quantity</CardTitle>
          </CardHeader>
          <CardContent>
            {trendData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No trend data for this period.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="cost" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(Number(v))} />
                  <YAxis yAxisId="qty" orientation="right" tick={{ fontSize: 11 }} />
                  <ReTooltip />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                  <Line yAxisId="cost" type="monotone" dataKey="purchase_cost" name="Purchase Cost ($)" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                  <Line yAxisId="qty" type="monotone" dataKey="issued_qty" name="Issued Qty" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Variance Report Table ─────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Variance Report (Theoretical vs Actual)</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={varSearch} onChange={e => setVarSearch(e.target.value)} placeholder="Search items..."
                  className="pl-8 pr-3 py-1.5 border rounded-md text-xs bg-background w-48" />
              </div>
              <select value={varSort} onChange={e => setVarSort(e.target.value as any)}
                className="border rounded-md px-2 py-1.5 text-xs bg-background">
                <option value="variance">Sort: Highest Variance</option>
                <option value="value">Sort: Highest Value Impact</option>
                <option value="name">Sort: Name A-Z</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2.5 font-medium text-xs">Item</th>
                  <th className="text-left px-3 py-2.5 font-medium text-xs">Category</th>
                  <th className="text-right px-3 py-2.5 font-medium text-xs">Starting</th>
                  <th className="text-right px-3 py-2.5 font-medium text-xs">Purchased</th>
                  <th className="text-right px-3 py-2.5 font-medium text-xs">Issued</th>
                  <th className="text-right px-3 py-2.5 font-medium text-xs">Expected</th>
                  <th className="text-right px-3 py-2.5 font-medium text-xs">Actual</th>
                  <th className="text-right px-3 py-2.5 font-medium text-xs">Variance</th>
                  <th className="text-center px-3 py-2.5 font-medium text-xs">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredVariance.length === 0 && (
                  <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground text-xs">No variance data for this period.</td></tr>
                )}
                {filteredVariance.map(v => {
                  const absVar = Math.abs(v.variance)
                  const pctVar = v.expected > 0 ? (absVar / v.expected * 100) : 0
                  const status: 'green' | 'yellow' | 'red' = pctVar > 10 ? 'red' : pctVar > 3 ? 'yellow' : 'green'
                  return (
                    <tr key={v.item_id} className="hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <div className="font-medium text-xs">{v.item_name}</div>
                        <div className="text-[10px] text-muted-foreground">{v.unit}</div>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{v.category}</td>
                      <td className="px-3 py-2 text-right text-xs tabular-nums">{v.starting_stock.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right text-xs tabular-nums text-green-600">+{v.purchased.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right text-xs tabular-nums text-red-600">-{v.issued.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right text-xs tabular-nums font-medium">{v.expected.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right text-xs tabular-nums font-medium">{v.actual_on_hand.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right">
                        <span className={`text-xs font-semibold tabular-nums ${v.variance > 0 ? 'text-blue-600' : v.variance < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                          {v.variance > 0 ? '+' : ''}{v.variance.toFixed(1)}
                        </span>
                        {v.unit_cost > 0 && absVar > 0 && (
                          <span className="block text-[10px] text-muted-foreground">
                            {formatCurrency(Math.abs(v.variance) * v.unit_cost)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <TrafficLight status={status} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Waste & Spoilage Table ────────────────────────────── */}
      <Card className={wasteData.length > 0 ? 'border-red-100' : ''}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Waste & Spoilage Summary</CardTitle>
            {wasteData.length > 0 && (
              <Badge variant="destructive" className="text-xs">
                {wasteData.length} incident{wasteData.length !== 1 ? 's' : ''} &middot; {formatCurrency(wasteData.reduce((s, w) => s + w.lost_value, 0))} lost
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {wasteData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" />
              <p className="text-sm font-medium">No waste or spoilage recorded in this period.</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-red-50/50">
                  <tr>
                    <th className="text-left px-3 py-2.5 font-medium text-xs">Date</th>
                    <th className="text-left px-3 py-2.5 font-medium text-xs">Item</th>
                    <th className="text-left px-3 py-2.5 font-medium text-xs">Category</th>
                    <th className="text-right px-3 py-2.5 font-medium text-xs">Qty Wasted</th>
                    <th className="text-left px-3 py-2.5 font-medium text-xs">Reason</th>
                    <th className="text-right px-3 py-2.5 font-medium text-xs">Lost Value</th>
                    <th className="text-center px-3 py-2.5 font-medium text-xs">Severity</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {wasteData.map((w, i) => {
                    const severity: 'green' | 'yellow' | 'red' = w.lost_value > 50 ? 'red' : w.lost_value > 15 ? 'yellow' : 'green'
                    return (
                      <tr key={i} className="hover:bg-muted/30">
                        <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{w.date}</td>
                        <td className="px-3 py-2 text-xs font-medium">{w.item_name}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{w.category}</td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums text-red-600 font-medium">{w.qty_wasted.toFixed(1)} {w.unit}</td>
                        <td className="px-3 py-2 text-xs">
                          <Badge variant="outline" className="text-[10px] font-normal">{w.reason}</Badge>
                        </td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums font-semibold text-red-600">{formatCurrency(w.lost_value)}</td>
                        <td className="px-3 py-2 text-center"><TrafficLight status={severity} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function TrafficLight({ status }: { status: 'green' | 'yellow' | 'red' }) {
  const colors = {
    green: 'bg-green-500',
    yellow: 'bg-amber-400',
    red: 'bg-red-500',
  }
  const labels = {
    green: 'Healthy',
    yellow: 'Watch',
    red: 'Alert',
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${colors[status]}`} />
      <span className={`text-[10px] font-medium ${status === 'red' ? 'text-red-600' : status === 'yellow' ? 'text-amber-600' : 'text-green-600'}`}>
        {labels[status]}
      </span>
    </span>
  )
}

// ─── Shared components ───────────────────────────────────────────

function Pagination({ page, totalPages, setPage }: { page: number; totalPages: number; setPage: (p: number) => void }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p>
      <div className="flex gap-1">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="w-4 h-4" /></Button>
        <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight className="w-4 h-4" /></Button>
      </div>
    </div>
  )
}

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-background rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

// ─── Form components ─────────────────────────────────────────────

function AddItemForm({ categories, onClose, qc, showToast }: { categories: StockCategory[]; onClose: () => void; qc: any; showToast: (t: 'success' | 'error', m: string) => void }) {
  const { currencyCode } = useCurrency()
  const [form, setForm] = useState({ name: '', unit: 'each', category_id: '', quantity_on_hand: 0, reorder_level: 0, default_unit_cost: 0, notes: '' })
  const [unitMode, setUnitMode] = useState<UnitMode>('quantity')
  const mut = useMutation({
    mutationFn: () => apiClient.createStockItem({
      ...form,
      category_id: form.category_id || undefined,
      default_unit_cost: form.default_unit_cost || undefined,
      notes: form.notes || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['stockItems'] }); qc.invalidateQueries({ queryKey: ['stockCategories'] }); showToast('success', `"${form.name}" added to inventory`); onClose() },
    onError: (err: Error) => showToast('error', err.message || 'Failed to add item'),
  })

  return (
    <form onSubmit={e => { e.preventDefault(); mut.mutate() }} className="p-6 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">Add Stock Item</h2>
        <button type="button" onClick={onClose}><X className="w-5 h-5" /></button>
      </div>
      <FormField label="Name" required><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Measured By">
          <UnitSelector unitMode={unitMode} unit={form.unit} onModeChange={mode => { setUnitMode(mode); setForm(f => ({ ...f, unit: UNIT_OPTIONS[mode][0].value })) }} onUnitChange={u => setForm(f => ({ ...f, unit: u }))} />
        </FormField>
        <FormField label="Category">
          <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
            <option value="">None</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </FormField>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <FormField label="Qty on Hand"><input type="number" step="any" value={form.quantity_on_hand} onChange={e => setForm(f => ({ ...f, quantity_on_hand: +e.target.value }))} /></FormField>
        <FormField label="Reorder Level"><input type="number" step="any" value={form.reorder_level} onChange={e => setForm(f => ({ ...f, reorder_level: +e.target.value }))} /></FormField>
        <FormField label={`Unit Cost (${currencyCode})`}><input type="number" step="0.01" value={form.default_unit_cost} onChange={e => setForm(f => ({ ...f, default_unit_cost: +e.target.value }))} /></FormField>
      </div>
      <FormField label="Notes"><textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></FormField>
      <Button type="submit" className="w-full" disabled={mut.isPending || !form.name}>{mut.isPending ? 'Saving...' : 'Add Item'}</Button>
    </form>
  )
}

function EditItemForm({ item, categories, onClose, qc, showToast }: { item: StockItem; categories: StockCategory[]; onClose: () => void; qc: any; showToast: (t: 'success' | 'error', m: string) => void }) {
  const { currencyCode } = useCurrency()
  const [form, setForm] = useState({ name: item.name, unit: item.unit, category_id: item.category_id ?? '', reorder_level: item.reorder_level, default_unit_cost: item.default_unit_cost ?? 0, notes: item.notes ?? '' })
  const isWeight = UNIT_OPTIONS.weight.some(o => o.value === item.unit)
  const [unitMode, setUnitMode] = useState<UnitMode>(isWeight ? 'weight' : 'quantity')
  const mut = useMutation({
    mutationFn: () => apiClient.updateStockItem(item.id, {
      name: form.name, unit: form.unit,
      category_id: form.category_id || undefined,
      reorder_level: form.reorder_level,
      default_unit_cost: form.default_unit_cost || undefined,
      notes: form.notes || undefined,
    } as any),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['stockItems'] }); showToast('success', 'Item updated'); onClose() },
    onError: (err: Error) => showToast('error', err.message || 'Failed to update item'),
  })

  return (
    <form onSubmit={e => { e.preventDefault(); mut.mutate() }} className="p-6 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">Edit: {item.name}</h2>
        <button type="button" onClick={onClose}><X className="w-5 h-5" /></button>
      </div>
      <FormField label="Name" required><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Measured By">
          <UnitSelector unitMode={unitMode} unit={form.unit} onModeChange={mode => { setUnitMode(mode); setForm(f => ({ ...f, unit: UNIT_OPTIONS[mode][0].value })) }} onUnitChange={u => setForm(f => ({ ...f, unit: u }))} />
        </FormField>
        <FormField label="Category">
          <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
            <option value="">None</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Reorder Level"><input type="number" step="any" value={form.reorder_level} onChange={e => setForm(f => ({ ...f, reorder_level: +e.target.value }))} /></FormField>
        <FormField label={`Unit Cost (${currencyCode})`}><input type="number" step="0.01" value={form.default_unit_cost} onChange={e => setForm(f => ({ ...f, default_unit_cost: +e.target.value }))} /></FormField>
      </div>
      <FormField label="Notes"><textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></FormField>
      <Button type="submit" className="w-full" disabled={mut.isPending || !form.name}>{mut.isPending ? 'Saving...' : 'Save Changes'}</Button>
    </form>
  )
}

function PurchaseForm({ item, onClose, qc, showToast }: { item: StockItem; onClose: () => void; qc: any; showToast: (t: 'success' | 'error', m: string) => void }) {
  const { formatCurrency, currencyCode } = useCurrency()
  const [form, setForm] = useState({ quantity: 0, unit_cost: item.default_unit_cost ?? 0, note: '' })
  const mut = useMutation({
    mutationFn: () => apiClient.purchaseStock(item.id, { quantity: form.quantity, unit_cost: form.unit_cost || undefined, note: form.note || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['stockItems'] }); qc.invalidateQueries({ queryKey: ['stockAlerts'] }); qc.invalidateQueries({ queryKey: ['stockMovements'] }); qc.invalidateQueries({ queryKey: ['stockSummary'] }); showToast('success', `Purchased ${form.quantity} ${item.unit} of ${item.name}`); onClose() },
    onError: (err: Error) => showToast('error', err.message || 'Failed to record purchase'),
  })

  return (
    <form onSubmit={e => { e.preventDefault(); mut.mutate() }} className="p-6 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">Purchase: {item.name}</h2>
        <button type="button" onClick={onClose}><X className="w-5 h-5" /></button>
      </div>
      <p className="text-sm text-muted-foreground">Current stock: {item.quantity_on_hand} {item.unit}</p>
      <div className="grid grid-cols-2 gap-4">
        <FormField label={`Quantity (${item.unit})`} required><input type="number" step="any" min="0.01" value={form.quantity || ''} onChange={e => setForm(f => ({ ...f, quantity: +e.target.value }))} required /></FormField>
        <FormField label={`Unit Cost (${currencyCode})`}><input type="number" step="0.01" value={form.unit_cost || ''} onChange={e => setForm(f => ({ ...f, unit_cost: +e.target.value }))} /></FormField>
      </div>
      {form.quantity > 0 && form.unit_cost > 0 && <p className="text-sm font-medium">Total cost: {formatCurrency(form.quantity * form.unit_cost)}</p>}
      <FormField label="Note"><input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="e.g. Weekly supplier order" /></FormField>
      <Button type="submit" className="w-full" disabled={mut.isPending || form.quantity <= 0}>{mut.isPending ? 'Recording...' : 'Record Purchase'}</Button>
    </form>
  )
}

// ─── Redesigned Issue Form with unit conversion + reason ─────────

function IssueForm({ item, users, onClose, qc, showToast }: { item: StockItem; users: UserBrief[]; onClose: () => void; qc: any; showToast: (t: 'success' | 'error', m: string) => void }) {
  const compatibleUnits = getCompatibleUnits(item.unit)
  const hasUnitOptions = compatibleUnits.length > 1

  const [form, setForm] = useState({
    quantity: 0,
    unit: item.unit,
    issued_to_user_id: '',
    reason: 'General Kitchen Use',
    note: '',
  })

  const convertedQty = form.unit === item.unit
    ? form.quantity
    : convertUnits(form.quantity, form.unit, item.unit)

  const conversionError = form.quantity > 0 && convertedQty === null
  const insufficientStock = convertedQty != null && convertedQty > item.quantity_on_hand

  const issuedUser = users.find((u: UserBrief) => u.id === form.issued_to_user_id)
  const mut = useMutation({
    mutationFn: () => apiClient.issueStock(item.id, {
      quantity: form.quantity,
      unit: form.unit !== item.unit ? form.unit : undefined,
      issued_to_user_id: form.issued_to_user_id,
      reason: form.reason || undefined,
      note: form.note || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stockItems'] })
      qc.invalidateQueries({ queryKey: ['stockAlerts'] })
      qc.invalidateQueries({ queryKey: ['stockMovements'] })
      qc.invalidateQueries({ queryKey: ['stockSummary'] })
      showToast('success', `Issued ${form.quantity} ${form.unit} of ${item.name} to ${issuedUser?.first_name ?? 'staff'}`)
      onClose()
    },
    onError: (err: Error) => showToast('error', err.message || 'Failed to issue stock'),
  })

  const canSubmit = form.quantity > 0 && !!form.issued_to_user_id && !conversionError && !insufficientStock && !mut.isPending

  return (
    <form onSubmit={e => { e.preventDefault(); mut.mutate() }} className="p-6 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">Issue: {item.name}</h2>
        <button type="button" onClick={onClose}><X className="w-5 h-5" /></button>
      </div>

      <div className="flex items-center gap-2 text-sm bg-muted/50 rounded-lg px-3 py-2">
        <Package className="w-4 h-4 text-muted-foreground" />
        <span className="text-muted-foreground">Available:</span>
        <span className="font-semibold">{item.quantity_on_hand} {item.unit}</span>
      </div>

      {/* Quantity + Unit side by side */}
      <div className={`grid gap-4 ${hasUnitOptions ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <FormField label="Quantity" required>
          <input type="number" step="any" min="0.01" value={form.quantity || ''} onChange={e => setForm(f => ({ ...f, quantity: +e.target.value }))} required />
        </FormField>
        {hasUnitOptions && (
          <FormField label="Unit">
            <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
              {compatibleUnits.map(u => {
                const allUnits = [...UNIT_OPTIONS.weight, ...UNIT_OPTIONS.quantity]
                const found = allUnits.find(o => o.value === u)
                return <option key={u} value={u}>{found?.label ?? u}</option>
              })}
            </select>
          </FormField>
        )}
      </div>

      {/* Conversion preview */}
      {form.quantity > 0 && form.unit !== item.unit && (
        <div className={`text-sm rounded-lg px-3 py-2 ${conversionError ? 'bg-red-50 text-red-700' : insufficientStock ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
          {conversionError && 'Cannot convert between these units'}
          {!conversionError && convertedQty != null && (
            <>
              {form.quantity} {form.unit} = <strong>{convertedQty.toFixed(4)} {item.unit}</strong> will be deducted
              {insufficientStock && <span className="block mt-0.5 font-medium">Exceeds available stock ({item.quantity_on_hand} {item.unit})</span>}
            </>
          )}
        </div>
      )}

      {insufficientStock && form.unit === item.unit && form.quantity > 0 && (
        <div className="text-sm rounded-lg px-3 py-2 bg-amber-50 text-amber-700">
          Requested {form.quantity} {item.unit} exceeds available stock ({item.quantity_on_hand} {item.unit})
        </div>
      )}

      <FormField label="Reason" required>
        <select value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} required>
          {ISSUE_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </FormField>

      <FormField label="Issue To" required>
        <select value={form.issued_to_user_id} onChange={e => setForm(f => ({ ...f, issued_to_user_id: e.target.value }))} required>
          <option value="">Select person...</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name} ({u.role})</option>)}
        </select>
      </FormField>

      <FormField label="Note (optional)"><input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="e.g. For kitchen prep" /></FormField>

      <Button type="submit" className="w-full" disabled={!canSubmit}>
        {mut.isPending ? 'Issuing...' : `Issue ${form.quantity > 0 ? form.quantity + ' ' + form.unit : 'Stock'}`}
      </Button>
    </form>
  )
}

function AddCategoryForm({ onClose, qc, showToast }: { onClose: () => void; qc: any; showToast: (t: 'success' | 'error', m: string) => void }) {
  const [form, setForm] = useState({ name: '', description: '', sort_order: 0 })
  const mut = useMutation({
    mutationFn: () => apiClient.createStockCategory({ name: form.name, description: form.description || undefined, sort_order: form.sort_order }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['stockCategories'] }); showToast('success', `Category "${form.name}" created`); onClose() },
    onError: (err: Error) => showToast('error', err.message || 'Failed to create category'),
  })

  return (
    <form onSubmit={e => { e.preventDefault(); mut.mutate() }} className="p-6 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">Add Stock Category</h2>
        <button type="button" onClick={onClose}><X className="w-5 h-5" /></button>
      </div>
      <FormField label="Name" required><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></FormField>
      <FormField label="Description"><input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></FormField>
      <FormField label="Sort Order"><input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: +e.target.value }))} /></FormField>
      <Button type="submit" className="w-full" disabled={mut.isPending || !form.name}>{mut.isPending ? 'Saving...' : 'Add Category'}</Button>
    </form>
  )
}

function EditCategoryForm({ category, onClose, qc, showToast }: { category: StockCategory; onClose: () => void; qc: any; showToast: (t: 'success' | 'error', m: string) => void }) {
  const [form, setForm] = useState({ name: category.name, description: category.description ?? '', sort_order: category.sort_order })
  const mut = useMutation({
    mutationFn: () => apiClient.updateStockCategory(category.id, { name: form.name, description: form.description || undefined, sort_order: form.sort_order } as any),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['stockCategories'] }); showToast('success', 'Category updated'); onClose() },
    onError: (err: Error) => showToast('error', err.message || 'Failed to update category'),
  })

  return (
    <form onSubmit={e => { e.preventDefault(); mut.mutate() }} className="p-6 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">Edit: {category.name}</h2>
        <button type="button" onClick={onClose}><X className="w-5 h-5" /></button>
      </div>
      <FormField label="Name" required><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></FormField>
      <FormField label="Description"><input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></FormField>
      <FormField label="Sort Order"><input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: +e.target.value }))} /></FormField>
      <Button type="submit" className="w-full" disabled={mut.isPending || !form.name}>{mut.isPending ? 'Saving...' : 'Save Changes'}</Button>
    </form>
  )
}

function UnitSelector({ unitMode, unit, onModeChange, onUnitChange }: { unitMode: UnitMode; unit: string; onModeChange: (m: UnitMode) => void; onUnitChange: (u: string) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex rounded-md overflow-hidden border">
        <button type="button" onClick={() => onModeChange('weight')}
          className={`flex-1 py-1.5 text-xs font-medium transition-colors ${unitMode === 'weight' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}>
          By Weight
        </button>
        <button type="button" onClick={() => onModeChange('quantity')}
          className={`flex-1 py-1.5 text-xs font-medium transition-colors ${unitMode === 'quantity' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}>
          By Quantity
        </button>
      </div>
      <select value={unit} onChange={e => onUnitChange(e.target.value)}>
        {UNIT_OPTIONS[unitMode].map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</span>
      <div className="mt-1 [&_input]:w-full [&_input]:px-3 [&_input]:py-2 [&_input]:border [&_input]:rounded-md [&_input]:text-sm [&_input]:bg-background [&_select]:w-full [&_select]:px-3 [&_select]:py-2 [&_select]:border [&_select]:rounded-md [&_select]:text-sm [&_select]:bg-background [&_textarea]:w-full [&_textarea]:px-3 [&_textarea]:py-2 [&_textarea]:border [&_textarea]:rounded-md [&_textarea]:text-sm [&_textarea]:bg-background">{children}</div>
    </label>
  )
}
