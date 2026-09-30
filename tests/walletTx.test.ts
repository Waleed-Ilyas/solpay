import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { paymentInstructions } from "@/lib/walletTx";

const payer = Keypair.generate().publicKey;
const merchant = Keypair.generate().publicKey;
const reference = Keypair.generate().publicKey;
const mint = Keypair.generate().publicKey;
const link = (over = {}) => ({ merchant: merchant.toBase58(), reference: reference.toBase58(), amountUnits: "1500000000", currency: "SOL" as const, ...over });

describe("paymentInstructions", () => {
  it("SOL: one system transfer with the reference attached as a read-only account", () => {
    const ixs = paymentInstructions(link(), payer, mint);
    expect(ixs).toHaveLength(1);
    const ix = ixs[0]!;
    expect(ix.programId.equals(SystemProgram.programId)).toBe(true);
    expect(ix.keys[0]!.pubkey.equals(payer)).toBe(true);
    expect(ix.keys[1]!.pubkey.equals(merchant)).toBe(true);
    const ref = ix.keys.find((k) => k.pubkey.equals(reference))!;
    expect(ref).toMatchObject({ isSigner: false, isWritable: false });
    expect(ix.data.readBigUInt64LE(4)).toBe(1_500_000_000n); // system transfer: 4 byte tag, then lamports
  });

  it("USDC: creates the merchant's token account if needed, then transferChecked with the reference", () => {
    const ixs = paymentInstructions(link({ currency: "USDC", amountUnits: "25000000" }), payer, mint);
    expect(ixs).toHaveLength(2);
    expect(ixs[0]!.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)).toBe(true);
    const to = getAssociatedTokenAddressSync(mint, merchant, true, TOKEN_PROGRAM_ID);
    const from = getAssociatedTokenAddressSync(mint, payer, false, TOKEN_PROGRAM_ID);
    const t = ixs[1]!;
    expect(t.programId.equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(t.keys[0]!.pubkey.equals(from)).toBe(true);
    expect(t.keys[2]!.pubkey.equals(to)).toBe(true);
    expect(t.keys.find((k) => k.pubkey.equals(reference))).toMatchObject({ isSigner: false, isWritable: false });
    expect(t.data[0]).toBe(12); // TransferChecked
    expect(t.data.readBigUInt64LE(1)).toBe(25_000_000n);
    expect(t.data[9]).toBe(6); // USDC decimals
  });

  it("only the payer signs", () => {
    for (const currency of ["SOL", "USDC"] as const) {
      const signers = paymentInstructions(link({ currency, amountUnits: "10000000" }), payer, mint).flatMap((i) =>
        i.keys.filter((k) => k.isSigner).map((k) => k.pubkey.toBase58()),
      );
      expect(new Set(signers)).toEqual(new Set([payer.toBase58()]));
    }
  });
});
