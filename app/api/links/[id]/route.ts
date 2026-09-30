import { getDeps } from "@/lib/deps";
import { handle } from "@/lib/http";
import { getLink } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => ({ link: await getLink(getDeps(), id) }));
}
