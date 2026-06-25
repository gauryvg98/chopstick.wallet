import type { Metadata } from "next";
import { PortfolioView } from "@/components/PortfolioView";

export const metadata: Metadata = {
  title: "Your Bag",
  description: "Your live on-chain Solana wallet — SOL and every token, valued in real time.",
};

export default function PortfolioPage() {
  return <PortfolioView />;
}
