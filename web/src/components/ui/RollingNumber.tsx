import { cn } from "@/lib/cn";
import { RollingDigits } from "./RollingDigits";

/**
 * Any numeric readout with slot-machine rolling digits. Pass the raw `value`
 * and the `format` that renders it — market cap, volume, PnL, SOL amounts, %,
 * counts. The roll is the tick cue (no flash). Static values never animate (the
 * roll only fires when the rendered digits actually change).
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
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}) {
  const text = format ? format(value) : String(value);
  return (
    <span className={cn("tnum", className)}>
      {prefix}
      <RollingDigits text={text} />
      {suffix}
    </span>
  );
}
