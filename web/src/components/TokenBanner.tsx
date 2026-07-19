"use client";

import Link from "next/link";
import { memo } from "react";
import { useBanner } from "@/lib/api/hooks";
import { TokenAvatar } from "@/components/ui/TokenAvatar";
import { ChangeText } from "@/components/ui/ChangeText";
import { PriceText } from "@/components/ui/PriceText";
import { useLivePrice } from "@/lib/livePrices";
import type { Token } from "@/lib/api/types";
import { cn } from "@/lib/cn";

// Live ticker. The roll is width-stable (tabular-nums + fixed-width formatting),
// so a live price no longer reflows the marquee the way the old variable-width
// text did — we can stream it. Falls back to the snapshot price until the first
// tick arrives. memo() keeps items from re-rendering on unrelated parent updates.
const BannerItem = memo(function BannerItem({ t }: { t: Token }) {
  const { price, change24h } = useLivePrice(t.address);
  const p = price && price > 0 ? price : t.priceUsd;
  const chg = change24h ?? t.change24h;
  return (
    <Link
      href={`/trade/${t.address}`}
      className="group flex items-center gap-2.5 px-4 py-2 border-r border-line/60 hover:bg-white/5 transition-colors whitespace-nowrap"
    >
      <TokenAvatar symbol={t.symbol} logoURI={t.logoURI} size={22} />
      <span className="font-semibold text-sm text-white">{t.symbol}</span>
      <PriceText value={p} className="text-sm text-muted tnum" />
      <ChangeText value={chg} className="text-xs" hideZero />
    </Link>
  );
});

/**
 * Auto-scrolling token ticker. Renders the list twice for a seamless loop.
 * Tapping a token routes to its trading page.
 */
export function TokenBanner({
  direction = "left",
  className,
}: {
  direction?: "left" | "right";
  className?: string;
}) {
  const { data } = useBanner();
  const tokens = data ?? [];

  if (tokens.length === 0) {
    return <div className={cn("h-[41px] bg-ink-2 border-y border-line", className)} />;
  }

  const loop = [...tokens, ...tokens];

  return (
    <div
      className={cn(
        "marquee-group relative overflow-hidden bg-ink-2 border-y border-line",
        className
      )}
    >
      {/* edge fades */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 z-10 bg-gradient-to-r from-ink-2 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 z-10 bg-gradient-to-l from-ink-2 to-transparent" />
      <div
        className="marquee-track flex w-max"
        style={{
          animation: `${
            direction === "left" ? "marquee" : "marquee-rev"
          } 50s linear infinite`,
        }}
      >
        {loop.map((t, i) => (
          <BannerItem key={`${t.address}-${i}`} t={t} />
        ))}
      </div>
    </div>
  );
}
