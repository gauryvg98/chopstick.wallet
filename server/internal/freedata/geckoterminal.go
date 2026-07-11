package freedata

import (
	"context"
	"fmt"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"solismarket/server/internal/types"
)

// pickPrice returns whichever of a/b is closer to ref (the token's reference
// price), falling back to ref. Used to drop the quote-token side of a swap.
func pickPrice(a, b, ref float64) float64 {
	if ref <= 0 {
		if a > 0 {
			return a
		}
		return b
	}
	if a > 0 && (b <= 0 || math.Abs(a-ref) <= math.Abs(b-ref)) {
		return a
	}
	if b > 0 {
		return b
	}
	return ref
}

const gtBase = "https://api.geckoterminal.com/api/v2/networks/solana"

// notTradeable are quote/stable assets that surface as a pool's *base* token in
// GeckoTerminal trending (e.g. a USDC/USDT pair). They aren't memecoins to
// trade, and their huge tx counts would rocket them up our action ranking, so
// we drop them from trending entirely.
var notTradeable = map[string]bool{
	"So11111111111111111111111111111111111111112":  true, // wSOL
	"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v":  true, // USDC
	"Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB":  true, // USDT
	"7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs":  true, // wETH (Wormhole)
	"mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So":   true, // mSOL
	"J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn":  true, // jitoSOL
}

type gtClient struct {
	hc     *http.Client
	lim    *limiter
	tmu    sync.Mutex
	tcache map[string]tradeCacheEntry // pool -> recent trades (shared by chart + feed)
}

type tradeCacheEntry struct {
	trades []types.Trade
	at     time.Time
}

func newGT() *gtClient {
	return &gtClient{
		hc:     &http.Client{Timeout: 12 * time.Second},
		lim:    newLimiter(2200 * time.Millisecond), // GeckoTerminal anon ~30/min; 2.2s spacing leaves headroom + backs off on 429
		tcache: map[string]tradeCacheEntry{},
	}
}

type gtPool struct {
	Attributes struct {
		Address      string `json:"address"`
		Name         string `json:"name"`
		BasePriceUsd string `json:"base_token_price_usd"`
		MarketCap    string `json:"market_cap_usd"`
		Fdv          string `json:"fdv_usd"`
		Reserve      string `json:"reserve_in_usd"`
		Volume       struct {
			H1  string `json:"h1"`
			H24 string `json:"h24"`
		} `json:"volume_usd"`
		Change struct {
			H24 string `json:"h24"`
			H1  string `json:"h1"`
		} `json:"price_change_percentage"`
		Transactions struct {
			H1 struct {
				Buys  int `json:"buys"`
				Sells int `json:"sells"`
			} `json:"h1"`
		} `json:"transactions"`
	} `json:"attributes"`
	Relationships struct {
		BaseToken struct {
			Data struct {
				ID string `json:"id"`
			} `json:"data"`
		} `json:"base_token"`
	} `json:"relationships"`
}

// gtToken is a base-token record from the `included` array (?include=base_token).
type gtToken struct {
	ID         string `json:"id"`
	Type       string `json:"type"`
	Attributes struct {
		Name     string `json:"name"`
		Symbol   string `json:"symbol"`
		ImageURL string `json:"image_url"`
	} `json:"attributes"`
}

type gtTokenMeta struct {
	name, symbol, logo string
}

// trending returns the trending list plus a mint→pool map to cache.
//
// GeckoTerminal's trending order is weighted toward 24h volume + market cap, so
// it surfaces big-cap coasters and even idle pools whose "moment" was hours ago.
// We re-rank by *recent action* — last-hour trade velocity scaled by last-hour
// volume — and drop pools with no live activity, so the list reflects what's
// actually moving right now rather than what's merely large.
// bigCapUSD is the floor for the "BIG" list — established tokens well above a
// typical micro-cap shitcoin.
const bigCapUSD = 10_000_000

