import { useQuery } from '@tanstack/react-query'
import apiClient from '@/api/client'
import type { APIResponse, ExpenseCategoryDefinition } from '@/types'

export function useExpenseCategoryDefs(enabled = true) {
  return useQuery({
    queryKey: ['expenseCategoryDefs'] as const,
    queryFn: () => apiClient.getExpenseCategoryDefinitions(),
    enabled,
    staleTime: 60_000,
    select: (res: APIResponse<ExpenseCategoryDefinition[]>) => res.data ?? [],
  })
}
