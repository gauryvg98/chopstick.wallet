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
