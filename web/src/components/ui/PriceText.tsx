import { priceParts } from "@/lib/format";
import { cn } from "@/lib/cn";
import { RollingDigits } from "./RollingDigits";

/**
 * USD token price with the memecoin "$0.0₄1234" subscript-zero notation for
 * very small values. Digits roll like a slot machine when the value changes;
 * the roll itself is the tick cue (no flash). Static values render as plain
 * rolling-ready digits — no animation, no cost.
 */
export function PriceText({
  value,
  className,
  prefix = "$",
}: {
  value: number;
  className?: string;
  prefix?: string;
}) {
  const { text, zeros, sig } = priceParts(value);

  return (
    <span className={cn("tnum", className)}>
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
