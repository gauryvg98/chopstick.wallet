/* Number / price / time formatting for the trading UI. */

const usd0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const usd2 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Compact market-cap / volume: $1.2K, $3.4M, $5.6B. */
export function formatCompactUsd(n: number): string {
  if (!isFinite(n)) return "$0";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  if (abs >= 1) return `$${n.toFixed(2)}`;
  if (abs === 0) return "$0";
  if (abs < 0.01) return "<$0.01";
  return `$${n.toFixed(2)}`;
}

/** Compact plain number: 1.2K, 3.4M. */
export function formatCompact(n: number): string {
  if (!isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString("en-US");
}

export function formatUsd(n: number): string {
  return usd2.format(n);
}

/** Format a SOL amount with the ◎ symbol and sensible precision. */
export function formatSol(n: number): string {
  const a = Math.abs(n);
  const d = a >= 1 ? 3 : a >= 0.001 ? 4 : 6;
  return `◎${n.toFixed(d)}`;
}

/**
 * Decompose a small token price into a leading part and the count of leading
 * zeros after the decimal, so the UI can render the memecoin "$0.0₄1234" style.
 */
export function priceParts(price: number): {
  text: string;
  zeros: number;
  sig: string;
} {
  if (!isFinite(price) || price <= 0) return { text: "0.00", zeros: 0, sig: "" };
  if (price >= 1) return { text: price.toFixed(2), zeros: 0, sig: "" };
  // Down to 0.001, show 6 decimals: enough precision that a sub-percent tick
  // actually moves a visible digit (toFixed(4) rounded those moves away, which
  // is why prices looked frozen), while the fixed 6-wide field keeps every digit
  // in a stable slot so only the ones that change roll.
  if (price >= 0.001) return { text: price.toFixed(6), zeros: 0, sig: "" };

  // Sub-0.001: subscript-zero notation with a FIXED 5 significant figures. No
  // trailing-zero strip — a stable width means slots don't shift under the digits,
  // so a tick rolls only what changed instead of re-spinning the whole number.
  const exp = price.toExponential(4); // "1.7951e-7"
  const [mant, eStr] = exp.split("e");
  const zeros = -parseInt(eStr, 10) - 1; // leading zeros after "0."
  const sig = mant.replace(".", ""); // exactly 5 digits, zero-padded
  return { text: "", zeros, sig };
}

/** Plain price string (no subscript) — for inputs / aria labels. */
export function formatPrice(price: number): string {
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  const { zeros, sig } = priceParts(price);
  return `$0.0(${zeros})${sig}`;
}

export function formatPct(pct: number): string {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

export function shortAddr(addr: string, lead = 4, tail = 4): string {
  if (!addr) return "";
  if (addr.length <= lead + tail + 1) return addr;
  return `${addr.slice(0, lead)}…${addr.slice(-tail)}`;
}

export function timeAgo(tsMs: number): string {
  const s = Math.max(0, Math.floor((Date.now() - tsMs) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
