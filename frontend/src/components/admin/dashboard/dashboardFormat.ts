import { formatMoney, getDisplayCurrency } from '@/lib/currency'

// ────────────────────────────────────────────────────────────────────────────
// Tiny number / time helpers shared across the dashboard widgets. Kept in a
// separate file (rather than inside utils.ts) so the dashboard can evolve
// independently of the rest of the codebase.
// ────────────────────────────────────────────────────────────────────────────

const inrLakhs = new Set(['INR', 'PKR'])

/**
 * Compact currency for KPI tiles. Uses the Indian/PK lakh-crore scale for
 * INR/PKR and the Western K/M/B scale for everything else. Falls back to
 * the full formatter for amounts under 10,000 — those are short enough to
 * read at a glance and look weird when truncated.
 */
export function compactCurrency(amount: number, currencyCode?: string): string {
  const code = currencyCode ?? getDisplayCurrency()
  const abs = Math.abs(amount)
  if (abs < 10_000) return formatMoney(amount, code)

  const sign = amount < 0 ? '-' : ''
  const symbol = currencySymbolFor(code)

  if (inrLakhs.has(code)) {
    if (abs >= 1e7) return `${sign}${symbol} ${(abs / 1e7).toFixed(2)}Cr`
    if (abs >= 1e5) return `${sign}${symbol} ${(abs / 1e5).toFixed(2)}L`
  }
  if (abs >= 1e9) return `${sign}${symbol} ${(abs / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}${symbol} ${(abs / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${sign}${symbol} ${(abs / 1e3).toFixed(2)}K`
  return formatMoney(amount, code)
}

function currencySymbolFor(code: string): string {
  switch (code) {
    case 'PKR':
      return 'Rs'
    case 'INR':
      return '₹'
    case 'USD':
      return '$'
    case 'EUR':
      return '€'
    case 'GBP':
      return '£'
    default:
      return code
  }
}

/** Pretty-prints an integer with locale separators. */
export function formatCount(n: number): string {
  return new Intl.NumberFormat().format(n)
}

/** "5m 12s" / "1h 03m" — used by the kitchen-wait pulse card. */
export function formatDurationSeconds(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '0s'
  const s = Math.floor(totalSeconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`
  return `${sec}s`
}

/**
 * Render a percent change for a KPI tile. Returns `null` when the previous
 * value was 0 — the UI should show "—" rather than a misleading "+∞%".
 */
export function formatTrendPercent(pct: number | null | undefined): string | null {
  if (pct == null || !Number.isFinite(pct)) return null
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

export type TrendDirection = 'up' | 'down' | 'flat' | 'unknown'

/**
 * "good" trend direction taking the metric's polarity into account.
 *   - For most metrics, up = good (revenue, orders).
 *   - For "negative" metrics (expenses, voids), up = bad.
 */
export function trendDirection(
  pct: number | null | undefined,
  polarity: 'positive' | 'negative' = 'positive',
): TrendDirection {
  if (pct == null || !Number.isFinite(pct)) return 'unknown'
  if (Math.abs(pct) < 0.1) return 'flat'
  const isUp = pct > 0
  if (polarity === 'positive') return isUp ? 'up' : 'down'
  return isUp ? 'down' : 'up'
}
