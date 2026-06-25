// Package freedata implements the data Provider on free, keyless sources —
// DexScreener (price/mcap/liquidity/volume), GeckoTerminal (trending, OHLCV,
// trades), and Helius (holders). No monthly compute-unit cliff like BirdEye.
package freedata

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"sync"
	"sync/atomic"
	"time"
)

type ctxKey int

const priorityKey ctxKey = iota

// WithPriority marks a request context as user-facing (e.g. the chart someone is
// actively looking at), so its upstream calls preempt background polling in the
// shared rate limiter. Background goroutines pass a plain context and yield.
func WithPriority(ctx context.Context) context.Context {
	return context.WithValue(ctx, priorityKey, true)
}

func isPriority(ctx context.Context) bool {
	hi, _ := ctx.Value(priorityKey).(bool)
	return hi
}

// limiter spaces out request starts to respect a source's rate limit. The
// spacing is adaptive: a 429 (or other throttle) widens it exponentially up to
// max, and each success eases it back toward base. Without this, a burst that
// trips an upstream cooldown keeps re-tripping it — every call fails until the
// cooldown lifts, which it never does because we keep hammering at the same rate.
type limiter struct {
	mu     sync.Mutex
	next   time.Time // reservation cursor for background calls
	issued time.Time // when the most recent call was last cleared to go
	base   time.Duration
	iv     time.Duration
	max    time.Duration
	hipri  int32 // number of high-priority callers currently waiting
}

func newLimiter(base time.Duration) *limiter {
	// Cap the backoff at 8s: enough to let a throttle cooldown lift, bounded so a
	// cold request resolves in seconds.
	return &limiter{base: base, iv: base, max: 8 * time.Second}
}

// wait blocks until this caller may issue a request, or ctx is done.
//
// High-priority callers (the chart the user just opened) JUMP the queue: they
// reserve a slot just `base` after the last call actually went, ignoring the
// background reservation cursor — so an open chart never waits behind a trending
// poll's backed-off reservations. Background callers use the cursor (so they
// stay spaced) and additionally yield while any hi-pri call is pending.
func (l *limiter) wait(ctx context.Context, hi bool) error {
	if hi {
		atomic.AddInt32(&l.hipri, 1)
		defer atomic.AddInt32(&l.hipri, -1)
	} else {
		for atomic.LoadInt32(&l.hipri) > 0 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(40 * time.Millisecond):
			}
		}
	}

	l.mu.Lock()
	now := time.Now()
	var slot time.Time
	if hi {
		slot = l.issued.Add(l.base) // jump ahead — only a base gap from the last call
	} else {
		slot = l.next // background spacing cursor
	}
	if slot.Before(now) {
		slot = now
	}
	l.issued = slot
	if l.next.Before(slot.Add(l.iv)) {
		l.next = slot.Add(l.iv)
	}
	l.mu.Unlock()

	d := time.Until(slot)
	if d <= 0 {
		return nil
	}
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// penalize widens the spacing after a throttle, doubling up to max.
func (l *limiter) penalize() {
	l.mu.Lock()
	if l.iv *= 2; l.iv > l.max {
		l.iv = l.max
	}
	l.mu.Unlock()
}

// recover resets the spacing to base after a clean success. A single good
// response clears any backoff immediately — otherwise the limiter stays stuck
// wide (the source is actually healthy), and on-demand chart fetches time out
// behind it. The penalize() on the next 429 re-applies backoff if needed.
func (l *limiter) recover() {
	l.mu.Lock()
	l.iv = l.base
	l.mu.Unlock()
}

func getJSON(ctx context.Context, hc *http.Client, lim *limiter, url string, out any) error {
	if err := lim.wait(ctx, isPriority(ctx)); err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("accept", "application/json")
	res, err := hc.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		// Throttled (or upstream overloaded) — back off so the cooldown can
		// actually lift. Other statuses (e.g. 404 for a token not on this source)
		// are normal and shouldn't widen the limiter.
		if res.StatusCode == http.StatusTooManyRequests || res.StatusCode >= 500 {
			lim.penalize()
		}
		return fmt.Errorf("GET %s -> %d", url, res.StatusCode)
	}
	lim.recover()
	return json.NewDecoder(res.Body).Decode(out)
}

// pf parses a (possibly string) numeric field, returning 0 on failure.
func pf(s string) float64 {
	v, _ := strconv.ParseFloat(s, 64)
	return v
}
