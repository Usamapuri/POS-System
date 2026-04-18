package realtime

import (
	"sync"
	"sync/atomic"
	"time"
)

// DashboardEvent is an admin-dashboard signal emitted by mutating handlers.
// Payload is intentionally tiny — clients use it to invalidate React Query
// caches and to render the activity feed; the authoritative numbers are
// always re-fetched over REST.
type DashboardEvent struct {
	// Type drives client behavior. Keep this set small and stable.
	//   order_created | order_updated | order_completed | order_cancelled
	//   order_voided  | payment       | table_changed
	Type string `json:"type"`

	// Optional human-friendly fields used by the activity feed.
	Title  string  `json:"title,omitempty"`
	Detail string  `json:"detail,omitempty"`
	Amount float64 `json:"amount,omitempty"`

	// Free-form metadata.
	OrderID     string                 `json:"order_id,omitempty"`
	OrderNumber string                 `json:"order_number,omitempty"`
	Extra       map[string]interface{} `json:"extra,omitempty"`

	EmittedAt time.Time `json:"emitted_at"`
}

// DashboardHub is the broker for admin-dashboard events.
type DashboardHub struct {
	mu          sync.RWMutex
	subscribers map[uint64]chan DashboardEvent
	nextID      uint64
}

var defaultDashboardHub = &DashboardHub{subscribers: map[uint64]chan DashboardEvent{}}

// DefaultDashboard returns the process-wide hub. Handlers should prefer
// realtime.PublishDashboard(...) over grabbing the hub directly.
func DefaultDashboard() *DashboardHub { return defaultDashboardHub }

// Subscribe returns a buffered event channel plus a cleanup func. Slow
// subscribers silently miss events — the SSE handler also polls /live as a
// safety net.
func (h *DashboardHub) Subscribe(buffer int) (<-chan DashboardEvent, func()) {
	if buffer <= 0 {
		buffer = 32
	}
	ch := make(chan DashboardEvent, buffer)
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
func (h *DashboardHub) Publish(ev DashboardEvent) {
	if ev.EmittedAt.IsZero() {
		ev.EmittedAt = time.Now()
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, ch := range h.subscribers {
		select {
		case ch <- ev:
		default:
			// dropped — slow subscriber; SSE heartbeat / polling will recover.
		}
	}
}

// SubscriberCount is useful for diagnostics and tests.
func (h *DashboardHub) SubscriberCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.subscribers)
}

// PublishDashboard is a package-level convenience around DefaultDashboard().Publish.
// Designed to be fire-and-forget from any handler.
func PublishDashboard(ev DashboardEvent) { defaultDashboardHub.Publish(ev) }
