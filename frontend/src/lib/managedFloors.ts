/**
 * Floors shown in Manage Tables, Server (KOT), and Counter should match:
 * `managed_floors` setting merged with any table.location values (orphans).
 */

export function mergeFloorList(settingList: string[], tableLocations: string[]): string[] {
  const merged = Array.from(
    new Set([...settingList, ...tableLocations].map((s) => s.trim()).filter(Boolean))
  )
  merged.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  return merged.length ? merged : ['General']
}

export function parseManagedFloorsSetting(settingData: unknown): string[] {
  if (!Array.isArray(settingData)) return []
  return settingData.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
}

export function buildFloorTabs(settingData: unknown, tableLocations: string[]): string[] {
  return mergeFloorList(parseManagedFloorsSetting(settingData), tableLocations)
}
