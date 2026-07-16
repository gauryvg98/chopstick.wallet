"use client";

import { useMemo, useState } from "react";
import {
  buildEquityCurve,
  sliceWindow,
  type EquityWindow,
} from "@/lib/equityCurve";
import type { ActivityItem } from "@/lib/api/types";
import { RollingNumber } from "@/components/ui/RollingNumber";
import { formatUsd } from "@/lib/format";
import { cn } from "@/lib/cn";

const WINDOWS: EquityWindow[] = ["24H", "7D", "30D", "ALL"];
const UP = "#22e07b";
const DOWN = "#ff5765";

/**
 * Portfolio value-over-time — a real equity curve reconstructed from the wallet
 * activity log (net deposits + realized PnL, anchored to the live total value).
 * 24H/7D/30D/ALL windows. Pure frontend; see lib/equityCurve for the method.
 */
export function PortfolioChart({
  items,
  currentTotalUsd,
  solPrice,
}: {
  items: ActivityItem[];
  currentTotalUsd: number;
  solPrice: number;
}) {
  const [win, setWin] = useState<EquityWindow>("ALL");
  // Stamped once per render from the client clock (fine in a component).
  const nowSec = Math.floor(Date.now() / 1000);

  const full = useMemo(
    () => buildEquityCurve(items, currentTotalUsd, solPrice, nowSec),
    [items, currentTotalUsd, solPrice, nowSec]
  );
  const pts = useMemo(() => sliceWindow(full, win, nowSec), [full, win, nowSec]);

  const first = pts[0]?.v ?? currentTotalUsd;
  const last = pts[pts.length - 1]?.v ?? currentTotalUsd;
  const changeUsd = last - first;
  const changePct = first !== 0 ? (changeUsd / Math.abs(first)) * 100 : 0;
  const up = changeUsd >= 0;
  const color = up ? UP : DOWN;

  return (
    <div className="rounded-2xl border border-line bg-surface/60 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-display font-bold text-3xl text-white tnum leading-none">
            <RollingNumber value={currentTotalUsd} format={formatUsd} />
          </div>
          <div
            className={cn("mt-1.5 text-sm font-semibold tnum", up ? "text-up" : "text-down")}
          >
            {up ? "+" : ""}
            <RollingNumber value={changeUsd} format={formatUsd} /> ({up ? "+" : ""}
            <RollingNumber value={changePct} format={(n) => `${n.toFixed(2)}%`} />
            ){" "}
            <span className="text-faint font-normal">· {win.toLowerCase()}</span>
          </div>
        </div>
        <div className="flex gap-0.5 rounded-lg bg-surface-2 border border-line p-0.5">
          {WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => setWin(w)}
              className={cn(
                "px-2.5 h-7 rounded-md text-[11px] font-bold transition-colors",
                w === win ? "bg-solis text-ink" : "text-muted hover:text-white"
              )}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <Sparkline pts={pts} color={color} />
      </div>
    </div>
  );
}

function Sparkline({
  pts,
  color,
}: {
  pts: { t: number; v: number }[];
  color: string;
}) {
  const W = 720;
  const H = 160;
  const PAD = 6;

  if (pts.length < 2) {
    return (
      <div className="h-[160px] grid place-items-center text-sm text-faint">
        Not enough trade history yet — your equity curve fills in as you trade.
      </div>
    );
  }

  const ts = pts.map((p) => p.t);
  const vs = pts.map((p) => p.v);
  const tMin = Math.min(...ts);
  const tMax = Math.max(...ts);
  const vMin = Math.min(...vs);
  const vMax = Math.max(...vs);
  const tSpan = tMax - tMin || 1;
  const vSpan = vMax - vMin || Math.max(1, Math.abs(vMax) * 0.1);

  const x = (t: number) => PAD + ((t - tMin) / tSpan) * (W - 2 * PAD);
  const y = (v: number) => PAD + (1 - (v - vMin) / vSpan) * (H - 2 * PAD);

  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(tMax).toFixed(1)},${H - PAD} L${x(tMin).toFixed(1)},${H - PAD} Z`;
  const endX = x(tMax);
  const endY = y(vs[vs.length - 1]);
  const gid = `eq-grad-${color.replace("#", "")}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[160px]" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* zero/flat baseline reference */}
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={endX} cy={endY} r="3.5" fill={color} />
    </svg>
  );
}
