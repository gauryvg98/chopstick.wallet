"use client";

import { useEffect, useState } from "react";

/* Lightweight client-side position book (localStorage). Used for the demo
 * trade flow so Buy/Sell updates a real, persistent position + PnL.
 * When the Go backend + Privy swaps are live, executions settle on-chain and
 * positions are read back from the wallet instead. */

export interface StoredPosition {
  tokenAmount: number;
  costUsd: number;
}

const KEY = "cw_positions";
const EVT = "cw_positions_changed";

type Book = Record<string, StoredPosition>;

function read(): Book {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Book;
  } catch {
    return {};
  }
}

function write(book: Book) {
  localStorage.setItem(KEY, JSON.stringify(book));
  window.dispatchEvent(new Event(EVT));
}

export function getPosition(address: string): StoredPosition | null {
  return read()[address] ?? null;
}

export function applyTrade(
  address: string,
  side: "buy" | "sell",
  usdAmount: number,
  price: number
) {
  const book = read();
  const cur = book[address] ?? { tokenAmount: 0, costUsd: 0 };
  const tokens = usdAmount / price;

  if (side === "buy") {
    cur.tokenAmount += tokens;
    cur.costUsd += usdAmount;
  } else {
    const sellTokens = Math.min(tokens, cur.tokenAmount);
    const frac = cur.tokenAmount > 0 ? sellTokens / cur.tokenAmount : 0;
    cur.costUsd *= 1 - frac;
    cur.tokenAmount -= sellTokens;
  }

  if (cur.tokenAmount < 1e-9) {
    delete book[address];
  } else {
    book[address] = cur;
  }
  write(book);
}

/** Reactive position for the current token, with live PnL vs price. */
export function usePosition(address: string | null, price: number | undefined) {
  const [pos, setPos] = useState<StoredPosition | null>(null);

  useEffect(() => {
    if (!address) return;
    const update = () => setPos(getPosition(address));
    update();
    window.addEventListener(EVT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(EVT, update);
      window.removeEventListener("storage", update);
    };
  }, [address]);

  if (!pos || !price) return { pos, valueUsd: 0, pnlUsd: 0, pnlPct: 0 };
  const valueUsd = pos.tokenAmount * price;
  const pnlUsd = valueUsd - pos.costUsd;
  const pnlPct = pos.costUsd > 0 ? (pnlUsd / pos.costUsd) * 100 : 0;
  return { pos, valueUsd, pnlUsd, pnlPct };
}
