package freedata

import (
	"context"
	"errors"
	"sort"
	"sync"
	"time"

	"chadwallet/server/internal/helius"
	"chadwallet/server/internal/pumpfun"
	"chadwallet/server/internal/types"
)

// Provider implements provider.Provider entirely on free sources.
type Provider struct {
	dex    *dexClient
	gt     *gtClient
	he     *helius.Client                            // optional — real holders
	pf     *pumpfun.Client                           // optional — bonding-curve tokens
	lookup func(string) (types.DiscoveryToken, bool) // optional — discovery fallback
	pools  sync.Map                                  // mint -> pool address

	bigMu      sync.Mutex
	big        []types.TrendingToken // dynamic large caps surfaced by the trending fetch
	bigCurated []types.TrendingToken // sticky baseline (curated + top pools), survives trending resets

	ownedMu sync.Mutex
	owned   map[string]time.Time // mints held by recently-seen wallets (TTL'd)

	// live sub-minute price line (we sample the price ourselves)
	pl       *priceLine
	extPrice func(context.Context, string) float64 // optional fresher price (Jupiter)

	// live bonding-curve trades (PumpPortal), for tokens not yet on a DEX
	ensureSub   func(string)
	liveTrades  func(string) []types.Trade
	liveCandles func(string) []types.OHLCV
}

// SetLive wires the live bonding-curve trade stream: ensureSub subscribes a
// mint, liveTrades/liveCandles read its buffered trades + price line.
func (p *Provider) SetLive(
	ensureSub func(string),
	liveTrades func(string) []types.Trade,
	liveCandles func(string) []types.OHLCV,
) {
	p.ensureSub, p.liveTrades, p.liveCandles = ensureSub, liveTrades, liveCandles
}

func New(he *helius.Client) *Provider {
	p := &Provider{dex: newDex(), gt: newGT(), he: he, owned: map[string]time.Time{}}
	p.pl = newPriceLine(p.samplePrice)
	return p
}

// SetSamplerPrice wires a fresher price source (e.g. Jupiter) tried first when
// sampling the live price line; the DEX price is the fallback.
func (p *Provider) SetSamplerPrice(fn func(context.Context, string) float64) { p.extPrice = fn }

// RunSampler starts the background price-line loop. Call once with a long-lived
// context.
func (p *Provider) RunSampler(ctx context.Context) { p.pl.run(ctx) }

// samplePrice resolves a live price for the sampler: Jupiter first (freshest),
// then DEX, then pump.fun.
func (p *Provider) samplePrice(ctx context.Context, mint string) float64 {
	if p.extPrice != nil {
		if px := p.extPrice(ctx, mint); px > 0 {
			return px
		}
	}
	return p.priceFor(ctx, mint)
}

// priceFor resolves the current price from a DEX, else pump.fun.
func (p *Provider) priceFor(ctx context.Context, mint string) float64 {
	if td, _, err := p.dex.token(ctx, mint); err == nil && td.PriceUsd > 0 {
		return td.PriceUsd
	}
	if p.pf != nil {
		if t, e := p.pf.Coin(ctx, mint); e == nil {
			return t.PriceUsd
		}
	}
	return 0
}

// SetPumpfun wires the pump.fun client for brand-new bonding-curve tokens.
func (p *Provider) SetPumpfun(pf *pumpfun.Client) { p.pf = pf }

// SetLookup wires a discovery lookup used to serve brand-new tokens that aren't
// on a DEX yet (still on the pump.fun bonding curve).
func (p *Provider) SetLookup(f func(string) (types.DiscoveryToken, bool)) {
	p.lookup = f
}

// HasHelius reports whether real holders are available.
func (p *Provider) HasHelius() bool { return p.he != nil }

// Holdings reads a wallet's on-chain balances via Helius RPC. Requires a Helius
// key; returns empty otherwise.
func (p *Provider) Holdings(ctx context.Context, owner string) (*types.WalletHoldings, error) {
	if p.he == nil {
		return &types.WalletHoldings{Tokens: []types.TokenBalance{}}, nil
	}
	h, err := p.he.Holdings(ctx, owner)
	if err == nil && h != nil {
		now := time.Now()
		p.ownedMu.Lock()
		for _, t := range h.Tokens {
			if t.Mint != "" {
				p.owned[t.Mint] = now
			}
		}
		p.ownedMu.Unlock()
	}
	return h, err
}

