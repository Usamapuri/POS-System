import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import apiClient from '@/api/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Plus,
  Trash2,
  Edit2,
  Monitor,
  Printer,
  X,
  Save,
  Store,
  AlertTriangle,
  Info,
  GripVertical,
  Check,
  ChefHat,
  ScrollText,
  Send,
  ArrowRight,
  CircleAlert,
} from 'lucide-react'
import type { KitchenStation, Category, StationKOT } from '@/types'
import { useKitchenSettings } from '@/hooks/useKitchenSettings'
import { useToast } from '@/hooks/use-toast'
import { printKotReceipts } from '@/lib/printKotReceipt'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type StationFormState = {
  name: string
  output_type: 'kds' | 'printer'
  print_location: 'kitchen' | 'counter'
  sort_order: number
  is_active: boolean
}

const EMPTY_FORM: StationFormState = {
  name: '',
  output_type: 'kds',
  print_location: 'kitchen',
  sort_order: 0,
  is_active: true,
}

function stationOwnerOf(stations: KitchenStation[], categoryId: string): KitchenStation | undefined {
  return stations.find((s) => (s.category_ids || []).includes(categoryId))
}

/**
 * Resolve which station an item routed via `categoryId` would land on, mirroring
 * the backend logic in kot.go FireKOT (active stations, then deterministic fallback).
 */
