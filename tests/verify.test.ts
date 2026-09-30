import type { ParsedTransactionWithMeta } from "@solana/web3.js";
import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { DEFAULT_USDC_MINT } from "@/lib/config";
import { verifyTransfer, type Expected } from "@/lib/verify";

const k = () => Keypair.generate().publicKey.toBase58();
const payer = k();
const merchant = k();
const reference = k();
const other = k();

type Opts = { keys?: string[]; err?: unknown; pre?: number[]; post?: number[]; preTok?: unknown[]; postTok?: unknown[]; meta?: null };

/** A parsed transaction shaped like the RPC returns it, with only the fields the verifier reads. */
function tx(o: Opts = {}): ParsedTransactionWithMeta {
  const keys = o.keys ?? [payer, merchant, reference, "11111111111111111111111111111111"];
  return {
    slot: 1,
    blockTime: 1,
    version: 0,
    transaction: {
      signatures: ["sig"],
      message: {
        accountKeys: keys.map((pubkey, i) => ({ pubkey, signer: i === 0, writable: true, source: "transaction" })),
        instructions: [],
        recentBlockhash: "x",
      },
    },
    meta:
      o.meta === null
        ? null
        : {
            err: o.err ?? null,
            fee: 5000,
            preBalances: o.pre ?? [10_000_000_000, 0, 0, 1],
            postBalances: o.post ?? [8_499_995_000, 1_500_000_000, 0, 1],
            innerInstructions: [],
            logMessages: [],
            preTokenBalances: o.preTok ?? [],
            postTokenBalances: o.postTok ?? [],
            rewards: [],
          },
  } as unknown as ParsedTransactionWithMeta;
}

const sol: Expected = { recipient: merchant, reference, amount: 1_500_000_000n, currency: "SOL" };
const usdc: Expected = { recipient: merchant, reference, amount: 25_000_000n, currency: "USDC" };
const tok = (owner: string, amount: string, mint = DEFAULT_USDC_MINT) => ({
  accountIndex: 5,
  mint,
  owner,
  uiTokenAmount: { amount, decimals: 6, uiAmount: Number(amount) / 1e6, uiAmountString: "" },
});

describe("verifyTransfer, SOL", () => {
  it("accepts an exact payment and names the payer", () => {
    const v = verifyTransfer(tx(), sol);
    expect(v).toEqual({ ok: true, payer, received: 1_500_000_000n });
  });

  it("accepts an overpayment but not an underpayment", () => {
    expect(verifyTransfer(tx({ post: [7_000_000_000, 3_000_000_000, 0, 1] }), sol).ok).toBe(true);
    const under = verifyTransfer(tx({ post: [8_500_000_000, 1_499_999_999, 0, 1] }), sol);
    expect(under.ok).toBe(false);
  });

  it("rejects a transaction without the link's reference key", () => {
    const v = verifyTransfer(tx({ keys: [payer, merchant, other, "11111111111111111111111111111111"] }), sol);
    expect(v).toMatchObject({ ok: false, reason: expect.stringMatching(/reference/) });
  });

  it("rejects a failed transaction, even if balances look right", () => {
    expect(verifyTransfer(tx({ err: { InstructionError: [0, "Custom"] } }), sol)).toMatchObject({ ok: false, reason: expect.stringMatching(/failed/) });
  });

  it("rejects when the merchant is not in the transaction or nothing arrived", () => {
    expect(verifyTransfer(tx({ keys: [payer, other, reference, "11111111111111111111111111111111"] }), sol).ok).toBe(false);
    expect(verifyTransfer(tx({ post: [10_000_000_000, 0, 0, 1] }), sol).ok).toBe(false);
  });

  it("rejects a merchant who lost money instead of receiving it", () => {
    expect(verifyTransfer(tx({ pre: [0, 2_000_000_000, 0, 1], post: [1_500_000_000, 500_000_000, 0, 1] }), sol).ok).toBe(false);
  });

  it("handles a transaction whose metadata is not available yet", () => {
    expect(verifyTransfer(tx({ meta: null }), sol)).toMatchObject({ ok: false });
  });
});

describe("verifyTransfer, USDC", () => {
  it("accepts when the merchant's USDC balance rises by the amount", () => {
    const v = verifyTransfer(
      tx({ preTok: [tok(merchant, "1000000"), tok(payer, "100000000")], postTok: [tok(merchant, "26000000"), tok(payer, "75000000")] }),
      usdc,
    );
    expect(v).toMatchObject({ ok: true, payer, received: 25_000_000n });
  });

  it("works when the merchant had no USDC account before the payment", () => {
    expect(verifyTransfer(tx({ preTok: [tok(payer, "100000000")], postTok: [tok(merchant, "25000000"), tok(payer, "75000000")] }), usdc).ok).toBe(true);
  });

  it("rejects underpayment, a different token, and a different owner", () => {
    expect(verifyTransfer(tx({ postTok: [tok(merchant, "24999999")] }), usdc).ok).toBe(false);
    expect(verifyTransfer(tx({ postTok: [tok(merchant, "25000000", k())] }), usdc).ok).toBe(false);
    expect(verifyTransfer(tx({ postTok: [tok(other, "25000000")] }), usdc).ok).toBe(false);
  });

  it("does not count SOL as USDC", () => {
    expect(verifyTransfer(tx(), usdc).ok).toBe(false);
  });

  it("requires the reference here too", () => {
    expect(verifyTransfer(tx({ keys: [payer, merchant, other], postTok: [tok(merchant, "25000000")] }), usdc).ok).toBe(false);
  });
});
