"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { PriceText } from "@/components/ui/PriceText";

interface Tick {
  price: number;
  change24h: number;
}

export interface StreamBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * External price store. Prices live OUTSIDE React state so a tick only
 * re-renders the components watching *that* mint (per-mint listeners), and at
 * most once per animation frame (changes are coalesced and flushed on rAF).
 *
 * The old design kept the whole price map in a single context value, so every
 * tick for any mint changed the value's identity and re-rendered every
 * `useLivePrice` consumer on the page — the main-thread churn that made token
 * switches lag. This keeps the live feel (≥60fps to the eye) without the storm.
 */
function createPriceStore() {
  const prices = new Map<string, Tick>();
  const listeners = new Map<string, Set<() => void>>();
  const pending = new Set<string>();
  const lastNotified = new Map<string, number>();
  let raf: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  // The heavy slot-machine roll takes ~0.55s to land, but the firehose can push
  // a token's price 5x/s. Rendering every tick would leave the digits perpetually
  // mid-spin — unreadable. So we throttle NOTIFICATIONS per mint to one per roll
  // duration (the latest price is always in `prices`, so `get` stays fresh; a
  // trailing flush guarantees the final value shows). The number stays live and
  // readable instead of a blur. Chart/trade streams don't go through here.
  const MIN_MS = 650;

  const flush = () => {
    raf = null;
    timer = null;
    const now = Date.now();
    let soonest = Infinity;
    for (const mint of [...pending]) {
      const wait = MIN_MS - (now - (lastNotified.get(mint) ?? 0));
      if (wait <= 0) {
        lastNotified.set(mint, now);
        pending.delete(mint);
        const ls = listeners.get(mint);
        if (ls) for (const l of ls) l();
      } else if (wait < soonest) {
        soonest = wait;
      }
    }
    // Some mints are still cooling down — re-flush when the soonest is eligible.
    if (pending.size > 0 && soonest !== Infinity) {
      timer = setTimeout(flush, soonest);
    }
  };

  const scheduleFlush = () => {
    if (raf !== null || timer !== null) return;
    raf =
      typeof requestAnimationFrame !== "undefined"
        ? requestAnimationFrame(flush)
        : (setTimeout(flush, 16) as unknown as number);
  };

  return {
    get: (mint: string): Tick | undefined => prices.get(mint),
    apply: (data: Record<string, Tick>) => {
      let any = false;
      for (const mint in data) {
        const t = data[mint];
        if (!t) continue;
        const prev = prices.get(mint);
        if (!prev || prev.price !== t.price || prev.change24h !== t.change24h) {
          prices.set(mint, t);
          pending.add(mint);
          any = true;
        }
      }
      if (any) scheduleFlush();
    },
    subscribe: (mint: string, cb: () => void): (() => void) => {
      let set = listeners.get(mint);
      if (!set) {
        set = new Set();
        listeners.set(mint, set);
      }
      set.add(cb);
      return () => {
        const s = listeners.get(mint);
        if (!s) return;
        s.delete(cb);
        if (s.size === 0) listeners.delete(mint);
      };
    },
  };
}
type PriceStore = ReturnType<typeof createPriceStore>;

interface LivePricesCtx {
  store: PriceStore;
  subscribe: (mints: string[]) => () => void;
  subscribeCandles: (mint: string, tf: string, cb: (bar: StreamBar) => void) => () => void;
  subscribeDiscover: (cb: (feed: unknown) => void) => () => void;
  subscribeTrades: (mint: string, cb: (trades: unknown) => void) => () => void;
}

const Ctx = createContext<LivePricesCtx | null>(null);

// Derive ws:// from the backend base URL. Null in mock-only mode (no backend).
const WS_URL = (() => {
  const base = process.env.NEXT_PUBLIC_API_BASE;
  if (!base) return null;
  try {
    const u = new URL(base);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    u.pathname = u.pathname.replace(/\/$/, "") + "/ws";
    return u.toString();
  } catch {
    return null;
  }
})();

