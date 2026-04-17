import type { ExpenseCategory } from '@/types'

export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string; color: string }[] = [
  { value: 'inventory_purchase', label: 'Inventory Purchase', color: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200' },
  { value: 'utilities', label: 'Utilities', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200' },
  { value: 'rent', label: 'Rent', color: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200' },
  { value: 'salaries', label: 'Salaries', color: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200' },
  { value: 'maintenance', label: 'Maintenance', color: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200' },
  { value: 'marketing', label: 'Marketing', color: 'bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-200' },
  { value: 'supplies', label: 'Supplies', color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200' },
  { value: 'other', label: 'Other', color: 'bg-muted text-muted-foreground' },
]

export function getCategoryBadge(cat: string) {
  const found = EXPENSE_CATEGORIES.find(c => c.value === cat)
  return found || { label: cat, color: 'bg-muted text-muted-foreground' }
}

export function formatLocalYMD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
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

// Phase 2+ (deferred): DB-backed custom expense categories, store_manager / scoped RBAC, budgets & alerts,
// receipt attachments, accounting-system export — see product plan.
