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
 * max: 1 — mỗi function instance trên Vercel chỉ xử lý 1 request một lúc, pool
 * to hơn chỉ làm cạn connection của Postgres.
 */
export const sqlClient = postgres(config.databaseUrl, {
  prepare: false,
  max: 1,
  idle_timeout: 20,
});

export const db = drizzle(sqlClient, { schema });
