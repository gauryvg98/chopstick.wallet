// Command server is the SolisMarket backend: a small REST API that powers the
// frontend with Solana market data and swap quotes. It runs on free, keyless
// sources by default (DexScreener + GeckoTerminal + Jupiter, plus Helius for
// holders if a key is set), with a background poller so upstream calls scale
// with the number of tokens tracked, not the number of users. USE_MOCK=1
// serves deterministic mock data instead.
package main

import (
	"bufio"
	"context"
	"log"
	"math"
	"net/http"
	"os"
	"strings"
	"sync/atomic"
	"time"

	"solismarket/server/internal/cache"
	"solismarket/server/internal/discovery"
	"solismarket/server/internal/freedata"
	"solismarket/server/internal/helius"
	"solismarket/server/internal/httpapi"
	"solismarket/server/internal/jupiter"
	"solismarket/server/internal/livestats"
	"solismarket/server/internal/livetrades"
	"solismarket/server/internal/metrics"
	"solismarket/server/internal/mockdata"
	"solismarket/server/internal/provider"
	"solismarket/server/internal/pumpapi"
	"solismarket/server/internal/pumpfun"
	"solismarket/server/internal/types"
	"solismarket/server/internal/ws"
)

const solMint = "So11111111111111111111111111111111111111112"

