package freedata

import (
	"math"
	"strings"

	"solismarket/server/internal/types"
)

// Deterministic synth fallback for holders when an upstream is empty. Trades are
// never synthesized — a real-or-empty trades panel is honest; fake fills are not.

func hash(s string) uint32 {
	var h uint32 = 2166136261
	for i := 0; i < len(s); i++ {
		h ^= uint32(s[i])
		h *= 16777619
	}
	return h
}

type prng struct{ s uint32 }

func newPRNG(seed string) *prng {
	h := hash(seed)
	if h == 0 {
		h = 1
	}
	return &prng{s: h}
}

func (p *prng) next() float64 {
	p.s ^= p.s << 13
	p.s ^= p.s >> 17
	p.s ^= p.s << 5
	return float64(p.s) / float64(math.MaxUint32)
}

const b58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

func (p *prng) addr() string {
	var b strings.Builder
	for i := 0; i < 44; i++ {
		b.WriteByte(b58[int(p.next()*float64(len(b58)))%len(b58)])
	}
	return b.String()
}

// sparkline builds a stable price series ending at the current price.
func sparkline(seed string, price, change float64) []float64 {
	r := newPRNG(seed + "spark")
	drift := change / 100
	const n = 24
	out := make([]float64, n)
	p := price / (1 + drift)
	for i := 0; i < n; i++ {
		p *= 1 + drift/n + (r.next()-0.5)*0.04
		out[i] = p
	}
	out[n-1] = price
	return out
}

func synthHolders(mint string, price, supply float64) []types.Holder {
	if supply == 0 {
		supply = 1_000_000_000
	}
	mc := price * supply
	r := newPRNG(mint + "holders")
	out := make([]types.Holder, 0, 20)
	remaining := 60.0
	for i := 0; i < 20; i++ {
		var share float64
		if i < 3 {
			share = remaining * (0.18 + r.next()*0.1)
		} else {
			share = remaining * (0.03 + r.next()*0.05)
		}
		pct := math.Max(0.05, math.Min(share, remaining))
		remaining = math.Max(0, remaining-pct)
		out = append(out, types.Holder{
			Rank: i + 1, Address: r.addr(), Pct: pct,
			ValueUsd: pct / 100 * mc, TokenAmount: pct / 100 * supply,
		})
	}
	return out
}
