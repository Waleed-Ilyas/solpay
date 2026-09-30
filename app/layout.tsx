import type { Metadata } from "next";
import Link from "next/link";
import { Instrument_Serif, Geist, JetBrains_Mono } from "next/font/google";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./globals.css";
import { DevnetBanner } from "@/components/DevnetBanner";
import { Providers } from "@/components/Providers";

const instrument = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument", display: "swap" });
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: "SolPay Checkout | Solana Pay links on devnet",
  description: "Create a payment link for SOL or USDC, share the QR code, and watch it confirm live on Solana devnet. Includes a merchant dashboard.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${instrument.variable} ${geist.variable} ${jetbrains.variable}`}>
      <body>
        <Providers>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-elevated focus:px-4 focus:py-2"
          >
            Skip to content
          </a>
          <DevnetBanner />
          <header className="border-b border-line">
            <div className="wrap flex h-16 items-center gap-6">
              <Link href="/" className="display text-2xl italic">
                SolPay
              </Link>
              <nav aria-label="Primary" className="flex gap-5 text-sm text-ink-2">
                <Link href="/" className="hover:text-ink">
                  Create link
                </Link>
                <Link href="/dashboard" className="hover:text-ink">
                  Dashboard
                </Link>
              </nav>
            </div>
          </header>
          <div id="main">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
