import { useEffect, useState } from 'react'

export interface UrgencyState {
  elapsedSeconds: number
  elapsedLabel: string
  isUrgent: boolean
}

/**
 * Global timer from first KOT send (kot_first_sent_at) or order created_at fallback.
 */
export function useKdsUrgencyTimer(
  kotFirstSentAt: string | undefined,
  createdAt: string | undefined,
  targetPrepMinutes: number,
  tickMs = 1000
): UrgencyState {
  const start = kotFirstSentAt || createdAt
  const startMs = start ? new Date(start).getTime() : Date.now()

  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), tickMs)
    return () => window.clearInterval(id)
  }, [tickMs])

  const elapsedSeconds = Math.max(0, Math.floor((now - startMs) / 1000))
  const m = Math.floor(elapsedSeconds / 60)
  const s = elapsedSeconds % 60
  const elapsedLabel = `${m}:${s.toString().padStart(2, '0')}`
  const isUrgent = elapsedSeconds >= targetPrepMinutes * 60

  return { elapsedSeconds, elapsedLabel, isUrgent }
}