func (c *gtClient) trending(ctx context.Context) (trending, big []types.TrendingToken, pools map[string]string, err error) {
	pools = make(map[string]string)
	type scored struct {
		tok  types.TrendingToken
		heat float64
	}
	var rows []scored
	var bigRows []types.TrendingToken
	seen := make(map[string]bool)
	// Two pages (20/page) is a plenty-full list; fewer GeckoTerminal calls per
	// poll leaves more of its tight rate budget for the charts people open.
	// include=base_token gives us the real token name/symbol/logo (the pool's
	// own name is "FOO / SOL" and carries no image).
	for page := 1; page <= 2; page++ {
		var r struct {
			Data     []gtPool  `json:"data"`
			Included []gtToken `json:"included"`
		}
		url := gtBase + "/trending_pools?page=" + strconv.Itoa(page) + "&include=base_token"
		if e := getJSON(ctx, c.hc, c.lim, url, &r); e != nil {
			if page == 1 && len(rows) == 0 {
				return nil, nil, nil, e
			}
			break
		}
		meta := make(map[string]gtTokenMeta, len(r.Included))
		for _, t := range r.Included {
			if t.Type != "token" {
				continue
			}
			mint := strings.TrimPrefix(t.ID, "solana_")
			meta[mint] = gtTokenMeta{name: t.Attributes.Name, symbol: t.Attributes.Symbol, logo: cleanLogo(t.Attributes.ImageURL)}
		}
		for _, p := range r.Data {
			mint := strings.TrimPrefix(p.Relationships.BaseToken.Data.ID, "solana_")
			if mint == "" || seen[mint] || notTradeable[mint] {
				continue
			}
			seen[mint] = true
			a := p.Attributes
			pools[mint] = a.Address // cache the pool even if we filter it out of the list

			txH1 := a.Transactions.H1.Buys + a.Transactions.H1.Sells
			volH1 := pf(a.Volume.H1)

			m := meta[mint]
			sym := m.symbol
			name := m.name
			if sym == "" {
				sym = a.Name
				if i := strings.Index(sym, " / "); i >= 0 {
					sym = sym[:i]
				}
			}
			if name == "" {
				name = sym
			}
			var logo *string
			if m.logo != "" {
				logo = &m.logo
			}
			price := pf(a.BasePriceUsd)
			mc := pf(a.MarketCap)
			if mc == 0 {
				mc = pf(a.Fdv)
			}
			tok := types.TrendingToken{
				Token: types.Token{
					Address: mint, Symbol: sym, Name: name, LogoURI: logo,
					PriceUsd: price, Change24h: pf(a.Change.H24), Change1h: pf(a.Change.H1),
					MarketCap: mc, Liquidity: pf(a.Reserve), Volume24h: pf(a.Volume.H24),
				},
				Sparkline: sparkline(mint, price, pf(a.Change.H24)),
			}

			// BIG list: established large caps, regardless of moment-to-moment heat
			// (a calm $50M token still belongs here).
			if mc >= bigCapUSD {
				bigRows = append(bigRows, tok)
			}
			// Trending list: must have real recent action (drop idle coasters).
			if txH1 >= 12 && volH1 >= 500 {
				// Heat: trade count is the memecoin hype signal; the log-volume
				// factor keeps a few whale prints from outranking genuine churn.
				rows = append(rows, scored{tok: tok, heat: float64(txH1) * (1 + math.Log10(1+volH1))})
			}
		}
	}
	// Trending: hottest first.
	sort.Slice(rows, func(i, j int) bool { return rows[i].heat > rows[j].heat })
	trending = make([]types.TrendingToken, 0, len(rows))
	for i, r := range rows {
		r.tok.Rank = i + 1
		trending = append(trending, r.tok)
	}
	// BIG: largest first.
	sort.Slice(bigRows, func(i, j int) bool { return bigRows[i].MarketCap > bigRows[j].MarketCap })
	if len(bigRows) > 30 {
		bigRows = bigRows[:30]
	}
	for i := range bigRows {
		bigRows[i].Rank = i + 1
	}
	return trending, bigRows, pools, nil
}

// bigPools fetches GeckoTerminal's TOP pools (by liquidity/volume — the big
// established tokens, not just what's trending) and returns those above the big-
// cap floor, largest first. This is the proper source for the "BIG" tab; the
// trending subset alone is too sparse.
func (c *gtClient) bigPools(ctx context.Context) ([]types.TrendingToken, error) {
	out := make([]types.TrendingToken, 0, 40)
	seen := map[string]bool{}
	for page := 1; page <= 2; page++ {
		var r struct {
			Data     []gtPool  `json:"data"`
			Included []gtToken `json:"included"`
		}
		url := gtBase + "/pools?page=" + strconv.Itoa(page) + "&include=base_token&sort=h24_volume_usd_desc"
		if err := getJSON(ctx, c.hc, c.lim, url, &r); err != nil {
			if page == 1 {
				return nil, err
			}
			break
		}
		meta := make(map[string]gtTokenMeta, len(r.Included))
		for _, t := range r.Included {
			if t.Type == "token" {
				meta[strings.TrimPrefix(t.ID, "solana_")] = gtTokenMeta{name: t.Attributes.Name, symbol: t.Attributes.Symbol, logo: cleanLogo(t.Attributes.ImageURL)}
			}
		}
		for _, p := range r.Data {
			mint := strings.TrimPrefix(p.Relationships.BaseToken.Data.ID, "solana_")
			if mint == "" || seen[mint] || notTradeable[mint] {
				continue
			}
			a := p.Attributes
			mc := pf(a.MarketCap)
			if mc == 0 {
				mc = pf(a.Fdv)
			}
			if mc < bigCapUSD {
				continue
			}
			seen[mint] = true
			m := meta[mint]
			sym := m.symbol
			if sym == "" {
				sym = strings.SplitN(a.Name, " / ", 2)[0]
			}
			name := m.name
			if name == "" {
				name = sym
			}
			var logo *string
			if m.logo != "" {
				logo = &m.logo
			}
			price := pf(a.BasePriceUsd)
			out = append(out, types.TrendingToken{
				Token: types.Token{
					Address: mint, Symbol: sym, Name: name, LogoURI: logo,
					PriceUsd: price, Change24h: pf(a.Change.H24), Change1h: pf(a.Change.H1),
					MarketCap: mc, Liquidity: pf(a.Reserve), Volume24h: pf(a.Volume.H24),
				},
				Sparkline: sparkline(mint, price, pf(a.Change.H24)),
			})
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].MarketCap > out[j].MarketCap })
	if len(out) > 30 {
		out = out[:30]
	}
	for i := range out {
		out[i].Rank = i + 1
	}
	return out, nil
}

