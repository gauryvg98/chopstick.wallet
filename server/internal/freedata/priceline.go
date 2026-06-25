package freedata

import (
	"context"
	"sync"
	"time"

	"chadwallet/server/internal/types"
)

const (
	plTick       = 1 * time.Second   // base loop tick = focused-token (fast) cadence
	plSlowEvery  = 2                  // warm-pool mints sampled every Nth tick (→ 2s)
	plMaxWatched = 48                 // holds the continuously-warmed trending+Big set + viewed
	plWatchTTL   = 120 * time.Second  // warm-pool retention
	plFastTTL    = 15 * time.Second   // focused mark; refreshed each tick while viewed
	plMaxPts     = 4096               // per-second points; plenty for any sub-minute window
)

// priceLine builds a live, always-moving price series for actively-viewed
// tokens by sampling their current price every couple of seconds. It's what
// powers the sub-minute chart timeframes: GeckoTerminal's trade feed is too
// sparse and volume-thresholded to drive a 1s/5s/30s chart, so the latest
// candle would never advance. Sampling our own price guarantees the right edge
// of the chart keeps moving while a token is open.
type priceLine struct {
	fn     func(context.Context, string) float64
	mu     sync.Mutex
	watch  map[string]time.Time // all sampled mints (warm pool + focused)
	fast   map[string]time.Time // focused subset — sampled every tick (1s)
	hist   map[string][]types.OHLCV
	seeded map[string]bool
}

func newPriceLine(fn func(context.Context, string) float64) *priceLine {
	return &priceLine{
		fn:     fn,
		watch:  map[string]time.Time{},
		fast:   map[string]time.Time{},
		hist:   map[string][]types.OHLCV{},
		seeded: map[string]bool{},
	}
}

// watchMint marks a mint for warm-pool (2s) sampling.
func (s *priceLine) watchMint(mint string) {
	s.mu.Lock()
	s.watch[mint] = time.Now()
	s.mu.Unlock()
}

// watchFast marks a mint as the *focused* token — sampled every tick (1s) for
// denser live candles. Also keeps it in the warm set so it never gets evicted
// mid-view.
func (s *priceLine) watchFast(mint string) {
	now := time.Now()
	s.mu.Lock()
	s.watch[mint] = now
	s.fast[mint] = now
	s.mu.Unlock()
}

// fastMints evicts stale focused marks and returns the current focused set.
func (s *priceLine) fastMints() ([]string, map[string]bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	out := make([]string, 0, len(s.fast))
	set := make(map[string]bool, len(s.fast))
	for m, t := range s.fast {
		if now.Sub(t) > plFastTTL {
			delete(s.fast, m)
			continue
		}
		out = append(out, m)
		set[m] = true
	}
	return out, set
}

// count returns how many points are buffered for a mint.
func (s *priceLine) count(mint string) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.hist[mint])
}

// needsSeed reports whether a historical baseline still needs installing (the
// first attempt can fail cold before GeckoTerminal is warm).
func (s *priceLine) needsSeed(mint string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return !s.seeded[mint]
}

// seed installs a historical baseline (from recent trades) so the chart isn't
// blank/thin before live samples accumulate. Older seed points are merged in
// front of whatever live points already exist; marked done so it runs once.
func (s *priceLine) seed(mint string, hist []types.OHLCV) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.seeded[mint] {
		return
	}
	s.seeded[mint] = true
	if len(hist) == 0 {
		return
	}
	cur := s.hist[mint]
	var earliest int64 = 1<<63 - 1
	if len(cur) > 0 {
		earliest = cur[0].Time
	}
	merged := make([]types.OHLCV, 0, len(hist)+len(cur))
	for _, c := range hist {
		if c.Time < earliest {
			merged = append(merged, c)
		}
	}
	merged = append(merged, cur...)
	if len(merged) > plMaxPts {
		merged = merged[len(merged)-plMaxPts:]
	}
	s.hist[mint] = merged
}

// candles returns a copy of the sampled per-second price line for a mint.
func (s *priceLine) candles(mint string) []types.OHLCV {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]types.OHLCV{}, s.hist[mint]...)
}

// record folds one price sample into the current second's candle.
func (s *priceLine) record(mint string, price float64, sec int64) {
	if price <= 0 {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	h := s.hist[mint]
	if n := len(h); n > 0 && h[n-1].Time == sec {
		c := &h[n-1]
		c.Close = price
		if price > c.High {
			c.High = price
		}
		if price < c.Low {
			c.Low = price
		}
		return
	} else if n > 0 && h[n-1].Time > sec {
		return // seed is ahead of the clock; skip
	}
	h = append(h, types.OHLCV{Time: sec, Open: price, High: price, Low: price, Close: price})
	if len(h) > plMaxPts {
		h = h[len(h)-plMaxPts:]
	}
	s.hist[mint] = h
}

// activeMints evicts stale watches and returns up to plMaxWatched recent mints.
func (s *priceLine) activeMints() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	out := make([]string, 0, len(s.watch))
	for m, t := range s.watch {
		if now.Sub(t) > plWatchTTL {
			delete(s.watch, m)
			delete(s.hist, m)
			delete(s.seeded, m)
			continue
		}
		out = append(out, m)
	}
	if len(out) > plMaxWatched {
		out = out[:plMaxWatched]
	}
	return out
}

func (s *priceLine) run(ctx context.Context) {
	t := time.NewTicker(plTick)
	defer t.Stop()
	var tick int64
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			tick++
			sec := time.Now().Unix()
			// Focused token(s): every tick (1s) for dense live candles.
			fastList, fastSet := s.fastMints()
			for _, m := range fastList {
				if px := s.fn(ctx, m); px > 0 {
					s.record(m, px, sec)
				}
			}
			// Warm pool: every Nth tick (2s) — skip any already sampled as fast.
			if tick%plSlowEvery == 0 {
				for _, m := range s.activeMints() {
					if fastSet[m] {
						continue
					}
					if px := s.fn(ctx, m); px > 0 {
						s.record(m, px, sec)
					}
				}
			}
		}
	}
}
