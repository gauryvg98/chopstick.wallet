"use client";

import { useEffect, useRef } from "react";

// Gold (up) / red (down) — matches --color-solis / --color-down at low alpha.
const UP = "rgba(245, 179, 1, 0.32)";
const DOWN = "rgba(255, 82, 71, 0.32)";

let reduced: boolean | null = null;
function prefersReduced(): boolean {
  if (reduced === null) {
    reduced =
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  }
  return reduced;
}

/**
 * Returns a ref to attach to an element that should flash gold/red whenever
 * `value` moves up/down between renders. The flash is fired imperatively via
 * the Web Animations API (compositor-friendly, self-retriggering on rapid
 * ticks, auto-cleaned) — no React state, no re-render, no class juggling.
 */
export function useTickFlash<T extends HTMLElement>(value: number, enabled = true) {
  const ref = useRef<T>(null);
  const prev = useRef(value);
  useEffect(() => {
    const p = prev.current;
    prev.current = value;
    if (
      !enabled ||
      p === value ||
      !Number.isFinite(value) ||
      !ref.current ||
      prefersReduced()
    ) {
      return;
    }
    ref.current.animate(
      [{ backgroundColor: value > p ? UP : DOWN }, { backgroundColor: "transparent" }],
      { duration: 600, easing: "ease-out" }
    );
  }, [value, enabled]);
  return ref;
}
