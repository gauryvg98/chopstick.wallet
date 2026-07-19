import { redirect } from "next/navigation";

// Land on whatever is #1 trending right now, not a fixed token. Falls back to JUP
// if the feed can't be reached, so the page always resolves to a real token.
// Redirect so the workspace always lives under /trade/[address] and never remounts
// when you click between tokens.
const FALLBACK_TOKEN = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";

async function topTrending(): Promise<string> {
  const base = process.env.NEXT_PUBLIC_API_BASE;
  if (!base) return FALLBACK_TOKEN;
  try {
    const res = await fetch(`${base}/api/discover`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return FALLBACK_TOKEN;
    const data = await res.json();
    const top = data?.trending?.[0]?.address;
    return typeof top === "string" && top ? top : FALLBACK_TOKEN;
  } catch {
    return FALLBACK_TOKEN;
  }
}

export default async function TradePage() {
  redirect(`/trade/${await topTrending()}`);
}
