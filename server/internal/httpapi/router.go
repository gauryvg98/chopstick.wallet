// Package httpapi wires the REST endpoints consumed by the frontend's LiveClient.
package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"solismarket/server/internal/cache"
	"solismarket/server/internal/freedata"
	"solismarket/server/internal/jupiter"
	"solismarket/server/internal/metrics"
	"solismarket/server/internal/provider"
	"solismarket/server/internal/types"
)

type Server struct {
	prov     provider.Provider
	jup      *jupiter.Client
	cache    *cache.Cache
	allowed  string
	wsFunc   http.HandlerFunc                                   // optional live-price websocket
	discover func() ([]types.DiscoveryToken, []types.DiscoveryToken) // new, graduating
	metrics  *metrics.Registry
	started  time.Time
}

func New(
	prov provider.Provider,
	jup *jupiter.Client,
	allowedOrigin string,
	c *cache.Cache,
	wsFunc http.HandlerFunc,
	discover func() ([]types.DiscoveryToken, []types.DiscoveryToken),
) *Server {
	return &Server{prov: prov, jup: jup, cache: c, allowed: allowedOrigin, wsFunc: wsFunc, discover: discover, started: time.Now()}
}

// SetMetrics wires the latency registry used by the status dashboard.
func (s *Server) SetMetrics(m *metrics.Registry) { s.metrics = m }

// observe records a handler's latency under name (no-op if metrics unset).
func (s *Server) observe(name string, start time.Time, err error) {
	if s.metrics != nil {
		s.metrics.Observe(name, time.Since(start), err)
	}
}

func (s *Server) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(s.cors)

	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	if s.wsFunc != nil {
		r.Get("/ws", s.wsFunc) // live price stream
	}

	r.Route("/api", func(r chi.Router) {
		r.Get("/banner", s.handleBanner)
		r.Get("/discover", s.handleDiscover)
		r.Get("/tokens/trending", s.handleTrending)
		r.Get("/tokens/{address}", s.handleToken)
		r.Get("/tokens/{address}/ohlcv", s.handleOHLCV)
		r.Get("/tokens/{address}/holders", s.handleHolders)
		r.Get("/tokens/{address}/trades", s.handleTrades)
		r.Get("/wallet/{owner}/holdings", s.handleHoldings)
		r.Get("/wallet/{owner}/positions", s.handlePositions)
		r.Get("/wallet/{owner}/activity", s.handleActivity)
		r.Post("/swap/quote", s.handleQuote)
		r.Post("/swap/build", s.handleSwapBuild) // build unsigned swap tx (Jupiter)
		r.Post("/swap/send", s.handleSwapSend)   // broadcast signed tx (RPC)
		r.Get("/tx/{sig}", s.handleTxStatus)     // poll confirmation
		r.Post("/rpc", s.handleRPC)              // JSON-RPC proxy for the frontend signer
		r.Get("/status", s.handleStatus)         // real-time latency metrics
	})
	return r
}

// --- middleware ---

func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Public read-only endpoints (health check + latency metrics) are safe to
		// expose to any origin — e.g. the portfolio site embedding /api/status.
		// Every other route stays locked to the configured frontend origin.
		origin := s.allowed
		if r.URL.Path == "/health" || r.URL.Path == "/api/status" {
			origin = "*"
		}
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		// Reflect whatever headers the browser asks for in preflight (the
		// @solana/kit RPC transport sends a `solana-client` header, etc.), falling
		// back to the common set.
		if reqH := r.Header.Get("Access-Control-Request-Headers"); reqH != "" {
			w.Header().Set("Access-Control-Allow-Headers", reqH)
		} else {
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Accept, solana-client")
		}
		w.Header().Set("Vary", "Origin")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// --- handlers ---

// snapshot reads the background poller's last in-memory value for key (fresh or
// stale — never an on-demand upstream fetch). The cache never evicts, so once
// the poller has written it, this is always served instantly.
func snapshot[T any](c *cache.Cache, key string) T {
	var zero T
	if v, ok := c.Snapshot(key); ok {
		if t, ok := v.(T); ok {
			return t
		}
	}
	return zero
}

