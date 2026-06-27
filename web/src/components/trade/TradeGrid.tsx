"use client";

import { useSidebar } from "@/lib/tradeSidebar";
import { TradeSidebar } from "./TradeSidebar";
import { cn } from "@/lib/cn";

/**
 * The trade workspace grid. Reads the collapse state so the left panel can fold
 * away and the chart/feed/buy columns expand to fill the freed space. The panel
 * itself (with its tabs + list) lives here so it stays mounted across token
 * clicks — only its width animates.
 */
export function TradeGrid({ children }: { children: React.ReactNode }) {
  const { collapsed, toggle } = useSidebar();
  return (
    <div
      className={cn(
        "relative flex-1 min-h-0 lg:grid transition-[grid-template-columns] duration-200 ease-out",
        collapsed
          ? "lg:grid-cols-[0px_minmax(0,1fr)]"
          : "lg:grid-cols-[340px_minmax(0,1fr)]"
      )}
    >
      {/* Re-expand handle, shown only while collapsed (desktop). */}
      {collapsed && (
        <button
          onClick={toggle}
          title="Expand panel"
          aria-label="Expand panel"
          className="hidden lg:grid absolute left-0 top-3 z-20 h-8 w-6 place-items-center rounded-r-lg border border-l-0 border-line bg-surface-2 text-muted hover:text-white hover:bg-surface transition-colors"
        >
          »
        </button>
      )}
      {/* Persistent left column — never remounts on token clicks. */}
      <aside
        className={cn(
          "hidden lg:block h-full min-h-0 overflow-hidden",
          collapsed && "pointer-events-none opacity-0"
        )}
      >
        <TradeSidebar />
      </aside>
      <div className="min-h-0 h-full">{children}</div>
    </div>
  );
}
