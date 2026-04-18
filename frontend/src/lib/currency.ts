/** ISO 4217 codes supported for display; PKR is the product default for this deployment. */
export const DEFAULT_DISPLAY_CURRENCY = 'PKR'

export const DISPLAY_CURRENCY_STORAGE_KEY = 'pos_display_currency'

export const DISPLAY_CURRENCY_EVENT = 'pos-currency-changed'

const ALLOWED = new Set(['PKR', 'USD', 'EUR', 'GBP'])

export function isDisplayCurrencyCode(code: string): boolean {
  return ALLOWED.has(code)
}

export function getDisplayCurrency(): string {
  if (typeof window === 'undefined') return DEFAULT_DISPLAY_CURRENCY
  try {
    const v = localStorage.getItem(DISPLAY_CURRENCY_STORAGE_KEY)
    if (v && ALLOWED.has(v)) return v
  } catch {
    /* ignore */
  }
  return DEFAULT_DISPLAY_CURRENCY
}

export function setDisplayCurrency(code: string): void {
  if (!ALLOWED.has(code)) return
  try {
    localStorage.setItem(DISPLAY_CURRENCY_STORAGE_KEY, code)
    window.dispatchEvent(new CustomEvent(DISPLAY_CURRENCY_EVENT))
  } catch {
    /* ignore */
  }
}

/** Parse `currency` value from GET /settings map (JSON string in DB). */
export function parseCurrencyFromSettings(raw: unknown): string | null {
  if (typeof raw === 'string' && ALLOWED.has(raw)) return raw
  return null
}

function localeForCurrency(code: string): string {
  switch (code) {
    case 'PKR':
      return 'en-PK'
    case 'GBP':
      return 'en-GB'
    case 'EUR':
      return 'en-DE'
    case 'USD':
    default:
      return 'en-US'
  }
}

export function formatMoney(amount: number, currencyCode?: string): string {
  const code = currencyCode ?? getDisplayCurrency()
  return new Intl.NumberFormat(localeForCurrency(code), {
    style: 'currency',
    currency: code,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

/**
 * Format a money amount as a bare number (e.g. "852.15", "1,000") using the
 * same locale and decimal rules as `formatMoney` — but without the currency
 * symbol or code. Useful inside dense tables (e.g. the printed receipt's
 * items table) where the currency is already implied by surrounding totals
 * and repeating "Rs" on every row adds visual clutter.
 */
export function formatMoneyPlain(amount: number, currencyCode?: string): string {
  const code = currencyCode ?? getDisplayCurrency()
  return new Intl.NumberFormat(localeForCurrency(code), {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

/** Short prefix for price inputs (matches active ISO currency). */
export function getCurrencySymbolPrefix(): string {
  switch (getDisplayCurrency()) {
    case 'PKR':
      return 'Rs.'
    case 'USD':
      return '$'
    case 'EUR':
      return '€'
    case 'GBP':
      return '£'
    default:
      return 'Rs.'
  }
}
