/** Grid used by floor layout drag + dimension snapping */
export const MAP_GRID = 8

export const MAP_W_MIN = 64
export const MAP_W_MAX = 300
export const MAP_H_MIN = 52
export const MAP_H_MAX = 200

export type MapShape = 'rectangle' | 'square' | 'round'

export function snapMapToGrid(value: number, grid: number = MAP_GRID): number {
  return Math.max(grid, Math.round(value / grid) * grid)
}

/**
 * Suggested footprint (px) from seat count and shape. Monotonic in seats for rectangles;
 * square/round use a single side length.
 */
export function suggestMapDimensions(
  seats: number,
  shape: MapShape,
  grid: number = MAP_GRID
): { map_w: number; map_h: number } {
  const s = Math.max(1, Math.min(20, Math.round(seats) || 1))

  if (shape === 'square' || shape === 'round') {
    const side = snapMapToGrid(Math.min(MAP_W_MAX, Math.max(MAP_W_MIN, 56 + s * 10)), grid)
    return { map_w: side, map_h: side }
  }

  const rawW = 72 + s * 14
  const rawH = 48 + Math.min(s, 12) * 5
  const map_w = snapMapToGrid(clampDim(rawW, MAP_W_MIN, MAP_W_MAX), grid)
  const map_h = snapMapToGrid(clampDim(rawH, MAP_H_MIN, MAP_H_MAX), grid)
  return { map_w, map_h }
}

function clampDim(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

/** Fallback when DB has no map size (read-only maps). */
export function fallbackMapDimensions(table: {
  seating_capacity?: number
  shape?: string | null
}): { map_w: number; map_h: number } {
  const shape = normalizeShape(table.shape)
  return suggestMapDimensions(table.seating_capacity ?? 4, shape)
}

export function normalizeShape(shape: string | null | undefined): MapShape {
  if (shape === 'square' || shape === 'round') return shape
  return 'rectangle'
}

export const MAP_SIZE_PRESETS = [
  { label: 'S', map_w: 96, map_h: 64 },
  { label: 'M', map_w: 120, map_h: 72 },
  { label: 'L', map_w: 160, map_h: 88 },
  { label: 'XL', map_w: 200, map_h: 104 },
] as const

export function normalizeRotationDegrees(deg: number): number {
  if (!Number.isFinite(deg)) return 0
  const n = Math.round(deg) % 360
  return n < 0 ? n + 360 : n
}

export function snapRotationToStep(deg: number, step: number): number {
  return normalizeRotationDegrees(Math.round(deg / step) * step)
}
