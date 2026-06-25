"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useHoldings, useToken } from "@/lib/api/hooks";
import { useLivePrice } from "@/lib/livePrices";
import { TokenAvatar } from "@/components/ui/TokenAvatar";
import { formatUsd, formatCompact, shortAddr } from "@/lib/format";

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
  const { price: solPrice } = useLivePrice(SOL_MINT);

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
          <div className="font-bold text-white tnum">{formatUsd(total)}</div>
        </div>
      </div>

      <div className="divide-y divide-line/60">
        {/* SOL */}
        <div className="flex items-center gap-3 px-4 py-2.5">
          <TokenAvatar symbol="SOL" logoURI={null} size={30} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-white">SOL</div>
            <div className="text-xs text-muted tnum">{sol.toFixed(4)} SOL</div>
          </div>
          <div className="text-right text-sm font-semibold text-white tnum">
            {solUsd > 0 ? formatUsd(solUsd) : "—"}
          </div>
        </div>

        {/* SPL tokens */}
        {tokens.map((t) => (
          <HoldingRow key={t.mint} mint={t.mint} amount={t.amount} onValue={reportValue} />
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
  onValue,
}: {
  mint: string;
  amount: number;
  onValue: (mint: string, usd: number) => void;
}) {
  const { data: token } = useToken(mint);
  const { price: live } = useLivePrice(mint);
  const price = live && live > 0 ? live : token?.priceUsd ?? 0;
  const usd = amount * price;

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
        <div className="text-xs text-muted tnum">{formatCompact(amount)} tokens</div>
      </div>
      <div className="text-right text-sm font-semibold text-white tnum">
        {usd > 0 ? formatUsd(usd) : "—"}
      </div>
    </Link>
  );
}