func main() {
	loadDotEnv(".env")

	port := envOr("PORT", "8080")
	allowed := envOr("ALLOWED_ORIGIN", "*")
	heliusKey := os.Getenv("HELIUS_API_KEY")

	c := cache.New()
	ctx := context.Background()
	jup := jupiter.New()

	// Real-time latency metrics for the /status dashboard.
	mx := metrics.New()
	mx.Label("prices", "Price stream · Jupiter")
	mx.Label("discover", "Discover feed")
	mx.Label("trades", "Trade fetches")
	mx.Label("chart", "Chart fetches · OHLCV")
	mx.Label("wallet", "Wallet read · RPC")
	mx.Label("positions", "Positions / PnL")
	mx.Label("swap_build", "Swap build · Jupiter")
	mx.Label("swap_send", "Tx broadcast · RPC")
	mx.Label("tx_status", "Tx confirm poll · RPC")

	var prov provider.Provider
	var discover func() ([]types.DiscoveryToken, []types.DiscoveryToken)
	var fp *freedata.Provider // concrete handle for post-hub wiring
	var firehosePrice func(string) (float64, bool) // per-trade price, wired into the hub below

	if os.Getenv("USE_MOCK") == "1" {
		prov = mockdata.New()
		log.Println("data source: mock (USE_MOCK=1)")
	} else {
		var he *helius.Client
		if heliusKey != "" {
			he = helius.New(heliusKey)
		}
		fp = freedata.New(he)
		prov = fp
		// pollTrending is started AFTER fp.SetPumpfun below — its source is now
		// the pump.fun list, so it must not fire before the client is wired.
		// Large caps change slowly — refresh the BIG list every few minutes so it
		// barely adds to the pump.fun API's rate limit.
		go func() {
			time.Sleep(8 * time.Second) // let startup traffic settle first
			// Populate the sticky curated baseline fast, retrying through any
			// transient 429s; once it's full it stays full, so then settle to a
			// slow refresh.
			for {
				fp.RefreshBig(ctx)
				if len(fp.Big()) >= 10 {
					break
				}
				select {
				case <-ctx.Done():
					return
				case <-time.After(30 * time.Second):
				}
			}
			t := time.NewTicker(3 * time.Minute)
			defer t.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-t.C:
					fp.RefreshBig(ctx)
				}
			}
		}()

		// Sub-minute charts are sampled from DexScreener (priceFor) by default —
		// a separate quota from Jupiter — so the sampler doesn't contend with the
		// websocket price loop for Jupiter's rate limit. We additionally prefer
		// the hub's already-fetched Jupiter price when available (wired below,
		// once the hub exists) so the candles match the live head.
		go fp.RunSampler(ctx)
		holders := "synthesized holders"
		if he != nil {
			holders = "Helius holders"
		}
		log.Printf("data source: free — DexScreener + GeckoTerminal + %s (keyless)", holders)

		// Real-time discovery: stream new launches + migrations from PumpPortal
		// into an in-memory universe. mcap (in SOL) is converted with a SOL/USD
		// price refreshed off Jupiter.
		universe := discovery.New()
		discover = universe.Snapshot
		var solBits atomic.Uint64
		solPrice := func() float64 { return math.Float64frombits(solBits.Load()) }
		go func() {
			refresh := func() {
				if p, err := jup.Prices(ctx, []string{solMint}); err == nil {
					if v, ok := p[solMint]; ok {
						solBits.Store(math.Float64bits(v.Price))
					}
				}
			}
			refresh()
			t := time.NewTicker(30 * time.Second)
			defer t.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-t.C:
					refresh()
				}
			}
		}()
		// Serve brand-new bonding-curve tokens (not yet on a DEX) from pump.fun,
		// falling back to whatever the discovery stream saw.
		pf := pumpfun.New(solPrice)
		fp.SetPumpfun(pf)
		fp.SetLookup(universe.Get)
		// Now that the pump.fun client is wired, start the trending poller (its
		// feed is pure pump.fun: biggest live coins).
		go pollTrending(ctx, fp, c)

		// Backfill pump.fun metadata for the New/Graduating feeds (off the hot
		// path). Graduation events carry only the mint, so without this the
		// Graduating tab would show blank names + $0 market caps.
		universe.SetResolver(func(mint string) (discovery.Meta, bool) {
			t, e := pf.Coin(ctx, mint)
			if e != nil {
				return discovery.Meta{}, false
			}
			m := discovery.Meta{Symbol: t.Symbol, Name: t.Name, MarketCap: t.MarketCap}
			if t.LogoURI != nil {
				m.Logo = *t.LogoURI
			}
			return m, m.Symbol != "" || m.Name != "" || m.Logo != ""
		})
		go universe.EnrichMeta(ctx)

		// Live bonding-curve data comes from the pump.fun firehose (stream.pumpapi.io,
		// keyless): every create/trade/migration, with the trader's wallet and the
		// post-trade curve reserves. This feeds the real trades panel and a live
		// price line built from actual fills. The pump.fun poll sampler stays as a
		// fallback for tokens too quiet to produce trades while being viewed.
		sampler := pumpfun.NewSampler(pf)
		go sampler.Run(ctx)

		trades := livetrades.New()
		// Rolling volume/change per mint from every firehose trade (all pools) —
		// powers the graduated feeds' live "moving now" numbers + volume ranking.
		stats := livestats.New()
		go stats.Run(ctx)
		pa := pumpapi.New(universe.AddNew, universe.AddMigration, trades.Add, stats.Observe, solPrice)
		ensureSub := func(mint string) {
			sampler.Watch(mint)
			pa.Watch(mint)
		}
		// Prefer the real trade-built candle line; fall back to the sampler when a
		// viewed token hasn't produced buffered trades yet.
		liveCandles := func(mint string) []types.OHLCV {
			if cs := trades.Candles(mint); len(cs) > 0 {
				return cs
			}
			return sampler.Candles(mint)
		}
		fp.SetLive(ensureSub, trades.Trades, liveCandles)
		fp.SetLiveStats(stats.Snapshot)
		firehosePrice = stats.LastPrice // hub pushes these per-trade (wired below)
		go pa.Run(ctx)

		// Live-movers banner: actively-trading bonding-curve tokens (the ones that
		// pulse on the firehose), not the graduated blue-chips the old banner showed.
		// Metadata comes from the discovery universe, price/change from livestats;
		// the frontend subscribes these live so the ticker actually moves. Falls back
		// to the trending list until enough movers are trading.
		go func() {
			t := time.NewTicker(5 * time.Second)
			defer t.Stop()
			build := func() {
				news, grad := universe.Snapshot()
				movers := make([]types.Token, 0, 18)
				seen := map[string]bool{}
				for _, lst := range [][]types.DiscoveryToken{news, grad} {
					for _, d := range lst {
						if seen[d.Address] || d.Symbol == "" {
							continue
						}
						px, chg, _, ok := stats.Snapshot(d.Address)
						if !ok || px <= 0 {
							continue // only tokens actually trading right now
						}
						// Sanity: pump.fun tokens have ~1e9 supply, so a sane price is
						// ~marketCap/1e9. Skip a token whose last tick is wildly off that
						// (a thin-liquidity / post-graduation trade can report garbage) so
						// the banner never shows a bogus price.
						if d.MarketCap > 0 {
							expected := d.MarketCap / 1e9
							if px > expected*50 || px < expected/50 {
								continue
							}
						}
						seen[d.Address] = true
						movers = append(movers, types.Token{
							Address: d.Address, Symbol: d.Symbol, Name: d.Name,
							LogoURI: d.LogoURI, PriceUsd: px, Change24h: chg, MarketCap: d.MarketCap,
						})
						if len(movers) >= 18 {
							break
						}
					}
				}
				if len(movers) >= 6 {
					c.Put("banner", movers, 10*time.Minute)
					return
				}
				// Not enough movers yet (boot / quiet market) — fall back to the
				// trending list so the banner is never empty.
				if v, ok := c.Snapshot("trending"); ok {
					if tr, ok := v.([]types.TrendingToken); ok && len(tr) > 0 {
						fb := make([]types.Token, 0, 16)
						for _, t := range tr {
							fb = append(fb, t.Token)
							if len(fb) >= 16 {
								break
							}
						}
						c.Put("banner", fb, 10*time.Minute)
					}
				}
			}
			for {
				select {
				case <-ctx.Done():
					return
				case <-t.C:
					build()
				}
			}
		}()
	}

	// Live price stream: push batch prices for the trending warm set + any mint
	// a client subscribes to, so prices tick without each client polling.
	// warm is the set the price loop always keeps priced: trending + Big. Keeping
	// these priced means the sub-minute warm pool (below) can sample them from
	// cache for free — no per-token DEX fallback.
	warm := func() []string {
		seen := map[string]bool{}
		var out []string
		add := func(mints []string) {
			for _, m := range mints {
				if m != "" && !seen[m] {
					seen[m] = true
					out = append(out, m)
				}
			}
		}
		// Owned tokens first — top priority so a user's holdings always tick.
		if fp != nil {
			add(fp.OwnedMints())
		}
		if v, ok := c.Snapshot("trending"); ok {
			if tr, ok := v.([]types.TrendingToken); ok {
				for _, t := range tr {
					add([]string{t.Address})
				}
			}
		}
		for _, t := range prov.Big() {
			add([]string{t.Address})
		}
		return out
	}
	hub := ws.NewHub(jup, warm)
	hub.SetObserver(mx.Observe)
	hub.SetLivePrice(firehosePrice) // trade-fresh prices for pump tokens (nil-safe)
	go hub.Run(ctx)

	// Push the discover feed (new + graduating + trending) over the websocket so
	// the sidebar updates in real time without polling /api/discover.
	hub.SetDiscoverFn(func() any {
		feeds := types.DiscoverFeeds{
			New:        []types.DiscoveryToken{},
			Graduating: []types.DiscoveryToken{},
			Trending:   []types.TrendingToken{},
			Big:        []types.TrendingToken{},
		}
		if discover != nil {
			feeds.New, feeds.Graduating = discover()
		}
		if v, ok := c.Snapshot("trending"); ok {
			if tr, ok := v.([]types.TrendingToken); ok {
				feeds.Trending = tr
			}
		}
		if big := prov.Big(); len(big) > 0 {
			feeds.Big = big
		}
		return feeds
	})
	// Push recent trades per focused token (one shared upstream fetch, fanned out
	// to every viewer) instead of each client polling. Marked high-priority — the
	// trades feed is for the token you're looking at, so it jumps the GeckoTerminal
	// queue alongside that token's chart.
	tctx := freedata.WithPriority(ctx)
	hub.SetTradesFn(func(mint string) any {
		if data, err := prov.Trades(tctx, mint); err == nil && data != nil {
			return data
		}
		return []types.Trade{}
	})

	// Let the sub-minute chart sampler reuse the hub's live (Jupiter) price for
	// the focused token, so the sampled candles match the live head — and it
	// costs no extra Jupiter calls. Returns 0 when the hub hasn't priced a mint
	// yet, in which case the provider falls back to DexScreener.
	if fp != nil {
		fp.SetSamplerPrice(func(_ context.Context, mint string) float64 {
			if p, ok := hub.PriceOf(mint); ok {
				return p
			}
			return 0
		})
		// Candle streams fall back to the sampler's price for mints Jupiter can't
		// price (fresh pump.fun tokens), so their charts stream live too.
		hub.SetSampledPrice(fp.SampledPrice)

		// Viewing a token marks it the *focused* token — sampled at 1s (denser
		// live candles) vs the warm pool's 2s. The hub refreshes this each tick
		// while the chart is open.
		hub.SetOnView(fp.WatchSubMinuteFast)
	}

	srv := httpapi.New(prov, jup, allowed, c, hub.ServeWS, discover)
	srv.SetMetrics(mx)

	httpServer := &http.Server{
		Addr:              ":" + port,
		Handler:           srv.Router(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	log.Printf("SolisMarket API listening on :%s (CORS: %s)", port, allowed)
	if err := httpServer.ListenAndServe(); err != nil {
		log.Fatalf("server error: %v", err)
	}
}

// pollTrending warms the trending + banner cache on an interval so user
// requests are served from cache and never trigger an upstream call.
func pollTrending(ctx context.Context, p *freedata.Provider, c *cache.Cache) {
	refresh := func() bool {
		tr, err := p.Trending(ctx)
		if err != nil || len(tr) == 0 {
			if err != nil {
				log.Printf("poller: trending refresh failed: %v", err)
			}
			return false // empty counts as a miss — don't publish a blank tab
		}
		// Long TTL: these keys are served straight from this in-memory snapshot
		// (handlers read via Snapshot, which never re-fetches), so the value must
		// outlive the poll cadence — the poller is the only writer.
		c.Put("trending", tr, 10*time.Minute)
		// Note: the "banner" cache is owned by the live-movers poller (it prefers
		// actively-trading bonding-curve tokens, and falls back to this trending
		// snapshot when too few are moving).
		return true
	}
	// On boot GeckoTerminal can be throttled, and there's no last-good snapshot to
	// fall back on yet — so keep retrying on a short interval until trending
	// populates (otherwise the tab sits empty for a full 150s cycle). Once it's
	// populated, the Snapshot serves that set through any later transient failure.
	if !refresh() {
		warm := time.NewTicker(20 * time.Second)
	bootstrap:
		for {
			select {
			case <-ctx.Done():
				warm.Stop()
				return
			case <-warm.C:
				if refresh() {
					break bootstrap
				}
			}
		}
		warm.Stop()
	}
	// Trending membership shifts over minutes; live prices ride the WS stream, not
	// this poll — so a slow cadence leaves GeckoTerminal almost entirely free for
	// the chart someone just opened (which jumps the queue at high priority anyway).
	t := time.NewTicker(150 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			refresh()
		}
	}
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// loadDotEnv loads KEY=VALUE lines from a .env file if present. Existing
// environment variables take precedence.
func loadDotEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		k, v, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		k = strings.TrimSpace(k)
		v = strings.Trim(strings.TrimSpace(v), `"'`)
		if _, exists := os.LookupEnv(k); !exists {
			_ = os.Setenv(k, v)
		}
	}
}
