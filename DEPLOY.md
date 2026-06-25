# Deploying ChadWallet

Two deployables: **`web/`** (Next.js → Vercel) and **`server/`** (Go API → Fly.io).
The app runs on mock data with **zero keys**, so you can deploy first and add real
data after.

---

## 1. Accounts to create (all free)

### Need now — live site with real data + auth
| Account | Gives you | Where |
|---|---|---|
| **Vercel** | hosts the website | vercel.com |
| **Fly.io** | hosts the Go API | fly.io  *(needs a card; free allowance. No-card alt: Render)* |
| **BirdEye** | `BIRDEYE_API_KEY` — real market data | bds.birdeye.so |
| **Privy** | `NEXT_PUBLIC_PRIVY_APP_ID` — Apple/Google login + Solana wallet | dashboard.privy.io |

In the **Privy** dashboard: create an app → enable **Google**, **Apple**, and
**Solana embedded wallets** (Wallets → Solana → create on login).

### Need for real trade execution (later)
| Account | Gives you |
|---|---|
| **Alchemy** | `ALCHEMY_RPC_URL` — Solana mainnet RPC (balances, broadcasting) |

Jupiter (quotes/routes) is keyless — no account needed.

### For scale / the social feed (later)
| Account | Gives you |
|---|---|
| **Upstash Redis** | shared cache + websocket fan-out |
| **Supabase** | follow graph, watchlists, persistence |
| **Cloudflare** | CDN / edge cache in front of the API |

---

## 2. Where each value goes

**Frontend** — Vercel → Project → Settings → Environment Variables:
```
NEXT_PUBLIC_API_BASE      = https://<your-fly-app>.fly.dev
NEXT_PUBLIC_PRIVY_APP_ID  = <from Privy>      # public, not secret
```

**Backend** — Fly secrets (kept server-side):
```
fly secrets set BIRDEYE_API_KEY=<from BirdEye> \
               ALLOWED_ORIGIN=https://<your-app>.vercel.app
# later: fly secrets set ALCHEMY_RPC_URL=<from Alchemy>
```

> `BIRDEYE_API_KEY` / `ALCHEMY_RPC_URL` are **secret** — set them via `fly secrets`
> or the dashboard, don't paste them in client code. The two `NEXT_PUBLIC_*` values
> are public by design.

---

## 3. Deploy

### Backend → Fly
```bash
brew install flyctl
fly auth login
cd server
fly launch --no-deploy        # uses fly.toml; pick an app name + region (iad)
fly secrets set BIRDEYE_API_KEY=... ALLOWED_ORIGIN=https://<your-app>.vercel.app
fly deploy
```
Note the URL it prints (e.g. `https://chadwallet-api.fly.dev`).

### Frontend → Vercel
```bash
npm i -g vercel
cd web
vercel            # first run links the project
# add the two NEXT_PUBLIC_* env vars in the dashboard (or `vercel env add`)
vercel --prod
```
Or via dashboard: import the repo, set **Root Directory = `web`**, add the env vars, Deploy.

### Wire them together
Set Vercel's `NEXT_PUBLIC_API_BASE` to the Fly URL → redeploy the frontend.
Set Fly's `ALLOWED_ORIGIN` to the Vercel URL. Done.

---

## 4. Verify
- Open the Vercel URL → landing renders, banners rotate, tap a token → trading page.
- Trading page shows real prices/charts (BirdEye live) once the key is set.
- Sign in → Apple/Google → a Solana wallet address appears (Privy live).
- No key yet? Everything still works on mock data, badged "Demo data".
