import "server-only";
import type { Sql } from "postgres";
import { sqlClient } from "./index";
import { runWithRetry } from "@/lib/db-retry";

/** Thay unixepoch() của SQLite. Nối vào chuỗi SQL, không phải tham số. */
export const NOW_EPOCH_SQL = "EXTRACT(EPOCH FROM now())::bigint";

export type Exec = {
  all<T>(text: string, params?: unknown[]): Promise<T[]>;
  get<T>(text: string, params?: unknown[]): Promise<T | undefined>;
  run(text: string, params?: unknown[]): Promise<void>;
};

/**
 * SQL thô của dự án viết placeholder kiểu SQLite (`?`); Postgres cần `$1,$2`.
 * Đổi tại chỗ để giữ nguyên văn các câu SQL nghiệp vụ đã được kiểm chứng.
 * Điều kiện dùng được: không có dấu `?` nào nằm trong chuỗi literal của SQL.
 */
function toPgPlaceholders(text: string): string {
  let i = 0;
  return text.replace(/\?/g, () => `$${++i}`);
}

/**
 * Chạy một câu, và chạy lại ĐÚNG MỘT LẦN nếu connection đứt giữa chừng.
 *
 * Vì sao cần: transaction_timeout (drizzle/0005) khiến server chủ động ngắt
 * phiên giữ transaction bỏ rơi. Pool phía client không hay biết, nên request
 * kế tiếp vớ phải socket chết và ném CONNECTION_CLOSED — người dùng thấy
 * trang lỗi cho một sự cố mà lần thử thứ hai đã qua, vì postgres-js lúc đó đã
 * loại socket hỏng và mở connection mới.
 *
 * Chỉ một lần, không vòng lặp: nếu DB thật sự chết thì thử mãi chỉ kéo dài
 * thời gian người dùng ngồi chờ rồi cũng ra lỗi. Một lần đủ phân biệt "socket
 * mồ côi" với "DB sập".
 */
async function runOnce<T>(
  client: Sql,
  text: string,
  params: unknown[],
  retryReads: boolean,
): Promise<T> {
  const pg = toPgPlaceholders(text);
  // Điều kiện được chạy lại nằm trong runWithRetry (lib/db-retry.ts) — để ở
  // module thuần vì đó là chỗ dễ sai nhất và cần test khoá.
  return runWithRetry(
    async () => (await client.unsafe(pg, params as never[])) as unknown as T,
    text,
    retryReads,
  );
}

function makeExec(client: Sql, retryReads: boolean): Exec {
  return {
    async all<T>(text: string, params: unknown[] = []): Promise<T[]> {
      return runOnce<T[]>(client, text, params, retryReads);
    },
    async get<T>(text: string, params: unknown[] = []): Promise<T | undefined> {
      const rows = await runOnce<T[]>(client, text, params, retryReads);
      return rows[0];
    },
    async run(text: string, params: unknown[] = []): Promise<void> {
      await runOnce<unknown>(client, text, params, retryReads);
    },
  };
}

export const raw: Exec = makeExec(sqlClient, true);

/**
 * Bọc transaction. Throw bên trong → tự ROLLBACK; kết thúc êm → COMMIT.
 * Mọi truy vấn bên trong PHẢI dùng `x` được truyền vào, KHÔNG dùng `raw`
 * toàn cục — dùng sai thì câu đó chạy ngoài transaction và không rollback.
 */
export async function withTx<T>(fn: (x: Exec) => Promise<T>): Promise<T> {
  // retryReads = false: xem chú thích trong runOnce — chạy lại một câu giữa
  // transaction thì câu đó rơi ra ngoài transaction, không rollback theo.
  return sqlClient.begin(async (tx) =>
    fn(makeExec(tx as unknown as Sql, false)),
  ) as Promise<T>;
}
