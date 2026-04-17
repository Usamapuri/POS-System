import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { UserMenu } from '@/components/ui/user-menu'
import { 
  LayoutDashboard, 
  Users, 
  CreditCard, 
  ChefHat,
  ShoppingCart,
  Settings,
  User,
  Menu,
  BarChart3,
  UserCog,
  Store,
  LayoutGrid,
  Warehouse,
  Radio,
  FileWarning,
  Receipt,
} from 'lucide-react'
import type { User as UserType } from '@/types'
import apiClient from '@/api/client'

// Import components for different sections
import { AdminDashboard } from './AdminDashboard'
import { POSLayout } from '@/components/pos/POSLayout'
import { KOTServerInterface } from '@/components/server/KOTServerInterface'
import { CounterInterface } from '@/components/counter/CounterInterface'
import { NewEnhancedKitchenLayout } from '@/components/kitchen/NewEnhancedKitchenLayout'
import { ToastDemo } from '@/components/ui/demo-toast'
import { FormDemo } from '@/components/forms/FormDemo'
import { AdminStaffManagement } from './AdminStaffManagement'
import { AdminSettings } from './AdminSettings'
import { AdminMenuManagement } from './AdminMenuManagement'
import { AdminTableManagement } from './AdminTableManagement'
import { AdminReports } from './AdminReports'
import { StoreInventoryDashboard } from '@/components/store/StoreInventoryDashboard'
import { ExpenseDashboard } from './ExpenseDashboard'
import { StationManagement } from './StationManagement'
import { VoidLog } from './VoidLog'

interface AdminLayoutProps {
  user: UserType
}

const adminSections = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard className="w-5 h-5" />,
    description: 'Overview and statistics'
  },

  {
    id: 'server',
    label: 'Server Interface',
    icon: <Users className="w-5 h-5" />,
    description: 'Server order interface'
  },
  {
    id: 'counter',
    label: 'Counter/Checkout',
    icon: <CreditCard className="w-5 h-5" />,
    description: 'Payment processing'
  },
  {
    id: 'kitchen',
    label: 'Kitchen Display',
    icon: <ChefHat className="w-5 h-5" />,
    description: 'Kitchen order display'
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: <Settings className="w-5 h-5" />,
    description: 'System configuration'
  },
  {
    id: 'staff',
    label: 'Manage Staff',
    icon: <UserCog className="w-5 h-5" />,
    description: 'User and role management'
  },
  {
    id: 'menu',
    label: 'Manage Menu',
    icon: <Menu className="w-5 h-5" />,
    description: 'Categories and products'
  },
  {
    id: 'tables',
    label: 'Manage Tables',
    icon: <LayoutGrid className="w-5 h-5" />,
    description: 'Dining table setup'
  },
  {
    id: 'inventory',
    label: 'Store Inventory',
    icon: <Warehouse className="w-5 h-5" />,
    description: 'Supplies & stock'
  },
  {
    id: 'expenses',
    label: 'Expenses',
    icon: <Receipt className="w-5 h-5" />,
    description: 'Expense tracking & daily closing'
  },
  {
    id: 'stations',
    label: 'Kitchen Stations',
    icon: <Radio className="w-5 h-5" />,
    description: 'KOT routing configuration'
  },
  {
    id: 'void-log',
    label: 'Void Log',
    icon: <FileWarning className="w-5 h-5" />,
    description: 'Voided items audit trail'
  },
  {
    id: 'reports',
    label: 'View Reports',
    icon: <BarChart3 className="w-5 h-5" />,
    description: 'Sales and analytics'
  }
]

