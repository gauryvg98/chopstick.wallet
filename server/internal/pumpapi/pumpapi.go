// Package pumpapi streams the pump.fun firehose from stream.pumpapi.io — every
// bonding-curve creation, trade, and migration on pump.fun, keyless and free.
//
// Unlike PumpPortal (whose per-token trade subscriptions are paywalled), this
// upstream pushes EVERY executed trade — with the trader's wallet and the
// post-trade curve reserves — so it's the real source for the live trades panel
// and the bonding-curve price line.
//
// The upstream allows ONE websocket per IP (judged at handshake; a dropped
// connection lingers ~10-20s in its bookkeeping). We're a single process on a
// single IP and fan out to browser clients via our own ws.Hub, so one upstream
// connection is all we need — but a too-fast reconnect gets flagged as a
// duplicate of our own ghost, hence the cool-off below.
package pumpapi

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"solismarket/server/internal/types"
)

const (
	wsURL = "wss://stream.pumpapi.io/"
	// The upstream lingers a dropped connection ~10-20s; reconnecting inside
	// that window is flagged as a duplicate and silently starved. Cool off
	// past it. Mirrors the reference relay's 30s.
	reconnectCooloff = 30 * time.Second
	// The firehose peaks well above 1k events/s, so a 30s silence means the
	// connection is dead, not idle — drop it and reconnect.
	stallTimeout = 45 * time.Second
	// Cap the mints we keep a detailed trade buffer for (the tokens actually
	// being viewed); everything else in the firehose is dropped, so memory
	// stays bounded no matter how busy pump.fun is.
	maxWatched = 60
)

type Client struct {
	onNew     func(types.DiscoveryToken)
	onMigrate func(types.DiscoveryToken)
	onTrade   func(mint string, t types.Trade)
	onStat    func(mint string, volUsd, priceUsd float64)
	onPrice   func(mint string, priceUsd float64) // live price push, bonding-curve only
	solPrice  func() float64

	mu      sync.Mutex
	watched map[string]time.Time // mint -> last access (LRU) for the trade buffer
}

func New(
	onNew, onMigrate func(types.DiscoveryToken),
	onTrade func(string, types.Trade),
	onStat func(string, float64, float64),
	onPrice func(string, float64),
	solPrice func() float64,
) *Client {
	return &Client{
		onNew: onNew, onMigrate: onMigrate, onTrade: onTrade, onStat: onStat,
		onPrice: onPrice, solPrice: solPrice, watched: make(map[string]time.Time),
	}
}

// Watch marks a mint as actively viewed so its trades are buffered (and fanned
// out to the trades panel). LRU-capped; the whole firehose is seen regardless,
// but only watched mints are forwarded to onTrade. Safe to call often.
func (c *Client) Watch(mint string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if _, ok := c.watched[mint]; !ok && len(c.watched) >= maxWatched {
		// Evict the least-recently-accessed mint.
		var oldest string
		var oldestT time.Time
		first := true
		for m, t := range c.watched {
			if first || t.Before(oldestT) {
				oldest, oldestT, first = m, t, false
			}
		}
		delete(c.watched, oldest)
	}
	c.watched[mint] = time.Now()
}

func (c *Client) isWatched(mint string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	if t, ok := c.watched[mint]; ok {
		c.watched[mint] = t // no-op; access recorded on Watch
		return true
	}
	return false
}

// event is one firehose frame. Fields are a superset across create/buy/sell/
// migrate; absent ones stay zero.
type event struct {
	Action          string          `json:"action"` // create | buy | sell | migrate
	Pool            string          `json:"pool"`   // "pump" = bonding curve
	Mint            string          `json:"mint"`
	Name            string          `json:"name"`
	Symbol          string          `json:"symbol"`
	Signature       string          `json:"signature"`
	QuoteAmount     float64         `json:"quoteAmount"`     // SOL in this tx
	TokenAmount     float64         `json:"tokenAmount"`     // tokens in this tx
	InitialBuy      float64         `json:"initialBuy"`      // dev's first buy (create)
	VQuote          float64         `json:"vQuoteInBondingCurve"`
	VTokens         float64         `json:"vTokensInBondingCurve"`
	MarketCapQuote  float64         `json:"marketCapQuote"`  // mcap in SOL
	Price           float64         `json:"price"`           // price in SOL/token
	TxSigner        string          `json:"txSigner"`        // acting wallet
	TradersInvolved json.RawMessage `json:"tradersInvolved"` // object keyed by wallet
	Timestamp       int64           `json:"timestamp"`       // on-chain ms
}

func (c *Client) Run(ctx context.Context) {
	for {
		if ctx.Err() != nil {
			return
		}
		cooloff := c.stream(ctx)
		if ctx.Err() != nil {
			return
		}
		wait := 5 * time.Second
		if cooloff {
			wait = reconnectCooloff
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(wait):
		}
	}
}

