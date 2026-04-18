/**
 * Central read for the four `kitchen.*` app_settings that drive KDS behavior:
 *   - kitchen.mode                (kds | kot_only | hybrid)
 *   - kitchen.urgency_minutes
 *   - kitchen.stale_minutes
 *   - kitchen.recall_window_seconds
 *
 * All components should read from this hook rather than rolling their own
 * parse, so mode changes land everywhere consistently (nav, KDS, fire flow).
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import apiClient from '@/api/client'

export type KitchenMode = 'kds' | 'kot_only' | 'hybrid'

export interface KitchenSettings {
  mode: KitchenMode
  urgencyMinutes: number
  staleMinutes: number
  recallWindowSeconds: number
  /** True while the initial fetch is in flight — UI should avoid committing yet. */
  isLoading: boolean
}

export const KITCHEN_SETTINGS_DEFAULTS: Omit<KitchenSettings, 'isLoading'> = {
  mode: 'kds',
  urgencyMinutes: 15,
  staleMinutes: 120,
  recallWindowSeconds: 300,
}

function parseMode(v: unknown): KitchenMode | undefined {
  if (typeof v !== 'string') return undefined
  const s = v.trim().toLowerCase()
  if (s === 'kds' || s === 'kot_only' || s === 'hybrid') return s
  return undefined
}

function parseNumber(v: unknown, fallback: number, lo: number, hi: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(hi, Math.max(lo, Math.round(n)))
}

/**
 * Shared React Query cache key — deliberately the SAME key the rest of the
 * app uses for `getAllSettings()` so any admin save (receipt, financial,
 * kitchen, order-types, appearance) invalidates this hook too and every
 * consumer re-renders in lockstep.
 */
export const KITCHEN_SETTINGS_QUERY_KEY = ['settings', 'all'] as const

export function useKitchenSettings(): KitchenSettings {
  const { data, isLoading } = useQuery({
    queryKey: KITCHEN_SETTINGS_QUERY_KEY,
    queryFn: () => apiClient.getAllSettings(),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  })

  return useMemo<KitchenSettings>(() => {
    const raw = (data?.data as Record<string, unknown> | undefined) ?? {}
    return {
      mode: parseMode(raw['kitchen.mode']) ?? KITCHEN_SETTINGS_DEFAULTS.mode,
      urgencyMinutes: parseNumber(raw['kitchen.urgency_minutes'], KITCHEN_SETTINGS_DEFAULTS.urgencyMinutes, 1, 240),
      staleMinutes: parseNumber(raw['kitchen.stale_minutes'], KITCHEN_SETTINGS_DEFAULTS.staleMinutes, 15, 1440),
      recallWindowSeconds: parseNumber(
        raw['kitchen.recall_window_seconds'],
        KITCHEN_SETTINGS_DEFAULTS.recallWindowSeconds,
        0,
        3600,
      ),
      isLoading,
    }
  }, [data, isLoading])
}

/** Convenience — `/kitchen` nav visibility and screen access. */
export function isKDSEnabled(mode: KitchenMode): boolean {
  return mode === 'kds' || mode === 'hybrid'
}
