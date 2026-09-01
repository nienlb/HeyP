import { hasValidSessionCookie } from "@/lib/auth";
import { raw } from "@/db/raw";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type HealthReport = {
  /** Cookie phiên còn hợp lệ không (chỉ kiểm chữ ký, không đọc DB). */
  session: "ok" | "expired";
  /** DB có trả lời trong hạn không. */
  db: "ok" | "error";
};

/**
 * Điểm chẩn đoán cho watchdog của UI: khi màn hình quay lâu bất thường, client
 * gọi route này để biết NÊN BÁO GÌ cho người dùng — đăng nhập lại, hay chờ /
 * tải lại vì máy chủ bận.
 *
 * KHÔNG yêu cầu đăng nhập, và đó là điều kiện để nó dùng được: nếu bắt buộc
 * có phiên thì lúc phiên hết hạn nó sẽ trả 401 hoặc redirect, đúng lúc cần nó
 * nhất thì lại không nói được gì. Thứ nó tiết lộ chỉ là "cookie của bạn còn
 * hợp lệ không" và "DB có sống không" — không có dữ liệu nghiệp vụ nào.
 *
 * Thứ tự kiểm có chủ đích: kiểm cookie TRƯỚC (thuần CPU, luôn xong), rồi mới
 * ping DB. Ngược lại thì DB kẹt sẽ nuốt luôn phần trả lời về phiên.
 */
export async function GET(): Promise<Response> {
  const session = (await hasValidSessionCookie()) ? "ok" : "expired";

  let db: HealthReport["db"] = "ok";
  try {
    await raw.get<{ ok: number }>("SELECT 1 AS ok");
  } catch {
    // Nuốt lỗi có chủ đích: giá trị của route này là LUÔN trả lời được.
    // Ném lỗi ra ngoài thì client chỉ thấy request hỏng và mất luôn phần
    // thông tin về phiên vừa lấy được ở trên.
    db = "error";
  }

  const report: HealthReport = { session, db };
  return Response.json(report, {
    headers: { "cache-control": "no-store" },
  });
}
