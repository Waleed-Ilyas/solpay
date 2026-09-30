import type { Connection, ParsedTransactionWithMeta } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import { usdcMint, type CurrencyCode } from "./config";

export type Expected = { recipient: string; reference: string; amount: bigint; currency: CurrencyCode };
export type Verdict = { ok: true; payer: string; received: bigint } | { ok: false; reason: string };

const keyOf = (k: unknown): string => (typeof k === "string" ? k : (k as { pubkey: PublicKey | string }).pubkey.toString());

/**
 * Decides whether one confirmed transaction pays a link. Pure, so it is tested with fixtures.
 *
 * It looks at what actually happened to balances, not at instruction names, so plain transfers, transferChecked,
 * Token-2022 and wallets that add extra instructions are all judged the same way:
 *  - the transaction succeeded,
 *  - it carries the link's reference key (this ties it to this link and no other),
 *  - the recipient's balance of the right asset went up by at least the requested amount.
 * Paying more than requested is accepted, paying less is not.
 */
export function verifyTransfer(tx: ParsedTransactionWithMeta, want: Expected): Verdict {
  const meta = tx.meta;
  if (!meta) return { ok: false, reason: "The transaction has no metadata yet." };
  if (meta.err) return { ok: false, reason: "The transaction failed on chain." };

  const keys = tx.transaction.message.accountKeys.map(keyOf);
  if (!keys.includes(want.reference)) return { ok: false, reason: "The transaction does not carry this link's reference." };

  let received = 0n;
  if (want.currency === "SOL") {
    const i = keys.indexOf(want.recipient);
    if (i < 0) return { ok: false, reason: "The recipient is not part of the transaction." };
    received = BigInt(meta.postBalances[i] ?? 0) - BigInt(meta.preBalances[i] ?? 0);
  } else {
    const mint = usdcMint();
    const sum = (list: typeof meta.preTokenBalances) =>
      (list ?? []).filter((b) => b.owner === want.recipient && b.mint === mint).reduce((s, b) => s + BigInt(b.uiTokenAmount.amount), 0n);
    received = sum(meta.postTokenBalances) - sum(meta.preTokenBalances);
  }
  if (received < want.amount) return { ok: false, reason: `The recipient received ${received} base units, less than the ${want.amount} requested.` };

  const payer = keys[0];
  return { ok: true, payer: payer ?? "", received };
}

export type ChainVerifier = { find(want: Expected): Promise<{ signature: string; payer: string } | null> };

/**
 * Looks for a payment on chain: lists the transactions that mention the reference key (oldest first) and returns
 * the first one that verifies. It never trusts anything the browser says, only what the RPC reports.
 */
export function createChainVerifier(connection: Connection): ChainVerifier {
  return {
    async find(want) {
      const sigs = await connection.getSignaturesForAddress(new PublicKey(want.reference), { limit: 10 }, "confirmed");
      for (const s of [...sigs].reverse()) {
        if (s.err) continue;
        const tx = await connection.getParsedTransaction(s.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
        if (!tx) continue;
        const v = verifyTransfer(tx, want);
        if (v.ok) return { signature: s.signature, payer: v.payer };
      }
      return null;
    },
  };
}
