import { useCallback, useMemo, useRef } from 'react'
import { cn } from '@/lib/utils'
import type { CounterOrderType } from '@/components/counter/counterOrderTypes'
import { CounterOrderTypeGlyph } from '@/components/counter/CounterOrderTypeAnimatedIcons'

export type { CounterOrderType } from '@/components/counter/counterOrderTypes'

const OPTIONS: {
  value: CounterOrderType
  label: string
  description: string
  selectedClass: string
  idleClass: string
  iconIdleClass: string
}[] = [
  {
    value: 'dine_in',
    label: 'Dine-in',
    description: 'Tables & tabs',
    selectedClass:
      'border-teal-600/90 bg-teal-600 text-white shadow-md shadow-teal-900/15 ring-1 ring-teal-500/40 dark:bg-teal-600 dark:text-white',
    idleClass:
      'border-teal-200/80 bg-teal-50/90 text-teal-950 hover:bg-teal-100/95 hover:border-teal-300 dark:border-teal-800 dark:bg-teal-950/35 dark:text-teal-50 dark:hover:bg-teal-900/45',
    iconIdleClass: 'text-teal-700 dark:text-teal-200',
  },
  {
    value: 'takeout',
    label: 'Takeout',
    description: 'Pickup orders',
    selectedClass:
      'border-amber-600/90 bg-amber-500 text-amber-950 shadow-md shadow-amber-900/15 ring-1 ring-amber-400/50 dark:bg-amber-500 dark:text-amber-950',
    idleClass:
      'border-amber-200/80 bg-amber-50/90 text-amber-950 hover:bg-amber-100/95 hover:border-amber-300 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-50 dark:hover:bg-amber-900/40',
    iconIdleClass: 'text-amber-800 dark:text-amber-200',
  },
  {
    value: 'delivery',
    label: 'Delivery',
    description: 'Driver handoff',
    selectedClass:
      'border-violet-600/90 bg-violet-600 text-white shadow-md shadow-violet-900/20 ring-1 ring-violet-400/40 dark:bg-violet-600 dark:text-white',
    idleClass:
      'border-violet-200/80 bg-violet-50/90 text-violet-950 hover:bg-violet-100/95 hover:border-violet-300 dark:border-violet-800 dark:bg-violet-950/35 dark:text-violet-50 dark:hover:bg-violet-900/45',
    iconIdleClass: 'text-violet-700 dark:text-violet-200',
  },
]

const motionSegment =
  'transition-[transform,box-shadow,background-color,border-color,color] duration-200 ease-out [@media(prefers-reduced-motion:reduce)]:transition-none'
const motionHoverLift =
  'hover:-translate-y-px hover:shadow-sm active:translate-y-0 [@media(prefers-reduced-motion:reduce)]:hover:translate-y-0 [@media(prefers-reduced-motion:reduce)]:hover:shadow-none'

type CounterOrderTypeToggleProps = {
  value: CounterOrderType
  onChange: (next: CounterOrderType) => void
  /**
   * Optional allow-list of enabled order types. When provided, only matching
   * tabs render and participate in keyboard navigation. When omitted, all
   * built-in types render (legacy behavior, also used as a safe fallback
   * when settings have not yet loaded).
   */
  enabledIds?: ReadonlySet<CounterOrderType>
}

export function CounterOrderTypeToggle({ value, onChange, enabledIds }: CounterOrderTypeToggleProps) {
  const groupRef = useRef<HTMLDivElement>(null)

  const visibleOptions = useMemo(
    () => (enabledIds ? OPTIONS.filter((o) => enabledIds.has(o.value)) : OPTIONS),
    [enabledIds]
  )

  const focusValue = useCallback((v: CounterOrderType) => {
    const root = groupRef.current
    if (!root) return
    const btn = root.querySelector<HTMLButtonElement>(`[data-order-type="${v}"]`)
    btn?.focus()
  }, [])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (visibleOptions.length === 0) return
      const idx = visibleOptions.findIndex((o) => o.value === value)
      if (idx < 0) return
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        const next = visibleOptions[(idx + 1) % visibleOptions.length].value
        onChange(next)
        focusValue(next)
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        const next = visibleOptions[(idx - 1 + visibleOptions.length) % visibleOptions.length].value
        onChange(next)
        focusValue(next)
      } else if (e.key === 'Home') {
        e.preventDefault()
        const next = visibleOptions[0].value
        onChange(next)
        focusValue(next)
      } else if (e.key === 'End') {
        e.preventDefault()
        const next = visibleOptions[visibleOptions.length - 1].value
        onChange(next)
        focusValue(next)
      }
    },
    [focusValue, onChange, value, visibleOptions]
  )

  if (visibleOptions.length === 0) return null

  // Responsive columns so 1 or 2 enabled tabs stretch naturally instead of
  // leaving empty grid slots. Tailwind needs literal class names to survive
  // purge, so we map explicitly rather than interpolate.
  const gridColsClass =
    visibleOptions.length === 1
      ? 'grid-cols-1'
      : visibleOptions.length === 2
      ? 'grid-cols-2'
      : 'grid-cols-3'

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label="Order type"
      onKeyDown={onKeyDown}
      className="rounded-2xl border border-border/80 bg-muted/30 p-1 shadow-inner dark:bg-muted/15"
    >
      <div className={cn('grid gap-1 sm:gap-1.5', gridColsClass)}>
        {visibleOptions.map((opt) => {
          const selected = value === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              title={opt.description}
              tabIndex={selected ? 0 : -1}
              data-order-type={opt.value}
              onClick={() => onChange(opt.value)}
              className={cn(
                'flex min-h-[52px] sm:min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-xl border px-1.5 py-2 text-center outline-none select-none touch-manipulation',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                motionSegment,
                motionHoverLift,
                selected ? opt.selectedClass : opt.idleClass
              )}
            >
              <span className={cn(selected ? 'text-current' : opt.iconIdleClass)}>
                <CounterOrderTypeGlyph type={opt.value} active={selected} />
              </span>
              <span className="text-[13px] sm:text-sm font-semibold leading-tight tracking-tight">{opt.label}</span>
              <span className="hidden sm:block text-[10px] font-medium leading-none opacity-80">{opt.description}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
