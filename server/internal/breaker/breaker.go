// Package breaker is a tiny per-key circuit breaker. After a hard upstream
// failure it "opens" for a cooldown, during which calls are skipped entirely
// (saving quota). After the cooldown a single half-open probe is allowed
// through; success closes the circuit, another failure reopens it with longer
// backoff.
package breaker

import (
	"sync"
	"time"
)

type state struct {
	openUntil time.Time
	trips     int
}

type Breaker struct {
	mu        sync.Mutex
	st        map[string]*state
	base, max time.Duration
}

func New(base, max time.Duration) *Breaker {
	return &Breaker{st: make(map[string]*state), base: base, max: max}
}

// Allow reports whether a request for key may proceed (circuit closed, or
// half-open after the cooldown elapsed).
func (b *Breaker) Allow(key string) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	s := b.st[key]
	return s == nil || time.Now().After(s.openUntil)
}

// Trip opens the circuit for key with exponential backoff; returns the cooldown.
func (b *Breaker) Trip(key string) time.Duration {
	b.mu.Lock()
	defer b.mu.Unlock()
	s := b.st[key]
	if s == nil {
		s = &state{}
		b.st[key] = s
	}
	s.trips++
	d := b.base * time.Duration(1<<min(s.trips-1, 5)) // up to 32× base
	if d > b.max || d <= 0 {
		d = b.max
	}
	s.openUntil = time.Now().Add(d)
	return d
}

// Reset closes the circuit for key after a success.
func (b *Breaker) Reset(key string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if s := b.st[key]; s != nil {
		s.trips = 0
		s.openUntil = time.Time{}
	}
}
