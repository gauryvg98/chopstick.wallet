"use client";

import { priceParts } from "@/lib/format";
import { cn } from "@/lib/cn";
import { RollingDigits } from "./RollingDigits";
import { useRollDirection, rollDirClass } from "@/lib/useRollDirection";

/**
 * USD token price with the memecoin "$0.0₄1234" subscript-zero notation for
 * very small values. Digits roll like a slot machine when the value changes;
 * the roll is the tick cue, and the whole readout flashes green on an up-tick /
 * red on a down-tick, then eases back to its base colour. Static values render
 * as plain rolling-ready digits — no animation, no colour, no cost.
 */
export function PriceText({
  value,
  className,
  prefix = "$",
  directional = true,
}: {
  value: number;
  className?: string;
  prefix?: string;
  /** Colour the roll green/red by tick direction. On by default; pass false for
   *  a purely static readout (e.g. the scrolling marquee). */
  directional?: boolean;
}) {
  const { text, zeros, sig } = priceParts(value);
  const dir = useRollDirection(directional ? value : NaN);

  return (
    <span
      className={cn("tnum", directional && "roll-dir", rollDirClass(dir), className)}
    >
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
