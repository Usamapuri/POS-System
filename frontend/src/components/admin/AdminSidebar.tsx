import { useState, useEffect } from 'react'
import { Link, useRouter, useLocation } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { UserMenu } from '@/components/ui/user-menu'
import { 
  LayoutDashboard, 
  Users, 
  CreditCard, 
  ChefHat,
  Settings,
  User,
  Menu,
  BarChart3,
  UserCog,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  Warehouse,
  Receipt,
  Radio,
  FileWarning,
  Store,
  Shield
} from 'lucide-react'
import type { User as UserType } from '@/types'
import apiClient from '@/api/client'
import { useKitchenSettings, isKDSEnabled } from '@/hooks/useKitchenSettings'
import { navSectionIdsForRole } from '@/lib/staff-roles'

interface AdminSidebarProps {
  user: UserType
}

const adminSections = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard className="w-5 h-5" />,
    description: 'Overview and statistics',
    href: '/admin/dashboard'
  },
  {
    id: 'counter',
    label: 'Checkout Counter',
    icon: <CreditCard className="w-5 h-5" />,
    description: 'Payment processing',
    href: '/admin/counter'
  },
  {
    id: 'server',
    label: 'Server Interface',
    icon: <Users className="w-5 h-5" />,
    description: 'Server order interface',
    href: '/admin/server'
  },
  {
    id: 'inventory',
    label: 'Store Inventory',
    icon: <Warehouse className="w-5 h-5" />,
    description: 'Supplies & stock management',
    href: '/admin/inventory'
  },
  {
    id: 'menu',
    label: 'Manage Menu',
    icon: <Menu className="w-5 h-5" />,
    description: 'Categories and products',
    href: '/admin/menu'
  },
  {
    id: 'tables',
    label: 'Manage Tables',
    icon: <LayoutGrid className="w-5 h-5" />,
    description: 'Dining table management',
    href: '/admin/tables'
  },
  {
    id: 'staff',
    label: 'Manage Staff',
    icon: <UserCog className="w-5 h-5" />,
    description: 'User and role management',
    href: '/admin/staff'
  },
  {
    id: 'reports',
    label: 'View Reports',
    icon: <BarChart3 className="w-5 h-5" />,
    description: 'Analytics and reports',
    href: '/admin/reports'
  },
  {
    id: 'expenses',
    label: 'View Expenses',
    icon: <Receipt className="w-5 h-5" />,
    description: 'Expense tracking & daily closing',
    href: '/admin/expenses'
  },
  {
    id: 'void-log',
    label: 'Void Log',
    icon: <FileWarning className="w-5 h-5" />,
    description: 'Voided items audit trail',
    href: '/admin/void-log'
  },
  {
    id: 'kitchen',
    label: 'Kitchen Display',
    icon: <ChefHat className="w-5 h-5" />,
    description: 'Kitchen order display',
    href: '/admin/kitchen'
  },
  {
    id: 'stations',
    label: 'Kitchen Stations',
    icon: <Radio className="w-5 h-5" />,
    description: 'KOT routing configuration',
    href: '/admin/stations'
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: <Settings className="w-5 h-5" />,
    description: 'System configuration',
    href: '/admin/settings'
  },
  {
    id: 'fiscal-audit',
    label: 'Fiscal audit',
    icon: <Shield className="w-5 h-5" />,
    description: 'FBR/PRA compliance log',
    href: '/admin/fiscal-audit'
  }
]