func (s *Server) handleBanner(w http.ResponseWriter, _ *http.Request) {
	out := snapshot[[]types.Token](s.cache, "banner")
	if out == nil {
		out = []types.Token{}
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleTrending(w http.ResponseWriter, _ *http.Request) {
	out := snapshot[[]types.TrendingToken](s.cache, "trending")
	if out == nil {
		out = []types.TrendingToken{}
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleDiscover(w http.ResponseWriter, _ *http.Request) {
	feeds := types.DiscoverFeeds{
		New:        []types.DiscoveryToken{},
		Graduating: []types.DiscoveryToken{},
		Trending:   []types.TrendingToken{},
		Big:        []types.TrendingToken{},
	}
	if s.discover != nil {
		feeds.New, feeds.Graduating = s.discover()
	}
	// Trending + Big are served straight from the poller's in-memory snapshot —
	// no on-demand fetch on the request path, so /discover can't block or expire
	// onto a cold GeckoTerminal call.
	if tr := snapshot[[]types.TrendingToken](s.cache, "trending"); tr != nil {
		feeds.Trending = tr
	}
	if big := s.prov.Big(); len(big) > 0 {
		feeds.Big = big
	}
	writeJSON(w, http.StatusOK, feeds)
}

func (s *Server) handleToken(w http.ResponseWriter, r *http.Request) {
	addr := chi.URLParam(r, "address")
	data, err := cache.Remember(s.cache, "token:"+addr, 15*time.Second, func() (*types.TokenDetail, error) {
		return s.prov.Token(r.Context(), addr)
	})
	respond(w, data, err)
}

func (s *Server) handleOHLCV(w http.ResponseWriter, r *http.Request) {
	addr := chi.URLParam(r, "address")
	tf := types.Timeframe(r.URL.Query().Get("tf"))
	if tf == "" {
		tf = types.Tf1m
	}
	// No cache: the client progressively fires 20→40→…→120 bars per timeframe and
	// each request is served fresh off the source (GeckoTerminal for 1m+, the
	// local sampler for sub-minute). `limit` bounds the fetch so the first paint
	// is a tiny, fast payload that then fills out. Marked user-facing so its GT
	// call preempts background polling; timeout-bounded so it never hangs.
	limit := 120
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			if n > 300 {
				n = 300
			}
			limit = n
		}
	}
	ctx, cancel := context.WithTimeout(freedata.WithPriority(r.Context()), 10*time.Second)
	defer cancel()
	start := time.Now()
	data, err := s.prov.OHLCV(ctx, addr, tf, limit)
	s.observe("chart", start, err)
	respond(w, data, err)
}

func (s *Server) handleHolders(w http.ResponseWriter, r *http.Request) {
	addr := chi.URLParam(r, "address")
	data, err := cache.Remember(s.cache, "holders:"+addr, 60*time.Second, func() ([]types.Holder, error) {
		return s.prov.Holders(r.Context(), addr)
	})
	respond(w, data, err)
}

func (s *Server) handleTrades(w http.ResponseWriter, r *http.Request) {
	addr := chi.URLParam(r, "address")
	// Priority: the trades feed is for the token you're looking at, so its initial
	// load jumps the upstream queue alongside that token's chart.
	ctx := freedata.WithPriority(r.Context())
	start := time.Now()
	data, err := cache.Remember(s.cache, "trades:"+addr, 8*time.Second, func() ([]types.Trade, error) {
		return s.prov.Trades(ctx, addr)
	})
	s.observe("trades", start, err)
	respond(w, data, err)
}

func (s *Server) handleHoldings(w http.ResponseWriter, r *http.Request) {
	owner := chi.URLParam(r, "owner")
	key := "holdings:" + owner
	// fresh=1 bypasses the cache for an instant post-trade read (then refreshes the
	// cache), so a just-confirmed swap shows up immediately instead of up to 8s late.
	if r.URL.Query().Get("fresh") == "1" {
		data, err := s.prov.Holdings(r.Context(), owner)
		if err == nil && data != nil {
			s.cache.Put(key, data, 8*time.Second)
		}
		respond(w, data, err)
		return
	}
	start := time.Now()
	data, err := cache.Remember(s.cache, key, 8*time.Second, func() (*types.WalletHoldings, error) {
		return s.prov.Holdings(r.Context(), owner)
	})
	s.observe("wallet", start, err)
	respond(w, data, err)
}

func (s *Server) handleActivity(w http.ResponseWriter, r *http.Request) {
	owner := chi.URLParam(r, "owner")
	key := "activity:" + owner
	if r.URL.Query().Get("fresh") == "1" {
		data, err := s.prov.Activity(r.Context(), owner)
		if err == nil && data != nil {
			s.cache.Put(key, data, 30*time.Second)
		}
		respond(w, data, err)
		return
	}
	data, err := cache.Remember(s.cache, key, 30*time.Second, func() (*types.WalletActivity, error) {
		return s.prov.Activity(r.Context(), owner)
	})
	respond(w, data, err)
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	var stats any = []any{}
	if s.metrics != nil {
		stats = s.metrics.Snapshot()
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"metrics":   stats,
		"uptimeSec": time.Since(s.started).Seconds(),
	})
}

func (s *Server) handlePositions(w http.ResponseWriter, r *http.Request) {
	owner := chi.URLParam(r, "owner")
	key := "positions:" + owner
	// fresh=1 bypasses the cache (used right after a confirmed swap).
	if r.URL.Query().Get("fresh") == "1" {
		data, err := s.prov.Positions(r.Context(), owner)
		if err == nil && data != nil {
			s.cache.Put(key, data, 30*time.Second)
		}
		respond(w, data, err)
		return
	}
	start := time.Now()
	data, err := cache.Remember(s.cache, key, 30*time.Second, func() (*types.WalletPositions, error) {
		return s.prov.Positions(r.Context(), owner)
	})
	s.observe("positions", start, err)
	respond(w, data, err)
}

func (s *Server) handleQuote(w http.ResponseWriter, r *http.Request) {
	var req types.QuoteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	q, err := s.jup.Quote(r.Context(), req)
	if err != nil {
		// Fallback: estimate from provider prices so the UI still gets a quote.
		log.Printf("quote fallback: %v", err)
		q = s.estimateQuote(r, req)
	}
	writeJSON(w, http.StatusOK, q)
}

// handleSwapBuild asks Jupiter to build an unsigned swap transaction for the
// user to sign with their embedded wallet. amount is raw input base units.
func (s *Server) handleSwapBuild(w http.ResponseWriter, r *http.Request) {
	var req struct {
		InputMint     string `json:"inputMint"`
		OutputMint    string `json:"outputMint"`
		Amount        string `json:"amount"` // raw base units as a string (precision-safe)
		SlippageBps   int    `json:"slippageBps"`
		UserPublicKey string `json:"userPublicKey"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	amount, err := strconv.ParseUint(req.Amount, 10, 64)
	if req.InputMint == "" || req.OutputMint == "" || err != nil || amount == 0 || req.UserPublicKey == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing or invalid fields"})
		return
	}
	start := time.Now()
	build, err := s.jup.BuildSwap(r.Context(), req.InputMint, req.OutputMint, amount, req.SlippageBps, req.UserPublicKey)
	s.observe("swap_build", start, err)
	if err != nil {
		log.Printf("swap build error: %v", err)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "could not build swap — no route or upstream error"})
		return
	}
	writeJSON(w, http.StatusOK, build)
}

// handleSwapSend broadcasts a client-signed transaction and returns its
// signature.
func (s *Server) handleSwapSend(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SignedTransaction string `json:"signedTransaction"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.SignedTransaction == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	start := time.Now()
	sig, err := s.prov.Broadcast(r.Context(), req.SignedTransaction)
	s.observe("swap_send", start, err)
	if err != nil {
		log.Printf("swap send error: %v", err)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"signature": sig})
}

// handleTxStatus polls a signature's confirmation status.
func (s *Server) handleTxStatus(w http.ResponseWriter, r *http.Request) {
	sig := chi.URLParam(r, "sig")
	start := time.Now()
	status, err := s.prov.TxStatus(r.Context(), sig)
	s.observe("tx_status", start, err)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"signature": sig, "status": status})
}

