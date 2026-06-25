// Package cache is a tiny in-memory TTL cache used to respect upstream
// free-tier rate limits (BirdEye / Jupiter).
package cache

import (
	"sync"
	"time"
)

type entry struct {
	val       any
	expiresAt time.Time
}

type Cache struct {
	mu sync.Mutex
	m  map[string]entry
}

func New() *Cache {
	return &Cache{m: make(map[string]entry)}
}

// peek returns the value, whether it is still fresh, and whether it exists.
// Expired entries are retained so they can be served stale on upstream errors.
func (c *Cache) peek(key string) (val any, fresh, exists bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.m[key]
	if !ok {
		return nil, false, false
	}
	return e.val, time.Now().Before(e.expiresAt), true
}

func (c *Cache) set(key string, val any, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.m[key] = entry{val: val, expiresAt: time.Now().Add(ttl)}
}

// Put writes a value into the cache directly. Used by the background poller to
// pre-warm hot keys so user requests never trigger an upstream call.
func (c *Cache) Put(key string, val any, ttl time.Duration) {
	c.set(key, val, ttl)
}

// Snapshot returns the stored value for key (fresh or stale) if present.
func (c *Cache) Snapshot(key string) (any, bool) {
	v, _, ok := c.peek(key)
	return v, ok
}

// Remember returns the fresh cached value for key, or computes + caches it via
// fn. If fn fails but a stale value exists, the stale value is served instead
// (stale-while-error) — so a transient upstream 429 never breaks the UI.
func Remember[T any](c *Cache, key string, ttl time.Duration, fn func() (T, error)) (T, error) {
	if v, fresh, ok := c.peek(key); ok && fresh {
		if t, ok := v.(T); ok {
			return t, nil
		}
	}
	t, err := fn()
	if err == nil {
		c.set(key, t, ttl)
		return t, nil
	}
	// Upstream failed — serve the last good value if we have one.
	if v, _, ok := c.peek(key); ok {
		if stale, ok := v.(T); ok {
			return stale, nil
		}
	}
	return t, err
}

// RememberWith is like Remember but picks the cache TTL from the fetched value,
// so a thin/degraded result (e.g. a sampler fallback when the upstream chart
// fetch timed out) is cached only briefly and self-heals, while a full result is
// cached long.
func RememberWith[T any](c *Cache, key string, fn func() (T, error), ttl func(T) time.Duration) (T, error) {
	if v, fresh, ok := c.peek(key); ok && fresh {
		if t, ok := v.(T); ok {
			return t, nil
		}
	}
	t, err := fn()
	if err == nil {
		c.set(key, t, ttl(t))
		return t, nil
	}
	if v, _, ok := c.peek(key); ok {
		if stale, ok := v.(T); ok {
			return stale, nil
		}
	}
	return t, err
}
