"use client";

import { AuthProvider } from "@/lib/auth";
import { LivePricesProvider } from "@/lib/livePrices";
import { SpotlightProvider } from "@/components/TokenSpotlight";
import { OwnedTokensWatcher } from "@/components/OwnedTokensWatcher";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <LivePricesProvider>
        <OwnedTokensWatcher />
        <SpotlightProvider>{children}</SpotlightProvider>
      </LivePricesProvider>
    </AuthProvider>
  );
}
