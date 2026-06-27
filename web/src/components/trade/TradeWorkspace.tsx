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

/**
 * Token-specific workspace (the part that *should* change per token).
 * The trending sidebar lives in the persistent trade layout, so it stays put
 * across navigation.
 *
 * Desktop: a 2-col grid — col 1 stacks header → chart → feed (the feed scrolls),
 * col 2 is the full-height buy/sell panel; each scrolls independently.
 *
 * Mobile: a single scrolling column, but re-ordered via CSS `order` so the
 * buy/sell panel sits right under the price header — you can trade without
 * scrolling past the chart and the whole trades feed first. Chart, feed and
 * trending follow below.
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
  // Feed follows the *settled* token so flicking past tokens doesn't fetch feeds.
  const { data: token } = useToken(settled);

  return (
    <div className="flex flex-col h-full overflow-y-auto lg:overflow-hidden scroll-thin lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[auto_auto_minmax(0,1fr)]">
      {/* Header — top of col 1 (desktop) / top (mobile). Flips instantly from
          seed data on every click. */}
      <div className="order-1 lg:col-start-1 lg:row-start-1">
        <TokenHeader address={display} />
      </div>

      {/* Buy / sell — right under the header on mobile so trading is one tap away;
          full-height right column on desktop. Targets the clicked token at once. */}
      <div className="order-2 lg:col-start-2 lg:row-start-1 lg:row-span-3 lg:h-full lg:min-h-0">
        <TradePanel address={display} />
      </div>

      {/* Chart — only loads for the token you land on. */}
      <div className="order-3 lg:col-start-1 lg:row-start-2">
        <ChartCard address={settled} />
      </div>

      {/* Holders / trades feed (scrolls within its row on desktop; sizes to its
          content on mobile — min-h-0 only on desktop, or the box collapses to 0
          and the feed overlaps the trending list below it). */}
      <div className="order-4 flex flex-col lg:min-h-0 lg:col-start-1 lg:row-start-3">
        {token ? (
          <HoldersTrades token={token} />
        ) : (
          <div className="flex-1 min-h-[40vh]" />
        )}
      </div>

      {/* Trending — mobile only, below (the layout's sidebar is desktop-only) */}
      <div className="order-5 lg:hidden h-[420px] border-t border-line">
        <TrendingList activeAddress={display} />
      </div>
    </div>
  );
}
