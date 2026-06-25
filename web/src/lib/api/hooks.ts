"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { getClient } from "./index";
import { getTokenSeed } from "./tokenCache";
import { useDiscoverStream, useTradesStream } from "@/lib/livePrices";
import type { DiscoverFeeds, Timeframe, Trade } from "./types";

const client = getClient();

// Live mode talks to the Go backend (websocket available); mock mode polls.
const LIVE = !!process.env.NEXT_PUBLIC_API_BASE;

export function useBanner() {
  return useSWR("banner", () => client.getBanner(), {
    refreshInterval: 15_000,
    revalidateOnFocus: false,
  });
}

export function useTrending() {
  return useSWR("trending", () => client.getTrending(), {
    refreshInterval: 15_000,
    revalidateOnFocus: false,
  });
}

export function useDiscover() {
  // Fetch once for instant paint; in live mode the feed is then pushed over the
  // websocket (no polling). Mock mode keeps a poll since it has no backend WS.
  const { data: initial } = useSWR("discover", () => client.getDiscover(), {
    refreshInterval: LIVE ? 0 : 2_000,
    revalidateOnFocus: false,
  });
  const [streamed, setStreamed] = useState<DiscoverFeeds | undefined>(undefined);
  useDiscoverStream(LIVE ? (f) => setStreamed(f as DiscoverFeeds) : undefined);
  const data = streamed ?? initial;
  return { data, isLoading: !data };
}

export function useToken(address: string | null) {
  return useSWR(address ? ["token", address] : null, () =>
    client.getToken(address as string)
  , {
    refreshInterval: 10_000,
    shouldRetryOnError: false,
    // Instant scaffold from the list data we already have, so the header paints
    // immediately on click instead of flashing a skeleton.
    fallbackData: getTokenSeed(address),
  });
}

export function useOHLCV(address: string | null, tf: Timeframe, _fast = false) {
  // Sub-minute history is built from the sampler and GROWS over time, while the
  // candle stream only carries the live edge — so these must keep re-pulling to
  // backfill history. Coarse timeframes have complete history from GeckoTerminal,
  // so they load once and ride the stream.
  const subMinute = tf === "1s" || tf === "5s" || tf === "30s";
  return useSWR(address ? ["ohlcv", address, tf] : null, () =>
    client.getOHLCV(address as string, tf)
  , {
    refreshInterval: subMinute ? 3_000 : 0,
    revalidateOnFocus: false,
    // Refetch fresh history when you switch timeframe (never serve a frozen
    // cold-start cache); just don't poll on a timer for coarse frames.
    revalidateIfStale: true,
    revalidateOnReconnect: false,
    shouldRetryOnError: true,
    errorRetryCount: 8,
    errorRetryInterval: 2_500,
  });
}

export function useHoldings(owner: string | null) {
  // Real on-chain wallet balances. Polls modestly + can be revalidated after a
  // trade settles.
  return useSWR(owner ? ["holdings", owner] : null, () =>
    client.getHoldings(owner as string)
  , { refreshInterval: 15_000, revalidateOnFocus: true, shouldRetryOnError: false });
}

export function usePositions(owner: string | null) {
  // Chain-derived cost basis + realized PnL (reconstructed from swap history).
  // Changes only when you trade, so a slow poll + post-trade revalidation suffices.
  return useSWR(owner ? ["positions", owner] : null, () =>
    client.getPositions(owner as string)
  , { refreshInterval: 60_000, revalidateOnFocus: false, shouldRetryOnError: false });
}

export function useActivity(owner: string | null) {
  // Recent swaps/transfers + deposit/fee totals (same chain history as positions).
  return useSWR(owner ? ["activity", owner] : null, () =>
    client.getActivity(owner as string)
  , { refreshInterval: 60_000, revalidateOnFocus: false, shouldRetryOnError: false });
}

export function useHolders(address: string | null) {
  return useSWR(address ? ["holders", address] : null, () =>
    client.getHolders(address as string)
  , { refreshInterval: 20_000, shouldRetryOnError: false });
}

export function useTrades(address: string | null) {
  // Load once, then take live updates from the websocket trades stream.
  const { data: initial } = useSWR(address ? ["trades", address] : null, () =>
    client.getTrades(address as string)
  , { refreshInterval: LIVE ? 0 : 4_000, shouldRetryOnError: false });
  const [streamed, setStreamed] = useState<Trade[] | undefined>(undefined);
  useEffect(() => setStreamed(undefined), [address]); // reset on token change
  useTradesStream(LIVE ? address : null, (t) => setStreamed(t as Trade[]));
  const data = streamed ?? initial;
  return { data, isLoading: !data };
}
