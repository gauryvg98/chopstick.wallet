"use client";

import { useEffect, useMemo, useState } from "react";
import { useSWRConfig } from "swr";
import { useToken, useHoldings, usePositions, useActivity } from "@/lib/api/hooks";
import { getClient } from "@/lib/api/index";
import type { WalletHoldings } from "@/lib/api/types";
import { useAuth } from "@/lib/auth";
import { HoldingsPanel } from "./HoldingsPanel";
import { TokenAbout } from "./TokenAbout";
import { useLivePrice } from "@/lib/livePrices";
import { useSwap, SOL_MINT } from "@/lib/swap";
import { Button } from "@/components/ui/Button";
import { PriceText } from "@/components/ui/PriceText";
import { formatUsd, formatCompact, formatPct, formatSol, timeAgo } from "@/lib/format";
import { cn } from "@/lib/cn";

type Side = "buy" | "sell";

const BUY_PRESETS = [10, 50, 100, 500]; // USD
const SOL_PRESETS = [0.01, 0.05, 0.25]; // SOL
const SELL_PRESETS = [25, 50, 100]; // percent
const SLIPPAGES = [0.5, 1, 2];
const FEE_RESERVE_SOL = 0.005; // kept back for wrapped-SOL rent + fees

/** Optimistically fold a just-confirmed swap into cached holdings so the panels
 *  snap instantly; the authoritative chain read reconciles exact amounts after. */
function adjustHoldings(
  cur: WalletHoldings | undefined,
  mint: string,
  solDelta: number,
  tokenDelta: number,
  decimals: number
): WalletHoldings {
  const base = cur ?? { solBalance: 0, tokens: [] };
  const solBalance = Math.max(0, base.solBalance + solDelta);
  let tokens = base.tokens.map((t) => ({ ...t }));
  const i = tokens.findIndex((t) => t.mint === mint);
  if (i >= 0) {
    const amt = Math.max(0, tokens[i].amount + tokenDelta);
    if (amt <= 1e-12) tokens = tokens.filter((_, j) => j !== i);
    else tokens[i] = { ...tokens[i], amount: amt };
  } else if (tokenDelta > 0) {
    tokens = [...tokens, { mint, amount: tokenDelta, rawAmount: "0", decimals }];
  }
  return { solBalance, tokens };
}

