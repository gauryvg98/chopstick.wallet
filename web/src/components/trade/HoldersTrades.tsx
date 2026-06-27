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

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Deterministic gradient avatar from a wallet address (stand-in for the social
 *  profile pics fomo shows — we only have on-chain addresses). */
function AddrAvatar({ addr, size = 26 }: { addr: string; size?: number }) {
  const h = hashStr(addr);
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

// --- SAMPLE (illustrative) holder data ---------------------------------------
// fomo shows each holder's display name + PnL + avg entry, sourced from accounts
// and a swap indexer we don't run. We can't get per-wallet cost basis for an
// arbitrary holder, so these are DETERMINISTICALLY GENERATED from the address
// purely for the demo — clearly flagged "sample" in the UI. Real % held + value
// remain authoritative on-chain data.
const SAMPLE_ADJ = ["Silent", "Based", "Giga", "Degen", "Diamond", "Lucky", "Turbo", "Mega", "Stealth", "Frosty", "Crimson", "Golden", "Solar", "Cosmic", "Rapid", "Iron", "Quiet", "Wild"];
const SAMPLE_NOUN = ["Otter", "Chad", "Whale", "Ape", "Bull", "Falcon", "Yeti", "Kraken", "Phoenix", "Ronin", "Wizard", "Samurai", "Nomad", "Tiger", "Comet", "Viper", "Hodler", "Maxi"];

function sampleName(addr: string): string {
  const h = hashStr(addr);
  // NB: unsigned shift (>>>). A signed >> goes negative when the top bit is set,
  // and SAMPLE_NOUN[negative] is undefined.
  return `${SAMPLE_ADJ[h % SAMPLE_ADJ.length]}${SAMPLE_NOUN[(h >>> 5) % SAMPLE_NOUN.length]}`;
}

/** Generated, stable-per-address PnL% (skewed positive, as holders tend to be). */
function samplePnlPct(addr: string): number {
  const h = hashStr(addr + "pnl");
  return Math.round(((h % 2100) / 10 - 28) * 100) / 100; // ≈ -28% .. +182%
}

/** Generated avg-hold label, e.g. "2d 14h". */
function sampleHold(addr: string): string {
  const h = hashStr(addr + "hold");
  const d = h % 21;
  const hr = (h >>> 4) % 24;
  return d > 0 ? `${d}d ${hr}h` : `${hr}h ${(h >>> 8) % 60}m`;
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
              <AddrAvatar addr={t.trader} size={30} />
              <div className="min-w-0 leading-tight">
                {/* real on-chain label if present, else a generated alias —
                    the real wallet stays visible below either way. */}
                <div className="truncate text-white font-medium">
                  {t.traderLabel ?? sampleName(t.trader)}
                </div>
                <div className="text-[10px] text-faint tnum">
                  {shortAddr(t.trader, 4, 4)}
                </div>
              </div>
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

const HOLDER_GRID = "grid grid-cols-[minmax(0,1.5fr)_84px_minmax(0,1fr)_84px] gap-3 px-4";

function HoldersTab({ token }: { token: TokenDetail }) {
  const { data } = useHolders(token.address);
  if (!data) return <ListSkeleton />;
  const price = token.priceUsd || 0;
  return (
    <div>
      {/* PnL, names & avg entry are illustrative — see the note. Holdings are real. */}
      <div className="flex items-center justify-between gap-2 px-4 py-1.5 bg-surface/30 border-b border-line/60">
        <span className="text-[10px] text-faint">
          Holdings are live on-chain · trader name, PnL &amp; entry are illustrative
        </span>
        <span
          title="ChadWallet doesn't run a per-wallet swap indexer, so trader names, PnL and avg entry shown here are generated samples. % held and value are real."
          className="shrink-0 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-faint"
        >
          Sample
        </span>
      </div>
      <div
        className={cn(
          HOLDER_GRID,
          "sticky top-0 z-10 py-2 bg-ink/95 backdrop-blur border-b border-line text-[11px] uppercase tracking-wide text-faint"
        )}
      >
        <span className="text-left">Trader</span>
        <span className="text-right">Position</span>
        <span className="text-right">PnL</span>
        <span className="text-right">Avg entry</span>
      </div>
      <div className="divide-y divide-line/50">
        {data.map((h) => {
          const pnlPct = samplePnlPct(h.address);
          const pnlUsd = (h.valueUsd * pnlPct) / 100;
          const entry = price > 0 ? price / (1 + pnlPct / 100) : 0;
          const up = pnlPct >= 0;
          return (
            <div
              key={h.address}
              className={cn(HOLDER_GRID, "items-center py-2 text-sm hover:bg-white/5 transition-colors")}
            >
              {/* Trader */}
              <div className="flex items-center gap-2 min-w-0">
                <AddrAvatar addr={h.address} size={30} />
                <div className="min-w-0 leading-tight">
                  <div className="truncate text-white font-medium">
                    {sampleName(h.address)}
                  </div>
                  <div className="text-[10px] text-faint tnum">
                    {sampleHold(h.address)} hold
                  </div>
                </div>
              </div>
              {/* Position — REAL value + real % held */}
              <div className="text-right leading-tight">
                <div className="tnum text-white">{formatCompactUsd(h.valueUsd)}</div>
                <div className="text-[10px] text-faint tnum">{h.pct.toFixed(2)}%</div>
              </div>
              {/* PnL — sample */}
              <div className={cn("text-right leading-tight tnum", up ? "text-up" : "text-down")}>
                <div>
                  {up ? "+" : ""}
                  {formatCompactUsd(Math.abs(pnlUsd))}
                </div>
                <div className="text-[10px]">
                  {up ? "▲" : "▼"} {Math.abs(pnlPct).toFixed(1)}%
                </div>
              </div>
              {/* Avg entry — sample */}
              <div className="text-right tnum text-muted">
                {entry >= 1 ? `$${entry.toFixed(2)}` : `$${entry.toPrecision(2)}`}
              </div>
            </div>
          );
        })}
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
