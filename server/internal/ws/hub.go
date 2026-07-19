// Package ws is a small websocket hub that pushes live price ticks to clients.
// One background loop batch-fetches prices (Jupiter, keyless) for the union of
// all clients' subscribed mints plus the trending warm set, and broadcasts —
// so N clients cost one upstream poll, not N.
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

	"solismarket/server/internal/jupiter"
)

// Pricer batch-fetches prices for many mints.
type Pricer interface {
	Prices(ctx context.Context, mints []string) (map[string]jupiter.PriceTick, error)
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
	subs       map[string]int // mint -> refcount across clients
	lastPrices map[string]jupiter.PriceTick
	// Mints Jupiter can price (graduated / DEX-listed). The firehose price is only
	// for tokens Jupiter CAN'T price (fresh bonding-curve) — for anything Jupiter
	// prices, its value is authoritative and the firehose must not override it, or
	// a bad pump-pool tick makes the header flicker to a garbage price.
	jupPriced map[string]bool

	// live candle streaming, keyed by "mint|tf"
	candleSubs map[string]map[*Client]bool // who wants this (mint,tf) stream
	candleBars map[string]*candleBar        // the forming bar per (mint,tf)
	sampled    func(string) (float64, bool) // fallback price for non-Jupiter mints
	livePrice  func(string) (float64, bool) // per-trade firehose price (pump tokens)

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
		subs:       make(map[string]int),
		lastPrices: make(map[string]jupiter.PriceTick),
		jupPriced:  make(map[string]bool),
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
	go h.firehosePriceLoop(ctx)
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
				h.delSubs(keys(c.subs))
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

// priceLoop fetches prices off the hub goroutine so a slow upstream never blocks
// client registration / broadcast. One batched Jupiter call covers every tracked
// mint, so the upstream cost is the tick rate (not the number of tokens).
//
// Jupiter's free tier can't sustain a sub-second cadence forever, so the loop is
// ADAPTIVE: it polls at ~1s normally, but on an error/429 it backs off
// exponentially (up to 8s) and recovers to the base rate once Jupiter is happy
// again. This keeps live prices flowing instead of getting stuck rate-limited.
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
				h.jupPriced[m] = true // Jupiter owns this mint's price
			}
			h.mu.Unlock()
			if msg, err := json.Marshal(map[string]any{"type": "prices", "data": prices}); err == nil {
				select {
				case h.broadcast <- msg:
				case <-ctx.Done():
					return
				}
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
	for m := range h.subs {
		add(m)
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

func (h *Hub) addSubs(mints []string) {
	h.mu.Lock()
	for _, m := range mints {
		h.subs[m]++
	}
	h.mu.Unlock()
}

func (h *Hub) delSubs(mints []string) {
	h.mu.Lock()
	for _, m := range mints {
		if h.subs[m] > 0 {
			h.subs[m]--
			if h.subs[m] == 0 {
				delete(h.subs, m)
			}
		}
	}
	h.mu.Unlock()
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

// SetLivePrice wires the per-trade firehose price (livestats.LastPrice). It's
// polled fast (below) so a subscribed pump.fun token's price ticks on its actual
// fills instead of Jupiter's ~1s cadence — the difference between a page that
// pulses and one that looks frozen.
func (h *Hub) SetLivePrice(fn func(string) (float64, bool)) { h.livePrice = fn }

// firehosePriceLoop pushes trade-fresh prices for subscribed mints ~5×/s. It
// layers on top of the Jupiter loop: Jupiter still supplies change24h and prices
// for tokens the firehose doesn't cover (established graduates), while this makes
// actively-trading pump tokens tick on every fill. Only mints whose price
// actually moved are sent, so a quiet token costs nothing.
func (h *Hub) firehosePriceLoop(ctx context.Context) {
	const iv = 200 * time.Millisecond
	t := time.NewTicker(iv)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		if h.livePrice == nil || h.count.Load() == 0 {
			continue
		}
		// Snapshot the subscribed set without holding the lock across livePrice.
		h.mu.Lock()
		mints := make([]string, 0, len(h.subs))
		for m := range h.subs {
			mints = append(mints, m)
		}
		h.mu.Unlock()

		type upd struct {
			mint string
			px   float64
		}
		var updates []upd
		for _, m := range mints {
			if px, ok := h.livePrice(m); ok {
				updates = append(updates, upd{m, px})
			}
		}
		if len(updates) == 0 {
			continue
		}

		batch := make(map[string]jupiter.PriceTick, len(updates))
		h.mu.Lock()
		for _, u := range updates {
			if h.jupPriced[u.mint] {
				continue // Jupiter prices this mint — never override with a pump-pool tick
			}
			prev := h.lastPrices[u.mint]
			if prev.Price == u.px {
				continue // unchanged — don't spam a still price
			}
			prev.Price = u.px // keep the last known change24h
			h.lastPrices[u.mint] = prev
			batch[u.mint] = prev
		}
		h.mu.Unlock()
		if len(batch) == 0 {
			continue
		}
		if msg, err := json.Marshal(map[string]any{"type": "prices", "data": batch}); err == nil {
			select {
			case h.broadcast <- msg:
			case <-ctx.Done():
				return
			}
		}
	}
}

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
	h.subs[mint]++
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
			if h.subs[mint] > 0 {
				h.subs[mint]--
				if h.subs[mint] == 0 {
					delete(h.subs, mint)
				}
			}
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

func (h *Hub) snapshot(mints []string) map[string]jupiter.PriceTick {
	out := make(map[string]jupiter.PriceTick)
	h.mu.Lock()
	for _, m := range mints {
		if p, ok := h.lastPrices[m]; ok {
			out[m] = p
		}
	}
	h.mu.Unlock()
	return out
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

func keys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
