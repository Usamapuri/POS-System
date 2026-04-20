/** Canonical staff roles stored in users.role (JWT + localStorage). */
export const STAFF_ROLES = ['admin', 'inventory_manager', 'counter', 'kitchen'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

export function isStaffRole(role: string): role is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(role)
}

const ROLE_ADMIN_PATHS: Record<StaffRole, string[] | null> = {
  admin: null,
  inventory_manager: ['/admin/inventory'],
  counter: ['/admin/counter', '/admin/server', '/admin/menu', '/admin/tables'],
  kitchen: ['/admin/kitchen', '/admin/stations'],
}

/** First screen after login for each role. */
export function defaultAdminPath(role: string): string {
  switch (role) {
    case 'admin':
      return '/admin/dashboard'
    case 'inventory_manager':
      return '/admin/inventory'
    case 'counter':
      return '/admin/counter'
    case 'kitchen':
      return '/admin/kitchen'
    default:
      return '/admin/dashboard'
  }
}

/** Whether this role may open the given /admin/* URL (exact prefix match). */
export function canAccessAdminRoute(role: string, pathname: string): boolean {
  if (!pathname.startsWith('/admin')) return false
  if (role === 'admin') return true
  const prefixes = ROLE_ADMIN_PATHS[role as StaffRole]
  if (!prefixes) return false
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/** Sidebar section ids visible for the role; null means all (admin). */
export function navSectionIdsForRole(role: string): Set<string> | null {
  if (role === 'admin') return null
  if (role === 'inventory_manager') return new Set(['inventory'])
  if (role === 'counter') return new Set(['counter', 'server', 'menu', 'tables'])
  if (role === 'kitchen') return new Set(['kitchen', 'stations'])
  return new Set()
}

export function staffRoleLabel(role: string): string {
  switch (role) {
    case 'inventory_manager':
      return 'Inventory'
    case 'counter':
      return 'Counter'
    case 'kitchen':
      return 'Kitchen'
    case 'admin':
      return 'Admin'
    default:
      return role
  }
}
