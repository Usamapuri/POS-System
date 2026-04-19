import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

/**
 * Lightweight portal-based "slot" that lets each report tab declare its own
 * Export button (with its own report id, label, extra params, and PDF
 * handler) while having the actual button render up in the shell's tabs
 * row — anchored top-right, on the same horizontal band as the tab nav.
 *
 * Why a portal and not a config map?
 *   • Each tab already owns its export config and its print handler (which
 *     closes over that tab's live data). Lifting that config into the shell
 *     would either duplicate the data dependency or force every tab through
 *     a registration callback — both more invasive than this single portal.
 *   • Tabs that don't export anything simply don't render a slot child, so
 *     the outlet is naturally empty for those tabs (e.g. Orders Browser).
 *   • Tabs that export multiple reports (Tables & Parties exports both
 *     "tables" and "party_size") just render multiple <ReportsExportSlot>
 *     children — they appear side-by-side in the outlet automatically.
 */

type SlotContextValue = {
  container: HTMLElement | null
  setContainer: (el: HTMLElement | null) => void
}

const SlotContext = createContext<SlotContextValue>({
  container: null,
  setContainer: () => {},
})

export function ReportsExportSlotProvider({ children }: { children: ReactNode }) {
  const [container, setContainer] = useState<HTMLElement | null>(null)
  return (
    <SlotContext.Provider value={{ container, setContainer }}>
      {children}
    </SlotContext.Provider>
  )
}

/**
 * Renders the actual DOM target where slotted children will be portaled.
 * Place this once inside the shell, on the right side of the tabs row.
 */
export function ReportsExportOutlet({ className }: { className?: string }) {
  const { setContainer } = useContext(SlotContext)
  return (
    <div
      ref={setContainer}
      className={cn('flex items-center gap-2', className)}
    />
  )
}

/**
 * Portals its children into the outlet. On first render the container ref
 * may not have committed yet, so we render nothing for one frame — the
 * setContainer state update triggers a re-render where the portal lands
 * correctly. No visible flicker in practice.
 */
export function ReportsExportSlot({ children }: { children: ReactNode }) {
  const { container } = useContext(SlotContext)
  if (!container) return null
  return createPortal(children, container)
}
