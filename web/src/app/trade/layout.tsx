import type { Metadata } from "next";
import { TradeHeader } from "@/components/trade/TradeHeader";
import { TradeSidebar } from "@/components/trade/TradeSidebar";

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
  );
}