// curatedBigMints is a hand-picked set of well-known Solana large caps. The
// trending subset alone yields only a handful of >$10M tokens, and the top-pools
// feed is dominated by stablecoin pairs we filter out — so the "BIG" tab came up
// nearly empty. These reputable names give it a reliable floor. GeckoTerminal
// silently omits any unknown/dead mint from a multi-token response, so a stale or
// wrong entry here is simply skipped, never an error.
var curatedBigMints = []string{
	"DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", // BONK
	"JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",  // JUP
	"EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", // WIF (dogwifhat)
	"7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr", // POPCAT
	"jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL",  // JTO (Jito)
	"4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", // RAY (Raydium)
	"HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3", // PYTH
	"27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4", // JLP
	"85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ", // W (Wormhole)
	"MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5",  // MEW
	"ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ7i1eC",  // BOME (Book of Meme)
	"2qEHjDLDLbuBgRYvsxhc5D6uDWAivNFZGan56P1tpump", // PNUT (Peanut)
	"9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump", // FARTCOIN
	"2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv", // PENGU
	"Grass7B4RdKfBCjTKgSqnXkqjwiGvQyFbuSCUJr3XXjs", // GRASS
	"rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof",  // RENDER
	"orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",  // ORCA
	"WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk",  // WEN
}

// gtMultiToken is a token record from the /tokens/multi/{addrs} endpoint, which
// (unlike the pools feed) carries price/market-cap directly per token.
type gtMultiToken struct {
	ID         string `json:"id"`
	Type       string `json:"type"`
	Attributes struct {
		Address   string `json:"address"`
		Name      string `json:"name"`
		Symbol    string `json:"symbol"`
		ImageURL  string `json:"image_url"`
		PriceUsd  string `json:"price_usd"`
		MarketCap string `json:"market_cap_usd"`
		Fdv       string `json:"fdv_usd"`
		Reserve   string `json:"total_reserve_in_usd"`
		Volume    struct {
			H24 string `json:"h24"`
		} `json:"volume_usd"`
	} `json:"attributes"`
}

// curatedBig fetches the curated large-cap set in a single multi-token call and
// returns those still above the big-cap floor, with real price/mcap/logo. The
// price-change fields aren't on this endpoint, so change shows flat until the
// live price stream fills in.
func (c *gtClient) curatedBig(ctx context.Context) ([]types.TrendingToken, error) {
	url := gtBase + "/tokens/multi/" + strings.Join(curatedBigMints, ",")
	var r struct {
		Data []gtMultiToken `json:"data"`
	}
	if err := getJSON(ctx, c.hc, c.lim, url, &r); err != nil {
		return nil, err
	}
	out := make([]types.TrendingToken, 0, len(r.Data))
	for _, t := range r.Data {
		a := t.Attributes
		mint := a.Address
		if mint == "" {
			mint = strings.TrimPrefix(t.ID, "solana_")
		}
		if mint == "" || notTradeable[mint] {
			continue
		}
		price := pf(a.PriceUsd)
		mc := pf(a.MarketCap)
		if mc == 0 {
			mc = pf(a.Fdv)
		}
		if mc < bigCapUSD {
			continue
		}
		var logo *string
		if l := cleanLogo(a.ImageURL); l != "" {
			logo = &l
		}
		out = append(out, types.TrendingToken{
			Token: types.Token{
				Address: mint, Symbol: a.Symbol, Name: a.Name, LogoURI: logo,
				PriceUsd: price, MarketCap: mc, Liquidity: pf(a.Reserve), Volume24h: pf(a.Volume.H24),
			},
			Sparkline: sparkline(mint, price, 0),
		})
	}
	return out, nil
}

