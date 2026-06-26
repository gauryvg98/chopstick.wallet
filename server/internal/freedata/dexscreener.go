package freedata

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"chadwallet/server/internal/types"
)

type dexClient struct {
	hc  *http.Client
	lim *limiter
}

func newDex() *dexClient {
	return &dexClient{
		hc:  &http.Client{Timeout: 12 * time.Second},
		lim: newLimiter(220 * time.Millisecond), // DexScreener allows ~300/min; backs off on 429
	}
}

type dexPair struct {
	ChainID     string `json:"chainId"`
	PairAddress string `json:"pairAddress"`
	BaseToken   struct {
		Address string `json:"address"`
		Name    string `json:"name"`
		Symbol  string `json:"symbol"`
	} `json:"baseToken"`
	PriceUsd  string  `json:"priceUsd"`
	MarketCap float64 `json:"marketCap"`
	Fdv       float64 `json:"fdv"`
	Liquidity struct {
		Usd float64 `json:"usd"`
	} `json:"liquidity"`
	Volume struct {
		H24 float64 `json:"h24"`
	} `json:"volume"`
	PriceChange struct {
		H24 float64 `json:"h24"`
		H1  float64 `json:"h1"`
	} `json:"priceChange"`
	Info struct {
		ImageURL string `json:"imageUrl"`
	} `json:"info"`
}

// changes returns 24h/1h price-change % for a batch of mints, keyed by mint
// (the most-liquid Solana pair wins per mint). DexScreener's multi-token endpoint
// carries priceChange, which GeckoTerminal's /tokens/multi omits — so the BIG
// list's blue-chips would otherwise show a flat 0.00%. One call backfills them.
func (c *dexClient) changes(ctx context.Context, mints []string) map[string][2]float64 {
	out := map[string][2]float64{}
	// DexScreener accepts up to 30 comma-separated addresses per call.
	for start := 0; start < len(mints); start += 30 {
		end := start + 30
		if end > len(mints) {
			end = len(mints)
		}
		var r struct {
			Pairs []dexPair `json:"pairs"`
		}
		url := "https://api.dexscreener.com/latest/dex/tokens/" + strings.Join(mints[start:end], ",")
		if err := getJSON(ctx, c.hc, c.lim, url, &r); err != nil {
			continue
		}
		bestLiq := map[string]float64{}
		for i := range r.Pairs {
			p := &r.Pairs[i]
			if p.ChainID != "solana" || p.BaseToken.Address == "" {
				continue
			}
			m := p.BaseToken.Address
			if cur, ok := bestLiq[m]; !ok || p.Liquidity.Usd > cur {
				bestLiq[m] = p.Liquidity.Usd
				out[m] = [2]float64{p.PriceChange.H24, p.PriceChange.H1}
			}
		}
	}
	return out
}

// token returns the token detail + its most-liquid pool address.
func (c *dexClient) token(ctx context.Context, mint string) (*types.TokenDetail, string, error) {
	var r struct {
		Pairs []dexPair `json:"pairs"`
	}
	url := "https://api.dexscreener.com/latest/dex/tokens/" + mint
	if err := getJSON(ctx, c.hc, c.lim, url, &r); err != nil {
		return nil, "", err
	}
	if len(r.Pairs) == 0 {
		return nil, "", fmt.Errorf("dexscreener: no pairs for %s", mint)
	}

	// Pick the most-TRADED Solana pair where this token is the base — but only
	// among pools that still hold real liquidity. Two traps to avoid:
	//   1. Highest-LIQUIDITY can be idle (stale OHLCV/trades → frozen chart).
	//   2. A DEAD pool ($0 liquidity) keeps a stale, often wildly wrong price
	//      plus leftover recorded volume — so pure volume-ranking picks it and
	//      mis-values holdings by orders of magnitude.
	// So: rank by 24h volume *among pools with non-trivial liquidity* (liquidity
	// breaks ties). Only if no pool has real liquidity do we fall back to any.
	const minLiqUsd = 1.0
	pick := func(requireLiq bool) *dexPair {
		var best *dexPair
		for i := range r.Pairs {
			p := &r.Pairs[i]
			if p.ChainID != "solana" || p.BaseToken.Address != mint {
				continue
			}
			if requireLiq && p.Liquidity.Usd < minLiqUsd {
				continue
			}
			if best == nil || p.Volume.H24 > best.Volume.H24 ||
				(p.Volume.H24 == best.Volume.H24 && p.Liquidity.Usd > best.Liquidity.Usd) {
				best = p
			}
		}
		return best
	}
	best := pick(true)
	if best == nil {
		best = pick(false) // no pool with real liquidity — best effort
	}
	if best == nil {
		// fall back to any Solana pair for this token
		for i := range r.Pairs {
			if r.Pairs[i].ChainID == "solana" {
				best = &r.Pairs[i]
				break
			}
		}
	}
	if best == nil {
		return nil, "", fmt.Errorf("dexscreener: no Solana pair for %s", mint)
	}

	price := pf(best.PriceUsd)
	mc := best.MarketCap
	if mc == 0 {
		mc = best.Fdv
	}
	supply := 0.0
	if price > 0 {
		if best.Fdv > 0 {
			supply = best.Fdv / price
		} else {
			supply = mc / price
		}
	}
	var logo *string
	if best.Info.ImageURL != "" {
		l := best.Info.ImageURL
		logo = &l
	}

	td := &types.TokenDetail{
		Token: types.Token{
			Address: mint, Symbol: best.BaseToken.Symbol, Name: best.BaseToken.Name,
			LogoURI: logo, PriceUsd: price,
			Change24h: best.PriceChange.H24, Change1h: best.PriceChange.H1,
			MarketCap: mc, Liquidity: best.Liquidity.Usd, Volume24h: best.Volume.H24,
		},
		FDV: best.Fdv, TotalSupply: supply, HolderCount: 0, Top10Pct: 0,
	}
	return td, best.PairAddress, nil
}
