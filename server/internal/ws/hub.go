// Package ws is a small websocket hub that pushes live per-mint price ticks to
// the clients watching each mint. Graduated tokens are priced from the pump.fun
// feed; bonding-curve tokens tick live off the firehose. No Jupiter.
package ws

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"

	"solismarket/server/internal/types"
)

// Pricer batch-fetches prices for many mints.
type Pricer interface {
	Prices(ctx context.Context, mints []string) (map[string]types.PriceTick, error)
}

type Hub struct {
	pricer Pricer
	warm   func() []string // trending mints to always keep priced

	register   chan *Client
	unregister chan *Client
	broadcast  chan []byte
	clients    map[*Client]bool
	count      atomic.Int64

	mu         sync.Mutex
	priceSubs  map[string]map[*Client]bool // mint -> clients watching it (per-mint fan-out)
	lastPrices map[string]types.PriceTick

	// live candle streaming, keyed by "mint|tf"
	candleSubs map[string]map[*Client]bool // who wants this (mint,tf) stream
	candleBars map[string]*candleBar        // the forming bar per (mint,tf)
	sampled    func(string) (float64, bool) // fallback price for non-Jupiter mints

	// discover feed streaming (one global feed)
	discoverSubs map[*Client]bool
	discoverFn   func() any
	discoverLast []byte // last-sent payload, to skip redundant pushes

	// trades streaming, keyed by mint
	tradeSubs map[string]map[*Client]bool
	tradesFn  func(string) any

	onView func(string) // called when a token is viewed (any tf) — warms its sampler

	observe func(string, time.Duration, error) // optional latency recorder

	upgrader websocket.Upgrader
}

// SetObserver wires a latency recorder for the hub's continuous fetch loops.
func (h *Hub) SetObserver(fn func(string, time.Duration, error)) { h.observe = fn }

type candleBar struct {
	Time                   int64
	Open, High, Low, Close float64
}

func bucketSeconds(tf string) int64 {
	switch tf {
	case "1s":
		return 1
	case "5s":
		return 5
	case "30s":
		return 30
	case "1m":
		return 60
	case "10m":
		return 600
	case "1h":
		return 3600
	case "4h":
		return 14400
	}
	return 60
}

func NewHub(pricer Pricer, warm func() []string) *Hub {
	return &Hub{
		pricer:     pricer,
		warm:       warm,
		register:   make(chan *Client),
		unregister: make(chan *Client),
		broadcast:  make(chan []byte, 8),
		clients:    make(map[*Client]bool),
		priceSubs:  make(map[string]map[*Client]bool),
		lastPrices: make(map[string]types.PriceTick),
		candleSubs:   make(map[string]map[*Client]bool),
		candleBars:   make(map[string]*candleBar),
		discoverSubs: make(map[*Client]bool),
		tradeSubs:    make(map[string]map[*Client]bool),
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin:     func(*http.Request) bool { return true },
		},
	}
}

func (h *Hub) Run(ctx context.Context) {
	go h.priceLoop(ctx)
	go h.discoverLoop(ctx)
	go h.tradesLoop(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case c := <-h.register:
			h.clients[c] = true
			h.count.Add(1)
		case c := <-h.unregister:
			if _, ok := h.clients[c]; ok {
				delete(h.clients, c)
				h.count.Add(-1)
				close(c.send)
				h.delPriceSubsForClient(c)
				h.delCandleSubsForClient(c)
				h.delAuxSubsForClient(c)
			}
		case msg := <-h.broadcast:
			for c := range h.clients {
				select {
				case c.send <- msg:
				default: // slow client — drop this tick
				}
			}
		}
	}
}

// priceLoop pushes graduated-token prices from the pump.fun feed (Pricer, a cheap
// in-memory read) and drives the live candle streams. Bonding-curve tokens are
// priced live off the firehose via PushPrice, not here. Runs ~1s; backs off on a
// (rare) empty read.
func (h *Hub) priceLoop(ctx context.Context) {
	const base = 1000 * time.Millisecond
	const maxIv = 8 * time.Second
	iv := base
	for {
		select {
		case <-ctx.Done():
			return
		case <-time.After(iv):
		}
		if h.count.Load() == 0 {
			iv = base
			continue
		}
		t0 := time.Now()
		prices, err := h.pricer.Prices(ctx, h.mints())
		if h.observe != nil {
			h.observe("prices", time.Since(t0), err)
		}
		if err != nil || len(prices) == 0 {
			if iv *= 2; iv > maxIv { // back off — likely rate-limited
				iv = maxIv
			}
		} else {
			iv = base // recovered
			h.mu.Lock()
			for m, p := range prices {
				h.lastPrices[m] = p
			}
			h.mu.Unlock()
			// Fan out each mint to only the clients watching it — no global map.
			for m, p := range prices {
				h.sendTick(m, p)
			}
		}
		// Fold the latest known price into the candle streams every cycle (even on
		// a failed fetch) so the forming candle keeps advancing from cache.
		h.emitCandles(time.Now().Unix())
		// Keep whatever's being charted in the fast (1s) sampling lane.
		h.refreshFastViews()
	}
}

