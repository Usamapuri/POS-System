import { useState } from 'react'
import {
  BarChart3,
  ClipboardList,
  CalendarDays,
  Clock,
  Package,
  Receipt,
  Users,
} from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useReportRange } from '@/hooks/useReportRange'
import { DateRangeFilter } from './DateRangeFilter'
import { OverviewTab } from './OverviewTab'
import { DailySalesTab } from './DailySalesTab'
import { HoursTab } from './HoursTab'
import { ItemsTab } from './ItemsTab'
import { TablesTab } from './TablesTab'
import { OrdersBrowserTab } from './OrdersBrowserTab'

type TabId = 'overview' | 'daily' | 'hours' | 'items' | 'tables' | 'orders'

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'daily', label: 'Daily Sales', icon: CalendarDays },
  { id: 'hours', label: 'Hours', icon: Clock },
  { id: 'items', label: 'Items', icon: Package },
  { id: 'tables', label: 'Tables & Parties', icon: Users },
  { id: 'orders', label: 'Orders Browser', icon: ClipboardList },
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
    <div className="p-6 space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground inline-flex items-center gap-2">
            <Receipt className="w-3.5 h-3.5" /> Reports & Analytics
          </p>
          <h1 className="text-2xl font-semibold mt-1">Sales, items, tables & more</h1>
          <p className="text-sm text-muted-foreground">
            Granular insights for Café Cova. Date math runs in Asia/Karachi local time; every
            comparison metric is computed against the same-length previous period.
          </p>
        </div>
        {tab !== 'orders' && <DateRangeFilter range={range} />}
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
        <TabsList className="flex flex-wrap gap-1 h-auto bg-muted/40 p-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <TabsTrigger
              key={id}
              value={id}
              className="text-xs gap-1.5 px-3 data-[state=active]:bg-background"
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <OverviewTab range={range} />
        </TabsContent>
        <TabsContent value="daily" className="mt-6">
          <DailySalesTab range={range} />
        </TabsContent>
        <TabsContent value="hours" className="mt-6">
          <HoursTab range={range} />
        </TabsContent>
        <TabsContent value="items" className="mt-6">
          <ItemsTab range={range} />
        </TabsContent>
        <TabsContent value="tables" className="mt-6">
          <TablesTab range={range} />
        </TabsContent>
        <TabsContent value="orders" className="mt-6">
          <OrdersBrowserTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
