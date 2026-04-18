import { useEffect, useState } from 'react'

/**
 * Urgency tiers drive the KDS card visual treatment:
 *
 *   fresh    — < 50% of target (calm green)
 *   warming  — 50%–90%         (amber)
 *   urgent   — 90%–120%        (red, steady)
 *   critical — >= 120%         (red, pulsing)
 *   stale    — exceeds staleMinutes (striped/grey; hidden unless admin opts in)
 *
 * A scale gives real information density: a card isn't just "urgent/not";
 * cooks can see how urgent from across the line.
 */
export type UrgencyTier = 'fresh' | 'warming' | 'urgent' | 'critical' | 'stale'

export interface UrgencyState {
  elapsedSeconds: number
  elapsedLabel: string
  /** Ratio of elapsed time vs target prep (0..∞). Useful for progress bars. */
  ratio: number
  /** Retained for backwards-compat with existing callers. */
  isUrgent: boolean
  tier: UrgencyTier
}

function formatClock(totalSeconds: number): string {
  const sign = totalSeconds < 0 ? '-' : ''
  const s = Math.abs(totalSeconds)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${sign}${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
}

export function useKdsUrgencyTimer(
  kotFirstSentAt: string | undefined,
  createdAt: string | undefined,
  targetPrepMinutes: number,
  staleMinutes = 120,
  tickMs = 1000,
): UrgencyState {
  const start = kotFirstSentAt || createdAt

  const [elapsedSeconds, setElapsedSeconds] = useState(() => {
    if (!start) return 0
    return Math.floor((Date.now() - new Date(start).getTime()) / 1000)
  })

  useEffect(() => {
    if (!start) return
    const id = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - new Date(start).getTime()) / 1000))
    }, tickMs)
    return () => window.clearInterval(id)
  }, [start, tickMs])

  const targetSeconds = Math.max(1, targetPrepMinutes * 60)
  const ratio = elapsedSeconds / targetSeconds
  const staleSeconds = Math.max(targetSeconds + 60, staleMinutes * 60)

  let tier: UrgencyTier
  if (elapsedSeconds >= staleSeconds) tier = 'stale'
  else if (ratio >= 1.2) tier = 'critical'
  else if (ratio >= 0.9) tier = 'urgent'
  else if (ratio >= 0.5) tier = 'warming'
  else tier = 'fresh'

  return {
    elapsedSeconds,
    elapsedLabel: formatClock(elapsedSeconds),
    ratio,
    isUrgent: tier === 'urgent' || tier === 'critical',
    tier,
  }
}