func (h *Hub) mints() []string {
	seen := map[string]bool{}
	var out []string
	add := func(m string) {
		if m != "" && !seen[m] {
			seen[m] = true
			out = append(out, m)
		}
	}
	h.mu.Lock()
	for m := range h.priceSubs {
		add(m)
	}
	// Charted tokens need a price too (to build the live candle) even if no one
	// subscribed to their price readout.
	for key := range h.candleSubs {
		add(key[:strings.IndexByte(key, '|')])
	}
	h.mu.Unlock()
	if h.warm != nil {
		for _, m := range h.warm() {
			add(m)
		}
	}
	if len(out) > 80 {
		out = out[:80]
	}
	return out
}

// addSubs registers a client for per-mint price ticks and immediately sends it
// the current price for each mint, so a fresh subscription paints without
// waiting for the next tick.
func (h *Hub) addSubs(c *Client, mints []string) {
	h.mu.Lock()
	snap := make(map[string]types.PriceTick, len(mints))
	for _, m := range mints {
		if h.priceSubs[m] == nil {
			h.priceSubs[m] = map[*Client]bool{}
		}
		h.priceSubs[m][c] = true
		if p, ok := h.lastPrices[m]; ok && p.Price > 0 {
			snap[m] = p
		}
	}
	h.mu.Unlock()
	if len(snap) > 0 {
		if msg, err := json.Marshal(map[string]any{"type": "prices", "data": snap}); err == nil {
			select {
			case c.send <- msg:
			default:
			}
		}
	}
}

func (h *Hub) delSubs(c *Client, mints []string) {
	h.mu.Lock()
	for _, m := range mints {
		if subs := h.priceSubs[m]; subs != nil {
			delete(subs, c)
			if len(subs) == 0 {
				delete(h.priceSubs, m)
			}
		}
	}
	h.mu.Unlock()
}

func (h *Hub) delPriceSubsForClient(c *Client) {
	h.mu.Lock()
	for m, subs := range h.priceSubs {
		if subs[c] {
			delete(subs, c)
			if len(subs) == 0 {
				delete(h.priceSubs, m)
			}
		}
	}
	h.mu.Unlock()
}

// sendTick pushes one mint's price to just the clients watching it — an
// individual, freshest-possible tick, never a batched global map.
func (h *Hub) sendTick(mint string, tick types.PriceTick) {
	h.mu.Lock()
	subs := h.priceSubs[mint]
	if len(subs) == 0 {
		h.mu.Unlock()
		return
	}
	clients := make([]*Client, 0, len(subs))
	for c := range subs {
		clients = append(clients, c)
	}
	h.mu.Unlock()
	msg, err := json.Marshal(map[string]any{
		"type": "prices", "data": map[string]types.PriceTick{mint: tick},
	})
	if err != nil {
		return
	}
	for _, c := range clients {
		select {
		case c.send <- msg:
		default: // slow client — drop this tick
		}
	}
}

// PushPrice delivers a live price the instant it arrives, straight to the mint's
// subscribers. Fed by the firehose (per-trade, bonding-curve tokens) and the
// pump.fun price feed (graduated tokens). No-ops when nobody's watching, so the
// firehose costs a cheap map lookup per trade.
func (h *Hub) PushPrice(mint string, price float64) {
	if price <= 0 {
		return
	}
	h.mu.Lock()
	if len(h.priceSubs[mint]) == 0 {
		h.mu.Unlock()
		return
	}
	prev := h.lastPrices[mint]
	if prev.Price == price {
		h.mu.Unlock()
		return // unchanged — nothing to send
	}
	prev.Price = price // keep the last known change24h
	h.lastPrices[mint] = prev
	h.mu.Unlock()
	h.sendTick(mint, prev)
}

// PriceOf returns the last live price for a mint, if the hub has fetched it.
// Lets other subsystems (the sub-minute chart sampler) reuse the hub's single
// price stream instead of hitting Jupiter independently.
func (h *Hub) PriceOf(mint string) (float64, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if p, ok := h.lastPrices[mint]; ok && p.Price > 0 {
		return p.Price, true
	}
	return 0, false
}

// SetSampledPrice wires a fallback price source (the provider's sampler) used
// to build candles for mints Jupiter doesn't price.
func (h *Hub) SetSampledPrice(fn func(string) (float64, bool)) { h.sampled = fn }

// CandleKey identifies one actively-streamed chart.
type CandleKey struct{ Mint, Tf string }

