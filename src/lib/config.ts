/**
 * Cấu hình toàn hệ thống — đọc từ biến môi trường, có mặc định an toàn cho local.
 * Mọi giá trị chạy được cần đổi khi lên VPS đều nằm ở đây.
 */

export type Account = { username: string; password: string };

function parseAccounts(raw: string | undefined): Account[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.indexOf(":");
      if (idx === -1) return null;
      return {
        username: pair.slice(0, idx).trim(),
        password: pair.slice(idx + 1).trim(),
      };
    })
    .filter((a): a is Account => a !== null && a.username !== "" && a.password !== "");
}

export const config = {
  databasePath: process.env.DATABASE_PATH ?? "./data/app.sqlite",
  uploadsPath: process.env.UPLOADS_PATH ?? "./uploads",
  accounts: parseAccounts(process.env.APP_ACCOUNTS),
  sessionSecret: process.env.SESSION_SECRET ?? "insecure-dev-secret-doi-di",
  staleOrderDays: Number(process.env.STALE_ORDER_DAYS ?? "7"),
  // Phase 5 — đọc ảnh chốt đơn Zalo bằng Gemini (Google AI Studio).
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-flash-latest",
} as const;

export function findAccount(username: string, password: string): Account | null {
  return (
    config.accounts.find(
      (a) => a.username === username && a.password === password,
    ) ?? null
  );
}
