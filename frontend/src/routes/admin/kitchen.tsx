import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { NewEnhancedKitchenLayout } from '@/components/kitchen/NewEnhancedKitchenLayout'
import { KitchenDisabledScreen } from '@/components/kitchen/KitchenDisabledScreen'
import { useKitchenSettings, isKDSEnabled } from '@/hooks/useKitchenSettings'
import type { User } from '@/types'

export const Route = createFileRoute('/admin/kitchen')({
  component: AdminKitchenPage,
})

function AdminKitchenPage() {
  const [user, setUser] = useState<User | null>(null)
  const settings = useKitchenSettings()

  useEffect(() => {
    const storedUser = localStorage.getItem('pos_user')
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser))
      } catch (error) {
        console.error('Failed to parse stored user:', error)
      }
    }
  }, [])

  if (!user || settings.isLoading) {
    return <div className="p-6 text-muted-foreground">Loading…</div>
  }

  if (!isKDSEnabled(settings.mode)) {
    return <KitchenDisabledScreen userRole={user.role} />
  }

  return <NewEnhancedKitchenLayout user={user} />
}
