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
    // Pooler tắc thì thà báo lỗi nhanh còn hơn treo cả trang: mặc định của
    // postgres.js là 30s, quá dài cho một trang web.
    connect_timeout: 10,
    // KHÔNG dựa vào option này để chống connection mồ côi trên production.
    // Đo thực tế ngày 01/09: kết nối qua Supavisor transaction pooler (6543,
    // đúng cổng production) với option này thì `SHOW statement_timeout` vẫn
    // trả 2min — pooler chế độ transaction KHÔNG truyền tham số khởi tạo của
    // client xuống server connection. Option chỉ có tác dụng khi đi đường
    // session pooler / direct (các script chạy bằng DIRECT_URL).
    //
    // Bảo vệ thật nằm ở mức ROLE, xem drizzle/0004_db_guardrails.sql.
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
