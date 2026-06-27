// Package composite routes each Provider method to the best upstream:
// BirdEye for market data (overview, trending, OHLCV) and Helius for holders
// (the endpoint BirdEye's free tier gates). Helius is optional — without it,
// everything falls back to BirdEye (and its synth fallback).
package composite

import (
	"context"
	"log"

	"chadwallet/server/internal/birdeye"
	"chadwallet/server/internal/helius"
	"chadwallet/server/internal/types"
)

type Composite struct {
	be *birdeye.Client
	he *helius.Client // may be nil
}

func New(be *birdeye.Client, he *helius.Client) *Composite {
	return &Composite{be: be, he: he}
}

func (c *Composite) Banner(ctx context.Context) ([]types.Token, error) {
	return c.be.Banner(ctx)
}
func (c *Composite) Trending(ctx context.Context) ([]types.TrendingToken, error) {
	return c.be.Trending(ctx)
}
func (c *Composite) OHLCV(ctx context.Context, address string, tf types.Timeframe) ([]types.OHLCV, error) {
	return c.be.OHLCV(ctx, address, tf)
}
func (c *Composite) Trades(ctx context.Context, address string) ([]types.Trade, error) {
	return c.be.Trades(ctx, address)
}

func (c *Composite) Token(ctx context.Context, address string) (*types.TokenDetail, error) {
	td, err := c.be.Token(ctx, address)
	if err != nil {
		return nil, err
	}
	// Make the header's Top-10 % consistent with the (real) Helius holder list.
	if c.he != nil {
		if hs, herr := c.he.Holders(ctx, address, td.TotalSupply, td.PriceUsd, td.MarketCap); herr == nil && len(hs) > 0 {
			top10 := 0.0
			for i := 0; i < 10 && i < len(hs); i++ {
				top10 += hs[i].Pct
			}
			td.Top10Pct = top10
		}
	}
	return td, nil
}

func (c *Composite) Holders(ctx context.Context, address string) ([]types.Holder, error) {
	if c.he != nil {
		price, supply := c.be.PriceSupply(ctx, address)
		if hs, err := c.he.Holders(ctx, address, supply, price, price*supply); err == nil && len(hs) > 0 {
			return hs, nil
		} else if err != nil {
			log.Printf("helius holders fallback for %s: %v", address, err)
		}
	}
	return c.be.Holders(ctx, address)
}
