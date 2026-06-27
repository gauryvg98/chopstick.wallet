import type { Metadata } from "next";
import { TradeHeader } from "@/components/trade/TradeHeader";
import { TradeGrid } from "@/components/trade/TradeGrid";
import { ActiveTokenProvider } from "@/lib/activeToken";
import { SidebarProvider } from "@/lib/tradeSidebar";

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
      <SidebarProvider>
        <div className="flex h-[100dvh] flex-col bg-ink overflow-hidden">
          <TradeHeader />
          {/* Collapsible left panel + workspace that resizes to fill it. */}
          <TradeGrid>{children}</TradeGrid>
        </div>
      </SidebarProvider>
    </ActiveTokenProvider>
  );
}
