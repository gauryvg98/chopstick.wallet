"use client";

import { useToken } from "@/lib/api/hooks";
import { TrendingList } from "./TrendingList";
import { TokenHeader } from "./TokenHeader";
import { ChartCard } from "./ChartCard";
import { HoldersTrades } from "./HoldersTrades";
import { TradePanel } from "./TradePanel";

function MiddleColumn({ address }: { address: string }) {
  const { data: token } = useToken(address);
  return (
    <div className="flex flex-col min-h-0 lg:h-full">
      <TokenHeader address={address} />
      <ChartCard address={address} />
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
  return (
    <div className="h-full overflow-y-auto lg:overflow-hidden scroll-thin lg:grid lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* Middle */}
      <MiddleColumn address={address} />

      {/* Right */}
      <div className="lg:h-full lg:min-h-0">
        <TradePanel address={address} />
      </div>

      {/* Trending — mobile only, below (the layout's sidebar is desktop-only) */}
      <div className="lg:hidden h-[420px] border-t border-line">
        <TrendingList activeAddress={address} />
      </div>
    </div>
  );
}
