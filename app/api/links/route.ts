import { getDeps } from "@/lib/deps";
import { clientIp, handle, limited } from "@/lib/http";
import { ServiceError, createLink } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    if (limited(`create:${clientIp(req)}`, 20, 60 * 60_000)) throw new ServiceError(429, "Too many links created from this connection. Try again later.");
    const body = await req.json().catch(() => null);
    return { link: await createLink(getDeps(), body) };
  }, 201);
}
