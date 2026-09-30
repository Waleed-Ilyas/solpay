import { CURRENCIES, type CurrencyCode } from "./config";

export class AmountError extends Error {}

/**
 * Turns "1.5" into base units (lamports or micro-USDC) with string arithmetic, so there is no floating point
 * anywhere near money. Rejects negatives, too many decimals, and anything outside the currency's limits.
 */
export function parseAmount(input: string, code: CurrencyCode): bigint {
  const { decimals, min, max, label } = CURRENCIES[code];
  const v = input.trim();
  if (!/^\d+(\.\d+)?$/.test(v)) throw new AmountError("Enter an amount like 0.5 or 25.");
  const [whole = "0", frac = ""] = v.split(".");
  if (frac.length > decimals) throw new AmountError(`${label} allows at most ${decimals} decimal places.`);
  const units = BigInt(whole + frac.padEnd(decimals, "0"));
  if (units < min) throw new AmountError(`The smallest amount is ${formatAmount(min, code)} ${label}.`);
  if (units > max) throw new AmountError(`The largest amount is ${formatAmount(max, code)} ${label}.`);
  return units;
}

/** Base units back to a plain decimal string without trailing zeros, for example 1500000000n and SOL give "1.5". */
export function formatAmount(units: bigint, code: CurrencyCode): string {
  const { decimals } = CURRENCIES[code];
  const s = units.toString().padStart(decimals + 1, "0");
  const whole = BigInt(s.slice(0, -decimals)).toLocaleString("en-US");
  const frac = s.slice(-decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

/** The decimal string that goes in the Solana Pay URL: no grouping separators, no exponent. */
export function toUrlAmount(units: bigint, code: CurrencyCode): string {
  const { decimals } = CURRENCIES[code];
  const s = units.toString().padStart(decimals + 1, "0");
  const frac = s.slice(-decimals).replace(/0+$/, "");
  return frac ? `${s.slice(0, -decimals)}.${frac}` : s.slice(0, -decimals);
}
