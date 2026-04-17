import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import type { Supplier, PurchaseOrderSummary, PurchaseOrderDetail, StockItem } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Plus,
  Package,
  Truck,
  Info,
  Mail,
  Phone,
  User,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'

type ToastFn = (type: 'success' | 'error', message: string) => void

type PoSortKey = 'supplier_name' | 'created_at' | 'expected_date' | 'total_ordered_qty' | 'status'

function formatPoStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: 'Draft',
    ordered: 'Ordered',
    partially_received: 'Partially received',
    received: 'Received',
    cancelled: 'Cancelled',
  }
  return labels[status] ?? status.replace(/_/g, ' ')
}

function poStatusBadgeVariant(status: string): 'secondary' | 'outline' | 'info' | 'warning' | 'success' | 'destructive' {
  switch (status) {
    case 'draft':
      return 'secondary'
    case 'ordered':
      return 'info'
    case 'partially_received':
      return 'warning'
    case 'received':
      return 'success'
    case 'cancelled':
      return 'destructive'
    default:
      return 'outline'
  }
}

export function InventoryPurchasingTab({ stockItems, showToast }: { stockItems: StockItem[]; showToast: ToastFn }) {
  const qc = useQueryClient()
  const [supplierModal, setSupplierModal] = useState(false)
  const [poModal, setPoModal] = useState(false)
  const [receivePoId, setReceivePoId] = useState<string | null>(null)
  const [supplierForm, setSupplierForm] = useState({ name: '', contact_name: '', phone: '', email: '' })
  const [poForm, setPoForm] = useState({
    supplier_id: '',
    expected_date: '',
    notes: '',
    lines: [{ stock_item_id: '', quantity_ordered: 1 as number, unit_cost: undefined as number | undefined }],
  })

  const { data: supRes } = useQuery({ queryKey: ['suppliers'], queryFn: () => apiClient.listSuppliers() })
  const suppliers: Supplier[] = supRes?.data ?? []

  const { data: poRes } = useQuery({
    queryKey: ['purchaseOrders'],
    queryFn: () => apiClient.listPurchaseOrders({ page: 1, per_page: 50 }),
  })
  const orders: PurchaseOrderSummary[] = poRes?.data ?? []

  const [poSort, setPoSort] = useState<{ key: PoSortKey; dir: 'asc' | 'desc' }>({
    key: 'created_at',
    dir: 'desc',
  })

  const onPoSort = useCallback((key: PoSortKey) => {
    setPoSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
    )
  }, [])

  const sortedOrders = useMemo(() => {
    const { key, dir } = poSort
    const mul = dir === 'asc' ? 1 : -1
    return [...orders].sort((a, b) => {
      let c = 0
      switch (key) {
        case 'supplier_name':
          c = a.supplier_name.localeCompare(b.supplier_name, undefined, { sensitivity: 'base' })
          break
        case 'created_at':
          c = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          break
        case 'expected_date':
          c = (a.expected_date || '').localeCompare(b.expected_date || '')
          break
        case 'total_ordered_qty':
          c = a.total_ordered_qty - b.total_ordered_qty
          break
        case 'status':
          c = a.status.localeCompare(b.status)
          break
        default:
          break
      }
      return c * mul
    })
  }, [orders, poSort])

  const { data: detailRes } = useQuery({
    queryKey: ['purchaseOrder', receivePoId],
    queryFn: () => apiClient.getPurchaseOrder(receivePoId!),
    enabled: !!receivePoId,
  })
  const detail: PurchaseOrderDetail | undefined = detailRes?.data

  const [receiveLines, setReceiveLines] = useState<Record<string, { qty: number; expiry: string; unit_cost: string }>>({})

  const createSup = useMutation({
    mutationFn: () =>
      apiClient.createSupplier({
        name: supplierForm.name,
        contact_name: supplierForm.contact_name || undefined,
        phone: supplierForm.phone || undefined,
        email: supplierForm.email || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] })
      showToast('success', 'Supplier created')
      setSupplierModal(false)
      setSupplierForm({ name: '', contact_name: '', phone: '', email: '' })
    },
    onError: (e: Error) => showToast('error', e.message || 'Failed'),
  })

  const createPO = useMutation({
    mutationFn: () =>
      apiClient.createPurchaseOrder({
        supplier_id: poForm.supplier_id,
        expected_date: poForm.expected_date || undefined,
        notes: poForm.notes || undefined,
        lines: poForm.lines
          .filter((l) => l.stock_item_id && l.quantity_ordered > 0)
          .map((l) => ({
            stock_item_id: l.stock_item_id,
            quantity_ordered: l.quantity_ordered,
            unit_cost: l.unit_cost,
          })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchaseOrders'] })
      showToast('success', 'Purchase order created')
      setPoModal(false)
      setPoForm({
        supplier_id: '',
        expected_date: '',
        notes: '',
        lines: [{ stock_item_id: '', quantity_ordered: 1, unit_cost: undefined }],
      })
    },
    onError: (e: Error) => showToast('error', e.message || 'Failed'),
  })

  const submitPO = useMutation({
    mutationFn: (id: string) => apiClient.submitPurchaseOrder(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchaseOrders'] })
      showToast('success', 'PO submitted')
    },
    onError: (e: Error) => showToast('error', e.message || 'Failed'),
  })

  const receivePO = useMutation({
    mutationFn: ({ id, lines }: { id: string; lines: { line_id: string; quantity_received: number; expiry_date?: string; unit_cost?: number }[] }) =>
      apiClient.receivePurchaseOrder(id, { lines }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchaseOrders'] })
      qc.invalidateQueries({ queryKey: ['purchaseOrder', receivePoId] })
      qc.invalidateQueries({ queryKey: ['stockItems'] })
      qc.invalidateQueries({ queryKey: ['stockSummary'] })
      qc.invalidateQueries({ queryKey: ['advancedStockReport'] })
      showToast('success', 'Receipt recorded')
      setReceivePoId(null)
      setReceiveLines({})
    },
    onError: (e: Error) => showToast('error', e.message || 'Failed'),
  })

  function openReceive(id: string) {
    setReceivePoId(id)
    setReceiveLines({})
  }

  function buildReceivePayload(po: PurchaseOrderDetail) {
    const lines = po.lines
      .map((ln) => {
        const r = receiveLines[ln.id]
        if (!r || r.qty <= 0) return null
        const open = ln.quantity_ordered - ln.quantity_received
        if (r.qty > open + 0.0001) return null
        const out: { line_id: string; quantity_received: number; expiry_date?: string; unit_cost?: number } = {
          line_id: ln.id,
          quantity_received: r.qty,
        }
        if (r.expiry.trim()) out.expiry_date = r.expiry.trim()
        if (r.unit_cost.trim()) {
          const uc = parseFloat(r.unit_cost)
          if (!Number.isNaN(uc)) out.unit_cost = uc
        }
        return out
      })
      .filter(Boolean) as { line_id: string; quantity_received: number; expiry_date?: string; unit_cost?: number }[]
    return lines
  }

  function poSortIcon(k: PoSortKey) {
    if (poSort.key !== k) return <ArrowUpDown className="w-4 h-4 shrink-0 opacity-40" aria-hidden />
    return poSort.dir === 'asc' ? (
      <ArrowUp className="w-4 h-4 shrink-0" aria-hidden />
    ) : (
      <ArrowDown className="w-4 h-4 shrink-0" aria-hidden />
    )
  }

  return (
    <div className="space-y-6">
      <section
        className="rounded-xl border border-primary/20 bg-primary/[0.04] p-5 sm:p-6 shadow-sm"
        aria-labelledby="purchasing-guide-title"
      >
        <div className="flex gap-4">
          <div className="hidden sm:flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Info className="h-6 w-6" aria-hidden />
          </div>
          <div className="min-w-0 space-y-3">
            <div>
              <h2 id="purchasing-guide-title" className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                How purchasing works
              </h2>
              <p className="mt-1.5 text-base text-muted-foreground leading-relaxed">
                Use this tab to work with <strong className="font-medium text-foreground">vendors</strong>, raise{' '}
                <strong className="font-medium text-foreground">purchase orders</strong>, and{' '}
                <strong className="font-medium text-foreground">record deliveries</strong>. Receipts update stock on
                hand (and batch costs where configured), so your inventory totals stay aligned with what you actually
                received.
              </p>
            </div>
            <ol className="grid gap-3 sm:grid-cols-2 text-base text-muted-foreground">
              <li className="flex gap-3 rounded-lg border bg-background/80 p-3 shadow-sm">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-foreground">
                  1
                </span>
                <span>
                  <span className="font-medium text-foreground">Suppliers</span> — Add each vendor you order from
                  (contact details are optional but useful on POs and receipts).
                </span>
              </li>
              <li className="flex gap-3 rounded-lg border bg-background/80 p-3 shadow-sm">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-foreground">
                  2
                </span>
                <span>
                  <span className="font-medium text-foreground">New PO</span> — Build a draft with stock lines and
                  quantities. Save as draft while you confirm; <strong className="font-medium text-foreground">Submit</strong>{' '}
                  when the order is sent to the supplier.
                </span>
              </li>
              <li className="flex gap-3 rounded-lg border bg-background/80 p-3 shadow-sm">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-foreground">
                  3
                </span>
                <span>
                  <span className="font-medium text-foreground">Receive</span> — When goods arrive, open{' '}
                  <strong className="font-medium text-foreground">Receive…</strong> and enter quantities (and expiry /
                  unit cost if you track them). Partial receipts are supported.
                </span>
              </li>
              <li className="flex gap-3 rounded-lg border bg-background/80 p-3 shadow-sm">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-foreground">
                  4
                </span>
                <span>
                  <span className="font-medium text-foreground">Inventory tab</span> — Use it for counts, issues, and
                  one-off purchases; use <strong className="font-medium text-foreground">Purchasing</strong> when the
                  workflow is supplier → PO → delivery.
                </span>
              </li>
            </ol>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(280px,360px)_1fr] lg:items-start">
        <Card className="shadow-sm">
          <CardHeader className="space-y-2 pb-4">
            <div className="flex flex-row items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="text-xl font-semibold flex items-center gap-2">
                  <Truck className="h-5 w-5 text-primary shrink-0" /> Suppliers
                </CardTitle>
                <CardDescription className="text-base leading-relaxed">
                  Vendors you buy from. Every purchase order must reference one supplier.
                </CardDescription>
              </div>
              <Button size="sm" variant="outline" className="h-9 shrink-0 text-sm" onClick={() => setSupplierModal(true)}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {suppliers.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-muted/20 p-5 text-center">
                <p className="text-base font-medium text-foreground">No suppliers yet</p>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                  Add your first supplier, then create a purchase order on the right.
                </p>
                <Button className="mt-4 h-10 text-sm" onClick={() => setSupplierModal(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Add supplier
                </Button>
              </div>
            ) : (
              suppliers.map((s) => (
                <div
                  key={s.id}
                  className="rounded-lg border bg-card px-4 py-3.5 shadow-sm transition-colors hover:bg-muted/25"
                >
                  <p className="text-base font-semibold text-foreground">{s.name}</p>
                  <div className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                    {s.contact_name && (
                      <p className="flex items-center gap-2">
                        <User className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                        <span>{s.contact_name}</span>
                      </p>
                    )}
                    {s.phone && (
                      <p className="flex items-center gap-2">
                        <Phone className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                        <span>{s.phone}</span>
                      </p>
                    )}
                    {s.email && (
                      <p className="flex items-center gap-2 break-all">
                        <Mail className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                        <span>{s.email}</span>
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm min-w-0">
          <CardHeader className="space-y-2 pb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1 min-w-0">
                <CardTitle className="text-xl font-semibold flex items-center gap-2">
                  <Package className="h-5 w-5 text-primary shrink-0" /> Purchase orders
                </CardTitle>
                <CardDescription className="text-base leading-relaxed">
                  Draft and submit orders, then record receipts when stock arrives. Click a column heading to sort;
                  newest orders appear first by default.
                </CardDescription>
              </div>
              <Button
                size="sm"
                className="h-10 shrink-0 text-sm sm:self-start"
                disabled={suppliers.length === 0}
                title={suppliers.length === 0 ? 'Add a supplier before creating a PO' : undefined}
                onClick={() => setPoModal(true)}
              >
                <Plus className="h-4 w-4 mr-1" /> New PO
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-0 sm:px-6">
            {orders.length === 0 ? (
              <div className="mx-6 rounded-lg border border-dashed bg-muted/20 p-6 text-center sm:mx-0">
                <p className="text-base font-medium text-foreground">No purchase orders yet</p>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                  {suppliers.length === 0
                    ? 'Add at least one supplier, then use New PO to create your first order.'
                    : 'Create a draft purchase order, add lines, then submit when you place the order with the vendor.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto border-t sm:rounded-md sm:border sm:mx-0">
                <table className="w-full min-w-[720px] text-left text-base">
                  <thead className="bg-muted/50 text-sm">
                    <tr className="border-b">
                      <th className="px-4 py-3 font-semibold">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 font-semibold text-foreground hover:text-primary"
                          onClick={() => onPoSort('supplier_name')}
                        >
                          Supplier
                          {poSortIcon('supplier_name')}
                        </button>
                      </th>
                      <th className="px-4 py-3 font-semibold whitespace-nowrap">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 font-semibold text-foreground hover:text-primary"
                          onClick={() => onPoSort('created_at')}
                        >
                          Created
                          {poSortIcon('created_at')}
                        </button>
                      </th>
                      <th className="px-4 py-3 font-semibold whitespace-nowrap">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 font-semibold text-foreground hover:text-primary"
                          onClick={() => onPoSort('expected_date')}
                        >
                          Expected
                          {poSortIcon('expected_date')}
                        </button>
                      </th>
                      <th className="px-4 py-3 text-right font-semibold whitespace-nowrap">
                        <button
                          type="button"
                          className="inline-flex w-full items-center justify-end gap-1.5 font-semibold text-foreground hover:text-primary"
                          onClick={() => onPoSort('total_ordered_qty')}
                        >
                          Qty (lines)
                          {poSortIcon('total_ordered_qty')}
                        </button>
                      </th>
                      <th className="px-4 py-3 font-semibold whitespace-nowrap">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 font-semibold text-foreground hover:text-primary"
                          onClick={() => onPoSort('status')}
                        >
                          Status
                          {poSortIcon('status')}
                        </button>
                      </th>
                      <th className="px-4 py-3 text-center text-sm font-semibold min-w-[200px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {sortedOrders.map((o) => (
                      <tr key={o.id} className="bg-card hover:bg-muted/20">
                        <td className="px-4 py-3.5 align-middle font-medium text-foreground">{o.supplier_name}</td>
                        <td className="px-4 py-3.5 align-middle text-muted-foreground tabular-nums whitespace-nowrap">
                          {new Date(o.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                        </td>
                        <td className="px-4 py-3.5 align-middle text-muted-foreground tabular-nums whitespace-nowrap">
                          {o.expected_date
                            ? new Date(o.expected_date).toLocaleDateString(undefined, { dateStyle: 'medium' })
                            : '—'}
                        </td>
                        <td className="px-4 py-3.5 align-middle text-right tabular-nums font-medium">
                          {o.total_ordered_qty}
                        </td>
                        <td className="px-4 py-3.5 align-middle">
                          <Badge variant={poStatusBadgeVariant(o.status)} className="text-xs font-semibold">
                            {formatPoStatusLabel(o.status)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3.5 align-middle">
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            {o.status === 'draft' && (
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-9 text-sm"
                                disabled={submitPO.isPending}
                                onClick={() => submitPO.mutate(o.id)}
                              >
                                Submit
                              </Button>
                            )}
                            {(o.status === 'ordered' || o.status === 'partially_received') && (
                              <Button size="sm" variant="outline" className="h-9 text-sm" onClick={() => openReceive(o.id)}>
                                Receive…
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={supplierModal} onOpenChange={setSupplierModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">New supplier</DialogTitle>
            <DialogDescription className="text-base">
              Add a vendor you can link to purchase orders and receipts.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <Label htmlFor="sup-name" className="text-base">Name</Label>
              <Input id="sup-name" className="h-11 text-base" value={supplierForm.name} onChange={(e) => setSupplierForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sup-contact" className="text-base">Contact</Label>
              <Input id="sup-contact" className="h-11 text-base" value={supplierForm.contact_name} onChange={(e) => setSupplierForm((f) => ({ ...f, contact_name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sup-phone" className="text-base">Phone</Label>
              <Input id="sup-phone" className="h-11 text-base" value={supplierForm.phone} onChange={(e) => setSupplierForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sup-email" className="text-base">Email</Label>
              <Input id="sup-email" type="email" className="h-11 text-base" value={supplierForm.email} onChange={(e) => setSupplierForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="text-base h-11" onClick={() => setSupplierModal(false)}>
              Cancel
            </Button>
            <Button className="text-base h-11" disabled={!supplierForm.name.trim() || createSup.isPending} onClick={() => createSup.mutate()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={poModal} onOpenChange={setPoModal}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">New purchase order</DialogTitle>
            <DialogDescription className="text-base">
              Choose a supplier and lines. Drafts can be submitted when you are ready to send the order.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-1 text-base">
            <div className="space-y-2">
              <Label htmlFor="po-supplier" className="text-base">Supplier</Label>
              <select
                id="po-supplier"
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={poForm.supplier_id}
                onChange={(e) => setPoForm((f) => ({ ...f, supplier_id: e.target.value }))}
              >
                <option value="">Select supplier…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="po-expected" className="text-base">Expected date</Label>
              <Input id="po-expected" type="date" className="h-11 text-base" value={poForm.expected_date} onChange={(e) => setPoForm((f) => ({ ...f, expected_date: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="po-notes" className="text-base">Notes</Label>
              <Textarea id="po-notes" className="min-h-[88px] text-base resize-y" value={poForm.notes} onChange={(e) => setPoForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional notes for this PO…" />
            </div>
            <div className="space-y-2">
              <Label className="text-base font-semibold">Lines</Label>
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-base">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-left font-semibold text-sm px-3 py-2.5">Item</th>
                      <th className="text-right font-semibold text-sm px-3 py-2.5 w-[120px]">Qty</th>
                      <th className="text-right font-semibold text-sm px-3 py-2.5 w-[130px]">Unit cost</th>
                      <th className="w-[100px] px-2 py-2.5" aria-label="Row actions" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {poForm.lines.map((ln, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2 align-middle">
                          <select
                            className="h-11 w-full rounded-md border border-input bg-background px-2 text-base"
                            value={ln.stock_item_id}
                            onChange={(e) => {
                              const next = [...poForm.lines]
                              next[idx] = { ...next[idx], stock_item_id: e.target.value }
                              setPoForm((f) => ({ ...f, lines: next }))
                            }}
                          >
                            <option value="">Select item…</option>
                            {stockItems.map((it) => (
                              <option key={it.id} value={it.id}>
                                {it.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <Input
                            type="number"
                            className="h-11 text-base text-right tabular-nums"
                            placeholder="Qty"
                            value={ln.quantity_ordered || ''}
                            onChange={(e) => {
                              const next = [...poForm.lines]
                              next[idx] = { ...next[idx], quantity_ordered: parseFloat(e.target.value) || 0 }
                              setPoForm((f) => ({ ...f, lines: next }))
                            }}
                          />
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <Input
                            type="number"
                            step="0.01"
                            className="h-11 text-base text-right tabular-nums"
                            placeholder="Optional"
                            value={ln.unit_cost ?? ''}
                            onChange={(e) => {
                              const next = [...poForm.lines]
                              const v = e.target.value
                              next[idx] = {
                                ...next[idx],
                                unit_cost: v === '' ? undefined : parseFloat(v),
                              }
                              setPoForm((f) => ({ ...f, lines: next }))
                            }}
                          />
                        </td>
                        <td className="px-2 py-2 align-middle">
                          <div className="flex gap-1 justify-end">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-11 w-11 shrink-0"
                              aria-label="Add line"
                              onClick={() =>
                                setPoForm((f) => ({
                                  ...f,
                                  lines: [...f.lines, { stock_item_id: '', quantity_ordered: 1, unit_cost: undefined }],
                                }))
                              }
                            >
                              +
                            </Button>
                            {poForm.lines.length > 1 && (
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-11 w-11 shrink-0"
                                aria-label="Remove line"
                                onClick={() => setPoForm((f) => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }))}
                              >
                                −
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="text-base h-11" onClick={() => setPoModal(false)}>
              Cancel
            </Button>
            <Button
              className="text-base h-11"
              disabled={!poForm.supplier_id || poForm.lines.every((l) => !l.stock_item_id) || createPO.isPending}
              onClick={() => createPO.mutate()}
            >
              Create draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!receivePoId} onOpenChange={(o) => !o && setReceivePoId(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">Receive goods</DialogTitle>
            <DialogDescription className="text-base">
              Enter quantities received. Optional expiry and unit cost override batch defaults.
            </DialogDescription>
          </DialogHeader>
          {!detail ? (
            <p className="text-base text-muted-foreground py-8">Loading…</p>
          ) : (
            <div className="space-y-4 text-base">
              <p className="text-muted-foreground">
                {detail.supplier_name} · {detail.status}
              </p>
              {detail.lines.map((ln) => {
                const open = ln.quantity_ordered - ln.quantity_received
                const r = receiveLines[ln.id] ?? { qty: 0, expiry: '', unit_cost: ln.unit_cost != null ? String(ln.unit_cost) : '' }
                return (
                  <div key={ln.id} className="border rounded-lg p-4 space-y-3">
                    <div className="font-semibold text-base">
                      {ln.item_name}{' '}
                      <span className="text-muted-foreground text-sm font-normal">({ln.unit})</span>
                    </div>
                    <p className="text-sm text-muted-foreground">Open to receive: {open.toFixed(2)}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label className="text-base">Qty</Label>
                        <Input
                          type="number"
                          className="h-11 text-base tabular-nums"
                          value={r.qty || ''}
                          onChange={(e) =>
                            setReceiveLines((m) => ({
                              ...m,
                              [ln.id]: { ...r, qty: parseFloat(e.target.value) || 0 },
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-base">Expiry</Label>
                        <Input
                          type="date"
                          className="h-11 text-base"
                          value={r.expiry}
                          onChange={(e) =>
                            setReceiveLines((m) => ({
                              ...m,
                              [ln.id]: { ...r, expiry: e.target.value },
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-base">Unit cost</Label>
                        <Input
                          type="number"
                          step="0.01"
                          className="h-11 text-base tabular-nums"
                          value={r.unit_cost}
                          onChange={(e) =>
                            setReceiveLines((m) => ({
                              ...m,
                              [ln.id]: { ...r, unit_cost: e.target.value },
                            }))
                          }
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="text-base h-11" onClick={() => setReceivePoId(null)}>
              Cancel
            </Button>
            <Button
              className="text-base h-11"
              disabled={!detail || receivePO.isPending}
              onClick={() => {
                if (!detail || !receivePoId) return
                const lines = buildReceivePayload(detail)
                if (lines.length === 0) {
                  showToast('error', 'Enter at least one line quantity to receive')
                  return
                }
                receivePO.mutate({ id: receivePoId, lines })
              }}
            >
              Record receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
