// Creates the tables. Safe to run more than once.
//   DATABASE_URL=postgresql://... pnpm migrate      (or put DATABASE_URL in .env)
import { neon } from "@neondatabase/serverless";
import { MIGRATIONS } from "../lib/schema.ts";

try {
  process.loadEnvFile(".env");
} catch {
  /* no .env file, rely on the environment */
}
const url = process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL first.");

const sql = neon(url);
for (const statement of MIGRATIONS) await sql.query(statement);
const [{ n }] = (await sql.query("select count(*)::int as n from solpay_links")) as { n: number }[];
console.log(`Schema is ready. solpay_links has ${n} row${n === 1 ? "" : "s"}.`);
