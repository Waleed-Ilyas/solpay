import { toUrlAmount } from "./amount";
import { usdcMint, type CurrencyCode } from "./config";

/** Fields of a Solana Pay transfer request. See https://docs.solanapay.com/spec */
export type TransferRequest = {
  recipient: string;
  amount: bigint;
  currency: CurrencyCode;
  reference: string;
  label?: string;
  message?: string;
  memo?: string;
};

/**
 * Builds `solana:<recipient>?amount=..&spl-token=..&reference=..&label=..&message=..&memo=..`.
 * A wallet that scans this as a QR code knows exactly what to send and which reference key to attach.
 * `spl-token` is left out for SOL, and the amount is a plain decimal in whole tokens, as the spec requires.
 */
export function buildPayUrl(r: TransferRequest): string {
  const q = new URLSearchParams();
  q.set("amount", toUrlAmount(r.amount, r.currency));
  if (r.currency === "USDC") q.set("spl-token", usdcMint());
  q.set("reference", r.reference);
  if (r.label) q.set("label", r.label);
  if (r.message) q.set("message", r.message);
  if (r.memo) q.set("memo", r.memo);
  return `solana:${r.recipient}?${q.toString().replace(/\+/g, "%20")}`;
}

/** Reads a transfer request back out of a URL. Used by tests and by the paying-wallet simulator. */
export function parsePayUrl(url: string): {
  recipient: string;
  amount: string;
  splToken?: string;
  reference: string;
  label?: string;
  message?: string;
  memo?: string;
} {
  if (!url.startsWith("solana:")) throw new Error("Not a Solana Pay URL.");
  const [recipient = "", query = ""] = url.slice("solana:".length).split("?");
  const q = new URLSearchParams(query);
  const get = (k: string) => q.get(k) ?? undefined;
  const amount = get("amount");
  const reference = get("reference");
  if (!recipient || !amount || !reference) throw new Error("The URL is missing a recipient, amount or reference.");
  return { recipient, amount, reference, splToken: get("spl-token"), label: get("label"), message: get("message"), memo: get("memo") };
}
