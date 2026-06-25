import type { Metadata } from "next";
import { TradeHeader } from "@/components/trade/TradeHeader";
import { TradeSidebar } from "@/components/trade/TradeSidebar";
import { ActiveTokenProvider } from "@/lib/activeToken";

export const metadata: Metadata = {
  title: "Trade",
  description: "Trade any Solana token in seconds with ChadWallet.",
};

export default function TradeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Holds the displayed token in client state so clicking a row switches the
    // workspace instantly (URL syncs in the background) — shared by the sidebar
    // and the page below.
    <ActiveTokenProvider>
      <div className="flex h-[100dvh] flex-col bg-ink overflow-hidden">
        <TradeHeader />
        <div className="flex-1 min-h-0 lg:grid lg:grid-cols-[300px_minmax(0,1fr)]">
          {/* Persistent left column — lives in the layout, so it does NOT remount
              when you click between tokens (scroll, tab, live state all survive). */}
          <aside className="hidden lg:block h-full min-h-0">
            <TradeSidebar />
          </aside>
          <div className="min-h-0 h-full">{children}</div>
        </div>
      </div>
    </ActiveTokenProvider>
  );
}
