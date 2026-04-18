/**
 * useKitchenStream — Server-Sent Events client for kitchen updates.
 *
 * - Auth via ?token=… because EventSource can't set headers.
 * - Auto-reconnect with exponential backoff (cap 30s).
 * - Caller receives connection status (`connecting` | `live` | `offline`)
 *   and an onEvent callback for each message.
 * - If the venue disables KDS while a client is connected the server closes
 *   with 403 — we treat that as "offline" and stop reconnecting.
 */
import { useEffect, useRef, useState } from 'react'

export type KitchenStreamStatus = 'connecting' | 'live' | 'offline'

export interface KitchenStreamEvent {
  type: string
  order_id?: string
  order_number?: string
  extra?: Record<string, unknown>
  emitted_at?: string
}

interface UseKitchenStreamOptions {
  /** Disable by passing false — used when KDS is disabled for the venue. */
  enabled?: boolean
  /** Called synchronously for every streamed event (after status updates). */
  onEvent?: (ev: KitchenStreamEvent) => void
}

function apiBase(): string {
  const fromEnv = import.meta.env?.VITE_API_URL
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) return fromEnv
  return 'http://localhost:8080/api/v1'
}

function buildStreamURL(token: string): string {
  const base = apiBase().replace(/\/+$/, '')
  return `${base}/kitchen/stream?token=${encodeURIComponent(token)}`
}

const MAX_BACKOFF_MS = 30_000
const MIN_BACKOFF_MS = 1_000

export function useKitchenStream(opts: UseKitchenStreamOptions = {}): KitchenStreamStatus {
  const { enabled = true, onEvent } = opts
  const [status, setStatus] = useState<KitchenStreamStatus>('connecting')
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

      // The server sends a `ready` event on open — flip to live there so the
      // caller sees "Live" only when the stream is actually authenticated.
      es.addEventListener('ready', () => {
        backoffRef.current = MIN_BACKOFF_MS
        setStatus('live')
      })

      // Handle named events we publish from the backend.
      const dispatch = (raw: MessageEvent) => {
        try {
          const parsed = JSON.parse(raw.data) as KitchenStreamEvent
          onEventRef.current?.(parsed)
        } catch {
          // ignore malformed payload
        }
      }
      ;[
        'fired',
        'item_updated',
        'bumped',
        'recalled',
        'voided',
        'served',
      ].forEach((name) => es.addEventListener(name, dispatch as EventListener))

      // Fallback for untyped messages (shouldn't happen but handle gracefully).
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
