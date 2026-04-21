/** Shared demo credentials (seeded by database/init/02_seed_data.sql). */
export const DEMO_LOGIN_PASSWORD = 'admin123'

export type DemoAccount = {
  username: string
  role: string
  desc: string
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { username: 'server1', role: 'Server', desc: 'Table service & dine-in' },
  { username: 'counter1', role: 'Counter', desc: 'Payments & all order types' },
  { username: 'admin', role: 'Admin', desc: 'Full system access' },
  { username: 'manager1', role: 'Manager', desc: 'Management & reports' },
  { username: 'kitchen1', role: 'Kitchen', desc: 'Kitchen display' },
  { username: 'store1', role: 'Store', desc: 'Inventory & supplies' },
]

export function showDemoLoginUi(): boolean {
  return import.meta.env.VITE_HIDE_DEMO_LOGINS !== 'true'
}
