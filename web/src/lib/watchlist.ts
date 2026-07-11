"use client";

import { useMemo, useSyncExternalStore } from "react";

/**
 * Tiny localStorage-backed watchlist (starred token mints). Reactive via
 * useSyncExternalStore so every star toggles in sync across the page, and
 * survives reloads. Self-contained — no backend, no account needed.
 */
const KEY = "solis.watchlist";
const listeners = new Set<() => void>();

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

// A stable, content-derived snapshot string so useSyncExternalStore only
// re-renders subscribers when membership actually changes.
let snapshot = read().sort().join(",");

function commit(next: string[]) {
  snapshot = next.sort().join(",");
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage full / unavailable — keep the in-memory snapshot anyway */
  }
  listeners.forEach((l) => l());
}

export function toggleWatch(mint: string) {
  const cur = read();
  commit(cur.includes(mint) ? cur.filter((m) => m !== mint) : [...cur, mint]);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return snapshot;
}
function getServerSnapshot() {
  return "";
}

export function useWatchlist() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const set = useMemo(() => new Set(snap ? snap.split(",") : []), [snap]);
  return {
    mints: set,
    has: (mint: string) => set.has(mint),
    toggle: toggleWatch,
  };
}
