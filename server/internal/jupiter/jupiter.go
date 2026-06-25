// Package jupiter fetches swap quotes from Jupiter's public (keyless) API.
package jupiter

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"chadwallet/server/internal/types"
)

// lite-api is Jupiter's free, keyless tier.
const quoteURL = "https://lite-api.jup.ag/swap/v1/quote"
const priceURL = "https://lite-api.jup.ag/price/v3"

// PriceTick is a live price snapshot for one mint.
type PriceTick struct {
	Price     float64 `json:"price"`
	Change24h float64 `json:"change24h"`
}

// Prices batch-fetches USD prices for many mints in one keyless call — the
// source for the live price stream pushed over the websocket.
func (c *Client) Prices(ctx context.Context, mints []string) (map[string]PriceTick, error) {
	if len(mints) == 0 {
		return map[string]PriceTick{}, nil
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		priceURL+"?ids="+strings.Join(mints, ","), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("accept", "application/json")
	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("jupiter price -> %d", res.StatusCode)
	}
	var raw map[string]struct {
		UsdPrice  float64 `json:"usdPrice"`
		Change24h float64 `json:"priceChange24h"`
	}
	if err := json.NewDecoder(res.Body).Decode(&raw); err != nil {
		return nil, err
	}
	out := make(map[string]PriceTick, len(raw))
	for mint, v := range raw {
		out[mint] = PriceTick{Price: v.UsdPrice, Change24h: v.Change24h}
	}
	return out, nil
}

type Client struct{ http *http.Client }

func New() *Client {
	return &Client{http: &http.Client{Timeout: 10 * time.Second}}
}

type quoteResp struct {
	InputMint      string `json:"inputMint"`
	OutputMint     string `json:"outputMint"`
	InAmount       string `json:"inAmount"`
	OutAmount      string `json:"outAmount"`
	PriceImpactPct string `json:"priceImpactPct"`
	RoutePlan      []struct {
		SwapInfo struct {
			Label string `json:"label"`
		} `json:"swapInfo"`
	} `json:"routePlan"`
}

func (c *Client) Quote(ctx context.Context, req types.QuoteRequest) (*types.Quote, error) {
	slippage := req.SlippageBps
	if slippage <= 0 {
		slippage = 50
	}
	q := url.Values{}
	q.Set("inputMint", req.InputMint)
	q.Set("outputMint", req.OutputMint)
	q.Set("amount", strconv.FormatInt(req.Amount, 10))
	q.Set("slippageBps", strconv.Itoa(slippage))

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, quoteURL+"?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("accept", "application/json")
	res, err := c.http.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("jupiter quote -> %d", res.StatusCode)
	}
	var r quoteResp
	if err := json.NewDecoder(res.Body).Decode(&r); err != nil {
		return nil, err
	}

	out, _ := strconv.ParseInt(r.OutAmount, 10, 64)
	in, _ := strconv.ParseInt(r.InAmount, 10, 64)
	if in == 0 {
		in = req.Amount
	}
	impact, _ := strconv.ParseFloat(r.PriceImpactPct, 64)

	labels := make([]string, 0, len(r.RoutePlan))
	for _, p := range r.RoutePlan {
		if p.SwapInfo.Label != "" {
			labels = append(labels, p.SwapInfo.Label)
		}
	}
	route := "Jupiter · best route"
	if len(labels) > 0 {
		route = "Jupiter · " + strings.Join(labels, " → ")
	}

	return &types.Quote{
		InputMint: req.InputMint, OutputMint: req.OutputMint,
		InAmount: in, OutAmount: out, PriceImpactPct: impact * 100,
		RouteLabel: route,
	}, nil
}
