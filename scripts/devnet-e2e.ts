// End-to-end test on real Solana devnet. It plays the customer's wallet: it reads the `solana:` URL that the QR code
// contains (with its own tiny parser, not the app's), pays from a funded keypair, and checks that the running app
// notices. It also tries payments that must NOT count: too little, wrong recipient, and no reference.
//
//   node --experimental-strip-types scripts/devnet-e2e.ts mint      creates a test SPL token, prints its mint address
//   node --experimental-strip-types scripts/devnet-e2e.ts pay <solana: url>   pays one URL and prints the signature
//   BASE=http://localhost:3000 MERCHANT=<addr> node --experimental-strip-types scripts/devnet-e2e.ts run
//
// Environment: SOLANA_RPC_DEVNET (RPC url, never printed), DEVNET_KEYPAIR (path to a funded devnet-only keypair json),
// TEST_MINT (only for `run`: the token the app was started with as NEXT_PUBLIC_USDC_MINT).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMint,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";

const rpc = process.env.SOLANA_RPC_DEVNET;
const keyFile = process.env.DEVNET_KEYPAIR;
if (!rpc || !keyFile) throw new Error("Set SOLANA_RPC_DEVNET and DEVNET_KEYPAIR.");
const conn = new Connection(rpc, "confirmed");
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keyFile, "utf8"))));
const mode = process.argv[2];
const ok = (m: string) => console.log(`   PASS ${m}`);
const step = (m: string) => console.log(`\n== ${m}`);

if (mode === "mint") {
  const mint = await createMint(conn, payer, payer.publicKey, null, 6);
  const ata = await getOrCreateAssociatedTokenAccount(conn, payer, mint, payer.publicKey);
  await mintTo(conn, payer, mint, ata.address, payer, 1_000_000_000n);
  console.log(mint.toBase58());
  process.exit(0);
}

const BASE = process.env.BASE ?? "http://localhost:3000";
const MERCHANT = process.env.MERCHANT as string;
const TEST_MINT = process.env.TEST_MINT;

type Link = { id: string; status: string; payUrl: string; signature: string | null; payer: string | null; reference: string; amountUnits: string };
const call = async (path: string, init?: RequestInit) => {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json;
};
const createLink = async (amount: string, currency: "SOL" | "USDC", label: string): Promise<Link> =>
  (await call("/api/links", { method: "POST", body: JSON.stringify({ merchant: MERCHANT, amount, currency, label }) })).link;
const status = async (id: string): Promise<Link> => (await call(`/api/links/${id}/status`)).link;

/** A minimal wallet: read the URL, build one transfer to the recipient, attach the reference, sign and send. */
async function payFromUrl(url: string, tweak: { multiply?: number; recipient?: string; dropReference?: boolean } = {}) {
  const [, rest = ""] = url.split("solana:");
  const [recipientRaw = "", query = ""] = rest.split("?");
  const q = new URLSearchParams(query);
  const recipient = new PublicKey(tweak.recipient ?? recipientRaw);
  const reference = new PublicKey(q.get("reference")!);
  const splToken = q.get("spl-token");
  const [whole = "0", frac = ""] = q.get("amount")!.split(".");
  const decimals = splToken ? 6 : 9;
  let units = BigInt(whole + frac.padEnd(decimals, "0"));
  if (tweak.multiply) units = (units * BigInt(Math.round(tweak.multiply * 1000))) / 1000n;

  const ixs: TransactionInstruction[] = [];
  if (!splToken) {
    const ix = SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: recipient, lamports: units });
    if (!tweak.dropReference) ix.keys.push({ pubkey: reference, isSigner: false, isWritable: false });
    ixs.push(ix);
  } else {
    const mint = new PublicKey(splToken);
    const from = getAssociatedTokenAddressSync(mint, payer.publicKey);
    const to = getAssociatedTokenAddressSync(mint, recipient, true);
    const ix = createTransferCheckedInstruction(from, mint, to, payer.publicKey, units, 6);
    if (!tweak.dropReference) ix.keys.push({ pubkey: reference, isSigner: false, isWritable: false });
    ixs.push(createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, to, recipient, mint), ix);
  }
  return sendAndConfirmTransaction(conn, new Transaction().add(...ixs), [payer], { commitment: "confirmed" });
}

