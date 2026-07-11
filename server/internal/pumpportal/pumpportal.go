// Package pumpportal streams real-time Solana token launches, migrations, and
// per-token trades from PumpPortal's free, keyless websocket.
package pumpportal

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"solismarket/server/internal/types"
)

const wsURL = "wss://pumpportal.fun/api/data"
const maxTradeSubs = 50

type Client struct {
	onNew     func(types.DiscoveryToken)
	onMigrate func(types.DiscoveryToken)
	onTrade   func(mint string, t types.Trade)
	solPrice  func() float64
	apiKey    string // optional — per-token trade subs need a funded key

	mu        sync.Mutex
	conn      *websocket.Conn
	tradeSubs map[string]time.Time // mint -> last access (LRU)
}

func New(
	onNew, onMigrate func(types.DiscoveryToken),
	onTrade func(string, types.Trade),
	solPrice func() float64,
	apiKey string,
) *Client {
	return &Client{
		onNew: onNew, onMigrate: onMigrate, onTrade: onTrade, solPrice: solPrice,
		apiKey: apiKey, tradeSubs: make(map[string]time.Time),
	}
}

type event struct {
	TxType       string  `json:"txType"`
	Mint         string  `json:"mint"`
	Symbol       string  `json:"symbol"`
	Name         string  `json:"name"`
	MarketCapSol float64 `json:"marketCapSol"`
	SolAmount    float64 `json:"solAmount"`
	TokenAmount  float64 `json:"tokenAmount"`
	VSol         float64 `json:"vSolInBondingCurve"`
	VTokens      float64 `json:"vTokensInBondingCurve"`
	Creator      string  `json:"traderPublicKey"`
	Pool         string  `json:"pool"`
	Signature    string  `json:"signature"`
	Message      string  `json:"message"` // subscription confirmations
}

// EnsureTradeSub subscribes to a mint's trades (LRU-capped). Safe to call often.
func (c *Client) EnsureTradeSub(mint string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	_, existed := c.tradeSubs[mint]
	c.tradeSubs[mint] = time.Now()
	if existed {
		return
	}
	// Evict least-recently-used if over the cap.
	if len(c.tradeSubs) > maxTradeSubs {
		var oldest string
		var oldestT time.Time
		first := true
		for m, t := range c.tradeSubs {
			if m == mint {
				continue
			}
			if first || t.Before(oldestT) {
				oldest, oldestT, first = m, t, false
			}
		}
		if oldest != "" {
			delete(c.tradeSubs, oldest)
			c.write(map[string]any{"method": "unsubscribeTokenTrade", "keys": []string{oldest}})
		}
	}
	c.write(map[string]any{"method": "subscribeTokenTrade", "keys": []string{mint}})
}

// write sends a message on the current connection (caller holds c.mu).
func (c *Client) write(v any) {
	if c.conn != nil {
		_ = c.conn.WriteJSON(v)
	}
}

func (c *Client) Run(ctx context.Context) {
	for {
		if ctx.Err() != nil {
			return
		}
		if err := c.stream(ctx); err != nil {
			log.Printf("pumpportal: %v (reconnecting)", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(3 * time.Second):
		}
	}
}

func (c *Client) stream(ctx context.Context) error {
	url := wsURL
	if c.apiKey != "" {
		url += "?api-key=" + c.apiKey
	}
	conn, _, err := websocket.DefaultDialer.DialContext(ctx, url, nil)
	if err != nil {
		return err
	}
	defer conn.Close()

	c.mu.Lock()
	c.conn = conn
	c.write(map[string]string{"method": "subscribeNewToken"})
	c.write(map[string]string{"method": "subscribeMigration"})
	// Re-subscribe to any tokens we're tracking trades for.
	keys := make([]string, 0, len(c.tradeSubs))
	for m := range c.tradeSubs {
		keys = append(keys, m)
	}
	if len(keys) > 0 {
		c.write(map[string]any{"method": "subscribeTokenTrade", "keys": keys})
	}
	c.mu.Unlock()
	log.Println("pumpportal: streaming new tokens + migrations + trades")

	go func() {
		<-ctx.Done()
		conn.Close()
	}()

	for {
		var e event
		if err := conn.ReadJSON(&e); err != nil {
			c.mu.Lock()
			if c.conn == conn {
				c.conn = nil
			}
			c.mu.Unlock()
			return err
		}
		if e.Message != "" || e.Mint == "" {
			continue
		}
		switch e.TxType {
		case "create":
			c.onNew(c.discovery(e, "new"))
		case "buy", "sell":
			if c.onTrade != nil {
				c.onTrade(e.Mint, c.trade(e))
			}
		default: // migrate / graduation
			c.onMigrate(c.discovery(e, "graduating"))
		}
	}
}

func (c *Client) discovery(e event, status string) types.DiscoveryToken {
	return types.DiscoveryToken{
		Address: e.Mint, Symbol: e.Symbol, Name: e.Name,
		MarketCap: e.MarketCapSol * c.solPrice(),
		Creator:   e.Creator, Pool: e.Pool,
		CreatedAt: time.Now().UnixMilli(), Status: status,
	}
}

func (c *Client) trade(e event) types.Trade {
	sol := c.solPrice()
	price := 0.0
	if e.VTokens > 0 {
		price = (e.VSol / e.VTokens) * sol
	}
	usd := e.SolAmount * sol
	tokenAmt := e.TokenAmount
	if tokenAmt == 0 && price > 0 {
		tokenAmt = usd / price
	}
	sig := e.Signature
	return types.Trade{
		ID: sig, Side: e.TxType, Trader: e.Creator,
		AmountUsd: usd, TokenAmount: tokenAmt, PriceUsd: price,
		Timestamp: time.Now().UnixMilli(), TxHash: &sig,
	}
}
