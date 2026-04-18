/**
 * useDashboardStream — Server-Sent Events client for the admin dashboard.
 *
 * Mirrors the kitchen stream hook (lib/kitchenStream.ts):
 *   - Auth via ?token=… because EventSource can't set headers.
 *   - Auto-reconnect with exponential backoff (cap 30s).
 *   - Caller receives connection status (`connecting` | `live` | `offline`)
 *     and an onEvent callback for each message.
 */
import { useEffect, useRef, useState } from 'react'

export type DashboardStreamStatus = 'connecting' | 'live' | 'offline'

export interface DashboardStreamEvent {
  type: string
  title?: string
  detail?: string
  amount?: number
  order_id?: string
  order_number?: string
  extra?: Record<string, unknown>
  emitted_at?: string
}

interface UseDashboardStreamOptions {
  /** Disable by passing false. */
  enabled?: boolean
  /** Called synchronously for every streamed event (after status updates). */
  onEvent?: (ev: DashboardStreamEvent) => void
}

function apiBase(): string {
  const fromEnv = import.meta.env?.VITE_API_URL
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) return fromEnv
  return 'http://localhost:8080/api/v1'
}

function buildStreamURL(token: string): string {
  const base = apiBase().replace(/\/+$/, '')
  return `${base}/admin/dashboard/stream?token=${encodeURIComponent(token)}`
}

const MAX_BACKOFF_MS = 30_000
const MIN_BACKOFF_MS = 1_000

// Names the backend uses for SSE event types — listed explicitly so the
// browser delivers them via addEventListener (not only onmessage).
const DASHBOARD_EVENT_NAMES = [
  'order_created',
  'order_updated',
  'order_completed',
  'order_cancelled',
  'order_voided',
  'payment',
  'table_changed',
] as const

export function useDashboardStream(opts: UseDashboardStreamOptions = {}): DashboardStreamStatus {
  const { enabled = true, onEvent } = opts
  const [status, setStatus] = useState<DashboardStreamStatus>('connecting')
  const eventSourceRef = useRef<EventSource | null>(null)
  const backoffRef = useRef(MIN_BACKOFF_MS)
  const reconnectTimer = useRef<number | null>(null)
  const stoppedRef = useRef(false)
  // Keep onEvent latest without reconnecting on every render.
  const onEventRef = useRef(onEvent)
  useEffect(() => {
    onEventRef.current = onEvent
  }, [onEvent])

  useEffect(() => {
    if (!enabled) {
      setStatus('offline')
      return
    }
    stoppedRef.current = false

    const connect = () => {
      if (stoppedRef.current) return
      const token = localStorage.getItem('pos_token')
      if (!token) {
        setStatus('offline')
        return
      }

      setStatus('connecting')
      let es: EventSource
      try {
        es = new EventSource(buildStreamURL(token))
      } catch {
        scheduleReconnect()
        return
      }
      eventSourceRef.current = es

      es.addEventListener('ready', () => {
        backoffRef.current = MIN_BACKOFF_MS
        setStatus('live')
      })

      const dispatch = (raw: MessageEvent) => {
        try {
          const parsed = JSON.parse(raw.data) as DashboardStreamEvent
          onEventRef.current?.(parsed)
        } catch {
          // ignore malformed payload
        }
      }
      DASHBOARD_EVENT_NAMES.forEach((name) =>
        es.addEventListener(name, dispatch as EventListener),
      )
      es.onmessage = dispatch

      es.onerror = () => {
        setStatus('offline')
        es.close()
        eventSourceRef.current = null
        scheduleReconnect()
      }
    }

    const scheduleReconnect = () => {
      if (stoppedRef.current) return
      const delay = backoffRef.current
      backoffRef.current = Math.min(MAX_BACKOFF_MS, Math.max(MIN_BACKOFF_MS, delay * 2))
      reconnectTimer.current = window.setTimeout(connect, delay)
    }

    connect()

    return () => {
      stoppedRef.current = true
      if (reconnectTimer.current) {
        window.clearTimeout(reconnectTimer.current)
        reconnectTimer.current = null
      }
      eventSourceRef.current?.close()
      eventSourceRef.current = null
    }
  }, [enabled])

  return status
}