function resolveRoutedStation(
  stations: KitchenStation[],
  categoryId: string | null,
): { station: KitchenStation; isFallback: boolean } | null {
  const active = stations.filter((s) => s.is_active)
  if (categoryId) {
    const owner = active.find((s) => (s.category_ids || []).includes(categoryId))
    if (owner) return { station: owner, isFallback: false }
  }
  if (active.length === 0) return null
  // (name='Main Kitchen') DESC, sort_order ASC, created_at ASC
  const sorted = [...active].sort((a, b) => {
    const an = a.name === 'Main Kitchen' ? 0 : 1
    const bn = b.name === 'Main Kitchen' ? 0 : 1
    if (an !== bn) return an - bn
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
    return (a.created_at || '').localeCompare(b.created_at || '')
  })
  return { station: sorted[0], isFallback: true }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StationManagement() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const kitchen = useKitchenSettings()
  const isKotOnly = kitchen.mode === 'kot_only'

  const [showCreate, setShowCreate] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<StationFormState>(EMPTY_FORM)
  const [pendingDelete, setPendingDelete] = useState<KitchenStation | null>(null)
  const [pendingMove, setPendingMove] = useState<{
    category: Category
    fromStation: KitchenStation
    toStation: KitchenStation
  } | null>(null)
  const [previewCategoryId, setPreviewCategoryId] = useState<string>('')
  const [explainerOpen, setExplainerOpen] = useState(false)

  // ── Queries ──
  const {
    data: stations = [],
    isLoading: stationsLoading,
    isError: stationsError,
    error: stationsErrorDetail,
  } = useQuery({
    queryKey: ['stations'],
    queryFn: async () => {
      const res = await apiClient.getStations()
      return (res.data || []) as KitchenStation[]
    },
  })

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await apiClient.getCategories()
      return (res.data || []) as Category[]
    },
  })

  // ── Derived ──
  const sortedStations = useMemo(
    () => [...stations].sort((a, b) => a.sort_order - b.sort_order),
    [stations],
  )
  const kdsStations = sortedStations.filter((s) => s.output_type === 'kds')
  const printerStations = sortedStations.filter((s) => s.output_type === 'printer')

  const unassignedCategories = useMemo(
    () => categories.filter((c) => !stations.some((s) => (s.category_ids || []).includes(c.id))),
    [categories, stations],
  )

  // ── Mutations ──
  const invalidateStations = () => {
    queryClient.invalidateQueries({ queryKey: ['stations'] })
    queryClient.invalidateQueries({ queryKey: ['categories'] })
    queryClient.invalidateQueries({ queryKey: ['admin-categories'] })
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.createStation({
        name: form.name.trim(),
        output_type: form.output_type,
        sort_order: form.sort_order,
        ...(form.output_type === 'printer' ? { print_location: form.print_location } : {}),
      })
      if (!res.success) throw new Error(res.message || 'Failed to create station')
      // is_active defaults true on insert; only push an update if user toggled it off.
      if (!form.is_active && res.data?.id) {
        await apiClient.updateStation(res.data.id, { is_active: false })
      }
    },
    onSuccess: () => {
      invalidateStations()
      resetForm()
      toast({ title: 'Station created' })
    },
    onError: (e: unknown) =>
      toast({
        title: 'Could not create station',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      }),
  })

  const updateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.updateStation(id, {
        name: form.name.trim(),
        output_type: form.output_type,
        sort_order: form.sort_order,
        is_active: form.is_active,
        print_location: form.output_type === 'printer' ? form.print_location : 'kitchen',
      })
      if (!res.success) throw new Error(res.message || 'Failed to update station')
    },
    onSuccess: () => {
      invalidateStations()
      resetForm()
      toast({ title: 'Station updated' })
    },
    onError: (e: unknown) =>
      toast({
        title: 'Could not update station',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteStation(id),
    onSuccess: () => {
      invalidateStations()
      setPendingDelete(null)
      toast({ title: 'Station deleted' })
    },
    onError: (e: unknown) =>
      toast({
        title: 'Could not delete station',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      }),
  })

  const setCategoriesMutation = useMutation({
    mutationFn: ({ stationId, categoryIds }: { stationId: string; categoryIds: string[] }) =>
      apiClient.setStationCategories(stationId, categoryIds),
    onSuccess: invalidateStations,
    onError: (e: unknown) =>
      toast({
        title: 'Could not update categories',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      }),
  })

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      apiClient.updateStation(id, { is_active }),
    // Optimistic update so the switch doesn't lag.
    onMutate: async ({ id, is_active }) => {
      await queryClient.cancelQueries({ queryKey: ['stations'] })
      const prev = queryClient.getQueryData<KitchenStation[]>(['stations'])
      if (prev) {
        queryClient.setQueryData<KitchenStation[]>(
          ['stations'],
          prev.map((s) => (s.id === id ? { ...s, is_active } : s)),
        )
      }
      return { prev }
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['stations'], ctx.prev)
      toast({ title: 'Could not update station', variant: 'destructive' })
    },
    onSettled: invalidateStations,
  })

  const reorderMutation = useMutation({
    mutationFn: async (newOrder: KitchenStation[]) => {
      // Issue updates in parallel; backend updates `sort_order` per row.
      await Promise.all(
        newOrder.map((s, idx) =>
          s.sort_order === idx ? Promise.resolve() : apiClient.updateStation(s.id, { sort_order: idx }),
        ),
      )
    },
    onSuccess: invalidateStations,
    onError: (e: unknown) => {
      invalidateStations()
      toast({
        title: 'Could not reorder stations',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    },
  })

  const testKotMutation = useMutation({
    mutationFn: (stationId: string) => apiClient.testStationKOT(stationId),
    onSuccess: (res) => {
      if (!res.success) {
        toast({
          title: 'Test failed',
          description: res.message || 'Could not generate a test KOT',
          variant: 'destructive',
        })
        return
      }
      const kots = (res.data?.kots || []) as StationKOT[]
      printKotReceipts(kots)
      toast({ title: 'Test KOT sent', description: 'Opening print dialog…' })
    },
    onError: (e: unknown) =>
      toast({
        title: 'Test failed',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      }),
  })

  // ── Helpers ──
  const resetForm = () => {
    setShowCreate(false)
    setEditId(null)
    setForm(EMPTY_FORM)
  }

  const startCreate = () => {
    resetForm()
    setForm({ ...EMPTY_FORM, sort_order: stations.length })
    setShowCreate(true)
  }

  const startEdit = (s: KitchenStation) => {
    setShowCreate(false)
    setEditId(s.id)
    setForm({
      name: s.name,
      output_type: s.output_type,
      print_location: s.print_location === 'counter' ? 'counter' : 'kitchen',
      sort_order: s.sort_order,
      is_active: s.is_active,
    })
  }

  const removeCategoryFromStation = (station: KitchenStation, categoryId: string) => {
    const next = (station.category_ids || []).filter((id) => id !== categoryId)
    setCategoriesMutation.mutate({ stationId: station.id, categoryIds: next })
  }

  const assignCategoryToStation = (station: KitchenStation, category: Category) => {
    const owner = stationOwnerOf(stations, category.id)
    if (owner && owner.id !== station.id) {
      setPendingMove({ category, fromStation: owner, toStation: station })
      return
    }
    const ids = Array.from(new Set([...(station.category_ids || []), category.id]))
    setCategoriesMutation.mutate({ stationId: station.id, categoryIds: ids })
  }

  const confirmMove = () => {
    if (!pendingMove) return
    const { category, toStation } = pendingMove
    const ids = Array.from(new Set([...(toStation.category_ids || []), category.id]))
    setCategoriesMutation.mutate(
      { stationId: toStation.id, categoryIds: ids },
      { onSettled: () => setPendingMove(null) },
    )
  }

  // ── Drag-to-reorder ──
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const onDragEnd = (group: 'kds' | 'printer') => (e: DragEndEvent) => {
    const list = group === 'kds' ? kdsStations : printerStations
    const { active, over } = e
    if (!over || active.id === over.id) return
    const fromIdx = list.findIndex((s) => s.id === active.id)
    const toIdx = list.findIndex((s) => s.id === over.id)
    if (fromIdx < 0 || toIdx < 0) return
    const movedGroup = arrayMove(list, fromIdx, toIdx)
    // Recompose full station list preserving the other group's relative order.
    const otherGroup = group === 'kds' ? printerStations : kdsStations
    // Strategy: KDS stations come first in the list, then printer stations.
    const newOrder =
      group === 'kds' ? [...movedGroup, ...otherGroup] : [...otherGroup, ...movedGroup]
    reorderMutation.mutate(newOrder)
  }

  // ── Loading / error ──
  if (stationsLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[240px]">
        <div className="text-muted-foreground text-sm">Loading kitchen stations…</div>
      </div>
    )
  }

  if (stationsError) {
    return (
      <div className="p-6 space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Kitchen Stations</h2>
        <p className="text-destructive text-sm">
          Could not load stations.{' '}
          {stationsErrorDetail instanceof Error
            ? stationsErrorDetail.message
            : 'Check that the API is running and the database has the kitchen_stations migration applied.'}
        </p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Kitchen Stations</h2>
          <p className="text-muted-foreground mt-1">
            Configure where each menu category is sent when staff fire a KOT.
          </p>
        </div>
        <Button onClick={startCreate}>
          <Plus className="w-4 h-4 mr-2" /> Add Station
        </Button>
      </div>

      {/* Kitchen mode banner */}
      <KitchenModeBanner isKotOnly={isKotOnly} />

      {/* How routing works */}
      <RoutingExplainer open={explainerOpen} onToggle={() => setExplainerOpen((v) => !v)} />

      {/* Coverage + routing preview */}
      <div className="grid gap-4 md:grid-cols-2">
        <CoveragePanel
          totalCategories={categories.length}
          unassigned={unassignedCategories}
          stations={sortedStations.filter((s) => s.is_active)}
          onAssign={(category, station) => assignCategoryToStation(station, category)}
        />
        <RoutingPreview
          categories={categories}
          stations={sortedStations}
          isKotOnly={isKotOnly}
          previewCategoryId={previewCategoryId}
          onPreviewCategoryChange={setPreviewCategoryId}
        />
      </div>

      {/* Create / Edit Form */}
      {(showCreate || editId) && (
        <StationForm
          editing={!!editId}
          form={form}
          setForm={setForm}
          onCancel={resetForm}
          onSubmit={() => (editId ? updateMutation.mutate(editId) : createMutation.mutate())}
          submitting={createMutation.isPending || updateMutation.isPending}
        />
      )}

      {/* Stations grouped by output type. When the venue has zero stations
          configured we hide the per-group empty hints in favor of one big
          empty-state card with a CTA, to avoid stacked redundant copy. */}
      {sortedStations.length === 0 ? (
        !showCreate && (
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <ChefHat className="w-10 h-10 mx-auto text-muted-foreground" />
              <div>
                <p className="font-medium">No kitchen stations configured yet.</p>
                <p className="text-sm text-muted-foreground">
                  Add one to start routing KOTs to a screen or a thermal printer.
                </p>
              </div>
              <Button onClick={startCreate}>
                <Plus className="w-4 h-4 mr-2" /> Add Your First Station
              </Button>
            </CardContent>
          </Card>
        )
      ) : (
        <>
          <StationGroup
            title="Kitchen Displays"
            icon={Monitor}
            emptyHint="No KDS stations yet. Add one to send tickets to the kitchen screen."
            stations={kdsStations}
            sensors={sensors}
            onDragEnd={onDragEnd('kds')}
            renderStation={(s) => (
              <SortableStationCard
                key={s.id}
                station={s}
                categories={categories}
                stations={sortedStations}
                isKotOnly={isKotOnly}
                onEdit={() => startEdit(s)}
                onDelete={() => setPendingDelete(s)}
                onToggleActive={(v) => toggleActiveMutation.mutate({ id: s.id, is_active: v })}
                onRemoveCategory={(cid) => removeCategoryFromStation(s, cid)}
                onAssignCategory={(c) => assignCategoryToStation(s, c)}
                onTestKot={() => testKotMutation.mutate(s.id)}
                testKotPending={testKotMutation.isPending}
              />
            )}
          />

          <StationGroup
            title="Printer Stations"
            icon={Printer}
            emptyHint="No printer stations. Add one if you want thermal KOT slips."
            stations={printerStations}
            sensors={sensors}
            onDragEnd={onDragEnd('printer')}
            renderStation={(s) => (
              <SortableStationCard
                key={s.id}
                station={s}
                categories={categories}
                stations={sortedStations}
                isKotOnly={isKotOnly}
                onEdit={() => startEdit(s)}
                onDelete={() => setPendingDelete(s)}
                onToggleActive={(v) => toggleActiveMutation.mutate({ id: s.id, is_active: v })}
                onRemoveCategory={(cid) => removeCategoryFromStation(s, cid)}
                onAssignCategory={(c) => assignCategoryToStation(s, c)}
                onTestKot={() => testKotMutation.mutate(s.id)}
                testKotPending={testKotMutation.isPending}
              />
            )}
          />
        </>
      )}

      {/* Delete confirmation */}
      <DeleteStationDialog
        station={pendingDelete}
        categories={categories}
        stations={sortedStations}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
        deleting={deleteMutation.isPending}
      />

      {/* Move-category confirmation */}
      <MoveCategoryDialog
        pendingMove={pendingMove}
        onCancel={() => setPendingMove(null)}
        onConfirm={confirmMove}
        moving={setCategoriesMutation.isPending}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KitchenModeBanner({ isKotOnly }: { isKotOnly: boolean }) {
  if (isKotOnly) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
        <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
        <div className="space-y-1">
          <p className="font-semibold">Venue is in KOT-only mode</p>
          <p>
            KDS routing is disabled. Every station below behaves as a printer regardless of its
            output type, and the Kitchen Display screen is hidden from staff. Change this in{' '}
            <a className="underline font-medium" href="/admin/settings">
              Settings → Kitchen
            </a>
            .
          </p>
        </div>
      </div>
    )
  }
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
      <Info className="w-5 h-5 mt-0.5 shrink-0 text-muted-foreground" />
      <div>
        <p>
          <span className="font-semibold">KDS mode is on.</span> Each station's output type below
          decides whether items show on the kitchen display or print a thermal slip.
        </p>
      </div>
    </div>
  )
}

