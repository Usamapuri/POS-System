import { createFileRoute } from '@tanstack/react-router'
import { VoidLog } from '@/components/admin/VoidLog'

export const Route = createFileRoute('/admin/void-log')({
  component: VoidLog,
})
