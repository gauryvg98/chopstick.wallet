"use client";

import { useState } from "react";
import { useToken, useHolders } from "@/lib/api/hooks";
import { TokenAvatar } from "@/components/ui/TokenAvatar";
import { ChangeText } from "@/components/ui/ChangeText";
import { useSpotlight } from "@/components/TokenSpotlight";
import { LivePrice, useLivePrice } from "@/lib/livePrices";
import { formatCompactUsd, formatCompact, shortAddr } from "@/lib/format";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-faint">{label}</div>
      <div className="text-sm font-semibold text-white truncate tnum">{value}</div>
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

  return (
    <div className="p-4 border-b border-line">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <TokenAvatar
            symbol={t.symbol}
            logoURI={t.logoURI}
            size={48}
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
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white leading-tight">
                {t.symbol}
              </h1>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(t.address);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                }}
                className="text-xs text-muted hover:text-white inline-flex items-center gap-1 rounded-md bg-surface-2 border border-line px-1.5 py-0.5"
              >
                {copied ? "Copied!" : shortAddr(t.address, 4, 4)}
              </button>
              {t.bondingCurve && (
                <span className="text-[10px] font-bold uppercase tracking-wide rounded-md bg-chad/15 text-chad px-1.5 py-0.5">
                  🌱 Bonding curve
                </span>
              )}
            </div>
            <div className="text-sm text-muted">{t.name}</div>
          </div>
        </div>

        <div className="text-right">
          <div className="text-2xl sm:text-3xl font-bold text-white tnum leading-none">
            {formatCompactUsd(liveMarketCap)}
          </div>
          <div className="text-xs text-faint mt-1">Market cap</div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <LivePrice mint={t.address} fallback={t.priceUsd} className="text-lg font-semibold text-white" />
        <ChangeText value={t.change24h} />
        <span className="text-xs text-faint">24h</span>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Liquidity" value={formatCompactUsd(t.liquidity)} />
        <Stat label="Volume 24h" value={formatCompactUsd(t.volume24h)} />
        <Stat label="Holders" value={formatCompact(t.holderCount)} />
        <Stat
          label="Top 10"
          value={`${(holders && holders.length
            ? holders.slice(0, 10).reduce((a, h) => a + h.pct, 0)
            : t.top10Pct
          ).toFixed(1)}%`}
        />
      </div>

      {t.bondingCurve && <GraduationBar marketCap={t.marketCap} />}
    </div>
  );
}
