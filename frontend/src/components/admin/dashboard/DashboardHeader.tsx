import { Button } from '@/components/ui/button'
import { BarChart3, RefreshCw, Settings, Wifi, WifiOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DashboardPeriod } from '@/types'
import { PeriodSelector } from './PeriodSelector'
import type { DashboardStreamStatus } from '@/lib/dashboardStream'

interface DashboardHeaderProps {
  period: DashboardPeriod
  onPeriodChange: (period: DashboardPeriod) => void
  onRefresh: () => void
  onNavigate: (section: string) => void
  streamStatus: DashboardStreamStatus
  isRefreshing?: boolean
  /** Server-formatted DD-MM-YYYY of the active window. */
  fromLabel?: string
  toLabel?: string
}

export function DashboardHeader({
  period,
  onPeriodChange,
  onRefresh,
  onNavigate,
  streamStatus,
  isRefreshing,
  fromLabel,
  toLabel,
}: DashboardHeaderProps) {
  return (
    <div className="sticky top-0 z-20 -mx-6 mb-6 border-b border-border/60 bg-background/85 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="truncate text-3xl font-bold tracking-tight">Admin Dashboard</h1>
            <LiveBadge status={streamStatus} />
          </div>
          <p className="mt-1 text-muted-foreground">
            {fromLabel && toLabel
              ? fromLabel === toLabel
                ? `Showing ${fromLabel}`
                : `Showing ${fromLabel} → ${toLabel}`
              : 'Live operational view + financial KPIs vs previous period'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PeriodSelector value={period} onChange={onPeriodChange} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Refresh (R)"
          >
            <RefreshCw className={cn('mr-2 h-4 w-4', isRefreshing && 'animate-spin')} />
            Refresh
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onNavigate('reports')}
          >
            <BarChart3 className="mr-2 h-4 w-4" />
            Reports
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onNavigate('settings')}
          >
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
        </div>
      </div>
    </div>
  )
}

function LiveBadge({ status }: { status: DashboardStreamStatus }) {
  const styles: Record<DashboardStreamStatus, { label: string; className: string; Icon: typeof Wifi }> = {
    live: {
      label: 'Live',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
      Icon: Wifi,
    },
    connecting: {
      label: 'Connecting…',
      className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
      Icon: Wifi,
    },
    offline: {
      label: 'Offline',
      className: 'border-muted-foreground/30 bg-muted text-muted-foreground',
      Icon: WifiOff,
    },
  }
  const { label, className, Icon } = styles[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        className,
      )}
      aria-live="polite"
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )
}