function RoutingExplainer({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <button
          type="button"
          onClick={onToggle}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">How KOT routing works</CardTitle>
          </div>
          <span className="text-xs text-muted-foreground">{open ? 'Hide' : 'Show'}</span>
        </button>
      </CardHeader>
      {open && (
        <CardContent className="pt-0">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Pill>Order item</Pill>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
            <Pill>Product's category</Pill>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
            <Pill>Mapped station</Pill>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
            <Pill tone="primary">KDS screen or thermal printer</Pill>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">One category → one station.</span>{' '}
              Assigning a category to a different station automatically removes it from the previous
              one.
            </li>
            <li>
              <span className="font-medium text-foreground">KDS</span> stations show line items on
              the Kitchen Display; cooks bump them when ready.
            </li>
            <li>
              <span className="font-medium text-foreground">Printer</span> stations print a thermal
              KOT slip on fire and immediately mark the line as ready.{' '}
              <em>Print at station</em> uses a thermal next to the pass; <em>Print at counter</em>{' '}
              prints up front so a runner can hand-carry the slip back.
            </li>
            <li>
              <span className="font-medium text-foreground">Unassigned categories</span> fall back
              to the first active station (preferring one literally named "Main Kitchen").
            </li>
          </ul>
        </CardContent>
      )}
    </Card>
  )
}

