import type { Metadata } from "next";
import { DiscoverView } from "@/components/discover/DiscoverView";

export const metadata: Metadata = {
  title: "Discover",
  description:
    "Discover fresh Solana token launches, streamed live the moment they hit the chain.",
};

export default function DiscoverPage() {
  return <DiscoverView />;
}
