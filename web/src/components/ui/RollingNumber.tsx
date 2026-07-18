"use client";

import { cn } from "@/lib/cn";
import { RollingDigits } from "./RollingDigits";
import { useRollDirection, rollDirClass } from "@/lib/useRollDirection";

/**
 * Any numeric readout with slot-machine rolling digits. Pass the raw `value`
 * and the `format` that renders it — market cap, volume, PnL, SOL amounts, %,
 * counts. The roll is the tick cue; by default the readout also flashes green
 * up / red down on each tick, then eases back to its base colour. Static values
 * never animate or colour (the roll only fires when the digits actually change).
 *
 * For token prices use <PriceText> (subscript-zero notation); for % change use
 * <ChangeText> (colour + triangle). This is the general-purpose one.
 */
export function RollingNumber({
  value,
  format,
  className,
  prefix,
  suffix,
  directional = true,
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  /** Colour the roll green/red by tick direction. On by default; pass false for
   *  non-monetary counts where a colour flash would be noise. */
  directional?: boolean;
}) {
  const text = format ? format(value) : String(value);
  const dir = useRollDirection(directional ? value : NaN);
  return (
    <span
      className={cn("tnum", directional && "roll-dir", rollDirClass(dir), className)}
    >
      {prefix}
      <RollingDigits text={text} />
      {suffix}
    </span>
  );
}
