import {
  DEFAULT_DISPLAY_CURRENCY,
  formatMoney as formatMoneyCore,
  parseCurrencyFromSettings as parseCurrencyRaw,
} from './currency'

export const DEFAULT_CURRENCY = DEFAULT_DISPLAY_CURRENCY as const

export type SupportedCurrency = 'USD' | 'EUR' | 'GBP' | 'PKR'

const SUPPORTED = new Set<string>(['USD', 'EUR', 'GBP', 'PKR'])

/** Non-null currency code for settings + CurrencyContext (defaults to PKR). */
export function parseCurrencyFromSettings(raw: unknown): SupportedCurrency {
  const v = parseCurrencyRaw(raw)
  if (v && SUPPORTED.has(v)) return v as SupportedCurrency
  return 'PKR'
}

/** Prefix for price inputs; aligns with `getCurrencySymbolPrefix` in currency.ts. */
export function currencyInputPrefix(code: string): string {
  const c = parseCurrencyFromSettings(code)
  switch (c) {
    case 'PKR':
      return 'Rs.'
    case 'EUR':
      return '€'
    case 'GBP':
      return '£'
    default:
      return '$'
  }
}

export function formatMoney(amount: number, currencyCode: string = DEFAULT_CURRENCY): string {
  return formatMoneyCore(amount, currencyCode)
}
