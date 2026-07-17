"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { getClient } from "./index";
import { getTokenSeed } from "./tokenCache";
import { useDiscoverStream, useTradesStream } from "@/lib/livePrices";
import type { DiscoverFeeds, OHLCV, Timeframe, Trade } from "./types";

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

// Progressive OHLCV. Fire ONE fresh (uncached) request for the full window,
// then REVEAL it client-side 20 bars at a time (20 → 120) so the chart snaps in
// instantly and then visibly fills out — the "screen gets rich" effect — WITHOUT
// firing six separate upstream requests (GeckoTerminal's free tier 429s on a
// rapid burst, which would collapse the chart). Every load is served straight
// off the source (GT for 1m+, the local sampler for sub-minute); GT's own CDN
// makes re-views of the same token/frame near-instant, so we need no local
// cache. Same name/shape as before, so the chart consumes it unchanged.
const REVEAL_STEPS = [20, 40, 60, 80, 100, 120];
const REVEAL_MS = 110;

export function useOHLCV(address: string | null, tf: Timeframe, _fast = false) {
  const [data, setData] = useState<OHLCV[] | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!address) {
      setData(undefined);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let interval: ReturnType<typeof setInterval> | null = null;
    setIsLoading(true);
    setData(undefined); // reset on token / timeframe change

    const subMinute = tf === "1s" || tf === "5s" || tf === "30s";
    const tail = (bars: OHLCV[], n: number) => bars.slice(Math.max(0, bars.length - n));

    // No local cache, so a transient GeckoTerminal 429 must self-heal: retry a
    // few times before giving up rather than leaving a blank chart.
    const fetchFull = async (): Promise<OHLCV[]> => {
      for (let attempt = 0; attempt < 4; attempt++) {
        if (cancelled) return [];
        try {
          const bars = await client.getOHLCV(address, tf, 120);
          if (bars && bars.length) return bars;
        } catch {
          /* retry */
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      return [];
    };

    (async () => {
      const full = await fetchFull();
      if (cancelled) return;
      if (!full.length) {
        setIsLoading(false);
        return;
      }
      // Reveal the latest 20 first (instant paint), then grow to the full set.
      REVEAL_STEPS.forEach((n, i) => {
        if (n >= full.length && i > 0 && REVEAL_STEPS[i - 1] >= full.length) return;
        timers.push(
          setTimeout(() => {
            if (cancelled) return;
            setData(tail(full, n));
            setIsLoading(false);
          }, i * REVEAL_MS)
        );
      });
    })();

    // Sub-minute history grows from the live sampler, so keep re-pulling the
    // full window to backfill it; coarse frames ride the WS candle stream.
    if (subMinute) {
      interval = setInterval(async () => {
        try {
          const bars = await client.getOHLCV(address, tf, 120);
          if (!cancelled && bars && bars.length) setData(bars);
        } catch {
          /* ignore */
        }
      }, 3_000);
    }

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      if (interval) clearInterval(interval);
    };
  }, [address, tf]);

  return { data, isLoading };
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
