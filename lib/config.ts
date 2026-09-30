// Devnet only. Both currencies are described here so the form, the link, the verifier and the wallet flow agree.

/** Circle's devnet USDC. Faucet: https://faucet.circle.com */
export const DEFAULT_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

export type CurrencyCode = "SOL" | "USDC";

export type Currency = {
  code: CurrencyCode;
  label: string;
  decimals: number;
  /** Smallest and largest amount a link may ask for, in base units. */
  min: bigint;
  max: bigint;
};

export const CURRENCIES: Record<CurrencyCode, Currency> = {
  SOL: { code: "SOL", label: "SOL", decimals: 9, min: 1_000_000n, max: 100_000_000_000n }, // 0.001 to 100 SOL
  USDC: { code: "USDC", label: "USDC (devnet)", decimals: 6, min: 10_000n, max: 10_000_000_000n }, // 0.01 to 10,000 USDC
};

export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

/** The USDC mint can be overridden (for example with a test token) through NEXT_PUBLIC_USDC_MINT. */
export const usdcMint = () => process.env.NEXT_PUBLIC_USDC_MINT || DEFAULT_USDC_MINT;

/** A link can be paid for one hour after it is created. */
export const LINK_TTL_MS = 60 * 60 * 1000;

export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
export const explorerAddress = (a: string) => `https://explorer.solana.com/address/${a}?cluster=devnet`;
export const shorten = (v: string, head = 4, tail = 4) => (v.length <= head + tail + 1 ? v : `${v.slice(0, head)}…${v.slice(-tail)}`);
