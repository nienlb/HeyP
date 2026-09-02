import "server-only";
import { NOW_EPOCH_SQL, raw } from "./raw";
import { config } from "@/lib/config";
import { hashPassword, validatePassword, verifyPassword } from "@/lib/password";
import type { UserRole } from "@/lib/roles";

export type UserRow = {
  id: number;
  username: string;
  role: UserRole;
  active: boolean;
  createdAt: Date;
};

export type UserResult = { ok: true } | { ok: false; reason: string };

type DbRow = {
  id: number;
  username: string;
  role: UserRole;
  active: boolean;
  createdAt: string | number;
};

function toRow(r: DbRow): UserRow {
  return {
    id: r.id,
    username: r.username,
    role: r.role,
    active: r.active === true,
    createdAt: new Date(Number(r.createdAt) * 1000),
  };
}

const SELECT_COLS = `id, username, role, active, created_at AS "createdAt"`;

/**
 * Nạp tài khoản lần đầu từ APP_ACCOUNTS. Chỉ chạy khi bảng RỖNG — sau lần
 * này .env hết tác dụng, bảng users là nguồn chân lý duy nhất.
 *
 * ON CONFLICT DO NOTHING: hai request đăng nhập cùng lúc không nhân đôi.
 */
export async function ensureUsersSeeded(): Promise<void> {
  const row = await raw.get<{ n: number }>(
    "SELECT COUNT(*)::int AS n FROM users",
  );
  if ((row?.n ?? 0) > 0) return;
  if (config.accounts.length === 0) return;

  for (const [i, acc] of config.accounts.entries()) {
    await raw.run(
      `INSERT INTO users (username, password_hash, role)
       VALUES (?, ?, ?) ON CONFLICT (username) DO NOTHING`,
      [
        acc.username,
        hashPassword(acc.password),
        // Tài khoản đầu trong APP_ACCOUNTS thành Owner — nếu gieo ra 0 owner
        // thì không ai vào được màn Thành viên (nó là Owner-only).
        i === 0 ? "owner" : "member",
      ],
    );
  }
}

export async function getUserById(id: number): Promise<UserRow | null> {
  const r = await raw.get<DbRow>(
    `SELECT ${SELECT_COLS} FROM users WHERE id = ?`,
    [id],
  );
  return r ? toRow(r) : null;
}

export async function listUsers(): Promise<UserRow[]> {
  const rows = await raw.all<DbRow>(
    `SELECT ${SELECT_COLS} FROM users ORDER BY id`,
  );
  return rows.map(toRow);
}

export async function countActiveOwners(): Promise<number> {
  const r = await raw.get<{ n: number }>(
    "SELECT COUNT(*)::int AS n FROM users WHERE role = 'owner' AND active = true",
  );
  return r?.n ?? 0;
}

/** Trả về user nếu đúng mật khẩu VÀ đang hoạt động; ngược lại null. */
export async function authenticate(
  username: string,
  password: string,
): Promise<UserRow | null> {
  const r = await raw.get<DbRow & { passwordHash: string }>(
    `SELECT ${SELECT_COLS}, password_hash AS "passwordHash"
       FROM users WHERE username = ?`,
    [username],
  );
  if (!r) return null;
  if (r.active !== true) return null;
  if (!verifyPassword(password, r.passwordHash)) return null;
  return toRow(r);
}

export async function createUser(input: {
  username: string;
  password: string;
  role: UserRole;
}): Promise<UserResult> {
  const username = input.username.trim();
  if (username === "") return { ok: false, reason: "Chưa nhập tên tài khoản." };
  const pwErr = validatePassword(input.password);
  if (pwErr) return { ok: false, reason: pwErr };

  const dup = await raw.get<{ id: number }>(
    "SELECT id FROM users WHERE username = ?",
    [username],
  );
  if (dup) return { ok: false, reason: `Tài khoản "${username}" đã tồn tại.` };

  await raw.run(
    `INSERT INTO users (username, password_hash, role, created_at)
     VALUES (?, ?, ?, ${NOW_EPOCH_SQL})`,
    [username, hashPassword(input.password), input.role],
  );
  return { ok: true };
}

export async function setUserRole(
  id: number,
  role: UserRole,
): Promise<UserResult> {
  await raw.run("UPDATE users SET role = ? WHERE id = ?", [role, id]);
  return { ok: true };
}

export async function setUserActive(
  id: number,
  active: boolean,
): Promise<UserResult> {
  await raw.run("UPDATE users SET active = ? WHERE id = ?", [active, id]);
  return { ok: true };
}

export async function setUserPassword(
  id: number,
  password: string,
): Promise<UserResult> {
  const err = validatePassword(password);
  if (err) return { ok: false, reason: err };
  await raw.run("UPDATE users SET password_hash = ? WHERE id = ?", [
    hashPassword(password),
    id,
  ]);
  return { ok: true };
}

export async function deleteUser(id: number): Promise<UserResult> {
  await raw.run("DELETE FROM users WHERE id = ?", [id]);
  return { ok: true };
}

/**
 * Tự đổi mật khẩu: bắt buộc nhập đúng mật khẩu hiện tại. Phiên đang mở vẫn
 * sống — không có khái niệm token_version, thêm vào không đáng.
 */
export async function changeOwnPassword(
  id: number,
  current: string,
  next: string,
): Promise<UserResult> {
  const r = await raw.get<{ passwordHash: string }>(
    `SELECT password_hash AS "passwordHash" FROM users WHERE id = ?`,
    [id],
  );
  if (!r) return { ok: false, reason: "Không tìm thấy tài khoản." };
  if (!verifyPassword(current, r.passwordHash))
    return { ok: false, reason: "Mật khẩu hiện tại không đúng." };
  return setUserPassword(id, next);
}
