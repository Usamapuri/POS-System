import { createFileRoute } from '@tanstack/react-router'
import { StoreInventoryDashboard } from '@/components/store/StoreInventoryDashboard'

export const Route = createFileRoute('/admin/inventory')({
  component: StoreInventoryDashboard,
})
