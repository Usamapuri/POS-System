import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { DiningTable } from '@/types'
import { FloorCombobox } from '@/components/tables/FloorCombobox'

type LayoutTable = DiningTable & {
  map_x: number
  map_y: number
  map_w: number
  map_h: number
  map_rotation: number
  shape: 'rectangle' | 'square' | 'round'
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
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const canvasShellRef = useRef<HTMLDivElement | null>(null)

  const floorTables = useMemo(
    () => tables.filter((t) => (t.location || 'General') === selectedFloor),
    [tables, selectedFloor]
  )

  useEffect(() => {
    const seeded = floorTables.map((t, index) => {
      const col = index % 6
      const row = Math.floor(index / 6)
      return {
        ...t,
        map_x: t.map_x ?? 28 + col * 145,
        map_y: t.map_y ?? 24 + row * 108,
        map_w: t.map_w ?? 108,
        map_h: t.map_h ?? 72,
        map_rotation: t.map_rotation ?? 0,
        shape: (t.shape as 'rectangle' | 'square' | 'round' | undefined) ?? 'rectangle',
      }
    })
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
        map_w: 108,
        map_h: 72,
        map_rotation: 0,
        shape: 'rectangle',
      } as LayoutTable)
    : activeTable
  const [draft, setDraft] = useState<LayoutTable | null>(null)

  useEffect(() => {
    setDraft(selectedTable ? { ...selectedTable } : null)
  }, [activeId, isCreatingTable, selectedFloor])

  const applyActivePatch = (patch: Partial<LayoutTable>) => {
    if (!activeId) return
    setLayout((prev) => prev.map((t) => (t.id === activeId ? { ...t, ...patch } : t)))
    setDirty(true)
  }

  const resetFloor = () => {
    const seeded = floorTables.map((t, index) => {
      const col = index % 6
      const row = Math.floor(index / 6)
      return {
        ...t,
        map_x: t.map_x ?? 28 + col * 145,
        map_y: t.map_y ?? 24 + row * 108,
        map_w: t.map_w ?? 108,
        map_h: t.map_h ?? 72,
        map_rotation: t.map_rotation ?? 0,
        shape: (t.shape as 'rectangle' | 'square' | 'round' | undefined) ?? 'rectangle',
      }
    })
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

  const handleSaveTable = async () => {
    if (!draft) return
    if (!draft.table_number.trim()) return
    setSavingTable(true)
    try {
      await onUpsertTable({
        id: isCreatingTable ? undefined : draft.id,
        table_number: draft.table_number.trim(),
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
                    <Input value={draft.table_number} onChange={(e) => setDraft({ ...draft, table_number: e.target.value })} className="mt-1" />
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
                        onChange={(e) => setDraft({ ...draft, seating_capacity: Math.max(1, Number(e.target.value) || 1) })}
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
                  <div>
                    <label className="text-xs text-muted-foreground">Shape</label>
                    <select
                      className="w-full p-2 border border-input rounded-md bg-background text-sm mt-1"
                      value={draft.shape}
                      onChange={(e) => setDraft({ ...draft, shape: e.target.value as LayoutTable['shape'] })}
                    >
                      <option value="rectangle">Rectangle</option>
                      <option value="square">Square</option>
                      <option value="round">Round</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Width</label>
                      <input
                        type="number"
                        className="w-full p-2 border border-input rounded-md bg-background text-sm mt-1"
                        value={Math.round(draft.map_w)}
                        onChange={(e) => setDraft({ ...draft, map_w: clamp(Number(e.target.value) || 80, 64, 240) })}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Height</label>
                      <input
                        type="number"
                        className="w-full p-2 border border-input rounded-md bg-background text-sm mt-1"
                        value={Math.round(draft.map_h)}
                        onChange={(e) => setDraft({ ...draft, map_h: clamp(Number(e.target.value) || 64, 52, 180) })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Rotation</label>
                    <select
                      className="w-full p-2 border border-input rounded-md bg-background text-sm mt-1"
                      value={draft.map_rotation}
                      onChange={(e) => setDraft({ ...draft, map_rotation: Number(e.target.value) })}
                    >
                      <option value={0}>0°</option>
                      <option value={90}>90°</option>
                      <option value={180}>180°</option>
                      <option value={270}>270°</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <Button
                      size="sm"
                      onClick={async () => {
                        await handleSaveTable()
                        if (!isCreatingTable && activeId) {
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
                      <Button size="sm" variant="outline" onClick={() => setIsCreatingTable(false)}>
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
