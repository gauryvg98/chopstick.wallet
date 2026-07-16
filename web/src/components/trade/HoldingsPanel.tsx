"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useHoldings, usePositions, useToken } from "@/lib/api/hooks";
import { useLivePrice } from "@/lib/livePrices";
import { TokenAvatar } from "@/components/ui/TokenAvatar";
import { RollingNumber } from "@/components/ui/RollingNumber";
import { formatUsd, formatCompact, formatSol, formatPct, shortAddr } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Position } from "@/lib/api/types";

const SOL_MINT = "So11111111111111111111111111111111111111112";

/**
 * Live read of the connected wallet's on-chain balances — SOL plus every SPL
 * token — with USD values. The chain is the source of truth (Helius RPC); this
 * polls every 15s and revalidates after a trade settles. Only shown when signed
 * in, since there's no wallet to read otherwise.
 */
export function HoldingsPanel({ flat = false }: { flat?: boolean }) {
  const { authenticated, user } = useAuth();
  const owner = authenticated ? user?.address ?? null : null;
  const { data: holdings, isLoading } = useHoldings(owner);
  const { data: positions } = usePositions(owner);
  const { price: solPrice } = useLivePrice(SOL_MINT);

  // Chain-derived cost basis per mint, for the running (unrealized) PnL per row.
  const posByMint = useMemo(() => {
    const m = new Map<string, Position>();
    (positions?.positions ?? []).forEach((p) => m.set(p.mint, p));
    return m;
  }, [positions]);

  // Token USD values live in the per-row components (each prices its own mint);
  // rows report up so we can show a portfolio total.
  const [values, setValues] = useState<Record<string, number>>({});
  const reportValue = useCallback((mint: string, usd: number) => {
    setValues((v) => (v[mint] === usd ? v : { ...v, [mint]: usd }));
  }, []);

  if (!authenticated) return null;

  const sol = holdings?.solBalance ?? 0;
  const tokens = holdings?.tokens ?? [];
  const solUsd = solPrice && solPrice > 0 ? sol * solPrice : 0;
  const tokenUsd = tokens.reduce((a, t) => a + (values[t.mint] ?? 0), 0);
  const total = solUsd + tokenUsd;

  return (
    <div className={flat ? "" : "rounded-2xl bg-surface/40 border border-line overflow-hidden"}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-line">
        <div>
          <div className="text-sm font-bold text-white">Your wallet</div>
          {owner && (
            <div className="text-[11px] font-mono text-faint">{shortAddr(owner, 4, 4)}</div>
          )}
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-faint">Total value</div>
          <div className="font-bold text-white tnum">
            <RollingNumber value={total} format={formatUsd} />
          </div>
        </div>
      </div>

      <div className="divide-y divide-line/60">
        {/* SOL */}
        <div className="flex items-center gap-3 px-4 py-2.5">
          <TokenAvatar symbol="SOL" logoURI={null} size={30} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-white">SOL</div>
            <div className="text-xs text-muted tnum">
              <RollingNumber value={sol} format={(n) => n.toFixed(4)} /> SOL
            </div>
          </div>
          <div className="text-right text-sm font-semibold text-white tnum">
            {solUsd > 0 ? (
              <RollingNumber value={solUsd} format={formatUsd} />
            ) : (
              "—"
            )}
          </div>
        </div>

        {/* SPL tokens */}
        {tokens.map((t) => (
          <HoldingRow
            key={t.mint}
            mint={t.mint}
            amount={t.amount}
            solPrice={solPrice ?? 0}
            avgEntrySol={posByMint.get(t.mint)?.avgEntrySol ?? 0}
            onValue={reportValue}
          />
        ))}
      </div>

      {tokens.length === 0 && (
        <div className="px-4 py-3 text-center text-xs text-faint">
          {isLoading
            ? "Reading your wallet…"
            : "Just SOL so far — buy a token and it shows up here."}
        </div>
      )}
    </div>
  );
}

function HoldingRow({
  mint,
  amount,
  solPrice,
  avgEntrySol,
  onValue,
}: {
  mint: string;
  amount: number;
  solPrice: number;
  avgEntrySol: number;
  onValue: (mint: string, usd: number) => void;
}) {
  const { data: token } = useToken(mint);
  const { price: live } = useLivePrice(mint);
  const price = live && live > 0 ? live : token?.priceUsd ?? 0;
  const usd = amount * price;

  // Running (unrealized) PnL vs the chain-derived cost basis, SOL-denominated so
  // it isn't distorted by SOL/USD moves — shown as a % and the SOL gain/loss.
  const tokenPriceSol = solPrice > 0 ? price / solPrice : 0;
  const valueSol = amount * tokenPriceSol;
  const hasCost = avgEntrySol > 0 && amount > 1e-9;
  const costSol = avgEntrySol * amount;
  const pnlSol = hasCost ? valueSol - costSol : 0;
  const pnlPct = hasCost && costSol > 0 ? (pnlSol / costSol) * 100 : 0;
  const up = pnlSol >= 0;

  useEffect(() => {
    onValue(mint, usd);
  }, [mint, usd, onValue]);

  return (
    <Link
      href={`/trade/${mint}`}
      scroll={false}
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors"
    >
      <TokenAvatar symbol={token?.symbol ?? "?"} logoURI={token?.logoURI} size={30} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-white truncate">
          {token?.symbol ?? shortAddr(mint, 4, 4)}
        </div>
        <div className="text-xs text-muted tnum">
          <RollingNumber value={amount} format={formatCompact} /> tokens
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-semibold text-white tnum">
          {usd > 0 ? <RollingNumber value={usd} format={formatUsd} /> : "—"}
        </div>
        {hasCost ? (
          <div className={cn("text-[11px] tnum", up ? "text-up" : "text-down")}>
            {up ? "▲" : "▼"} <RollingNumber value={pnlPct} format={formatPct} /> ·{" "}
            {up ? "+" : ""}
            <RollingNumber value={pnlSol} format={formatSol} />
          </div>
        ) : (
          <div className="text-[11px] text-faint">no entry</div>
        )}
      </div>
    </Link>
  );
}