// handleRPC proxies a JSON-RPC request from the frontend (Privy's signer) to the
// upstream RPC, so the browser never sees the API key.
func (s *Server) handleRPC(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20)) // 1MB cap
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	out, err := s.prov.RPCProxy(r.Context(), body)
	if err != nil && len(out) == 0 {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(out)
}

// estimateQuote computes a price-based estimate when Jupiter is unavailable
// (e.g. mock tokens that aren't routable on-chain).
func (s *Server) estimateQuote(r *http.Request, req types.QuoteRequest) *types.Quote {
	inTok, _ := s.prov.Token(r.Context(), req.InputMint)
	outTok, _ := s.prov.Token(r.Context(), req.OutputMint)
	out := req.Amount
	if inTok != nil && outTok != nil && outTok.PriceUsd > 0 {
		out = int64(float64(req.Amount) * (inTok.PriceUsd / outTok.PriceUsd) * 0.997)
	}
	return &types.Quote{
		InputMint: req.InputMint, OutputMint: req.OutputMint,
		InAmount: req.Amount, OutAmount: out, PriceImpactPct: 0.3,
		RouteLabel: "Jupiter · best route (est.)",
	}
}

// --- helpers ---

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func respond(w http.ResponseWriter, data any, err error) {
	if err != nil {
		log.Printf("handler error: %v", err)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, data)
}
