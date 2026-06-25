// Package livetrades buffers real-time bonding-curve trades (from PumpPortal)
// per mint, and assembles a live price line (OHLCV candles) from them — the
// data DEX sources don't have for pre-graduation pump.fun tokens.
package livetrades

import (
	"sort"
	"sync"

	"chadwallet/server/internal/types"
)

const maxPerMint = 200

type Store struct {
	mu sync.Mutex
	m  map[string][]types.Trade // mint -> newest-first
}

func New() *Store { return &Store{m: make(map[string][]types.Trade)} }

// Add records a trade for a mint (newest-first, capped).
func (s *Store) Add(mint string, t types.Trade) {
	s.mu.Lock()
	defer s.mu.Unlock()
	list := append([]types.Trade{t}, s.m[mint]...)
	if len(list) > maxPerMint {
		list = list[:maxPerMint]
	}
	s.m[mint] = list
}

// Trades returns the buffered trades for a mint (newest-first).
func (s *Store) Trades(mint string) []types.Trade {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append(make([]types.Trade, 0, len(s.m[mint])), s.m[mint]...)
}

// Candles builds a per-second OHLCV series from the buffered trades, so the
// chart shows a real price line that grows as trades arrive.
func (s *Store) Candles(mint string) []types.OHLCV {
	s.mu.Lock()
	trades := append([]types.Trade(nil), s.m[mint]...)
	s.mu.Unlock()
	if len(trades) == 0 {
		return []types.OHLCV{}
	}
	// Oldest → newest.
	sort.Slice(trades, func(i, j int) bool { return trades[i].Timestamp < trades[j].Timestamp })

	bySec := make(map[int64]*types.OHLCV)
	var order []int64
	for _, t := range trades {
		if t.PriceUsd <= 0 {
			continue
		}
		sec := t.Timestamp / 1000
		c, ok := bySec[sec]
		if !ok {
			c = &types.OHLCV{Time: sec, Open: t.PriceUsd, High: t.PriceUsd, Low: t.PriceUsd, Close: t.PriceUsd}
			bySec[sec] = c
			order = append(order, sec)
		}
		if t.PriceUsd > c.High {
			c.High = t.PriceUsd
		}
		if t.PriceUsd < c.Low {
			c.Low = t.PriceUsd
		}
		c.Close = t.PriceUsd
		c.Volume += t.AmountUsd
	}
	sort.Slice(order, func(i, j int) bool { return order[i] < order[j] })
	out := make([]types.OHLCV, 0, len(order))
	for _, sec := range order {
		out = append(out, *bySec[sec])
	}
	return out
}
