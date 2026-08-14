import "server-only";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { config } from "@/lib/config";
import * as schema from "./schema";

if (!config.databaseUrl) {
  throw new Error("Thiếu DATABASE_URL — không kết nối được Postgres/Supabase");
}

/**
 * Supavisor transaction pooler (port 6543) không hỗ trợ prepared statement
 * → BẮT BUỘC prepare: false, nếu không sẽ lỗi ngẫu nhiên khi có tải.
 * max: 1 gây treo hàng chục giây khi có >1 request đồng thời trên cùng tiến
 * trình (đã tái hiện được lúc chạy `next dev` — nhiều request nội bộ của
 * Next.js xếp hàng chờ đúng 1 connection). App có 2 người dùng thật, hai
 * tab/hai người dùng cùng lúc là bình thường, không phải trường hợp hiếm —
 * để vài connection cho pool tránh nghẽn cổ chai này.
 */
export const sqlClient = postgres(config.databaseUrl, {
  prepare: false,
  max: 5,
  idle_timeout: 20,
});

export const db = drizzle(sqlClient, { schema });
