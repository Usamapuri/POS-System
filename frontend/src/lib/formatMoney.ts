export const DEFAULT_CURRENCY = 'PKR' as const

export type SupportedCurrency = 'USD' | 'EUR' | 'GBP' | 'PKR'

const SUPPORTED: ReadonlySet<string> = new Set(['USD', 'EUR', 'GBP', 'PKR'])

export function parseCurrencyFromSettings(raw: unknown): SupportedCurrency {
  if (typeof raw !== 'string' || !SUPPORTED.has(raw)) {
    return 'PKR'
  }
  return raw as SupportedCurrency
}

/** Short prefix for price inputs (PKR shown as RS per product requirement). */
export function currencyInputPrefix(code: string): string {
  switch (parseCurrencyFromSettings(code)) {
    case 'PKR':
      return 'RS'
    case 'EUR':
      return '€'
    case 'GBP':
      return '£'
    default:
      return '$'
  }
}

export function formatMoney(amount: number, currencyCode: string = DEFAULT_CURRENCY): string {
  const code = parseCurrencyFromSettings(currencyCode)

  if (code === 'PKR') {
    const num = new Intl.NumberFormat('en-PK', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
    return `RS ${num}`
  }

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
    }).format(amount)
  } catch {
    return `RS ${new Intl.NumberFormat('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`
  }
}
