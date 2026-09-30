import { DashboardView } from "@/components/DashboardView";

export const metadata = { title: "Dashboard | SolPay Checkout" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ merchant?: string }> }) {
  const { merchant } = await searchParams;
  return (
    <main className="wrap py-10 md:py-14">
      <p className="label">Merchant</p>
      <h1 className="display mt-2 mb-8 text-5xl">Payment dashboard</h1>
      <DashboardView initialMerchant={typeof merchant === "string" ? merchant : ""} />
    </main>
  );
}