// ActiveCandles returns the (mint, tf) charts currently being viewed by at least
// one client — the exact set a background warmer should keep cache-fresh.
func (h *Hub) ActiveCandles() []CandleKey {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := make([]CandleKey, 0, len(h.candleSubs))
	for key, clients := range h.candleSubs {
		if len(clients) == 0 {
			continue
		}
		sep := strings.IndexByte(key, '|')
		out = append(out, CandleKey{Mint: key[:sep], Tf: key[sep+1:]})
	}
	return out
}

// addCandleSub registers a client for a (mint,tf) candle stream and ensures the
// mint is also price-tracked so the aggregator has a price to fold.
func (h *Hub) addCandleSub(c *Client, mint, tf string) {
	key := mint + "|" + tf
	h.mu.Lock()
	if h.candleSubs[key] == nil {
		h.candleSubs[key] = map[*Client]bool{}
	}
	h.candleSubs[key][c] = true
	h.mu.Unlock()
	// Viewing a token on any timeframe warms its sub-minute sampler, so 1s/5s/30s
	// already have history if/when the user switches to them.
	if h.onView != nil {
		h.onView(mint)
	}
}

// SetOnView wires a callback fired when a token is viewed (any timeframe).
func (h *Hub) SetOnView(fn func(string)) { h.onView = fn }

// refreshFastViews re-marks every actively-charted token as focused, keeping its
// fast (1s) sampling alive while the chart stays open. Runs each price-loop tick.
func (h *Hub) refreshFastViews() {
	if h.onView == nil {
		return
	}
	h.mu.Lock()
	seen := map[string]bool{}
	mints := make([]string, 0, len(h.candleSubs))
	for key := range h.candleSubs {
		m := key[:strings.IndexByte(key, '|')]
		if !seen[m] {
			seen[m] = true
			mints = append(mints, m)
		}
	}
	h.mu.Unlock()
	for _, m := range mints {
		h.onView(m)
	}
}

func (h *Hub) delCandleSub(c *Client, mint, tf string) {
	key := mint + "|" + tf
	h.mu.Lock()
	h.removeCandleLocked(c, key, mint)
	h.mu.Unlock()
}

// removeCandleLocked drops one client's interest in a (mint,tf); caller holds mu.
func (h *Hub) removeCandleLocked(c *Client, key, mint string) {
	if m := h.candleSubs[key]; m != nil {
		if m[c] {
			delete(m, c)
		}
		if len(m) == 0 {
			delete(h.candleSubs, key)
			delete(h.candleBars, key)
		}
	}
}

func (h *Hub) delCandleSubsForClient(c *Client) {
	h.mu.Lock()
	for key := range h.candleSubs {
		mint := key[:strings.IndexByte(key, '|')]
		h.removeCandleLocked(c, key, mint)
	}
	h.mu.Unlock()
}

// emitCandles folds the latest price into each active (mint,tf) bucket and pushes
// the updated bar to its subscribers. Runs every price-loop tick, so the chart's
// forming candle advances (and rolls over) without any client polling.
func (h *Hub) emitCandles(now int64) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for key, clients := range h.candleSubs {
		if len(clients) == 0 {
			continue
		}
		sep := strings.IndexByte(key, '|')
		mint, tf := key[:sep], key[sep+1:]
		var price float64
		if p, ok := h.lastPrices[mint]; ok && p.Price > 0 {
			price = p.Price
		} else if h.sampled != nil {
			if sp, ok := h.sampled(mint); ok {
				price = sp
			}
		}
		if price <= 0 {
			continue
		}
		bsec := bucketSeconds(tf)
		bucket := (now / bsec) * bsec
		bar := h.candleBars[key]
		switch {
		case bar == nil:
			bar = &candleBar{Time: bucket, Open: price, High: price, Low: price, Close: price}
		case bucket > bar.Time:
			// Bucket rolled over — open a fresh candle from the prior close.
			bar = &candleBar{Time: bucket, Open: bar.Close, High: price, Low: price, Close: price}
		default:
			bar.Close = price
			if price > bar.High {
				bar.High = price
			}
			if price < bar.Low {
				bar.Low = price
			}
		}
		h.candleBars[key] = bar
		msg, err := json.Marshal(map[string]any{
			"type": "candle", "mint": mint, "tf": tf,
			"bar": map[string]any{"time": bar.Time, "open": bar.Open, "high": bar.High, "low": bar.Low, "close": bar.Close},
		})
		if err != nil {
			continue
		}
		for c := range clients {
			select {
			case c.send <- msg:
			default:
			}
		}
	}
}

// --- discover stream (global feed: new + graduating + trending) ---

func (h *Hub) SetDiscoverFn(fn func() any) { h.discoverFn = fn }

