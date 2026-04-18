import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertOctagon,
  ChefHat,
  ClipboardCheck,
  CookingPot,
  LayoutGrid,
  Timer,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useCurrency } from '@/contexts/CurrencyContext'
import type { LivePulse } from '@/types'
import { compactCurrency, formatCount, formatDurationSeconds } from './dashboardFormat'
import { cn } from '@/lib/utils'

interface LivePulseStripProps {
  pulse?: LivePulse
  isLoading: boolean
  onNavigate: (section: string) => void
}

// Operational widgets — one click takes you to the right admin section.
export function LivePulseStrip({ pulse, isLoading, onNavigate }: LivePulseStripProps) {
  const { currencyCode } = useCurrency()

  if (isLoading || !pulse) {
    return (
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <PulseSkeleton key={i} />
        ))}
      </div>
    )
  }

  const tableUtilization = pulse.total_tables > 0
    ? Math.round((pulse.occupied_tables / pulse.total_tables) * 100)
    : 0

  const tiles: PulseTileProps[] = [
    {
      label: 'Active orders',
      value: formatCount(pulse.active_orders),
      icon: ClipboardCheck,
      iconClass: 'text-blue-600',
      sub: `${pulse.in_kitchen} in kitchen · ${pulse.ready_to_serve} ready`,
      navigateTo: 'kitchen',
      tone: 'neutral',
    },
    {
      label: 'In kitchen',
      value: formatCount(pulse.in_kitchen),
      icon: CookingPot,
      iconClass: 'text-orange-600',
      sub: pulse.in_kitchen > 0 ? 'firing now' : 'all caught up',
      navigateTo: 'kitchen',
      tone: 'neutral',
    },
    {
      label: 'Ready to serve',
      value: formatCount(pulse.ready_to_serve),
      icon: ChefHat,
      iconClass: 'text-emerald-600',
      sub: pulse.ready_to_serve > 0 ? 'awaiting runner' : 'nothing waiting',
      navigateTo: 'kitchen',
      tone: pulse.ready_to_serve > 5 ? 'warning' : 'neutral',
    },
    {
      label: 'Tables',
      value: `${pulse.occupied_tables}/${pulse.total_tables || 0}`,
      icon: LayoutGrid,
      iconClass: 'text-violet-600',
      sub: `${tableUtilization}% utilization`,
      navigateTo: 'tables',
      tone: 'neutral',
    },
    {
      label: 'Avg wait',
      value: formatDurationSeconds(pulse.avg_kitchen_wait_seconds),
      icon: Timer,
      iconClass: 'text-amber-600',
      sub:
        pulse.longest_running_seconds > 0
          ? `Longest ${formatDurationSeconds(pulse.longest_running_seconds)}`
          : 'no running tickets',
      navigateTo: 'kitchen',
      tone: pulse.avg_kitchen_wait_seconds > 25 * 60 ? 'warning' : 'neutral',
    },
    {
      label: 'Voids today',
      value: formatCount(pulse.voids_today_count),
      icon: AlertOctagon,
      iconClass: 'text-rose-600',
      sub: compactCurrency(pulse.voids_today_amount, currencyCode),
      navigateTo: 'void-log',
      tone: pulse.voids_today_count >= 5 ? 'warning' : 'neutral',
    },
  ]

  const drawerTile: PulseTileProps = {
    label: 'Cash drawer',
    value: pulse.drawer_reconciled ? 'Closed' : 'Open',
    icon: Wallet,
    iconClass: pulse.drawer_reconciled ? 'text-emerald-600' : 'text-amber-600',
    sub: pulse.drawer_reconciled
      ? 'Reconciled'
      : `Expected ${compactCurrency(pulse.drawer_expected_cash, currencyCode)}`,
    navigateTo: 'expenses',
    tone: pulse.drawer_reconciled ? 'good' : 'neutral',
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      {tiles.map((t) => (
        <PulseTile key={t.label} {...t} onNavigate={onNavigate} />
      ))}
      <PulseTile {...drawerTile} onNavigate={onNavigate} />
    </div>
  )
}

interface PulseTileProps {
  label: string
  value: string
  sub: string
  icon: LucideIcon
  iconClass?: string
  navigateTo?: string
  tone?: 'neutral' | 'warning' | 'good'
  onNavigate?: (section: string) => void
}

const TONE_RING: Record<NonNullable<PulseTileProps['tone']>, string> = {
  neutral: '',
  warning: 'ring-1 ring-inset ring-amber-300/50 dark:ring-amber-800/50',
  good: 'ring-1 ring-inset ring-emerald-300/50 dark:ring-emerald-800/50',
}

function PulseTile({ label, value, sub, icon: Icon, iconClass, navigateTo, tone = 'neutral', onNavigate }: PulseTileProps) {
  const clickable = navigateTo && onNavigate
  return (
    <Card
      className={cn(
        TONE_RING[tone],
        clickable && 'cursor-pointer transition hover:shadow-md hover:-translate-y-0.5 focus-within:ring-2 focus-within:ring-primary',
      )}
      onClick={() => clickable && onNavigate!(navigateTo!)}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={(e) => {
        if (clickable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onNavigate!(navigateTo!)
        }
      }}
    >
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          <Icon className={cn('h-4 w-4', iconClass)} />
        </div>
        <div className="text-2xl font-semibold leading-none tracking-tight">{value}</div>
        <div className="truncate text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  )
}

function PulseSkeleton() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-4 rounded" />
        </div>
        <Skeleton className="h-7 w-16" />
        <Skeleton className="h-3 w-24" />
      </CardContent>
    </Card>
  )
}
