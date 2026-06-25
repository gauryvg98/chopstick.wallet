import { redirect } from "next/navigation";

// Default to JUP (Jupiter) — deep liquidity and full market data on every source.
// Redirect so the workspace always lives under /trade/[address] and never remounts
// when you click between tokens.
const DEFAULT_TOKEN = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";

export default function TradePage() {
  redirect(`/trade/${DEFAULT_TOKEN}`);
}
