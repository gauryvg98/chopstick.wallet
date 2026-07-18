"use client";

import { useEffect, useRef, useState } from "react";

export type RollDir = "up" | "down" | null;

/**
 * Tracks the tick direction of a numeric readout so it can flash green (up) or
 * red (down) as its digits roll, then settle back to the base colour.
 *
 * Self-contained per readout: it compares against the value it last rendered, so
 * any <PriceText>/<RollingNumber> colours itself with no plumbing — live prices,
 * derived market caps, PnL, all of it. Cheap under load: upstream price ticks are
 * already coalesced to one flush per animation frame, so this fires at most ~1×
 * per frame per mint no matter how many trades/sec arrive from the firehose. A
 * run of ticks in one direction keeps the colour lit (the settle timer resets on
 * each tick) and it eases back to neutral only once the ticks pause.
 */
export function useRollDirection(value: number, holdMs = 650): RollDir {
  const prev = useRef(value);
  const [dir, setDir] = useState<RollDir>(null);
  useEffect(() => {
    if (!Number.isFinite(value) || value === prev.current) return;
    const d: RollDir = value > prev.current ? "up" : "down";
    prev.current = value;
    setDir(d);
    const t = setTimeout(() => setDir(null), holdMs);
    return () => clearTimeout(t);
  }, [value, holdMs]);
  return dir;
}

/** Class name for the direction colour, or "" when neutral. Pair with the
 *  `roll-dir` base class (globals.css) that owns the fade-back transition. */
export function rollDirClass(dir: RollDir): string {
  return dir === "up" ? "roll-up" : dir === "down" ? "roll-down" : "";
}
