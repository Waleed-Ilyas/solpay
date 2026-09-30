"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { formatAmount } from "@/lib/amount";
import { explorerTx, shorten } from "@/lib/config";
import type { Dashboard } from "@/lib/service";
import { DEMO_MERCHANT } from "./CreateLinkForm";
import { StatusBadge } from "./StatusBadge";

const dateFmt = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="card">
      <p className="label">{label}</p>
      <p className="display mt-2 text-4xl tabular-nums">{value}</p>
      <p className="mt-1 text-sm text-ink-3">{note}</p>
    </div>
  );
}

export function DashboardView({ initialMerchant }: { initialMerchant: string }) {
  const { publicKey } = useWallet();
  const [input, setInput] = useState(initialMerchant);
  const [merchant, setMerchant] = useState(initialMerchant);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // When a wallet connects and nothing is chosen yet, show that wallet's dashboard.
  useEffect(() => {
    if (publicKey && !merchant) {
      setInput(publicKey.toBase58());
      setMerchant(publicKey.toBase58());
    }
  }, [publicKey, merchant]);

  const load = useCallback(
    async (quiet = false) => {
      if (!merchant) return;
      if (!quiet) setLoading(true);
      try {
        const res = await fetch(`/api/merchants/${encodeURIComponent(merchant)}/links?page=${page}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Could not load the dashboard.");
        setData(json);
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load the dashboard.");
      } finally {
        setLoading(false);
      }
    },
    [merchant, page],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Keep pending payments moving: refresh quietly every 10 seconds while any link is still pending.
  const anyPending = data?.links.some((l) => l.status === "pending") ?? false;
  useEffect(() => {
    if (!anyPending) return;
    const id = window.setInterval(() => load(true), 10_000);
    return () => window.clearInterval(id);
  }, [anyPending, load]);

  const choose = (address: string) => {
    setPage(1);
    setData(null);
    setMerchant(address.trim());
    window.history.replaceState(null, "", address.trim() ? `/dashboard?merchant=${encodeURIComponent(address.trim())}` : "/dashboard");
  };

  return (
    <div>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          choose(input);
        }}
      >
        <div className="min-w-[260px] flex-1">
          <label htmlFor="merchant" className="label block">
            Merchant wallet
          </label>
          <input
            id="merchant"
            className="mono mt-1.5 min-h-11 w-full rounded-[10px] border border-line-strong bg-surface px-4 text-[14px] text-ink placeholder:text-ink-3"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste a wallet address"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <button className="btn btn-primary">Show dashboard</button>
        <WalletMultiButton />
        {DEMO_MERCHANT && (
          <button type="button" className="btn" onClick={() => (setInput(DEMO_MERCHANT), choose(DEMO_MERCHANT))}>
            Demo merchant
          </button>
        )}
      </form>

      {!merchant && (
        <p className="card mt-8 text-ink-2">Connect a wallet or paste a merchant address to see its payment links, and how much it has been paid.</p>
      )}

      {error && (
        <p role="alert" className="card mt-8 border-danger/40 text-danger">
          {error}
        </p>
      )}

      {merchant && !error && !data && (
        <div className="mt-8 grid gap-4 md:grid-cols-3" aria-busy="true" aria-label="Loading dashboard">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-28" />
          ))}
        </div>
      )}

      {data && (
        <div className="mt-8 grid gap-6">
          <section aria-label="Totals" className="grid gap-4 md:grid-cols-3">
            <Stat
              label="Received in SOL"
              value={`${formatAmount(BigInt(data.totals.SOL.volume), "SOL")} SOL`}
              note={`${data.totals.SOL.count} paid link${data.totals.SOL.count === 1 ? "" : "s"}`}
            />
            <Stat
              label="Received in USDC"
              value={`${formatAmount(BigInt(data.totals.USDC.volume), "USDC")} USDC`}
              note={`${data.totals.USDC.count} paid link${data.totals.USDC.count === 1 ? "" : "s"}`}
            />
            <Stat
              label="Payment links"
              value={String(data.total)}
              note={`${data.totals.SOL.count + data.totals.USDC.count} paid, ${data.links.filter((l) => l.status === "pending").length} waiting on this page`}
            />
          </section>

          <section className="card overflow-x-auto" aria-labelledby="hist-h">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="hist-h" className="label">
                Payment history
              </h2>
              <div className="flex gap-2">
                <button className="btn" onClick={() => load()} disabled={loading}>
                  {loading ? "Refreshing…" : "Refresh"}
                </button>
                <Link href="/" className="btn btn-primary">
                  New link
                </Link>
              </div>
            </div>
            {data.links.length === 0 ? (
              <p className="mt-6 text-ink-2">No payment links for this wallet yet. Create one and it will appear here.</p>
            ) : (
              <table className="mt-4 w-full min-w-[720px] text-left text-sm">
                <thead className="text-ink-3">
                  <tr>
                    <th className="pb-2 font-normal">For</th>
                    <th className="pb-2 text-right font-normal">Amount</th>
                    <th className="pb-2 pl-4 font-normal">Status</th>
                    <th className="pb-2 font-normal">Created</th>
                    <th className="pb-2 font-normal">Transaction</th>
                  </tr>
                </thead>
                <tbody>
                  {data.links.map((l) => (
                    <tr key={l.id} className="border-t border-line align-middle">
                      <td className="py-3">
                        <Link href={`/pay/${l.id}`} className="hover:text-accent hover:underline">
                          {l.label}
                        </Link>
                      </td>
                      <td className="py-3 text-right tabular-nums">
                        {formatAmount(BigInt(l.amountUnits), l.currency)} {l.currency}
                      </td>
                      <td className="py-3 pl-4">
                        <StatusBadge status={l.status} />
                      </td>
                      <td className="py-3 text-ink-3">{dateFmt.format(new Date(l.createdAt))}</td>
                      <td className="py-3">
                        {l.signature ? (
                          <a className="mono text-ink-2 hover:text-accent" href={explorerTx(l.signature)} target="_blank" rel="noopener noreferrer">
                            {shorten(l.signature, 6, 6)}
                          </a>
                        ) : (
                          <span className="text-ink-3">none</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {data.pages > 1 && (
              <nav aria-label="Pagination" className="mt-4 flex items-center justify-center gap-3">
                <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
                </button>
                <span className="text-sm text-ink-2">
                  Page {data.page} of {data.pages}
                </span>
                <button className="btn" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>
                  Next
                </button>
              </nav>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
