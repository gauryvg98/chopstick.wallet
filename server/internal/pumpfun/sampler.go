package pumpfun

import (
	"context"
	"sync"
	"time"

	"chadwallet/server/internal/types"
)

const (
	sampleEvery  = 3 * time.Second
	maxWatched   = 12
	watchTTL     = 90 * time.Second
	maxHistPts   = 300
)

// Sampler builds a live price line for bonding-curve tokens by polling pump.fun
// (free) for the tokens currently being viewed. It's the keyless alternative to
// PumpPortal's gated per-token trade stream.
type Sampler struct {
	cl    *Client
	mu    sync.Mutex
	watch map[string]time.Time   // mint -> last access
	hist  map[string][]types.OHLCV
}

func NewSampler(cl *Client) *Sampler {
	return &Sampler{cl: cl, watch: map[string]time.Time{}, hist: map[string][]types.OHLCV{}}
}

// Watch marks a mint as actively viewed so it gets sampled.
func (s *Sampler) Watch(mint string) {
	s.mu.Lock()
	s.watch[mint] = time.Now()
	s.mu.Unlock()
}

// Candles returns the sampled per-second price line for a mint.
func (s *Sampler) Candles(mint string) []types.OHLCV {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]types.OHLCV{}, s.hist[mint]...)
}

func (s *Sampler) record(mint string, price float64) {
	if price <= 0 {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	sec := time.Now().Unix()
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
	} else {
		h = append(h, types.OHLCV{Time: sec, Open: price, High: price, Low: price, Close: price})
		if len(h) > maxHistPts {
			h = h[len(h)-maxHistPts:]
		}
	}
	s.hist[mint] = h
}

// activeMints evicts stale watches and returns up to maxWatched recent mints.
func (s *Sampler) activeMints() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	out := make([]string, 0, len(s.watch))
	for m, t := range s.watch {
		if now.Sub(t) > watchTTL {
			delete(s.watch, m)
			delete(s.hist, m)
			continue
		}
		out = append(out, m)
	}
	if len(out) > maxWatched {
		out = out[:maxWatched]
	}
	return out
}

func (s *Sampler) Run(ctx context.Context) {
	t := time.NewTicker(sampleEvery)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			for _, m := range s.activeMints() {
				if td, err := s.cl.Coin(ctx, m); err == nil {
					s.record(m, td.PriceUsd)
				}
			}
		}
	}
}
