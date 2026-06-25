"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { PriceText } from "@/components/ui/PriceText";
import { cn } from "@/lib/cn";

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

interface LivePricesCtx {
  prices: Record<string, Tick>;
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
  const [prices, setPrices] = useState<Record<string, Tick>>({});
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
            setPrices((prev) => ({ ...prev, ...m.data }));
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
  }, []);

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

  return (
    <Ctx.Provider
      value={{ prices, subscribe, subscribeCandles, subscribeDiscover, subscribeTrades }}
    >
      {children}
    </Ctx.Provider>
  );
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

/** Live price + flash direction for one mint (subscribes while mounted). */
export function useLivePrice(mint?: string | null) {
  const ctx = useContext(Ctx);
  const prevRef = useRef<number | undefined>(undefined);
  const [dir, setDir] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (!mint || !ctx) return;
    return ctx.subscribe([mint]);
  }, [mint, ctx]);

  const tick = mint && ctx ? ctx.prices[mint] : undefined;
  const price = tick?.price;

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
  const { price, dir } = useLivePrice(mint);
  // Never render a live 0 (e.g. while the price stream is briefly unavailable) —
  // fall back to the last-known static price instead.
  const value = price && price > 0 ? price : fallback;
  return (
    <PriceText
      value={value}
      className={cn(
        "px-0.5",
        dir === "up" && "flash-up",
        dir === "down" && "flash-down",
        className
      )}
    />
  );
}
