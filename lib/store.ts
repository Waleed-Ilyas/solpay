import type { CurrencyCode } from "./config";

export type LinkRow = {
  id: string;
  merchant: string;
  label: string;
  memo: string | null;
  /** Base units: lamports for SOL, micro-USDC for USDC. */
  amount: bigint;
  currency: CurrencyCode;
  /** A fresh random public key that is attached to the payment so it can be found on chain. */
  reference: string;
  status: "pending" | "paid";
  signature: string | null;
  payer: string | null;
  paidAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
};

export type NewLink = Omit<LinkRow, "status" | "signature" | "payer" | "paidAt">;

export type MerchantTotals = Record<CurrencyCode, { count: number; volume: bigint }>;

/** Everything the service needs from a database, so it can run against Postgres in production and memory in tests. */
export type LinkStore = {
  create(link: NewLink): Promise<LinkRow>;
  get(id: string): Promise<LinkRow | null>;
  /** Marks a pending link paid exactly once. Returns the row, or null if it was not pending. */
  markPaid(id: string, signature: string, payer: string, paidAt: Date): Promise<LinkRow | null>;
  listByMerchant(merchant: string, limit: number, offset: number): Promise<{ rows: LinkRow[]; total: number }>;
  totals(merchant: string): Promise<MerchantTotals>;
  countCreatedSince(merchant: string, since: Date): Promise<number>;
};

export const emptyTotals = (): MerchantTotals => ({ SOL: { count: 0, volume: 0n }, USDC: { count: 0, volume: 0n } });