export function LivePricesProvider({ children }: { children: React.ReactNode }) {
  const storeRef = useRef<PriceStore | null>(null);
  if (!storeRef.current) storeRef.current = createPriceStore();
  const store = storeRef.current;

  const wsRef = useRef<WebSocket | null>(null);
  const refcounts = useRef<Map<string, number>>(new Map());
  // "mint|tf" -> set of candle callbacks
  const candleCbs = useRef<Map<string, Set<(b: StreamBar) => void>>>(new Map());
  const discoverCbs = useRef<Set<(f: unknown) => void>>(new Set());
  // mint -> set of trade callbacks
  const tradeCbs = useRef<Map<string, Set<(t: unknown) => void>>>(new Map());

  const send = (obj: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  };

  useEffect(() => {
    if (!WS_URL) return;
    let closed = false;
    let timer: ReturnType<typeof setTimeout>;

    const connect = () => {
      const ws = new WebSocket(WS_URL!);
      wsRef.current = ws;
      ws.onopen = () => {
        const mints = [...refcounts.current.keys()];
        if (mints.length) ws.send(JSON.stringify({ type: "sub", mints }));
        // Re-subscribe candle streams after a reconnect.
        for (const key of candleCbs.current.keys()) {
          const [mint, tf] = key.split("|");
          ws.send(JSON.stringify({ type: "sub_candles", mint, tf }));
        }
        if (discoverCbs.current.size) ws.send(JSON.stringify({ type: "sub_discover" }));
        for (const mint of tradeCbs.current.keys()) {
          ws.send(JSON.stringify({ type: "sub_trades", mint }));
        }
      };
      ws.onmessage = (e) => {
        try {
          const m = JSON.parse(e.data);
          if (m.type === "prices" && m.data) {
            // Coalesced, per-mint — no global re-render.
            store.apply(m.data as Record<string, Tick>);
          } else if (m.type === "candle" && m.bar) {
            const cbs = candleCbs.current.get(`${m.mint}|${m.tf}`);
            if (cbs) for (const cb of cbs) cb(m.bar as StreamBar);
          } else if (m.type === "discover" && m.data) {
            for (const cb of discoverCbs.current) cb(m.data);
          } else if (m.type === "trades" && m.data) {
            const cbs = tradeCbs.current.get(m.mint);
            if (cbs) for (const cb of cbs) cb(m.data);
          }
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        if (!closed) timer = setTimeout(connect, 2000);
      };
      ws.onerror = () => ws.close();
    };
    connect();

    return () => {
      closed = true;
      clearTimeout(timer);
      wsRef.current?.close();
    };
  }, [store]);

  const subscribe = useCallback((mints: string[]) => {
    const newly: string[] = [];
    for (const m of mints) {
      const c = refcounts.current.get(m) ?? 0;
      if (c === 0) newly.push(m);
      refcounts.current.set(m, c + 1);
    }
    if (newly.length) send({ type: "sub", mints: newly });

    return () => {
      const gone: string[] = [];
      for (const m of mints) {
        const c = refcounts.current.get(m) ?? 0;
        if (c <= 1) {
          refcounts.current.delete(m);
          gone.push(m);
        } else {
          refcounts.current.set(m, c - 1);
        }
      }
      if (gone.length) send({ type: "unsub", mints: gone });
    };
  }, []);

  const subscribeCandles = useCallback(
    (mint: string, tf: string, cb: (b: StreamBar) => void) => {
      const key = `${mint}|${tf}`;
      let set = candleCbs.current.get(key);
      if (!set) {
        set = new Set();
        candleCbs.current.set(key, set);
        send({ type: "sub_candles", mint, tf }); // first subscriber for this stream
      }
      set.add(cb);
      return () => {
        const s = candleCbs.current.get(key);
        if (!s) return;
        s.delete(cb);
        if (s.size === 0) {
          candleCbs.current.delete(key);
          send({ type: "unsub_candles", mint, tf });
        }
      };
    },
    []
  );

  const subscribeDiscover = useCallback((cb: (f: unknown) => void) => {
    const first = discoverCbs.current.size === 0;
    discoverCbs.current.add(cb);
    if (first) send({ type: "sub_discover" });
    return () => {
      discoverCbs.current.delete(cb);
      if (discoverCbs.current.size === 0) send({ type: "unsub_discover" });
    };
  }, []);

  const subscribeTrades = useCallback((mint: string, cb: (t: unknown) => void) => {
    let set = tradeCbs.current.get(mint);
    if (!set) {
      set = new Set();
      tradeCbs.current.set(mint, set);
      send({ type: "sub_trades", mint });
    }
    set.add(cb);
    return () => {
      const s = tradeCbs.current.get(mint);
      if (!s) return;
      s.delete(cb);
      if (s.size === 0) {
        tradeCbs.current.delete(mint);
        send({ type: "unsub_trades", mint });
      }
    };
  }, []);

  const value = useMemo<LivePricesCtx>(
    () => ({ store, subscribe, subscribeCandles, subscribeDiscover, subscribeTrades }),
    [store, subscribe, subscribeCandles, subscribeDiscover, subscribeTrades]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Subscribe to the live discover feed (new + graduating + trending). */
export function useDiscoverStream(onFeed?: (f: unknown) => void) {
  const ctx = useContext(Ctx);
  const cbRef = useRef(onFeed);
  cbRef.current = onFeed;
  useEffect(() => {
    if (!ctx || !cbRef.current) return;
    return ctx.subscribeDiscover((f) => cbRef.current?.(f));
  }, [ctx]);
}

/** Subscribe to the live trades stream for one mint. */
export function useTradesStream(mint: string | null, onTrades?: (t: unknown) => void) {
  const ctx = useContext(Ctx);
  const cbRef = useRef(onTrades);
  cbRef.current = onTrades;
  useEffect(() => {
    if (!ctx || !mint || !cbRef.current) return;
    return ctx.subscribeTrades(mint, (t) => cbRef.current?.(t));
  }, [ctx, mint]);
}

/** Subscribe to the backend's live candle stream for one (mint, tf). */
export function useCandleStream(
  mint: string | null,
  tf: string,
  onBar: (b: StreamBar) => void
) {
  const ctx = useContext(Ctx);
  const cbRef = useRef(onBar);
  cbRef.current = onBar;
  useEffect(() => {
    if (!mint || !ctx) return;
    return ctx.subscribeCandles(mint, tf, (b) => cbRef.current(b));
  }, [mint, tf, ctx]);
}

/** Keep a set of mints subscribed to the live-price stream while mounted — used
 *  to keep a user's owned tokens always priced (top priority), regardless of
 *  which panel/page is showing them. */
export function useWatchMints(mints: string[]) {
  const ctx = useContext(Ctx);
  const key = mints.join(",");
  useEffect(() => {
    if (!ctx || !mints.length) return;
    return ctx.subscribe(mints);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, key]);
}

/** Live price + flash direction for one mint (subscribes while mounted). Only
 *  re-renders when THIS mint ticks, at most once per animation frame. */
export function useLivePrice(mint?: string | null) {
  const ctx = useContext(Ctx);

  // Tell the backend to stream this mint (refcounted across all consumers).
  useEffect(() => {
    if (!mint || !ctx) return;
    return ctx.subscribe([mint]);
  }, [mint, ctx]);

  const store = ctx?.store;
  const subscribe = useCallback(
    (cb: () => void) => (store && mint ? store.subscribe(mint, cb) : () => {}),
    [store, mint]
  );
  const getSnapshot = useCallback(
    () => (store && mint ? store.get(mint) : undefined),
    [store, mint]
  );
  const tick = useSyncExternalStore(subscribe, getSnapshot, () => undefined);
  const price = tick?.price;

  const prevRef = useRef<number | undefined>(undefined);
  const [dir, setDir] = useState<"up" | "down" | null>(null);
  useEffect(() => {
    if (price === undefined) return;
    const prev = prevRef.current;
    prevRef.current = price;
    if (prev !== undefined && price !== prev) {
      setDir(price > prev ? "up" : "down");
      const t = setTimeout(() => setDir(null), 700);
      return () => clearTimeout(t);
    }
  }, [price]);

  return { price, change24h: tick?.change24h, dir };
}

/** Price display that ticks live over the websocket and flashes on change. */
export function LivePrice({
  mint,
  fallback,
  className,
}: {
  mint: string;
  fallback: number;
  className?: string;
}) {
  const { price } = useLivePrice(mint);
  // Never render a live 0 (e.g. while the price stream is briefly unavailable) —
  // fall back to the last-known static price instead. PriceText handles the
  // slot-machine roll + up/down flash itself when `value` changes.
  const value = price && price > 0 ? price : fallback;
  return <PriceText value={value} className={className} />;
}
