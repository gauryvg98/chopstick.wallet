"use client";

import { useEffect, useRef, useState } from "react";
import { PriceChart, type ChartKind, type ChartMetric } from "./PriceChart";
import { useToken } from "@/lib/api/hooks";
import { TIMEFRAMES, type Timeframe } from "@/lib/api/types";
import { cn } from "@/lib/cn";

const isSubMinute = (t: Timeframe) => t === "1s" || t === "5s" || t === "30s";

export function ChartCard({
  address,
  bondingCurve,
}: {
  address: string;
  bondingCurve?: boolean;
}) {
  const [tf, setTf] = useState<Timeframe>("1m");
  // Sub-minute timeframes look cleaner as a line; coarse ones default to candles.
  // Crossing that boundary resets to the default; within a class your manual
  // toggle sticks.
  const [kind, setKind] = useState<ChartKind>("candle");
  const [metric, setMetric] = useState<ChartMetric>("price");
  const { data: token } = useToken(address);
  const wasSub = useRef(isSubMinute("1m"));
  useEffect(() => {
    const sub = isSubMinute(tf);
    if (sub !== wasSub.current) {
      setKind(sub ? "line" : "candle");
      wasSub.current = sub;
    }
  }, [tf]);

  return (
    <div className="flex flex-col border-b border-line">
      <div className="flex items-center gap-1 px-3 py-2">
        <div className="flex items-center gap-1 overflow-x-auto scroll-thin flex-1">
          {TIMEFRAMES.map((t) => (
            <button
              key={t}
              onClick={() => setTf(t)}
              className={cn(
                "px-3 h-7 rounded-lg text-xs font-bold transition-colors shrink-0",
                t === tf
                  ? "bg-solis text-ink"
                  : "text-muted hover:text-white hover:bg-white/5"
              )}
            >
              {t}
            </button>
          ))}
        </div>
        {/* Price / Market-cap toggle */}
        <div className="flex items-center gap-0.5 rounded-lg bg-surface-2 p-0.5 shrink-0 ml-2">
          {(
            [
              ["price", "Price"],
              ["mcap", "MCap"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={cn(
                "px-2 h-6 rounded-md text-[11px] font-bold transition-colors",
                m === metric ? "bg-solis text-ink" : "text-muted hover:text-white"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {/* Candle / line toggle */}
        <div className="flex items-center gap-0.5 rounded-lg bg-surface-2 p-0.5 shrink-0 ml-1.5">
          {(["candle", "line"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              aria-label={k === "candle" ? "Candlestick" : "Line"}
              className={cn(
                "px-2 h-6 rounded-md text-xs font-bold transition-colors",
                k === kind ? "bg-solis text-ink" : "text-muted hover:text-white"
              )}
            >
              {k === "candle" ? "📊" : "📈"}
            </button>
          ))}
        </div>
      </div>
      <div className="h-[300px] sm:h-[340px] px-1">
        <PriceChart
          address={address}
          tf={tf}
          fast={bondingCurve}
          kind={kind}
          metric={metric}
          supply={token?.totalSupply ?? 0}
          symbol={token?.symbol ?? ""}
        />
      </div>
    </div>
  );
}
