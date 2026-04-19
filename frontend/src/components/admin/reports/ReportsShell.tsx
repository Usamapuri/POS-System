import { useState, type ReactNode } from 'react'
import {
  BarChart3,
  ClipboardList,
  CalendarDays,
  Clock,
  Package,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useReportRange } from '@/hooks/useReportRange'
import { DateRangeFilter } from './DateRangeFilter'
import { OverviewTab } from './OverviewTab'
import { DailySalesTab } from './DailySalesTab'
import { HoursTab } from './HoursTab'
import { ItemsTab } from './ItemsTab'
import { TablesTab } from './TablesTab'
import { OrdersBrowserTab } from './OrdersBrowserTab'
import {
  ReportsExportOutlet,
  ReportsExportSlotProvider,
} from './ReportsExportSlot'

type TabId = 'overview' | 'daily' | 'hours' | 'items' | 'tables' | 'orders'

const TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <BarChart3 className="h-4 w-4" /> },
  { id: 'daily', label: 'Daily Sales', icon: <CalendarDays className="h-4 w-4" /> },
  { id: 'hours', label: 'Hours', icon: <Clock className="h-4 w-4" /> },
  { id: 'items', label: 'Items', icon: <Package className="h-4 w-4" /> },
  { id: 'tables', label: 'Tables & Parties', icon: <Users className="h-4 w-4" /> },
  { id: 'orders', label: 'Orders Browser', icon: <ClipboardList className="h-4 w-4" /> },
]

/**
 * The Reports & Analytics page shell. Owns the global date-range filter
 * (mirrored to URL state) and the tab navigation. Each tab is a small,
 * data-loading sibling that uses the same range hook.
 *
 * The Orders Browser tab intentionally manages its own per-day picker —
 * it's a day-scoped workflow (find a past order to reprint a PRA invoice)
 * and decoupling it from the global range avoids confusion when someone
 * has the rest of the page set to "Last 30 days".
 */
export function ReportsShell() {
  const range = useReportRange()
  const [tab, setTab] = useState<TabId>('overview')

  return (
    <ReportsExportSlotProvider>
      <div className="mx-auto max-w-[1400px] space-y-6 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Reports &amp; Analytics</h1>
            <p className="mt-1 text-muted-foreground">
              Sales, items, tables and more for Café Cova.
            </p>
          </div>
          {tab !== 'orders' && (
            <div className="lg:pt-1">
              <DateRangeFilter range={range} />
            </div>
          )}
        </div>

        {/* Tabs row + export outlet share one horizontal band. The outlet
            renders OUTSIDE the muted tab container so the Export button
            visually reads as a page action, not as another tab. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1 rounded-lg bg-muted/60 p-1">
            {TABS.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
                  tab === t.id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
          <ReportsExportOutlet />
        </div>

        {tab === 'overview' && <OverviewTab range={range} />}
        {tab === 'daily' && <DailySalesTab range={range} />}
        {tab === 'hours' && <HoursTab range={range} />}
        {tab === 'items' && <ItemsTab range={range} />}
        {tab === 'tables' && <TablesTab range={range} />}
        {tab === 'orders' && <OrdersBrowserTab />}
      </div>
    </ReportsExportSlotProvider>
  )
}