function Pill({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'primary' }) {
  const cls =
    tone === 'primary'
      ? 'bg-primary/10 text-primary border-primary/30'
      : 'bg-muted text-foreground border-border'
  return <span className={`inline-flex items-center px-2.5 py-1 rounded-md border text-xs font-medium ${cls}`}>{children}</span>
}

function CoveragePanel({
  totalCategories,
  unassigned,
  stations,
  onAssign,
}: {
  totalCategories: number
  unassigned: Category[]
  stations: KitchenStation[]
  onAssign: (cat: Category, station: KitchenStation) => void
}) {
  const routed = totalCategories - unassigned.length
  const allRouted = unassigned.length === 0
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {allRouted ? (
            <Check className="w-4 h-4 text-emerald-600" />
          ) : (
            <CircleAlert className="w-4 h-4 text-amber-600" />
          )}
          Routing coverage
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">
          <span className="font-semibold">{routed}</span> of {totalCategories} categories routed
          {totalCategories === 0 && (
            <span className="text-muted-foreground"> — no menu categories yet</span>
          )}
          .
        </p>
        {!allRouted && (
          <>
            <p className="text-xs text-muted-foreground">
              Unassigned categories fall back to a default station — pick one explicitly to avoid
              surprises.
            </p>
            <div className="flex flex-wrap gap-2">
              {unassigned.map((cat) => (
                <Popover key={cat.id}>
                  <PopoverTrigger asChild>
                    <button
                      className="px-3 py-1 rounded-full text-xs font-medium border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200 dark:hover:bg-amber-900/50"
                      type="button"
                    >
                      {cat.name}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-2">
                    <p className="text-xs text-muted-foreground px-2 pb-2">Send to station</p>
                    {stations.length === 0 && (
                      <p className="px-2 py-1.5 text-xs">No active stations available.</p>
                    )}
                    {stations.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => onAssign(cat, s)}
                        className="w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-muted flex items-center gap-2"
                      >
                        {s.output_type === 'kds' ? (
                          <Monitor className="w-3.5 h-3.5 text-muted-foreground" />
                        ) : (
                          <Printer className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                        <span>{s.name}</span>
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function RoutingPreview({
  categories,
  stations,
  isKotOnly,
  previewCategoryId,
  onPreviewCategoryChange,
}: {
  categories: Category[]
  stations: KitchenStation[]
  isKotOnly: boolean
  previewCategoryId: string
  onPreviewCategoryChange: (id: string) => void
}) {
  const resolution = useMemo(
    () => resolveRoutedStation(stations, previewCategoryId || null),
    [stations, previewCategoryId],
  )
  const station = resolution?.station
  // KOT-only forces every station to printer behavior.
  const effectiveOutput = station ? (isKotOnly ? 'printer' : station.output_type) : null
  const effectivePrintLocation = station
    ? effectiveOutput === 'kds'
      ? 'kitchen'
      : station.print_location === 'counter'
        ? 'counter'
        : 'kitchen'
    : 'kitchen'

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Send className="w-4 h-4 text-muted-foreground" />
          Routing preview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Select value={previewCategoryId} onValueChange={onPreviewCategoryChange}>
          <SelectTrigger>
            <SelectValue placeholder="Pick a category to simulate…" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {!previewCategoryId && (
          <p className="text-xs text-muted-foreground">
            See exactly where an order item from a given category will land when fired.
          </p>
        )}

        {previewCategoryId && !station && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>No active stations exist. Items can't be routed until you add one.</span>
          </div>
        )}

        {previewCategoryId && station && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Pill>{categories.find((c) => c.id === previewCategoryId)?.name}</Pill>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
              <Pill tone="primary">{station.name}</Pill>
              <Badge variant={effectiveOutput === 'kds' ? 'default' : 'secondary'} className="ml-1">
                {effectiveOutput === 'kds' ? (
                  <>
                    <Monitor className="w-3 h-3 mr-1" /> KDS
                  </>
                ) : (
                  <>
                    <Printer className="w-3 h-3 mr-1" /> Printer
                  </>
                )}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {effectiveOutput === 'kds'
                ? 'Will appear on the Kitchen Display screen.'
                : `Will print a thermal KOT slip ${
                    effectivePrintLocation === 'counter' ? 'at the checkout counter' : 'at the kitchen station'
                  }.`}
            </p>
            {resolution?.isFallback && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle className="w-3 h-3 inline mr-1" />
                Falling back — no station is explicitly assigned to this category.
              </p>
            )}
            {isKotOnly && station.output_type === 'kds' && (
              <p className="text-xs text-muted-foreground">
                The station is configured as KDS, but KOT-only mode forces printer behavior.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function StationForm({
  editing,
  form,
  setForm,
  onCancel,
  onSubmit,
  submitting,
}: {
  editing: boolean
  form: StationFormState
  setForm: (s: StationFormState) => void
  onCancel: () => void
  onSubmit: () => void
  submitting: boolean
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{editing ? 'Edit Station' : 'New Station'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="text-sm font-medium text-foreground block mb-1">Name</label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Main Kitchen"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1">Output</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, output_type: 'kds', print_location: 'kitchen' })}
                className={`px-4 py-2 rounded-lg border text-sm font-medium flex items-center gap-2 ${
                  form.output_type === 'kds'
                    ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-200'
                    : 'border-border'
                }`}
              >
                <Monitor className="w-4 h-4" /> KDS
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, output_type: 'printer' })}
                className={`px-4 py-2 rounded-lg border text-sm font-medium flex items-center gap-2 ${
                  form.output_type === 'printer'
                    ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-200'
                    : 'border-border'
                }`}
              >
                <Printer className="w-4 h-4" /> Printer
              </button>
            </div>
          </div>
          <div className="w-24">
            <label className="text-sm font-medium text-foreground block mb-1">Order</label>
            <Input
              type="number"
              value={form.sort_order}
              onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="active-toggle"
              checked={form.is_active}
              onCheckedChange={(v) => setForm({ ...form, is_active: v })}
            />
            <label htmlFor="active-toggle" className="text-sm font-medium">
              Active
            </label>
          </div>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={!form.name.trim() || submitting}
          >
            <Save className="w-4 h-4 mr-2" /> {editing ? 'Update' : 'Create'}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        {form.output_type === 'printer' && (
          <div>
            <label className="text-sm font-medium text-foreground block mb-1">
              Thermal ticket prints at
            </label>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setForm({ ...form, print_location: 'kitchen' })}
                className={`px-4 py-2 rounded-lg border text-sm font-medium flex items-center gap-2 ${
                  form.print_location === 'kitchen'
                    ? 'bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-200'
                    : 'border-border'
                }`}
              >
                <Printer className="w-4 h-4" /> Kitchen station
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, print_location: 'counter' })}
                className={`px-4 py-2 rounded-lg border text-sm font-medium flex items-center gap-2 ${
                  form.print_location === 'counter'
                    ? 'bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-200'
                    : 'border-border'
                }`}
              >
                <Store className="w-4 h-4" /> Checkout counter
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="font-medium">Counter:</span> staff prints up front and walks the
              ticket to the kitchen.{' '}
              <span className="font-medium">Station:</span> use the thermal next to that pass.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function StationGroup({
  title,
  icon: Icon,
  emptyHint,
  stations,
  sensors,
  onDragEnd,
  renderStation,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  emptyHint: string
  stations: KitchenStation[]
  sensors: ReturnType<typeof useSensors>
  onDragEnd: (e: DragEndEvent) => void
  renderStation: (s: KitchenStation) => React.ReactNode
}) {
  if (stations.length === 0) {
    return (
      <section>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          <Icon className="w-4 h-4" /> {title}
        </h3>
        <p className="text-sm text-muted-foreground italic">{emptyHint}</p>
      </section>
    )
  }
  return (
    <section>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        <Icon className="w-4 h-4" /> {title}{' '}
        <span className="text-xs font-normal text-muted-foreground">({stations.length})</span>
      </h3>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={stations.map((s) => s.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stations.map((s) => renderStation(s))}
          </div>
        </SortableContext>
      </DndContext>
    </section>
  )
}

function SortableStationCard(props: {
  station: KitchenStation
  categories: Category[]
  stations: KitchenStation[]
  isKotOnly: boolean
  onEdit: () => void
  onDelete: () => void
  onToggleActive: (v: boolean) => void
  onRemoveCategory: (categoryId: string) => void
  onAssignCategory: (cat: Category) => void
  onTestKot: () => void
  testKotPending: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.station.id,
  })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'opacity-60' : ''}>
      <StationCard {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  )
}

function StationCard({
  station,
  categories,
  stations,
  isKotOnly,
  onEdit,
  onDelete,
  onToggleActive,
  onRemoveCategory,
  onAssignCategory,
  onTestKot,
  testKotPending,
  dragHandleProps,
}: {
  station: KitchenStation
  categories: Category[]
  stations: KitchenStation[]
  isKotOnly: boolean
  onEdit: () => void
  onDelete: () => void
  onToggleActive: (v: boolean) => void
  onRemoveCategory: (categoryId: string) => void
  onAssignCategory: (cat: Category) => void
  onTestKot: () => void
  testKotPending: boolean
  dragHandleProps: React.HTMLAttributes<HTMLButtonElement>
}) {
  const assignedCategories = categories.filter((c) =>
    (station.category_ids || []).includes(c.id),
  )
  const otherCategories = categories.filter((c) => !(station.category_ids || []).includes(c.id))
  // Forced behavior in KOT-only mode: surface that the KDS badge is being overridden.
  const effectiveOutput = isKotOnly ? 'printer' : station.output_type

  return (
    <Card className={station.is_active ? '' : 'opacity-70'}>
      <CardContent className="pt-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-1.5 min-w-0">
            <button
              type="button"
              {...dragHandleProps}
              className="mt-0.5 p-1 -ml-1 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
              aria-label="Drag to reorder"
            >
              <GripVertical className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h3 className="font-bold text-lg truncate">{station.name}</h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant={station.output_type === 'kds' ? 'default' : 'secondary'}>
                  {station.output_type === 'kds' ? (
                    <>
                      <Monitor className="w-3 h-3 mr-1" /> KDS
                    </>
                  ) : (
                    <>
                      <Printer className="w-3 h-3 mr-1" /> Printer
                    </>
                  )}
                </Badge>
                {effectiveOutput === 'printer' && (
                  <Badge variant="outline" className="text-xs font-normal">
                    {station.print_location === 'counter' ? 'Print at counter' : 'Print at station'}
                  </Badge>
                )}
                {isKotOnly && station.output_type === 'kds' && (
                  <Badge variant="outline" className="text-xs font-normal text-amber-700 border-amber-300 dark:text-amber-300 dark:border-amber-700">
                    Forced printer (KOT-only mode)
                  </Badge>
                )}
                {!station.is_active && <Badge variant="destructive">Inactive</Badge>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Switch
              checked={station.is_active}
              onCheckedChange={onToggleActive}
              aria-label="Active"
            />
            <button
              onClick={onEdit}
              className="p-2 text-muted-foreground hover:text-blue-600 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/30"
              aria-label="Edit station"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button
              onClick={onDelete}
              className="p-2 text-muted-foreground hover:text-destructive rounded-md hover:bg-destructive/10"
              aria-label="Delete station"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Routed categories */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Routed here
            </label>
            <span className="text-xs text-muted-foreground">{assignedCategories.length}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {assignedCategories.length === 0 && (
              <span className="text-xs text-muted-foreground italic">
                No categories yet — add one below.
              </span>
            )}
            {assignedCategories.map((cat) => (
              <span
                key={cat.id}
                className="group inline-flex items-center gap-1 pl-3 pr-1 py-1 rounded-full text-xs font-medium text-white shadow-sm"
                style={{ backgroundColor: cat.color || '#3b82f6' }}
              >
                {cat.name}
                <button
                  type="button"
                  onClick={() => onRemoveCategory(cat.id)}
                  className="ml-1 rounded-full p-0.5 hover:bg-white/30"
                  aria-label={`Unassign ${cat.name}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <AddCategoryPopover
              station={station}
              otherCategories={otherCategories}
              stations={stations}
              onAdd={onAssignCategory}
            />
          </div>
        </div>

        {/* Footer actions (test print only for printer stations) */}
        {(station.output_type === 'printer' || (isKotOnly && station.output_type === 'kds')) && (
          <div className="pt-2 border-t flex items-center justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onTestKot}
              disabled={!station.is_active || testKotPending}
            >
              <Send className="w-3.5 h-3.5 mr-2" /> Send test KOT
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function AddCategoryPopover({
  station,
  otherCategories,
  stations,
  onAdd,
}: {
  station: KitchenStation
  otherCategories: Category[]
  stations: KitchenStation[]
  onAdd: (cat: Category) => void
}) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  // Split into "free" (unassigned) vs "would move" so the picker is honest about
  // what clicking will do.
  const splits = useMemo(() => {
    const free: Category[] = []
    const owned: Array<{ cat: Category; from: KitchenStation }> = []
    for (const c of otherCategories) {
      const owner = stationOwnerOf(stations, c.id)
      if (owner) owned.push({ cat: c, from: owner })
      else free.push(c)
    }
    const f = filter.trim().toLowerCase()
    return {
      free: f ? free.filter((c) => c.name.toLowerCase().includes(f)) : free,
      owned: f ? owned.filter((o) => o.cat.name.toLowerCase().includes(f)) : owned,
    }
  }, [otherCategories, stations, filter])

  if (otherCategories.length === 0) return null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="px-3 py-1 rounded-full text-xs font-medium border border-dashed border-border text-muted-foreground hover:bg-muted"
        >
          <Plus className="w-3 h-3 inline mr-1" /> Add categories
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2">
        <Input
          autoFocus
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search categories…"
          className="h-8 mb-2"
        />
        <div className="max-h-64 overflow-y-auto space-y-3">
          {splits.free.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground px-1 mb-1">
                Unassigned
              </p>
              <div className="space-y-0.5">
                {splits.free.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      onAdd(c)
                      setOpen(false)
                    }}
                    className="w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-muted flex items-center gap-2"
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: c.color || '#3b82f6' }}
                    />
                    <span className="truncate">{c.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {splits.owned.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground px-1 mb-1">
                Move from another station
              </p>
              <div className="space-y-0.5">
                {splits.owned.map(({ cat, from }) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      onAdd(cat)
                      setOpen(false)
                    }}
                    className="w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-muted flex items-start gap-2"
                  >
                    <span
                      className="mt-1 w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: cat.color || '#3b82f6' }}
                    />
                    <span className="min-w-0">
                      <span className="block truncate">{cat.name}</span>
                      <span className="block text-[11px] text-muted-foreground truncate">
                        Currently on <span className="font-medium">{from.name}</span> → will move to{' '}
                        <span className="font-medium">{station.name}</span>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {splits.free.length === 0 && splits.owned.length === 0 && (
            <p className="text-xs text-muted-foreground px-2 py-1.5">No categories match.</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function DeleteStationDialog({
  station,
  categories,
  stations,
  onCancel,
  onConfirm,
  deleting,
}: {
  station: KitchenStation | null
  categories: Category[]
  stations: KitchenStation[]
  onCancel: () => void
  onConfirm: () => void
  deleting: boolean
}) {
  if (!station) return null
  const assigned = categories.filter((c) => (station.category_ids || []).includes(c.id))
  // After delete, where would items in those categories actually land?
  const remaining = stations.filter((s) => s.id !== station.id)
  const fallback = resolveRoutedStation(remaining, null)?.station

  return (
    <Dialog open={!!station} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete "{station.name}"?</DialogTitle>
          <DialogDescription>
            This action removes the station permanently. Category mappings will be cleared.
          </DialogDescription>
        </DialogHeader>
        {assigned.length > 0 ? (
          <div className="space-y-2 text-sm">
            <p>
              <span className="font-semibold">{assigned.length}</span>{' '}
              {assigned.length === 1 ? 'category' : 'categories'} will be unassigned:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {assigned.map((c) => (
                <span
                  key={c.id}
                  className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
                  style={{ backgroundColor: c.color || '#3b82f6' }}
                >
                  {c.name}
                </span>
              ))}
            </div>
            <p className="text-muted-foreground">
              {fallback ? (
                <>
                  Items in these categories will fall back to{' '}
                  <span className="font-medium text-foreground">{fallback.name}</span> until you
                  reassign them.
                </>
              ) : (
                <span className="text-amber-700 dark:text-amber-300">
                  No other active stations exist — items in these categories won't be routed
                  anywhere until you add one.
                </span>
              )}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No categories are mapped to this station.</p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" type="button">
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={deleting}>
            <Trash2 className="w-4 h-4 mr-2" /> Delete station
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MoveCategoryDialog({
  pendingMove,
  onCancel,
  onConfirm,
  moving,
}: {
  pendingMove: { category: Category; fromStation: KitchenStation; toStation: KitchenStation } | null
  onCancel: () => void
  onConfirm: () => void
  moving: boolean
}) {
  if (!pendingMove) return null
  const { category, fromStation, toStation } = pendingMove
  return (
    <Dialog open={!!pendingMove} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move "{category.name}" to {toStation.name}?</DialogTitle>
          <DialogDescription>
            Each category can be on exactly one station. Confirming will remove "{category.name}"
            from <span className="font-medium">{fromStation.name}</span> and assign it to{' '}
            <span className="font-medium">{toStation.name}</span>.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" type="button">
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" onClick={onConfirm} disabled={moving}>
            <ArrowRight className="w-4 h-4 mr-2" /> Move category
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
