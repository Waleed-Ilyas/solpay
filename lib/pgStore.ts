import { neon } from "@neondatabase/serverless";
import type { CurrencyCode } from "./config";
import { emptyTotals, type LinkRow, type LinkStore } from "./store";

type Db = {
  id: string;
  merchant: string;
  label: string;
  memo: string | null;
  amount: string;
  currency: CurrencyCode;
  reference: string;
  status: "pending" | "paid";
  signature: string | null;
  payer: string | null;
  paid_at: string | Date | null;
  created_at: string | Date;
  expires_at: string | Date;
};

const toRow = (r: Db): LinkRow => ({
  id: r.id,
  merchant: r.merchant,
  label: r.label,
  memo: r.memo,
  amount: BigInt(r.amount),
  currency: r.currency,
  reference: r.reference,
  status: r.status,
  signature: r.signature,
  payer: r.payer,
  paidAt: r.paid_at ? new Date(r.paid_at) : null,
  createdAt: new Date(r.created_at),
  expiresAt: new Date(r.expires_at),
});

/** Postgres over Neon's HTTP driver: no connection to manage, which suits serverless functions. Every query is parameterised. */
export function createPgStore(databaseUrl: string): LinkStore {
  const sql = neon(databaseUrl);
  return {
    async create(l) {
      const rows = (await sql`
        insert into solpay_links (id, merchant, label, memo, amount, currency, reference, created_at, expires_at)
        values (${l.id}, ${l.merchant}, ${l.label}, ${l.memo}, ${l.amount.toString()}, ${l.currency}, ${l.reference}, ${l.createdAt.toISOString()}, ${l.expiresAt.toISOString()})
        returning *`) as Db[];
      return toRow(rows[0]!);
    },
    async get(id) {
      const rows = (await sql`select * from solpay_links where id = ${id}`) as Db[];
      return rows[0] ? toRow(rows[0]) : null;
    },
    async markPaid(id, signature, payer, paidAt) {
      // The status check inside the UPDATE makes this safe when two requests notice the payment at once.
      const rows = (await sql`
        update solpay_links set status = 'paid', signature = ${signature}, payer = ${payer}, paid_at = ${paidAt.toISOString()}
        where id = ${id} and status = 'pending' returning *`) as Db[];
      return rows[0] ? toRow(rows[0]) : null;
    },
    async listByMerchant(merchant, limit, offset) {
      const [rows, count] = (await Promise.all([
        sql`select * from solpay_links where merchant = ${merchant} order by created_at desc limit ${limit} offset ${offset}`,
        sql`select count(*)::int as n from solpay_links where merchant = ${merchant}`,
      ])) as unknown as [Db[], { n: number }[]];
      return { rows: rows.map(toRow), total: count[0]?.n ?? 0 };
    },
    async totals(merchant) {
      const rows = (await sql`
        select currency, count(*)::int as n, coalesce(sum(amount), 0)::text as volume
        from solpay_links where merchant = ${merchant} and status = 'paid' group by currency`) as { currency: CurrencyCode; n: number; volume: string }[];
      const t = emptyTotals();
      for (const r of rows) t[r.currency] = { count: r.n, volume: BigInt(r.volume) };
      return t;
    },
    async countCreatedSince(merchant, since) {
      const rows = (await sql`select count(*)::int as n from solpay_links where merchant = ${merchant} and created_at >= ${since.toISOString()}`) as {
        n: number;
      }[];
      return rows[0]?.n ?? 0;
    },
  };
}
