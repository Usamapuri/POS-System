import { createFileRoute } from '@tanstack/react-router'
import { StationManagement } from '@/components/admin/StationManagement'

export const Route = createFileRoute('/admin/stations')({
  component: StationManagement,
})
