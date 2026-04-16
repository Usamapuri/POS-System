import { useState } from 'react'
import type { DiningTable } from '@/types'
import { Button } from '@/components/ui/button'

type Props = {
  tables: DiningTable[]
  selectedTableId?: string
  onSelect?: (table: DiningTable) => void
  canSelect?: (table: DiningTable) => boolean
  className?: string
  viewportHeight?: number
  showControls?: boolean
}

const FALLBACK_W = 108
const FALLBACK_H = 72

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
  const hasLayout = tables.some((t) => typeof t.map_x === 'number' && typeof t.map_y === 'number')
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
        className="relative border rounded bg-[#f7f1e8] overflow-auto"
        style={{ width: '100%', minHeight: 230, height: viewportHeight }}
      >
        <div
          className="relative"
          style={{
            width: 980,
            height: 560,
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
                  width: `${table.map_w ?? FALLBACK_W}px`,
                  height: `${table.map_h ?? FALLBACK_H}px`,
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
