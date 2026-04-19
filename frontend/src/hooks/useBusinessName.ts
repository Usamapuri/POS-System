import { useQuery } from '@tanstack/react-query'
import apiClient from '@/api/client'

/**
 * Returns the venue's display name from Admin → Settings.
 *
 * Lookup order (mirrors the backend's `reportsBrand` helper in
 * backend/internal/handlers/reports.go):
 *   1. `restaurant_name` (General → Restaurant Name — drives in-app surfaces)
 *   2. `receipt_business_name` (Receipt & Printing — older installs)
 *   3. `null` if neither is set, so callers can pick their own UI copy
 *      ("Restaurant POS" vs "Sales, items, tables and more" vs whatever).
 *
 * Cache key matches AdminSidebar / ReportsShell so all callers share the
 * same React Query entry — switching restaurants (in dev) invalidates once
 * and propagates everywhere.
 */
export function useBusinessName(): string | null {
  const { data: settingsRes } = useQuery({
    queryKey: ['settings', 'all'],
    queryFn: () => apiClient.getAllSettings(),
    staleTime: 1000 * 60 * 5,
  })
  const raw = settingsRes?.data as Record<string, unknown> | undefined
  const restaurantName = (raw?.restaurant_name as string | undefined)?.trim()
  const receiptName = (raw?.receipt_business_name as string | undefined)?.trim()
  return restaurantName || receiptName || null
}

/**
 * Convenience wrapper for surfaces that need a guaranteed non-empty string
 * (PDF footers, CSV headers). Use the raw `useBusinessName` hook when you
 * want to detect the "unset" state and render different copy.
 */
export function useBusinessNameWithFallback(fallback = 'Restaurant POS'): string {
  return useBusinessName() ?? fallback
}
