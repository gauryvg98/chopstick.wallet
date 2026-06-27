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
import { formatCompactUsd, timeAgo } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { DiscoveryToken, TrendingToken } from "@/lib/api/types";

type Tab = "trending" | "big" | "new" | "graduating";

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
        "flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors",
        active ? "bg-surface-2 ring-1 ring-line-2" : "hover:bg-white/5"
      )}
    >
      <TokenAvatar
        symbol={t.symbol}
        logoURI={t.logoURI}
        size={36}
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
        <div className="text-[15px] font-semibold text-white truncate leading-tight" title={t.name}>
          {t.symbol}
        </div>
        <LivePrice
          mint={t.address}
          fallback={t.priceUsd}
          className="block text-xs text-muted mt-0.5"
        />
      </div>
      <div className="text-right shrink-0">
        <div className="text-[13px] font-semibold text-white tnum leading-tight">
          {formatCompactUsd(t.marketCap)}{" "}
          <span className="text-[10px] font-medium text-faint">MC</span>
        </div>
        <ChangeText value={t.change24h} className="text-xs mt-0.5" />
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
        "flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors",
        active ? "bg-surface-2 ring-1 ring-line-2" : "hover:bg-white/5"
      )}
    >
      <TokenAvatar
        symbol={t.symbol}
        logoURI={t.logoURI}
        size={36}
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
        <div className="text-[15px] font-semibold text-white truncate leading-tight">
          {t.symbol}
        </div>
        <div className="text-xs text-muted truncate mt-0.5" title={t.name}>
          {t.name}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-[13px] font-semibold text-white tnum leading-tight">
          {formatCompactUsd(t.marketCap)}{" "}
          <span className="text-[10px] font-medium text-faint">MC</span>
        </div>
        <div className="text-[11px] text-chad tnum font-semibold mt-0.5">
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
  const graduating = data?.graduating ?? [];

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
  useEffect(() => {
    if (graduating.length) seedTokens(graduating);
  }, [graduating]);

  return (
    <aside className="flex flex-col h-full bg-ink border-r border-line min-h-0">
      <div className="shrink-0 flex items-center gap-1.5 px-2.5 h-12 border-b border-line overflow-x-auto scroll-thin">
        <button
          onClick={() => setTab("trending")}
          className={cn(
            "shrink-0 px-3 h-7 rounded-full text-[13px] font-semibold transition-colors",
            tab === "trending"
              ? "bg-surface-2 text-white ring-1 ring-line-2"
              : "text-muted hover:text-white"
          )}
        >
          Trending
        </button>
        <button
          onClick={() => setTab("big")}
          title="Established tokens over $10M market cap"
          className={cn(
            "shrink-0 px-3 h-7 rounded-full text-[13px] font-semibold transition-colors",
            tab === "big"
              ? "bg-surface-2 text-white ring-1 ring-line-2"
              : "text-muted hover:text-white"
          )}
        >
          Big caps
        </button>
        <button
          onClick={() => setTab("new")}
          className={cn(
            "shrink-0 px-3 h-7 rounded-full text-[13px] font-semibold transition-colors inline-flex items-center gap-1.5",
            tab === "new"
              ? "bg-surface-2 text-white ring-1 ring-line-2"
              : "text-muted hover:text-white"
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-chad animate-pulse" />
          New
        </button>
        <button
          onClick={() => setTab("graduating")}
          title="Bonding-curve tokens close to graduating to a DEX"
          className={cn(
            "shrink-0 px-3 h-7 rounded-full text-[13px] font-semibold transition-colors",
            tab === "graduating"
              ? "bg-surface-2 text-white ring-1 ring-line-2"
              : "text-muted hover:text-white"
          )}
        >
          Graduating
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
        ) : tab === "new" ? (
          news.length ? (
            news.map((t) => (
              <NewRow key={t.address} t={t} active={t.address === activeAddress} />
            ))
          ) : (
            <div className="px-3 py-10 text-center text-xs text-faint">
              Waiting for the next launch…
            </div>
          )
        ) : graduating.length ? (
          graduating.map((t) => (
            <NewRow key={t.address} t={t} active={t.address === activeAddress} />
          ))
        ) : (
          <div className="px-3 py-10 text-center text-xs text-faint">
            None graduating right now.
          </div>
        )}
      </div>
    </aside>
  );
}
