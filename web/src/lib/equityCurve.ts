import type { ActivityItem } from "@/lib/api/types";

export interface EquityPoint {
  /** unix seconds */
  t: number;
  /** account value in USD at that time */
  v: number;
}

/**
 * Reconstructs a REAL equity curve from the wallet's activity log — no backend,
 * no historical price feed. The only movements knowable frontend-side are:
 *   • deposits / withdrawals (SOL in/out), and
 *   • realized PnL on each sell (proceeds − average cost of the tokens sold).
 * At the instant of any swap the portfolio's market value is continuous (you
 * trade equal value), so a true mark-to-market wiggle isn't recoverable here —
 * this curve steps at deposits and realized sells, which is genuinely your
 * realized account equity over time.
 *
 * Cost basis uses the same running-average method as the backend. The series is
 * anchored so its final point equals the live total value (which folds in the
 * current unrealized PnL the realized curve can't see).
 */
export function buildEquityCurve(
  items: ActivityItem[],
  currentTotalUsd: number,
  solPrice: number,
  nowSec: number
): EquityPoint[] {
  const sorted = [...items]
    .filter((i) => !i.failed)
    .sort((a, b) => a.timestamp - b.timestamp);
  if (sorted.length === 0 || solPrice <= 0) return [];

  const book = new Map<string, { qty: number; cost: number }>();
  let accSol = 0; // relative realized equity (net deposits + realized PnL), in SOL
  const raw: { t: number; sol: number }[] = [];

  for (const it of sorted) {
    if (it.kind === "deposit") {
      accSol += it.solAmount;
    } else if (it.kind === "withdraw") {
      accSol -= it.solAmount;
    } else if (it.kind === "buy" && it.mint) {
      // Cash → position at cost; no change to realized equity.
      const b = book.get(it.mint) ?? { qty: 0, cost: 0 };
      b.qty += it.tokenAmount ?? 0;
      b.cost += it.solAmount;
      book.set(it.mint, b);
    } else if (it.kind === "sell" && it.mint) {
      const b = book.get(it.mint) ?? { qty: 0, cost: 0 };
      const avg = b.qty > 1e-12 ? b.cost / b.qty : 0;
      const q = it.tokenAmount ?? 0;
      const costOfSold = avg * q;
      b.qty -= q;
      b.cost -= costOfSold;
      book.set(it.mint, b);
      accSol += it.solAmount - costOfSold; // realized PnL
    }
    // receive / send (token transfers) are skipped — ambiguous cost basis.
    raw.push({ t: it.timestamp, sol: accSol });
  }

  if (raw.length === 0) return [];

  // Anchor the series to the live total value: shift everything so the last
  // reconstructed point lands on the real current value (adds cash + unrealized).
  const lastUsd = raw[raw.length - 1].sol * solPrice;
  const offset = currentTotalUsd - lastUsd;
  const pts: EquityPoint[] = raw.map((p) => ({ t: p.t, v: p.sol * solPrice + offset }));
  if (pts[pts.length - 1].t < nowSec) pts.push({ t: nowSec, v: currentTotalUsd });
  return pts;
}

export type EquityWindow = "24H" | "7D" | "30D" | "ALL";

const WINDOW_SECONDS: Record<EquityWindow, number> = {
  "24H": 86_400,
  "7D": 7 * 86_400,
  "30D": 30 * 86_400,
  ALL: Infinity,
};

/** Slice the full curve to a window, keeping one anchor point just before it so
 *  the line doesn't start mid-air. */
export function sliceWindow(
  curve: EquityPoint[],
  window: EquityWindow,
  nowSec: number
): EquityPoint[] {
  if (window === "ALL") return curve;
  const cutoff = nowSec - WINDOW_SECONDS[window];
  const inWindow = curve.filter((p) => p.t >= cutoff);
  if (inWindow.length >= 2) return inWindow;
  // Too few points in-window: fall back to the last few so there's always a line.
  return curve.slice(-Math.max(2, inWindow.length));
}
