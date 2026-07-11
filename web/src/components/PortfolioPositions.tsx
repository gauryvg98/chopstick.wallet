"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useHoldings, usePositions, useActivity, useToken } from "@/lib/api/hooks";
import { useLivePrice } from "@/lib/livePrices";
import { SOL_MINT } from "@/lib/swap";
import { TokenAvatar } from "@/components/ui/TokenAvatar";
import { useSpotlight } from "@/components/TokenSpotlight";
import { PortfolioChart } from "@/components/PortfolioChart";
import {
  formatSol,
  formatUsd,
  formatCompact,
  formatPct,
  shortAddr,
  timeAgo,
} from "@/lib/format";
import { cn } from "@/lib/cn";
import type { ActivityItem, Position } from "@/lib/api/types";

/**
 * Portfolio-only view: per-position current (unrealized) PnL, plus the headline
 * Net / Active / Realized PnL — all SOL-denominated (chain-derived cost basis),
 * shown in $ at live rates. Each row prices its own mint and reports value + PnL
 * up so the totals tick live with the price stream.
 */
export function PortfolioPositions({ owner }: { owner: string }) {
  const { data: holdings } = useHoldings(owner);
  const { data: positions } = usePositions(owner);
  const { data: activity } = useActivity(owner);
  const { price: solPriceRaw } = useLivePrice(SOL_MINT);
  const solPrice = solPriceRaw ?? 0;
  const deposited = activity?.deposited ?? 0;
  const withdrawn = activity?.withdrawn ?? 0;
  const feesSol = activity?.feesSol ?? 0;

  const posByMint = useMemo(() => {
    const m = new Map<string, Position>();
    (positions?.positions ?? []).forEach((p) => m.set(p.mint, p));
    return m;
  }, [positions]);

  const tokens = holdings?.tokens ?? [];
  const solBalance = holdings?.solBalance ?? 0;
  const realizedSol = positions?.realizedSol ?? 0;

  // Rows report { value, pnl } in SOL so we can sum portfolio value + active PnL.
  const [rows, setRows] = useState<Record<string, { value: number; pnl: number }>>({});
  const report = useCallback((mint: string, value: number, pnl: number) => {
    setRows((r) => {
      const cur = r[mint];
      if (cur && cur.value === value && cur.pnl === pnl) return r;
      return { ...r, [mint]: { value, pnl } };
    });
  }, []);

  const tokenValueSol = tokens.reduce((a, t) => a + (rows[t.mint]?.value ?? 0), 0);
  const activeSol = tokens.reduce((a, t) => a + (rows[t.mint]?.pnl ?? 0), 0);
  const totalValueSol = solBalance + tokenValueSol;
  const netSol = realizedSol + activeSol;

  // Cost bases for the per-bucket % returns: active = SOL paid for what's still
  // held; realized = SOL cost of what was sold.
  const activeCostSol = tokens.reduce((a, t) => {
    const p = posByMint.get(t.mint);
    return a + (p && p.avgEntrySol > 0 ? p.avgEntrySol * t.amount : 0);
  }, 0);
  const realizedCostSol = (positions?.positions ?? []).reduce(
    (a, p) => a + (p.realizedCostSol || 0),
    0
  );
  const pct = (num: number, den: number) =>
    den > 1e-9 ? (num / den) * 100 : undefined;
  // Headline Net % is measured against NET CAPITAL FUNDED (deposited − withdrawn),
  // matching the Net PnL $ figure (= portfolio value − deposited). Using the sum
  // of cost bases here would double-count recycled capital (sell → rebuy), so it
  // understated the real return on the money you put in.
  const netPct = pct(netSol, deposited - withdrawn);
  const activePct = pct(activeSol, activeCostSol);
  const realizedPct = pct(realizedSol, realizedCostSol);

  return (
    <div className="space-y-4">
      {/* portfolio value + equity curve */}
      <PortfolioChart
        items={activity?.items ?? []}
        currentTotalUsd={totalValueSol * solPrice}
        solPrice={solPrice}
      />

      {/* PnL headline */}
      <div className="grid grid-cols-3 gap-3">
        <PnlStat label="Net PnL" sub="total" sol={netSol} pct={netPct} solPrice={solPrice} primary />
        <PnlStat label="Active" sub="unrealized" sol={activeSol} pct={activePct} solPrice={solPrice} />
        <PnlStat label="Realized" sub="closed" sol={realizedSol} pct={realizedPct} solPrice={solPrice} />
      </div>

      {/* main grid: positions (left, wider) + side rail (right) */}
      <div className="grid gap-4 lg:grid-cols-5 items-start">
        {/* positions */}
        <div className="lg:col-span-3 rounded-2xl border border-line bg-surface/40 overflow-hidden">
          <div className="px-4 py-3 border-b border-line flex items-center justify-between">
            <span className="text-sm font-bold text-white">Positions</span>
            <span className="text-[11px] text-faint">
              {tokens.length + 1} {tokens.length === 0 ? "asset" : "assets"} · value / PnL
            </span>
          </div>
          <div className="divide-y divide-line/60">
            {/* SOL */}
            <div className="flex items-center gap-3 px-4 py-3">
              <TokenAvatar symbol="SOL" logoURI={null} size={34} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-white">SOL</div>
                <div className="text-xs text-muted tnum">{solBalance.toFixed(4)} SOL</div>
              </div>
              <div className="text-right text-sm font-semibold text-white tnum">
                {formatUsd(solBalance * solPrice)}
              </div>
            </div>

            {tokens.map((t) => (
              <PositionRow
                key={t.mint}
                mint={t.mint}
                amount={t.amount}
                avgEntrySol={posByMint.get(t.mint)?.avgEntrySol ?? 0}
                solPrice={solPrice}
                onReport={report}
              />
            ))}

            {tokens.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-faint">
                No token positions yet — just SOL.
              </div>
            )}
          </div>
        </div>

        {/* side rail: flows + scrollable activity */}
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FlowStat label="Deposited" sub="funded in" sol={deposited} solPrice={solPrice} />
            <FlowStat label="Fees paid" sub="network" sol={feesSol} solPrice={solPrice} />
          </div>

          <div className="rounded-2xl border border-line bg-surface/40 overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-line flex items-center justify-between">
              <span className="text-sm font-bold text-white">Recent activity</span>
              <span className="text-[11px] text-faint">Solscan ↗</span>
            </div>
            {activity && activity.items.length > 0 ? (
              <div className="max-h-[420px] overflow-y-auto divide-y divide-line/60 scroll-thin">
                {activity.items.map((it) => (
                  <ActivityRow key={it.signature} item={it} solPrice={solPrice} />
                ))}
              </div>
            ) : (
              <div className="px-4 py-10 text-center text-sm text-faint">
                No activity yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const KIND: Record<
  ActivityItem["kind"],
  { label: string; up: boolean; sign: string }
> = {
  buy: { label: "Bought", up: true, sign: "−" },
  sell: { label: "Sold", up: false, sign: "+" },
  deposit: { label: "Deposited", up: true, sign: "+" },
  withdraw: { label: "Sent", up: false, sign: "−" },
  receive: { label: "Received", up: true, sign: "+" },
  send: { label: "Sent", up: false, sign: "−" },
};

function ActivityRow({ item, solPrice }: { item: ActivityItem; solPrice: number }) {
  const isToken = !!item.mint;
  const { data: token } = useToken(isToken ? item.mint! : null);
  const { open: openSpotlight } = useSpotlight();
  const k = KIND[item.kind];
  const sym = token?.symbol ?? (item.mint ? shortAddr(item.mint, 3, 3) : "");
  const color = k.up ? "text-up" : "text-down";

  return (
    <a
      href={`https://solscan.io/tx/${item.signature}`}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors"
    >
      {isToken ? (
        <TokenAvatar
          symbol={sym}
          logoURI={token?.logoURI}
          size={32}
          onClick={(e) => {
            // Open the token spotlight instead of following the tx link.
            e.preventDefault();
            e.stopPropagation();
            openSpotlight({
              address: item.mint!,
              symbol: sym,
              name: token?.name ?? "",
              logoURI: token?.logoURI ?? null,
              priceUsd: token?.priceUsd ?? 0,
              marketCap: token?.marketCap ?? 0,
              change24h: token?.change24h ?? 0,
            });
          }}
        />
      ) : (
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-solis to-teal grid place-items-center text-ink text-sm font-bold shrink-0">
          ◎
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm text-white truncate">
          <span className={cn("font-semibold", color)}>{k.label}</span>{" "}
          {isToken
            ? `${formatCompact(item.tokenAmount ?? 0)} ${sym}`
            : `${item.solAmount.toFixed(4)} SOL`}
          {item.failed && (
            <span className="ml-1.5 text-[10px] font-bold text-down uppercase">
              failed
            </span>
          )}
        </div>
        <div className="text-[11px] text-faint tnum">
          {timeAgo(item.timestamp * 1000)}
          {item.feeSol > 0 && ` · fee ${formatSol(item.feeSol)}`}
        </div>
      </div>
      {item.solAmount > 0 && (
        <div className="text-right shrink-0">
          <div className={cn("text-sm font-semibold tnum", color)}>
            {k.sign}
            {formatSol(item.solAmount)}
          </div>
          <div className="text-[10px] text-faint tnum">
            {formatUsd(item.solAmount * solPrice)}
          </div>
        </div>
      )}
    </a>
  );
}

function PnlStat({
  label,
  sub,
  sol,
  pct,
  solPrice,
  primary,
}: {
  label: string;
  sub: string;
  sol: number;
  pct?: number;
  solPrice: number;
  primary?: boolean;
}) {
  const usd = sol * solPrice;
  const up = sol >= 0;
  return (
    <div
      className={cn(
        "rounded-2xl border bg-surface/60 px-3 py-3",
        primary ? "border-solis/40" : "border-line"
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] uppercase tracking-wide text-faint">{label}</span>
        {pct !== undefined && (
          <span
            className={cn(
              "text-[11px] font-bold tnum px-1 rounded",
              up ? "bg-up/15 text-up" : "bg-down/15 text-down"
            )}
          >
            {up ? "▲" : "▼"} {formatPct(pct)}
          </span>
        )}
      </div>
      <div
        className={cn(
          "mt-1 font-bold tnum",
          primary ? "text-lg" : "text-base",
          up ? "text-up" : "text-down"
        )}
      >
        {up ? "+" : ""}
        {formatSol(sol)}
      </div>
      <div className="text-[10px] text-faint tnum truncate">
        {up ? "+" : ""}
        {formatUsd(usd)} · {sub}
      </div>
    </div>
  );
}

function FlowStat({
  label,
  sub,
  sol,
  solPrice,
}: {
  label: string;
  sub: string;
  sol: number;
  solPrice: number;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface/40 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-faint">{label}</div>
      <div className="mt-1 font-bold tnum text-white">{formatSol(sol)}</div>
      <div className="text-[10px] text-faint tnum truncate">
        {formatUsd(sol * solPrice)} · {sub}
      </div>
    </div>
  );
}

function PositionRow({
  mint,
  amount,
  avgEntrySol,
  solPrice,
  onReport,
}: {
  mint: string;
  amount: number;
  avgEntrySol: number;
  solPrice: number;
  onReport: (mint: string, value: number, pnl: number) => void;
}) {
  const { data: token } = useToken(mint);
  const { price: live } = useLivePrice(mint);
  const { open: openSpotlight } = useSpotlight();
  const priceUsd = live && live > 0 ? live : token?.priceUsd ?? 0;
  const tokenPriceSol = solPrice > 0 ? priceUsd / solPrice : 0;
  const valueSol = amount * tokenPriceSol;
  const hasCost = avgEntrySol > 0 && amount > 1e-9;
  const costSol = avgEntrySol * amount;
  const unrealizedSol = hasCost ? valueSol - costSol : 0;
  const pnlPct = hasCost && costSol > 0 ? (unrealizedSol / costSol) * 100 : 0;

  useEffect(() => {
    onReport(mint, valueSol, unrealizedSol);
  }, [mint, valueSol, unrealizedSol, onReport]);

  return (
    <Link
      href={`/trade/${mint}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
    >
      <TokenAvatar
        symbol={token?.symbol ?? "?"}
        logoURI={token?.logoURI}
        size={34}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openSpotlight({
            address: mint,
            symbol: token?.symbol ?? shortAddr(mint, 4, 4),
            name: token?.name ?? "",
            logoURI: token?.logoURI ?? null,
            priceUsd,
            marketCap: token?.marketCap ?? 0,
            change24h: token?.change24h ?? 0,
          });
        }}
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-white truncate">
          {token?.symbol ?? shortAddr(mint, 4, 4)}
        </div>
        <div className="text-xs text-muted tnum">
          {formatCompact(amount)} {token?.symbol ?? "tokens"}
        </div>
      </div>
      <div className="text-right shrink-0">
        {/* position value */}
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
            {unrealizedSol >= 0 ? "+" : ""}
            {formatSol(unrealizedSol)} · {unrealizedSol >= 0 ? "▲" : "▼"}{" "}
            {formatPct(pnlPct)}
          </div>
        ) : (
          <div className="text-[11px] text-faint">no entry</div>
        )}
      </div>
    </Link>
  );
}
