import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format as formatDateFns, parse as parseDateFns, isValid as isValidDateFns } from 'date-fns'
import { formatMoney } from '@/lib/currency'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Formats amounts using the active display currency (localStorage + Admin settings). */
export function formatCurrency(amount: number): string {
  return formatMoney(amount)
}

// ---------------------------------------------------------------------------
// Date formatting — DD-MM-YYYY everywhere a human reads a date.
//
// The user has mandated DD-MM-YYYY across the entire UI. To make this safe
// and uniform, every date helper here renders day-month-year. ISO YYYY-MM-DD
// is reserved for the wire (API params, URL state, JSON) where a sortable,
// unambiguous format is necessary; use `toIsoDate(...)` for that case.
// ---------------------------------------------------------------------------

function toDate(input: Date | string | number | null | undefined): Date | null {
  if (input == null) return null
  if (input instanceof Date) return isValidDateFns(input) ? input : null
  const d = new Date(input)
  return isValidDateFns(d) ? d : null
}

/** DD-MM-YYYY (e.g. "18-04-2026"). Returns "—" for invalid input. */
export function formatDateDDMMYYYY(input: Date | string | number | null | undefined): string {
  const d = toDate(input)
  return d ? formatDateFns(d, 'dd-MM-yyyy') : '—'
}

/** DD-MM-YYYY HH:mm (24h, e.g. "18-04-2026 21:45"). Returns "—" for invalid input. */
export function formatDateTimeDDMMYYYY(input: Date | string | number | null | undefined): string {
  const d = toDate(input)
  return d ? formatDateFns(d, 'dd-MM-yyyy HH:mm') : '—'
}

/**
 * Parses a DD-MM-YYYY string into a Date. Returns null when the string is
 * empty, malformed, or represents an invalid calendar date.
 */
export function parseDDMMYYYY(input: string | null | undefined): Date | null {
  if (!input) return null
  const trimmed = input.trim()
  if (trimmed === '') return null
  const parsed = parseDateFns(trimmed, 'dd-MM-yyyy', new Date())
  return isValidDateFns(parsed) ? parsed : null
}

/** Serializes a Date as ISO YYYY-MM-DD for use in API params / URL state. */
export function toIsoDate(input: Date | string | number | null | undefined): string {
  const d = toDate(input)
  return d ? formatDateFns(d, 'yyyy-MM-dd') : ''
}

/**
 * Backwards-compatible: legacy callers pass an ISO timestamp string and
 * expect a "date + time" label. Now returns DD-MM-YYYY HH:mm.
 */
export function formatDate(dateString: string): string {
  return formatDateTimeDDMMYYYY(dateString)
}

/** HH:mm (24h). Kept for compatibility with existing callers. */
export function formatTime(dateString: string): string {
  const d = toDate(dateString)
  return d ? formatDateFns(d, 'HH:mm') : '—'
}

export function getOrderStatusColor(status: string): string {
  switch (status) {
    case 'pending':
      return 'bg-yellow-100 text-yellow-800'
    case 'confirmed':
      return 'bg-blue-100 text-blue-800'
    case 'preparing':
      return 'bg-orange-100 text-orange-800'
    case 'ready':
      return 'bg-green-100 text-green-800'
    case 'served':
      return 'bg-indigo-100 text-indigo-800'
    case 'completed':
      return 'bg-green-100 text-green-800'
    case 'cancelled':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

export function getPaymentStatusColor(status: string): string {
  switch (status) {
    case 'pending':
      return 'bg-yellow-100 text-yellow-800'
    case 'completed':
      return 'bg-green-100 text-green-800'
    case 'failed':
      return 'bg-red-100 text-red-800'
    case 'refunded':
      return 'bg-purple-100 text-purple-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

export function calculateOrderTotals(items: Array<{ quantity: number; unit_price?: number; price?: number }>) {
  const subtotal = items.reduce((sum, item) => {
    const price = item.unit_price || item.price || 0
    return sum + (item.quantity * price)
  }, 0)
  
  const taxRate = 0.10 // 10% tax
  const taxAmount = subtotal * taxRate
  const totalAmount = subtotal + taxAmount
  
  return {
    subtotal,
    taxAmount,
    totalAmount,
  }
}

export function getPreparationTimeDisplay(minutes: number): string {
  if (minutes === 0) return 'No prep time'
  if (minutes < 60) return `${minutes}m`
  
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  
  if (remainingMinutes === 0) return `${hours}h`
  return `${hours}h ${remainingMinutes}m`
}

export function generateOrderNumber(): string {
  const timestamp = Date.now()
  const random = Math.floor(Math.random() * 1000)
  return `ORD${timestamp}${random}`.slice(-10)
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

