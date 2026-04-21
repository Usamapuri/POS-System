import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { DiningTable } from '@/types'
import { FloorCombobox } from '@/components/tables/FloorCombobox'
import {
  MAP_H_MAX,
  MAP_H_MIN,
  MAP_SIZE_PRESETS,
  MAP_W_MAX,
  MAP_W_MIN,
  normalizeRotationDegrees,
  snapMapToGrid,
  snapRotationToStep,
  suggestMapDimensions,
} from '@/lib/tableMapSizing'
import { toastHelpers } from '@/lib/toast-helpers'

const DUPLICATE_TABLE_NAME_MSG =
  'Table names must be unique. Another table already uses this name — choose a different name.'

type LayoutTable = DiningTable & {
  map_x: number
  map_y: number
  map_w: number
  map_h: number
  map_rotation: number
  shape: 'rectangle' | 'square' | 'round'
}

function seedLayoutRow(t: DiningTable, index: number): LayoutTable {
  const col = index % 6
  const row = Math.floor(index / 6)
  const shape = (t.shape as LayoutTable['shape'] | undefined) ?? 'rectangle'
  const suggested = suggestMapDimensions(t.seating_capacity ?? 4, shape)
  const hasW = t.map_w != null && Number.isFinite(Number(t.map_w)) && Number(t.map_w) > 0
  const hasH = t.map_h != null && Number.isFinite(Number(t.map_h)) && Number(t.map_h) > 0
  return {
    ...t,
    map_x: t.map_x ?? 28 + col * 145,
    map_y: t.map_y ?? 24 + row * 108,
    map_w: hasW ? Number(t.map_w) : suggested.map_w,
    map_h: hasH ? Number(t.map_h) : suggested.map_h,
    map_rotation: t.map_rotation ?? 0,
    shape,
  }
}

type Props = {
  tables: DiningTable[]
  selectedFloor: string
  onFloorChange: (floor: string) => void
  floors: string[]
  onSave: (tables: LayoutTable[]) => Promise<void>
  onCreateFloor: (name: string) => Promise<void>
  onRenameFloor: (from: string, to: string) => Promise<void>
  onDeleteFloor: (name: string, moveTo: string) => Promise<void>
  onUpsertTable: (payload: {
    id?: string
    table_number: string
    seating_capacity: number
    location: string
    zone?: string | null
    is_occupied?: boolean
    map_x?: number
    map_y?: number
    map_w?: number
    map_h?: number
    map_rotation?: number
    shape?: string
  }) => Promise<void>
  onDeleteTable: (id: string) => Promise<void>
}

const CANVAS_W = 920
const CANVAS_H = 560

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

