import { getDeps } from "@/lib/deps";
import { clientIp, handle, limited } from "@/lib/http";
import { ServiceError, checkStatus } from "@/lib/service";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// The pay page polls this every few seconds. It is the only route that talks to the chain, so it is rate limited per caller.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    if (limited(`status:${clientIp(req)}`, 120, 60_000)) throw new ServiceError(429, "Too many status checks. Slow down for a moment.");
    return { link: await checkStatus(getDeps(), id) };
  });
}
