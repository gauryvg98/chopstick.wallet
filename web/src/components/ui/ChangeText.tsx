import { formatPct } from "@/lib/format";
import { cn } from "@/lib/cn";
import { RollingDigits } from "./RollingDigits";

/** Green/red percentage change with a directional triangle; digits roll on
 *  change (the roll is the tick cue, no flash). */
export function ChangeText({
  value,
  className,
  showArrow = true,
  hideZero = false,
}: {
  value: number;
  className?: string;
  showArrow?: boolean;
  /** Render nothing when the value is exactly 0 — used where 0 means "no data"
   *  (e.g. the pump.fun feed, whose list carries no 24h % change). */
  hideZero?: boolean;
}) {
  if (hideZero && value === 0) return null;
  const up = value >= 0;
  return (
    <span
      className={cn(
        "tnum inline-flex items-center gap-0.5 font-semibold",
        up ? "text-up" : "text-down",
        className
      )}
    >
      {showArrow && <span className="text-[0.85em]">{up ? "▲" : "▼"}</span>}
      <RollingDigits text={formatPct(value)} />
    </span>
  );
}