export function AdminSidebar({ user }: AdminSidebarProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isTablet, setIsTablet] = useState(false)
  const router = useRouter()
  const location = useLocation()

  const { data: settingsRes } = useQuery({
    queryKey: ['settings', 'all'],
    queryFn: () => apiClient.getAllSettings(),
    staleTime: 1000 * 60 * 5,
  })
  const kitchen = useKitchenSettings()
  const kdsOn = isKDSEnabled(kitchen.mode)

  const businessName = (settingsRes?.data as Record<string, unknown>)?.receipt_business_name as string || ''
  const logoUrl = (settingsRes?.data as Record<string, unknown>)?.receipt_logo_url as string || ''

  const allowedIds = navSectionIdsForRole(user.role)
  // Hide Kitchen Display when KOT-only; restrict nav by role (null = admin: all).
  const visibleAdminSections = adminSections.filter((s) => {
    if (s.id === 'kitchen' && !kdsOn) return false
    if (allowedIds !== null && !allowedIds.has(s.id)) return false
    return true
  })

  // Responsive checks
  useEffect(() => {
    const checkScreenSize = () => {
      const width = window.innerWidth
      setIsMobile(width < 768)
      setIsTablet(width >= 768 && width < 1024)

      if (width < 1024) {
        setSidebarCollapsed(true)
      }
    }

    checkScreenSize()
    window.addEventListener('resize', checkScreenSize)
    return () => window.removeEventListener('resize', checkScreenSize)
  }, [])

  const isActiveRoute = (href: string) => {
    return location.pathname === href
  }

  return (
    <>
      {/* Backdrop for mobile */}
      {(isMobile || isTablet) && !sidebarCollapsed && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 xl:hidden"
          onClick={() => setSidebarCollapsed(true)}
        />
      )}

      {/* Sidebar */}
      <div className={`bg-card border-r border-border transition-all duration-300 flex flex-col z-50 ${
        (isMobile || isTablet) 
          ? `fixed left-0 top-0 h-full ${sidebarCollapsed ? '-translate-x-full w-0' : 'translate-x-0 w-80'}` 
          : `relative ${sidebarCollapsed ? 'w-16' : 'w-64'}`
      }`}>
        
        {/* Header - Logo + Collapse Button */}
        <div className="px-4 py-5 border-b border-border space-y-3">
          {/* Logo - Full Width */}
          {!sidebarCollapsed && (
            <div className="w-full rounded-lg overflow-hidden border border-border shadow-sm bg-white dark:bg-gray-800">
              {logoUrl ? (
                <img 
                  src={logoUrl} 
                  alt="Restaurant logo" 
                  className="w-full h-auto object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                    const parent = e.currentTarget.parentElement
                    if (parent) {
                      parent.innerHTML = '<div class="w-full h-12 flex items-center justify-center bg-primary"><svg class="w-6 h-6 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg></div>'
                    }
                  }}
                />
              ) : (
                <div className="w-full h-12 flex items-center justify-center bg-primary">
                  <Store className="w-6 h-6 text-primary-foreground" />
                </div>
              )}
            </div>
          )}
          {sidebarCollapsed && !isMobile && !isTablet && (
            <div className="w-full aspect-square rounded-lg overflow-hidden border border-border shadow-sm bg-white dark:bg-gray-800 flex items-center justify-center">
              <Store className="w-6 h-6 text-muted-foreground" />
            </div>
          )}
          
          {/* Collapse/Expand Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full h-8 flex items-center justify-center gap-2"
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                {!isMobile && !isTablet && <span className="text-xs">Collapse</span>}
              </>
            )}
          </Button>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {visibleAdminSections.map((section) => (
            <Link
              key={section.id}
              to={section.href}
              className="block"
            >
              <Button
                variant={isActiveRoute(section.href) ? "default" : "ghost"}
                className={`w-full justify-start transition-colors ${
                  sidebarCollapsed && !isMobile && !isTablet ? 'px-2' : 'px-4'
                } ${
                  isTablet ? 'h-12 text-base' : 'h-10 text-sm'
                }`}
              >
                {section.icon}
                {(!sidebarCollapsed || isMobile || isTablet) && (
                  <span className="ml-3">{section.label}</span>
                )}
              </Button>
            </Link>
          ))}
        </div>

        {/* User Menu */}
        <div className="p-4 border-t border-border">
          <UserMenu 
            user={user} 
            collapsed={sidebarCollapsed && !isMobile && !isTablet}
            size={isTablet ? 'lg' : 'md'}
          />
        </div>
      </div>
    </>
  )
}
