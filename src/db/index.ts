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
function createSqlClient() {
  return postgres(config.databaseUrl, {
    prepare: false,
    max: 5,
    idle_timeout: 20,
    // statement_timeout: khi Vercel giết function ở mốc 300s (đã tái hiện thật
    // trên production — log "Vercel Runtime Timeout Error"), connection
    // Postgres đang dở dang bị bỏ lại "mồ côi" (active, chờ ClientRead) vì
    // phía Node không còn sống để đóng nó. Connection mồ côi chiếm slot trong
    // pool dùng chung của Supavisor, khiến request sau xếp hàng rồi cũng bị
    // Postgres tự hủy vì statement_timeout mặc định (lỗi 57014) — vòng lặp
    // càng lúc càng nặng, đúng hiện tượng "lúc được lúc không". Ép timeout
    // ngắn hơn nhiều 300s để câu SQL tự chết ở Postgres trước khi Vercel kịp
    // giết cả tiến trình, không để lại connection mồ côi.
    connection: {
      statement_timeout: 15000,
    },
  });
}

/**
 * Giữ qua globalThis để sống sót qua Fast Refresh của `next dev`.
 *
 * Không có dòng này thì mỗi lần sửa một file có import (dù gián tiếp) tới
 * module này, dev server tạo POOL MỚI mà pool cũ không đóng — sau vài chục
 * lần sửa file trong một phiên dev dài, số connection tích luỹ vượt giới
 * hạn dùng chung của Supavisor free tier, gây treo request ngẫu nhiên y hệt
 * sự cố production đã ghi ở comment trên (nguyên nhân khác, triệu chứng
 * giống hệt: connection "mồ côi" chiếm slot pool). Production build không bị
 * ảnh hưởng — mỗi lần khởi động chỉ import module một lần.
 */
const globalForSql = globalThis as unknown as {
  heypSqlClient?: ReturnType<typeof createSqlClient>;
};

export const sqlClient = globalForSql.heypSqlClient ?? createSqlClient();

if (process.env.NODE_ENV !== "production") {
  globalForSql.heypSqlClient = sqlClient;
}

export const db = drizzle(sqlClient, { schema });
