import type { PricingSettings } from '@/types'

const DEFAULTS: PricingSettings = {
  tax_rate_cash: 0.15,
  tax_rate_card: 0.05,
  tax_rate_online: 0.15,
  service_charge_rate: 0.1,
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function mergePricingSettings(p?: Partial<PricingSettings> | null): PricingSettings {
  return {
    tax_rate_cash: p?.tax_rate_cash ?? DEFAULTS.tax_rate_cash,
    tax_rate_card: p?.tax_rate_card ?? DEFAULTS.tax_rate_card,
    tax_rate_online: p?.tax_rate_online ?? DEFAULTS.tax_rate_online,
    service_charge_rate: p?.service_charge_rate ?? DEFAULTS.service_charge_rate,
  }
}

export function computeCartTotals(
  subtotal: number,
  discount: number,
  intent: 'cash' | 'card' | 'online',
  p: PricingSettings
) {
  const taxable = Math.max(0, subtotal - discount)
  const service = round2(taxable * p.service_charge_rate)
  const tr =
    intent === 'card' ? p.tax_rate_card : intent === 'online' ? p.tax_rate_online : p.tax_rate_cash
  const tax = round2(taxable * tr)
  const total = round2(taxable + service + tax)
  // `taxRate` and `serviceRate` are returned as fractions (0.15 == 15%) so
  // the caller can render a consistent "Sales Tax (15%)" / "Service Charges
  // (10%)" label alongside the money amount.
  return { taxable, service, tax, total, taxRate: tr, serviceRate: p.service_charge_rate }
}
