"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useDiscover } from "@/lib/api/hooks";
import { seedTokens } from "@/lib/api/tokenCache";
import { TokenAvatar } from "@/components/ui/TokenAvatar";
import { ChangeText } from "@/components/ui/ChangeText";
import { LivePrice } from "@/lib/livePrices";
import { useSpotlight } from "@/components/TokenSpotlight";
import { useActiveToken } from "@/lib/activeToken";
import { formatCompactUsd, shortAddr, timeAgo } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { DiscoveryToken, TrendingToken } from "@/lib/api/types";

type Tab = "trending" | "big" | "new";

// Module-level so the selected tab survives a remount (e.g. route change).
let persistedTab: Tab = "trending";

// Let modified clicks (new tab / new window / middle-click) fall through to the
// browser; intercept only a plain left-click for the instant client switch.
function isPlainClick(e: React.MouseEvent) {
  return !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0);
}

function TrendingRow({ t, active }: { t: TrendingToken; active: boolean }) {
  const { open } = useSpotlight();
  const { select } = useActiveToken();
  return (
    <Link
      href={`/trade/${t.address}`}
      scroll={false}
      onClick={(e) => {
        if (!isPlainClick(e)) return;
        e.preventDefault();
        select(t); // instant switch from the data we already have
      }}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors",
        active ? "bg-surface-2 ring-1 ring-line-2" : "hover:bg-white/5"
      )}
    >
      <span className="text-xs text-faint w-4 tnum shrink-0">{t.rank}</span>
      <TokenAvatar
        symbol={t.symbol}
        logoURI={t.logoURI}
        size={34}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          open({
            address: t.address,
            symbol: t.symbol,
            name: t.name,
            logoURI: t.logoURI,
            priceUsd: t.priceUsd,
            marketCap: t.marketCap,
            change24h: t.change24h,
          });
        }}
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-white truncate" title={t.name}>
          {t.symbol}
        </div>
        <div className="text-xs text-muted truncate">
          <span className="font-mono text-faint">{shortAddr(t.address)}</span>
          <span> · {formatCompactUsd(t.marketCap)}</span>
        </div>
      </div>
      <div className="text-right shrink-0 w-[78px]">
        <LivePrice mint={t.address} fallback={t.priceUsd} className="block text-sm text-white" />
        <ChangeText value={t.change24h} className="text-xs" showArrow={false} />
      </div>
    </Link>
  );
}

function NewRow({ t, active }: { t: DiscoveryToken; active: boolean }) {
  const { open } = useSpotlight();
  const { select } = useActiveToken();
  return (
    <Link
      href={`/trade/${t.address}`}
      scroll={false}
      onClick={(e) => {
        if (!isPlainClick(e)) return;
        e.preventDefault();
        select(t); // instant switch from the data we already have
      }}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors",
        active ? "bg-surface-2 ring-1 ring-line-2" : "hover:bg-white/5"
      )}
    >
      <TokenAvatar
        symbol={t.symbol}
        logoURI={t.logoURI}
        size={34}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          open({
            address: t.address,
            symbol: t.symbol,
            name: t.name,
            logoURI: t.logoURI,
            priceUsd: 0,
            marketCap: t.marketCap,
            change24h: 0,
          });
        }}
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-white truncate">{t.symbol}</div>
        <div className="text-xs text-muted truncate" title={t.name}>{t.name}</div>
        <div className="text-[11px] font-mono text-faint truncate">
          {shortAddr(t.address)}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-semibold text-white tnum">
          {formatCompactUsd(t.marketCap)}
        </div>
        <div className="text-[11px] text-chad tnum font-semibold">
          {timeAgo(t.createdAt)} old
        </div>
      </div>
    </Link>
  );
}

export function TrendingList({ activeAddress }: { activeAddress: string }) {
  const [tab, setTabState] = useState<Tab>(persistedTab);
  const setTab = (t: Tab) => {
    persistedTab = t;
    setTabState(t);
  };
  const { data, isLoading } = useDiscover();
  const trending = data?.trending ?? [];
  const big = data?.big ?? [];
  const news = data?.new ?? [];

  // Seed the instant-scaffold cache so clicking any of these paints immediately.
  useEffect(() => {
    if (trending.length) seedTokens(trending);
  }, [trending]);
  useEffect(() => {
    if (big.length) seedTokens(big);
  }, [big]);
  useEffect(() => {
    if (news.length) seedTokens(news);
  }, [news]);

  return (
    <aside className="flex flex-col h-full bg-ink border-r border-line min-h-0">
      <div className="shrink-0 flex items-center gap-1 px-2 h-12 border-b border-line">
        <button
          onClick={() => setTab("trending")}
          className={cn(
            "px-2.5 h-8 rounded-lg text-sm font-bold transition-colors",
            tab === "trending" ? "bg-surface-2 text-white" : "text-muted hover:text-white"
          )}
        >
          🔥 Trending
        </button>
        <button
          onClick={() => setTab("big")}
          title="Established tokens over $10M market cap"
          className={cn(
            "px-2.5 h-8 rounded-lg text-sm font-bold transition-colors",
            tab === "big" ? "bg-surface-2 text-white" : "text-muted hover:text-white"
          )}
        >
          🐳 Big
        </button>
        <button
          onClick={() => setTab("new")}
          className={cn(
            "px-2.5 h-8 rounded-lg text-sm font-bold transition-colors inline-flex items-center gap-1.5",
            tab === "new" ? "bg-surface-2 text-white" : "text-muted hover:text-white"
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-chad animate-pulse" />
          New
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scroll-thin p-2 space-y-0.5">
        {isLoading && !data ? (
          Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-[58px] rounded-xl bg-surface/40 animate-pulse" />
          ))
        ) : tab === "trending" ? (
          trending.map((t) => (
            <TrendingRow key={t.address} t={t} active={t.address === activeAddress} />
          ))
        ) : tab === "big" ? (
          big.length ? (
            big.map((t) => (
              <TrendingRow key={t.address} t={t} active={t.address === activeAddress} />
            ))
          ) : (
            <div className="px-3 py-10 text-center text-xs text-faint">
              No big caps trading right now.
            </div>
          )
        ) : news.length ? (
          news.map((t) => (
            <NewRow key={t.address} t={t} active={t.address === activeAddress} />
          ))
        ) : (
          <div className="px-3 py-10 text-center text-xs text-faint">
            Waiting for the next launch…
          </div>
        )}
      </div>
    </aside>
  );
}
