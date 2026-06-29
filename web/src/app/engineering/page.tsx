import type { Metadata } from "next";
import { EngineeringView } from "@/components/EngineeringView";

export const metadata: Metadata = {
  title: "Engineering — ChadWallet",
  description:
    "How ChadWallet is built: the cache-first Go backend, the websocket hub, data-source routing, non-custodial swaps, the security model, and the roadmap.",
};

export default function EngineeringPage() {
  return <EngineeringView />;
}
