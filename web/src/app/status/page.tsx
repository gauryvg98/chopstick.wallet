import type { Metadata } from "next";
import { StatusView } from "@/components/StatusView";

export const metadata: Metadata = {
  title: "System Status",
  description: "Real-time latency metrics across the SolisMarket data pipeline.",
};

export default function StatusPage() {
  return <StatusView />;
}
