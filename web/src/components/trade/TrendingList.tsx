"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useDiscover, useToken } from "@/lib/api/hooks";
import { useWatchlist } from "@/lib/watchlist";
import { seedTokens } from "@/lib/api/tokenCache";
import { TokenAvatar } from "@/components/ui/TokenAvatar";
import { ChangeText } from "@/components/ui/ChangeText";
import { LivePrice, useLivePrice } from "@/lib/livePrices";
import { useSpotlight } from "@/components/TokenSpotlight";
import { useActiveToken } from "@/lib/activeToken";
import { formatCompactUsd, timeAgo } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { DiscoveryToken, TrendingToken } from "@/lib/api/types";

type Tab = "watchlist" | "trending" | "big" | "new" | "graduating";

// Module-level so the selected tab survives a remount (e.g. route change).
let persistedTab: Tab = "trending";

// Let modified clicks (new tab / new window / middle-click) fall through to the
// browser; intercept only a plain left-click for the instant client switch.
function isPlainClick(e: React.MouseEvent) {
  return !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0);
}

/** Live market cap, derived from the streamed price: MC = supply × price, and
 *  supply is constant, so liveMC = staticMC × (livePrice / staticPrice). Keeps
 *  the row's MC ticking in lockstep with its price instead of sitting at the
 *  discover-feed snapshot. Isolated component so only it re-renders per tick. */
function LiveMC({ mint, marketCap, priceUsd }: { mint: string; marketCap: number; priceUsd: number }) {
  const { price } = useLivePrice(mint);
  const mc = price && price > 0 && priceUsd > 0 ? (marketCap * price) / priceUsd : marketCap;
  return (
    <>
      {formatCompactUsd(mc)}{" "}
      <span className="text-[10px] font-medium text-faint">MC</span>
    </>
  );
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
          <LiveMC mint={t.address} marketCap={t.marketCap} priceUsd={t.priceUsd} />
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
        <div className="text-[11px] text-solis tnum font-semibold mt-0.5">
          {timeAgo(t.createdAt)} old
        </div>
      </div>
    </Link>
  );
}

/** A watchlist entry — pulls token detail for a starred mint and reuses the
 *  trending row. TokenDetail has every field TrendingRow reads. */
function WatchRow({ mint, active }: { mint: string; active: boolean }) {
  const { data: t } = useToken(mint);
  if (!t) return <div className="h-[52px] rounded-lg bg-surface/30 animate-pulse" />;
  return <TrendingRow t={{ ...t, rank: 0, sparkline: [] }} active={active} />;
}

export function TrendingList({ activeAddress }: { activeAddress: string }) {
  const [tab, setTabState] = useState<Tab>(persistedTab);
  const setTab = (t: Tab) => {
    persistedTab = t;
    setTabState(t);
  };
  const { data, isLoading } = useDiscover();
  const { mints: watched } = useWatchlist();
  const watchlist = [...watched];
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
    <div className="flex flex-col flex-1 min-h-0">
      {/* sub-tabs scroll horizontally; the right edge fades to hint there's more
          (matches fomo). */}
      <div className="shrink-0 flex items-center gap-1.5 px-2.5 h-11 border-b border-line overflow-x-auto no-scrollbar [mask-image:linear-gradient(to_right,#000_86%,transparent)]">
        <button
          onClick={() => setTab("watchlist")}
          className={cn(
            "shrink-0 px-3 h-7 rounded-full text-[13px] font-semibold transition-colors inline-flex items-center gap-1",
            tab === "watchlist"
              ? "bg-surface-2 text-white ring-1 ring-line-2"
              : "text-muted hover:text-white"
          )}
        >
          <span className="text-solis">★</span> Watchlist
        </button>
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
          <span className="h-1.5 w-1.5 rounded-full bg-solis animate-pulse" />
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
        {tab === "watchlist" ? (
          watchlist.length ? (
            watchlist.map((mint) => (
              <WatchRow key={mint} mint={mint} active={mint === activeAddress} />
            ))
          ) : (
            <div className="px-4 py-10 text-center text-xs text-faint">
              No starred tokens yet. Tap the ★ on any token to add it here.
            </div>
          )
        ) : isLoading && !data ? (
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
    </div>
  );
}
