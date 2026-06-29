"use client";

import { useEffect, useRef } from "react";
import { useSidebar } from "@/lib/tradeSidebar";
import { useActiveToken } from "@/lib/activeToken";
import { TradeSidebar } from "./TradeSidebar";
import { cn } from "@/lib/cn";

/**
 * The trade workspace grid. Reads the collapse state so the left panel can fold
 * away and the chart/feed/buy columns expand to fill the freed space. The panel
 * itself (with its tabs + list) lives here so it stays mounted across token
 * clicks — only its width animates.
 *
 * On mobile the same panel is a slide-in drawer (the desktop grid column is
 * hidden) — opened from the header hamburger, closed by the backdrop, the «
 * button, or selecting a token.
 */
export function TradeGrid({ children }: { children: React.ReactNode }) {
  const { collapsed, toggle, mobileOpen, closeMobile } = useSidebar();
  const { address } = useActiveToken();

  // Selecting a token from the drawer should return focus to the trade page.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    closeMobile();
  }, [address, closeMobile]);

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

      {/* Mobile token-list drawer — the same sidebar as a slide-in overlay. */}
      <div
        className={cn("lg:hidden fixed inset-0 z-50", !mobileOpen && "pointer-events-none")}
        aria-hidden={!mobileOpen}
      >
        <div
          onClick={closeMobile}
          className={cn(
            "absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200",
            mobileOpen ? "opacity-100" : "opacity-0"
          )}
        />
        <div
          className={cn(
            "absolute inset-y-0 left-0 w-[86%] max-w-[360px] bg-ink shadow-2xl transition-transform duration-200 ease-out",
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <TradeSidebar onCollapse={closeMobile} />
        </div>
      </div>
    </div>
  );
}
