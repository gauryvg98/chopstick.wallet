// Package livestats keeps lightweight rolling volume + price-change aggregates
// per mint, fed by every trade on the pump.fun firehose (across all pools —
// bonding curve, pump-amm, raydium, meteora). It's how the graduated feeds get
// real "moving now" volume and change without a second data source: the feeds
// look up a mint's window stats instead of polling a DEX API.
//
// Memory is bounded two ways: a per-minute ring keeps each mint's footprint
// tiny and fixed, and a background sweep evicts mints that stop trading (plus a
// hard cap as a backstop), so a busy firehose can't grow the map without limit.
package livestats

import (
	"context"
	"sort"
	"sync"
	"time"
)

// windowMin is the rolling window (minutes) for volume + change. Short enough to
// read as "right now", long enough to be a stable ranking signal.
const windowMin = 15

// hardCap bounds tracked mints as a backstop to the TTL sweep. ~1KB/mint, so a
// few thousand is a couple of MB.
const hardCap = 5000

type bucket struct {
	minute  int64 // unix minute this bucket represents (0 = empty)
	volUsd  float64
	firstPx float64
	lastPx  float64
}

type stat struct {
	buckets [windowMin]bucket
	lastPx  float64
	lastMin int64
}

type Store struct {
	mu sync.Mutex
	m  map[string]*stat
}

func New() *Store { return &Store{m: make(map[string]*stat)} }

// Observe records one trade's USD size + price for a mint. Called for every
// firehose trade on every pool; O(1) and lock-cheap. Bucketed by server receive
// time (not the on-chain timestamp) so clock skew can't misplace a trade.
func (s *Store) Observe(mint string, volUsd, priceUsd float64) {
	if mint == "" || priceUsd <= 0 {
		return
	}
	nowMin := time.Now().Unix() / 60
	s.mu.Lock()
	st := s.m[mint]
	if st == nil {
		st = &stat{}
		s.m[mint] = st
	}
	b := &st.buckets[nowMin%windowMin]
	if b.minute != nowMin {
		*b = bucket{minute: nowMin, firstPx: priceUsd}
	}
	if b.firstPx == 0 {
		b.firstPx = priceUsd
	}
	b.volUsd += volUsd
	b.lastPx = priceUsd
	st.lastPx = priceUsd
	st.lastMin = nowMin
	s.mu.Unlock()
}

// Snapshot returns the window volume (USD), the % change across the window, and
// the last price for a mint. ok is false when we've seen no recent trades, so
// callers can fall back rather than show a stale/zero reading.
func (s *Store) Snapshot(mint string) (volUsd, changePct, lastPx float64, ok bool) {
	nowMin := time.Now().Unix() / 60
	floor := nowMin - windowMin + 1
	s.mu.Lock()
	st := s.m[mint]
	if st == nil || st.lastMin < floor {
		s.mu.Unlock()
		return 0, 0, 0, false
	}
	var basePx float64
	var baseMin int64 = 1<<62 - 1
	for i := range st.buckets {
		b := st.buckets[i]
		if b.minute < floor {
			continue
		}
		volUsd += b.volUsd
		if b.firstPx > 0 && b.minute < baseMin {
			basePx, baseMin = b.firstPx, b.minute
		}
	}
	lastPx = st.lastPx
	s.mu.Unlock()
	if basePx > 0 && lastPx > 0 {
		changePct = (lastPx - basePx) / basePx * 100
	}
	return volUsd, changePct, lastPx, true
}

// Run sweeps out mints that have gone quiet (and enforces the hard cap) once a
// minute, keeping the map bounded to what's actually trading.
func (s *Store) Run(ctx context.Context) {
	t := time.NewTicker(time.Minute)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s.prune()
		}
	}
}

func (s *Store) prune() {
	floor := time.Now().Unix()/60 - windowMin + 1
	s.mu.Lock()
	defer s.mu.Unlock()
	for mint, st := range s.m {
		if st.lastMin < floor {
			delete(s.m, mint)
		}
	}
	if len(s.m) <= hardCap {
		return
	}
	// Backstop: keep the most-recently-active mints up to the cap.
	type ent struct {
		mint string
		min  int64
	}
	ents := make([]ent, 0, len(s.m))
	for mint, st := range s.m {
		ents = append(ents, ent{mint, st.lastMin})
	}
	sort.Slice(ents, func(i, j int) bool { return ents[i].min > ents[j].min })
	for _, e := range ents[hardCap:] {
		delete(s.m, e.mint)
	}
}
