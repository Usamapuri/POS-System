import { createFileRoute } from '@tanstack/react-router'
import { ExpenseDashboard } from '@/components/admin/ExpenseDashboard'

export const Route = createFileRoute('/admin/expenses')({
  component: ExpenseDashboard,
})
