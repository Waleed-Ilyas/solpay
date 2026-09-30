import Link from "next/link";
import { PayPanel } from "@/components/PayPanel";
import { getDeps } from "@/lib/deps";
import { ServiceError, getLink } from "@/lib/service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pay | SolPay Checkout" };

export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const link = await getLink(getDeps(), id);
    return (
      <main className="wrap py-10 md:py-14">
        <PayPanel initial={link} />
      </main>
    );
  } catch (e) {
    if (!(e instanceof ServiceError && e.status === 404)) throw e;
    return (
      <main className="wrap py-20 text-center">
        <h1 className="display text-5xl">Link not found</h1>
        <p className="mt-3 text-ink-2">That payment link does not exist. Check the address, or ask the merchant for a new one.</p>
        <Link href="/" className="btn btn-primary mt-6">
          Create a payment link
        </Link>
      </main>
    );
  }
}