export function AdminLayout({ user }: AdminLayoutProps) {
  const [currentSection, setCurrentSection] = useState('dashboard')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isTablet, setIsTablet] = useState(false)

  const { data: settingsRes } = useQuery({
    queryKey: ['settings', 'all'],
    queryFn: () => apiClient.getAllSettings(),
    staleTime: 1000 * 60 * 5,
  })

  const businessName = (settingsRes?.data as Record<string, unknown>)?.receipt_business_name as string || ''
  const logoUrl = (settingsRes?.data as Record<string, unknown>)?.receipt_logo_url as string || ''

  // Responsive breakpoint detection
  useEffect(() => {
    const checkScreenSize = () => {
      const width = window.innerWidth
      setIsMobile(width < 768) // md breakpoint
      setIsTablet(width >= 768 && width < 1024) // md to lg breakpoint
      
      // Auto-collapse sidebar on mobile and tablet for better UX
      if (width < 1024) {
        setSidebarCollapsed(true)
      }
    }

    checkScreenSize()
    window.addEventListener('resize', checkScreenSize)
    return () => window.removeEventListener('resize', checkScreenSize)
  }, [])

  const renderCurrentSection = () => {
    switch (currentSection) {
      case 'dashboard':
        return <AdminDashboard />
      case 'server':
        return <KOTServerInterface />
      case 'counter':
        return (
          <div className="flex h-[calc(100dvh-1.25rem)] min-h-[520px] w-full max-w-full flex-col overflow-hidden sm:h-[calc(100dvh-0.5rem)]">
            <CounterInterface />
          </div>
        )
      case 'kitchen':
        return <NewEnhancedKitchenLayout user={user} />
      case 'settings':
        return (
          <div className="space-y-8">
            <AdminSettings />
            <ToastDemo />
            <FormDemo />
          </div>
        )
      case 'staff':
        return <AdminStaffManagement />
      case 'menu':
        return <AdminMenuManagement />
      case 'tables':
        return <AdminTableManagement />
      case 'inventory':
        return <StoreInventoryDashboard />
      case 'expenses':
        return <ExpenseDashboard />
      case 'stations':
        return <StationManagement />
      case 'void-log':
        return <VoidLog />
      case 'reports':
        return <AdminReports />
      default:
        return <AdminDashboard />
    }
  }

  // const currentSectionInfo = adminSections.find(s => s.id === currentSection) // Removed with top header

  return (
    <div className="relative flex h-dvh min-h-0 bg-background">
      {/* Mobile/Tablet Overlay */}
      {(isMobile || isTablet) && !sidebarCollapsed && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarCollapsed(true)}
        />
      )}

      {/* Sidebar */}
      <div className={`bg-card border-r border-border transition-all duration-300 flex flex-col z-50 ${
        (isMobile || isTablet) 
          ? `fixed left-0 top-0 h-full ${sidebarCollapsed ? '-translate-x-full w-0' : 'translate-x-0 w-80'}` 
          : `relative ${sidebarCollapsed ? 'w-16' : 'w-64'}`
      }`}>
        {/* Header - Logo + Toggle */}
        <div className="px-4 py-5 space-y-3">
          {/* Logo (expanded) or Icon (collapsed) */}
          {!sidebarCollapsed || isMobile || isTablet ? (
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
                <div className={`w-full flex items-center justify-center bg-primary ${
                  (isMobile || isTablet) ? 'h-16' : 'h-12'
                }`}>
                  <Store className={`text-primary-foreground ${
                    (isMobile || isTablet) ? 'w-8 h-8' : 'w-6 h-6'
                  }`} />
                </div>
              )}
            </div>
          ) : (
            <div className="w-full aspect-square rounded-lg overflow-hidden border border-border shadow-sm bg-white dark:bg-gray-800 flex items-center justify-center">
              <Store className="w-6 h-6 text-muted-foreground" />
            </div>
          )}
          
          {/* Toggle Button */}
          <Button
            variant="ghost"
            size={isTablet ? "default" : "sm"}
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={`w-full flex items-center justify-center gap-2 ${isTablet ? "h-10" : "h-8"}`}
          >
            <Menu className={isTablet ? "w-5 h-5" : "w-4 h-4"} />
            {(!sidebarCollapsed || isMobile || isTablet) && (
              <span className={isTablet ? "text-sm" : "text-xs"}>
                {sidebarCollapsed ? 'Expand' : 'Collapse'}
              </span>
            )}
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex flex-col flex-1 px-4 pb-4">
            <div className={isTablet ? "space-y-3" : "space-y-2"}>
              {adminSections.map((section) => (
                <Button
                  key={section.id}
                  variant={currentSection === section.id ? 'default' : 'ghost'}
                  className={`w-full justify-start transition-colors ${
                    sidebarCollapsed && !isMobile && !isTablet ? 'px-2' : 'px-4'
                  } ${
                    isTablet ? 'h-12 text-base' : 'h-10 text-sm'
                  }`}
                  onClick={() => {
                    setCurrentSection(section.id)
                    // Auto-close sidebar on mobile/tablet after selection
                    if (isMobile || isTablet) {
                      setSidebarCollapsed(true)
                    }
                  }}
                  title={sidebarCollapsed && !isMobile && !isTablet ? section.label : undefined}
                >
                  <span className={isTablet ? "w-6 h-6 flex items-center justify-center" : "w-5 h-5 flex items-center justify-center"}>
                    {section.icon}
                  </span>
                  {(!sidebarCollapsed || isMobile || isTablet) && (
                    <span className={`${isTablet ? 'ml-4' : 'ml-3'}`}>{section.label}</span>
                  )}
                </Button>
              ))}
            </div>
            
            {/* Spacer to push logout to bottom */}
            <div className="flex-1"></div>
            
            {/* User Menu */}
            <div className={isTablet ? 'mt-6' : 'mt-4'}>
              <UserMenu 
                user={user} 
                collapsed={sidebarCollapsed && !isMobile && !isTablet}
                size={isTablet ? 'lg' : 'md'}
              />
            </div>
          </nav>
      </div>

      {/* Main Content */}
      <div
        className={`flex-1 min-h-0 flex flex-col overflow-hidden ${
          (isMobile || isTablet) ? 'w-full' : ''
        }`}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{renderCurrentSection()}</div>
      </div>
    </div>
  )
}
