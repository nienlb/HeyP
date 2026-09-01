/**
 * Quyết định "câu này có được chạy lại không" khi connection chết giữa chừng.
 *
 * BỐI CẢNH: từ khi role `postgres` có transaction_timeout 60s
 * (drizzle/0005), server tự ngắt phiên giữ transaction bỏ rơi — đúng ý đồ.
 * Nhưng pool phía client (postgres-js) KHÔNG biết socket đã chết, nên request
 * kế tiếp vớ phải nó và ném CONNECTION_CLOSED. Quan sát được trong log:
 *
 *     ⨯ PostgresError: terminating connection due to transaction timeout
 *     ⨯ Error: write CONNECTION_CLOSED aws-0-...pooler.supabase.com:6543
 *
 * Chạy lại đúng MỘT lần là hết, vì lần đó postgres-js đã loại socket hỏng và
 * mở connection mới.
 *
 * Module thuần, KHÔNG import gì — để test chạy được bằng node:test (mọi thứ
 * trong src/db đều kéo theo alias @/ và "server-only", node không nạp nổi).
 */

/**
 * Chỉ những lỗi chứng tỏ connection ĐÃ THIẾT LẬP rồi mới đứt.
 *
 * Cố ý KHÔNG có CONNECTION_CONNECT_TIMEOUT: nó nghĩa là không mở nổi
 * connection trong 10s, chạy lại chỉ nhân đôi thời gian người dùng ngồi chờ
 * một thứ gần như chắc chắn hỏng tiếp.
 */
const RETRYABLE_CONNECTION_CODES = new Set([
  "CONNECTION_CLOSED",
  "CONNECTION_ENDED",
  "CONNECTION_DESTROYED",
  "ECONNRESET",
  "EPIPE",
]);

/** Lỗi này có phải "đứt dây" không (khác hẳn lỗi SQL sai, vi phạm ràng buộc…). */
export function isConnectionError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" && RETRYABLE_CONNECTION_CODES.has(code);
}

/** Bỏ chú thích và khoảng trắng đầu câu để xem câu THẬT bắt đầu bằng gì. */
function stripLeadingNoise(sql: string): string {
  let s = sql;
  for (;;) {
    const before = s;
    s = s.replace(/^\s+/, "");
    s = s.replace(/^--[^\n]*\n?/, "");
    s = s.replace(/^\/\*[\s\S]*?\*\//, "");
    if (s === before) return s;
  }
}

/**
 * Câu này chạy lại có an toàn không.
 *
 * ĐIỀU KIỆN SỐNG CÒN — tuyệt đối không nới lỏng: chỉ đúng khi câu chỉ ĐỌC.
 * Không được xét theo tên hàm gọi nó: `raw.get` nghe như đọc nhưng trong
 * queries.ts nó đang chạy `INSERT INTO photos(...) RETURNING id`. Chạy lại
 * câu đó là tạo hai dòng ảnh cho một lần tải lên. Cùng lối đó, chạy lại một
 * UPDATE trừ ví ¥ là trừ tiền hai lần.
 *
 * Cố ý thà từ chối nhầm còn hơn cho phép nhầm:
 *   - `SELECT ... FOR UPDATE` bị loại vì có chữ UPDATE. Không mất gì: câu đó
 *     chỉ dùng trong transaction, mà trong transaction thì không bao giờ retry.
 *   - SELECT có chuỗi literal chứa chữ 'update' cũng bị loại. Chỉ là bỏ lỡ một
 *     lần retry, không phải lỗi.
 */
export function isRetryableRead(sql: string): boolean {
  const s = stripLeadingNoise(sql);
  if (!/^(SELECT|WITH)\b/i.test(s)) return false;
  // WITH ... AS (INSERT ...) là câu GHI hợp lệ của Postgres — lưới này bắt nó.
  return !/\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|CALL|DO|COPY|SET|LOCK)\b/i.test(
    s,
  );
}

/**
 * Chạy `run()`, và chạy lại ĐÚNG MỘT LẦN nếu connection đứt giữa chừng.
 *
 * Tách khỏi src/db/raw.ts để test được bằng node:test: raw.ts kéo theo
 * "server-only" và alias @/, node không nạp nổi. Ở đây `run` là hàm bất kỳ,
 * nên test bơm được một hàm giả biết ném CONNECTION_CLOSED đúng một lần.
 *
 * Ba cửa phải qua hết mới được chạy lại — thiếu một là mất tiền thật:
 *   1. retryReads — trong transaction luôn false;
 *   2. lỗi phải là đứt dây, không phải lỗi SQL;
 *   3. câu phải CHỈ ĐỌC.
 *
 * Đúng một lần, không vòng lặp: một lần đủ phân biệt "socket mồ côi" với "DB
 * sập", thử mãi chỉ kéo dài thời gian người dùng ngồi chờ rồi cũng ra lỗi.
 */
export async function runWithRetry<T>(
  run: () => Promise<T>,
  sql: string,
  retryReads: boolean,
): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (!retryReads || !isConnectionError(err) || !isRetryableRead(sql)) {
      throw err;
    }
    return await run();
  }
}
