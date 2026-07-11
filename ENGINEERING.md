# SolisMarket — Engineering Design

End-to-end design of the platform: how it's built, what it uses internally, the
key data flows, the security model, and how we plan to expand.

> **TL;DR.** A Next.js trading frontend (Vercel) talks to a small Go API (Fly)
> that fronts **real Solana data from free / keyless sources**. The backend is
> **cache-first and poller-driven**, so upstream calls scale with the *number of
> tokens tracked*, not the *number of users*. Live prices, candles, the discover
> feed, and trade feeds are pushed over a **single websocket hub** so clients
> never poll. Swaps are **non-custodial** — built server-side, signed in the
> browser by a Privy MPC wallet, broadcast by the server.

---

## 1. System overview

```
 ┌─────────────────────────────┐         ┌──────────────────────────────────────┐
 │  Browser (Next.js / React)  │         │        Go API  (Fly.io)              │
 │                             │  REST   │                                      │
 │  ApiClient ─────────────────┼────────▶│  httpapi (chi)                       │
 │  SWR hooks                  │   WS    │    │                                 │
 │  useSyncExternalStore price │◀────────┼─ ws.Hub ── prices/candles/discover/  │
 │  Privy embedded wallet      │  push   │    │           trades (fan-out)      │
 │  lightweight-charts         │         │  composite / freedata Provider       │
 └─────────────────────────────┘         │    │                                 │
            ▲  sign tx (MPC)              │  cache (TTL) · breaker · metrics     │
            │                             │  discovery universe (PumpPortal)     │
            │                             └───────────────┬──────────────────────┘
   Privy (Apple/Google + key shares)                      │  background pollers
                                                          ▼
        DexScreener · GeckoTerminal · Jupiter · Helius RPC · PumpPortal · pump.fun
```

**Design principle that drives everything:** the free upstreams (GeckoTerminal
~30 req/min anon, DexScreener, Jupiter lite-api) are tightly rate-limited. We
never let user traffic hit them directly. A set of **background pollers** keep
hot data warm in an in-memory cache; **request handlers serve from that
snapshot**; and a **websocket hub** fans one upstream fetch out to every viewer.
So 1 user and 1,000 users put nearly the same load on upstreams.

---

## 2. Frontend (`web/`)

| Concern | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16** (App Router, Turbopack) · **React 19** | Modified Next — see `web/AGENTS.md` |
| Styling | **Tailwind v4** (`@theme` tokens) | near-black app theme, spring-green `#22e07b` accent |
| Data | **SWR** → typed `ApiClient` | `mock.ts` ↔ `live.ts`, selected by `NEXT_PUBLIC_API_BASE` |
| Auth / wallet | **Privy** (Apple/Google login + embedded Solana MPC wallet) | `lib/auth.tsx` bridges Privy ↔ demo wallet |
| Charts | **TradingView lightweight-charts v5** | candles + volume histogram + OHLC legend |
| Live updates | **websocket** → per-mint price store | `useSyncExternalStore` + `requestAnimationFrame` batching |

**The API seam (`web/src/lib/api/`).** One typed `ApiClient` interface, two
implementations — deterministic `mock.ts` (zero-setup demo) and `live.ts` (REST
to the Go backend). A single env var flips the whole app between them; every
component is written against the interface.

