import { createFileRoute, Link, Navigate, useRouter } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import apiClient from '@/api/client'
import { Button } from '@/components/ui/button'
import { DEMO_ACCOUNTS, DEMO_LOGIN_PASSWORD, showDemoLoginUi } from '@/lib/demo-accounts'
import type { User } from '@/types'
import type { APIResponse, LoginResponse } from '@/types'
import { defaultAdminPath, isStaffRole } from '@/lib/staff-roles'
import { Store } from 'lucide-react'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const demoLoginMutation = useMutation({
    mutationFn: async (credentials: { username: string; password: string }) => {
      return apiClient.login(credentials) as Promise<APIResponse<LoginResponse>>
    },
    onSuccess: (data) => {
      if (data.success && data.data) {
        apiClient.setAuthToken(data.data.token)
        localStorage.setItem('pos_user', JSON.stringify(data.data.user))
        router.navigate({ to: '/' })
      }
    },
  })

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
    if (showDemoLoginUi()) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-[#fdf8f1] to-amber-50/40 flex flex-col items-center justify-center p-6 text-[#1a1410]">
          <div className="max-w-lg w-full text-center space-y-6">
            <div className="flex justify-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
                <Store className="w-8 h-8 text-white" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold bhk-serif">Bhookly POS</h1>
              <p className="text-sm text-zinc-600 mt-2">
                Choose a demo role to sign in, or open the full login screen.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map((a) => (
                <Button
                  key={a.username}
                  variant="secondary"
                  className="h-auto py-3 flex flex-col items-stretch text-left border-zinc-200 bg-white hover:bg-amber-50/80"
                  disabled={demoLoginMutation.isPending}
                  onClick={() =>
                    demoLoginMutation.mutate({ username: a.username, password: DEMO_LOGIN_PASSWORD })
                  }
                >
                  <span className="font-semibold">{a.role}</span>
                  <span className="text-xs font-normal text-muted-foreground">{a.desc}</span>
                </Button>
              ))}
            </div>
            <Button asChild variant="outline" className="w-full border-zinc-300">
              <Link to="/login" search={{}}>
                Full login (username / email & password)
              </Link>
            </Button>
          </div>
        </div>
      )
    }
    return <Navigate to="/login" search={{}} />
  }

  if (!isStaffRole(user.role)) {
    return <Navigate to="/login" search={{}} />
  }

  return <Navigate to={defaultAdminPath(user.role)} replace />
}