// cleanLogo drops GeckoTerminal's "missing.png" placeholders and blanks.
func cleanLogo(u string) string {
	if u == "" || strings.Contains(u, "missing.png") || u == "missing" {
		return ""
	}
	return u
}

var gtTF = map[types.Timeframe]struct {
	res    string
	agg    int
	limit  int
	bucket int64 // re-aggregate fetched candles to this size (0 = native)
}{
	// GeckoTerminal's finest is 1m; sub-minute is built from trades upstream.
	types.Tf1m:  {"minute", 1, 300, 0},
	types.Tf10m: {"minute", 5, 300, 600}, // 5m candles → 10m buckets
	types.Tf1h:  {"hour", 1, 300, 0},
	types.Tf4h:  {"hour", 4, 300, 0},
}

func (c *gtClient) ohlcv(ctx context.Context, pool string, tf types.Timeframe) ([]types.OHLCV, error) {
	cfg, ok := gtTF[tf]
	if !ok {
		cfg = gtTF[types.Tf1m]
	}
	url := fmt.Sprintf("%s/pools/%s/ohlcv/%s?aggregate=%d&limit=%d", gtBase, pool, cfg.res, cfg.agg, cfg.limit)
	var r struct {
		Data struct {
			Attributes struct {
				List [][]float64 `json:"ohlcv_list"`
			} `json:"attributes"`
		} `json:"data"`
	}
	if err := getJSON(ctx, c.hc, c.lim, url, &r); err != nil {
		return nil, err
	}
	out := make([]types.OHLCV, 0, len(r.Data.Attributes.List))
	for _, row := range r.Data.Attributes.List {
		if len(row) < 6 {
			continue
		}
		out = append(out, types.OHLCV{
			Time: int64(row[0]), Open: row[1], High: row[2], Low: row[3], Close: row[4], Volume: row[5],
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Time < out[j].Time }) // ascending for the chart
	out = dedupeCandles(out)                                                  // GeckoTerminal can repeat a timestamp
	if cfg.bucket > 0 {
		out = bucketCandles(out, cfg.bucket)
	}
	return out, nil
}

func (c *gtClient) trades(ctx context.Context, pool string, price float64) ([]types.Trade, error) {
	// Trades share GeckoTerminal's anon rate limit with OHLCV + trending, but the
	// open token's trades now jump the queue at high priority (like its chart), so
	// an 8s TTL keeps the feed lively without starving anything. (Bonding-curve
	// tokens get realtime trades over PumpPortal instead, so this only paces the
	// DEX-trade fallback.)
	c.tmu.Lock()
	if e, ok := c.tcache[pool]; ok && time.Since(e.at) < 8*time.Second {
		c.tmu.Unlock()
		return e.trades, nil
	}
	c.tmu.Unlock()

	var r struct {
		Data []struct {
			Attributes struct {
				Kind      string `json:"kind"`
				VolumeUsd string `json:"volume_in_usd"`
				Ts        string `json:"block_timestamp"`
				From      string `json:"tx_from_address"`
				Tx        string `json:"tx_hash"`
				PriceTo   string `json:"price_to_in_usd"`
				PriceFrom string `json:"price_from_in_usd"`
			} `json:"attributes"`
		} `json:"data"`
	}
	if err := getJSON(ctx, c.hc, c.lim, gtBase+"/pools/"+pool+"/trades", &r); err != nil {
		return nil, err
	}
	out := make([]types.Trade, 0, len(r.Data))
	for i, it := range r.Data {
		a := it.Attributes
		side := a.Kind
		if side != "buy" && side != "sell" {
			side = "buy"
		}
		usd := pf(a.VolumeUsd)
		// One side of the swap is the quote token (SOL/USDC); pick the price
		// closer to the token's reference price so the chart isn't a sawtooth.
		px := pickPrice(pf(a.PriceTo), pf(a.PriceFrom), price)
		var ts int64
		if t, err := time.Parse(time.RFC3339, a.Ts); err == nil {
			ts = t.UnixMilli()
		}
		tokenAmt := 0.0
		if px > 0 {
			tokenAmt = usd / px
		}
		hash := a.Tx
		out = append(out, types.Trade{
			ID: fmt.Sprintf("%s-%d", a.Tx, i), Side: side, Trader: a.From, TraderLabel: nil,
			AmountUsd: usd, TokenAmount: tokenAmt, PriceUsd: px, Timestamp: ts, TxHash: &hash,
		})
	}
	c.tmu.Lock()
	c.tcache[pool] = tradeCacheEntry{trades: out, at: time.Now()}
	c.tmu.Unlock()
	return out, nil
}