if (mode === "pay") {
  // Pays one `solana:` URL and prints the signature. Used to drive the browser test from outside, like a phone wallet would.
  console.log(await payFromUrl(process.argv[3]!));
  process.exit(0);
}
if (!MERCHANT) throw new Error("Set MERCHANT to the address that should be paid.");

async function waitFor(id: string, want: string, ms = 90_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const l = await status(id);
    if (l.status === want) return l;
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`Link ${id} did not reach "${want}" within ${ms / 1000}s`);
}
async function staysPending(id: string, rounds = 4) {
  for (let i = 0; i < rounds; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    assert.equal((await status(id)).status, "pending", "this payment must not be accepted");
  }
}

step("setup");
console.log(`   app ${BASE}\n   customer wallet ${payer.publicKey.toBase58()}\n   merchant ${MERCHANT}`);
console.log(`   customer balance ${(await conn.getBalance(payer.publicKey)) / LAMPORTS_PER_SOL} SOL`);

step("1. SOL: exact payment is detected");
{
  const link = await createLink("0.005", "SOL", "E2E exact SOL");
  assert.equal(link.status, "pending");
  const sig = await payFromUrl(link.payUrl);
  const paid = await waitFor(link.id, "paid");
  assert.equal(paid.signature, sig);
  assert.equal(paid.payer, payer.publicKey.toBase58());
  ok(`link paid, signature ${sig.slice(0, 12)}… matches, payer recorded`);
}

step("2. SOL: overpayment is accepted");
{
  const link = await createLink("0.005", "SOL", "E2E overpay");
  await payFromUrl(link.payUrl, { multiply: 1.2 });
  await waitFor(link.id, "paid");
  ok("paying 0.006 for a 0.005 link counts as paid");
}

step("3. SOL: underpayment is NOT accepted");
{
  const link = await createLink("0.005", "SOL", "E2E underpay");
  await payFromUrl(link.payUrl, { multiply: 0.8 });
  await staysPending(link.id);
  ok("paying 0.004 for a 0.005 link stays pending");
}

step("4. SOL: payment to the wrong recipient is NOT accepted");
{
  const link = await createLink("0.005", "SOL", "E2E wrong recipient");
  await payFromUrl(link.payUrl, { recipient: Keypair.generate().publicKey.toBase58() });
  await staysPending(link.id);
  ok("a payment that carries the reference but pays someone else stays pending");
}

step("5. SOL: payment without the reference is NOT accepted");
{
  const link = await createLink("0.005", "SOL", "E2E no reference");
  await payFromUrl(link.payUrl, { dropReference: true });
  await staysPending(link.id);
  ok("the right amount to the right merchant, but without the reference, cannot be matched");
}

if (TEST_MINT) {
  step("6. SPL token (stands in for USDC): exact payment is detected");
  {
    const link = await createLink("12.5", "USDC", "E2E token payment");
    assert.match(link.payUrl, new RegExp(`spl-token=${TEST_MINT}`));
    const sig = await payFromUrl(link.payUrl);
    const paid = await waitFor(link.id, "paid");
    assert.equal(paid.signature, sig);
    ok("token payment detected through balance changes, merchant token account created by the payer");
  }
  step("7. SPL token: underpayment is NOT accepted");
  {
    const link = await createLink("12.5", "USDC", "E2E token underpay");
    await payFromUrl(link.payUrl, { multiply: 0.9 });
    await staysPending(link.id);
    ok("paying 11.25 for a 12.5 link stays pending");
  }
}

step("dashboard");
{
  const d = await call(`/api/merchants/${MERCHANT}/links`);
  assert.ok(d.total >= 3, "merchant should have links");
  assert.ok(BigInt(d.totals.SOL.volume) >= 10_000_000n, "SOL volume should include the paid links");
  ok(`dashboard shows ${d.total} links, ${d.totals.SOL.count} paid in SOL, ${d.totals.USDC.count} paid in USDC`);
}
console.log("\nAll devnet checks passed.");