export function TableLayoutBuilder({
  tables,
  selectedFloor,
  onFloorChange,
  floors,
  onSave,
  onCreateFloor,
  onRenameFloor,
  onDeleteFloor,
  onUpsertTable,
  onDeleteTable,
}: Props) {
  const [gridSize] = useState(8)
  const [zoom, setZoom] = useState(1)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingTable, setSavingTable] = useState(false)
  const [isCreatingTable, setIsCreatingTable] = useState(false)
  const [addFloorOpen, setAddFloorOpen] = useState(false)
  const [newFloorName, setNewFloorName] = useState('')
  const [creatingFloor, setCreatingFloor] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [layout, setLayout] = useState<LayoutTable[]>([])
  const [canvasSize, setCanvasSize] = useState({ width: CANVAS_W, height: CANVAS_H })
  const [syncSizeWithSeats, setSyncSizeWithSeats] = useState(false)
  const [snapRotation15, setSnapRotation15] = useState(false)
  const [tableNumberError, setTableNumberError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const canvasShellRef = useRef<HTMLDivElement | null>(null)

  const floorTables = useMemo(
    () => tables.filter((t) => (t.location || 'General') === selectedFloor),
    [tables, selectedFloor]
  )

  useEffect(() => {
    const seeded = floorTables.map((t, index) => seedLayoutRow(t, index))
    setLayout(seeded)
    setDirty(false)
    setActiveId(null)
  }, [floorTables])

  useEffect(() => {
    const shell = canvasShellRef.current
    if (!shell) return

    const updateCanvasSize = () => {
      const nextWidth = Math.max(CANVAS_W, Math.floor(shell.clientWidth) - 16)
      const nextHeight = Math.max(CANVAS_H, Math.floor(shell.clientHeight) - 16)
      setCanvasSize((prev) =>
        prev.width === nextWidth && prev.height === nextHeight
          ? prev
          : { width: nextWidth, height: nextHeight }
      )
    }

    updateCanvasSize()
    const observer = new ResizeObserver(updateCanvasSize)
    observer.observe(shell)
    return () => observer.disconnect()
  }, [])

  const onPointerDown = (event: React.PointerEvent, tableId: string) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const table = layout.find((t) => t.id === tableId)
    if (!table) return

    const rect = canvas.getBoundingClientRect()
    const offsetX = (event.clientX - rect.left) / zoom - table.map_x
    const offsetY = (event.clientY - rect.top) / zoom - table.map_y

    setActiveId(tableId)
    ;(event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId)

    const onMove = (moveEvent: PointerEvent) => {
      const xRaw = (moveEvent.clientX - rect.left) / zoom - offsetX
      const yRaw = (moveEvent.clientY - rect.top) / zoom - offsetY
      setLayout((prev) =>
        prev.map((item) => {
          if (item.id !== tableId) return item
          const xSnapped = Math.round(xRaw / gridSize) * gridSize
          const ySnapped = Math.round(yRaw / gridSize) * gridSize
          return {
            ...item,
            map_x: clamp(xSnapped, 0, canvasSize.width - item.map_w),
            map_y: clamp(ySnapped, 0, canvasSize.height - item.map_h),
          }
        })
      )
      setDirty(true)
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const activeTable = layout.find((t) => t.id === activeId) ?? null
  const newTableDims = suggestMapDimensions(4, 'rectangle')
  const selectedTable = isCreatingTable
    ? ({
        id: '',
        table_number: '',
        seating_capacity: 4,
        location: selectedFloor,
        is_occupied: false,
        has_active_order: false,
        created_at: '',
        updated_at: '',
        map_x: 48,
        map_y: 48,
        map_w: newTableDims.map_w,
        map_h: newTableDims.map_h,
        map_rotation: 0,
        shape: 'rectangle',
      } as LayoutTable)
    : activeTable
  const [draft, setDraft] = useState<LayoutTable | null>(null)

  useEffect(() => {
    if (isCreatingTable) setSyncSizeWithSeats(true)
  }, [isCreatingTable])

  useEffect(() => {
    if (activeId && !isCreatingTable) setSyncSizeWithSeats(false)
  }, [activeId, isCreatingTable])

  useEffect(() => {
    setDraft(selectedTable ? { ...selectedTable } : null)
  }, [activeId, isCreatingTable, selectedFloor])

  const applyActivePatch = (patch: Partial<LayoutTable>) => {
    if (!activeId) return
    setLayout((prev) => prev.map((t) => (t.id === activeId ? { ...t, ...patch } : t)))
    setDirty(true)
  }

  const patchLayoutForActive = (patch: Partial<LayoutTable>) => {
    if (!activeId || isCreatingTable) return
    setLayout((prev) => prev.map((t) => (t.id === activeId ? { ...t, ...patch } : t)))
    setDirty(true)
  }

  const handleSeatsChange = (raw: string) => {
    if (!draft) return
    const seating_capacity = Math.max(1, Math.min(20, Math.round(Number(raw)) || 1))
    const dims = syncSizeWithSeats ? suggestMapDimensions(seating_capacity, draft.shape) : {}
    const next = { ...draft, seating_capacity, ...dims }
    setDraft(next)
    patchLayoutForActive(next)
  }

  const handleShapeChange = (shape: LayoutTable['shape']) => {
    if (!draft) return
    const dims = syncSizeWithSeats ? suggestMapDimensions(draft.seating_capacity, shape) : {}
    const next = { ...draft, shape, ...dims }
    setDraft(next)
    patchLayoutForActive(next)
  }

  const handleFitSizeToSeats = () => {
    if (!draft) return
    const { map_w, map_h } = suggestMapDimensions(draft.seating_capacity, draft.shape)
    setDraft({ ...draft, map_w, map_h })
    patchLayoutForActive({ map_w, map_h })
  }

  const handleMapWChange = (raw: string) => {
    if (!draft) return
    setSyncSizeWithSeats(false)
    const map_w = snapMapToGrid(clamp(Number(raw) || MAP_W_MIN, MAP_W_MIN, MAP_W_MAX))
    setDraft({ ...draft, map_w })
    patchLayoutForActive({ map_w })
  }

  const handleMapHChange = (raw: string) => {
    if (!draft) return
    setSyncSizeWithSeats(false)
    const map_h = snapMapToGrid(clamp(Number(raw) || MAP_H_MIN, MAP_H_MIN, MAP_H_MAX))
    setDraft({ ...draft, map_h })
    patchLayoutForActive({ map_h })
  }

  const applySizePreset = (label: (typeof MAP_SIZE_PRESETS)[number]['label']) => {
    if (!draft) return
    setSyncSizeWithSeats(false)
    const p = MAP_SIZE_PRESETS.find((x) => x.label === label)!
    const map_w = snapMapToGrid(p.map_w)
    const map_h = snapMapToGrid(p.map_h)
    setDraft({ ...draft, map_w, map_h })
    patchLayoutForActive({ map_w, map_h })
  }

  const handleRotationChange = (raw: string) => {
    if (!draft) return
    const n = Number(raw)
    const map_rotation = Number.isFinite(n) ? normalizeRotationDegrees(Math.round(n)) : 0
    setDraft({ ...draft, map_rotation })
    patchLayoutForActive({ map_rotation })
  }

  const handleRotationBlur = () => {
    if (!draft) return
    let map_rotation = normalizeRotationDegrees(draft.map_rotation)
    if (snapRotation15) map_rotation = snapRotationToStep(map_rotation, 15)
    if (map_rotation !== draft.map_rotation) {
      setDraft({ ...draft, map_rotation })
      patchLayoutForActive({ map_rotation })
    }
  }

  const setRotationPreset = (deg: number) => {
    if (!draft) return
    const map_rotation = normalizeRotationDegrees(deg)
    setDraft({ ...draft, map_rotation })
    patchLayoutForActive({ map_rotation })
  }

  const resetFloor = () => {
    const seeded = floorTables.map((t, index) => seedLayoutRow(t, index))
    setLayout(seeded)
    setDirty(false)
    setActiveId(null)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(layout)
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveTable = async (): Promise<boolean> => {
    if (!draft) return false
    const trimmed = draft.table_number.trim()
    if (!trimmed) return false

    const duplicate = tables.some((t) => {
      if (!isCreatingTable && t.id === draft.id) return false
      return t.table_number.trim() === trimmed
    })
    if (duplicate) {
      setTableNumberError(DUPLICATE_TABLE_NAME_MSG)
      toastHelpers.validationError(DUPLICATE_TABLE_NAME_MSG)
      return false
    }
    setTableNumberError(null)

    setSavingTable(true)
    try {
      await onUpsertTable({
        id: isCreatingTable ? undefined : draft.id,
        table_number: trimmed,
        seating_capacity: draft.seating_capacity,
        location: draft.location || selectedFloor,
        zone: null,
        is_occupied: Boolean(draft.is_occupied),
        map_x: draft.map_x,
        map_y: draft.map_y,
        map_w: draft.map_w,
        map_h: draft.map_h,
        map_rotation: draft.map_rotation,
        shape: draft.shape,
      })
      setIsCreatingTable(false)
      setActiveId(null)
      return true
    } finally {
      setSavingTable(false)
    }
  }

  const handleDeleteSelectedTable = async () => {
    if (!draft || isCreatingTable || !draft.id) return
    await onDeleteTable(draft.id)
    setActiveId(null)
  }

  const handleAddFloor = async () => {
    const name = newFloorName.trim()
    if (!name) return
    setCreatingFloor(true)
    try {
      await onCreateFloor(name)
      onFloorChange(name)
      setNewFloorName('')
      setAddFloorOpen(false)
    } finally {
      setCreatingFloor(false)
    }
  }

  const statusCounts = useMemo(() => {
    const available = layout.filter((t) => !(t.has_active_order ?? t.is_occupied)).length
    const occupied = layout.filter((t) => t.has_active_order ?? t.is_occupied).length
    const pending = layout.filter((t) => t.has_active_order && !t.is_occupied).length
    return { available, occupied, pending }
  }, [layout])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap gap-2 items-center">
          <div className="min-w-[200px] max-w-md flex-1">
            <FloorCombobox
              value={selectedFloor}
              onValueChange={onFloorChange}
              options={floors}
              onCreateFloor={onCreateFloor}
              onRenameFloor={onRenameFloor}
              onDeleteFloor={onDeleteFloor}
              allowCreate={false}
              placeholder="Floor - search or select"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAddFloorOpen(true)}
          >
            Add Floor
          </Button>
          <Button size="sm" onClick={() => { setIsCreatingTable(true); setActiveId(null) }}>
            Add Table
          </Button>
        </div>
        <div className="flex gap-2 items-center">
          <Button variant="outline" size="sm" onClick={() => setZoom((z) => clamp(z - 0.1, 0.7, 1.3))}>
            -
          </Button>
          <span className="text-sm min-w-14 text-center">{Math.round(zoom * 100)}%</span>
          <Button variant="outline" size="sm" onClick={() => setZoom((z) => clamp(z + 0.1, 0.7, 1.3))}>
            +
          </Button>
          <Button variant="outline" size="sm" onClick={resetFloor}>
            Reset floor
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
            {saving ? 'Saving...' : 'Save layout'}
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 items-center text-xs">
        <BadgePill label={`Available ${statusCounts.available}`} className="bg-green-100 text-green-800 border border-green-200" />
        <BadgePill label={`Occupied ${statusCounts.occupied}`} className="bg-slate-100 text-slate-800 border border-slate-300" />
        <BadgePill label={`Pending ${statusCounts.pending}`} className="bg-amber-100 text-amber-900 border border-amber-200" />
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-3">
        <div ref={canvasShellRef} className="border rounded-lg bg-[#f4efe6] overflow-auto min-h-[560px]">
          <div
            ref={canvasRef}
            className="relative m-2 border rounded-md bg-[#f7f1e8]"
            style={{
              width: `${canvasSize.width}px`,
              height: `${canvasSize.height}px`,
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
              backgroundImage:
                'linear-gradient(to right, rgba(74,53,33,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(74,53,33,0.06) 1px, transparent 1px)',
              backgroundSize: `${gridSize}px ${gridSize}px`,
            }}
          >
            {layout.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
                No tables on this floor yet. Use Add Table above or add tables from the table list.
              </div>
            )}
            {layout.map((table) => {
              const occupied = table.has_active_order ?? table.is_occupied
              return (
                <div
                  key={table.id}
                  onPointerDown={(e) => onPointerDown(e, table.id)}
                  onClick={() => setActiveId(table.id)}
                  className={`absolute select-none border shadow-sm cursor-move flex flex-col items-center justify-center text-sm ${
                    activeId === table.id ? 'ring-2 ring-primary' : ''
                  } ${occupied ? 'bg-emerald-100 border-emerald-400' : 'bg-white border-border'}`}
                  style={{
                    left: `${table.map_x}px`,
                    top: `${table.map_y}px`,
                    width: `${table.map_w}px`,
                    height: `${table.map_h}px`,
                    borderRadius: table.shape === 'round' ? '999px' : '10px',
                    transform: `rotate(${table.map_rotation}deg)`,
                  }}
                >
                  <div className="font-semibold leading-none">{table.table_number}</div>
                  <div className="opacity-70 text-[11px]">{table.seating_capacity} seats</div>
                </div>
              )
            })}
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Selected Table</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!draft ? (
              <p className="text-sm text-muted-foreground">Select a table to edit fields and layout.</p>
            ) : (
              <>
                  <p className="text-sm font-medium">{isCreatingTable ? 'New Table' : draft.table_number}</p>
                  <div>
                    <label className="text-xs text-muted-foreground">Table Number</label>
                    <Input
                      value={draft.table_number}
                      onChange={(e) => {
                        setTableNumberError(null)
                        setDraft({ ...draft, table_number: e.target.value })
                      }}
                      className="mt-1"
                      aria-invalid={tableNumberError ? true : undefined}
                    />
                    {tableNumberError ? (
                      <p className="text-xs text-destructive mt-1">{tableNumberError}</p>
                    ) : null}
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Location / Floor</label>
                    <div className="mt-1">
                      <FloorCombobox
                        value={draft.location || selectedFloor}
                        onValueChange={(v) => setDraft({ ...draft, location: v })}
                        options={floors}
                        onCreateFloor={onCreateFloor}
                        onRenameFloor={onRenameFloor}
                        onDeleteFloor={onDeleteFloor}
                        placeholder="Search or create floor"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Seats</label>
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        value={draft.seating_capacity}
                        onChange={(e) => handleSeatsChange(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Status</label>
                      <select
                        className="w-full p-2 border border-input rounded-md bg-background text-sm mt-1"
                        value={draft.is_occupied ? 'occupied' : 'available'}
                        onChange={(e) => setDraft({ ...draft, is_occupied: e.target.value === 'occupied' })}
                      >
                        <option value="available">Available</option>
                        <option value="occupied">Occupied</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 rounded-md border border-input/60 p-2">
                    <Checkbox
                      id="sync-table-size"
                      checked={syncSizeWithSeats}
                      onCheckedChange={(c) => setSyncSizeWithSeats(Boolean(c))}
                      className="mt-0.5"
                    />
                    <Label htmlFor="sync-table-size" className="text-xs font-normal leading-snug cursor-pointer">
                      Keep card size in sync when seats or shape change
                    </Label>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Shape</label>
                    <select
                      className="w-full p-2 border border-input rounded-md bg-background text-sm mt-1"
                      value={draft.shape}
                      onChange={(e) => handleShapeChange(e.target.value as LayoutTable['shape'])}
                    >
                      <option value="rectangle">Rectangle</option>
                      <option value="square">Square</option>
                      <option value="round">Round</option>
                    </select>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" size="sm" variant="secondary" onClick={handleFitSizeToSeats}>
                      Fit size to seats
                    </Button>
                    <span className="text-[11px] text-muted-foreground">Quick size</span>
                    {MAP_SIZE_PRESETS.map((p) => (
                      <Button
                        key={p.label}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 min-w-8 px-2 text-xs"
                        onClick={() => applySizePreset(p.label)}
                      >
                        {p.label}
                      </Button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Width</label>
                      <input
                        type="number"
                        min={MAP_W_MIN}
                        max={MAP_W_MAX}
                        step={8}
                        className="w-full p-2 border border-input rounded-md bg-background text-sm mt-1"
                        value={Math.round(draft.map_w)}
                        onChange={(e) => handleMapWChange(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Height</label>
                      <input
                        type="number"
                        min={MAP_H_MIN}
                        max={MAP_H_MAX}
                        step={8}
                        className="w-full p-2 border border-input rounded-md bg-background text-sm mt-1"
                        value={Math.round(draft.map_h)}
                        onChange={(e) => handleMapHChange(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Rotation (degrees)</label>
                    <Input
                      type="number"
                      min={0}
                      max={359}
                      step={snapRotation15 ? 15 : 1}
                      value={draft.map_rotation}
                      onChange={(e) => handleRotationChange(e.target.value)}
                      onBlur={handleRotationBlur}
                      className="mt-1"
                    />
                    <div className="flex flex-wrap gap-1">
                      {([0, 90, 180, 270] as const).map((deg) => (
                        <Button
                          key={deg}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setRotationPreset(deg)}
                        >
                          {deg}°
                        </Button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="snap-rot-15"
                        checked={snapRotation15}
                        onCheckedChange={(c) => setSnapRotation15(Boolean(c))}
                      />
                      <Label htmlFor="snap-rot-15" className="text-xs font-normal cursor-pointer">
                        Snap to 15° on blur
                      </Label>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <Button
                      size="sm"
                      onClick={async () => {
                        try {
                          const saved = await handleSaveTable()
                          if (
                            saved &&
                            !isCreatingTable &&
                            activeId
                          ) {
                            applyActivePatch({
                              table_number: draft.table_number,
                              seating_capacity: draft.seating_capacity,
                              location: draft.location,
                              is_occupied: draft.is_occupied,
                              shape: draft.shape,
                              map_w: draft.map_w,
                              map_h: draft.map_h,
                              map_rotation: draft.map_rotation,
                            })
                          }
                        } catch {
                          /* toast from parent */
                        }
                      }}
                      disabled={savingTable}
                    >
                      {savingTable ? 'Saving...' : 'Save Table'}
                    </Button>
                    {!isCreatingTable ? (
                      <Button size="sm" variant="outline" onClick={() => void handleDeleteSelectedTable()}>
                        Delete
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setIsCreatingTable(false)
                          setSyncSizeWithSeats(false)
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={addFloorOpen} onOpenChange={setAddFloorOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Floor</DialogTitle>
          </DialogHeader>
          <Input
            value={newFloorName}
            onChange={(e) => setNewFloorName(e.target.value)}
            placeholder="Enter floor name"
            onKeyDown={async (e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              await handleAddFloor()
            }}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setAddFloorOpen(false)
                setNewFloorName('')
              }}
            >
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleAddFloor()} disabled={creatingFloor}>
              {creatingFloor ? 'Adding...' : 'Add Floor'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function BadgePill({ label, className }: { label: string; className: string }) {
  return <span className={`rounded-full px-2 py-1 font-medium ${className}`}>{label}</span>
}
