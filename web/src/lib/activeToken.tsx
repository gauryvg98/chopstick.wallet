"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { seedToken } from "@/lib/api/tokenCache";
import type { Token } from "@/lib/api/types";

type SelectToken = Partial<Token> & {
  address: string;
  symbol: string;
  name: string;
};

interface ActiveTokenCtx {
  /** The token the workspace should show *right now* (optimistic, instant). */
  address: string;
  /** Switch tokens instantly from data we already have; URL syncs in the bg. */
  select: (t: SelectToken) => void;
}

const Ctx = createContext<ActiveTokenCtx | null>(null);

/**
 * Holds the currently-displayed trade token. Lives in the persistent trade
 * layout so the sidebar and the workspace share it. Clicking a token flips this
 * state synchronously — the header/chart re-render from the seeded row data
 * immediately — while `router.push` updates the URL in the background. Without
 * this, every switch waits on the dynamic route's server transition (which gets
 * starved by the page's live price re-renders), so clicks felt laggy.
 */
export function ActiveTokenProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const m = pathname?.match(/^\/trade\/([^/?#]+)/);
  const routeAddr = m ? decodeURIComponent(m[1]) : "";

  // Optimistic override, cleared whenever the real URL changes (navigation
  // completed, or browser back/forward) so we always converge on the URL.
  const [optimistic, setOptimistic] = useState<string | null>(null);
  useEffect(() => {
    setOptimistic(null);
  }, [routeAddr]);

  const address = optimistic ?? routeAddr;

  const select = useCallback(
    (t: SelectToken) => {
      if (!t.address || t.address === address) return;
      seedToken(t); // header paints instantly from the data we already have
      // Update the URL *synchronously* (native history — Next syncs usePathname
      // with it, no server round-trip), so the address bar and the banner change
      // together in the same click. The optimistic state guarantees the content
      // flips on this very render; usePathname then catches up and clears it.
      setOptimistic(t.address);
      window.history.pushState(null, "", `/trade/${t.address}`);
    },
    [address]
  );

  return <Ctx.Provider value={{ address, select }}>{children}</Ctx.Provider>;
}

export function useActiveToken(): ActiveTokenCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useActiveToken must be used within ActiveTokenProvider");
  return c;
}
