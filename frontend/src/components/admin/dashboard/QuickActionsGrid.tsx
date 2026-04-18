import { Card, CardContent } from '@/components/ui/card'
import {
  BarChart3,
  ChefHat,
  CreditCard,
  LayoutGrid,
  Menu,
  Receipt,
  Settings,
  UserCog,
  Warehouse,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface QuickActionsGridProps {
  onNavigate: (section: string) => void
}

interface QuickAction {
  id: string
  label: string
  description: string
  icon: LucideIcon
  iconClass: string
  navigateTo: string
}

// Curated set of high-frequency admin actions, modeled on Toast / Square's
// dashboards. Each tile fully delegates to the AdminLayout section switcher.
const ACTIONS: QuickAction[] = [
  {
    id: 'counter',
    label: 'Open Counter',
    description: 'Take a new order or process payment',
    icon: CreditCard,
    iconClass: 'text-emerald-600',
    navigateTo: 'counter',
  },
  {
    id: 'kitchen',
    label: 'Kitchen Display',
    description: 'Watch tickets fire & bump in real time',
    icon: ChefHat,
    iconClass: 'text-orange-600',
    navigateTo: 'kitchen',
  },
  {
    id: 'menu',
    label: 'Manage Menu',
    description: 'Add or edit categories and products',
    icon: Menu,
    iconClass: 'text-blue-600',
    navigateTo: 'menu',
  },
  {
    id: 'tables',
    label: 'Manage Tables',
    description: 'Floor plan, zones and seating',
    icon: LayoutGrid,
    iconClass: 'text-violet-600',
    navigateTo: 'tables',
  },
  {
    id: 'inventory',
    label: 'Store Inventory',
    description: 'Stock levels, suppliers & POs',
    icon: Warehouse,
    iconClass: 'text-cyan-600',
    navigateTo: 'inventory',
  },
  {
    id: 'expenses',
    label: 'Expenses & Closing',
    description: 'Track expenses and close the day',
    icon: Receipt,
    iconClass: 'text-amber-600',
    navigateTo: 'expenses',
  },
  {
    id: 'staff',
    label: 'Manage Staff',
    description: 'User accounts, roles and PINs',
    icon: UserCog,
    iconClass: 'text-pink-600',
    navigateTo: 'staff',
  },
  {
    id: 'reports',
    label: 'Reports',
    description: 'Drill-down sales analytics',
    icon: BarChart3,
    iconClass: 'text-indigo-600',
    navigateTo: 'reports',
  },
  {
    id: 'settings',
    label: 'Settings',
    description: 'Pricing, KDS, branding & more',
    icon: Settings,
    iconClass: 'text-slate-600',
    navigateTo: 'settings',
  },
]

export function QuickActionsGrid({ onNavigate }: QuickActionsGridProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
      {ACTIONS.map((action) => (
        <ActionTile key={action.id} action={action} onNavigate={onNavigate} />
      ))}
    </div>
  )
}

function ActionTile({ action, onNavigate }: { action: QuickAction; onNavigate: (s: string) => void }) {
  const { label, description, icon: Icon, iconClass } = action
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onNavigate(action.navigateTo)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onNavigate(action.navigateTo)
        }
      }}
      className={cn(
        'cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
      )}
    >
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn('rounded-md bg-muted p-2', iconClass.replace('text-', 'text-'))}>
          <Icon className={cn('h-5 w-5', iconClass)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{label}</div>
          <div className="truncate text-xs text-muted-foreground">{description}</div>
        </div>
      </CardContent>
    </Card>
  )
}
