"use client";

import { useState } from "react";
import { useActiveToken } from "@/lib/activeToken";
import { useSidebar } from "@/lib/tradeSidebar";
import { TrendingList } from "./TrendingList";
import { cn } from "@/lib/cn";

type Nav = "alerts" | "tokens" | "leaderboard" | "feed";

const NAV: { key: Nav; label: string }[] = [
  { key: "alerts", label: "Alerts" },
  { key: "tokens", label: "Tokens" },
  { key: "leaderboard", label: "Leaderboard" },
  { key: "feed", label: "Feed" },
];

/**
 * Sidebar wrapper that lives in the persistent trade *layout* (not the page),
 * so it never remounts when you click between tokens — scroll position, tab,
 * and live state all survive navigation.
 *
 * Top row is the fomo-style section nav (Alerts · Tokens · Leaderboard · Feed);
 * "Tokens" is the live list, the others are previews. A « button collapses the
 * whole panel (the workspace grid resizes to fill it).
 */
export function TradeSidebar() {
  const { address } = useActiveToken();
  const { toggle } = useSidebar();
  const [nav, setNav] = useState<Nav>("tokens");

  return (
    <div className="flex flex-col h-full bg-ink border-r border-line min-h-0">
      {/* section nav + collapse */}
      <div className="shrink-0 flex items-center gap-3 px-3 h-11 border-b border-line">
        <div className="flex items-center justify-between gap-2 flex-1 min-w-0">
          {NAV.map((n) => (
            <button
              key={n.key}
              onClick={() => setNav(n.key)}
              className={cn(
                "shrink-0 text-sm font-bold transition-colors",
                nav === n.key ? "text-white" : "text-faint hover:text-muted"
              )}
            >
              {n.label}
            </button>
          ))}
        </div>
        <button
          onClick={toggle}
          title="Collapse panel"
          aria-label="Collapse panel"
          className="shrink-0 grid h-6 w-6 place-items-center rounded-md text-muted hover:text-white hover:bg-white/5 transition-colors"
        >
          «
        </button>
      </div>

      {nav === "tokens" ? (
        <TrendingList activeAddress={address} />
      ) : (
        <SoonPanel nav={nav} />
      )}
    </div>
  );
}

function SoonPanel({ nav }: { nav: Nav }) {
  const copy: Record<Exclude<Nav, "tokens">, { icon: string; line: string }> = {
    alerts: { icon: "🔔", line: "Whale & price alerts are coming soon." },
    leaderboard: { icon: "🏆", line: "The Chad Board leaderboard is coming soon." },
    feed: { icon: "📡", line: "The smart-money feed is coming soon." },
  };
  const c = copy[nav as Exclude<Nav, "tokens">];
  return (
    <div className="flex-1 grid place-items-center px-6 text-center">
      <div>
        <div className="text-3xl">{c.icon}</div>
        <p className="mt-3 text-sm text-muted">{c.line}</p>
        <span className="mt-3 inline-block rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-faint">
          Soon
        </span>
      </div>
    </div>
  );
}
