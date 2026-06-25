"use client";

import { usePathname } from "next/navigation";
import { TrendingList } from "./TrendingList";

/**
 * Sidebar wrapper that lives in the persistent trade *layout* (not the page),
 * so it never remounts when you click between tokens — scroll position, tab,
 * and live state all survive navigation. The active token is read from the URL
 * rather than a prop, since a layout doesn't receive the child route's params.
 */
export function TradeSidebar() {
  const pathname = usePathname();
  const match = pathname?.match(/^\/trade\/([^/?#]+)/);
  const activeAddress = match ? decodeURIComponent(match[1]) : "";
  return <TrendingList activeAddress={activeAddress} />;
}
