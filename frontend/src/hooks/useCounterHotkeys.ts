import { useEffect } from 'react'

export interface CounterHotkeyHandlers {
  /** F1 — Send to kitchen (only when cart has items). */
  onSend?: () => void
  /** F2 — Pay / Checkout current active order. */
  onPay?: () => void
  /** F3 — Focus discount input (checkout mode). */
  onFocusDiscount?: () => void
  /** Esc — Close checkout / cancel current tender flow. */
  onEscape?: () => void
  /** / — Focus product search. */
  onFocusSearch?: () => void
  /** T — Open Tables picker. */
  onOpenTables?: () => void
  /** C — Focus cart (scroll cart into view in the rail). */
  onFocusCart?: () => void
}

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (TYPING_TAGS.has(target.tagName)) return true
  if (target.isContentEditable) return true
  return false
}

export function useCounterHotkeys(handlers: CounterHotkeyHandlers) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return

      // Esc always works, even while typing
      if (e.key === 'Escape') {
        if (handlers.onEscape) {
          handlers.onEscape()
        }
        return
      }

      // F-keys work regardless of focus target
      if (e.key === 'F1') {
        e.preventDefault()
        handlers.onSend?.()
        return
      }
      if (e.key === 'F2') {
        e.preventDefault()
        handlers.onPay?.()
        return
      }
      if (e.key === 'F3') {
        e.preventDefault()
        handlers.onFocusDiscount?.()
        return
      }

      if (isTypingTarget(e.target)) return

      if (e.key === '/') {
        e.preventDefault()
        handlers.onFocusSearch?.()
        return
      }
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault()
        handlers.onOpenTables?.()
        return
      }
      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault()
        handlers.onFocusCart?.()
        return
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    handlers.onSend,
    handlers.onPay,
    handlers.onFocusDiscount,
    handlers.onEscape,
    handlers.onFocusSearch,
    handlers.onOpenTables,
    handlers.onFocusCart,
  ])
}