// Positions reconstructs per-token cost basis + realized PnL from the wallet's
// on-chain swap history (no DB). Requires Helius; empty otherwise.
func (p *Provider) Positions(ctx context.Context, owner string) (*types.WalletPositions, error) {
	if p.he == nil {
		return &types.WalletPositions{Positions: []types.Position{}}, nil
	}
	return p.he.Positions(ctx, owner)
}

// Activity returns the wallet's recent swaps/transfers + deposit/fee totals,
// reconstructed from chain history (no DB). Requires Helius; empty otherwise.
func (p *Provider) Activity(ctx context.Context, owner string) (*types.WalletActivity, error) {
	if p.he == nil {
		return &types.WalletActivity{Items: []types.ActivityItem{}}, nil
	}
	return p.he.Activity(ctx, owner)
}

// OwnedMints returns the token mints held by any recently-seen wallet (TTL'd).
// These get top priority in the live-price set and the sub-minute sampler pool,
// so a user's own tokens always tick and chart instantly.
func (p *Provider) OwnedMints() []string {
	const ttl = 10 * time.Minute
	cut := time.Now().Add(-ttl)
	p.ownedMu.Lock()
	defer p.ownedMu.Unlock()
	out := make([]string, 0, len(p.owned))
	for m, at := range p.owned {
		if at.Before(cut) {
			delete(p.owned, m)
			continue
		}
		out = append(out, m)
	}
	return out
}

// Broadcast relays a base64 signed transaction to the chain via Helius RPC.
func (p *Provider) Broadcast(ctx context.Context, signedTxB64 string) (string, error) {
	if p.he == nil {
		return "", errors.New("broadcast unavailable: no RPC configured")
	}
	return p.he.SendTransaction(ctx, signedTxB64)
}

// TxStatus reports a signature's confirmation status via Helius RPC.
func (p *Provider) TxStatus(ctx context.Context, sig string) (string, error) {
	if p.he == nil {
		return "", errors.New("tx status unavailable: no RPC configured")
	}
	return p.he.SignatureStatus(ctx, sig)
}

// RPCProxy relays a raw JSON-RPC body to Helius (the frontend signer's RPC).
func (p *Provider) RPCProxy(ctx context.Context, body []byte) ([]byte, error) {
	if p.he == nil {
		return nil, errors.New("rpc unavailable: no RPC configured")
	}
	return p.he.Forward(ctx, body)
}

// WatchSubMinute keeps the price-line sampler running for a mint so that its
// sub-minute (1s/5s/30s) history is already built when the user switches to
// those timeframes — instead of starting cold and empty. It's cheap: the
// sampler records from the hub's already-fetched price (no extra upstream call).
func (p *Provider) WatchSubMinute(mint string) { p.pl.watchMint(mint) }

// WatchSubMinuteFast marks the focused token for dense 1s sampling (vs the warm
// pool's 2s). Refreshed each tick while the chart is open.
func (p *Provider) WatchSubMinuteFast(mint string) { p.pl.watchFast(mint) }

// SampledPrice returns the latest sampled price for a watched mint — the fallback
// the websocket candle stream uses for tokens Jupiter doesn't price (e.g. fresh
// pump.fun coins, which the sampler prices via DexScreener).
func (p *Provider) SampledPrice(mint string) (float64, bool) {
	// graduated sub-minute path (our own price-line sampler)
	if cs := p.pl.candles(mint); len(cs) > 0 && cs[len(cs)-1].Close > 0 {
		return cs[len(cs)-1].Close, true
	}
	// bonding-curve path (pump.fun sampler, wired via SetLive)
	if p.liveCandles != nil {
		if cs := p.liveCandles(mint); len(cs) > 0 && cs[len(cs)-1].Close > 0 {
			return cs[len(cs)-1].Close, true
		}
	}
	return 0, false
}

func (p *Provider) Trending(ctx context.Context) ([]types.TrendingToken, error) {
	tr, big, pools, err := p.gt.trending(ctx)
	if err != nil {
		return nil, err
	}
	for mint, pool := range pools {
		p.pools.Store(mint, pool)
	}
	p.bigMu.Lock()
	p.big = big
	p.bigMu.Unlock()
	return tr, nil
}

