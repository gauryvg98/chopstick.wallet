"use client";

import { useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useHoldings } from "@/lib/api/hooks";
import { useWatchMints } from "@/lib/livePrices";

/**
 * App-level, always mounted. Keeps the signed-in wallet's holdings fetched no
 * matter which page is open, and subscribes every owned token to the live-price
 * stream — so a user's own tokens always tick with top priority. The backend
 * also sees these holdings reads and bumps the owned mints to the front of its
 * pricing + sub-minute sampler pools, so their charts are deep + instant too.
 */
export function OwnedTokensWatcher() {
  const { authenticated, user } = useAuth();
  const owner = authenticated ? user?.address ?? null : null;
  const { data: holdings } = useHoldings(owner);

  const mints = useMemo(
    () => (holdings?.tokens ?? []).map((t) => t.mint),
    [holdings]
  );
  useWatchMints(mints);

  return null;
}
