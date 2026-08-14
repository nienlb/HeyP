/**
 * Chuyển dữ liệu thật từ SQLite sang Postgres MỘT LẦN.
 * File DUY NHẤT còn được phép import node:sqlite.
 *
 * Giữ nguyên ID để không vỡ khoá ngoại, chèn theo thứ tự phụ thuộc,
 * rồi đặt lại sequence. Chạy trong 1 transaction — lỗi giữa đường thì
 * không để lại dữ liệu nửa vời.
 */
import { DatabaseSync } from "node:sqlite";
import postgres from "postgres";

const SQLITE_PATH = process.env.SQLITE_PATH ?? "./data/app.sqlite";
const url = process.env.DIRECT_URL;
if (!url) throw new Error("Thiếu DIRECT_URL");

// Thứ tự chèn = thứ tự phụ thuộc khoá ngoại.
const TABLES = [
  "customers",
  "orders",
  "order_items",
  "packages",
  "order_packages",
  "inventory",
  "photos",
  "order_status_history",
  "settings",
  "cny_ledger",
  "expenses",
  "payments",
] as const;

// Cột 0/1 của SQLite phải thành boolean thật của Postgres.
const BOOLEAN_COLUMNS: Record<string, string[]> = {
  customers: ["warning_flag"],
  order_items: ["cost_confirmed"],
  packages: ["needs_manual_check"],
};

const sqlite = new DatabaseSync(SQLITE_PATH, { readOnly: true });
const sql = postgres(url, { max: 1 });

let total = 0;
await sql.begin(async (tx) => {
  for (const table of TABLES) {
    const rows = sqlite.prepare(`SELECT * FROM ${table}`).all() as Record<
      string,
      unknown
    >[];
    if (rows.length === 0) {
      console.log(`${table}: 0 hàng, bỏ qua`);
      continue;
    }

    const boolCols = BOOLEAN_COLUMNS[table] ?? [];
    const converted = rows.map((r) => {
      const out: Record<string, unknown> = { ...r };
      for (const c of boolCols) {
        if (c in out) out[c] = out[c] === 1 || out[c] === true;
      }
      return out;
    });

    const columns = Object.keys(converted[0]);
    await tx`INSERT INTO ${tx(table)} ${tx(converted, ...columns)}`;
    console.log(`${table}: ${converted.length} hàng`);
    total += converted.length;
  }

  // Đặt lại sequence để INSERT sau này không đụng ID đã tồn tại.
  for (const table of TABLES) {
    if (table === "settings" || table === "order_packages") continue; // không có cột id serial
    await tx.unsafe(
      `SELECT setval(pg_get_serial_sequence('${table}', 'id'),
                     COALESCE((SELECT MAX(id) FROM ${table}), 1),
                     (SELECT MAX(id) IS NOT NULL FROM ${table}))`,
    );
  }
});

console.log(`Xong: ${total} hàng.`);
sqlite.close();
await sql.end();