// Big returns the BIG list: the sticky curated baseline merged with whatever
// large caps the latest trending fetch surfaced — deduped, largest first. The
// baseline means a trending reset (or a GeckoTerminal 429) can never shrink it.
func (p *Provider) Big() []types.TrendingToken {
	p.bigMu.Lock()
	defer p.bigMu.Unlock()
	seen := map[string]bool{}
	merged := make([]types.TrendingToken, 0, len(p.bigCurated)+len(p.big))
	for _, src := range [][]types.TrendingToken{p.bigCurated, p.big} {
		for _, t := range src {
			if t.Address == "" || seen[t.Address] {
				continue
			}
			seen[t.Address] = true
			merged = append(merged, t)
		}
	}
	sort.Slice(merged, func(i, j int) bool { return merged[i].MarketCap > merged[j].MarketCap })
	if len(merged) > 30 {
		merged = merged[:30]
	}
	for i := range merged {
		merged[i].Rank = i + 1
	}
	return merged
}

// RefreshBig refreshes the sticky curated baseline from a curated large-cap set
// plus GeckoTerminal's top pools. It NEVER shrinks on a partial failure: if the
// authoritative curated call 429s, we keep the existing baseline (merging in any
// fresh top-pools). Called on a slow cadence by a background goroutine.
func (p *Provider) RefreshBig(ctx context.Context) {
	curated, _ := p.gt.curatedBig(ctx)
	pools, _ := p.gt.bigPools(ctx)

	p.bigMu.Lock()
	defer p.bigMu.Unlock()
	seen := map[string]bool{}
	var next []types.TrendingToken
	add := func(list []types.TrendingToken) {
		for _, t := range list {
			if t.Address == "" || seen[t.Address] {
				continue
			}
			seen[t.Address] = true
			next = append(next, t)
		}
	}
	add(curated)
	add(pools)
	switch {
	case len(curated) > 0:
		// Curated is the authoritative baseline — adopt the fresh set.
		p.bigCurated = next
	case len(next) > 0:
		// Only top-pools came back — merge into the existing baseline so we never
		// lose the curated blue-chips to a transient 429.
		add(p.bigCurated)
		p.bigCurated = next
		// default: both failed → keep last good (sticky).
	}
}

func (p *Provider) Banner(ctx context.Context) ([]types.Token, error) {
	tr, err := p.Trending(ctx)
	if err != nil {
		return nil, err
	}
	n := len(tr)
	if n > 16 {
		n = 16
	}
	out := make([]types.Token, 0, n)
	for _, t := range tr[:n] {
		out = append(out, t.Token)
	}
	return out, nil
}

func (p *Provider) Token(ctx context.Context, mint string) (*types.TokenDetail, error) {
	td, pool, err := p.dex.token(ctx, mint)
	if err != nil {
		// Not on a DEX yet — pull real bonding-curve data from pump.fun
		// (price, market cap, logo). This is how brand-new tokens work.
		if p.pf != nil {
			if t, e := p.pf.Coin(ctx, mint); e == nil {
				return t, nil
			}
		}
		// Last resort: whatever discovery saw, so the page still renders.
		if p.lookup != nil {
			if d, ok := p.lookup(mint); ok {
				return &types.TokenDetail{Token: types.Token{
					Address: mint, Symbol: d.Symbol, Name: d.Name,
					LogoURI: d.LogoURI, MarketCap: d.MarketCap,
				}}, nil
			}
		}
		return nil, err
	}
	if pool != "" {
		p.pools.Store(mint, pool)
	}
	// Top-10 concentration is computed client-side from the (parallel) holders
	// call, so the token header isn't blocked on Helius here.
	return td, nil
}

// priceSupplyFor resolves price + supply from a DEX, else pump.fun.
func (p *Provider) priceSupplyFor(ctx context.Context, mint string) (price, supply float64) {
	if td, _, err := p.dex.token(ctx, mint); err == nil {
		return td.PriceUsd, td.TotalSupply
	}
	if p.pf != nil {
		if t, e := p.pf.Coin(ctx, mint); e == nil {
			return t.PriceUsd, t.TotalSupply
		}
	}
	return 0, 0
}

func (p *Provider) poolFor(ctx context.Context, mint string) (string, error) {
	if v, ok := p.pools.Load(mint); ok {
		return v.(string), nil
	}
	_, pool, err := p.dex.token(ctx, mint)
	if err != nil {
		return "", err
	}
	if pool != "" {
		p.pools.Store(mint, pool)
	}
	return pool, nil
}

