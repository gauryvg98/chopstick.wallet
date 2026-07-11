"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { SiteHeader } from "@/components/SiteHeader";
import { TokenBanner } from "@/components/TokenBanner";
import { PortfolioPositions } from "@/components/PortfolioPositions";
import { Button } from "@/components/ui/Button";

/**
 * Full-page live wallet for the degens — SOL + every token with current PnL, plus
 * headline Net / Active / Realized PnL. Cost basis is chain-derived (no DB),
 * valued in real time off the same websocket price stream as the rest of the app.
 */
export function PortfolioView() {
  const { ready, authenticated, login, user } = useAuth();
  const owner = authenticated ? user?.address ?? null : null;

  return (
    <div className="flex flex-col min-h-full">
      <SiteHeader />
      <TokenBanner direction="left" />
      <main className="flex-1 bg-app-glow">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10">
          <div className="flex items-end justify-between flex-wrap gap-4">
            <div>
              <h1 className="font-display font-bold text-4xl sm:text-5xl tracking-tight lowercase">
                your bag 💰
              </h1>
              <p className="mt-2 text-muted">
                Your live on-chain wallet — SOL and every token, valued in real time.
              </p>
            </div>
            {authenticated && (
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-solis">
                <span className="h-2 w-2 rounded-full bg-solis animate-pulse" />
                Live
              </span>
            )}
          </div>

          <div className="mt-8">
            {!ready ? (
              <div className="h-48 rounded-2xl bg-surface/40 animate-pulse" />
            ) : authenticated && owner ? (
              <PortfolioPositions owner={owner} />
            ) : (
              <div className="rounded-2xl border border-line bg-surface/60 p-10 text-center">
                <div className="text-xl font-bold text-white">Sign in to see your bag</div>
                <p className="mt-2 text-sm text-muted">
                  Connect with Google and your on-chain SOL + tokens load here,
                  valued live.
                </p>
                <div className="mt-5">
                  <Button onClick={() => login()}>Sign in</Button>
                </div>
              </div>
            )}
          </div>

          {authenticated && (
            <p className="mt-4 text-center text-xs text-faint">
              Want to trade?{" "}
              <Link href="/trade" className="text-solis font-semibold hover:underline">
                Open the trade desk →
              </Link>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