// stream holds one upstream connection until it errors. Returns true if we
// should cool off before reconnecting (a live connection dropped, so the
// upstream may still be tracking our ghost), false for a plain dial failure.
func (c *Client) stream(ctx context.Context) (cooloff bool) {
	conn, _, err := websocket.DefaultDialer.DialContext(ctx, wsURL, nil)
	if err != nil {
		log.Printf("pumpapi: connect failed: %v (retrying)", err)
		return false
	}
	defer conn.Close()
	log.Println("pumpapi: streaming pump.fun firehose (creates + trades + migrations)")

	go func() {
		<-ctx.Done()
		conn.Close()
	}()

	for {
		_ = conn.SetReadDeadline(time.Now().Add(stallTimeout))
		// Frames arrive as text or binary JSON; ReadMessage handles both.
		_, data, err := conn.ReadMessage()
		if err != nil {
			if ctx.Err() == nil {
				log.Printf("pumpapi: %v (reconnecting)", err)
			}
			return true
		}
		var e event
		if json.Unmarshal(data, &e) != nil || e.Mint == "" {
			continue
		}
		c.dispatch(e)
	}
}

func (c *Client) dispatch(e event) {
	switch e.Action {
	case "create":
		if e.Pool != "pump" {
			return // pump.fun bonding curve only
		}
		c.onNew(c.discovery(e, "new"))
	case "buy", "sell":
		// Every trade on every pool (bonding curve, pump-amm, raydium, meteora)
		// feeds the rolling volume/change stats — that's what powers the graduated
		// feeds' "moving now" numbers and volume ranking.
		usd, price := c.metrics(e)
		// livestats (volume): pump + pump-amm both quote SOL, so usd is correct.
		// External pools (meteora/raydium) quote in their own token — excluded.
		if c.onStat != nil && strings.Contains(e.Pool, "pump") {
			c.onStat(e.Mint, usd, price)
		}
		// Live price push: ONLY the bonding curve ("pump") gives a clean SOL/token
		// price (price*sol). pump-amm's price field is off-scale, so graduated
		// tokens are priced from pump.fun's List instead, not here.
		if c.onPrice != nil && e.Pool == "pump" {
			c.onPrice(e.Mint, price)
		}
		// The detailed per-trade buffer (the trades panel) is bounded, so only
		// viewed mints get one — but now on ANY pool, so a graduated token's panel
		// streams from the firehose too, not just bonding-curve tokens.
		if c.onTrade != nil && c.isWatched(e.Mint) {
			c.onTrade(e.Mint, c.tradeWith(e, usd, price))
		}
	case "migrate":
		// A pump.fun graduation migrates onto pump-amm; guard so a non-pump
		// launchpad's migration can't leak into the (pure pump.fun) feed.
		if strings.Contains(e.Pool, "pump") {
			c.onMigrate(c.discovery(e, "graduating"))
		}
	}
}

func (c *Client) discovery(e event, status string) types.DiscoveryToken {
	pool := e.Pool
	if pool == "" {
		pool = "pump"
	}
	return types.DiscoveryToken{
		Address: e.Mint, Symbol: e.Symbol, Name: e.Name,
		MarketCap: e.MarketCapQuote * c.solPrice(),
		Creator:   c.creator(e), Pool: pool,
		CreatedAt: time.Now().UnixMilli(), Status: status,
	}
}

// metrics derives the trade's USD size + USD price. The firehose's own `price`
// field (the actual executed price, in SOL/token) is authoritative — reserve
// division is only a fallback, because a trade with off/rounded reserve fields
// makes VQuote/VTokens blow up into a garbage price (e.g. a $3K token at $471).
func (c *Client) metrics(e event) (usd, price float64) {
	sol := c.solPrice()
	switch {
	case e.Price > 0:
		price = e.Price * sol
	case e.VTokens > 0:
		price = (e.VQuote / e.VTokens) * sol
	}
	usd = e.QuoteAmount * sol
	return usd, price
}

func (c *Client) tradeWith(e event, usd, price float64) types.Trade {
	tokenAmt := e.TokenAmount
	if tokenAmt == 0 && price > 0 {
		tokenAmt = usd / price
	}
	ts := e.Timestamp
	if ts == 0 {
		ts = time.Now().UnixMilli()
	}
	sig := e.Signature
	return types.Trade{
		ID: sig, Side: e.Action, Trader: c.creator(e),
		AmountUsd: usd, TokenAmount: tokenAmt, PriceUsd: price,
		Timestamp: ts, TxHash: &sig,
	}
}

// creator resolves the acting wallet: the tx signer if present, else the first
// key of tradersInvolved (the object the firehose uses to identify the trader).
func (c *Client) creator(e event) string {
	if e.TxSigner != "" {
		return e.TxSigner
	}
	if len(e.TradersInvolved) > 0 {
		var m map[string]json.RawMessage
		if json.Unmarshal(e.TradersInvolved, &m) == nil {
			for k := range m {
				return k
			}
		}
	}
	return ""
}
