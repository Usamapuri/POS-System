import { ReportsShell } from '@/components/admin/reports/ReportsShell'

/**
 * Reports & Analytics page entry point. The implementation lives in
 * `components/admin/reports/ReportsShell` and its sibling tab files —
 * keeping this entry slim makes the admin sidebar wiring trivial and
 * preserves the legacy import path used by AdminLayout / the route file.
 */
export function AdminReports() {
  return <ReportsShell />
}

export default AdminReports
