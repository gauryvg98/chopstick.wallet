import type {
  ApiClient,
  DiscoverFeeds,
  DiscoveryToken,
  Holder,
  OHLCV,
  Quote,
  QuoteRequest,
  Timeframe,
  Token,
  TokenDetail,
  Trade,
  TradeSide,
  TrendingToken,
  WalletHoldings,
  WalletActivity,
  WalletPositions,
} from "./types";
import { SEED_TOKENS, SeedToken, TRADER_LABELS } from "./seed";

/* ---- deterministic RNG so charts/holders are stable across renders ---- */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toToken(s: SeedToken): Token {
  return {
    address: s.address,
    symbol: s.symbol,
    name: s.name,
    logoURI: null,
    priceUsd: s.price,
    change24h: s.change24h,
    change1h: s.change1h,
    marketCap: s.marketCap,
    liquidity: s.liquidity,
    volume24h: s.volume24h,
  };
}

function findSeed(address: string): SeedToken {
  return (
    SEED_TOKENS.find((t) => t.address === address) ?? SEED_TOKENS[0]
  );
}

/** Build a stable sparkline ending near the current price. */
function sparkline(s: SeedToken, points = 24): number[] {
  const rng = mulberry32(hashStr(s.address + "spark"));
  const drift = s.change24h / 100;
  const out: number[] = [];
  let p = s.price / (1 + drift);
  for (let i = 0; i < points; i++) {
    const noise = (rng() - 0.5) * 0.04;
    p = p * (1 + drift / points + noise);
    out.push(p);
  }
  out[out.length - 1] = s.price;
  return out;
}

const TF_CONFIG: Record<Timeframe, { points: number; stepSec: number }> = {
  "1s": { points: 120, stepSec: 1 },
  "5s": { points: 120, stepSec: 5 },
  "30s": { points: 120, stepSec: 30 },
  "1m": { points: 120, stepSec: 60 },
  "10m": { points: 120, stepSec: 600 },
  "1h": { points: 120, stepSec: 3600 },
  "4h": { points: 120, stepSec: 14400 },
};

function buildOHLCV(s: SeedToken, tf: Timeframe): OHLCV[] {
  const { points, stepSec } = TF_CONFIG[tf];
  const rng = mulberry32(hashStr(s.address + tf));
  const endSec = Math.floor(Date.now() / 1000 / stepSec) * stepSec;
  const vol = stepSec <= 60 ? 0.012 : 0.05;

  // Walk backward from the current price so the latest candle matches it.
  const closes: number[] = new Array(points);
  let price = s.price;
  for (let i = points - 1; i >= 0; i--) {
    closes[i] = price;
    const ret = (rng() - 0.5) * 2 * vol + (s.change24h / 100) * (vol / 6);
    price = price / (1 + ret);
  }

  const out: OHLCV[] = [];
  for (let i = 0; i < points; i++) {
    const close = closes[i];
    const open = i === 0 ? close * (1 + (rng() - 0.5) * vol) : closes[i - 1];
    const hi = Math.max(open, close) * (1 + rng() * vol * 0.8);
    const lo = Math.min(open, close) * (1 - rng() * vol * 0.8);
    out.push({
      time: endSec - (points - 1 - i) * stepSec,
      open,
      high: hi,
      low: lo,
      close,
      volume: (s.volume24h / points) * (0.4 + rng()),
    });
  }
  return out;
}

function buildHolders(s: SeedToken): Holder[] {
  const rng = mulberry32(hashStr(s.address + "holders"));
  const totalSupply = s.marketCap / s.price;
  const count = 28;
  const out: Holder[] = [];
  let remaining = 64; // % of supply distributed among top holders
  for (let i = 0; i < count; i++) {
    const share = i < 3 ? remaining * (0.18 + rng() * 0.1) : remaining * (0.03 + rng() * 0.05);
    const pct = Math.max(0.05, Math.min(share, remaining));
    remaining = Math.max(0, remaining - pct);
    out.push({
      rank: i + 1,
      address: randAddr(rng),
      pct,
      valueUsd: (pct / 100) * s.marketCap,
      tokenAmount: (pct / 100) * totalSupply,
    });
  }
  return out;
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function randAddr(rng: () => number): string {
  let out = "";
  for (let i = 0; i < 44; i++) out += B58[Math.floor(rng() * B58.length)];
  return out;
}

function buildTrades(s: SeedToken, n = 40): Trade[] {
  // Uses Date.now() so polling surfaces fresh trades (live feel).
  const rng = mulberry32(hashStr(s.address + Math.floor(Date.now() / 4000)));
  const buyBias = 0.5 + Math.max(-0.25, Math.min(0.25, s.change24h / 200));
  const out: Trade[] = [];
  let t = Date.now();
  for (let i = 0; i < n; i++) {
    const side: TradeSide = rng() < buyBias ? "buy" : "sell";
    const usd = Math.exp(rng() * 6) * 12; // ~$12 .. ~$5k
    const labelled = rng() < 0.4;
    t -= Math.floor(rng() * 14000) + 800;
    out.push({
      id: `${s.address}-${i}-${t}`,
      side,
      trader: randAddr(rng),
      traderLabel: labelled
        ? TRADER_LABELS[Math.floor(rng() * TRADER_LABELS.length)]
        : null,
      amountUsd: usd,
      tokenAmount: usd / s.price,
      priceUsd: s.price * (1 + (rng() - 0.5) * 0.01),
      timestamp: t,
      txHash: randAddr(rng),
    });
  }
  return out;
}

function buildDetail(s: SeedToken): TokenDetail {
  const rng = mulberry32(hashStr(s.address + "detail"));
  const totalSupply = s.marketCap / s.price;
  const holders = buildHolders(s);
  const top10Pct = holders.slice(0, 10).reduce((a, h) => a + h.pct, 0);
  return {
    ...toToken(s),
    fdv: s.marketCap * (1 + rng() * 0.15),
    totalSupply,
    holderCount: Math.floor(2000 + rng() * 60000),
    top10Pct,
    description: `${s.name} ($${s.symbol}) is a community-driven token trading on Solana.`,
    website: null,
    twitter: `https://x.com/${s.symbol.toLowerCase()}`,
    bondingCurve: false,
  };
}

const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms));

