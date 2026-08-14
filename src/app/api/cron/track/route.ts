import { getSession } from "@/lib/auth";
import { runTrackingSweep } from "@/db/queries";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Kích hoạt tra tracking (cho cron ngoài khi lên VPS, hoặc gọi tay).
 * Cho phép nếu đã đăng nhập, HOẶC có ?secret= khớp CRON_SECRET.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await getSession();
  const url = new URL(req.url);
  const secret =
    url.searchParams.get("secret") ?? req.headers.get("x-cron-secret");
  const configured = process.env.CRON_SECRET;
  const authed = Boolean(session) || (Boolean(configured) && secret === configured);
  if (!authed) return new Response("Unauthorized", { status: 401 });

  const result = await runTrackingSweep();
  return Response.json({ ok: true, ...result });
}
