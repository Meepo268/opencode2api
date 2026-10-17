package gateway

import (
	"sync"
	"time"
)

// defaultLaneCapacity bounds the session lane table so a long-running gateway
// under many short-lived sessions cannot grow it without limit.
const defaultLaneCapacity = 4096

// defaultLaneTTL is how long a pinned lane is trusted. Sessions older than
// this fall back to the anonymous-first order until they re-pin, which keeps
// long-idle conversations from being stuck on a lane that may have changed.
const defaultLaneTTL = 2 * time.Hour

// sessionLanes remembers whether a session last succeeded on the anonymous
// lane or on a keyed lane. It backs the anonymous_priority=false routing mode:
// a session that already found a working lane is sent straight back to it,
// skipping the free-tier probe that would otherwise run on every turn.
//
// It is intentionally a tiny, self-expiring table: a pin is a performance
// hint, not correctness state, so losing it merely restores the default order.
type sessionLanes struct {
	mu       sync.Mutex
	pins     map[string]laneEntry
	capacity int
	ttl      time.Duration
}

type laneEntry struct {
	anonymous bool
	at        time.Time
}

func newSessionLanes(capacity int, ttl time.Duration) *sessionLanes {
	if capacity <= 0 {
		capacity = defaultLaneCapacity
	}
	if ttl <= 0 {
		ttl = defaultLaneTTL
	}
	return &sessionLanes{pins: make(map[string]laneEntry), capacity: capacity, ttl: ttl}
}

// get returns the pinned lane for a session and whether a live pin exists.
// Expired entries are treated as absent (and pruned lazily on write).
func (s *sessionLanes) get(session string) (anonymous bool, ok bool) {
	if session == "" {
		return false, false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	entry, found := s.pins[session]
	if !found {
		return false, false
	}
	if time.Since(entry.at) > s.ttl {
		delete(s.pins, session)
		return false, false
	}
	return entry.anonymous, true
}

// set pins the lane a session just used. When the table is full it drops the
// oldest entry so the newest traffic always wins.
func (s *sessionLanes) set(session string, anonymous bool) {
	if session == "" {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.evictLocked()
	s.pins[session] = laneEntry{anonymous: anonymous, at: time.Now()}
}

// evictLocked makes room for one more entry. Expired pins are dropped first;
// if the table is still full, the oldest entries are removed oldest-first.
// Callers must hold the mutex.
func (s *sessionLanes) evictLocked() {
	if len(s.pins) < s.capacity {
		return
	}
	now := time.Now()
	for session, entry := range s.pins {
		if now.Sub(entry.at) > s.ttl {
			delete(s.pins, session)
		}
	}
	if len(s.pins) < s.capacity {
		return
	}
	// Still full after pruning expired pins: drop the oldest one. One removal
	// is enough because set only ever adds a single entry.
	oldestSession := ""
	var oldest time.Time
	for session, entry := range s.pins {
		if oldestSession == "" || entry.at.Before(oldest) {
			oldestSession, oldest = session, entry.at
		}
	}
	if oldestSession != "" {
		delete(s.pins, oldestSession)
	}
}
