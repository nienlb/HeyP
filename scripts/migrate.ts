/**
 * Chạy migration: áp dụng lần lượt các file .sql trong thư mục drizzle/,
 * ghi nhớ file đã chạy trong bảng _migrations để không chạy lại.
 *
 * Dùng node:sqlite built-in — không phụ thuộc driver native hay drizzle-kit.
 * Chạy: npm run db:migrate
 */
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const dbPath = resolve(
  process.cwd(),
  process.env.DATABASE_PATH ?? "./data/app.sqlite",
);
mkdirSync(dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON;");
db.exec(
  `CREATE TABLE IF NOT EXISTS _migrations (
     name TEXT PRIMARY KEY,
     applied_at INTEGER NOT NULL DEFAULT (unixepoch())
   );`,
);

const dir = resolve(process.cwd(), "drizzle");
const files = existsSync(dir)
  ? readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
  : [];

const appliedRows = db.prepare("SELECT name FROM _migrations").all() as {
  name: string;
}[];
const applied = new Set(appliedRows.map((r) => r.name));

let count = 0;
for (const file of files) {
  if (applied.has(file)) continue;
  const sqlText = readFileSync(join(dir, file), "utf8");
  db.exec("BEGIN");
  try {
    db.exec(sqlText);
    db.prepare("INSERT INTO _migrations(name) VALUES(?)").run(file);
    db.exec("COMMIT");
    console.log(`✓ đã áp dụng ${file}`);
    count++;
  } catch (err) {
    db.exec("ROLLBACK");
    console.error(`✗ lỗi khi áp dụng ${file}:`, err);
    process.exit(1);
  }
}

console.log(
  count === 0 ? "Không có migration mới." : `Xong: áp dụng ${count} migration.`,
);
console.log(`DB: ${dbPath}`);
