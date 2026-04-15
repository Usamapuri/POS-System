import { createFileRoute } from '@tanstack/react-router'
import { KOTServerInterface } from '@/components/server/KOTServerInterface'

export const Route = createFileRoute('/admin/server')({
  component: KOTServerInterface,
})
