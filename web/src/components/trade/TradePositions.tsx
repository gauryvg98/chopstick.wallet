"use client";

import { useState } from "react";
import Link from "next/link";
import { useHoldings, usePositions, useToken } from "@/lib/api/hooks";
import { useLivePrice } from "@/lib/livePrices";
import { SOL_MINT } from "@/lib/swap";
import { useAuth } from "@/lib/auth";
import { TokenAvatar } from "@/components/ui/TokenAvatar";
import {
  formatUsd,
  formatSol,
  formatCompact,
  formatPct,
  shortAddr,
} from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Position } from "@/lib/api/types";

type Tab = "open" | "closed";

/**
 * fomo's bottom-right "Your positions" panel: Open (still held, live unrealized
 * PnL) / Closed (sold out, realized PnL). Both are chain-derived — Open from
 * current holdings × the avg-entry cost basis, Closed from realized PnL on mints
 * you no longer hold. Each row links to that token's trade page.
 */
export function TradePositions() {
  const { authenticated, user } = useAuth();
  const owner = authenticated ? user?.address ?? null : null;
  const [tab, setTab] = useState<Tab>("open");

  const { data: holdings } = useHoldings(owner);
  const { data: positions } = usePositions(owner);
  const { price: solPriceRaw } = useLivePrice(SOL_MINT);
  const solPrice = solPriceRaw ?? 0;

  const posByMint = new Map<string, Position>();
  (positions?.positions ?? []).forEach((p) => posByMint.set(p.mint, p));

  const held = holdings?.tokens ?? [];
  const heldMints = new Set(held.map((t) => t.mint));
  // Closed = realised something (sold) on a mint you no longer hold.
  const closed = (positions?.positions ?? []).filter(
    (p) => p.realizedCostSol > 1e-9 && !heldMints.has(p.mint)
  );

  return (
    <div className="rounded-2xl bg-surface/60 border border-line p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-white">Your positions</span>
        <div className="flex gap-0.5 rounded-lg bg-surface-2 border border-line p-0.5">
          {(["open", "closed"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-2.5 h-6 rounded-md text-[11px] font-bold uppercase transition-colors inline-flex items-center gap-1",
                tab === t ? "bg-chad text-ink" : "text-muted hover:text-white"
              )}
            >
              {t === "open" && (
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    tab === t ? "bg-ink" : "bg-chad"
                  )}
                />
              )}
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3">
        {!owner ? (
          <Empty>Sign in to see your positions.</Empty>
        ) : tab === "open" ? (
          held.length ? (
            <div className="space-y-0.5">
              {held.map((t) => (
                <OpenRow
                  key={t.mint}
                  mint={t.mint}
                  amount={t.amount}
                  avgEntrySol={posByMint.get(t.mint)?.avgEntrySol ?? 0}
                  solPrice={solPrice}
                />
              ))}
            </div>
          ) : (
            <Empty>No open positions.</Empty>
          )
        ) : closed.length ? (
          <div className="space-y-0.5">
            {closed.map((p) => (
              <ClosedRow key={p.mint} pos={p} solPrice={solPrice} />
            ))}
          </div>
        ) : (
          <Empty>No closed positions yet.</Empty>
        )}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-faint">{children}</p>;
}

function OpenRow({
  mint,
  amount,
  avgEntrySol,
  solPrice,
}: {
  mint: string;
  amount: number;
  avgEntrySol: number;
  solPrice: number;
}) {
  const { data: token } = useToken(mint);
  const { price: live } = useLivePrice(mint);
  const priceUsd = live && live > 0 ? live : token?.priceUsd ?? 0;
  const tokenPriceSol = solPrice > 0 ? priceUsd / solPrice : 0;
  const valueSol = amount * tokenPriceSol;
  const hasCost = avgEntrySol > 0 && amount > 1e-9;
  const unrealizedSol = hasCost ? valueSol - avgEntrySol * amount : 0;
  const pnlPct =
    hasCost && avgEntrySol * amount > 0
      ? (unrealizedSol / (avgEntrySol * amount)) * 100
      : 0;

  return (
    <Link
      href={`/trade/${mint}`}
      className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-white/5 transition-colors"
    >
      <TokenAvatar symbol={token?.symbol ?? "?"} logoURI={token?.logoURI} size={30} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-white truncate">
          {token?.symbol ?? shortAddr(mint, 4, 4)}
        </div>
        <div className="text-[11px] text-muted tnum">
          {formatCompact(amount)} {token?.symbol ?? ""}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-semibold text-white tnum">
          {formatUsd(valueSol * solPrice)}
        </div>
        {hasCost ? (
          <div
            className={cn(
              "text-[11px] tnum",
              unrealizedSol >= 0 ? "text-up" : "text-down"
            )}
          >
            {unrealizedSol >= 0 ? "▲" : "▼"} {formatPct(pnlPct)}
          </div>
        ) : (
          <div className="text-[11px] text-faint">no entry</div>
        )}
      </div>
    </Link>
  );
}

function ClosedRow({ pos, solPrice }: { pos: Position; solPrice: number }) {
  const { data: token } = useToken(pos.mint);
  const up = pos.realizedSol >= 0;
  const pct =
    pos.realizedCostSol > 0 ? (pos.realizedSol / pos.realizedCostSol) * 100 : 0;

  return (
    <Link
      href={`/trade/${pos.mint}`}
      className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-white/5 transition-colors"
    >
      <TokenAvatar symbol={token?.symbol ?? "?"} logoURI={token?.logoURI} size={30} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-white truncate">
          {token?.symbol ?? shortAddr(pos.mint, 4, 4)}
        </div>
        <div className="text-[11px] text-faint">closed · realized</div>
      </div>
      <div className="text-right shrink-0">
        <div className={cn("text-sm font-semibold tnum", up ? "text-up" : "text-down")}>
          {up ? "+" : ""}
          {formatUsd(pos.realizedSol * solPrice)}
        </div>
        <div className={cn("text-[11px] tnum", up ? "text-up" : "text-down")}>
          {up ? "▲" : "▼"} {formatPct(pct)}
        </div>
      </div>
    </Link>
  );
}
