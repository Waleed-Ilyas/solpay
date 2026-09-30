import { NextResponse } from "next/server";
import { ServiceError } from "./service";

/** Runs a route body and turns every outcome into a consistent JSON response. */
export async function handle(run: () => Promise<unknown>, okStatus = 200) {
  try {
    return NextResponse.json(await run(), { status: okStatus, headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof ServiceError) return NextResponse.json({ error: e.message, ...(e.fields ? { fields: e.fields } : {}) }, { status: e.status });
    console.error("Unhandled error:", e);
    return NextResponse.json({ error: "Something went wrong on our side. Please try again." }, { status: 500 });
  }
}

const hits = new Map<string, number[]>();

/** Returns true when the caller has used up `limit` requests inside `windowMs`. In memory, so it is per server instance. */
export function limited(id: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(id) ?? []).filter((t) => now - t < windowMs);
  const over = recent.length >= limit;
  if (!over) recent.push(now);
  hits.set(id, recent);
  return over;
}

export const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
export const resetLimits = () => hits.clear();
