/**
 * Cross-tab / same-origin realtime bridge for KDS ↔ Server Station.
 * Replace with WebSocket when backend supports it — same API surface.
 */
const CHANNEL = 'pos-kds-sync'

export type KdsPickupEvent = {
  type: 'order_ready_for_pickup'
  orderId: string
  tableId?: string | null
  orderNumber: string
  completionSeconds: number
  kitchenBumpedAt: string
}

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null
  try {
    return new BroadcastChannel(CHANNEL)
  } catch {
    return null
  }
}

export function publishOrderReady(payload: KdsPickupEvent): void {
  const ch = getChannel()
  if (ch) {
    try {
      ch.postMessage(payload)
    } finally {
      ch.close()
    }
  }
  window.dispatchEvent(new CustomEvent('pos:kds-pickup', { detail: payload }))
}

export function subscribeOrderReady(handler: (e: KdsPickupEvent) => void): () => void {
  const ch = getChannel()
  const onBc = (ev: MessageEvent<KdsPickupEvent>) => {
    if (ev.data?.type === 'order_ready_for_pickup') handler(ev.data)
  }
  const onWin = (ev: Event) => {
    const d = (ev as CustomEvent<KdsPickupEvent>).detail
    if (d?.type === 'order_ready_for_pickup') handler(d)
  }
  ch?.addEventListener('message', onBc)
  window.addEventListener('pos:kds-pickup', onWin as EventListener)
  return () => {
    ch?.removeEventListener('message', onBc)
    ch?.close()
    window.removeEventListener('pos:kds-pickup', onWin as EventListener)
  }
}
