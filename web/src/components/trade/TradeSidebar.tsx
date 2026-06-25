"use client";

import { useActiveToken } from "@/lib/activeToken";
import { TrendingList } from "./TrendingList";

/**
 * Sidebar wrapper that lives in the persistent trade *layout* (not the page),
 * so it never remounts when you click between tokens — scroll position, tab,
 * and live state all survive navigation. The active token comes from the shared
 * active-token context, so the highlight updates the instant you click (before
 * the URL catches up).
 */
export function TradeSidebar() {
  const { address } = useActiveToken();
  return <TrendingList activeAddress={address} />;
}
