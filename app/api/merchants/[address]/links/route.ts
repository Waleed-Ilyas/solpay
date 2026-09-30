import { getDeps } from "@/lib/deps";
import { handle } from "@/lib/http";
import { merchantDashboard } from "@/lib/service";

export const dynamic = "force-dynamic";

// Payment links and their status are public by design: anyone can already read the same transfers on a block explorer.
export async function GET(req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const page = Number(new URL(req.url).searchParams.get("page") ?? "1");
  return handle(async () => merchantDashboard(getDeps(), address, page));
}
