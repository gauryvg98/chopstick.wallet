# SolisMarket — Web

A fomo.family-style landing page **+ a full Solana trading app** for SolisMarket
("the #1 meme coin trading app on Solana"). Built for the Founding Engineer screen.

- **Landing** (`/`) — rotating token banners (top + bottom, tap → trade), hero,
  Apple/Google sign-in via Privy, feature sections, app-store CTAs.
- **Trading** (`/trade`, `/trade/[address]`) — 3-column workspace: trending list ·
  token info + price chart + holders/live-trades · buy/sell + position.

The app runs **fully on realistic mock data with zero setup**, and flips to live
Solana data the moment the Go backend + API keys are configured — same typed
interface, one env var.

## Stack

| Layer | Tech |
|------|------|
| Frontend | Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 |
| Auth/Wallet | Privy (Apple/Google login + embedded Solana wallet) |
| Charts | TradingView Lightweight Charts v5 |
| Data | SWR polling → typed API client (mock ↔ Go backend) |
| Backend *(next)* | Go service: BirdEye · Jupiter · Alchemy RPC |

## Run

```bash
cd web
npm install
npm run dev          # http://localhost:3000  (mock data + demo sign-in)
```

`npm run build` for a production build.

## Configuration

Copy `web/.env.example` → `web/.env.local`. Everything is optional:

| Var | Effect when set |
|-----|-----------------|
| `NEXT_PUBLIC_API_BASE` | Use the Go backend for live Solana data instead of mock |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Real Apple/Google login + Solana wallet (vs demo sign-in) |

Without them the app is fully usable: deterministic mock market data + a demo
wallet, clearly badged "Demo data" / "Demo" in the UI.

## Architecture

The seam is `web/src/lib/api/` — one typed `ApiClient` interface with two
implementations selected automatically by env:

- `mock.ts` — deterministic, seeded market data (stable charts/holders, live-feeling
  trade feed). No network.
- `live.ts` — REST calls to the Go backend.

Auth is abstracted the same way in `web/src/lib/auth.tsx`: a single `useAuth()`
backed by Privy when an app id is present, else a persistent demo wallet.

```
web/src/
  app/                 # routes: / (landing), /trade, /trade/[address]
  components/
    landing/           # hero, features, showcase, CTA
    trade/             # trending list, chart, holders/trades, buy/sell panel
    ui/                # button, price/change text, sparkline, token avatar
  lib/
    api/               # types · mock client · live client · SWR hooks
    auth.tsx           # Privy ↔ demo auth bridge
    positions.ts       # client-side position book (demo PnL)
    format.ts          # price/number/time formatting
```

## Engineering

For the full end-to-end design — system architecture, the cache-first /
poller-driven backend, the websocket hub, data-source routing, swap + position
flows, the security model, and the expansion roadmap — see
**[ENGINEERING.md](ENGINEERING.md)**.

## Brand

Assets live in `../SolisMarket/` (logo, app screenshots, demo video) and are copied
into `web/public/brand/`. Two surfaces: a blue→teal→green marketing gradient
(landing) and a near-black app theme with the spring-green `#22e07b` accent
(trading).

## Status

- [x] Landing page (required) — banners, Privy sign-in, store links
- [x] Trading page (bonus) — 3-column, chart, holders/trades, buy/sell + position
- [x] Mock data layer + live-client seam; production build passes
- [x] Go backend (DexScreener · GeckoTerminal · Jupiter · Helius · PumpPortal) + live, non-custodial swap execution
- [x] Deploy (Vercel + Fly) — see [ENGINEERING.md](ENGINEERING.md)
