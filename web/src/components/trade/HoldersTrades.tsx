"use client";

import { useState } from "react";
import { useHolders, useTrades } from "@/lib/api/hooks";
import { TokenAvatar } from "@/components/ui/TokenAvatar";
import { formatCompactUsd, shortAddr, timeAgo } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { TokenDetail } from "@/lib/api/types";

type Tab = "trades" | "holders";

function TradesEmpty({ token }: { token: TokenDetail }) {
  if (token.bondingCurve) {
    return (
      <div className="flex flex-col items-center text-center gap-2 px-6 py-12">
        <div className="text-3xl">🌱</div>
        <div className="text-sm font-semibold text-white">Still on the bonding curve</div>
        <p className="text-xs text-muted max-w-xs leading-relaxed">
          {token.symbol} just launched on pump.fun. The live trade feed lights up
          here once it graduates to a DEX — holders are live now in the Holders tab.
        </p>
        <a
          href={`https://pump.fun/coin/${token.address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 text-xs font-semibold text-chad hover:underline"
        >
          View live trades on pump.fun ↗
        </a>
      </div>
    );
  }
  return (
    <div className="px-6 py-12 text-center text-sm text-faint">No recent trades.</div>
  );
}

/** Deterministic gradient avatar from a wallet address (stand-in for the social
 *  profile pics fomo shows — we only have on-chain addresses). */
function AddrAvatar({ addr, size = 26 }: { addr: string; size?: number }) {
  let h = 0;
  for (let i = 0; i < addr.length; i++) h = (h * 31 + addr.charCodeAt(i)) >>> 0;
  const a = h % 360;
  const b = (a + 70) % 360;
  return (
    <div
      className="shrink-0 rounded-full ring-1 ring-white/10"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, hsl(${a} 68% 55%), hsl(${b} 68% 42%))`,
      }}
    />
  );
}

function ColHead({ cols }: { cols: [string, string][] }) {
  return (
    <div className="sticky top-0 z-10 grid grid-cols-[1fr_64px_92px_44px] gap-3 px-4 py-2 bg-ink/95 backdrop-blur border-b border-line text-[11px] uppercase tracking-wide text-faint">
      {cols.map(([label, align]) => (
        <span key={label} className={align}>
          {label}
        </span>
      ))}
    </div>
  );
}

function TradesTab({ token }: { token: TokenDetail }) {
  const { data } = useTrades(token.address);
  if (!data) return <ListSkeleton />;
  if (data.length === 0) return <TradesEmpty token={token} />;
  return (
    <div>
      <ColHead
        cols={[
          ["Trader", "text-left"],
          ["Action", "text-center"],
          ["Amount", "text-right"],
          ["Time", "text-right"],
        ]}
      />
      <div className="divide-y divide-line/50">
        {data.map((t) => (
          <div
            key={t.id}
            className="grid grid-cols-[1fr_64px_92px_44px] items-center gap-3 px-4 py-2 text-sm hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <AddrAvatar addr={t.trader} />
              <span className="truncate text-white">
                {t.traderLabel ?? shortAddr(t.trader, 4, 4)}
              </span>
            </div>
            <span
              className={cn(
                "justify-self-center inline-flex items-center justify-center rounded-md px-2 h-6 text-[11px] font-bold uppercase",
                t.side === "buy" ? "bg-up/15 text-up" : "bg-down/15 text-down"
              )}
            >
              {t.side}
            </span>
            <span className="tnum text-white text-right">
              {formatCompactUsd(t.amountUsd)}
            </span>
            <span className="tnum text-faint text-right">
              {timeAgo(t.timestamp)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HoldersTab({ token }: { token: TokenDetail }) {
  const { data } = useHolders(token.address);
  if (!data) return <ListSkeleton />;
  return (
    <div>
      <ColHead
        cols={[
          ["Holder", "text-left"],
          ["Share", "text-center"],
          ["% held", "text-right"],
          ["Value", "text-right"],
        ]}
      />
      <div className="divide-y divide-line/50">
        {data.map((h) => (
          <div
            key={h.address}
            className="grid grid-cols-[1fr_64px_92px_44px] items-center gap-3 px-4 py-2 text-sm hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-5 shrink-0 text-xs text-faint tnum">{h.rank}</span>
              <AddrAvatar addr={h.address} />
              <span className="truncate text-white tnum">
                {shortAddr(h.address, 4, 4)}
              </span>
            </div>
            <div className="justify-self-center w-14">
              <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                <div
                  className="h-full bg-chad/70"
                  style={{ width: `${Math.min(100, h.pct * 4)}%` }}
                />
              </div>
            </div>
            <span className="tnum text-white text-right">{h.pct.toFixed(2)}%</span>
            <span className="tnum text-muted text-right">
              {formatCompactUsd(h.valueUsd)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="p-3 space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-7 rounded-lg bg-surface/40 animate-pulse" />
      ))}
    </div>
  );
}

export function HoldersTrades({ token }: { token: TokenDetail }) {
  const [tab, setTab] = useState<Tab>("trades");

  return (
    <div className="flex flex-col flex-1 min-h-[55vh] lg:min-h-0">
      <div className="shrink-0 flex items-center gap-1 px-3 h-11 border-b border-line bg-ink">
        {(
          [
            ["trades", "Live trades"],
            ["holders", "Holders"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "px-3 h-8 rounded-lg text-sm font-semibold transition-colors inline-flex items-center gap-1.5",
              tab === id ? "bg-surface-2 text-white" : "text-muted hover:text-white"
            )}
          >
            {id === "trades" && (
              <span className="h-1.5 w-1.5 rounded-full bg-chad animate-pulse" />
            )}
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto scroll-thin">
        {tab === "trades" ? (
          <TradesTab token={token} />
        ) : (
          <HoldersTab token={token} />
        )}
      </div>
    </div>
  );
}
