import Link from "next/link";
import { CreateLinkForm } from "@/components/CreateLinkForm";

const STEPS = [
  ["Create a link", "Choose SOL or USDC, an amount and what it is for. The link gets its own reference key."],
  ["Share the QR code", "Any Solana Pay wallet can scan it, or the customer can pay with a connected browser wallet."],
  ["Watch it confirm", "The page checks the chain itself and flips to paid the moment a matching payment lands."],
] as const;

export default function Home() {
  return (
    <main className="wrap py-12 md:py-20">
      <div className="grid gap-12 lg:grid-cols-[1fr_520px]">
        <div>
          <p className="label">Solana Pay checkout</p>
          <h1 className="display mt-4 text-[clamp(44px,6.4vw,84px)]">
            Get paid on Solana, <em>confirmed live</em>.
          </h1>
          <p className="mt-6 max-w-[54ch] text-lg text-ink-2">
            Create a payment link for SOL or USDC, show the QR code, and see the payment confirm on devnet in seconds. Every link has a unique reference, so a
            payment can never be mistaken for another.
          </p>
          <ol className="mt-10 grid gap-5">
            {STEPS.map(([t, b], i) => (
              <li key={t} className="grid grid-cols-[32px_1fr] gap-3">
                <span className="mono grid h-8 w-8 place-items-center rounded-full border border-line-strong text-xs text-ink-2">{i + 1}</span>
                <div>
                  <h2 className="font-medium">{t}</h2>
                  <p className="text-[15px] text-ink-2">{b}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-10 text-sm text-ink-3">
            Already a merchant?{" "}
            <Link href="/dashboard" className="underline underline-offset-4 hover:text-accent">
              Open the dashboard
            </Link>
            . Devnet only, no real money.
          </p>
        </div>
        <CreateLinkForm />
      </div>
      <footer className="mt-20 border-t border-line pt-6 text-[13px] text-ink-3">
        A personal project by{" "}
        <a
          className="text-ink-2 underline underline-offset-4 hover:text-accent"
          href="https://github.com/Waleed-Ilyas"
          target="_blank"
          rel="noopener noreferrer"
        >
          Waleed Ilyas
        </a>
        . Built on the Solana Pay transfer request spec.
      </footer>
    </main>
  );
}
