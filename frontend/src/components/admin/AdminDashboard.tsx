import { useCallback, useMemo, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useDashboardData } from '@/hooks/useDashboardData'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import type { DashboardPeriod } from '@/types'
import { DashboardHeader } from './dashboard/DashboardHeader'
import { KpiHeroRow } from './dashboard/KpiHeroRow'
import { LivePulseStrip } from './dashboard/LivePulseStrip'
import { SalesTimeseriesChart } from './dashboard/SalesTimeseriesChart'
import { RevenueProfitPanel } from './dashboard/RevenueProfitPanel'
import { TopItemsList } from './dashboard/TopItemsList'
import { PaymentMixDonut } from './dashboard/PaymentMixDonut'
import { OrderTypeMixBar } from './dashboard/OrderTypeMixBar'
import { AlertsPanel } from './dashboard/AlertsPanel'
import { QuickActionsGrid } from './dashboard/QuickActionsGrid'
import { ActivityFeed } from './dashboard/ActivityFeed'

interface AdminDashboardProps {
  /**
   * Optional override used by the legacy state-based AdminLayout to swap
   * sections via a setter. The TanStack-router admin shell mounts this
   * component without the prop — in that case we fall back to URL
   * navigation through `useRouter()`.
   */
  onNavigate?: (section: string) => void
}

// Map a dashboard section id (e.g. "counter", "void-log") to its admin
// route. All admin routes live under /admin/<id>; if any new section ever
// needs a non-trivial path, override it here.
function sectionToPath(section: string): string {
  return `/admin/${section}`
}

const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  today: 'Yesterday',
  yesterday: 'Day before',
  '7d': 'Prior 7d',
  '30d': 'Prior 30d',
  cw: 'Last week',
  cm: 'Last month',
  custom: 'Prior window',
}

/**
 * AdminDashboard — the redesigned restaurant operations cockpit.
 *
 * Sections (top to bottom):
 *   1. Sticky header: title + Live status + period selector + Refresh /
 *      Reports / Settings buttons.
 *   2. Live Pulse strip — SSE-driven cards for active orders, kitchen,
 *      tables, voids, drawer.
 *   3. KPI hero row — Net sales, orders, avg ticket, covers (with real
 *      previous-period comparison).
 *   4. Sales chart + Activity feed.
 *   5. Revenue & profit panel.
 *   6. Top items + Payment mix + Order type mix.
 *   7. Alerts panel.
 *   8. Quick actions grid (every tile is wired to a real section).
 */
export function AdminDashboard({ onNavigate }: AdminDashboardProps) {
  const router = useRouter()
  // Default navigation path: TanStack Router URL change. The prop override
  // is only used by the legacy `components/admin/AdminLayout.tsx` switcher.
  const navigate = useCallback(
    (section: string) => {
      if (onNavigate) {
        onNavigate(section)
        return
      }
      router.navigate({ to: sectionToPath(section) })
    },
    [onNavigate, router],
  )
  const [period, setPeriod] = useState<DashboardPeriod>('today')

  const data = useDashboardData({ period })

  // Keyboard shortcuts (T/Y/W/M/R) for power users — match common
  // dashboards like Toast & Square.
  useKeyboardShortcuts({
    shortcuts: useMemo(
      () => [
        { key: 't', action: () => setPeriod('today'), description: 'Today' },
        { key: 'y', action: () => setPeriod('yesterday'), description: 'Yesterday' },
        { key: 'w', action: () => setPeriod('cw'), description: 'This week' },
        { key: 'm', action: () => setPeriod('cm'), description: 'This month' },
        { key: 'r', action: () => data.refetchAll(), description: 'Refresh' },
      ],
      [data],
    ),
  })

  const overview = data.overview.data
  const isAnyFetching =
    data.overview.isFetching ||
    data.live.isFetching ||
    data.timeseries.isFetching

  return (
    <div className="space-y-6 p-6">
      <DashboardHeader
        period={period}
        onPeriodChange={setPeriod}
        onRefresh={data.refetchAll}
        onNavigate={navigate}
        streamStatus={data.streamStatus}
        isRefreshing={isAnyFetching}
        fromLabel={overview?.from_label}
        toLabel={overview?.to_label}
      />

      <LivePulseStrip pulse={data.live.data} isLoading={data.live.isLoading} onNavigate={navigate} />

      <KpiHeroRow
        overview={overview}
        isLoading={data.overview.isLoading}
        previousLabel={PERIOD_LABELS[period]}
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <SalesTimeseriesChart
          data={data.timeseries.data}
          isLoading={data.timeseries.isLoading}
          priorLabel={PERIOD_LABELS[period]}
        />
        <ActivityFeed entries={data.activity} />
      </div>

      <RevenueProfitPanel overview={overview} isLoading={data.overview.isLoading} />

      <div className="grid gap-6 lg:grid-cols-3">
        <TopItemsList items={data.topItems.data} isLoading={data.topItems.isLoading} />
        <PaymentMixDonut data={data.paymentMix.data} isLoading={data.paymentMix.isLoading} />
        <OrderTypeMixBar data={data.orderTypeMix.data} isLoading={data.orderTypeMix.isLoading} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <AlertsPanel
          alerts={data.alerts.data}
          isLoading={data.alerts.isLoading}
          onNavigate={navigate}
        />
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Quick actions
          </h2>
          <QuickActionsGrid onNavigate={navigate} />
        </div>
      </div>
    </div>
  )
}
