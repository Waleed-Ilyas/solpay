import { Keypair } from "@solana/web3.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { limited, resetLimits } from "@/lib/http";
import { createMemoryStore } from "@/lib/memoryStore";
import {
  CHECK_INTERVAL_MS,
  ServiceError,
  checkStatus,
  createLink,
  effectiveStatus,
  getLink,
  merchantDashboard,
  resetCheckCache,
  type Deps,
} from "@/lib/service";
import type { ChainVerifier } from "@/lib/verify";

const merchant = Keypair.generate().publicKey.toBase58();
const valid = { merchant, amount: "1.5", currency: "SOL", label: "Coffee order", memo: "table 4" };

function setup(clock = { t: Date.parse("2026-01-01T00:00:00Z") }) {
  const found = { current: null as null | { signature: string; payer: string } };
  const verifier: ChainVerifier = { find: vi.fn(async () => found.current) };
  let n = 0;
  const deps: Deps = {
    store: createMemoryStore(),
    verifier,
    now: () => new Date(clock.t),
    newId: () => `id${++n}`,
    newReference: () => Keypair.generate().publicKey.toBase58(),
  };
  return { deps, verifier, found, clock };
}

beforeEach(() => {
  resetCheckCache();
  resetLimits();
});

describe("createLink", () => {
  it("creates a pending link with exact units, a fresh reference and a one hour deadline", async () => {
    const { deps } = setup();
    const link = await createLink(deps, valid);
    expect(link).toMatchObject({ id: "id1", merchant, amountUnits: "1500000000", amount: "1.5", currency: "SOL", status: "pending", label: "Coffee order" });
    expect(new Date(link.expiresAt).getTime() - new Date(link.createdAt).getTime()).toBe(3_600_000);
    expect(link.payUrl).toContain(`solana:${merchant}?amount=1.5`);
    expect(link.payUrl).toContain(`reference=${link.reference}`);
  });

  it("gives every link its own reference", async () => {
    const { deps } = setup();
    const a = await createLink(deps, valid);
    const b = await createLink(deps, valid);
    expect(a.reference).not.toBe(b.reference);
  });

  it("reports every wrong field at once, including the amount", async () => {
    const { deps } = setup();
    const err = await createLink(deps, { merchant: "nope", amount: "abc", currency: "SOL", label: "" }).catch((e) => e);
    expect(err).toBeInstanceOf(ServiceError);
    expect(err.status).toBe(400);
    expect(Object.keys(err.fields).sort()).toEqual(["amount", "label", "merchant"]);
  });

  it("reports an unknown currency, since the amount limits depend on it", async () => {
    const { deps } = setup();
    const err = await createLink(deps, { ...valid, currency: "EUR" }).catch((e) => e);
    expect(err.status).toBe(400);
    expect(Object.keys(err.fields)).toEqual(["currency"]);
  });

  it("applies the currency limits and decimal rules", async () => {
    const { deps } = setup();
    for (const amount of ["0", "0.0001", "101", "1.1234567891"])
      await expect(createLink(deps, { ...valid, amount }), amount).rejects.toMatchObject({ status: 400 });
    await expect(createLink(deps, { ...valid, currency: "USDC", amount: "0.001" })).rejects.toMatchObject({ status: 400 });
    expect((await createLink(deps, { ...valid, currency: "USDC", amount: "19.99" })).amountUnits).toBe("19990000");
  });

  it("rejects non-objects and oversize text", async () => {
    const { deps } = setup();
    for (const body of [null, "x", 5, []]) await expect(createLink(deps, body)).rejects.toMatchObject({ status: 400 });
    await expect(createLink(deps, { ...valid, label: "x".repeat(61) })).rejects.toMatchObject({ status: 400 });
    await expect(createLink(deps, { ...valid, memo: "x".repeat(61) })).rejects.toMatchObject({ status: 400 });
  });

  it("limits how many links one wallet can create per hour", async () => {
    const { deps, clock } = setup();
    for (let i = 0; i < 30; i++) await createLink(deps, valid);
    await expect(createLink(deps, valid)).rejects.toMatchObject({ status: 429 });
    clock.t += 3_600_001;
    await expect(createLink(deps, valid)).resolves.toBeTruthy();
  });
});

describe("getLink and expiry", () => {
  it("returns 404 for an unknown id", async () => {
    await expect(getLink(setup().deps, "missing")).rejects.toMatchObject({ status: 404 });
  });

  it("reports a pending link as expired after its deadline, without a background job", async () => {
    const { deps, clock } = setup();
    const link = await createLink(deps, valid);
    clock.t += 3_600_001;
    expect((await getLink(deps, link.id)).status).toBe("expired");
  });

  it("effectiveStatus never expires a paid link", () => {
    const base = { status: "paid", expiresAt: new Date(0) } as never;
    expect(effectiveStatus(base, new Date())).toBe("paid");
  });
});

