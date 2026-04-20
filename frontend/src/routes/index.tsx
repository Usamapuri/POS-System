import { createFileRoute, Navigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import apiClient from '@/api/client'
import type { User } from '@/types'
import { defaultAdminPath, isStaffRole } from '@/lib/staff-roles'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const storedUser = localStorage.getItem('pos_user')
    const token = localStorage.getItem('pos_token')

    if (storedUser && token) {
      try {
        setUser(JSON.parse(storedUser))
      } catch {
        localStorage.removeItem('pos_user')
        localStorage.removeItem('pos_token')
      }
    }
    setIsLoading(false)
  }, [])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading POS System…</p>
        </div>
      </div>
    )
  }

  if (!apiClient.isAuthenticated() || !user) {
    return <Navigate to="/login" />
  }

  if (!isStaffRole(user.role)) {
    return <Navigate to="/login" />
  }

  return <Navigate to={defaultAdminPath(user.role)} replace />
}
