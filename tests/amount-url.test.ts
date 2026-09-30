import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { AmountError, formatAmount, parseAmount, toUrlAmount } from "@/lib/amount";
import { DEFAULT_USDC_MINT } from "@/lib/config";
import { buildPayUrl, parsePayUrl } from "@/lib/payurl";

describe("parseAmount", () => {
  it("converts SOL and USDC exactly", () => {
    expect(parseAmount("1", "SOL")).toBe(1_000_000_000n);
    expect(parseAmount("0.5", "SOL")).toBe(500_000_000n);
    expect(parseAmount("0.001", "SOL")).toBe(1_000_000n);
    expect(parseAmount("25", "USDC")).toBe(25_000_000n);
    expect(parseAmount("0.01", "USDC")).toBe(10_000n);
    expect(parseAmount("12.345678", "USDC")).toBe(12_345_678n);
  });

  it("has no floating point error", () => {
    expect(parseAmount("0.1", "SOL")).toBe(100_000_000n);
    expect(parseAmount("1.15", "USDC")).toBe(1_150_000n);
    expect(parseAmount("4.35", "USDC")).toBe(4_350_000n);
  });

  it("rejects malformed input", () => {
    for (const bad of ["", "abc", "-1", "1e3", "1,5", ".5", "5.", "1..2", "NaN", "Infinity", "0x10"])
      expect(() => parseAmount(bad, "SOL"), bad).toThrow(AmountError);
  });

  it("rejects more decimals than the currency has", () => {
    expect(() => parseAmount("1.1234567", "USDC")).toThrow(/at most 6/);
    expect(() => parseAmount("0.0000000001", "SOL")).toThrow(/at most 9/);
  });

  it("enforces the limits of each currency", () => {
    expect(() => parseAmount("0", "SOL")).toThrow(/smallest/);
    expect(() => parseAmount("0.0009", "SOL")).toThrow(/smallest/);
    expect(() => parseAmount("100.000000001", "SOL")).toThrow(/largest/);
    expect(parseAmount("100", "SOL")).toBe(100_000_000_000n);
    expect(() => parseAmount("0.009", "USDC")).toThrow(/smallest/);
    expect(() => parseAmount("10000.01", "USDC")).toThrow(/largest/);
  });
});

describe("formatAmount and toUrlAmount", () => {
  it("formats for people and for URLs", () => {
    expect(formatAmount(1_500_000_000n, "SOL")).toBe("1.5");
    expect(formatAmount(1_000_000_000n, "SOL")).toBe("1");
    expect(formatAmount(1_234_000_000_000n, "SOL")).toBe("1,234");
    expect(toUrlAmount(1_234_000_000_000n, "SOL")).toBe("1234");
    expect(toUrlAmount(1_500_000n, "USDC")).toBe("1.5");
    expect(toUrlAmount(10_000n, "USDC")).toBe("0.01");
    expect(toUrlAmount(1n, "SOL")).toBe("0.000000001");
  });
  it("round-trips through parseAmount", () => {
    for (const s of ["0.001", "0.5", "1", "99.999999999"]) expect(parseAmount(toUrlAmount(parseAmount(s, "SOL"), "SOL"), "SOL")).toBe(parseAmount(s, "SOL"));
  });
});

describe("Solana Pay URL", () => {
  const recipient = Keypair.generate().publicKey.toBase58();
  const reference = Keypair.generate().publicKey.toBase58();

  it("builds a SOL transfer request without an spl-token field", () => {
    const url = buildPayUrl({ recipient, amount: 1_500_000_000n, currency: "SOL", reference, label: "Coffee & cake", message: "Table 4", memo: "solpay:abc" });
    expect(url.startsWith(`solana:${recipient}?`)).toBe(true);
    const p = parsePayUrl(url);
    expect(p).toMatchObject({ recipient, amount: "1.5", reference, label: "Coffee & cake", message: "Table 4", memo: "solpay:abc" });
    expect(p.splToken).toBeUndefined();
  });

  it("adds the USDC mint for USDC requests", () => {
    const p = parsePayUrl(buildPayUrl({ recipient, amount: 25_000_000n, currency: "USDC", reference }));
    expect(p.splToken).toBe(DEFAULT_USDC_MINT);
    expect(p.amount).toBe("25");
  });

  it("encodes spaces as %20 and special characters safely", () => {
    const url = buildPayUrl({ recipient, amount: 1_000_000n, currency: "USDC", reference, label: "A B&C=D?E" });
    expect(url).not.toContain("+");
    expect(parsePayUrl(url).label).toBe("A B&C=D?E");
  });

  it("refuses to parse anything that is not a transfer request", () => {
    expect(() => parsePayUrl("https://example.com")).toThrow();
    expect(() => parsePayUrl(`solana:${recipient}?amount=1`)).toThrow(/missing/);
  });
});
