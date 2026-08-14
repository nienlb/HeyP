import "server-only";
import type { Sql } from "postgres";
import { sqlClient } from "./index";

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

function makeExec(client: Sql): Exec {
  return {
    async all<T>(text: string, params: unknown[] = []): Promise<T[]> {
      const rows = await client.unsafe(
        toPgPlaceholders(text),
        params as never[],
      );
      return rows as unknown as T[];
    },
    async get<T>(text: string, params: unknown[] = []): Promise<T | undefined> {
      const rows = await client.unsafe(
        toPgPlaceholders(text),
        params as never[],
      );
      return (rows as unknown as T[])[0];
    },
    async run(text: string, params: unknown[] = []): Promise<void> {
      await client.unsafe(toPgPlaceholders(text), params as never[]);
    },
  };
}

export const raw: Exec = makeExec(sqlClient);

/**
 * Bọc transaction. Throw bên trong → tự ROLLBACK; kết thúc êm → COMMIT.
 * Mọi truy vấn bên trong PHẢI dùng `x` được truyền vào, KHÔNG dùng `raw`
 * toàn cục — dùng sai thì câu đó chạy ngoài transaction và không rollback.
 */
export async function withTx<T>(fn: (x: Exec) => Promise<T>): Promise<T> {
  return sqlClient.begin(async (tx) =>
    fn(makeExec(tx as unknown as Sql)),
  ) as Promise<T>;
}
