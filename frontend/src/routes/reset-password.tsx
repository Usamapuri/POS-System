import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, Loader2, Lock, AlertCircle } from 'lucide-react'

import apiClient from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export const Route = createFileRoute('/reset-password')({
  component: ResetPasswordPage,
})

// Minimum length must match backend (see minPasswordLen in backend auth
// handler). Keeping it a plain const instead of a shared constants file —
// one-line rule, duplicating it is cheaper than a new import boundary.
const MIN_PASSWORD_LEN = 8

function ResetPasswordPage() {
  const navigate = useNavigate()

  // Read the token from the URL search string. We intentionally do NOT use
  // TanStack Router's validateSearch for this route: the token is opaque,
  // validated server-side, and typing it as a strict schema would only add
  // friction when we rename/rotate it later.
  const token = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return new URLSearchParams(window.location.search).get('token') ?? ''
  }, [])

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const mutation = useMutation({
    mutationFn: async (payload: { token: string; newPassword: string }) =>
      apiClient.resetPassword(payload.token, payload.newPassword),
    onSuccess: () => {
      setDone(true)
      setError(null)
      // Small delay so the user sees the success UI, then auto-bounce to
      // login. Matches the dwell time of the login-success redirect in
      // /login.
      setTimeout(() => {
        navigate({ to: '/login' })
      }, 1600)
    },
    onError: (err: Error) => {
      setError(err.message || 'Could not reset password')
    },
  })

  // Missing token: almost certainly a user who opened the reset-password
  // URL manually, or an email client that stripped the query string. Show a
  // helpful message instead of a blank form.
  if (!token) {
    return (
      <AuthShell>
        <div className="space-y-5">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600 ring-1 ring-rose-100">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div>
            <h2 className="bhk-serif text-[32px] leading-[1.1] text-[#1a1410]">Missing reset link</h2>
            <p className="mt-2 text-[14px] leading-relaxed text-zinc-600">
              This page needs a reset token in the URL — make sure you opened the full link from the reset email (some
              email clients truncate long URLs).
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/forgot-password">
              <Button className="bhk-cta h-11 rounded-xl border-0 px-5 text-[14px] font-semibold text-white">
                Request a new link
              </Button>
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-zinc-500 hover:text-orange-600"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
            </Link>
          </div>
        </div>
      </AuthShell>
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < MIN_PASSWORD_LEN) {
      setError(`Password must be at least ${MIN_PASSWORD_LEN} characters`)
      return
    }
    if (password !== confirm) {
      setError("Passwords don't match")
      return
    }
    mutation.mutate({ token, newPassword: password })
  }

  return (
    <AuthShell>
      {done ? (
        <div className="space-y-5">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div>
            <h2 className="bhk-serif text-[32px] leading-[1.1] text-[#1a1410]">Password updated</h2>
            <p className="mt-2 text-[14px] leading-relaxed text-zinc-600">
              You can now sign in with your new password. Redirecting you to the login page…
            </p>
          </div>
          <Link to="/login">
            <Button className="bhk-cta h-11 rounded-xl border-0 px-5 text-[14px] font-semibold text-white">
              Go to sign in
            </Button>
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <h2 className="bhk-serif text-[32px] leading-[1.1] text-[#1a1410]">Set a new password</h2>
            <p className="mt-2 text-[14px] leading-relaxed text-zinc-600">
              Choose a password with at least {MIN_PASSWORD_LEN} characters. You'll use this to sign in from now on.
            </p>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
              New password
            </span>
            <div className="bhk-input flex h-12 items-center rounded-xl px-3.5">
              <Lock className="mr-2.5 h-4 w-4 text-zinc-400" />
              <Input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-full border-0 bg-transparent px-0 text-[15px] shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                autoComplete="new-password"
                placeholder="••••••••"
                disabled={mutation.isPending}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="ml-1 grid h-7 w-7 place-items-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
              Confirm new password
            </span>
            <div className="bhk-input flex h-12 items-center rounded-xl px-3.5">
              <Lock className="mr-2.5 h-4 w-4 text-zinc-400" />
              <Input
                type={showPassword ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="h-full border-0 bg-transparent px-0 text-[15px] shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                autoComplete="new-password"
                placeholder="••••••••"
                disabled={mutation.isPending}
              />
            </div>
          </label>

          {error && (
            <div className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50/70 px-3.5 py-2.5 text-[13px] text-rose-800">
              <span className="mt-0.5 grid h-4 w-4 flex-shrink-0 place-items-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
                !
              </span>
              <div>
                <div className="font-semibold">Couldn't update password</div>
                <div className="text-rose-700/80">{error}</div>
              </div>
            </div>
          )}

          <Button
            type="submit"
            className="bhk-cta group h-12 w-full rounded-xl border-0 text-[15px] font-semibold tracking-tight text-white"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Updating password…
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                Update password
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            )}
          </Button>

          <div className="pt-2">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-zinc-500 hover:text-orange-600"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
            </Link>
          </div>
        </form>
      )}
    </AuthShell>
  )
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-[#fdf8f1] text-[#1a1410]">
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(700px 400px at 100% 0%, rgba(251, 191, 36, 0.10), transparent 60%), radial-gradient(500px 300px at 0% 100%, rgba(244, 63, 94, 0.06), transparent 60%)',
        }}
      />
      <div className="relative mx-auto flex min-h-screen max-w-[520px] items-center justify-center px-6 py-10">
        <div className="w-full">{children}</div>
      </div>
    </div>
  )
}
