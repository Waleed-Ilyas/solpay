"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { CURRENCIES, CURRENCY_CODES, type CurrencyCode } from "@/lib/config";

/** A devnet-only wallet, so anyone can try the demo without a wallet of their own. Funds sent to it have no value. */
export const DEMO_MERCHANT = process.env.NEXT_PUBLIC_DEMO_MERCHANT ?? "";

const input =
  "mono min-h-11 w-full rounded-[10px] border border-line-strong bg-surface px-4 text-[14px] text-ink placeholder:text-ink-3 focus-visible:border-accent aria-[invalid=true]:border-danger";

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="label block">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-[13px] text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

export function CreateLinkForm() {
  const router = useRouter();
  const { publicKey } = useWallet();
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("SOL");
  const [label, setLabel] = useState("");
  const [memo, setMemo] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // Fill the merchant field from a connected wallet, but never overwrite something the person typed.
  useEffect(() => {
    if (publicKey) setMerchant((m) => m || publicKey.toBase58());
  }, [publicKey]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const res = await fetch("/api/links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ merchant, amount, currency, label, memo }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return setErrors(json.fields ?? { form: json.error ?? "Could not create the link. Please try again." });
      router.push(`/pay/${json.link.id}`);
    } catch {
      setErrors({ form: "Could not reach the server. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  };

  const aria = (k: string) => ({ "aria-invalid": errors[k] ? true : undefined, "aria-describedby": errors[k] ? `${k}-error` : undefined }) as const;

  return (
    <form onSubmit={submit} noValidate className="card grid gap-5" aria-label="Create a payment link">
      <Field id="merchant" label="Merchant wallet (who gets paid)" error={errors.merchant} hint="A Solana devnet address. Connect a wallet to fill it in.">
        <input
          id="merchant"
          className={input}
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
          placeholder="Paste a wallet address"
          autoComplete="off"
          spellCheck={false}
          {...aria("merchant")}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <WalletMultiButton />
        {DEMO_MERCHANT && (
          <button type="button" className="btn" onClick={() => setMerchant(DEMO_MERCHANT)}>
            Use the demo merchant
          </button>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
        <Field
          id="amount"
          label="Amount"
          error={errors.amount}
          hint={`${CURRENCIES[currency].label}: from ${currency === "SOL" ? "0.001 to 100" : "0.01 to 10,000"}`}
        >
          <input
            id="amount"
            className={input}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={currency === "SOL" ? "0.05" : "12.50"}
            autoComplete="off"
            {...aria("amount")}
          />
        </Field>
        <fieldset>
          <legend className="label mb-1.5">Currency</legend>
          <div className="flex gap-2">
            {CURRENCY_CODES.map((c) => (
              <label key={c} className="cursor-pointer">
                <input type="radio" name="currency" value={c} checked={currency === c} onChange={() => setCurrency(c)} className="peer sr-only" />
                <span className="flex min-h-11 items-center rounded-[10px] border border-line px-4 text-sm transition-colors peer-checked:border-accent peer-checked:bg-elevated peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
                  {c}
                </span>
              </label>
            ))}
          </div>
          {errors.currency && (
            <p role="alert" className="mt-1 text-[13px] text-danger">
              {errors.currency}
            </p>
          )}
        </fieldset>
      </div>

      <Field id="label" label="What is it for?" error={errors.label} hint="Customers see this on the payment page and in their wallet.">
        <input
          id="label"
          className={input}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Coffee and a croissant"
          maxLength={70}
          autoComplete="off"
          {...aria("label")}
        />
      </Field>
      <Field id="memo" label="Note (optional)" error={errors.memo} hint="Stored on chain with the payment.">
        <input
          id="memo"
          className={input}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="Order 1042"
          maxLength={70}
          autoComplete="off"
          {...aria("memo")}
        />
      </Field>

      {errors.form && (
        <p role="alert" className="text-sm text-danger">
          {errors.form}
        </p>
      )}
      <div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Creating…" : "Create payment link"}
        </button>
      </div>
    </form>
  );
}
