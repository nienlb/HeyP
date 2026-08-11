/**
 * Sao lưu & khôi phục dữ liệu (Phase 7, spec mục 9).
 * Module tự chứa (chỉ dùng node: builtins, đọc env trực tiếp) — chạy được từ
 * script CLI, route, và job nền. Không import `@/` để `node scripts/*.ts` chạy được.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

function cfg() {
  return {
    dbPath: resolve(process.cwd(), process.env.DATABASE_PATH ?? "./data/app.sqlite"),
    uploadsPath: resolve(process.cwd(), process.env.UPLOADS_PATH ?? "./uploads"),
    backupPath: resolve(process.cwd(), process.env.BACKUP_PATH ?? "./backups"),
    keep: Number(process.env.BACKUP_KEEP ?? "30"),
    minHours: Number(process.env.BACKUP_MIN_HOURS ?? "20"),
  };
}

export type BackupInfo = { name: string; path: string; at: Date };

export function listBackups(): BackupInfo[] {
  const { backupPath } = cfg();
  if (!existsSync(backupPath)) return [];
  return readdirSync(backupPath)
    .filter((n) => n.startsWith("backup-"))
    .map((n) => ({
      name: n,
      path: join(backupPath, n),
      at: statSync(join(backupPath, n)).mtime,
    }))
    .sort((a, b) => b.at.getTime() - a.at.getTime());
}

export type BackupResult =
  | { ok: true; name: string }
  | { ok: false; error: string };

/** Tạo một bản sao lưu: snapshot SQLite (VACUUM INTO) + copy thư mục uploads. */
export function runBackup(): BackupResult {
  const c = cfg();
  try {
    mkdirSync(c.backupPath, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const name = `backup-${ts}`;
    const dir = join(c.backupPath, name);
    mkdirSync(dir, { recursive: true });

    // 1) Snapshot CSDL nhất quán (kể cả đang WAL) bằng VACUUM INTO.
    if (existsSync(c.dbPath)) {
      const db = new DatabaseSync(c.dbPath);
      try {
        const out = join(dir, "app.sqlite").replace(/'/g, "''");
        db.exec(`VACUUM INTO '${out}'`);
      } finally {
        db.close();
      }
    }

    // 2) Thư mục ảnh.
    if (existsSync(c.uploadsPath)) {
      cpSync(c.uploadsPath, join(dir, "uploads"), { recursive: true });
    }

    // 3) Giữ tối đa `keep` bản gần nhất (tên ISO nên sort theo thứ tự thời gian).
    const all = readdirSync(c.backupPath)
      .filter((n) => n.startsWith("backup-"))
      .sort();
    for (let i = 0; i < all.length - c.keep; i++) {
      rmSync(join(c.backupPath, all[i]), { recursive: true, force: true });
    }

    return { ok: true, name };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Chỉ sao lưu nếu bản gần nhất đã cũ hơn `minHours` (dùng cho job nền / khởi động). */
export function backupIfNeeded():
  | BackupResult
  | { ok: true; skipped: true } {
  const c = cfg();
  const latest = listBackups()[0];
  if (latest) {
    const hours = (Date.now() - latest.at.getTime()) / 3_600_000;
    if (hours < c.minHours) return { ok: true, skipped: true };
  }
  return runBackup();
}

/**
 * Khôi phục từ một bản sao lưu (mặc định: mới nhất). GHI ĐÈ dữ liệu hiện tại —
 * chỉ gọi khi chủ động. Trả về tên bản đã khôi phục.
 */
export function restoreBackup(name?: string): BackupResult {
  const c = cfg();
  const backups = listBackups();
  const target = name
    ? backups.find((b) => b.name === name)
    : backups[0];
  if (!target) return { ok: false, error: "Không tìm thấy bản sao lưu" };

  try {
    const src = join(target.path, "app.sqlite");
    if (existsSync(src)) {
      // Dọn file WAL/SHM cũ để không lẫn với bản khôi phục.
      for (const suffix of ["", "-wal", "-shm"]) {
        const f = c.dbPath + suffix;
        if (existsSync(f)) rmSync(f, { force: true });
      }
      mkdirSync(resolve(c.dbPath, ".."), { recursive: true });
      cpSync(src, c.dbPath);
    }
    const upSrc = join(target.path, "uploads");
    if (existsSync(upSrc)) {
      if (existsSync(c.uploadsPath))
        rmSync(c.uploadsPath, { recursive: true, force: true });
      cpSync(upSrc, c.uploadsPath, { recursive: true });
    }
    return { ok: true, name: target.name };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
