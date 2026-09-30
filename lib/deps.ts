import { Connection, clusterApiUrl } from "@solana/web3.js";
import { createMemoryStore } from "./memoryStore";
import { createPgStore } from "./pgStore";
import type { Deps } from "./service";
import { createChainVerifier } from "./verify";

/** Server-side RPC. Priority: explicit URL, then Helius (if a key is set), then the public devnet endpoint. */
export function serverRpcUrl(env: Record<string, string | undefined> = process.env): string {
  if (env.SOLANA_RPC_URL) return env.SOLANA_RPC_URL;
  if (env.HELIUS_API_KEY) return `https://devnet.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`;
  return clusterApiUrl("devnet");
}

let cached: Deps | undefined;

export function getDeps(): Deps {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url && process.env.NODE_ENV === "production") throw new Error("DATABASE_URL is not set.");
  // Without DATABASE_URL (local development only) links live in memory and disappear on restart.
  cached = { store: url ? createPgStore(url) : createMemoryStore(), verifier: createChainVerifier(new Connection(serverRpcUrl(), "confirmed")) };
  return cached;
}
