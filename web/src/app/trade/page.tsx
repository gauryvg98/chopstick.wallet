import { redirect } from "next/navigation";

// Default to BONK — an iconic Solana memecoin with full market data. Redirect so
// the workspace always lives under /trade/[address] and never remounts when you
// click between tokens.
const DEFAULT_TOKEN = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

export default function TradePage() {
  redirect(`/trade/${DEFAULT_TOKEN}`);
}
