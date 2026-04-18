import { useCallback, useEffect, useMemo, useState } from 'react'
import { startOfMonth, endOfMonth, subDays, subMonths, isValid } from 'date-fns'
import { parseDDMMYYYY, toIsoDate } from '@/lib/utils'

export type RangePresetId =
  | 'today'
  | 'yesterday'
  | 'last_7'
  | 'last_30'
  | 'this_month'
  | 'last_month'
  | 'custom'

export interface ReportRange {
  /** Inclusive local start, midnight Asia/Karachi (the same calendar day the user picked). */
  from: Date
  /** Inclusive local end (calendar day). */
  to: Date
  /** Stable preset identifier for the active selection. */
  preset: RangePresetId
}

export interface UseReportRange extends ReportRange {
  /** ISO YYYY-MM-DD — what we send to the backend. */
  fromISO: string
  toISO: string
  /** Total inclusive day count (1 for a single day). */
  days: number
  setRange: (next: { from: Date; to: Date; preset?: RangePresetId }) => void
  setPreset: (preset: RangePresetId) => void
}

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfToday(): Date {
  const d = startOfToday()
  return d
}

/**
 * Given a preset, returns the [from, to] interval in local calendar days.
 * Custom returns null — it must come from URL or user picker.
 */
export function rangeForPreset(preset: RangePresetId): { from: Date; to: Date } | null {
  const today = startOfToday()
  switch (preset) {
    case 'today':
      return { from: today, to: today }
    case 'yesterday': {
      const y = subDays(today, 1)
      return { from: y, to: y }
    }
    case 'last_7':
      return { from: subDays(today, 6), to: today }
    case 'last_30':
      return { from: subDays(today, 29), to: today }
    case 'this_month':
      return { from: startOfMonth(today), to: endOfMonth(today) > today ? today : endOfMonth(today) }
    case 'last_month': {
      const m = subMonths(today, 1)
      return { from: startOfMonth(m), to: endOfMonth(m) }
    }
    case 'custom':
    default:
      return null
  }
}

const PRESET_VALUES: RangePresetId[] = [
  'today',
  'yesterday',
  'last_7',
  'last_30',
  'this_month',
  'last_month',
  'custom',
]

function readSearch(): URLSearchParams {
  if (typeof window === 'undefined') return new URLSearchParams()
  return new URLSearchParams(window.location.search)
}

function writeSearch(params: URLSearchParams) {
  if (typeof window === 'undefined') return
  const next = `${window.location.pathname}?${params.toString()}${window.location.hash}`
  window.history.replaceState(null, '', next)
}

function parseInitialRange(): ReportRange {
  const params = readSearch()
  const presetParam = params.get('preset') as RangePresetId | null
  const fromParam = params.get('from')
  const toParam = params.get('to')

  // Custom range from URL takes precedence (deep links).
  if (fromParam && toParam) {
    const f = parseDDMMYYYY(fromParam)
    const t = parseDDMMYYYY(toParam)
    if (f && t && isValid(f) && isValid(t) && f <= t) {
      return {
        from: f,
        to: t,
        preset: presetParam && PRESET_VALUES.includes(presetParam) ? presetParam : 'custom',
      }
    }
  }

  if (presetParam && PRESET_VALUES.includes(presetParam) && presetParam !== 'custom') {
    const r = rangeForPreset(presetParam)
    if (r) return { ...r, preset: presetParam }
  }

  // Default: today.
  const today = startOfToday()
  return { from: today, to: endOfToday(), preset: 'today' }
}

/**
 * Single source of truth for the date range used across the Reports page.
 * State is mirrored to URL search params (`from`, `to`, `preset`) using the
 * project's DD-MM-YYYY convention so deep links remain human-readable.
 */
export function useReportRange(): UseReportRange {
  const [state, setState] = useState<ReportRange>(parseInitialRange)

  // Keep URL in sync with state. Skip if the calling page is unmounted (SSR).
  useEffect(() => {
    const params = readSearch()
    params.set('from', toIsoToHumanDDMMYYYY(state.from))
    params.set('to', toIsoToHumanDDMMYYYY(state.to))
    params.set('preset', state.preset)
    writeSearch(params)
  }, [state])

  const setRange = useCallback(
    ({ from, to, preset = 'custom' }: { from: Date; to: Date; preset?: RangePresetId }) => {
      const ordered = from <= to ? { from, to } : { from: to, to: from }
      setState({ ...ordered, preset })
    },
    [],
  )

  const setPreset = useCallback((preset: RangePresetId) => {
    if (preset === 'custom') {
      setState((prev) => ({ ...prev, preset }))
      return
    }
    const r = rangeForPreset(preset)
    if (r) setState({ ...r, preset })
  }, [])

  return useMemo(() => {
    const fromISO = toIsoDate(state.from)
    const toISO = toIsoDate(state.to)
    const ms = state.to.getTime() - state.from.getTime()
    const days = Math.floor(ms / (1000 * 60 * 60 * 24)) + 1
    return {
      ...state,
      fromISO,
      toISO,
      days,
      setRange,
      setPreset,
    }
  }, [state, setRange, setPreset])
}

// --- helpers --------------------------------------------------------------

// Local-only helper that mirrors lib/utils.formatDateDDMMYYYY without importing
// it as a value (avoids a cyclic dep risk between hooks and lib).
function toIsoToHumanDDMMYYYY(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0')
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const yr = String(d.getFullYear())
  return `${day}-${mo}-${yr}`
}
