package pumpfun

import (
	"context"
	"sort"
	"sync"

	"solismarket/server/internal/types"
)

// PriceFeed serves live prices to the ws hub from pump.fun's List (replacing
// Jupiter) and derives the SOL/USD rate from the same data. GRADUATED tokens are
// priced here (the firehose's pump-amm price isn't a clean SOL/token value);
// bonding-curve tokens are priced live off the firehose instead, so this feed
// deliberately only carries the completed ones.
type PriceFeed struct {
	mu  sync.RWMutex
	px  map[string]float64 // mint -> USD price (graduated tokens only)
	sol float64            // SOL/USD
}

func NewPriceFeed() *PriceFeed { return &PriceFeed{px: map[string]float64{}} }

// Refresh replaces the price map + SOL rate from a fresh List fetch.
func (f *PriceFeed) Refresh(coins []Coin) {
	px := make(map[string]float64, len(coins))
	ratios := make([]float64, 0, len(coins))
	for _, c := range coins {
		if c.Complete && c.Price > 0 {
			px[c.Mint] = c.Price
		}
		if c.MarketCapSol > 0 && c.MarketCapUSD > 0 {
			ratios = append(ratios, c.MarketCapUSD/c.MarketCapSol)
		}
	}
	sol := 0.0
	if len(ratios) > 0 {
		sort.Float64s(ratios)
		sol = ratios[len(ratios)/2] // median SOL/USD, robust to a stray coin
	}
	f.mu.Lock()
	f.px = px
	if sol > 0 {
		f.sol = sol
	}
	f.mu.Unlock()
}

// Prices implements the hub's Pricer: cached USD prices for the mints it knows
// (graduated tokens), skipping the rest (priced by the firehose).
func (f *PriceFeed) Prices(_ context.Context, mints []string) (map[string]types.PriceTick, error) {
	if f == nil {
		return nil, nil
	}
	f.mu.RLock()
	defer f.mu.RUnlock()
	out := make(map[string]types.PriceTick, len(mints))
	for _, m := range mints {
		if p, ok := f.px[m]; ok {
			out[m] = types.PriceTick{Price: p}
		}
	}
	return out, nil
}

// Sol returns the current SOL/USD rate (0 until the first refresh).
func (f *PriceFeed) Sol() float64 {
	if f == nil {
		return 0
	}
	f.mu.RLock()
	defer f.mu.RUnlock()
	return f.sol
}
