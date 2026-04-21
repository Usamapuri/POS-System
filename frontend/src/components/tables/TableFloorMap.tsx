import { useEffect, useRef, useState } from 'react'
import type { DiningTable } from '@/types'
import { Button } from '@/components/ui/button'
import { fallbackMapDimensions } from '@/lib/tableMapSizing'

type Props = {
  tables: DiningTable[]
  selectedTableId?: string
  onSelect?: (table: DiningTable) => void
  canSelect?: (table: DiningTable) => boolean
  className?: string
  viewportHeight?: number
  showControls?: boolean
}

const BASE_MAP_W = 980
const BASE_MAP_H = 560

export function TableFloorMap({
  tables,
  selectedTableId,
  onSelect,
  canSelect,
  className,
  viewportHeight = 300,
  showControls = true,
}: Props) {
  const [zoom, setZoom] = useState(1)
  const [canvasSize, setCanvasSize] = useState({ width: BASE_MAP_W, height: BASE_MAP_H })
  const mapShellRef = useRef<HTMLDivElement | null>(null)
  const hasLayout = tables.some((t) => typeof t.map_x === 'number' && typeof t.map_y === 'number')

  useEffect(() => {
    if (!hasLayout) return
    const shell = mapShellRef.current
    if (!shell) return

    const updateCanvasSize = () => {
      const nextWidth = Math.max(BASE_MAP_W, Math.floor(shell.clientWidth) - 16)
      const nextHeight = Math.max(BASE_MAP_H, viewportHeight - 8)
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
  }, [hasLayout, viewportHeight])

  if (!hasLayout) return null

  return (
    <div className={`border rounded-md bg-[#f4efe6] p-2 ${className ?? ''}`}>
      {showControls && (
        <div className="flex justify-end gap-2 pb-2">
          <Button variant="outline" size="sm" onClick={() => setZoom((z) => Math.max(0.7, z - 0.1))}>
            -
          </Button>
          <span className="text-xs min-w-12 text-center self-center">{Math.round(zoom * 100)}%</span>
          <Button variant="outline" size="sm" onClick={() => setZoom((z) => Math.min(1.4, z + 0.1))}>
            +
          </Button>
          <Button variant="outline" size="sm" onClick={() => setZoom(1)}>
            Fit
          </Button>
        </div>
      )}
      <div
        ref={mapShellRef}
        className="relative border rounded bg-[#f7f1e8] overflow-auto"
        style={{ width: '100%', minHeight: 230, height: viewportHeight }}
      >
        <div
          className="relative"
          style={{
            width: canvasSize.width,
            height: canvasSize.height,
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
            backgroundImage:
              'linear-gradient(to right, rgba(74,53,33,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(74,53,33,0.06) 1px, transparent 1px)',
            backgroundSize: '8px 8px',
          }}
        >
          {tables.map((table) => {
            const occupied = table.has_active_order ?? table.is_occupied
            const selectable = canSelect ? canSelect(table) : true
            const hasW = table.map_w != null && Number.isFinite(Number(table.map_w)) && Number(table.map_w) > 0
            const hasH = table.map_h != null && Number.isFinite(Number(table.map_h)) && Number(table.map_h) > 0
            const fb = fallbackMapDimensions(table)
            const mapW = hasW ? Number(table.map_w) : fb.map_w
            const mapH = hasH ? Number(table.map_h) : fb.map_h
            return (
              <button
                key={table.id}
                type="button"
                onClick={() => selectable && onSelect?.(table)}
                disabled={!selectable}
                className={`absolute border shadow-sm text-sm transition-all ${
                  selectedTableId === table.id ? 'ring-2 ring-primary' : ''
                } ${occupied ? 'bg-emerald-100 border-emerald-400' : 'bg-white border-border'} ${
                  selectable ? 'cursor-pointer' : 'cursor-not-allowed opacity-65'
                }`}
                style={{
                  left: `${table.map_x ?? 24}px`,
                  top: `${table.map_y ?? 24}px`,
                  width: `${mapW}px`,
                  height: `${mapH}px`,
                  borderRadius: table.shape === 'round' ? 999 : 10,
                  transform: `rotate(${table.map_rotation ?? 0}deg)`,
                }}
              >
                <div className="h-full w-full flex flex-col items-center justify-center">
                  <div className="font-semibold leading-none">{table.table_number}</div>
                  <div className="opacity-70 text-[11px]">{table.seating_capacity} seats</div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
