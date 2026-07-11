import type { ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Footer } from "@/components/Footer";

/* ----------------------------- small building blocks ----------------------------- */

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 py-10 border-t border-line/60 first:border-0">
      <div className="text-xs font-bold uppercase tracking-widest text-solis">{eyebrow}</div>
      <h2 className="mt-2 font-display font-bold text-2xl sm:text-3xl text-white lowercase tracking-tight">
        {title}
      </h2>
      <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-muted">{children}</div>
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface/40 scroll-thin">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            {head.map((h) => (
              <th key={h} className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-faint">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line/50">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-white/[0.03]">
              {r.map((cell, j) => (
                <td key={j} className={j === 0 ? "px-4 py-2.5 font-semibold text-white align-top whitespace-nowrap" : "px-4 py-2.5 text-muted align-top"}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface/40 p-4">
      <div className="text-sm font-bold text-white">{title}</div>
      <div className="mt-1.5 text-sm text-muted leading-relaxed">{children}</div>
    </div>
  );
}

function K({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-md bg-surface-2 border border-line px-1.5 py-0.5 text-[12px] font-mono text-white/90">
      {children}
    </code>
  );
}

/** A rendered Mermaid flowchart (vector, transparent bg, brand-themed) from the
 *  design-docs. Horizontally scrollable on narrow screens so it stays legible. */
function Diagram({ src, alt, caption }: { src: string; alt: string; caption?: string }) {
  return (
    <figure className="rounded-2xl border border-line bg-ink-2/40 p-3 sm:p-4">
      <div className="overflow-x-auto scroll-thin">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="h-auto w-full min-w-[680px]"
        />
      </div>
      {caption && (
        <figcaption className="mt-2 text-center text-xs text-faint">{caption}</figcaption>
      )}
    </figure>
  );
}

const NAV = [
  ["overview", "Overview"],
  ["frontend", "Frontend"],
  ["backend", "Backend"],
  ["data", "Data sources"],
  ["flows", "Key flows"],
  ["security", "Security"],
  ["roadmap", "Roadmap"],
];

/* --------------------------------- the page --------------------------------- */

export function EngineeringView() {
  return (
    <div className="relative flex flex-col min-h-full">
      {/* cosmic backdrop — same as the landing */}
      <div className="pointer-events-none fixed inset-0 z-0 bg-ink">
        <div className="absolute inset-0 starfield opacity-70" />
        <div className="absolute inset-0 starfield opacity-40" style={{ backgroundSize: "230px 230px" }} />
        <div className="absolute -top-40 left-[12%] h-[42rem] w-[42rem] rounded-full bg-solis/10 blur-[170px]" />
        <div className="absolute top-1/3 right-[2%] h-[38rem] w-[38rem] rounded-full bg-teal/10 blur-[170px]" />
      </div>

      <div className="relative z-10 flex flex-1 flex-col">
        <SiteHeader />
        <main className="flex-1">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 py-12 sm:py-16">
            {/* hero */}
            <div className="text-xs font-bold uppercase tracking-widest text-solis">Engineering</div>
            <h1 className="mt-2 font-display font-bold text-4xl sm:text-5xl text-white lowercase tracking-tight">
              how solis.wallet is built
            </h1>
            <p className="mt-4 text-lg text-muted leading-relaxed">
              A Next.js trading frontend talks to a small Go API that fronts{" "}
              <span className="text-white font-semibold">real Solana data from free, keyless sources</span>. The
              backend is <span className="text-white font-semibold">cache-first and poller-driven</span>, so
              upstream calls scale with the number of <em>tokens tracked</em>, not the number of{" "}
              <em>users</em>. Live prices, candles, the discover feed and trade feeds are pushed over a single
              websocket so clients never poll. Swaps are <span className="text-white font-semibold">
              non-custodial</span> — built server-side, signed in the browser by a Privy MPC wallet, broadcast by
              the server.
            </p>

            {/* sticky-ish nav */}
            <div className="mt-6 flex flex-wrap gap-2">
              {NAV.map(([id, label]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="rounded-full border border-line bg-surface/50 px-3 py-1.5 text-xs font-semibold text-muted hover:text-white hover:border-solis/40 transition-colors"
                >
                  {label}
                </a>
              ))}
            </div>

            {/* OVERVIEW */}
            <Section id="overview" eyebrow="01 · System" title="overview">
              <p>
                The free upstreams are tightly rate-limited (GeckoTerminal ~30 req/min anon, DexScreener,
                Jupiter lite-api). We never let user traffic hit them directly. Background <strong className="text-white/90">
                pollers</strong> keep hot data warm in an in-memory cache; request handlers serve from that
                snapshot; and a <strong className="text-white/90">websocket hub</strong> fans one upstream fetch
                out to every viewer. So 1 user and 1,000 users put nearly the same load on upstreams.
              </p>
              <Diagram
                src="/brand/diagrams/01-system-overview.svg"
                alt="SolisMarket system overview — browser, Go API, websocket hub, and free upstreams"
                caption="System overview — browser ⇄ Go API (REST + websocket) ⇄ free Solana upstreams."
              />
              <Diagram
                src="/brand/diagrams/02-cache-first-fanout.svg"
                alt="Cache-first, poller-driven fan-out — pollers are the only path to upstreams"
                caption="Cache-first fan-out — background pollers are the only path to the rate-limited upstreams; readers serve warm snapshots."
              />
            </Section>

            {/* FRONTEND */}
            <Section id="frontend" eyebrow="02 · Client" title="frontend">
              <Table
                head={["Concern", "Choice"]}
                rows={[
                  ["Framework", "Next.js 16 (App Router, Turbopack) · React 19"],
                  ["Styling", <>Tailwind v4 — near-black theme, gold <K>#F5B301</K> accent</>],
                  ["Data", <>SWR → typed <K>ApiClient</K> (mock ↔ live, env-selected)</>],
                  ["Auth / wallet", "Privy — Apple/Google login + embedded Solana MPC wallet"],
                  ["Charts", "TradingView lightweight-charts v5 (candles + volume + OHLC legend)"],
                  ["Live updates", <>websocket → per-mint store (<K>useSyncExternalStore</K> + rAF batching)</>],
                ]}
              />
              <div className="grid sm:grid-cols-2 gap-3">
                <Card title="The API seam">
                  One typed <K>ApiClient</K>, two implementations — deterministic <K>mock.ts</K> (zero-setup
                  demo) and <K>live.ts</K> (REST to the Go backend). A single env var flips the whole app.
                </Card>
                <Card title="Live-price store">
                  Batched ticks coalesce in a per-mint external store; only components subscribed to that mint
                  re-render, at most once per frame — so 50+ rows tick live without re-rendering the page.
                </Card>
                <Card title="Instant token switching">
                  Clicking a token updates a shared context synchronously + <K>history.pushState</K>; the
                  expensive fetches (OHLCV, holders, trades) follow a debounced address.
                </Card>
                <Card title="Positions & equity">
                  Holdings, cost basis and realized PnL are chain-derived (no DB). The portfolio equity curve is
                  reconstructed client-side from the activity log, anchored to the live total value.
                </Card>
              </div>
            </Section>

            {/* BACKEND */}
            <Section id="backend" eyebrow="03 · Service" title="backend (Go)">
              <p>
                A small <K>chi</K> service. Handlers call <K>cache.Snapshot(key)</K> — which returns the warm
                value <strong className="text-white/90">without ever triggering an upstream fetch</strong>. The
                pollers are the only writers. The token you&apos;re viewing jumps the fetch queue ahead of
                background refreshes; a per-key circuit breaker stops hammering a failing upstream.
              </p>
              <Table
                head={["Package", "Responsibility"]}
                rows={[
                  [<K>provider</K>, "The data-source contract — one mock, one live impl"],
                  [<K>freedata</K>, "Live provider: DexScreener + GeckoTerminal + Jupiter (+ Helius), pollers, OHLCV sampler"],
                  [<K>ws</K>, "Websocket hub: prices · candles · discover · trades (fan-out)"],
                  [<K>discovery</K>, "In-memory token universe (new + graduating), TTL'd, logo-enriched"],
                  [<K>pumpportal</K>, "Real-time stream of launches / migrations / bonding-curve trades"],
                  [<K>helius</K>, "Token holders + wallet reads + RPC proxy + tx broadcast"],
                  [<K>jupiter</K>, "Keyless swap quotes + batch prices (the live head)"],
                  [<K>cache</K> , "Tiny in-memory TTL cache; serves stale-but-warm without refetch"],
                  [<K>breaker</K>, "Per-key circuit breaker"],
                  [<K>metrics</K>, "Latency registry powering the /status dashboard"],
                ]}
              />
            </Section>

            {/* DATA */}
            <Section id="data" eyebrow="04 · Upstreams" title="data sources">
              <p>All free tier; only Helius and (optionally) PumpPortal trades need a key.</p>
              <Table
                head={["Source", "Used for", "Key?"]}
                rows={[
                  ["GeckoTerminal", "Trending, OHLCV history (1m+), token detail", "keyless"],
                  ["DexScreener", "Multi-token prices, sub-minute sampling, quote-token selection", "keyless"],
                  ["Jupiter", "Swap quotes + routes, batch prices", "keyless"],
                  ["Helius", "Holders, wallet balances, RPC proxy, tx broadcast", <span className="text-solis font-semibold">key</span>],
                  ["PumpPortal", "Real-time launches, migrations (→ Graduating), trades", "key (trades)"],
                  ["pump.fun", "Brand-new bonding-curve token detail + sampling", "keyless"],
                ]}
              />
              <p className="text-sm">
                The pricing layer prefers USDC/USDT/SOL-quoted pools so a token&apos;s USD price comes from a
                reliable quote asset — the fix for the &ldquo;trillion-dollar market cap&rdquo; class of bug.
              </p>
            </Section>

            {/* FLOWS */}
            <Section id="flows" eyebrow="05 · Pipelines" title="key flows">
              <div className="space-y-3">
                <Card title="Live prices">
                  The hub keeps a warm set always priced — owned tokens first, then trending + Big caps — plus
                  any mint a client subscribes to (refcounted). Batch-fetched from Jupiter, pushed as deltas.
                </Card>
                <Diagram
                  src="/brand/diagrams/03-websocket-hub.svg"
                  alt="WebSocket hub + per-mint live-price store — refcounted subscriptions, one batch fetch per tick"
                  caption="WebSocket hub — refcounted per-mint subscriptions (one upstream call per mint regardless of viewers) → a per-mint store that re-renders only the rows that changed."
                />
                <Card title="Charts / OHLCV">
                  History (1m+) from GeckoTerminal, cache-warmed per open chart; the live candle is sampled and
                  streamed, reconciled against the previous close so the forming bar never teleports.
                </Card>
                <Card title="Swap execution — non-custodial">
                  <span className="block mt-1 font-mono text-[12px] text-white/80">
                    build (Jupiter, server) → sign (Privy MPC wallet, browser) → broadcast (server → Helius) →
                    poll + rebroadcast until confirmed
                  </span>
                  <span className="block mt-1.5">The server never holds keys and never signs.</span>
                </Card>
                <Diagram
                  src="/brand/diagrams/04-noncustodial-swap.svg"
                  alt="Non-custodial swap sequence — built server-side, signed in the browser, broadcast server-side"
                  caption="Non-custodial swap — built server-side, signed only in the browser by the Privy MPC wallet, broadcast + confirmed (with idempotent rebroadcast) server-side."
                />
                <Card title="Positions / PnL">
                  Reconstructed from on-chain swap history: running-average cost basis, realized PnL = proceeds
                  − average cost of tokens sold. All in SOL, shown in $ at live rates. No database.
                </Card>
              </div>
            </Section>

            {/* SECURITY */}
            <Section id="security" eyebrow="06 · Trust" title="security model">
              <ul className="space-y-3 list-none">
                <li className="rounded-2xl border border-line bg-surface/40 p-4">
                  <span className="font-semibold text-white">Self-custodial wallets.</span> Privy embedded
                  wallets use MPC / Shamir key sharding — the private key is reconstructed client-side only,
                  after you authenticate. Neither Privy nor the operator can unilaterally reconstruct it.
                </li>
                <li className="rounded-2xl border border-line bg-surface/40 p-4">
                  <span className="font-semibold text-white">No delegated signing.</span> The backend has no
                  signing authority — even the Privy app secret couldn&apos;t move user funds here. The app
                  <em> ID</em> is public by design.
                </li>
                <li className="rounded-2xl border border-line bg-surface/40 p-4">
                  <span className="font-semibold text-white">Secrets</span> live only in{" "}
                  <K>fly secrets</K> / <K>vercel env</K>; <K>.env</K> files are gitignored, never committed.
                </li>
              </ul>
            </Section>

            {/* ROADMAP */}
            <Section id="roadmap" eyebrow="07 · What's next" title="how we plan to expand">
              <div className="grid sm:grid-cols-2 gap-3">
                <Card title="True mark-to-market equity">
                  Reconstruct portfolio value from per-token OHLCV × amount-held-over-time, so the curve wiggles
                  with price between trades.
                </Card>
                <Card title="Real holder PnL & identities">
                  A swap indexer (Helius webhooks → store) replaces today&apos;s labeled-sample holder PnL and
                  trader names with real per-wallet data.
                </Card>
                <Card title="The social layer">
                  Watchlist (already persists locally), Leaderboard, Feed, whale Alerts — the nav is scaffolded;
                  these need an accounts + events backend.
                </Card>
                <Card title="Monetization">
                  On-chain fee per trade via Jupiter <K>platformFeeBps</K> + a referral account, or a thin
                  protocol-owned program.
                </Card>
                <Card title="Persistence & scale">
                  Postgres for accounts / snapshots; Redis-backed cache + hub so the API runs many instances
                  behind a load balancer.
                </Card>
                <Card title="Native apps + hardening">
                  React-Native client reusing the same typed API + Privy; exclude stablecoins from position
                  reconstruction; full observability.
                </Card>
              </div>
            </Section>
          </div>
        </main>
        <Footer />
      </div>
    </div>
  );
}