describe("checkStatus", () => {
  it("stays pending while the chain shows no payment", async () => {
    const { deps } = setup();
    const link = await createLink(deps, valid);
    expect((await checkStatus(deps, link.id)).status).toBe("pending");
  });

  it("marks the link paid with the signature and payer once the chain shows the payment", async () => {
    const { deps, found, clock } = setup();
    const link = await createLink(deps, valid);
    await checkStatus(deps, link.id);
    found.current = { signature: "5igSig", payer: "PayerKey" };
    clock.t += CHECK_INTERVAL_MS + 1;
    const paid = await checkStatus(deps, link.id);
    expect(paid).toMatchObject({ status: "paid", signature: "5igSig", payer: "PayerKey" });
    expect(paid.paidAt).not.toBeNull();
  });

  it("passes the merchant, reference, amount and currency to the verifier, nothing from the caller", async () => {
    const { deps, verifier } = setup();
    const link = await createLink(deps, { ...valid, currency: "USDC", amount: "25" });
    await checkStatus(deps, link.id);
    expect(verifier.find).toHaveBeenCalledWith({ recipient: merchant, reference: link.reference, amount: 25_000_000n, currency: "USDC" });
  });

  it("does not query the chain more than once per window", async () => {
    const { deps, verifier, clock } = setup();
    const link = await createLink(deps, valid);
    for (let i = 0; i < 5; i++) await checkStatus(deps, link.id);
    expect(verifier.find).toHaveBeenCalledTimes(1);
    clock.t += CHECK_INTERVAL_MS + 1;
    await checkStatus(deps, link.id);
    expect(verifier.find).toHaveBeenCalledTimes(2);
  });

  it("stops asking the chain once paid, and keeps the first signature", async () => {
    const { deps, verifier, found, clock } = setup();
    const link = await createLink(deps, valid);
    found.current = { signature: "first", payer: "P" };
    await checkStatus(deps, link.id);
    found.current = { signature: "second", payer: "P" };
    clock.t += 10_000;
    const again = await checkStatus(deps, link.id);
    expect(again.signature).toBe("first");
    expect(verifier.find).toHaveBeenCalledTimes(1);
  });

  it("still records a payment that lands just after the link expired", async () => {
    const { deps, found, clock } = setup();
    const link = await createLink(deps, valid);
    clock.t += 3_600_001;
    found.current = { signature: "late", payer: "P" };
    expect((await checkStatus(deps, link.id)).status).toBe("paid");
  });

  it("returns 404 for an unknown link", async () => {
    await expect(checkStatus(setup().deps, "nope")).rejects.toMatchObject({ status: 404 });
  });
});

describe("merchantDashboard", () => {
  it("lists newest first, paginates, and totals only paid links per currency", async () => {
    const { deps, found, clock } = setup();
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) {
      clock.t += 1000;
      ids.push((await createLink(deps, { ...valid, amount: "1", currency: i % 2 ? "USDC" : "SOL", label: `Order ${i}` })).id);
    }
    // pay two SOL links (ids[0], ids[2]) and one USDC link (ids[1])
    for (const id of [ids[0]!, ids[2]!, ids[1]!]) {
      found.current = { signature: `sig-${id}`, payer: "P" };
      clock.t += 5000;
      await checkStatus(deps, id);
    }
    const first = await merchantDashboard(deps, merchant, 1);
    expect(first).toMatchObject({ page: 1, pages: 2, total: 12 });
    expect(first.links).toHaveLength(10);
    expect(first.links[0]!.label).toBe("Order 11");
    expect(first.totals).toEqual({ SOL: { count: 2, volume: "2000000000" }, USDC: { count: 1, volume: "1000000" } });
    expect((await merchantDashboard(deps, merchant, 2)).links).toHaveLength(2);
  });

  it("only shows the requested merchant's links and rejects bad addresses", async () => {
    const { deps } = setup();
    await createLink(deps, valid);
    const stranger = Keypair.generate().publicKey.toBase58();
    expect((await merchantDashboard(deps, stranger, 1)).total).toBe(0);
    await expect(merchantDashboard(deps, "not-an-address", 1)).rejects.toMatchObject({ status: 400 });
  });

  it("treats a nonsense page as page 1", async () => {
    const { deps } = setup();
    expect((await merchantDashboard(deps, merchant, Number.NaN)).page).toBe(1);
    expect((await merchantDashboard(deps, merchant, -4)).page).toBe(1);
  });
});

describe("rate limiter", () => {
  it("blocks after the limit and recovers after the window", () => {
    expect(limited("a", 2, 1000, 0)).toBe(false);
    expect(limited("a", 2, 1000, 1)).toBe(false);
    expect(limited("a", 2, 1000, 2)).toBe(true);
    expect(limited("a", 2, 1000, 1500)).toBe(false);
    expect(limited("b", 2, 1000, 2)).toBe(false);
  });
});