func (p *Provider) OHLCV(ctx context.Context, mint string, tf types.Timeframe) ([]types.OHLCV, error) {
	pool, err := p.poolFor(ctx, mint)
	if err != nil {
		// Bonding-curve token — re-bucket the sampled price line to the tf.
		if p.ensureSub != nil {
			p.ensureSub(mint)
		}
		if p.liveCandles != nil {
			return lastN(bucketCandles(p.liveCandles(mint), tf.BucketSeconds()), 120), nil
		}
		return []types.OHLCV{}, nil
	}
	if tf.SubMinute() {
		// GeckoTerminal's OHLCV floor is 1m and its trade feed is sparse +
		// volume-thresholded, so it can't drive a 1s/5s/30s chart. Instead we
		// sample the live price ourselves (Jupiter/DEX) so the latest candle
		// keeps advancing while the token is open.
		bs := tf.BucketSeconds()
		p.pl.watchMint(mint)
		if p.pl.needsSeed(mint) {
			p.primeLine(ctx, mint, pool)
		}
		return lastN(bucketCandles(p.pl.candles(mint), bs), 120), nil
	}
	if tf == types.Tf1m {
		// 1m+ has full history on GeckoTerminal (300 candles ≈ 5h), so ALWAYS serve
		// it as the backbone — otherwise the chart only shows the window since we
		// started sampling this mint (i.e. since you opened it), not its real
		// history. The WS candle stream fills the live edge on top.
		//
		// On a GT failure we return the ERROR rather than substituting the sampler's
		// short window: the handler's cache serves the last-good full history
		// (stale-while-error), so a transient throttle can never collapse a healthy
		// 300-candle chart down to the dozen bars the sampler happens to hold.
		// (Returning a thin "success" here would defeat that cache and, with its 6s
		// TTL, hammer GT every 6s — keeping it throttled in a feedback loop.)
		p.pl.watchMint(mint)
		gctx, cancel := context.WithTimeout(ctx, 6*time.Second)
		cs, e := p.gt.ohlcv(gctx, pool, tf)
		cancel()
		if e != nil {
			return nil, e
		}
		return cs, nil
	}
	return p.gt.ohlcv(ctx, pool, tf)
}

// seedWindowSec bounds the historical backbone we pull from trades — generous
// enough that even the coarsest sub-minute timeframe (30s) shows a full window
// of candles, while keeping the live tail visible after auto-fit.
const seedWindowSec = 30 * 150

// primeLine gives a freshly-opened sub-minute chart immediate content: a real
// (if sparse) recent backbone from trades, plus a first live sample so the line
// is non-empty before the background sampler ticks. Runs once per mint (retried
// only if the first attempt was cold and produced nothing).
func (p *Provider) primeLine(ctx context.Context, mint, pool string) {
	px := p.samplePrice(ctx, mint)
	if px > 0 {
		p.pl.record(mint, px, time.Now().Unix())
	}
	tr, e := p.gt.trades(ctx, pool, px)
	if e != nil || len(tr) == 0 {
		return // leave unseeded so a later request retries once GT is warm
	}
	seed := trimSince(bucketTrades(tr, 1), time.Now().Unix()-seedWindowSec)
	p.pl.seed(mint, seed)
}

func (p *Provider) Holders(ctx context.Context, mint string) ([]types.Holder, error) {
	price, supply := p.priceSupplyFor(ctx, mint)
	if p.he != nil {
		if hs, err := p.he.Holders(ctx, mint, supply, price); err == nil && len(hs) > 0 {
			return hs, nil
		}
	}
	return synthHolders(mint, price, supply), nil
}

func (p *Provider) Trades(ctx context.Context, mint string) ([]types.Trade, error) {
	pool, err := p.poolFor(ctx, mint)
	if err != nil {
		// Bonding-curve token — subscribe + serve real PumpPortal trades.
		if p.ensureSub != nil {
			p.ensureSub(mint)
		}
		if p.liveTrades != nil {
			return p.liveTrades(mint), nil
		}
		return []types.Trade{}, nil
	}
	var price float64
	if td, _, e := p.dex.token(ctx, mint); e == nil {
		price = td.PriceUsd
	}
	tr, err := p.gt.trades(ctx, pool, price)
	if err != nil || len(tr) == 0 {
		return synthTrades(mint, price), nil
	}
	return tr, nil
}
