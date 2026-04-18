// Package realtime provides a tiny in-process pub/sub fan-out that powers
// the kitchen SSE stream. It is deliberately single-instance (no Redis): the
// POS backend runs as one process, and events are ephemeral cache-busters,
// not a durable queue.
package realtime

import (
	"sync"
	"sync/atomic"
	"time"
)

// Event is a KDS-relevant event emitted by mutating handlers.
// Keep the payload small — it's only used to invalidate React Query caches
// on connected clients. The authoritative data is still fetched over REST.
type Event struct {
	// Type drives client behavior. Keep this set small and stable.
	//   fired, item_updated, bumped, recalled, voided, served
	Type string `json:"type"`
	// OrderID / OrderNumber help the client target the right query key.
	OrderID     string                 `json:"order_id,omitempty"`
	OrderNumber string                 `json:"order_number,omitempty"`
	// Extra is free-form metadata for richer UX later (e.g., completion_seconds).
	Extra map[string]interface{} `json:"extra,omitempty"`
	// EmittedAt lets the client show "3s ago" if needed and drop stale events.
	EmittedAt time.Time `json:"emitted_at"`
}

// KitchenHub is the single broker for kitchen events. It is safe for
// concurrent use from any number of handler goroutines.
type KitchenHub struct {
	mu          sync.RWMutex
	subscribers map[uint64]chan Event
	nextID      uint64
}

var defaultHub = &KitchenHub{subscribers: map[uint64]chan Event{}}

// Default returns the process-wide hub. Handlers should call
// realtime.Publish(...) directly rather than grabbing the hub.
func Default() *KitchenHub { return defaultHub }

// Subscribe returns a buffered event channel plus a cleanup func. If the
// client is slow, Publish drops events rather than blocking the producer —
// the SSE stream also sends periodic pings so dropped events just mean
// "refresh on next poll interval."
func (h *KitchenHub) Subscribe(buffer int) (<-chan Event, func()) {
	if buffer <= 0 {
		buffer = 16
	}
	ch := make(chan Event, buffer)
	id := atomic.AddUint64(&h.nextID, 1)

	h.mu.Lock()
	h.subscribers[id] = ch
	h.mu.Unlock()

	return ch, func() {
		h.mu.Lock()
		if existing, ok := h.subscribers[id]; ok {
			delete(h.subscribers, id)
			close(existing)
		}
		h.mu.Unlock()
	}
}

// Publish fans an event out to every current subscriber without blocking.
// Slow subscribers will silently miss events; that's the right trade-off for
// cache-busting semantics.
func (h *KitchenHub) Publish(ev Event) {
	if ev.EmittedAt.IsZero() {
		ev.EmittedAt = time.Now()
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, ch := range h.subscribers {
		select {
		case ch <- ev:
		default:
			// dropped — subscriber is slow; SSE heartbeat will keep them alive
		}
	}
}

// SubscriberCount is useful for diagnostics and tests.
func (h *KitchenHub) SubscriberCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.subscribers)
}

// Publish is a package-level convenience around Default().Publish.
func Publish(ev Event) { defaultHub.Publish(ev) }