export function TradePanel({ address }: { address: string }) {
  const { data: token } = useToken(address);
  const { authenticated, user, login } = useAuth();
  const { price: livePrice } = useLivePrice(address);
  const { price: solPrice } = useLivePrice(SOL_MINT);
  const { swap, stage: swapStage, signature, reset: resetSwap } = useSwap();
  const { mutate } = useSWRConfig();
  // Clear any prior tx link/flash when switching tokens.
  useEffect(() => {
    resetSwap();
    setFlash(null);
    setFlashErr(false);
  }, [address, resetSwap]);
  const busy =
    swapStage === "building" ||
    swapStage === "signing" ||
    swapStage === "sending" ||
    swapStage === "confirming";

  const [side, setSide] = useState<Side>("buy");
  const [posTab, setPosTab] = useState<"open" | "closed">("open");
  const [usd, setUsd] = useState<string>("");
  const [buyDenom, setBuyDenom] = useState<"sol" | "usd">("sol");
  const [sellPct, setSellPct] = useState<number>(0);
  const [slippage, setSlippage] = useState<number>(1);
  const [flash, setFlash] = useState<string | null>(null);
  const [flashErr, setFlashErr] = useState(false); // error flashes persist until dismissed

  // On-chain wallet (read via RPC) once signed in.
  const owner = authenticated ? user?.address ?? null : null;
  const { data: holdings } = useHoldings(owner);
  // Wallet swap history (cached wallet-wide under ["activity", owner]); filtered
  // in memory to THIS token's buys/sells — the swaps that make up the position.
  const { data: activity } = useActivity(owner);
  const tokenTrades = (activity?.items ?? []).filter(
    (it) => it.mint === address && (it.kind === "buy" || it.kind === "sell")
  );

  // Live price drives value + PnL, so the position ticks in real time.
  const price = livePrice && livePrice > 0 ? livePrice : token?.priceUsd ?? 0;
  const sym = token?.symbol ?? "";

  // The individual swaps backing this position — only rendered inside a branch
  // that actually HAS a position (open holding / closed trade), so an empty
  // wallet never shows a stray trade list.
  const tradesBlock =
    tokenTrades.length > 0 ? (
      <div className="mt-3 pt-3 border-t border-line/60">
        <div className="text-[11px] uppercase tracking-wide text-faint mb-1.5">
          Your {sym} trades · {tokenTrades.length}
        </div>
        <div className="space-y-0.5 max-h-44 overflow-y-auto scroll-thin -mx-1">
          {tokenTrades.map((tr) => (
            <a
              key={tr.signature}
              href={`https://solscan.io/tx/${tr.signature}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-md px-1 py-1.5 text-xs hover:bg-white/5 transition-colors"
            >
              <span
                className={cn(
                  "w-9 shrink-0 font-bold uppercase",
                  tr.kind === "buy" ? "text-up" : "text-down"
                )}
              >
                {tr.kind}
              </span>
              <span className="flex-1 min-w-0 truncate text-white tnum">
                {formatCompact(tr.tokenAmount ?? 0)} {sym}
              </span>
              <span className="shrink-0 text-muted tnum">
                {formatSol(tr.solAmount)}
              </span>
              <span className="w-10 shrink-0 text-right text-faint tnum">
                {timeAgo(tr.timestamp * 1000)}
              </span>
            </a>
          ))}
        </div>
      </div>
    ) : null;

  // Holdings + cost basis both come from the CHAIN — no DB. avgEntrySol is the
  // average SOL paid per token (reconstructed from swap history); PnL is computed
  // in SOL so no historical USD pricing is needed, then shown in $ at live rates.
  const { data: positionsData } = usePositions(owner);
  const position = positionsData?.positions?.find((p) => p.mint === address);
  const heldToken = holdings?.tokens?.find((t) => t.mint === address);
  const heldAmount = heldToken?.amount ?? 0;
  const solBalance = holdings?.solBalance ?? 0;

  const avgEntrySol = position?.avgEntrySol ?? 0;
  const realizedSol = position?.realizedSol ?? 0;
  const realizedCostSol = position?.realizedCostSol ?? 0;
  const tokenPriceSol = solPrice && solPrice > 0 ? price / solPrice : 0;
  const costSol = avgEntrySol * heldAmount; // SOL paid for what's still held
  const valueSol = heldAmount * tokenPriceSol;
  const unrealizedSol = valueSol - costSol;
  const hasCost = costSol > 1e-9 && heldAmount > 1e-9;
  const pnlPct = hasCost ? (unrealizedSol / costSol) * 100 : 0;

  const valueUsd = heldAmount * price; // current value in USD
  const unrealizedUsd = unrealizedSol * (solPrice ?? 0);
  const hasPosition = heldAmount > 1e-9;

  const sellUsd = useMemo(() => (valueUsd * sellPct) / 100, [valueUsd, sellPct]);
  // Buy amount can be entered in SOL (what you actually hold/spend) or USD.
  const buyAmt = Number(usd) || 0;
  const buyUsd = buyDenom === "sol" ? buyAmt * (solPrice ?? 0) : buyAmt;
  const amountUsd = side === "buy" ? buyUsd : sellUsd;
  // Max SOL you can spend on a buy, keeping a reserve for rent + fees.
  const maxSol = Math.max(0, solBalance - FEE_RESERVE_SOL);
  const tokensOut = price > 0 ? amountUsd / price : 0;
  const minReceived = tokensOut * (1 - slippage / 100);
  const PRICE_IMPACT = 0.3;

  async function execute() {
    if (!token || amountUsd <= 0 || busy) return;

    // On-chain swap — sign in first.
    if (!authenticated) {
      login();
      return;
    }
    setFlash(null); // clear any prior error before a fresh attempt
    setFlashErr(false);
    const slippageBps = Math.round(slippage * 100);
    let result;
    if (side === "buy") {
      // A SOL→token swap needs extra SOL beyond the amount: the temporary wrapped-
      // SOL account's rent (~0.002) + priority/base fees. Keep a reserve so we
      // never try to spend the whole balance (which fails on-chain).
      const RESERVE_LAMPORTS = Math.floor(FEE_RESERVE_SOL * 1e9);
      const balanceLamports = Math.floor(solBalance * 1e9);
      const spendable = balanceLamports - RESERVE_LAMPORTS;
      if (spendable <= 0) {
        setFlash(
          "Not enough SOL — keep ~0.005 SOL for fees + rent. Add more to your wallet."
        );
        setTimeout(() => setFlash(null), 4000);
        return;
      }
      // Lamports from whichever denomination the user typed in.
      let lamports =
        buyDenom === "sol"
          ? Math.floor(buyAmt * 1e9)
          : solPrice && solPrice > 0
            ? Math.floor((buyAmt / solPrice) * 1e9)
            : 0;
      if (lamports <= 0) {
        setFlash("Enter an amount to buy.");
        setTimeout(() => setFlash(null), 2000);
        return;
      }
      if (lamports > spendable) lamports = spendable; // cap to what's safely spendable
      result = await swap({
        inputMint: SOL_MINT,
        outputMint: address,
        amount: lamports.toString(),
        slippageBps,
      });
    } else {
      // Sell a percentage of the exact on-chain raw balance (no float rounding).
      if (!heldToken?.rawAmount || sellPct <= 0) return;
      const raw = (
        (BigInt(heldToken.rawAmount) * BigInt(Math.round(sellPct))) /
        100n
      ).toString();
      if (raw === "0") return;
      result = await swap({
        inputMint: address,
        outputMint: SOL_MINT,
        amount: raw,
        slippageBps,
      });
    }

    if (result?.signature && !result.error) {
      setFlashErr(false);
      setFlash(`${side === "buy" ? "Bought" : "Sold"} ${sym} ✓ confirmed`);
      if (owner) {
        // 1. Optimistic snap — adjust cached holdings instantly so the position +
        //    wallet panels update the moment it confirms, no waiting on a refetch.
        const spentSol =
          buyDenom === "sol" ? buyAmt : solPrice ? amountUsd / solPrice : 0;
        const solDelta =
          side === "buy" ? -spentSol : solPrice ? sellUsd / solPrice : 0;
        const tokenDelta =
          side === "buy" ? tokensOut : -(heldAmount * sellPct) / 100;
        const dec = heldToken?.decimals ?? 0;
        mutate(
          ["holdings", owner],
          (cur?: WalletHoldings) =>
            adjustHoldings(cur, address, solDelta, tokenDelta, dec),
          { revalidate: false }
        );
        // 2. Authoritative reads (cache-bypassed) to reconcile exact amounts +
        //    recompute cost basis / PnL from the new swap; staggered for RPC lag.
        const fresh = () => {
          mutate(["holdings", owner], getClient().getHoldings(owner, true), {
            revalidate: false,
          });
          mutate(["positions", owner], getClient().getPositions(owner, true), {
            revalidate: false,
          });
        };
        fresh();
        setTimeout(fresh, 2500);
        setTimeout(fresh, 6000);
      }
      setUsd("");
      setSellPct(0);
      setTimeout(() => setFlash(null), 5000);
    } else {
      // Errors stay until dismissed — a failed swap shouldn't silently vanish.
      setFlashErr(true);
      setFlash(result?.error ?? "Swap failed — try again.");
    }
  }

  const canExecute =
    !busy &&
    (side === "buy"
      ? amountUsd > 0 || (buyDenom === "sol" && buyAmt > 0)
      : heldAmount > 1e-9 && sellPct > 0);

  return (
    <aside className="flex flex-col h-auto lg:h-full bg-ink lg:border-l border-t lg:border-t-0 border-line min-h-0">
      <div className="p-4 space-y-4 lg:flex-1 lg:overflow-y-auto scroll-thin">
        {/* Buy / Sell toggle */}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-surface-2 border border-line">
          {(["buy", "sell"] as Side[]).map((s) => (
            <button
              key={s}
              onClick={() => setSide(s)}
              className={cn(
                "h-10 rounded-xl text-sm font-bold uppercase transition-colors",
                side === s
                  ? s === "buy"
                    ? "bg-solis text-ink"
                    : "bg-down text-white"
                  : "text-muted hover:text-white"
              )}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Amount input */}
        {side === "buy" ? (
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <label className="text-xs text-faint">You pay</label>
                {/* SOL / USD denomination toggle */}
                <div className="flex items-center gap-0.5 rounded-md bg-surface-2 border border-line p-0.5">
                  {(["sol", "usd"] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => {
                        setBuyDenom(d);
                        setUsd("");
                      }}
                      className={cn(
                        "px-1.5 h-5 rounded text-[10px] font-bold uppercase transition-colors",
                        buyDenom === d ? "bg-solis text-ink" : "text-muted hover:text-white"
                      )}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <span className="text-xs text-faint">
                Balance {solBalance.toFixed(4)} SOL
              </span>
            </div>
            <div className="mt-1 flex items-center h-14 rounded-2xl bg-surface-2 border border-line px-4 focus-within:border-line-2">
              <span className="text-lg text-muted shrink-0">
                {buyDenom === "usd" ? "$" : "◎"}
              </span>
              <input
                inputMode="decimal"
                value={usd}
                onChange={(e) => setUsd(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder={buyDenom === "usd" ? "0.00" : "0.0"}
                className="flex-1 bg-transparent text-2xl font-semibold text-white outline-none tnum ml-1 min-w-0"
              />
              <span className="text-xs text-faint tnum shrink-0">
                {buyDenom === "usd"
                  ? `≈ ${solPrice ? (buyUsd / solPrice).toFixed(4) : "—"} SOL`
                  : `≈ ${formatUsd(buyUsd)}`}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {(buyDenom === "sol" ? SOL_PRESETS : BUY_PRESETS).map((p) => (
                <button
                  key={p}
                  onClick={() => setUsd(String(p))}
                  className="h-8 rounded-lg bg-surface-2 border border-line text-xs font-semibold text-muted hover:text-white"
                >
                  {buyDenom === "sol" ? `◎${p}` : `$${p}`}
                </button>
              ))}
              <button
                onClick={() =>
                  setUsd(
                    buyDenom === "sol"
                      ? String(+maxSol.toFixed(4))
                      : String(+(maxSol * (solPrice ?? 0)).toFixed(2))
                  )
                }
                className="h-8 rounded-lg bg-surface-2 border border-line text-xs font-bold text-solis hover:bg-solis/10"
                title={`Max ${maxSol.toFixed(4)} SOL (keeps ${FEE_RESERVE_SOL} for fees)`}
              >
                Max
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs text-faint">Sell amount</label>
              <span className="text-xs text-faint">
                Holding {formatCompact(heldAmount)} {sym}
              </span>
            </div>
            <div className="mt-1 flex items-center h-14 rounded-2xl bg-surface-2 border border-line px-4">
              <input
                inputMode="decimal"
                value={sellPct ? String(sellPct) : ""}
                onChange={(e) =>
                  setSellPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))
                }
                placeholder="0"
                className="flex-1 bg-transparent text-2xl font-semibold text-white outline-none tnum min-w-0"
              />
              <span className="text-lg text-muted">%</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {SELL_PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setSellPct(p)}
                  className="h-8 rounded-lg bg-surface-2 border border-line text-xs font-semibold text-muted hover:text-white"
                >
                  {p === 100 ? "Max" : `${p}%`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quote */}
        {token && amountUsd > 0 && (
          <div className="rounded-2xl bg-surface/60 border border-line p-3 text-sm space-y-1.5">
            <Row label="You pay">
              {side === "buy"
                ? formatUsd(amountUsd)
                : `${formatCompact(tokensOut)} ${sym}`}
            </Row>
            <Row label="You receive">
              {side === "buy"
                ? `≈ ${formatCompact(tokensOut)} ${sym}`
                : `≈ ${formatUsd(amountUsd)}`}
            </Row>
            <Row label={`Min received (${slippage}%)`}>
              {side === "buy"
                ? `${formatCompact(minReceived)} ${sym}`
                : `${formatUsd(amountUsd * (1 - slippage / 100))}`}
            </Row>
            <Row label="Price">
              <PriceText value={price} />
            </Row>
            <Row label="Price impact">
              <span className="text-up">{formatPct(-PRICE_IMPACT)}</span>
            </Row>
            <div className="flex items-center justify-between pt-1.5 border-t border-line/60">
              <span className="text-xs text-faint">Max slippage</span>
              <div className="flex items-center gap-1">
                {SLIPPAGES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSlippage(s)}
                    className={cn(
                      "px-1.5 h-6 rounded-md text-[11px] font-bold transition-colors",
                      s === slippage
                        ? "bg-solis text-ink"
                        : "bg-surface-2 text-muted hover:text-white"
                    )}
                  >
                    {s}%
                  </button>
                ))}
              </div>
            </div>
            <div className="text-xs text-faint">Jupiter · best route</div>
          </div>
        )}

        {/* Action */}
        <div className="space-y-2">
          <Button
            size="lg"
            variant={side === "buy" ? "primary" : "sell"}
            className="w-full"
            disabled={!canExecute}
            onClick={execute}
          >
            {busy
              ? swapStage === "building"
                ? "Building route…"
                : swapStage === "signing"
                  ? "Approve in wallet…"
                  : swapStage === "sending"
                    ? "Broadcasting…"
                    : "Confirming…"
              : `${side === "buy" ? "Buy" : "Sell"} ${sym}`}
          </Button>
          {authenticated ? (
            <p className="text-[11px] text-faint text-center">
              Swaps run on-chain via Jupiter, signed by your wallet.
            </p>
          ) : (
            <p className="text-[11px] text-faint text-center">
              <button
                onClick={() => login()}
                className="text-solis font-semibold hover:underline"
              >
                Sign in
              </button>{" "}
              to trade with your wallet.
            </p>
          )}
        </div>

        {/* Live transaction link — appears the moment the swap is broadcast, so
            you can track it on the explorer while it's still confirming. */}
        {signature && (
          <a
            href={`https://solscan.io/tx/${signature}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-xl bg-surface-2 border border-line py-2 text-xs font-semibold text-solis hover:border-solis/40 transition-colors"
          >
            {swapStage === "sending"
              ? "Broadcasting"
              : swapStage === "confirming"
                ? "Confirming on-chain"
                : "Transaction"}
            {" — track on Solscan ↗"}
          </a>
        )}

        {flash && (
          <div
            className={cn(
              "relative rounded-xl border text-sm text-center py-2 px-6 font-semibold",
              flashErr
                ? "bg-down/15 border-down/40 text-down"
                : "bg-solis/15 border-solis/40 text-solis"
            )}
          >
            {flash}
            {flashErr && (
              <button
                onClick={() => setFlash(null)}
                aria-label="Dismiss"
                className="absolute right-2 top-1.5 text-down/70 hover:text-down"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* About + live buy/sell activity (fomo-style) */}
        <TokenAbout address={address} />

        {/* Your position in THIS token — Open (current holding, unrealized) /
            Closed (realized PnL from past trades on this token). Scoped to the
            token on screen; the wallet-wide view lives on the portfolio page. */}
        <div className="rounded-2xl bg-surface/60 border border-line p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-white">Your position</span>
            <div className="flex gap-0.5 rounded-lg bg-surface-2 border border-line p-0.5">
              {(["open", "closed"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setPosTab(t)}
                  className={cn(
                    "px-2.5 h-6 rounded-md text-[11px] font-bold uppercase transition-colors",
                    posTab === t ? "bg-solis text-ink" : "text-muted hover:text-white"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {posTab === "open" ? (
            hasPosition && token ? (
              <>
                <div className="mt-2 flex items-end justify-between gap-2">
                  <span className="text-3xl font-bold text-white tnum leading-none">
                    {formatUsd(valueUsd)}
                  </span>
                  {hasCost && (
                    <span
                      className={cn(
                        "text-xs font-bold px-2 py-0.5 rounded-md",
                        unrealizedSol >= 0 ? "bg-up/15 text-up" : "bg-down/15 text-down"
                      )}
                    >
                      {unrealizedSol >= 0 ? "▲" : "▼"} {formatPct(pnlPct)}
                    </span>
                  )}
                </div>
                {hasCost ? (
                  <div
                    className={cn(
                      "mt-1 text-sm font-semibold",
                      unrealizedSol >= 0 ? "text-up" : "text-down"
                    )}
                  >
                    {unrealizedSol >= 0 ? "+" : ""}
                    {formatSol(unrealizedSol)}{" "}
                    <span className="text-faint font-normal">
                      ({unrealizedUsd >= 0 ? "+" : ""}
                      {formatUsd(unrealizedUsd)}) unrealized
                    </span>
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-faint">
                    Cost basis loads from your swap history…
                  </div>
                )}
                <div className="mt-3 pt-3 border-t border-line/60 space-y-2 text-sm">
                  <Row label="Amount">
                    {formatCompact(heldAmount)} {sym}
                  </Row>
                  {hasCost && (
                    <>
                      <Row label="Cost basis">{formatSol(costSol)}</Row>
                      <Row label="Value">{formatSol(valueSol)}</Row>
                    </>
                  )}
                  <Row label="Current price">
                    <PriceText value={price} />
                  </Row>
                </div>
                {tradesBlock}
              </>
            ) : (
              <p className="mt-3 text-sm text-faint text-center">
                {authenticated
                  ? `No ${sym || "token"} in your wallet yet.`
                  : `Sign in to load your ${sym || "token"} position.`}
              </p>
            )
          ) : Math.abs(realizedSol) > 1e-9 || realizedCostSol > 1e-9 ? (
            <>
              <div className="mt-2 flex items-end justify-between gap-2">
                <span
                  className={cn(
                    "text-3xl font-bold tnum leading-none",
                    realizedSol >= 0 ? "text-up" : "text-down"
                  )}
                >
                  {realizedSol >= 0 ? "+" : ""}
                  {formatUsd(realizedSol * (solPrice ?? 0))}
                </span>
                <span
                  className={cn(
                    "text-xs font-bold px-2 py-0.5 rounded-md",
                    realizedSol >= 0 ? "bg-up/15 text-up" : "bg-down/15 text-down"
                  )}
                >
                  {realizedSol >= 0 ? "▲" : "▼"}{" "}
                  {formatPct(realizedCostSol > 0 ? (realizedSol / realizedCostSol) * 100 : 0)}
                </span>
              </div>
              <div
                className={cn(
                  "mt-1 text-sm font-semibold",
                  realizedSol >= 0 ? "text-up" : "text-down"
                )}
              >
                {realizedSol >= 0 ? "+" : ""}
                {formatSol(realizedSol)}{" "}
                <span className="text-faint font-normal">realized on {sym}</span>
              </div>
              <div className="mt-3 pt-3 border-t border-line/60 space-y-2 text-sm">
                <Row label="Cost of sold">{formatSol(realizedCostSol)}</Row>
                <Row label="Status">
                  {hasPosition ? "Partially closed" : "Fully closed"}
                </Row>
              </div>
              {tradesBlock}
            </>
          ) : (
            <p className="mt-3 text-sm text-faint text-center">
              No closed {sym || "token"} trades yet.
            </p>
          )}
        </div>

        {/* Full on-chain wallet — SOL + every token, live USD values. */}
        <HoldingsPanel />
      </div>
    </aside>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="font-semibold text-white tnum text-right">{children}</span>
    </div>
  );
}
