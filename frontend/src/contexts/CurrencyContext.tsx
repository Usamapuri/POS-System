import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import apiClient from '@/api/client'
import {
  DEFAULT_CURRENCY,
  formatMoney,
  parseCurrencyFromSettings,
  type SupportedCurrency,
} from '@/lib/formatMoney'

type CurrencyContextValue = {
  currencyCode: SupportedCurrency
  formatCurrency: (amount: number) => string
  isLoading: boolean
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null)

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { data: res, isLoading } = useQuery({
    queryKey: ['settings', 'all'],
    queryFn: () => apiClient.getAllSettings(),
    staleTime: 1000 * 60 * 5,
    // Avoid auth/redirect loops: settings are protected; only fetch once authenticated.
    enabled: apiClient.isAuthenticated(),
    retry: false,
  })

  const settingsMap =
    res && typeof res === 'object' && 'success' in res && res.success && 'data' in res && res.data
      ? (res.data as Record<string, unknown>)
      : {}

  const currencyCode = parseCurrencyFromSettings(settingsMap.currency)

  const formatCurrency = useCallback(
    (amount: number) => formatMoney(amount, currencyCode),
    [currencyCode],
  )

  const value = useMemo<CurrencyContextValue>(
    () => ({
      currencyCode,
      formatCurrency,
      isLoading,
    }),
    [currencyCode, formatCurrency, isLoading],
  )

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
}

export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext)
  if (!ctx) {
    return {
      currencyCode: DEFAULT_CURRENCY,
      formatCurrency: (amount: number) => formatMoney(amount, DEFAULT_CURRENCY),
      isLoading: false,
    }
  }
  return ctx
}
