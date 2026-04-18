import type { ExpenseCategoryDefinition } from '@/types'
import { formatDateTimeDDMMYYYY } from '@/lib/utils'

/** Fallback labels when category definitions have not loaded yet. */
export const EXPENSE_CATEGORIES: { value: string; label: string; color: string }[] = [
  { value: 'inventory_purchase', label: 'Inventory Purchase', color: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200' },
  { value: 'utilities', label: 'Utilities', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200' },
  { value: 'rent', label: 'Rent', color: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200' },
  { value: 'salaries', label: 'Salaries', color: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200' },
  { value: 'maintenance', label: 'Maintenance', color: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200' },
  { value: 'marketing', label: 'Marketing', color: 'bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-200' },
  { value: 'supplies', label: 'Supplies', color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200' },
  { value: 'other', label: 'Other', color: 'bg-muted text-muted-foreground' },
]

export function getCategoryBadge(cat: string, defs?: ExpenseCategoryDefinition[] | null) {
  if (defs && defs.length > 0) {
    const hit = defs.find(d => d.slug === cat)
    if (hit) return { label: hit.label, color: hit.color }
  }
  const found = EXPENSE_CATEGORIES.find(c => c.value === cat)
  return found || { label: cat, color: 'bg-muted text-muted-foreground' }
}

export function formatLocalYMD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** `datetime-local` value (local) from an API ISO timestamp or YYYY-MM-DD. */
export function toDatetimeLocalValue(iso?: string | null, ymd?: string | null): string {
  let d: Date
  if (iso && iso.trim() !== '') {
    d = new Date(iso)
  } else if (ymd && ymd.trim() !== '') {
    d = new Date(`${ymd.trim()}T12:00`)
  } else {
    d = new Date()
  }
  if (Number.isNaN(d.getTime())) {
    d = new Date()
  }
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${mo}-${day}T${h}:${mi}`
}

export function datetimeLocalToRecordedAtIso(localStr: string): string {
  const d = new Date(localStr)
  return d.toISOString()
}

/** Human-readable local date and time with a space between date and time (for ledger). */
export function formatRecordedAtForLedger(recordedAt?: string | null, expenseDateFallback?: string): string {
  const iso = recordedAt && recordedAt.trim() !== '' ? recordedAt : null
  let d: Date
  if (iso) {
    d = new Date(iso)
  } else if (expenseDateFallback && expenseDateFallback.trim() !== '') {
    d = new Date(`${expenseDateFallback.trim()}T12:00:00`)
  } else {
    return '—'
  }
  if (Number.isNaN(d.getTime())) return expenseDateFallback || '—'
  return formatDateTimeDDMMYYYY(d)
}

export function getMonthToDateRange(): { from: string; to: string } {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  return { from: formatLocalYMD(first), to: formatLocalYMD(now) }
}

/** Inclusive calendar range ending today (local), spanning `days` days (e.g. 7 = today and prior 6). */
export function getLastNDaysInclusive(days: number): { from: string; to: string } {
  const to = new Date()
  const from = new Date(to.getFullYear(), to.getMonth(), to.getDate() - (days - 1))
  return { from: formatLocalYMD(from), to: formatLocalYMD(to) }
}
