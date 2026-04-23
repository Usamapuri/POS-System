import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import apiClient from '@/api/client'
import type { CounterOrderType } from '@/components/counter/counterOrderTypes'

/**
 * Shape persisted under app_settings.enabled_order_types. Matches the shape
 * written by AdminSettings.tsx and read by KOTServerInterface.tsx so all three
 * call sites stay compatible.
 */
export interface OrderTypeConfig {
  id: string
  label: string
  enabled: boolean
  include_service_charge?: boolean
  delivery_fee?: number
}

/** The three built-in counter order types. Custom types (e.g. foodpanda) are
 * ignored by this hook because the Counter UI's hardcoded toggle only renders
 * these three. Custom-type support is a separate concern. */
const BUILT_IN_COUNTER_TYPES: readonly CounterOrderType[] = ['dine_in', 'takeout', 'delivery'] as const
const ALL_ENABLED: ReadonlySet<CounterOrderType> = new Set(BUILT_IN_COUNTER_TYPES)

/** Resolves per-type service and delivery defaults (aligned with backend order_types_guard). */
export function getOrderTypePricing(
  type: CounterOrderType,
  raw: OrderTypeConfig[]
): { includeServiceCharge: boolean; deliveryFee: number } {
  const row = raw.find((r) => r.id === type)
  const includeServiceCharge = row ? row.include_service_charge !== false : true
  const deliveryFee =
    type === 'delivery' && row && typeof row.delivery_fee === 'number' && !Number.isNaN(row.delivery_fee)
      ? Math.max(0, row.delivery_fee)
      : 0
  return { includeServiceCharge, deliveryFee }
}

export interface UseEnabledOrderTypesResult {
  /**
   * Set of built-in counter order types that are currently enabled.
   * - Missing setting, fetch error, or malformed JSON falls back to "all enabled"
   *   so a broken settings table never wedges the POS.
   * - Unknown ids in the setting (e.g. custom "foodpanda") are ignored here.
   */
  enabledIds: ReadonlySet<CounterOrderType>
  /** True while the initial fetch is in flight. Safe to ignore in most UIs
   *  because the fallback (all enabled) already renders a sensible default. */
  isLoading: boolean
  /** Full config list as persisted (including non-built-in ids), for callers
   *  that need custom-type labels. Built-in callers can ignore this. */
  raw: OrderTypeConfig[]
}

/**
 * React Query hook that exposes which of the built-in counter order types
 * (dine_in, takeout, delivery) are currently enabled in Admin Settings.
 *
 * Cache key matches AdminSettings and KOTServerInterface so all three share
 * the same query cache and invalidation (via queryClient.invalidateQueries
 * on ['settings', 'enabled_order_types']).
 */
export function useEnabledOrderTypes(): UseEnabledOrderTypesResult {
  const { data, isLoading } = useQuery<OrderTypeConfig[]>({
    queryKey: ['settings', 'enabled_order_types'],
    queryFn: async () => {
      try {
        const res = await apiClient.getSetting('enabled_order_types')
        if (res.success && Array.isArray(res.data)) {
          return res.data as OrderTypeConfig[]
        }
      } catch {
        // Swallow network / parse errors; the fallback below keeps the POS usable.
      }
      return []
    },
  })

  const enabledIds = useMemo<ReadonlySet<CounterOrderType>>(() => {
    if (!data || data.length === 0) return ALL_ENABLED
    const s = new Set<CounterOrderType>()
    for (const row of data) {
      if (!row || !row.enabled) continue
      if ((BUILT_IN_COUNTER_TYPES as readonly string[]).includes(row.id)) {
        s.add(row.id as CounterOrderType)
      }
    }
    // If the setting exists but filters out every built-in type, honor that
    // (operator intent). Empty set is a valid state that the UI handles.
    return s
  }, [data])

  return {
    enabledIds,
    isLoading,
    raw: data ?? [],
  }
}
