import { createFileRoute } from '@tanstack/react-router'
import { AdminFiscalAudit } from '@/components/admin/AdminFiscalAudit'

export const Route = createFileRoute('/admin/fiscal-audit')({
  component: () => <AdminFiscalAudit />,
})