// observedDiscover calls the discover feed builder, timing it for the metrics.
func (h *Hub) observedDiscover() any {
	if h.discoverFn == nil {
		return nil
	}
	t0 := time.Now()
	d := h.discoverFn()
	if h.observe != nil {
		h.observe("discover", time.Since(t0), nil)
	}
	return d
}

func (h *Hub) addDiscoverSub(c *Client) {
	h.mu.Lock()
	h.discoverSubs[c] = true
	h.mu.Unlock()
	// Instant first paint: send the current feed straight to this client.
	if h.discoverFn != nil {
		if msg, err := json.Marshal(map[string]any{"type": "discover", "data": h.observedDiscover()}); err == nil {
			select {
			case c.send <- msg:
			default:
			}
		}
	}
}

func (h *Hub) delDiscoverSub(c *Client) {
	h.mu.Lock()
	delete(h.discoverSubs, c)
	h.mu.Unlock()
}

// discoverLoop pushes the discover feed to subscribers when it changes, so the
// sidebar updates in real time without polling.
func (h *Hub) discoverLoop(ctx context.Context) {
	t := time.NewTicker(2 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if h.discoverFn == nil {
				continue
			}
			h.mu.Lock()
			n := len(h.discoverSubs)
			h.mu.Unlock()
			if n == 0 {
				continue
			}
			msg, err := json.Marshal(map[string]any{"type": "discover", "data": h.observedDiscover()})
			if err != nil {
				continue
			}
			h.mu.Lock()
			if string(msg) == string(h.discoverLast) { // nothing changed — skip
				h.mu.Unlock()
				continue
			}
			h.discoverLast = msg
			for c := range h.discoverSubs {
				select {
				case c.send <- msg:
				default:
				}
			}
			h.mu.Unlock()
		}
	}
}

// --- trades stream (per mint) ---

func (h *Hub) SetTradesFn(fn func(string) any) { h.tradesFn = fn }

// observedTrades calls the trades fetcher for a mint, timing it for the metrics.
func (h *Hub) observedTrades(mint string) any {
	t0 := time.Now()
	d := h.tradesFn(mint)
	if h.observe != nil {
		h.observe("trades", time.Since(t0), nil)
	}
	return d
}

func (h *Hub) addTradeSub(c *Client, mint string) {
	h.mu.Lock()
	if h.tradeSubs[mint] == nil {
		h.tradeSubs[mint] = map[*Client]bool{}
	}
	h.tradeSubs[mint][c] = true
	h.mu.Unlock()
}

func (h *Hub) delTradeSub(c *Client, mint string) {
	h.mu.Lock()
	if m := h.tradeSubs[mint]; m != nil {
		delete(m, c)
		if len(m) == 0 {
			delete(h.tradeSubs, mint)
		}
	}
	h.mu.Unlock()
}

// maxTradeFeeds caps how many tokens get a live trade-feed fetch at once. It
// matches the chart poll-list cap (warmCharts' maxCharts) so trades and charts
// track the same set of open tokens — every charted token also gets its trades.
const maxTradeFeeds = 8

// tradesLoop fetches recent trades once per subscribed mint and fans them out to
// all viewers — one shared upstream fetch instead of one poll per client.
func (h *Hub) tradesLoop(ctx context.Context) {
	t := time.NewTicker(4 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if h.tradesFn == nil {
				continue
			}
			h.mu.Lock()
			mints := make([]string, 0, len(h.tradeSubs))
			for m, clients := range h.tradeSubs {
				if len(clients) > 0 {
					mints = append(mints, m)
				}
			}
			h.mu.Unlock()
			// Cap the trade-feed poll list — only the focused token(s) get a shared
			// upstream fetch; extras (e.g. many tabs) ride the 8s cache.
			if len(mints) > maxTradeFeeds {
				mints = mints[:maxTradeFeeds]
			}
			for _, mint := range mints {
				data := h.observedTrades(mint)
				msg, err := json.Marshal(map[string]any{"type": "trades", "mint": mint, "data": data})
				if err != nil {
					continue
				}
				h.mu.Lock()
				for c := range h.tradeSubs[mint] {
					select {
					case c.send <- msg:
					default:
					}
				}
				h.mu.Unlock()
			}
		}
	}
}

func (h *Hub) delAuxSubsForClient(c *Client) {
	h.mu.Lock()
	delete(h.discoverSubs, c)
	for mint, m := range h.tradeSubs {
		if m[c] {
			delete(m, c)
			if len(m) == 0 {
				delete(h.tradeSubs, mint)
			}
		}
	}
	h.mu.Unlock()
}

// ServeWS upgrades the request to a websocket and registers the client.
func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request) {
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	c := &Client{hub: h, conn: conn, send: make(chan []byte, 64), subs: map[string]bool{}, candleSubs: map[string]bool{}, tradeSubs: map[string]bool{}}
	h.register <- c
	go c.writePump()
	go c.readPump()
}
