import { emptyTotals, type LinkRow, type LinkStore } from "./store";

/** In-memory store for tests and for running the app without a database. Data is lost on restart. */
export function createMemoryStore(): LinkStore {
  const rows = new Map<string, LinkRow>();
  return {
    async create(link) {
      if ([...rows.values()].some((r) => r.reference === link.reference)) throw new Error("duplicate reference");
      const row: LinkRow = { ...link, status: "pending", signature: null, payer: null, paidAt: null };
      rows.set(row.id, row);
      return { ...row };
    },
    async get(id) {
      const r = rows.get(id);
      return r ? { ...r } : null;
    },
    async markPaid(id, signature, payer, paidAt) {
      const r = rows.get(id);
      if (!r || r.status !== "pending") return null;
      Object.assign(r, { status: "paid", signature, payer, paidAt });
      return { ...r };
    },
    async listByMerchant(merchant, limit, offset) {
      const all = [...rows.values()].filter((r) => r.merchant === merchant).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return { rows: all.slice(offset, offset + limit).map((r) => ({ ...r })), total: all.length };
    },
    async totals(merchant) {
      const t = emptyTotals();
      for (const r of rows.values()) {
        if (r.merchant !== merchant || r.status !== "paid") continue;
        t[r.currency].count += 1;
        t[r.currency].volume += r.amount;
      }
      return t;
    },
    async countCreatedSince(merchant, since) {
      return [...rows.values()].filter((r) => r.merchant === merchant && r.createdAt >= since).length;
    },
  };
}
