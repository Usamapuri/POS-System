import { createFileRoute, Link, Navigate, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import apiClient from '@/api/client'
import type { LoginRequest, LoginResponse, APIResponse } from '@/types'
import {
  Eye,
  EyeOff,
  ArrowRight,
  Lock,
  User as UserIcon,
  Sparkles,
  ShieldCheck,
  ChefHat,
  CreditCard,
  UserCheck,
  Settings,
  BarChart3,
  Warehouse,
  Loader2,
} from 'lucide-react'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

// ─────────────────────────────────────────────────────────────────────────────
// Demo accounts — same credentials as before, but presented as compact chips
// instead of two competing card grids. One source of truth.
// ─────────────────────────────────────────────────────────────────────────────
type DemoAccount = {
  username: string
  password: string
  role: string
  blurb: string
  icon: typeof ChefHat
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  { username: 'server1',  password: 'admin123', role: 'Server',  blurb: 'Floor & dine-in',     icon: UserCheck },
  { username: 'counter1', password: 'admin123', role: 'Counter', blurb: 'Checkout & payments', icon: CreditCard },
  { username: 'kitchen1', password: 'admin123', role: 'Kitchen', blurb: 'Tickets & prep',      icon: ChefHat },
  { username: 'admin',    password: 'admin123', role: 'Admin',   blurb: 'Full access',         icon: Settings },
  { username: 'manager1', password: 'admin123', role: 'Manager', blurb: 'Reports & ops',       icon: BarChart3 },
  { username: 'store1',   password: 'admin123', role: 'Store',   blurb: 'Inventory',           icon: Warehouse },
]

function LoginPage() {
  const router = useRouter()
  const [formData, setFormData] = useState<LoginRequest>({ username: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [activeDemo, setActiveDemo] = useState<string | null>(null)

  // Already authenticated → home
  if (apiClient.isAuthenticated()) {
    return <Navigate to="/" />
  }

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginRequest) => {
      const response: APIResponse<LoginResponse> = await apiClient.login(credentials)
      return response
    },
    onSuccess: (data) => {
      if (data.success && data.data) {
        apiClient.setAuthToken(data.data.token)
        localStorage.setItem('pos_user', JSON.stringify(data.data.user))
        setTimeout(() => {
          router.navigate({ to: '/' })
        }, 100)
      } else {
        setError(data.message || 'Login failed')
      }
    },
    onError: (err: any) => {
      setError(err.message || 'Login failed')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!formData.username.trim() || !formData.password) {
      setError('Username or email and password are required')
      return
    }
    loginMutation.mutate({
      username: formData.username.trim(),
      password: formData.password,
    })
  }

  // One-click demo: fill credentials AND sign in immediately. The previous
  // page only filled the form — this is faster and matches what the chip
  // visually promises.
  const useDemo = (account: DemoAccount) => {
    setError('')
    setActiveDemo(account.username)
    setFormData({ username: account.username, password: account.password })
    loginMutation.mutate({ username: account.username, password: account.password })
  }

  return (
    <div className="bhookly-login min-h-screen w-full bg-[#fdf8f1] text-[#1a1410] lg:grid lg:grid-cols-[3fr_2fr]">
      <BrandPanel />
      <FormPanel
        formData={formData}
        setFormData={setFormData}
        showPassword={showPassword}
        setShowPassword={setShowPassword}
        error={error}
        isPending={loginMutation.isPending}
        activeDemo={activeDemo}
        onSubmit={handleSubmit}
        onUseDemo={useDemo}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Brand wordmark — custom "B" glyph that doubles as a stylized fork, paired
// with the Bhookly wordmark in our serif display face.
// ─────────────────────────────────────────────────────────────────────────────
function Wordmark({ tone = 'light' as 'light' | 'dark' }) {
  const fg = tone === 'light' ? 'text-white' : 'text-[#1a1410]'
  const ring = tone === 'light' ? 'bg-white/10 ring-white/20' : 'bg-[#1a1410]/5 ring-[#1a1410]/10'
  return (
    <div className="flex items-center gap-3">
      <div className={`relative grid h-10 w-10 place-items-center rounded-xl ring-1 ${ring}`}>
        <svg viewBox="0 0 24 24" className={`h-6 w-6 ${fg}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          {/* stylized B + spoon */}
          <path d="M6 4v16" />
          <path d="M6 4h6.5a3.5 3.5 0 0 1 0 7H6" />
          <path d="M6 11h7.5a3.5 3.5 0 0 1 0 9H6" />
          <circle cx="19" cy="6.5" r="1.6" fill="currentColor" stroke="none" />
        </svg>
      </div>
      <div className={`bhk-serif text-3xl leading-none ${fg}`}>
        Bhookly
        <span className="ml-0.5 text-amber-300">.</span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// LEFT PANEL — editorial brand hero with floating product mock
// ─────────────────────────────────────────────────────────────────────────────
function BrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden lg:flex lg:flex-col bhk-gradient-brand text-white">
      {/* grain + subtle dotted noise */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.18] mix-blend-overlay bhk-grain" />

      {/* top-right meta */}
      <div className="relative z-10 flex items-start justify-between p-10">
        <Wordmark tone="light" />
        <div className="hidden items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80 ring-1 ring-white/15 backdrop-blur xl:inline-flex">
          <span className="bhk-pulse h-1.5 w-1.5 rounded-full bg-emerald-400" />
          All systems operational
        </div>
      </div>

      {/* hero copy */}
      <div className="relative z-10 flex flex-1 flex-col justify-center px-10 xl:px-16">
        {/* scale-[1.15] grows the entire hero (pill, headline, body, stats)
            by exactly 15% — text, spacing, icons, all together. origin-left
            anchors growth to the left padding edge so the block doesn't
            collide with the panel's left side. */}
        <div className="max-w-xl origin-left scale-[1.15]">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-amber-200 ring-1 ring-white/15">
            <Sparkles className="h-3 w-3" />
            Restaurant POS, reimagined
          </div>

          <h1 className="bhk-serif text-[56px] leading-[1.02] tracking-tight xl:text-[68px]">
            Run your kitchen.
            <br />
            <span className="italic text-amber-200">Not your software.</span>
          </h1>

          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-white/75">
            Bhookly is the front-of-house, kitchen and back-office workspace your team
            actually wants to open every shift. Tickets in seconds, payments in one tap,
            inventory that adds itself up.
          </p>

          {/* stat strip */}
          <dl className="mt-10 grid max-w-md grid-cols-3 gap-6">
            <Stat value="14k+" label="orders / day" />
            <Stat value="98.4%" label="on-time tickets" />
            <Stat value="6 sec" label="avg checkout" />
          </dl>
        </div>

        {/* Floating product mocks. The `right` offset is calc'd against the
            viewport so the tickets stay pinned to roughly the same VIEWPORT
            position regardless of how wide the brand column gets. The
            original layout had brand ≈ 51.2vw with tickets at right:-40px
            (i.e. 40px past the panel's right edge). At brand = 60vw the
            panel grew by ~8.8vw, so we pull the tickets back inward by that
            much (~9vw) to land at the same screen x.
            scale-[1.15] grows the cards and their inner text in lockstep
            with the hero copy. Default origin (center) keeps the visual
            midpoint of the cards at the same vertical center. */}
        <div className="pointer-events-none absolute right-[calc(9vw_-_40px)] top-1/2 hidden -translate-y-1/2 scale-[1.15] xl:block">
          <FloatingTickets />
        </div>
      </div>

      {/* footer */}
      <div className="relative z-10 flex items-center justify-between px-10 pb-8 text-xs text-white/55 xl:px-16">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5" />
          PCI-aware · End-to-end encrypted
        </div>
        <FooterCredit tone="light" />
      </div>
    </aside>
  )
}

// Footer credit line: "© YEAR Bhookly Labs · v2.4 · Product of Artyreal".
// Hovering anywhere on the line releases a small flock of emojis that hop
// just above the text — playful but small enough not to dominate the footer.
function FooterCredit({ tone = 'light' as 'light' | 'dark' }) {
  const linkClass =
    tone === 'light'
      ? 'font-medium text-amber-200/90 underline-offset-2 hover:text-amber-100 hover:underline'
      : 'font-medium text-orange-600 underline-offset-2 hover:text-orange-700 hover:underline'

  return (
    <div className="bhk-credit relative inline-flex items-center gap-1 whitespace-nowrap">
      {/* Emojis hover above the line. Pointer-events disabled so they never
          steal hover from the text underneath. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-3 right-0 flex select-none gap-1.5"
      >
        <span className="bhk-emoji" style={{ animationDelay: '0ms' }}>🎨</span>
        <span className="bhk-emoji" style={{ animationDelay: '70ms' }}>✨</span>
        <span className="bhk-emoji" style={{ animationDelay: '140ms' }}>🍴</span>
        <span className="bhk-emoji" style={{ animationDelay: '210ms' }}>💫</span>
      </span>

      <span>
        Built with <span aria-label="love">🤍</span> by{' '}
        <a
          href="https://artyreal.com"
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          Artyreal
        </a>
      </span>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="bhk-serif text-3xl text-white">{value}</dt>
      <dd className="mt-1 text-[11px] uppercase tracking-wider text-white/55">{label}</dd>
    </div>
  )
}

// Two stacked, slightly tilted mock "tickets" that visually anchor the brand
// panel as a real product — not just marketing prose.
function FloatingTickets() {
  return (
    <div className="relative h-[440px] w-[360px]">
      {/* back ticket */}
      <div className="bhk-ticket-2 absolute right-12 top-4 w-[280px] rounded-2xl bg-white/95 p-4 text-[#1a1410] shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-amber-100 text-amber-700">
              <ChefHat className="h-3.5 w-3.5" />
            </span>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Kitchen · #A-218</div>
              <div className="text-sm font-semibold">Table 12 · 4 guests</div>
            </div>
          </div>
          <span className="text-[11px] font-medium text-amber-600">02:14</span>
        </div>
        <div className="mt-3 space-y-1.5 text-sm">
          <Row qty={2} name="Butter Chicken" tag="Spicy" />
          <Row qty={1} name="Garlic Naan" />
          <Row qty={2} name="Mango Lassi" tag="No sugar" />
        </div>
      </div>

      {/* front ticket */}
      <div className="bhk-ticket-1 absolute bottom-0 left-0 w-[300px] rounded-2xl bg-white p-5 text-[#1a1410] shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Order · #B-491</div>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Paid
          </span>
        </div>
        <div className="mt-2 bhk-serif text-3xl">$ 48.20</div>
        <div className="mt-1 text-xs text-zinc-500">Visa · 4242 · 1 tap</div>

        <div className="mt-4 flex items-center justify-between border-t border-dashed border-zinc-200 pt-3">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500">Server</div>
          <div className="text-xs font-medium">Sarah K.</div>
        </div>
      </div>
    </div>
  )
}

function Row({ qty, name, tag }: { qty: number; name: string; tag?: string }) {
  return (
    <div className="flex items-center justify-between text-zinc-700">
      <div className="flex items-center gap-2">
        <span className="inline-grid h-5 w-5 place-items-center rounded bg-zinc-100 text-[10px] font-semibold text-zinc-600">
          {qty}
        </span>
        <span>{name}</span>
      </div>
      {tag && (
        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-600">
          {tag}
        </span>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// RIGHT PANEL — focused, "native" form. No heavy card border, soft inputs,
// single saffron CTA, role chips beneath instead of two stacked tables.
// ─────────────────────────────────────────────────────────────────────────────
type FormPanelProps = {
  formData: LoginRequest
  setFormData: React.Dispatch<React.SetStateAction<LoginRequest>>
  showPassword: boolean
  setShowPassword: React.Dispatch<React.SetStateAction<boolean>>
  error: string
  isPending: boolean
  activeDemo: string | null
  onSubmit: (e: React.FormEvent) => void
  onUseDemo: (account: DemoAccount) => void
}

function FormPanel({
  formData,
  setFormData,
  showPassword,
  setShowPassword,
  error,
  isPending,
  activeDemo,
  onSubmit,
  onUseDemo,
}: FormPanelProps) {
  return (
    <section className="relative flex min-h-screen flex-col bg-[#fdf8f1] px-6 py-8 sm:px-10 lg:px-14 lg:py-10">
      {/* subtle warm wash */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(700px 400px at 100% 0%, rgba(251, 191, 36, 0.10), transparent 60%), radial-gradient(500px 300px at 0% 100%, rgba(244, 63, 94, 0.06), transparent 60%)',
        }}
      />

      {/* mobile wordmark (left panel hidden on small screens) */}
      <div className="relative z-10 mb-10 flex items-center justify-between lg:hidden">
        <Wordmark tone="dark" />
      </div>

      {/* top-right meta on large screens */}
      <div className="relative z-10 hidden items-center justify-end gap-3 text-xs text-zinc-500 lg:flex">
        <span>New restaurant?</span>
        <a
          href="mailto:hello@bhookly.com"
          className="font-semibold text-orange-600 hover:text-orange-700"
        >
          Talk to our team →
        </a>
      </div>

      <div className="relative z-10 flex flex-1 items-center justify-center">
        <div className="w-full max-w-[420px]">
          {/* heading */}
          <div className="mb-8">
            <h2 className="bhk-serif text-[44px] leading-[1.05] text-[#1a1410]">
              Welcome back.
            </h2>
            <p className="mt-2 text-sm text-zinc-600">
              Sign in to your station — or jump in with a demo role below.
            </p>
          </div>

          {/* form */}
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Username or email">
              <div className="bhk-input flex h-12 items-center rounded-xl px-3.5">
                <UserIcon className="mr-2.5 h-4 w-4 text-zinc-400" />
                <Input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData((p) => ({ ...p, username: e.target.value }))}
                  className="h-full border-0 bg-transparent px-0 text-[15px] shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  autoComplete="username"
                  placeholder="e.g. server1 or you@restaurant.com"
                  disabled={isPending}
                />
              </div>
            </Field>

            <Field
              label="Password"
              right={
                <Link
                  to="/forgot-password"
                  className="text-xs font-medium text-zinc-400 hover:text-orange-600"
                  tabIndex={-1}
                >
                  Forgot?
                </Link>
              }
            >
              <div className="bhk-input flex h-12 items-center rounded-xl px-3.5">
                <Lock className="mr-2.5 h-4 w-4 text-zinc-400" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData((p) => ({ ...p, password: e.target.value }))}
                  className="h-full border-0 bg-transparent px-0 text-[15px] shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  disabled={isPending}
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
            </Field>

            {error && (
              <div className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50/70 px-3.5 py-2.5 text-[13px] text-rose-800">
                <span className="mt-0.5 grid h-4 w-4 flex-shrink-0 place-items-center rounded-full bg-rose-500 text-white text-[10px] font-bold">
                  !
                </span>
                <div>
                  <div className="font-semibold">Couldn't sign you in</div>
                  <div className="text-rose-700/80">{error}</div>
                </div>
              </div>
            )}

            <Button
              type="submit"
              className="bhk-cta group h-12 w-full rounded-xl border-0 text-[15px] font-semibold tracking-tight text-white"
              disabled={isPending}
            >
              {isPending ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing you in…
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  Sign in to Bhookly
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              )}
            </Button>
          </form>

          {/* divider */}
          <div className="my-7 flex items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-300 to-transparent" />
            One-click demo
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-300 to-transparent" />
          </div>

          {/* demo chips — single grid, no nested headings */}
          <div className="grid grid-cols-3 gap-2.5">
            {DEMO_ACCOUNTS.map((account) => {
              const Icon = account.icon
              const isActive = activeDemo === account.username && isPending
              return (
                <button
                  key={account.username}
                  type="button"
                  onClick={() => onUseDemo(account)}
                  disabled={isPending}
                  data-active={isActive}
                  className="bhk-chip group relative flex flex-col items-start gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-3 text-left disabled:cursor-wait disabled:opacity-70"
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-50 text-amber-700 ring-1 ring-amber-100 transition-colors group-hover:bg-orange-100 group-hover:text-orange-700">
                      {isActive ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-400">{account.username}</span>
                  </div>
                  <div className="text-[13px] font-semibold text-[#1a1410]">{account.role}</div>
                  <div className="text-[11px] text-zinc-500">{account.blurb}</div>
                </button>
              )
            })}
          </div>

          <p className="mt-5 text-center text-[11px] text-zinc-400">
            Demo accounts use password <span className="font-mono text-zinc-500">admin123</span>.
            One click signs you straight in.
          </p>
        </div>
      </div>

      {/* footer (mobile) */}
      <div className="relative z-10 mt-8 flex items-center justify-center text-[11px] text-zinc-400 lg:hidden">
        <FooterCredit tone="dark" />
      </div>
    </section>
  )
}

function Field({
  label,
  right,
  children,
}: {
  label: string
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
          {label}
        </span>
        {right}
      </div>
      {children}
    </label>
  )
}
