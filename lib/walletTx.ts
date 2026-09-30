import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { PublicKey, SystemProgram, type TransactionInstruction } from "@solana/web3.js";
import { CURRENCIES, type CurrencyCode } from "./config";

export type PayableLink = { merchant: string; amountUnits: string; currency: CurrencyCode; reference: string };

/**
 * The instructions a customer's wallet signs to pay a link. This mirrors what a wallet does when it scans the QR code:
 * one transfer to the merchant, with the link's reference key added to that instruction as a read-only account.
 * The reference changes nothing about the transfer. It only makes the transaction findable by that key afterwards.
 * For USDC the merchant's token account is created first if it does not exist yet, and the customer pays its rent.
 */
export function paymentInstructions(link: PayableLink, payer: PublicKey, usdcMint: PublicKey): TransactionInstruction[] {
  const merchant = new PublicKey(link.merchant);
  const reference = new PublicKey(link.reference);
  const amount = BigInt(link.amountUnits);

  if (link.currency === "SOL") {
    const ix = SystemProgram.transfer({ fromPubkey: payer, toPubkey: merchant, lamports: amount });
    ix.keys.push({ pubkey: reference, isSigner: false, isWritable: false });
    return [ix];
  }

  const from = getAssociatedTokenAddressSync(usdcMint, payer, false, TOKEN_PROGRAM_ID);
  const to = getAssociatedTokenAddressSync(usdcMint, merchant, true, TOKEN_PROGRAM_ID);
  const transfer = createTransferCheckedInstruction(from, usdcMint, to, payer, amount, CURRENCIES.USDC.decimals, [], TOKEN_PROGRAM_ID);
  transfer.keys.push({ pubkey: reference, isSigner: false, isWritable: false });
  return [createAssociatedTokenAccountIdempotentInstruction(payer, to, merchant, usdcMint, TOKEN_PROGRAM_ID), transfer];
}
