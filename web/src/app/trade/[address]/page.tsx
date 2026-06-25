import { TradeWorkspace } from "@/components/trade/TradeWorkspace";

export default async function TradeTokenPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  return <TradeWorkspace address={address} />;
}
