"use client";

import { cn } from "@/lib/cn";
import { RollingDigits } from "./RollingDigits";
import { useTickFlash } from "./tickFlash";

/**
 * Any numeric readout with slot-machine rolling digits + an up/down tick flash.
 * Pass the raw `value` (drives roll direction + flash) and the `format` that
 * renders it — market cap, volume, PnL, SOL amounts, %, counts. Static values
 * simply never animate (the roll only fires when `value` actually changes).
 *
 * For token prices use <PriceText> (subscript-zero notation); for % change use
 * <ChangeText> (colour + triangle). This is the general-purpose one.
 */
export function RollingNumber({
  value,
  format,
  className,
  flash = true,
  prefix,
  suffix,
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
  /** Set false to opt out of the up/down flash (roll still applies). */
  flash?: boolean;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}) {
  const ref = useTickFlash<HTMLSpanElement>(value, flash);
  const text = format ? format(value) : String(value);
  return (
    <span ref={ref} className={cn("tnum rd-flash", className)}>
      {prefix}
      <RollingDigits text={text} />
      {suffix}
    </span>
  );
}
