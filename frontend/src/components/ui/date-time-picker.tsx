import * as React from 'react'
import { CalendarIcon } from 'lucide-react'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { cn, formatDateDDMMYYYY, parseIsoDate, toIsoDate } from '@/lib/utils'

/**
 * Drop-in replacement for `<Input type="datetime-local" />`. Pairs the
 * themed `Calendar` with a small inline time input.
 *
 * Value contract is identical to the native input:
 *   • `value` is `'YYYY-MM-DDTHH:mm'` or `''`
 *   • `onChange` is invoked with the same string format
 *
 * Keeping the time portion as a native `<input type="time">` is intentional:
 *   • Native time pickers are clean, consistent, and accessible.
 *   • The user complaint was specifically about the date picker UI.
 *   • Avoids reinventing a wheel-style time selector for marginal gain.
 */
export interface DateTimePickerProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  id?: string
  name?: string
  align?: 'start' | 'center' | 'end'
}

function splitDateTimeLocal(value: string): { datePart: string; timePart: string } {
  if (!value) return { datePart: '', timePart: '' }
  const [d, t = ''] = value.split('T')
  // Native datetime-local emits "HH:mm" (or sometimes "HH:mm:ss"). Normalize
  // to "HH:mm" for the visible time input.
  const time = t.length >= 5 ? t.slice(0, 5) : t
  return { datePart: d ?? '', timePart: time }
}

function combine(dateIso: string, timeHHmm: string): string {
  if (!dateIso) return ''
  const t = timeHHmm && /^\d{2}:\d{2}$/.test(timeHHmm) ? timeHHmm : '00:00'
  return `${dateIso}T${t}`
}

export const DateTimePicker = React.forwardRef<HTMLButtonElement, DateTimePickerProps>(
  (
    {
      value,
      onChange,
      placeholder = 'Select date & time',
      className,
      disabled,
      id,
      name,
      align = 'start',
    },
    ref,
  ) => {
    const [open, setOpen] = React.useState(false)
    const { datePart, timePart } = React.useMemo(() => splitDateTimeLocal(value), [value])
    const selected = React.useMemo(() => parseIsoDate(datePart) ?? undefined, [datePart])

    const handleDateSelect = (next: Date | undefined) => {
      if (!next) return
      const fallbackTime = timePart || nowHHmm()
      onChange(combine(toIsoDate(next), fallbackTime))
      // Don't auto-close — user may still want to adjust time.
    }

    const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newTime = e.target.value || ''
      // If no date selected yet, anchor to today so the value is meaningful.
      const baseDateIso = datePart || toIsoDate(new Date())
      onChange(combine(baseDateIso, newTime || '00:00'))
    }

    const handleNow = () => {
      const now = new Date()
      onChange(combine(toIsoDate(now), nowHHmm(now)))
    }

    const handleClear = () => {
      onChange('')
      setOpen(false)
    }

    const display = value
      ? `${formatDateDDMMYYYY(datePart)} ${timePart || '00:00'}`
      : placeholder

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            ref={ref}
            id={id}
            name={name}
            type="button"
            disabled={disabled}
            data-empty={!value}
            className={cn(
              'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
              'data-[empty=true]:text-muted-foreground',
              className,
            )}
          >
            <span className="truncate text-left">{display}</span>
            <CalendarIcon className="ml-2 h-4 w-4 shrink-0 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align={align}>
          <Calendar
            mode="single"
            selected={selected}
            onSelect={handleDateSelect}
            defaultMonth={selected}
            showOutsideDays
          />
          <div className="flex items-center gap-2 border-t bg-muted/30 px-3 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Time
            </span>
            <input
              type="time"
              value={timePart}
              onChange={handleTimeChange}
              className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
          <div className="flex items-center justify-between gap-2 border-t bg-muted/30 p-3">
            <button
              type="button"
              onClick={handleClear}
              disabled={!value}
              className="text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground"
            >
              Clear
            </button>
            <Button type="button" size="sm" variant="outline" onClick={handleNow}>
              Now
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    )
  },
)
DateTimePicker.displayName = 'DateTimePicker'

function nowHHmm(d: Date = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
