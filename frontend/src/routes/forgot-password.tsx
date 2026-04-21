import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Loader2, Mail, CheckCircle2 } from 'lucide-react'

import apiClient from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export const Route = createFileRoute('/forgot-password')({
  component: ForgotPasswordPage,
})

// Single-page flow:
//   1. Email form (initial state)
//   2. Generic success confirmation (after submit)
//
// We intentionally show the same confirmation whether the email exists or not
// — the backend enforces this too, but keeping the frontend honest avoids
// accidental enumeration via error toasts or different states.
function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async (payload: { email: string }) => apiClient.forgotPassword(payload.email),
    onSuccess: () => {
      setSubmitted(true)
      setError(null)
    },
    onError: (err: Error) => {
      // Rate-limit errors (HTTP 429) are the one case we DO surface — it's
      // legitimate UX feedback, and doesn't leak user existence because the
      // limiter triggers the same way for any email (real or not).
      if (err.message.toLowerCase().includes('too many')) {
        setError(err.message)
      } else {
        // Any other network-level failure: still show success to preserve
        // the enumeration guarantee, but log for ops visibility.
        // eslint-disable-next-line no-console
        console.warn('forgot-password unexpected error:', err.message)
        setSubmitted(true)
      }
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) {
      setError('Please enter your email')
      return
    }
    setError(null)
    mutation.mutate({ email: trimmed })
  }

  return (
    <AuthShell>
      {submitted ? (
        <div className="space-y-5">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div>
            <h2 className="bhk-serif text-[32px] leading-[1.1] text-[#1a1410]">Check your email</h2>
            <p className="mt-2 text-[14px] leading-relaxed text-zinc-600">
              If <span className="font-medium text-[#1a1410]">{email.trim()}</span> is registered, we just sent a link
              to reset your password. The link is valid for 1 hour.
            </p>
          </div>
          <div className="rounded-xl bg-amber-50/70 p-4 text-[13px] leading-relaxed text-amber-900 ring-1 ring-amber-100">
            <p className="font-medium">Didn't get the email?</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-800/90">
              <li>Check your spam folder.</li>
              <li>Make sure you entered the email you registered with.</li>
              <li>Ask your manager if you're not sure which email is on file.</li>
            </ul>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="outline"
              className="h-11 rounded-xl border-zinc-200"
              onClick={() => {
                setSubmitted(false)
                setEmail('')
              }}
            >
              Use a different email
            </Button>
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-orange-600 hover:text-orange-700"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <h2 className="bhk-serif text-[32px] leading-[1.1] text-[#1a1410]">Forgot your password?</h2>
            <p className="mt-2 text-[14px] leading-relaxed text-zinc-600">
              Enter the email address on your Bhookly account and we'll send you a link to set a new password.
            </p>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
              Email
            </span>
            <div className="bhk-input flex h-12 items-center rounded-xl px-3.5">
              <Mail className="mr-2.5 h-4 w-4 text-zinc-400" />
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-full border-0 bg-transparent px-0 text-[15px] shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                autoComplete="email"
                placeholder="you@restaurant.com"
                disabled={mutation.isPending}
                autoFocus
              />
            </div>
          </label>

          {error && (
            <div className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50/70 px-3.5 py-2.5 text-[13px] text-rose-800">
              <span className="mt-0.5 grid h-4 w-4 flex-shrink-0 place-items-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
                !
              </span>
              <div>
                <div className="font-semibold">Hold on</div>
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
                Sending reset link…
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                Send reset link
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

// Minimal shared shell matching the login page's right panel — keeps the
// visual language without pulling in the full BrandPanel + marketing
// composition, which would be distracting on a utility flow.
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
