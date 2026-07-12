"use client";

import { priceParts } from "@/lib/format";
import { cn } from "@/lib/cn";
import { RollingDigits } from "./RollingDigits";
import { useTickFlash } from "./tickFlash";

/**
 * USD token price with the memecoin "$0.0₄1234" subscript-zero notation for
 * very small values. Digits roll like a slot machine when the value changes,
 * and the box flashes gold/red up/down on each tick. Static values (no change)
 * render as plain rolling-ready digits — no animation, no cost.
 */
export function PriceText({
  value,
  className,
  prefix = "$",
  flash = true,
}: {
  value: number;
  className?: string;
  prefix?: string;
  /** Set false to opt out of the up/down flash (roll still applies). */
  flash?: boolean;
}) {
  const ref = useTickFlash<HTMLSpanElement>(value, flash);
  const { text, zeros, sig } = priceParts(value);

  return (
    <span ref={ref} className={cn("tnum rd-flash", className)}>
      {prefix}
      {zeros === 0 ? (
        <RollingDigits text={text} />
      ) : (
        <>
          0.0
          <sub className="text-[0.7em] align-baseline">{zeros}</sub>
          <RollingDigits text={sig} />
        </>
      )}
    </span>
  );
}
