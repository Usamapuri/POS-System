import { useState } from 'react'
import { CalendarRange, Check, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn, formatDateDDMMYYYY, parseDDMMYYYY } from '@/lib/utils'

type DayPresetId = 'today' | 'yesterday' | 'custom'

interface Props {
  day: Date
  onChange: (day: Date) => void
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/**
 * Header filter for tabs that operate on a single day (currently the
 * Orders Browser). Visually mirrors `DateRangeFilter` so switching tabs
 * keeps the page header stable, but only exposes presets that make sense
 * for a per-day view (Today, Yesterday, custom day). Range presets like
 * "Last 7 days" are intentionally absent — the orders table renders one
 * day at a time and a range here would either silently collapse to a
 * single day or blow the table up to hundreds of un-paginated rows.
 */
export function DayFilter({ day, onChange }: Props) {
  const [calOpen, setCalOpen] = useState(false)

  // Re-derive Today/Yesterday on every render rather than memoizing —
  // memoization with [] deps would freeze these to the component's mount
  // time and silently misbehave for a cashier whose session straddles
  // midnight (e.g. clicking "Today" at 12:05 AM would still set the
  // previous day). Allocating two Dates per render is negligible.
  const today = startOfDay(new Date())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const activePreset: DayPresetId = isSameDay(day, today)
    ? 'today'
    : isSameDay(day, yesterday)
      ? 'yesterday'
      : 'custom'

  const presetLabel: Record<DayPresetId, string> = {
    today: 'Today',
    yesterday: 'Yesterday',
    custom: 'Custom day',
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Preset quick-buttons (visible on wide desktops). Mirrors the
          breakpoint and pill styling of DateRangeFilter so the header
          looks identical when switching between tabs. */}
      <div className="hidden xl:flex items-center gap-1 rounded-lg bg-muted/60 p-1">
        <button
          type="button"
          onClick={() => onChange(today)}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            activePreset === 'today'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => onChange(yesterday)}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            activePreset === 'yesterday'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Yesterday
        </button>
      </div>

      {/* Mobile preset dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="xl:hidden h-9">
            {presetLabel[activePreset]}
            <ChevronDown className="w-3.5 h-3.5 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => onChange(today)}>
            {activePreset === 'today' && <Check className="w-3.5 h-3.5 mr-2" />}
            Today
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onChange(yesterday)}>
            {activePreset === 'yesterday' && <Check className="w-3.5 h-3.5 mr-2" />}
            Yesterday
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Custom day popover — also serves as the always-visible "current
          day" indicator, so even when the active preset is Today/Yesterday
          the operator can still see the resolved date. */}
      <Popover open={calOpen} onOpenChange={setCalOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-2">
            <CalendarRange className="w-4 h-4" />
            <span className="text-sm font-normal">{formatDateDDMMYYYY(day)}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-0">
          <Calendar
            mode="single"
            selected={day}
            onSelect={(d) => {
              if (d) {
                onChange(startOfDay(d))
                setCalOpen(false)
              }
            }}
            disabled={{ after: new Date() }}
          />
          <div className="flex items-center justify-between p-3 border-t bg-muted/30">
            <div className="text-xs text-muted-foreground">
              Type a date in DD-MM-YYYY:
            </div>
            <Input
              placeholder="DD-MM-YYYY"
              defaultValue={formatDateDDMMYYYY(day)}
              className="w-32 h-8 text-xs"
              onBlur={(e) => {
                const parsed = parseDDMMYYYY(e.target.value)
                if (parsed) {
                  onChange(startOfDay(parsed))
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const parsed = parseDDMMYYYY((e.target as HTMLInputElement).value)
                  if (parsed) {
                    onChange(startOfDay(parsed))
                    setCalOpen(false)
                  }
                }
              }}
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
