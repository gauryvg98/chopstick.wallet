"use client";

import { useState } from "react";
import { useToken, useHolders } from "@/lib/api/hooks";
import { TokenAvatar } from "@/components/ui/TokenAvatar";
import { ChangeText } from "@/components/ui/ChangeText";
import { useSpotlight } from "@/components/TokenSpotlight";
import { LivePrice, useLivePrice } from "@/lib/livePrices";
import { formatCompactUsd, formatCompact, shortAddr } from "@/lib/format";

/** fomo-style bordered stat box: tiny uppercase label over a tnum value. */
function StatBox({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="shrink-0 rounded-xl border border-line bg-surface/40 px-3 py-1.5 min-w-[88px]">
      <div className="text-[10px] uppercase tracking-wide text-faint">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-white tnum truncate">
        {children ?? value}
      </div>
    </div>
  );
}

// pump.fun tokens graduate to a DEX at roughly this market cap.
const GRADUATION_USD = 69_000;

function GraduationBar({ marketCap }: { marketCap: number }) {
  const pct = Math.max(0, Math.min(1, marketCap / GRADUATION_USD));
  return (
    <div className="mt-4 rounded-xl bg-surface-2 border border-line px-3 py-2.5">
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="text-muted font-medium">Bonding curve → Raydium</span>
        <span className="tnum text-white font-semibold">
          {formatCompactUsd(marketCap)} / {formatCompactUsd(GRADUATION_USD)}
        </span>
      </div>
      <div className="h-2 rounded-full bg-ink overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-chad to-teal transition-[width] duration-500"
          style={{ width: `${(pct * 100).toFixed(1)}%` }}
        />
      </div>
    </div>
  );
}

export function TokenHeader({ address }: { address: string }) {
  const { data: t } = useToken(address);
  const { data: holders } = useHolders(address);
  const { price: livePrice } = useLivePrice(address);
  const { open: openSpotlight } = useSpotlight();
  const [copied, setCopied] = useState(false);

  // Market cap that tracks the LIVE price (price × supply), so it moves in
  // real time with the Jupiter price tick instead of lagging the 10s detail
  // fetch. Falls back to the static market cap until we have both.
  const liveMarketCap =
    livePrice && livePrice > 0 && t?.totalSupply
      ? livePrice * t.totalSupply
      : t?.marketCap ?? 0;

  if (!t) {
    return (
      <div className="p-4 border-b border-line animate-pulse space-y-3">
        <div className="h-10 w-48 bg-surface rounded-lg" />
        <div className="h-12 w-40 bg-surface rounded-lg" />
      </div>
    );
  }

  const top10 = (
    holders && holders.length
      ? holders.slice(0, 10).reduce((a, h) => a + h.pct, 0)
      : t.top10Pct
  ).toFixed(1);

  return (
    <div className="p-3 border-b border-line">
      <div className="flex items-center gap-3">
        {/* identity */}
        <div className="flex items-center gap-2.5 shrink-0">
          <TokenAvatar
            symbol={t.symbol}
            logoURI={t.logoURI}
            size={40}
            onClick={() =>
              openSpotlight({
                address: t.address,
                symbol: t.symbol,
                name: t.name,
                logoURI: t.logoURI,
                priceUsd: t.priceUsd,
                marketCap: t.marketCap,
                change24h: t.change24h,
              })
            }
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white leading-tight">
                {t.symbol}
              </h1>
              <span className="text-sm text-muted truncate max-w-[120px]">
                {t.name}
              </span>
              {t.bondingCurve && (
                <span className="text-[10px] font-bold uppercase tracking-wide rounded-md bg-chad/15 text-chad px-1.5 py-0.5">
                  🌱
                </span>
              )}
            </div>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(t.address);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              }}
              className="mt-0.5 text-[11px] font-mono text-faint hover:text-white inline-flex items-center gap-1"
            >
              {copied ? "Copied!" : shortAddr(t.address, 4, 4)}
              <span className="text-[10px]">⧉</span>
            </button>
          </div>
        </div>

        {/* fomo-style stat boxes — scroll horizontally when they overflow */}
        <div className="flex items-center gap-2 overflow-x-auto scroll-thin flex-1 min-w-0 pb-0.5">
          <StatBox label="Market cap" value={formatCompactUsd(liveMarketCap)} />
          <StatBox label="Price">
            <LivePrice mint={t.address} fallback={t.priceUsd} className="text-sm font-semibold text-white" />
          </StatBox>
          <StatBox label="24H change">
            <ChangeText value={t.change24h} className="text-sm" />
          </StatBox>
          <StatBox label="24H Vol" value={formatCompactUsd(t.volume24h)} />
          <StatBox label="Liquidity" value={formatCompactUsd(t.liquidity)} />
          <StatBox label="Holders" value={formatCompact(t.holderCount)} />
          <StatBox label="Top 10" value={`${top10}%`} />
        </div>
      </div>

      {t.bondingCurve && <GraduationBar marketCap={t.marketCap} />}
    </div>
  );
}
