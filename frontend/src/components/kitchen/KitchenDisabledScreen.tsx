import { Printer, Settings as SettingsIcon, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import apiClient from '@/api/client'

interface KitchenDisabledScreenProps {
  userRole: string
}

/**
 * Shown when `kitchen.mode === 'kot_only'` and a user attempts to reach the KDS.
 * For admin/manager the CTA sends them to settings to re-enable; for kitchen
 * role the screen is informational only.
 */
export function KitchenDisabledScreen({ userRole }: KitchenDisabledScreenProps) {
  const isAdmin = userRole === 'admin' || userRole === 'manager'

  const handleLogout = () => {
    apiClient.clearAuth()
    window.location.href = '/login'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-gray-900 dark:to-gray-950 flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-2xl shadow-sm p-8">
        <div className="flex items-center justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <Printer className="w-8 h-8 text-amber-700 dark:text-amber-300" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-center text-slate-900 dark:text-slate-100 mb-2">
          Kitchen Display is disabled
        </h1>
        <p className="text-center text-slate-600 dark:text-slate-400 mb-6">
          This venue is operating in <strong>KOT-only mode</strong>. Orders are routed directly to
          station printers — the digital kitchen display is not in use.
        </p>

        {isAdmin ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              To re-enable the KDS, go to <strong>Admin → Settings → Kitchen</strong> and change the
              Kitchen Mode to <em>KDS</em>.
            </p>
            <Button
              className="w-full"
              onClick={() => (window.location.href = '/admin/settings')}
            >
              <SettingsIcon className="w-4 h-4 mr-2" />
              Open Kitchen Settings
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              If you expected to see orders here, ask your manager to change the Kitchen Mode in
              Admin Settings.
            </p>
            <Button variant="outline" className="w-full" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Log out
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
