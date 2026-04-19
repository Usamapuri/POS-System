import * as React from 'react'
import { CalendarIcon } from 'lucide-react'
import type { Matcher } from 'react-day-picker'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { cn, formatDateDDMMYYYY, parseIsoDate, toIsoDate } from '@/lib/utils'

/**
 * Drop-in replacement for `<Input type="date" />` that opens the app's
 * themed `Calendar` component instead of the native OS date picker.
 *
 * Value contract is identical to the native input so existing state shapes,
 * Zod schemas, and API params keep working unchanged:
 *   • `value` is always an ISO date string (`'YYYY-MM-DD'`) or `''` (empty)
 *   • `onChange` is invoked with that same string format
 *
 * Display format on the trigger is `DD-MM-YYYY` (project-wide convention
 * via `formatDateDDMMYYYY`). Internal/wire format stays ISO.
 */
export interface DatePickerProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  /** Optional ISO `'YYYY-MM-DD'` lower bound. */
  min?: string
  /** Optional ISO `'YYYY-MM-DD'` upper bound. */
  max?: string
  id?: string
  name?: string
  align?: 'start' | 'center' | 'end'
  /** Show the leading calendar icon inside the trigger. Defaults to true. */
  showIcon?: boolean
}

export const DatePicker = React.forwardRef<HTMLButtonElement, DatePickerProps>(
  (
    {
      value,
      onChange,
      placeholder = 'Select date',
      className,
      disabled,
      min,
      max,
      id,
      name,
      align = 'start',
      showIcon = true,
    },
    ref,
  ) => {
    const [open, setOpen] = React.useState(false)
    const selected = React.useMemo(() => parseIsoDate(value) ?? undefined, [value])
    const minDate = React.useMemo(() => parseIsoDate(min ?? '') ?? undefined, [min])
    const maxDate = React.useMemo(() => parseIsoDate(max ?? '') ?? undefined, [max])

    const disabledMatcher = React.useMemo<Matcher | Matcher[] | undefined>(() => {
      const matchers: Matcher[] = []
      if (minDate) matchers.push({ before: minDate })
      if (maxDate) matchers.push({ after: maxDate })
      return matchers.length ? matchers : undefined
    }, [minDate, maxDate])

    const handleSelect = (next: Date | undefined) => {
      if (!next) return
      onChange(toIsoDate(next))
      setOpen(false)
    }

    const handleClear = () => {
      onChange('')
      setOpen(false)
    }

    const handleToday = () => {
      const today = new Date()
      const local = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      // Respect explicit min/max bounds — if today is outside, do nothing.
      if (minDate && local < minDate) return
      if (maxDate && local > maxDate) return
      onChange(toIsoDate(local))
      setOpen(false)
    }

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
            <span className="truncate text-left">
              {value ? formatDateDDMMYYYY(value) : placeholder}
            </span>
            {showIcon && (
              <CalendarIcon className="ml-2 h-4 w-4 shrink-0 opacity-60" />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align={align}>
          <Calendar
            mode="single"
            selected={selected}
            onSelect={handleSelect}
            disabled={disabledMatcher}
            defaultMonth={selected}
            showOutsideDays
          />
          <div className="flex items-center justify-between gap-2 border-t bg-muted/30 p-3">
            <button
              type="button"
              onClick={handleClear}
              disabled={!value}
              className="text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground"
            >
              Clear
            </button>
            <Button type="button" size="sm" variant="outline" onClick={handleToday}>
              Today
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    )
  },
)
DatePicker.displayName = 'DatePicker'
