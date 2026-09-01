/**
 * Nạp ngược một bản sao lưu JSON. GHI ĐÈ toàn bộ dữ liệu hiện tại.
 *
 *   node --experimental-strip-types scripts/restore-from-json.ts file.json --toi-chac-chan
 *
 * Cờ --toi-chac-chan là bắt buộc: lệnh này xoá sạch mọi bảng trước khi nạp.
 */
import { readFile } from "node:fs/promises";
import postgres from "postgres";

const [file, confirm] = process.argv.slice(2);
if (!file || confirm !== "--toi-chac-chan") {
  console.error(
    "Dùng: node --experimental-strip-types scripts/restore-from-json.ts <file.json> --toi-chac-chan",
  );
  process.exit(1);
}

const url = process.env.DIRECT_URL;
if (!url) {
  console.error("Thiếu DIRECT_URL trong môi trường.");
  process.exit(1);
}

// Thứ tự này tôn trọng khoá ngoại: cha trước, con sau. users và deletion_log
// (v6) không có khoá ngoại tới bảng nào khác — đặt đầu/cuối tuỳ ý.
const ORDER = [
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

const dump = JSON.parse(await readFile(file, "utf8")) as {
  version: number;
  tables: Record<string, Record<string, unknown>[]>;
};
if (dump.version !== 1) {
  console.error(`Không đọc được bản sao lưu version ${dump.version}.`);
  process.exit(1);
}

// Dùng DIRECT_URL (session pooler) chứ không phải pooler transaction —
// TRUNCATE và setval cần một phiên ổn định.
const sql = postgres(url, { prepare: false });

try {
  // Xoá ngược thứ tự để không vướng khoá ngoại.
  for (const t of [...ORDER].reverse()) {
    await sql.unsafe(`TRUNCATE TABLE ${t} CASCADE`);
  }

  for (const t of ORDER) {
    const rows = dump.tables[t] ?? [];
    if (rows.length === 0) continue;
    for (const row of rows) {
      const cols = Object.keys(row);
      const holes = cols.map((_, i) => `$${i + 1}`).join(", ");
      await sql.unsafe(
        `INSERT INTO ${t} (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${holes})`,
        cols.map((c) => row[c]) as never[],
      );
    }
    console.log(`${t}: nạp ${rows.length} dòng`);
  }

  // Đặt lại bộ đếm id, nếu không thì lần INSERT tiếp theo sẽ đụng khoá chính.
  for (const t of ORDER) {
    if (t === "settings" || t === "order_packages") continue; // không có cột id
    await sql.unsafe(
      `SELECT setval(pg_get_serial_sequence('${t}', 'id'),
                     COALESCE((SELECT MAX(id) FROM ${t}), 1))`,
    );
  }

  console.log("Khôi phục xong.");
} finally {
  await sql.end();
}
