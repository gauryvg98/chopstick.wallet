import { priceParts } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * Renders a USD token price with the memecoin "$0.0₄1234" subscript-zero
 * notation for very small values (matches the ChadWallet app).
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

  if (zeros === 0) {
    return (
      <span className={cn("tnum", className)}>
        {prefix}
        {text}
      </span>
    );
  }

  return (
    <span className={cn("tnum", className)}>
      {prefix}0.0
      <sub className="text-[0.7em] align-baseline">{zeros}</sub>
      {sig}
    </span>
  );
}
