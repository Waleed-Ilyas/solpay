import crypto from "node:crypto";
import { Keypair, PublicKey } from "@solana/web3.js";
import { z } from "zod";
import { AmountError, formatAmount, parseAmount } from "./amount";
import { CURRENCY_CODES, LINK_TTL_MS, type CurrencyCode } from "./config";
import { buildPayUrl } from "./payurl";
import type { LinkRow, LinkStore, MerchantTotals } from "./store";
import type { ChainVerifier } from "./verify";

export class ServiceError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export type Deps = {
  store: LinkStore;
  verifier: ChainVerifier;
  now?: () => Date;
  newId?: () => string;
  newReference?: () => string;
};

const isPubkey = (v: string) => {
  try {
    return new PublicKey(v).toBase58() === v;
  } catch {
    return false;
  }
};

export const CreateSchema = z.object({
  merchant: z.string().trim().refine(isPubkey, "Enter a valid Solana wallet address."),
  amount: z.string().trim().min(1, "Enter an amount."),
  currency: z.enum(CURRENCY_CODES as [CurrencyCode, ...CurrencyCode[]], "Choose SOL or USDC."),
  label: z.string().trim().min(1, "Give the payment a name customers will recognise.").max(60, "Keep the name under 60 characters."),
  memo: z
    .string()
    .trim()
    .max(60, "Keep the note under 60 characters.")
    .optional()
    .transform((v) => v || undefined),
});

export type PublicLink = ReturnType<typeof toPublic>;

/** A pending link past its deadline is reported as expired, without needing a background job to flip it. */
export function effectiveStatus(row: LinkRow, now: Date): "pending" | "paid" | "expired" {
  if (row.status === "paid") return "paid";
  return now > row.expiresAt ? "expired" : "pending";
}

export function toPublic(row: LinkRow, now: Date) {
  return {
    id: row.id,
    merchant: row.merchant,
    label: row.label,
    memo: row.memo,
    amount: formatAmount(row.amount, row.currency).replace(/,/g, ""),
    amountUnits: row.amount.toString(),
    currency: row.currency,
    status: effectiveStatus(row, now),
    reference: row.reference,
    payUrl: buildPayUrl({
      recipient: row.merchant,
      amount: row.amount,
      currency: row.currency,
      reference: row.reference,
      label: row.label,
      message: row.label,
      memo: row.memo ?? `solpay:${row.id}`,
    }),
    signature: row.signature,
    payer: row.payer,
    paidAt: row.paidAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

const MAX_LINKS_PER_HOUR = 30;

export async function createLink(deps: Deps, input: unknown) {
  const now = (deps.now ?? (() => new Date()))();
  const parsed = CreateSchema.safeParse(input);
  const fields: Record<string, string> = {};
  if (!parsed.success) for (const i of parsed.error.issues) fields[String(i.path[0] ?? "form")] ??= i.message;
  // Check the amount on its own too, so a wrong amount is reported together with the other wrong fields.
  let units = 0n;
  const raw = (input && typeof input === "object" ? input : {}) as { amount?: unknown; currency?: unknown };
  if (typeof raw.amount === "string" && CURRENCY_CODES.includes(raw.currency as CurrencyCode)) {
    try {
      units = parseAmount(raw.amount, raw.currency as CurrencyCode);
    } catch (e) {
      fields.amount = e instanceof AmountError ? e.message : "Invalid amount.";
    }
  }
  if (!parsed.success || Object.keys(fields).length) throw new ServiceError(400, "Please check the highlighted fields.", fields);

  const { merchant, currency, label, memo } = parsed.data;
  if ((await deps.store.countCreatedSince(merchant, new Date(now.getTime() - 3_600_000))) >= MAX_LINKS_PER_HOUR) {
    throw new ServiceError(429, "This wallet created too many links in the last hour. Try again later.");
  }
  const row = await deps.store.create({
    id: (deps.newId ?? (() => crypto.randomBytes(9).toString("base64url")))(),
    merchant,
    label,
    memo: memo ?? null,
    amount: units,
    currency,
    reference: (deps.newReference ?? (() => Keypair.generate().publicKey.toBase58()))(),
    createdAt: now,
    expiresAt: new Date(now.getTime() + LINK_TTL_MS),
  });
  return toPublic(row, now);
}

export async function getLink(deps: Deps, id: string) {
  const row = await deps.store.get(id);
  if (!row) throw new ServiceError(404, "We could not find that payment link.");
  return toPublic(row, (deps.now ?? (() => new Date()))());
}

// Remembers when each link was last looked up on chain, so a page polling every few seconds costs the RPC at most one lookup per link per window.
const lastCheck = new Map<string, number>();
export const CHECK_INTERVAL_MS = 2000;
export const resetCheckCache = () => lastCheck.clear();

/**
 * Asks the chain whether a pending link has been paid, and records it if so.
 * The browser is never trusted for this: a link becomes paid only when a confirmed transaction on the RPC
 * carries its reference and delivers the requested amount to the merchant.
 */
export async function checkStatus(deps: Deps, id: string) {
  const now = (deps.now ?? (() => new Date()))();
  const row = await deps.store.get(id);
  if (!row) throw new ServiceError(404, "We could not find that payment link.");
  if (row.status === "paid") return toPublic(row, now);

  const last = lastCheck.get(id) ?? 0;
  if (now.getTime() - last < CHECK_INTERVAL_MS) return toPublic(row, now);
  lastCheck.set(id, now.getTime());

  const found = await deps.verifier.find({ recipient: row.merchant, reference: row.reference, amount: row.amount, currency: row.currency });
  if (!found) return toPublic(row, now);
  // A payment that arrived just after the link expired is still a real payment, so it is recorded rather than lost.
  const paid = (await deps.store.markPaid(id, found.signature, found.payer, now)) ?? (await deps.store.get(id));
  return toPublic(paid!, now);
}

export type Dashboard = {
  links: PublicLink[];
  page: number;
  pages: number;
  total: number;
  totals: Record<CurrencyCode, { count: number; volume: string }>;
};

export async function merchantDashboard(deps: Deps, merchant: string, page: number, limit = 10): Promise<Dashboard> {
  if (!isPubkey(merchant)) throw new ServiceError(400, "That is not a valid Solana wallet address.");
  const now = (deps.now ?? (() => new Date()))();
  const p = Math.max(1, Math.floor(page) || 1);
  const [list, totals] = await Promise.all([deps.store.listByMerchant(merchant, limit, (p - 1) * limit), deps.store.totals(merchant)]);
  const t = totals as MerchantTotals;
  return {
    links: list.rows.map((r) => toPublic(r, now)),
    page: p,
    pages: Math.max(1, Math.ceil(list.total / limit)),
    total: list.total,
    totals: { SOL: { count: t.SOL.count, volume: t.SOL.volume.toString() }, USDC: { count: t.USDC.count, volume: t.USDC.volume.toString() } },
  };
}
