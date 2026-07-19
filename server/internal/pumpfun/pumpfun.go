// Package pumpfun fetches bonding-curve token data from pump.fun's public API —
// the source for brand-new tokens that haven't graduated to a DEX yet (and so
// aren't on DexScreener/GeckoTerminal).
package pumpfun

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"sync"
	"time"

	"solismarket/server/internal/types"
)

const coinURL = "https://frontend-api-v3.pump.fun/coins/"
const listURL = "https://frontend-api-v3.pump.fun/coins"

// Coin is a mapped entry from the pump.fun coin list (trending / big feeds).
type Coin struct {
	Mint         string
	Name         string
	Symbol       string
	LogoURI      string
	MarketCapUSD float64
	MarketCapSol float64 // SOL-denominated market cap (for deriving SOL/USD)
	Price        float64 // USD, derived from usd_market_cap / circulating supply
	Complete     bool    // graduated to a DEX (pump_swap / Raydium)
	LastTradeMs  int64
	Pool         string // AMM pool for price/OHLCV ("" while still on the bonding curve)
}

type listItem struct {
	Mint         string  `json:"mint"`
	Name         string  `json:"name"`
	Symbol       string  `json:"symbol"`
	ImageURI     string  `json:"image_uri"`
	UsdMarketCap float64 `json:"usd_market_cap"` // USD (market_cap is SOL-denominated)
	MarketCap    float64 `json:"market_cap"`    // SOL-denominated
	TotalSupply  float64 `json:"total_supply"`
	BaseDecimals int     `json:"base_decimals"`
	Complete     bool    `json:"complete"`
	LastTrade    int64   `json:"last_trade_timestamp"` // unix ms
	PumpSwapPool string  `json:"pump_swap_pool"`
	PoolAddress  string  `json:"pool_address"`
}

// List fetches a sorted page of pump.fun coins (sort e.g. "market_cap",
// "last_trade_timestamp"). Pure pump.fun — the source for the trending / big
// feeds, replacing GeckoTerminal.
func (c *Client) List(ctx context.Context, sort string, limit int) ([]Coin, error) {
	c.throttle()
	url := fmt.Sprintf("%s?offset=0&limit=%d&sort=%s&order=DESC&includeNsfw=false", listURL, limit, sort)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("accept", "application/json")
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; SolisMarket/1.0)")
	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("pumpfun list -> %d", res.StatusCode)
	}
	var items []listItem
	if err := json.NewDecoder(res.Body).Decode(&items); err != nil {
		return nil, err
	}
	out := make([]Coin, 0, len(items))
	for _, it := range items {
		if it.Mint == "" {
			continue
		}
		dec := it.BaseDecimals
		if dec == 0 {
			dec = 6
		}
		supply := it.TotalSupply / math.Pow10(dec)
		price := 0.0
		if supply > 0 {
			price = it.UsdMarketCap / supply
		}
		pool := it.PumpSwapPool
		if pool == "" {
			pool = it.PoolAddress
		}
		out = append(out, Coin{
			Mint:         it.Mint,
			Name:         it.Name,
			Symbol:       it.Symbol,
			LogoURI:      it.ImageURI,
			MarketCapUSD: it.UsdMarketCap,
			MarketCapSol: it.MarketCap,
			Price:        price,
			Complete:     it.Complete,
			LastTradeMs:  it.LastTrade,
			Pool:         pool,
		})
	}
	return out, nil
}

type Client struct {
	http     *http.Client
	solPrice func() float64
	mu       sync.Mutex
	last     time.Time
}

func New(solPrice func() float64) *Client {
	return &Client{http: &http.Client{Timeout: 10 * time.Second}, solPrice: solPrice}
}

func (c *Client) throttle() {
	c.mu.Lock()
	if w := time.Until(c.last.Add(200 * time.Millisecond)); w > 0 {
		time.Sleep(w)
	}
	c.last = time.Now()
	c.mu.Unlock()
}

type coin struct {
	Mint            string  `json:"mint"`
	Name            string  `json:"name"`
	Symbol          string  `json:"symbol"`
	ImageURI        string  `json:"image_uri"`
	Description     string  `json:"description"`
	Twitter         string  `json:"twitter"`
	Website         string  `json:"website"`
	UsdMarketCap    float64 `json:"usd_market_cap"`
	TotalSupply     float64 `json:"total_supply"`
	BaseDecimals    int     `json:"base_decimals"`
	RealSolReserves float64 `json:"real_sol_reserves"`
	Creator         string  `json:"creator"`
	Complete        bool    `json:"complete"`
}

// Coin returns token detail for a pump.fun mint (bonding curve or graduated).
func (c *Client) Coin(ctx context.Context, mint string) (*types.TokenDetail, error) {
	c.throttle()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, coinURL+mint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("accept", "application/json")
	// pump.fun's edge rejects empty UAs.
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; SolisMarket/1.0)")
	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("pumpfun %s -> %d", mint, res.StatusCode)
	}
	var r coin
	if err := json.NewDecoder(res.Body).Decode(&r); err != nil {
		return nil, err
	}
	if r.Mint == "" {
		return nil, fmt.Errorf("pumpfun: no coin for %s", mint)
	}

	dec := r.BaseDecimals
	if dec == 0 {
		dec = 6
	}
	supply := r.TotalSupply / math.Pow(10, float64(dec))
	price := 0.0
	if supply > 0 {
		price = r.UsdMarketCap / supply
	}
	liquidity := 0.0
	if sp := c.solPrice(); sp > 0 {
		liquidity = (r.RealSolReserves / 1e9) * sp // SOL side of the curve
	}
	logo := strPtr(r.ImageURI)

	return &types.TokenDetail{
		Token: types.Token{
			Address: r.Mint, Symbol: r.Symbol, Name: r.Name, LogoURI: logo,
			PriceUsd: price, MarketCap: r.UsdMarketCap, Liquidity: liquidity,
		},
		FDV:          r.UsdMarketCap,
		TotalSupply:  supply,
		Description:  strPtr(r.Description),
		Website:      strPtr(r.Website),
		Twitter:      strPtr(r.Twitter),
		BondingCurve: !r.Complete,
	}, nil
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
