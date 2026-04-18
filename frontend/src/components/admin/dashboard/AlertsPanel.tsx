import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { AlertCircle, AlertTriangle, ArrowRight, BellRing, CheckCircle2, Info } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { DashboardAlert, DashboardAlertSeverity } from '@/types'
import { cn } from '@/lib/utils'

interface AlertsPanelProps {
  alerts?: DashboardAlert[]
  isLoading: boolean
  onNavigate: (section: string) => void
}

const SEVERITY: Record<
  DashboardAlertSeverity,
  { icon: LucideIcon; iconClass: string; ringClass: string }
> = {
  info: {
    icon: Info,
    iconClass: 'text-blue-600',
    ringClass: 'border-blue-200 dark:border-blue-900/50',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'text-amber-600',
    ringClass: 'border-amber-200 dark:border-amber-900/50',
  },
  critical: {
    icon: AlertCircle,
    iconClass: 'text-rose-600',
    ringClass: 'border-rose-200 dark:border-rose-900/50',
  },
}

export function AlertsPanel({ alerts, isLoading, onNavigate }: AlertsPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BellRing className="h-4 w-4 text-amber-600" />
          Alerts
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : !alerts || alerts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            All systems nominal — nothing needs attention.
          </div>
        ) : (
          <ul className="space-y-2">
            {alerts.map((alert) => {
              const sev = SEVERITY[alert.severity] ?? SEVERITY.info
              const Icon = sev.icon
              return (
                <li
                  key={alert.id}
                  className={cn('flex items-start gap-3 rounded-md border bg-background p-3', sev.ringClass)}
                >
                  <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', sev.iconClass)} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{alert.title}</div>
                    <div className="text-xs text-muted-foreground">{alert.detail}</div>
                  </div>
                  {alert.action_to && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-xs"
                      onClick={() => onNavigate(alert.action_to!)}
                    >
                      View
                      <ArrowRight className="ml-1 h-3 w-3" />
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
