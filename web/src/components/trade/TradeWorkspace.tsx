"use client";

import { useEffect, useState } from "react";
import { useToken } from "@/lib/api/hooks";
import { useActiveToken } from "@/lib/activeToken";
import { TrendingList } from "./TrendingList";
import { TokenHeader } from "./TokenHeader";
import { ChartCard } from "./ChartCard";
import { HoldersTrades } from "./HoldersTrades";
import { TradePanel } from "./TradePanel";

/**
 * Returns `value` but only after it has stopped changing for `delayMs`. The
 * initial value passes through immediately (so a direct page load isn't delayed)
 * — only subsequent changes debounce.
 */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return settled;
}

function MiddleColumn({ display, settled }: { display: string; settled: string }) {
  // Holders/trades feed follows the *settled* token so flicking past tokens
  // doesn't fetch their feeds.
  const { data: token } = useToken(settled);
  return (
    <div className="flex flex-col min-h-0 lg:h-full">
      {/* Header flips instantly from seed data on every click. */}
      <TokenHeader address={display} />
      {/* Chart (GeckoTerminal OHLCV + the live candle subscription) only loads
          for the token you land on. */}
      <ChartCard address={settled} />
      {token ? (
        <HoldersTrades token={token} />
      ) : (
        <div className="flex-1 min-h-[40vh]" />
      )}
    </div>
  );
}

/**
 * Token-specific workspace (the part that *should* change per token).
 * The trending sidebar lives in the persistent trade layout, so it stays put
 * across navigation. This is just the middle + buy/sell columns.
 * Desktop: chart+info+feed | buy/sell — each scrolls independently.
 * Mobile: single scrolling column, with trending pinned below.
 */
export function TradeWorkspace({ address }: { address: string }) {
  // The displayed token comes from the shared context (updated synchronously on
  // click), so the banner/buy panel switch the instant you click a row.
  const { address: active } = useActiveToken();
  const display = active || address;
  // The expensive, rate-limited fetches (chart OHLCV, holders, trades) and the
  // chart's WS subscription follow a debounced address, so rapidly clicking
  // through tokens only hits the backend for the one you settle on.
  const settled = useDebouncedValue(display, 200);
  return (
    <div className="h-full overflow-y-auto lg:overflow-hidden scroll-thin lg:grid lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* Middle */}
      <MiddleColumn display={display} settled={settled} />

      {/* Right — buy/sell targets the clicked token immediately */}
      <div className="lg:h-full lg:min-h-0">
        <TradePanel address={display} />
      </div>

      {/* Trending — mobile only, below (the layout's sidebar is desktop-only) */}
      <div className="lg:hidden h-[420px] border-t border-line">
        <TrendingList activeAddress={display} />
      </div>
    </div>
  );
}
