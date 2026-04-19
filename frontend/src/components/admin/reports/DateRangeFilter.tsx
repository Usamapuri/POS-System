import { useState } from 'react'
import { CalendarRange, Check, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn, formatDateDDMMYYYY } from '@/lib/utils'
import type { RangePresetId, UseReportRange } from '@/hooks/useReportRange'
import { rangeForPreset } from '@/hooks/useReportRange'

const PRESET_LABELS: Record<RangePresetId, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  last_7: 'Last 7 days',
  last_30: 'Last 30 days',
  this_month: 'This month',
  last_month: 'Last month',
  custom: 'Custom range',
}

const PRESET_ORDER: RangePresetId[] = [
  'today',
  'yesterday',
  'last_7',
  'last_30',
  'this_month',
  'last_month',
]

interface Props {
  range: UseReportRange
}

/**
 * Global filter bar for the Reports page. Combines a quick-pick presets menu
 * with a calendar popover for custom ranges. All visible dates render as
 * DD-MM-YYYY; ISO conversion happens internally in the range hook.
 */
export function DateRangeFilter({ range }: Props) {
  const [open, setOpen] = useState(false)
  const [pendingFrom, setPendingFrom] = useState<Date | undefined>(range.from)
  const [pendingTo, setPendingTo] = useState<Date | undefined>(range.to)

  const triggerLabel =
    range.preset !== 'custom'
      ? `${PRESET_LABELS[range.preset]} (${formatDateDDMMYYYY(range.from)}${range.fromISO !== range.toISO ? ` → ${formatDateDDMMYYYY(range.to)}` : ''})`
      : `${formatDateDDMMYYYY(range.from)} → ${formatDateDDMMYYYY(range.to)}`

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Preset quick-buttons (visible on wide desktops). On narrower screens
          the presets collapse into the dropdown trigger below to avoid
          crowding the page header. */}
      <div className="hidden xl:flex items-center gap-1 rounded-lg bg-muted/60 p-1">
        {PRESET_ORDER.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => range.setPreset(p)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              range.preset === p
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {PRESET_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Mobile preset dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="xl:hidden h-9">
            {PRESET_LABELS[range.preset]} <ChevronDown className="w-3.5 h-3.5 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {[...PRESET_ORDER, 'custom' as RangePresetId].map((p) => (
            <DropdownMenuItem
              key={p}
              onClick={() => {
                if (p === 'custom') {
                  setPendingFrom(range.from)
                  setPendingTo(range.to)
                  setOpen(true)
                } else {
                  range.setPreset(p)
                }
              }}
            >
              {range.preset === p && <Check className="w-3.5 h-3.5 mr-2" />}
              {PRESET_LABELS[p]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Custom range popover */}
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (next) {
            setPendingFrom(range.from)
            setPendingTo(range.to)
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-2">
            <CalendarRange className="w-4 h-4" />
            <span className="text-sm font-normal">{triggerLabel}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-0">
          <Calendar
            mode="range"
            numberOfMonths={2}
            selected={{ from: pendingFrom, to: pendingTo }}
            onSelect={(r) => {
              setPendingFrom(r?.from)
              setPendingTo(r?.to)
            }}
            disabled={{ after: new Date() }}
          />
          <div className="flex items-center justify-between gap-2 border-t p-3 bg-muted/30">
            <div className="text-xs text-muted-foreground">
              {pendingFrom && pendingTo
                ? `${formatDateDDMMYYYY(pendingFrom)} → ${formatDateDDMMYYYY(pendingTo)}`
                : 'Select a start and end day'}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  // Quick presets inside the popover.
                  const r = rangeForPreset('last_7')
                  if (r) {
                    setPendingFrom(r.from)
                    setPendingTo(r.to)
                  }
                }}
              >
                Last 7
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!pendingFrom || !pendingTo}
                onClick={() => {
                  if (pendingFrom && pendingTo) {
                    range.setRange({ from: pendingFrom, to: pendingTo, preset: 'custom' })
                    setOpen(false)
                  }
                }}
              >
                Apply
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
