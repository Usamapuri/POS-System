import { cn } from '@/lib/utils'
import type { CounterOrderType } from '@/components/counter/counterOrderTypes'

type GlyphProps = {
  active: boolean
  className?: string
}

/**
 * Lightweight SVG micro-motion for order-type segments.
 * CSS-only (no Lottie/WebGL) keeps bundle small and works offline on counter hardware.
 * Motion respects parent `motion-reduce` via class toggles from CounterOrderTypeToggle.
 */
export function CounterOrderTypeGlyph({ type, active, className }: GlyphProps & { type: CounterOrderType }) {
  const motion = active ? 'counter-ot-glyph counter-ot-glyph--active' : 'counter-ot-glyph'

  if (type === 'dine_in') {
    return (
      <svg
        className={cn('h-6 w-6 shrink-0', motion, className)}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <ellipse cx="12" cy="14" rx="8" ry="3" className="counter-ot-stroke" strokeWidth="1.5" />
        <path
          className="counter-ot-stroke counter-ot-dine-steam"
          d="M9 8c0-1 1-2 1-3M12 7c0-1.2 1-2 1-3.2M15 8c0-1 1-2 1-3"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
        <circle cx="12" cy="12" r="2.25" className="counter-ot-fill-soft" />
      </svg>
    )
  }

  if (type === 'takeout') {
    return (
      <svg
        className={cn('h-6 w-6 shrink-0', motion, className)}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <path
          className="counter-ot-stroke counter-ot-box"
          d="M7 10h10v8a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-8Z"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path className="counter-ot-stroke" d="M9 10V8a3 3 0 0 1 6 0v2" strokeWidth="1.5" strokeLinecap="round" />
        <path className="counter-ot-stroke counter-ot-lid" d="M6 10h12" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  }

  return (
    <svg
      className={cn('h-6 w-6 shrink-0', motion, className)}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        className="counter-ot-stroke counter-ot-road"
        d="M4 18h16"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        className="counter-ot-stroke counter-ot-car"
        d="M6.5 16.5 7.2 13c.2-.9 1-1.5 1.9-1.5h5.8c.9 0 1.7.6 1.9 1.5l.7 3.5"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="8.5" cy="16.5" r="1.1" className="counter-ot-fill-soft" />
      <circle cx="15.5" cy="16.5" r="1.1" className="counter-ot-fill-soft" />
      <path className="counter-ot-stroke counter-ot-signal" d="M17 8v2M19 6v6" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}
