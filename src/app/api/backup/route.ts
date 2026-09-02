import { getSession } from "@/lib/auth";
import { atLeast } from "@/lib/roles";
import { raw } from "@/db/raw";
import { touchBackupAt } from "@/db/queries";

// Route đụng DB → runtime Node, không Edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Thứ tự KHÔNG quan trọng khi xuất, nhưng quan trọng khi nạp lại — xem
 * scripts/restore-from-json.ts. Danh sách là hằng số trong mã nguồn, không
 * phải dữ liệu người dùng, nên nội suy thẳng vào SQL ở đây là an toàn.
 */
const TABLES = [
  "users",
  "customers",
  "packages",
  "inventory",
  "orders",
  "order_items",
  "order_packages",
  "photos",
  "order_status_history",
  "cny_ledger",
  "expenses",
  "payments",
  "settings",
  "deletion_log",
] as const;

export async function GET() {
  const session = await getSession();
  if (!session) {
    return new Response("Chưa đăng nhập", { status: 401 });
  }
  // Bản sao lưu chứa cả 13 bảng, gồm thông tin khách và toàn bộ số liệu tiền.
  // Owner-only (v8-C) — trước đó ai đăng nhập cũng tải được.
  if (!atLeast(session.role, "owner")) {
    return new Response("Chỉ Owner mới tải được bản sao lưu", { status: 403 });
  }

  const tables: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    tables[t] = await raw.all(`SELECT * FROM ${t}`);
  }

  await touchBackupAt();

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;

  const body = JSON.stringify(
    { version: 1, exportedAt: now.toISOString(), tables },
    null,
    2,
  );

  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="heyp-backup-${stamp}.json"`,
      "cache-control": "no-store",
    },
  });
}
