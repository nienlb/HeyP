import "server-only";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { config } from "@/lib/config";
import * as schema from "./schema";

const dbPath = resolve(process.cwd(), config.databasePath);

// Đảm bảo thư mục chứa file SQLite tồn tại trước khi mở kết nối.
const dir = dirname(dbPath);
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

/**
 * Dùng SQLite built-in của Node (node:sqlite) — không cần biên dịch native,
 * chạy được trên Node mới nhất. Kết nối vào Drizzle qua driver sqlite-proxy.
 */
export const sqlite = new DatabaseSync(dbPath);
sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec("PRAGMA foreign_keys = ON;");

export const db = drizzle(
  async (sql, params, method) => {
    const stmt = sqlite.prepare(sql);

    if (method === "run") {
      stmt.run(...(params as never[]));
      return { rows: [] };
    }

    // node:sqlite trả object theo tên cột; sqlite-proxy cần mảng giá trị
    // theo đúng thứ tự cột trong câu SELECT → dùng Object.values.
    const rowsAsObjects = stmt.all(...(params as never[])) as Record<
      string,
      unknown
    >[];
    const rows = rowsAsObjects.map((r) => Object.values(r));

    // 'get' cần một hàng phẳng; 'all'/'values' cần mảng các hàng.
    if (method === "get") {
      return { rows: rows[0] ?? [] };
    }
    return { rows };
  },
  { schema },
);
