import type { Token, TokenDetail } from "./types";

/**
 * A tiny client-side cache of the token info we already have in hand from the
 * trending / discover lists. When you click a token we seed `useToken` with this
 * so the header paints *instantly* (real symbol, name, logo, price, market cap)
 * while the full detail, chart, holders and trades lazy-load — killing the
 * blank-then-pop stutter.
 */
const cache = new Map<string, TokenDetail>();

type Seed = Partial<Token> & { address: string; symbol: string; name: string };

function toDetail(t: Seed): TokenDetail {
  return {
    address: t.address,
    symbol: t.symbol,
    name: t.name,
    logoURI: t.logoURI ?? null,
    priceUsd: t.priceUsd ?? 0,
    change24h: t.change24h ?? 0,
    change1h: t.change1h ?? 0,
    marketCap: t.marketCap ?? 0,
    liquidity: t.liquidity ?? 0,
    volume24h: t.volume24h ?? 0,
    // Unknown until the real detail loads — rendered as skeleton-ish zeros.
    fdv: t.marketCap ?? 0,
    totalSupply: 0,
    holderCount: 0,
    top10Pct: 0,
    description: null,
    website: null,
    twitter: null,
    bondingCurve: false,
  };
}

export function seedToken(t: Seed) {
  cache.set(t.address, toDetail(t));
}

export function seedTokens(list: Seed[]) {
  for (const t of list) seedToken(t);
}

/** Returns a scaffold TokenDetail for instant first paint, if we've seen it. */
export function getTokenSeed(address: string | null): TokenDetail | undefined {
  if (!address) return undefined;
  return cache.get(address);
}