**Live-price store.** A per-mint external store (`lib/livePrices.tsx`) exposes
`useLivePrice(mint)` backed by `useSyncExternalStore`. The websocket pushes
batched price ticks; the store coalesces them and only re-renders the components
that subscribed to *that* mint, **at most once per animation frame**. This is why
50+ trending rows can tick live without re-rendering the page. Derived values
follow for free — e.g. a row's live market cap is `staticMC × (livePrice /
staticPrice)` since supply is constant.

**Instant token switching.** Clicking a token updates a shared `ActiveToken`
context synchronously (optimistic) and `history.pushState`s the URL, so the
header / chart / buy panel switch on click. The *expensive* fetches (OHLCV,
holders, trades) follow a **debounced** address, so flicking through tokens only
hits the backend for the one you land on.

**Positions & equity (frontend-reconstructed).** Holdings, cost basis, realized
PnL all come from the chain (no DB). The portfolio **equity curve**
(`lib/equityCurve.ts`) is reconstructed from the cached activity log — net
deposits + running-average realized PnL, anchored to the live total value. It's
real but steps at deposits/realized sells (a true mark-to-market wiggle needs
historical prices — see §8).

---

## 3. Backend (`server/`)

A small Go service (`chi` router). Internal packages, each a focused
responsibility:

| Package | Responsibility |
|---|---|
| `provider` | The data-source **contract** (`Provider` interface) — one mock, one live impl |
| `freedata` | The live provider: DexScreener + GeckoTerminal + Jupiter (+ Helius), pollers, OHLCV sampler |
| `composite` | Routes each `Provider` method to the best upstream |
| `helius` | Token holders + wallet reads + RPC proxy + tx broadcast (needs a key) |
| `jupiter` | Keyless swap quotes + batch prices |
| `pumpportal` | Real-time websocket of new launches / migrations / bonding-curve trades |
| `pumpfun` | Bonding-curve token detail + a keyless price sampler for fresh tokens |
| `discovery` | In-memory **token universe** (new + graduating), TTL'd, logo-enriched |
| `livetrades` | Buffers real-time bonding-curve trades from PumpPortal |
| `ws` | The **websocket hub**: prices, candles, discover feed, trade feeds — fan-out |
| `cache` | Tiny in-memory **TTL cache**; `Snapshot` serves stale-but-warm without refetch |
| `breaker` | Per-key **circuit breaker** — trip after repeated upstream failures |
| `metrics` | In-memory latency registry powering the `/status` dashboard |
| `httpapi` | Wires the REST endpoints the frontend's `LiveClient` consumes |
| `types` | DTOs whose JSON tags mirror the frontend types exactly |

**Cache-first request path.** Handlers call `cache.Snapshot(key)` — which
returns the warm value **without ever triggering an upstream fetch**. The
pollers are the only writers. Example: `pollTrending` refreshes trending + banner
every ~150s into a 10-minute TTL; if an upstream blips, the last-good snapshot
keeps serving.

**Priority-aware fetching.** The token *you're looking at* (its chart, trades)
jumps the GeckoTerminal queue ahead of background refreshes
(`freedata.WithPriority`). Background chart-warming runs at **low priority** so a
user's own fetch always preempts it. Only charts that are **currently open** get
kept warm, capped at 8.

**Resilience.** A per-key circuit breaker stops hammering a failing upstream; an
adaptive sense of the rate limit backs off on 429s; the curated "Big caps"
baseline is sticky (once full, stays full through transient failures).

---

## 4. Data sources

All **free tier**; only Helius and (optionally) PumpPortal trades need a key.

| Source | Used for | Key? |
|---|---|---|
| **GeckoTerminal** | Trending, OHLCV history (1m+), token detail | keyless (~30/min) |
| **DexScreener** | Multi-token prices, sub-minute price sampling, quote-token selection | keyless |
| **Jupiter** (lite-api) | Swap quotes + routes, batch prices (the live head) | keyless |
| **Helius** | Token holders, wallet balances, RPC proxy, tx broadcast | **key** |
| **PumpPortal** | Real-time new launches, migrations (→ Graduating tab), bonding-curve trades | key for trades |
| **pump.fun** | Brand-new bonding-curve token detail + price sampling | keyless |

The pricing layer is careful about *which pool* it trusts: it prefers
USDC/USDT/SOL-quoted pools so a token's USD price comes from a reliable quote
asset (this is what fixed the "trillion-dollar market cap" bug).

---

## 5. Key flows

**Live prices.** The hub keeps a **warm set** always priced — your owned tokens
first, then trending + Big caps — plus any mint a client subscribes to
(refcounted). It batch-fetches from Jupiter and pushes deltas over the socket.
Clients never poll for prices.

**Charts / OHLCV.** History (1m+) comes from GeckoTerminal and is cache-warmed
per open chart; the **live candle** is sampled (DexScreener / Jupiter / pump.fun
depending on the token) and streamed so the forming bar moves in real time. The
seam between lagging history and the live source is reconciled against the
previous candle's close so it never teleports.

**Swap execution (non-custodial).**
```
build (Jupiter route, server) → sign (Privy MPC wallet, BROWSER) → broadcast (server → Helius) → poll + rebroadcast until confirmed
```
The server **never holds keys and never signs**. `/api/swap/send` only accepts an
already-signed transaction (`router.go`).

**Positions / PnL.** Reconstructed from the wallet's on-chain swap history
(`helius.Positions`): running-average cost basis, realized PnL = proceeds −
average cost of tokens sold, all in SOL (shown in $ at live rates). No database.

---

## 6. Security model

- **Self-custodial wallets.** Privy embedded wallets use **MPC / Shamir key
  sharding**. The private key is reconstructed **client-side only**, after you
  authenticate with Apple/Google. Neither Privy nor the app operator can
  unilaterally reconstruct it. To move funds an attacker must *be you at login*.
- **No delegated signing.** We did **not** wire up session signers / delegated
  signing. The backend has no signing authority — even the Privy **app secret**
  couldn't move user funds in this setup. (The app **ID** is public by design and
  ships in the bundle; that's a non-event.)
- **Secrets** (`HELIUS_API_KEY`, etc.) live only in `fly secrets` / `vercel env`;
  `.env` files are gitignored and never committed.

---

## 7. Deployment

| Piece | Host | Cost |
|---|---|---|
| Frontend | **Vercel** (Hobby) | free |
| Backend | **Fly.io** (1 shared machine) | ~$2–3/mo |

Frontend talks to the backend via `NEXT_PUBLIC_API_BASE`. CORS is configurable
(`ALLOWED_ORIGIN`). `USE_MOCK=1` serves deterministic data with no upstreams.

---

## 8. How we plan to expand

Ordered roughly by impact / effort. Several of these replace deliberately-scoped
shortcuts with their "real" version.

**Data depth**
- **True mark-to-market equity curve.** Reconstruct portfolio value over time
  from per-token OHLCV × amount-held-over-time, so the curve *wiggles* with price
  between trades (today it's a frontend realized-equity approximation).
- **Per-mint full swap history endpoint.** Today the activity feed is the recent
  ~40 swaps; a per-token history query would show a token's full trade list on
  its position card regardless of age.
- **Real holder PnL & trader identities.** Holder PnL / avg-entry and trader
  display names are currently **labeled sample data** (no per-wallet cost basis
  for arbitrary holders without an indexer). A swap indexer (Helius webhooks →
  store) would make these real.

**Product surface (the fomo-style social layer)**
- **Watchlist** (star already persists locally → server-backed + a Watchlist
  tab), **Leaderboard**, **Feed**, **Alerts / whale notifications** — the nav is
  scaffolded; these need an accounts + events backend.

**Monetization**
- **On-chain fee per trade** via Jupiter `platformFeeBps` + a referral fee
  account (env-gated), or a thin custom program for a protocol-owned cut.

**Platform / scale**
- **Persistence (Postgres).** Accounts, watchlists, notifications, historical
  portfolio snapshots (so equity curves don't depend on a live reconstruction).
- **Shared cache (Redis) + horizontal scale.** The WS hub and TTL cache are
  in-process today; moving them to Redis lets the API run multiple instances
  behind a load balancer. A swap indexer would feed both.
- **Observability.** The `/status` latency registry is a start; export to
  Prometheus/Grafana, add structured logs + tracing on the upstream calls.
- **Native apps.** The App Store / Play CTAs are placeholders; a React Native or
  native client would reuse the same typed API + Privy.

**Stability hardening**
- Exclude stablecoins / wSOL from position reconstruction (USDC currently leaks
  in as a "position"); handle non-SOL-funded buy legs in cost basis.