export class MockClient implements ApiClient {
  async getBanner(): Promise<Token[]> {
    await delay(80);
    return SEED_TOKENS.map(toToken);
  }

  async getDiscover(): Promise<DiscoverFeeds> {
    await delay(120);
    const trending = await this.getTrending();
    const now = Date.now();
    const NAMES = [
      "Solking Inu", "Solana Pepe", "Wojak Cat", "Moon Doge", "Solis Coin",
      "Based God", "Pump King", "Degen Ape", "Rug Survivor", "Floki Sol",
      "Bonk Jr", "Sigma Frog", "Turbo Cat", "Alpha Wolf",
    ];
    const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const randAddr = (r: () => number) => {
      let s = "";
      for (let i = 0; i < 44; i++) s += B58[Math.floor(r() * B58.length)];
      return s;
    };
    const mk = (i: number, status: "new" | "graduating"): DiscoveryToken => {
      const r = mulberry32(hashStr(NAMES[i % NAMES.length] + status + i));
      const sym = NAMES[i % NAMES.length].split(" ")[0].toUpperCase().slice(0, 6);
      return {
        address: randAddr(r),
        symbol: sym,
        name: NAMES[i % NAMES.length],
        logoURI: null,
        marketCap:
          status === "graduating"
            ? 60000 + r() * 20000
            : 3000 + r() * 30000,
        creator: randAddr(r),
        pool: "pump",
        // new tokens are seconds-to-minutes old; refreshed each poll
        createdAt: now - Math.floor(r() * (status === "new" ? 120 : 1800) * 1000),
        status,
      };
    };
    const fresh = Array.from({ length: 14 }, (_, i) => mk(i, "new")).sort(
      (a, b) => b.createdAt - a.createdAt
    );
    const grad = Array.from({ length: 5 }, (_, i) => mk(i + 20, "graduating")).sort(
      (a, b) => b.createdAt - a.createdAt
    );
    const big = trending.filter((t) => t.marketCap >= 10_000_000);
    return { new: fresh, graduating: grad, trending, big };
  }

  async getTrending(): Promise<TrendingToken[]> {
    await delay(120);
    return [...SEED_TOKENS]
      .sort((a, b) => b.volume24h - a.volume24h)
      .map((s, i) => ({
        ...toToken(s),
        rank: i + 1,
        sparkline: sparkline(s),
      }));
  }

  async getToken(address: string): Promise<TokenDetail> {
    await delay(100);
    return buildDetail(findSeed(address));
  }

  async getOHLCV(address: string, tf: Timeframe): Promise<OHLCV[]> {
    await delay(140);
    return buildOHLCV(findSeed(address), tf);
  }

  async getHolders(address: string): Promise<Holder[]> {
    await delay(120);
    return buildHolders(findSeed(address));
  }

  async getTrades(address: string): Promise<Trade[]> {
    await delay(120);
    return buildTrades(findSeed(address));
  }

  async getHoldings(): Promise<WalletHoldings> {
    await delay(120);
    return { solBalance: 10, tokens: [] };
  }

  async getPositions(): Promise<WalletPositions> {
    await delay(120);
    return { positions: [], realizedSol: 0 };
  }

  async getActivity(): Promise<WalletActivity> {
    await delay(120);
    return { deposited: 0, withdrawn: 0, feesSol: 0, items: [] };
  }

  async getQuote(req: QuoteRequest): Promise<Quote> {
    await delay(160);
    const inSeed = findSeed(req.inputMint);
    const outSeed = findSeed(req.outputMint);
    const inUsd = (req.amount / 1e9) * inSeed.price;
    const outAmount = (inUsd / outSeed.price) * 1e9 * (1 - 0.003);
    return {
      inputMint: req.inputMint,
      outputMint: req.outputMint,
      inAmount: req.amount,
      outAmount: Math.floor(outAmount),
      priceImpactPct: 0.08,
      routeLabel: "Jupiter · best route",
    };
  }
}
