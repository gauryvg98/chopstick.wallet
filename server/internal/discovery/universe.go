// Package discovery maintains a live, in-memory "token universe" fed by the
// real-time PumpPortal stream. Discovery feeds are read from here, so client
// requests never touch an upstream — the stream cost is constant.
package discovery

import (
	"context"
	"sync"
	"time"

	"chadwallet/server/internal/types"
)

const (
	maxNew  = 60
	maxGrad = 40
)

// Meta is the pump.fun-resolved data we backfill onto discovery tokens whose
// stream events arrived without it. Graduation events in particular carry only
// the mint — no symbol/name/market cap — so without this they'd render blank.
type Meta struct {
	Symbol    string
	Name      string
	MarketCap float64
	Logo      string
}

type Universe struct {
	mu   sync.Mutex
	news []types.DiscoveryToken
	grad []types.DiscoveryToken

	// metadata enrichment: pump.fun tokens (esp. graduations) arrive missing
	// fields, so we resolve them lazily (once per mint) off the hot path and
	// cache them here.
	meta    map[string]Meta          // mint -> resolved metadata
	tried   map[string]bool          // mint -> already attempted (success or not)
	resolve func(string) (Meta, bool) // injected (pump.fun lookup)
}

func New() *Universe {
	return &Universe{meta: map[string]Meta{}, tried: map[string]bool{}}
}

// SetResolver wires the function used to backfill a token's metadata
// (symbol/name/market cap/logo) from pump.fun.
func (u *Universe) SetResolver(fn func(string) (Meta, bool)) {
	u.mu.Lock()
	u.resolve = fn
	u.mu.Unlock()
}

func prepend(list []types.DiscoveryToken, t types.DiscoveryToken, max int) []types.DiscoveryToken {
	// Drop any existing entry for this mint, then prepend (newest first).
	out := make([]types.DiscoveryToken, 0, len(list)+1)
	out = append(out, t)
	for _, x := range list {
		if x.Address == t.Address {
			continue
		}
		out = append(out, x)
		if len(out) >= max {
			break
		}
	}
	return out
}

func (u *Universe) AddNew(t types.DiscoveryToken) {
	u.mu.Lock()
	u.news = prepend(u.news, t, maxNew)
	u.mu.Unlock()
}

func (u *Universe) AddMigration(t types.DiscoveryToken) {
	u.mu.Lock()
	u.grad = prepend(u.grad, t, maxGrad)
	u.mu.Unlock()
}

// Get returns a discovered token by mint, if we've seen it (used as a fallback
// for brand-new tokens not yet indexed by the DEX data sources).
func (u *Universe) Get(mint string) (types.DiscoveryToken, bool) {
	u.mu.Lock()
	defer u.mu.Unlock()
	for _, t := range u.news {
		if t.Address == mint {
			return t, true
		}
	}
	for _, t := range u.grad {
		if t.Address == mint {
			return t, true
		}
	}
	return types.DiscoveryToken{}, false
}

// Snapshot returns copies of the current new + graduating feeds, with any
// resolved metadata (logo/symbol/name/market cap) filled in.
func (u *Universe) Snapshot() (news, grad []types.DiscoveryToken) {
	u.mu.Lock()
	defer u.mu.Unlock()
	news = u.withMeta(u.news)
	grad = u.withMeta(u.grad)
	return news, grad
}

// withMeta backfills any field the stream event didn't carry from the resolved
// pump.fun metadata cache — only filling what's actually missing.
func (u *Universe) withMeta(in []types.DiscoveryToken) []types.DiscoveryToken {
	out := make([]types.DiscoveryToken, len(in))
	copy(out, in)
	for i := range out {
		m, ok := u.meta[out[i].Address]
		if !ok {
			continue
		}
		if out[i].LogoURI == nil && m.Logo != "" {
			l := m.Logo
			out[i].LogoURI = &l
		}
		if out[i].Symbol == "" && m.Symbol != "" {
			out[i].Symbol = m.Symbol
		}
		if out[i].Name == "" && m.Name != "" {
			out[i].Name = m.Name
		}
		if out[i].MarketCap == 0 && m.MarketCap > 0 {
			out[i].MarketCap = m.MarketCap
		}
	}
	return out
}

// EnrichMeta resolves missing pump.fun metadata (logo/symbol/name/market cap) a
// few mints at a time, off the request path, so the New/Graduating feeds show
// real names + images + caps instead of blanks.
func (u *Universe) EnrichMeta(ctx context.Context) {
	t := time.NewTicker(700 * time.Millisecond)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			u.enrichOnce(ctx)
		}
	}
}

func (u *Universe) enrichOnce(ctx context.Context) {
	// Collect a few un-tried mints (newest first) + the set of live mints.
	u.mu.Lock()
	resolve := u.resolve
	if resolve == nil {
		u.mu.Unlock()
		return
	}
	live := make(map[string]bool, len(u.news)+len(u.grad))
	var todo []string
	for _, lst := range [][]types.DiscoveryToken{u.news, u.grad} {
		for _, t := range lst {
			live[t.Address] = true
			if !u.tried[t.Address] && len(todo) < 3 {
				todo = append(todo, t.Address)
				u.tried[t.Address] = true // mark up front so we don't re-queue
			}
		}
	}
	// Prune caches for mints that have aged out of both feeds.
	for m := range u.tried {
		if !live[m] {
			delete(u.tried, m)
			delete(u.meta, m)
		}
	}
	u.mu.Unlock()

	for _, mint := range todo {
		if ctx.Err() != nil {
			return
		}
		if m, ok := resolve(mint); ok {
			u.mu.Lock()
			u.meta[mint] = m
			u.mu.Unlock()
		}
	}
}
