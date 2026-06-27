"use client";

import { useState } from "react";
import { useToken, useTrades } from "@/lib/api/hooks";
import { formatCompactUsd, formatPct } from "@/lib/format";
import { cn } from "@/lib/cn";

/** A perf chip (1H / 24H) — green/red with a directional triangle. */
function PerfBox({ label, value }: { label: string; value: number }) {
  const up = value >= 0;
  return (
    <div className="rounded-lg border border-line bg-surface-2/40 px-2 py-1.5 text-center">
      <div className="text-[10px] uppercase tracking-wide text-faint">{label}</div>
      <div
        className={cn(
          "mt-0.5 text-xs font-bold tnum",
          up ? "text-up" : "text-down"
        )}
      >
        {up ? "▲" : "▼"} {formatPct(value)}
      </div>
    </div>
  );
}

/** A labelled green/red split bar (fomo's buys-vs-sells visualisation). */
function SplitStat({
  leftLabel,
  rightLabel,
  left,
  right,
}: {
  leftLabel: string;
  rightLabel: string;
  left: number;
  right: number;
}) {
  const total = left + right || 1;
  const lp = (left / total) * 100;
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-semibold">
        <span className="text-up">{leftLabel}</span>
        <span className="text-down">{rightLabel}</span>
      </div>
      <div className="mt-1 flex h-1.5 gap-0.5">
        <div className="bg-up rounded-l-full" style={{ width: `${lp}%` }} />
        <div className="bg-down rounded-r-full" style={{ width: `${100 - lp}%` }} />
      </div>
    </div>
  );
}

function Description({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 120;
  return (
    <div className="text-xs text-muted leading-relaxed">
      <p className={open ? "" : "line-clamp-2"}>{text}</p>
      {long && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="mt-0.5 text-chad font-semibold hover:underline"
        >
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}

/**
 * fomo's "About {token}" card: blurb + socials, a short perf row, and live
 * buy/sell split bars derived from the recent on-chain trades feed (counts,
 * USD volume, and unique traders per side).
 */
export function TokenAbout({ address }: { address: string }) {
  const { data: token } = useToken(address);
  const { data: trades } = useTrades(address);
  if (!token) return null;

  const buys = trades?.filter((t) => t.side === "buy") ?? [];
  const sells = trades?.filter((t) => t.side === "sell") ?? [];
  const buyVol = buys.reduce((a, t) => a + t.amountUsd, 0);
  const sellVol = sells.reduce((a, t) => a + t.amountUsd, 0);
  const buyers = new Set(buys.map((t) => t.trader)).size;
  const sellers = new Set(sells.map((t) => t.trader)).size;
  const hasActivity = (trades?.length ?? 0) > 0;

  return (
    <div className="rounded-2xl bg-surface/60 border border-line p-4 space-y-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-white">About {token.symbol}</span>
        <div className="flex items-center gap-1.5 text-muted">
          {token.website && (
            <a
              href={token.website}
              target="_blank"
              rel="noreferrer"
              title="Website"
              className="hover:text-white transition-colors"
            >
              🌐
            </a>
          )}
          {token.twitter && (
            <a
              href={token.twitter}
              target="_blank"
              rel="noreferrer"
              title="Twitter / X"
              className="hover:text-white transition-colors text-sm font-bold"
            >
              𝕏
            </a>
          )}
        </div>
      </div>

      {token.description && <Description text={token.description} />}

      <div className="grid grid-cols-2 gap-2">
        <PerfBox label="1H" value={token.change1h} />
        <PerfBox label="24H" value={token.change24h} />
      </div>

      {hasActivity ? (
        <div className="space-y-2.5 pt-1">
          <SplitStat
            leftLabel={`${buys.length} buys`}
            rightLabel={`${sells.length} sells`}
            left={buys.length}
            right={sells.length}
          />
          <SplitStat
            leftLabel={`${formatCompactUsd(buyVol)} vol`}
            rightLabel={`${formatCompactUsd(sellVol)} vol`}
            left={buyVol}
            right={sellVol}
          />
          <SplitStat
            leftLabel={`${buyers} buyers`}
            rightLabel={`${sellers} sellers`}
            left={buyers}
            right={sellers}
          />
          <p className="text-[10px] text-faint">From the latest on-chain trades</p>
        </div>
      ) : null}
    </div>
  );
}
