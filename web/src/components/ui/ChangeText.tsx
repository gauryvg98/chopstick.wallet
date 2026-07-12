"use client";

import { formatPct } from "@/lib/format";
import { cn } from "@/lib/cn";
import { RollingDigits } from "./RollingDigits";
import { useTickFlash } from "./tickFlash";

/** Green/red percentage change with a directional triangle; digits roll and the
 *  box flashes on change. */
export function ChangeText({
  value,
  className,
  showArrow = true,
  flash = true,
}: {
  value: number;
  className?: string;
  showArrow?: boolean;
  flash?: boolean;
}) {
  const ref = useTickFlash<HTMLSpanElement>(value, flash);
  const up = value >= 0;
  return (
    <span
      ref={ref}
      className={cn(
        "tnum inline-flex items-center gap-0.5 font-semibold rd-flash",
        up ? "text-up" : "text-down",
        className
      )}
    >
      {showArrow && <span className="text-[0.85em]">{up ? "▲" : "▼"}</span>}
      <RollingDigits text={formatPct(value)} />
    </span>
  );
}
