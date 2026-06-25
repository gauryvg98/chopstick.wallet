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

type Universe struct {
	mu   sync.Mutex
	news []types.DiscoveryToken
	grad []types.DiscoveryToken

	// logo enrichment: pump.fun tokens arrive without an image, so we resolve it
	// lazily (once per mint) off the hot path and cache it here.
	images  map[string]string         // mint -> logo URL
	tried   map[string]bool           // mint -> already attempted (success or not)
	resolve func(string) (string, bool) // injected (pump.fun lookup)
}

func New() *Universe {
	return &Universe{images: map[string]string{}, tried: map[string]bool{}}
}

// SetLogoResolver wires the function used to fetch a token's logo (pump.fun).
func (u *Universe) SetLogoResolver(fn func(string) (string, bool)) {
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
// resolved logos filled in.
func (u *Universe) Snapshot() (news, grad []types.DiscoveryToken) {
	u.mu.Lock()
	defer u.mu.Unlock()
	news = u.withLogos(u.news)
	grad = u.withLogos(u.grad)
	return news, grad
}

func (u *Universe) withLogos(in []types.DiscoveryToken) []types.DiscoveryToken {
	out := make([]types.DiscoveryToken, len(in))
	copy(out, in)
	for i := range out {
		if out[i].LogoURI == nil {
			if logo, ok := u.images[out[i].Address]; ok && logo != "" {
				l := logo
				out[i].LogoURI = &l
			}
		}
	}
	return out
}

// EnrichLogos resolves missing pump.fun logos a few at a time, off the request
// path, so the New/Graduating feeds show real meme images instead of initials.
func (u *Universe) EnrichLogos(ctx context.Context) {
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
			delete(u.images, m)
		}
	}
	u.mu.Unlock()

	for _, mint := range todo {
		if ctx.Err() != nil {
			return
		}
		if logo, ok := resolve(mint); ok && logo != "" {
			u.mu.Lock()
			u.images[mint] = logo
			u.mu.Unlock()
		}
	}
}
