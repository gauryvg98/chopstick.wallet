"use client";

import { useState } from "react";
import Link from "next/link";
import { useDiscover } from "@/lib/api/hooks";
import { SiteHeader } from "@/components/SiteHeader";
import { TokenBanner } from "@/components/TokenBanner";
import { TokenAvatar } from "@/components/ui/TokenAvatar";
import { ChangeText } from "@/components/ui/ChangeText";
import { Sparkline } from "@/components/ui/Sparkline";
import { RollingNumber } from "@/components/ui/RollingNumber";
import { LivePrice } from "@/lib/livePrices";
import { useSpotlight } from "@/components/TokenSpotlight";
import { formatCompactUsd, timeAgo, shortAddr } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { DiscoveryToken, TrendingToken } from "@/lib/api/types";

type Tab = "new" | "graduating" | "trending" | "big";

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "new", label: "New", hint: "just launched" },
  { id: "graduating", label: "Graduating", hint: "migrating to Raydium" },
  { id: "trending", label: "Trending", hint: "moving now" },
  { id: "big", label: "🐳 Big", hint: "over $10M" },
];

function DiscoveryCard({ t }: { t: DiscoveryToken }) {
  const { open } = useSpotlight();
  return (
    <Link
      href={`/trade/${t.address}`}
      className="rounded-2xl border border-line bg-surface/60 p-4 hover:border-solis/40 hover:bg-surface transition-colors block"
    >
      <div className="flex items-center gap-3">
        <TokenAvatar
          symbol={t.symbol}
          logoURI={t.logoURI}
          size={40}
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
          <div className="font-bold text-white truncate">{t.symbol}</div>
          <div className="text-xs text-muted truncate">{t.name}</div>
        </div>
        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-solis/15 text-solis tnum shrink-0">
          {timeAgo(t.createdAt)}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-muted">Market cap</span>
        <span className="font-semibold text-white tnum">
          <RollingNumber value={t.marketCap} format={formatCompactUsd} />
        </span>
      </div>
      <div className="mt-1.5 flex items-center justify-between text-xs text-faint">
        <span className="tnum">by {shortAddr(t.creator, 4, 4)}</span>
        <span className="uppercase tracking-wide">{t.pool}</span>
      </div>
    </Link>
  );
}

function TrendingCard({ t }: { t: TrendingToken }) {
  const { open } = useSpotlight();
  return (
    <Link
      href={`/trade/${t.address}`}
      className="rounded-2xl border border-line bg-surface/60 p-4 hover:border-solis/40 hover:bg-surface transition-colors block"
    >
      <div className="flex items-center gap-3">
        <TokenAvatar
          symbol={t.symbol}
          logoURI={t.logoURI}
          size={40}
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
          <div className="font-bold text-white truncate">{t.symbol}</div>
          <div className="text-xs text-muted truncate">{t.name}</div>
        </div>
        <Sparkline data={t.sparkline} />
      </div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <LivePrice mint={t.address} fallback={t.priceUsd} className="text-white font-semibold" />
        <ChangeText value={t.change24h} className="text-sm" hideZero />
      </div>
      <div className="mt-1.5 text-xs text-faint">
        <RollingNumber value={t.marketCap} format={formatCompactUsd} /> mc
      </div>
    </Link>
  );
}

function CardSkeleton() {
  return <div className="h-[132px] rounded-2xl bg-surface/40 animate-pulse" />;
}

export function DiscoverView() {
  const [tab, setTab] = useState<Tab>("new");
  const { data, isLoading } = useDiscover();

  const isTrendingShape = tab === "trending" || tab === "big";
  const items = data?.[tab] ?? [];

  return (
    <div className="flex flex-col min-h-full">
      <SiteHeader />
      <TokenBanner direction="left" />
      <main className="flex-1 bg-app-glow">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
          <div className="flex items-end justify-between flex-wrap gap-4">
            <div>
              <h1 className="font-display font-bold text-4xl sm:text-5xl tracking-tight lowercase">
                discover
              </h1>
              <p className="mt-2 text-muted">
                Fresh Solana launches, streamed live the moment they hit the chain.
              </p>
            </div>
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-solis">
              <span className="h-2 w-2 rounded-full bg-solis animate-pulse" />
              Live · pump.fun stream
            </span>
          </div>

          {/* tabs */}
          <div className="mt-6 flex items-center gap-1 p-1 rounded-2xl bg-surface-2 border border-line w-fit">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "px-4 h-10 rounded-xl text-sm font-bold transition-colors",
                  tab === t.id
                    ? "bg-solis text-ink"
                    : "text-muted hover:text-white"
                )}
              >
                {t.label}
                <span className="hidden sm:inline font-normal opacity-70">
                  {" "}
                  · {t.hint}
                </span>
              </button>
            ))}
          </div>

          {/* grid */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {isLoading && !data
              ? Array.from({ length: 12 }).map((_, i) => <CardSkeleton key={i} />)
              : isTrendingShape
                ? (items as TrendingToken[]).map((t) => (
                    <TrendingCard key={t.address} t={t} />
                  ))
                : (items as DiscoveryToken[]).map((t) => (
                    <DiscoveryCard key={t.address} t={t} />
                  ))}
          </div>

          {!isLoading && items.length === 0 && (
            <div className="mt-10 text-center text-faint">
              {tab === "graduating"
                ? "No tokens graduating right now — check back in a minute."
                : tab === "big"
                  ? "No big caps trading right now."
                  : "Waiting for the next launch…"}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
