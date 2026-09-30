"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";
import { formatAmount } from "@/lib/amount";
import { CURRENCIES, explorerAddress, explorerTx, shorten, usdcMint } from "@/lib/config";
import type { PublicLink } from "@/lib/service";
import { paymentInstructions } from "@/lib/walletTx";
import { CopyButton } from "./CopyButton";
import { StatusBadge } from "./StatusBadge";

const POLL_MS = 3000;

function friendly(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/reject|denied|cancel|declin/i.test(m)) return "You cancelled the payment in your wallet. Nothing was sent.";
  if (/insufficient|0x1\b|debit an account|attempt to debit/i.test(m)) return "Your wallet does not have enough for this payment plus the network fee.";
  if (/429|rate limit|too many requests/i.test(m)) return "The public devnet RPC is busy. Wait a few seconds and try again.";
  return m.length > 180 ? `${m.slice(0, 180)}…` : m;
}

function useCountdown(expiresAt: string, active: boolean) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!active) return;
    const tick = () => setLeft(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt, active]);
  return left;
}

export function PayPanel({ initial }: { initial: PublicLink }) {
  const [link, setLink] = useState(initial);
  const [qr, setQr] = useState("");
  const [checkError, setCheckError] = useState(false);
  const [wallet, setWallet] = useState<{ state: "idle" | "signing" | "sent" | "error"; message?: string }>({ state: "idle" });
  const [airdrop, setAirdrop] = useState<{ busy: boolean; note?: string; ok?: boolean }>({ busy: false });
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const pending = link.status === "pending";
  const left = useCountdown(link.expiresAt, pending);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    QRCode.toDataURL(link.payUrl, { margin: 1, width: 320, errorCorrectionLevel: "M", color: { dark: "#07080c", light: "#ffffff" } }).then(setQr, () =>
      setQr(""),
    );
  }, [link.payUrl]);

  // The page never decides a payment happened. It asks the server, which checks the chain, and shows what comes back.
  const check = useCallback(async () => {
    try {
      const res = await fetch(`/api/links/${link.id}/status`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setLink((await res.json()).link);
      setCheckError(false);
    } catch {
      setCheckError(true);
    }
  }, [link.id]);

  useEffect(() => {
    if (!pending) return;
    check();
    timer.current = window.setInterval(check, POLL_MS);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [pending, check]);

  const payWithWallet = async () => {
    if (!publicKey) return;
    setWallet({ state: "signing" });
    try {
      if (link.currency === "USDC") {
        const mint = new PublicKey(usdcMint());
        const { getAssociatedTokenAddressSync } = await import("@solana/spl-token");
        const ata = getAssociatedTokenAddressSync(mint, publicKey);
        const bal = await connection.getTokenAccountBalance(ata).catch(() => null);
        if (!bal || BigInt(bal.value.amount) < BigInt(link.amountUnits))
          throw new Error("You do not have enough devnet USDC. Get some at faucet.circle.com, then try again.");
      }
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({ feePayer: publicKey, blockhash, lastValidBlockHeight }).add(
        ...paymentInstructions(link, publicKey, new PublicKey(usdcMint())),
      );
      await sendTransaction(tx, connection);
      setWallet({ state: "sent" });
      check();
    } catch (e) {
      setWallet({ state: "error", message: friendly(e) });
    }
  };

  const requestAirdrop = async () => {
    if (!publicKey) return;
    setAirdrop({ busy: true });
    try {
      const sig = await connection.requestAirdrop(publicKey, LAMPORTS_PER_SOL);
      const bh = await connection.getLatestBlockhash("confirmed");
      await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
      setAirdrop({ busy: false, ok: true, note: "1 devnet SOL added to your wallet." });
    } catch {
      setAirdrop({ busy: false, ok: false, note: "The devnet faucet is rate limited right now. Try faucet.solana.com." });
    }
  };

  const amountText = `${formatAmount(BigInt(link.amountUnits), link.currency)} ${link.currency}`;
  const mins = left === null ? null : Math.floor(left / 60000);
  const secs = left === null ? null : Math.floor((left % 60000) / 1000);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <section className="card grid content-start gap-6" aria-labelledby="pay-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="label">Payment request</p>
            <h1 id="pay-title" className="display mt-2 text-4xl md:text-5xl">
              {link.label}
            </h1>
          </div>
          <StatusBadge status={link.status} />
        </div>

        <p className="display text-6xl tabular-nums md:text-7xl">{amountText}</p>

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="label">Pay to</dt>
            <dd className="mono mt-1 flex items-center gap-2 break-all">
              <a className="hover:text-accent" href={explorerAddress(link.merchant)} target="_blank" rel="noopener noreferrer">
                {shorten(link.merchant, 6, 6)}
              </a>
              <CopyButton value={link.merchant} />
            </dd>
          </div>
          {link.memo && (
            <div>
              <dt className="label">Note</dt>
              <dd className="mt-1">{link.memo}</dd>
            </div>
          )}
          <div>
            <dt className="label">Network</dt>
            <dd className="mt-1">Solana devnet ({CURRENCIES[link.currency].label})</dd>
          </div>
        </dl>

        <div role="status" aria-live="polite" className="min-h-6 text-sm">
          {link.status === "paid" && (
            <div className="rounded-[12px] border border-accent/40 bg-accent/10 p-4">
              <p className="font-medium text-accent">Payment received. Thank you.</p>
              {link.signature && (
                <p className="mt-1 text-ink-2">
                  Confirmed on chain:{" "}
                  <a
                    className="mono underline underline-offset-4 hover:text-accent"
                    href={explorerTx(link.signature)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {shorten(link.signature, 8, 8)}
                  </a>
                  {link.payer && (
                    <>
                      {" "}
                      from <span className="mono">{shorten(link.payer, 4, 4)}</span>
                    </>
                  )}
                </p>
              )}
            </div>
          )}
          {link.status === "expired" && (
            <p className="text-danger">This link expired. Ask the merchant for a new one. If you already paid, it will still be recorded.</p>
          )}
          {pending && (
            <p className="text-ink-2">
              <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-accent align-middle" aria-hidden />
              Waiting for payment{mins !== null && secs !== null ? `, expires in ${mins}:${String(secs).padStart(2, "0")}` : ""}
              {checkError && <span className="ml-2 text-warn">Could not check just now, retrying.</span>}
            </p>
          )}
        </div>
      </section>

      <aside className="card grid content-start gap-4" aria-label="Ways to pay">
        {pending && (
          <>
            <div>
              <h2 className="font-medium">Scan with a Solana Pay wallet</h2>
              <div className="mt-3 grid place-items-center rounded-[14px] bg-white p-3">
                {qr ? (
                  <Image
                    src={qr}
                    alt={`QR code to pay ${amountText} to the merchant`}
                    width={296}
                    height={296}
                    unoptimized
                    className="h-auto w-full max-w-[296px]"
                  />
                ) : (
                  <div className="skeleton h-[296px] w-[296px]" />
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <a className="btn" href={link.payUrl}>
                  Open in wallet app
                </a>
                <CopyButton value={link.payUrl} />
              </div>
            </div>

            <div className="border-t border-line pt-4">
              <h2 className="font-medium">Or pay with a browser wallet</h2>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <WalletMultiButton />
                {publicKey && (
                  <button className="btn btn-primary" onClick={payWithWallet} disabled={wallet.state === "signing" || wallet.state === "sent"}>
                    {wallet.state === "signing" ? "Approve in your wallet…" : wallet.state === "sent" ? "Sent, confirming…" : `Pay ${amountText}`}
                  </button>
                )}
              </div>
              {wallet.state === "error" && (
                <p role="alert" className="mt-2 text-sm text-danger">
                  {wallet.message}
                </p>
              )}
            </div>

            <div className="border-t border-line pt-4 text-sm text-ink-2">
              <p className="font-medium text-ink">Need devnet funds?</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {publicKey && (
                  <button className="btn" onClick={requestAirdrop} disabled={airdrop.busy}>
                    {airdrop.busy ? "Requesting…" : "Airdrop 1 devnet SOL"}
                  </button>
                )}
                <a className="underline underline-offset-4 hover:text-accent" href="https://faucet.solana.com" target="_blank" rel="noopener noreferrer">
                  SOL faucet
                </a>
                {link.currency === "USDC" && (
                  <a className="underline underline-offset-4 hover:text-accent" href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer">
                    USDC faucet
                  </a>
                )}
              </div>
              {airdrop.note && (
                <p className={`mt-2 ${airdrop.ok ? "text-accent" : "text-danger"}`} role="status">
                  {airdrop.note}
                </p>
              )}
            </div>
          </>
        )}
        {!pending && (
          <p className="text-sm text-ink-2">
            {link.status === "paid" ? "This request has been paid, so there is nothing more to do." : "This request can no longer be paid."}
          </p>
        )}
      </aside>
    </div>
  );
}
