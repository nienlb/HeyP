# HeyP v6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng hệ tài khoản có vai trò trong DB, cho phép xoá đơn/khách có kiểm soát kèm nhật ký, đảo chiều nhập đơn sang giá phải thu kèm ảnh theo món, thêm thao tác chuyển trạng thái hàng loạt, và cho sửa danh sách món của đơn đã tạo.

**Architecture:** Giữ nguyên kiến trúc hiện có — Next.js App Router, server component đọc DB qua Drizzle/SQL thô, thao tác đi qua server action. Luật nghiệp vụ mới đặt ở module thuần trong `src/lib/` (test bằng `node:test`), tầng DB gọi lại module đó. Bảng `users` là nguồn chân lý mới cho đăng nhập, thay `APP_ACCOUNTS` trong `.env`.

**Tech Stack:** Next.js 15 · React 19 · TypeScript · Postgres (Supabase) + Drizzle ORM (`postgres-js`) · `node:crypto` (scrypt) · `node:test` · CSS thuần.

**Spec:** `docs/superpowers/specs/2026-08-31-heyp-v6-tai-khoan-quyen-va-nhap-don-design.md`

## Global Constraints

Mọi task đều phải tuân thủ (trích từ `CLAUDE.md` và spec):

- **Không thêm dependency mới.** Hash mật khẩu dùng `node:crypto` có sẵn.
- **SQL thô viết placeholder `?`** — lớp `Exec` (`src/db/raw.ts`) tự đổi sang `$1,$2`.
- **Trong `withTx` PHẢI dùng `x` được truyền vào**, KHÔNG dùng `raw` toàn cục.
- **Alias camelCase trong SQL thô phải bọc nháy kép**: `AS "orderType"`.
- **`SUM()`/`COUNT()` trên cột `integer` phải ép `::int`.**
- **Thời gian là epoch-seconds `bigint`**; SQL thô dùng hằng `NOW_EPOCH_SQL`.
- **Boolean là `boolean` thật**: SQL so `= true`/`= false`, JS so `=== true`.
- **Mọi ô nhập PHẢI `font-size: var(--fs-3)` (16px)** — dưới ngưỡng này Safari iOS tự phóng to trang. Kiểm bằng `[...document.querySelectorAll("input,select,textarea")].map(el=>getComputedStyle(el).fontSize)`.
- **Thanh dính đáy/đỉnh phải cộng `env(safe-area-inset-*)`** (biến `--sat`/`--sab`).
- **Trang có đăng nhập bọc bằng `<AppShell username title …>`**; `title` bắt buộc.
- **Module thuần dùng cho test KHÔNG được import file có alias `@/`.** Test import bằng đuôi `.ts` tường minh.
- **Module thuần import module thuần khác bằng đuôi `.ts` tường minh** (`from "./order-status.ts"`) — theo đúng `src/lib/order-gaps.ts` đang làm. Đây là điều kiện để `node --test` nạp được; Next/tsc vẫn build bình thường (`allowImportingTsExtensions` đã bật). Đừng "dọn" đuôi `.ts` này đi.
- **UI tiếng Việt.** Tiền VND (₫), tệ (¥).
- **Commit tiếng Việt**, kết thúc bằng `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Chạy dev bằng công cụ preview của harness**, không dùng lệnh shell.
- Lệnh kiểm tra: `npm test` · `npx tsc --noEmit` · một file test: `node --test tests/<tên>.test.ts`.

---

## Bản đồ file

**Tạo mới — module thuần (test được, không đụng DB):**

| File | Trách nhiệm |
| --- | --- |
| `src/lib/roles.ts` | Enum vai trò, nhãn, hai hàm chặn (`guardSelfAction`, `guardLastAdmin`) |
| `src/lib/password.ts` | `hashPassword`, `verifyPassword`, `validatePassword` (scrypt) |
| `src/lib/deletion.ts` | `canDeleteOrder`, `canDeleteCustomer` |
| `src/lib/bulk-status.ts` | `planBulkAdvance` — gom nhóm phép chuyển hàng loạt |

**Tạo mới — tầng DB:**

| File | Trách nhiệm |
| --- | --- |
| `src/db/users.ts` | Toàn bộ truy vấn bảng `users` + `ensureUsersSeeded` |
| `src/db/deletion.ts` | `deleteOrderCascade`, `deleteCustomerRow`, `listDeletionLog` |

> `queries.ts` đã 1760 dòng. Hai khối mới tách ra file riêng thay vì nối thêm vào đó.

**Tạo mới — màn hình:**

| File | Trách nhiệm |
| --- | --- |
| `src/app/admin/users/page.tsx` · `actions.ts` · `users-list.tsx` · `user-sheet.tsx` | Quản trị tài khoản |
| `src/app/admin/deletions/page.tsx` | Nhật ký xoá (chỉ đọc) |
| `src/app/orders/orders-list.tsx` | Danh sách đơn + chế độ chọn nhiều (client) |
| `src/app/orders/bulk-sheet.tsx` | Sheet xác nhận chuyển hàng loạt |
| `src/app/orders/[id]/item-editor.tsx` | Nút thêm/xoá món ở tab Món |
| `src/app/settings/password-form.tsx` | Form đổi mật khẩu cá nhân |

**Sửa:**

| File | Sửa gì |
| --- | --- |
| `src/db/schema.ts` | Thêm bảng `users`, `deletion_log` |
| `src/lib/auth.ts` | Token mang `userId`; `getSession` đọc DB + `cache()`; `requireAdmin` |
| `src/lib/config.ts` | Bỏ `findAccount` (bảng `users` thay chỗ) |
| `src/lib/line-pricing.ts` | `cnyFromSellPrice`, `totalAfterAddLine`, `totalAfterRemoveLine` |
| `src/lib/money.ts` | `validateLineItem` bỏ điều kiện `unitPriceCny > 0` |
| `src/lib/order-status.ts` | `canEditOrderItems(status)` |
| `src/app/_components/nav-config.ts` | `navItemsFor(role)` |
| `src/app/_components/app-shell.tsx` | Thành async, tự đọc `role` để dựng nav |
| `src/app/_components/sidebar.tsx` · `mobile-nav.tsx` | Nhận `items` từ ngoài |
| `src/app/login/actions.ts` | Xác thực qua `users` + seed lần đầu |
| `src/db/queries.ts` | `createOrder` trả `{orderId, itemIds}`; `linkPhotoToOrderItem`; `addOrderItem`; `removeOrderItem`; `listOrders` thêm `goodsTotalCny` |
| `src/app/orders/new/types.ts` · `item-sheet.tsx` · `new-order-form.tsx` | Ô giá phải thu + ảnh theo món |
| `src/app/orders/actions.ts` | Gắn ảnh theo món; `bulkAdvanceAction`; `deleteOrderAction`; `addItemAction`; `removeItemAction` |
| `src/app/orders/page.tsx` | Tách danh sách sang client component |
| `src/app/orders/[id]/page.tsx` | Nút xoá đơn + editor món |
| `src/app/customers/page.tsx` · `actions.ts` | Nút xoá khách |
| `src/app/settings/page.tsx` | Khối đổi mật khẩu |
| `src/app/api/upload/route.ts` | — không đổi (ảnh món dùng lại nguyên route) |
| `src/app/api/backup/route.ts` | Thêm `users`, `deletion_log` vào `TABLES` |
| `src/app/_components/icons.tsx` | Thêm icon `users`, `trash`, `check` |
| `CLAUDE.md` | Luật Total mới, mô hình tài khoản, mục Tài liệu |

**Thứ tự phụ thuộc:** Task 1→2→3 (nền auth) → 4, 5 · Task 6→7→8 (xoá, cần role từ Task 3) · Task 9→10→11→12 (nhập đơn, độc lập) · Task 13→14 (hàng loạt, độc lập) · Task 15→16 (sửa món, cần Task 9) · Task 17 (dọn cuối).

---

## Phần 1 — Tài khoản & phân quyền

### Task 1: Module thuần `roles` và `password`

**Files:**
- Create: `src/lib/roles.ts`
- Create: `src/lib/password.ts`
- Test: `tests/password.test.ts`
- Test: `tests/roles.test.ts`

**Interfaces:**
- Consumes: không có (task đầu tiên).
- Produces:
  - `USER_ROLES: readonly ["admin", "nhan_vien"]`, `type UserRole`, `ROLE_LABELS: Record<UserRole, string>`, `parseRole(raw: string): UserRole | null`
  - `guardSelfAction(targetId: number, currentUserId: number): string | null`
  - `guardLastAdmin(target: { role: UserRole; active: boolean }, activeAdminCount: number): string | null`
  - `MIN_PASSWORD_LENGTH: number`, `validatePassword(plain: string): string | null`, `hashPassword(plain: string): string`, `verifyPassword(plain: string, stored: string): boolean`

- [ ] **Step 1: Viết test cho `password.ts`**

Tạo `tests/password.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MIN_PASSWORD_LENGTH,
  hashPassword,
  validatePassword,
  verifyPassword,
} from "../src/lib/password.ts";

test("hash rồi verify lại đúng mật khẩu", () => {
  const stored = hashPassword("matkhau123");
  assert.equal(verifyPassword("matkhau123", stored), true);
});

test("sai mật khẩu thì verify trả false", () => {
  const stored = hashPassword("matkhau123");
  assert.equal(verifyPassword("matkhau124", stored), false);
});

test("hai lần hash cùng mật khẩu ra hai chuỗi khác nhau (salt ngẫu nhiên)", () => {
  assert.notEqual(hashPassword("matkhau123"), hashPassword("matkhau123"));
});

test("chuỗi lưu tự mô tả tham số scrypt", () => {
  const parts = hashPassword("matkhau123").split("$");
  assert.equal(parts.length, 6);
  assert.equal(parts[0], "scrypt");
  assert.equal(parts[1], "16384");
});

test("chuỗi lưu hỏng thì verify trả false, không throw", () => {
  assert.equal(verifyPassword("matkhau123", ""), false);
  assert.equal(verifyPassword("matkhau123", "khong-phai-hash"), false);
  assert.equal(verifyPassword("matkhau123", "scrypt$a$b$c$d$e"), false);
});

test("mật khẩu ngắn hơn ngưỡng bị chặn", () => {
  assert.equal(MIN_PASSWORD_LENGTH, 6);
  assert.equal(typeof validatePassword("12345"), "string");
  assert.equal(validatePassword("123456"), null);
});
```

- [ ] **Step 2: Chạy test, xác nhận nó hỏng**

Run: `node --test tests/password.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/password.ts'`

- [ ] **Step 3: Viết `src/lib/password.ts`**

```ts
/**
 * Hash mật khẩu bằng scrypt của node:crypto — KHÔNG thêm dependency.
 *
 * Chuỗi lưu tự mô tả tham số: đổi N/r/p về sau vẫn verify được mật khẩu cũ.
 *   scrypt$<N>$<r>$<p>$<salt_base64>$<hash_base64>
 *
 * Module thuần, không đụng DB.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const N = 16384;
const R = 8;
const P = 1;
const KEY_LEN = 32;
// scrypt cần ~128 × N × r byte = 16MB với tham số trên. Mặc định của Node là
// 32MB; đặt tường minh để không phụ thuộc mặc định của phiên bản.
const MAX_MEM = 64 * 1024 * 1024;

export const MIN_PASSWORD_LENGTH = 6;

/** Trả thông báo lỗi (tiếng Việt) nếu mật khẩu không hợp lệ, null nếu ổn. */
export function validatePassword(plain: string): string | null {
  if (plain.length < MIN_PASSWORD_LENGTH)
    return `Mật khẩu phải từ ${MIN_PASSWORD_LENGTH} ký tự trở lên.`;
  return null;
}

export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, KEY_LEN, {
    N,
    r: R,
    p: P,
    maxmem: MAX_MEM,
  });
  return [
    "scrypt",
    N,
    R,
    P,
    salt.toString("base64"),
    hash.toString("base64"),
  ].join("$");
}

export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p))
    return false;
  if (n <= 1 || r <= 0 || p <= 0) return false;

  try {
    const expected = Buffer.from(parts[5], "base64");
    if (expected.length === 0) return false;
    const actual = scryptSync(plain, Buffer.from(parts[4], "base64"), expected.length, {
      N: n,
      r,
      p,
      maxmem: MAX_MEM,
    });
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  } catch {
    // Tham số vô lý (vd N không phải luỹ thừa 2) làm scryptSync throw.
    return false;
  }
}
```

- [ ] **Step 4: Chạy test, xác nhận xanh**

Run: `node --test tests/password.test.ts`
Expected: PASS — 6 test.

- [ ] **Step 5: Viết test cho `roles.ts`**

Tạo `tests/roles.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ROLE_LABELS,
  USER_ROLES,
  guardLastAdmin,
  guardSelfAction,
  parseRole,
} from "../src/lib/roles.ts";

test("đúng hai vai trò, mỗi vai trò có nhãn tiếng Việt", () => {
  assert.deepEqual([...USER_ROLES], ["admin", "nhan_vien"]);
  for (const r of USER_ROLES) assert.equal(typeof ROLE_LABELS[r], "string");
});

test("parseRole lọc chuỗi lạ", () => {
  assert.equal(parseRole("admin"), "admin");
  assert.equal(parseRole("nhan_vien"), "nhan_vien");
  assert.equal(parseRole("superuser"), null);
  assert.equal(parseRole(""), null);
});

test("không được tự tác động lên chính mình", () => {
  assert.equal(typeof guardSelfAction(3, 3), "string");
  assert.equal(guardSelfAction(3, 4), null);
});

test("không được hạ/khoá/xoá admin đang hoạt động cuối cùng", () => {
  const admin = { role: "admin" as const, active: true };
  assert.equal(typeof guardLastAdmin(admin, 1), "string");
  assert.equal(guardLastAdmin(admin, 2), null);
});

test("admin đã khoá hoặc nhân viên không bị luật admin cuối chặn", () => {
  assert.equal(guardLastAdmin({ role: "admin", active: false }, 1), null);
  assert.equal(guardLastAdmin({ role: "nhan_vien", active: true }, 1), null);
});
```

- [ ] **Step 6: Chạy test, xác nhận nó hỏng**

Run: `node --test tests/roles.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/roles.ts'`

- [ ] **Step 7: Viết `src/lib/roles.ts`**

```ts
/**
 * Vai trò người dùng (v6). Đúng HAI vai trò, không có bảng quyền chi tiết —
 * mọi chỗ kiểm quyền rút về `role === "admin"`.
 *
 * Module thuần, không đụng DB. `src/db/schema.ts` import enum từ đây, cùng
 * cách ORDER_STATUSES đang làm.
 */

export const USER_ROLES = ["admin", "nhan_vien"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Quản trị",
  nhan_vien: "Nhân viên",
};

export function parseRole(raw: string): UserRole | null {
  return (USER_ROLES as readonly string[]).includes(raw)
    ? (raw as UserRole)
    : null;
}

/**
 * Chặn tự khoá / tự hạ vai trò / tự xoá chính mình — nếu không, một cú bấm
 * nhầm là mất đường vào khu quản trị.
 */
export function guardSelfAction(
  targetId: number,
  currentUserId: number,
): string | null {
  return targetId === currentUserId
    ? "Không thể tự khoá, tự hạ vai trò hay tự xoá chính mình."
    : null;
}

/**
 * Chặn thao tác khiến hệ thống còn 0 admin đang hoạt động. Áp cho cả ba
 * đường: xoá, khoá, và hạ vai trò.
 *
 * `activeAdminCount` là số admin đang hoạt động TRƯỚC thao tác, kể cả target.
 */
export function guardLastAdmin(
  target: { role: UserRole; active: boolean },
  activeAdminCount: number,
): string | null {
  if (target.role !== "admin" || !target.active) return null;
  return activeAdminCount <= 1
    ? "Phải còn ít nhất một quản trị viên đang hoạt động."
    : null;
}
```

- [ ] **Step 8: Chạy cả hai test + typecheck**

Run: `node --test tests/roles.test.ts && npx tsc --noEmit`
Expected: PASS — 5 test; tsc không báo lỗi.

- [ ] **Step 9: Commit**

```bash
git add src/lib/roles.ts src/lib/password.ts tests/password.test.ts tests/roles.test.ts
git commit -m "$(cat <<'MSG'
tài khoản: module thuần vai trò và hash mật khẩu scrypt

Hash bằng node:crypto, không thêm dependency. Chuỗi lưu tự mô tả tham số
để đổi N/r/p về sau vẫn verify được mật khẩu cũ.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 2: Bảng `users` + tầng truy vấn + nạp lần đầu

**Files:**
- Modify: `src/db/schema.ts` (thêm bảng `users` ở cuối, sau `payments`)
- Create: `src/db/users.ts`
- Create: `drizzle/0002_*.sql` (sinh bằng `npm run db:generate`)

**Interfaces:**
- Consumes: `UserRole`, `USER_ROLES` (Task 1); `hashPassword`, `verifyPassword` (Task 1).
- Produces:
  - `type UserRow = { id: number; username: string; role: UserRole; active: boolean; createdAt: Date }`
  - `type UserResult = { ok: true } | { ok: false; reason: string }`
  - `ensureUsersSeeded(): Promise<void>`
  - `authenticate(username: string, password: string): Promise<UserRow | null>`
  - `getUserById(id: number): Promise<UserRow | null>`
  - `listUsers(): Promise<UserRow[]>`
  - `countActiveAdmins(): Promise<number>`
  - `createUser(input: { username: string; password: string; role: UserRole }): Promise<UserResult>`
  - `setUserRole(id: number, role: UserRole): Promise<UserResult>`
  - `setUserActive(id: number, active: boolean): Promise<UserResult>`
  - `setUserPassword(id: number, password: string): Promise<UserResult>`
  - `deleteUser(id: number): Promise<UserResult>`
  - `changeOwnPassword(id: number, current: string, next: string): Promise<UserResult>`

- [ ] **Step 1: Thêm bảng `users` vào schema**

Trong `src/db/schema.ts`, thêm import ở đầu file:

```ts
import { USER_ROLES } from "@/lib/roles";
```

Rồi thêm ở cuối file:

```ts
// 11) Người dùng (v6) — thay APP_ACCOUNTS trong .env. Mật khẩu lưu dạng
// chuỗi scrypt tự mô tả tham số (src/lib/password.ts), không bao giờ plaintext.
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: USER_ROLES }).notNull().default("nhan_vien"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});
```

- [ ] **Step 2: Sinh migration**

Run: `npm run db:generate`
Expected: tạo `drizzle/0002_<tên>.sql` chứa `CREATE TABLE "users"` với ràng buộc `UNIQUE` trên `username`. Mở file xem qua để chắc không có câu `DROP` nào ngoài dự kiến.

- [ ] **Step 3: Áp migration**

Run: `npm run db:migrate`
Expected: chạy xong không lỗi. (Cần `DIRECT_URL` trong `.env` — Session pooler cổng 5432.)

- [ ] **Step 4: Viết `src/db/users.ts`**

```ts
import "server-only";
import { raw } from "./raw";
import { NOW_EPOCH_SQL } from "./raw";
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
      [acc.username, hashPassword(acc.password), i === 0 ? "admin" : "nhan_vien"],
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

export async function countActiveAdmins(): Promise<number> {
  const r = await raw.get<{ n: number }>(
    "SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin' AND active = true",
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
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: không lỗi.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts src/db/users.ts drizzle/
git commit -m "$(cat <<'MSG'
tài khoản: bảng users, tầng truy vấn và nạp lần đầu từ .env

ensureUsersSeeded chỉ chạy khi bảng rỗng: người đầu tiên trong APP_ACCOUNTS
thành admin, còn lại nhân viên. Sau lần đó .env hết tác dụng.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 3: Session mang `userId`, đọc DB, `requireAdmin`

Đây là task đổi bản chất: hiện `getSession()` **không đọc DB lần nào**, nên khoá tài khoản không có tác dụng gì. Sau task này cookie cũ hết hiệu lực — mọi người đăng nhập lại một lần.

**Files:**
- Modify: `src/lib/auth.ts` (viết lại phần token + session)
- Modify: `src/lib/config.ts` (bỏ `findAccount`)
- Modify: `src/app/login/actions.ts`

**Interfaces:**
- Consumes: `getUserById`, `authenticate`, `ensureUsersSeeded` (Task 2); `UserRole` (Task 1).
- Produces:
  - `type Session = { id: number; username: string; role: UserRole }`
  - `createSession(userId: number): Promise<void>`
  - `getSession(): Promise<Session | null>` — đã bọc `cache()`
  - `requireAuth(): Promise<Session>`
  - `requireAdmin(): Promise<Session>`

- [ ] **Step 1: Viết lại `src/lib/auth.ts`**

Thay toàn bộ nội dung từ `makeToken` trở xuống. Phần `sign`/`safeEqual` giữ nguyên.

```ts
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUserById } from "@/db/users";
import type { UserRole } from "@/lib/roles";
import { config } from "./config";

const COOKIE_NAME = "heyp_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 ngày

export type Session = { id: number; username: string; role: UserRole };

/** Ký một payload bằng HMAC-SHA256 để cookie phiên không giả mạo được. */
function sign(payload: string): string {
  return createHmac("sha256", config.sessionSecret).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Token = base64(userId).timestamp.chữ_ký
 *
 * v6 mang userId thay username: vai trò và cờ `active` phải đọc từ DB mỗi
 * request, nếu không thì khoá tài khoản chẳng có tác dụng gì (cookie sống 30
 * ngày). Cookie định dạng cũ (mang username) không parse ra số → coi như
 * không hợp lệ, người dùng đăng nhập lại một lần.
 */
function makeToken(userId: number): string {
  const payload = `${Buffer.from(String(userId)).toString("base64url")}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token: string | undefined): { userId: number } | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [idB64, ts, sig] = parts;
  const payload = `${idB64}.${ts}`;
  if (!safeEqual(sig, sign(payload))) return null;
  try {
    const userId = Number(Buffer.from(idB64, "base64url").toString("utf8"));
    if (!Number.isInteger(userId) || userId <= 0) return null;
    return { userId };
  } catch {
    return null;
  }
}

export async function createSession(userId: number): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, makeToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/**
 * Phiên hiện tại, hoặc null. Không redirect.
 *
 * Bọc `cache()`: nhiều nơi trong một lần render gọi requireAuth() nhưng chỉ
 * tốn đúng MỘT truy vấn khoá chính.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const store = await cookies();
  const parsed = verifyToken(store.get(COOKIE_NAME)?.value);
  if (!parsed) return null;
  const user = await getUserById(parsed.userId);
  // Tài khoản bị xoá hoặc bị khoá → phiên chết ngay, không đợi cookie hết hạn.
  if (!user || !user.active) return null;
  return { id: user.id, username: user.username, role: user.role };
});

/** Dùng ở đầu server component cần bảo vệ: chưa đăng nhập → về /login. */
export async function requireAuth(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/**
 * Dùng ở đầu MỌI trang và MỌI server action của khu quản trị. Không dựa vào
 * việc giấu nút ở UI — nhân viên gõ thẳng URL vẫn phải bị chặn.
 */
export async function requireAdmin(): Promise<Session> {
  const session = await requireAuth();
  if (session.role !== "admin") redirect("/");
  return session;
}
```

- [ ] **Step 2: Bỏ `findAccount` khỏi `src/lib/config.ts`**

Xoá hàm `findAccount` ở cuối file. Giữ nguyên `parseAccounts` và `config.accounts` — chúng vẫn là hạt giống cho `ensureUsersSeeded`. Thêm ghi chú trên `accounts`:

```ts
  /**
   * Hạt giống cho lần nạp tài khoản ĐẦU TIÊN (src/db/users.ts). Sau khi bảng
   * `users` có dữ liệu, biến này không còn tác dụng lên đường đăng nhập.
   */
  accounts: parseAccounts(process.env.APP_ACCOUNTS),
```

- [ ] **Step 3: Viết lại `src/app/login/actions.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { createSession } from "@/lib/auth";
import { authenticate, ensureUsersSeeded } from "@/db/users";

export async function loginAction(formData: FormData): Promise<void> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  // Bảng rỗng (lần chạy đầu sau khi lên v6) → nạp từ APP_ACCOUNTS trước khi
  // xác thực, để lần đăng nhập đầu tiên không bị trượt.
  await ensureUsersSeeded();

  const user = await authenticate(username, password);
  if (!user) {
    redirect("/login?error=1");
  }

  await createSession(user.id);
  redirect("/");
}
```

- [ ] **Step 4: Typecheck — tsc sẽ chỉ ra mọi chỗ còn dùng `session.username` sai kiểu**

Run: `npx tsc --noEmit`
Expected: không lỗi. `Session` vẫn có `username` nên các trang hiện tại (`<AppShell username={session.username}>`) không phải sửa gì.

- [ ] **Step 5: Chạy toàn bộ test**

Run: `npm test`
Expected: PASS toàn bộ — task này không đụng module thuần nào.

- [ ] **Step 6: Thử bằng preview**

Mở preview theo `.claude/launch.json`, vào `/` → bị đẩy về `/login`. Đăng nhập bằng đúng tài khoản trong `APP_ACCOUNTS`. Kiểm bằng SQL trên Supabase: `SELECT id, username, role, active FROM users;` phải có đủ tài khoản, người đầu tiên `role = 'admin'`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth.ts src/lib/config.ts src/app/login/actions.ts
git commit -m "$(cat <<'MSG'
tài khoản: phiên mang userId và kiểm tra DB mỗi request

Trước đây cookie chỉ ký username và không đọc DB lần nào, nên khoá hay xoá
một tài khoản không có tác dụng gì suốt 30 ngày cookie còn sống. Giờ
getSession đọc users mỗi request (bọc cache() nên 1 truy vấn mỗi lần render)
và trả null khi tài khoản đã bị khoá hoặc xoá.

Cookie định dạng cũ hết hiệu lực: mọi người phải đăng nhập lại một lần.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 4: Màn `/admin/users` + điều hướng theo vai trò

**Files:**
- Modify: `src/app/_components/nav-config.ts`
- Modify: `src/app/_components/app-shell.tsx`
- Modify: `src/app/_components/sidebar.tsx`
- Modify: `src/app/_components/mobile-nav.tsx`
- Modify: `src/app/_components/icons.tsx` (thêm `users`, `trash`)
- Create: `src/app/admin/users/page.tsx`
- Create: `src/app/admin/users/actions.ts`
- Create: `src/app/admin/users/users-list.tsx`

**Interfaces:**
- Consumes: `requireAdmin`, `Session` (Task 3); `listUsers`, `createUser`, `setUserRole`, `setUserActive`, `setUserPassword`, `deleteUser`, `countActiveAdmins`, `UserRow` (Task 2); `guardSelfAction`, `guardLastAdmin`, `parseRole`, `ROLE_LABELS`, `USER_ROLES` (Task 1).
- Produces:
  - `navItemsFor(role: UserRole): { main: NavItem[]; more: NavItem[] }`
  - `createUserAction(formData: FormData): Promise<void>` và `userAdminAction(formData: FormData): Promise<void>` (một action nhận `op` = `role` | `active` | `password` | `delete`)

- [ ] **Step 1: Thêm hai icon**

Trong `src/app/_components/icons.tsx`, thêm `"users"` và `"trash"` vào `IconName`, và hai path vào `PATHS` (dựng theo cùng phong cách stroke của các icon sẵn có):

```tsx
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
    </>
  ),
```

- [ ] **Step 2: Đổi `nav-config.ts` sang hàm theo vai trò**

```ts
import type { UserRole } from "@/lib/roles";
import type { IconName } from "./icons";

export type NavItem = { href: string; label: string; icon: IconName };

/** Mục chính — sidebar (desktop) và ba ô đầu của tabbar (mobile). */
const MAIN: NavItem[] = [
  { href: "/", label: "Tổng quan", icon: "dashboard" },
  { href: "/orders", label: "Đơn", icon: "orders" },
  { href: "/inventory", label: "Kho", icon: "inventory" },
];

/** Mục phụ — sidebar hiện thêm; mobile gom vào sheet "Thêm". */
const MORE: NavItem[] = [
  { href: "/customers", label: "Khách hàng", icon: "customers" },
  { href: "/tracking", label: "Tracking", icon: "tracking" },
  { href: "/finance", label: "Tài chính", icon: "finance" },
  { href: "/reports", label: "Báo cáo", icon: "reports" },
  { href: "/settings", label: "Cài đặt", icon: "settings" },
  { href: "/backup", label: "Sao lưu", icon: "backup" },
];

/** Chỉ admin thấy — nhân viên gõ thẳng URL vẫn bị requireAdmin chặn. */
const ADMIN_ONLY: NavItem[] = [
  { href: "/admin/users", label: "Thành viên", icon: "users" },
  { href: "/admin/deletions", label: "Nhật ký xoá", icon: "trash" },
];

/**
 * Thêm màn mới thì sửa ĐÚNG file này, không sửa từng component điều hướng.
 */
export function navItemsFor(role: UserRole): {
  main: NavItem[];
  more: NavItem[];
} {
  return {
    main: MAIN,
    more: role === "admin" ? [...MORE, ...ADMIN_ONLY] : MORE,
  };
}
```

- [ ] **Step 3: `AppShell` thành async, tự đọc vai trò**

Trong `src/app/_components/app-shell.tsx` — giữ nguyên mọi prop hiện có (12+ trang đang truyền `username`, không đụng tới chúng), chỉ thêm phần đọc session:

```tsx
import type { ReactNode } from "react";
import { getSession } from "@/lib/auth";
import { navItemsFor } from "./nav-config";
import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";
import { ScreenHeader } from "./screen-header";
import { getLogoUrl } from "@/lib/logo";

export async function AppShell({
  username,
  title,
  backHref,
  action,
  bottomBar,
  children,
}: {
  username: string;
  title: string;
  backHref?: string;
  action?: ReactNode;
  /** Có thanh dính đáy thì tabbar ẩn — hai thứ chồng lên nhau. */
  bottomBar?: ReactNode;
  children: ReactNode;
}) {
  const logoUrl = getLogoUrl();
  // getSession bọc cache() nên gọi ở đây KHÔNG tốn thêm truy vấn: trang gọi
  // requireAuth() trước đó đã nạp sẵn trong cùng lần render.
  const session = await getSession();
  const nav = navItemsFor(session?.role ?? "nhan_vien");

  return (
    <div className={`app-shell${bottomBar ? " has-bottom-bar" : ""}`}>
      <Sidebar username={username} logoUrl={logoUrl} nav={nav} />
      <ScreenHeader title={title} backHref={backHref} action={action} />
      <main className="app-main">
        <h1 className="screen-title">{title}</h1>
        {children}
      </main>
      {bottomBar ?? <MobileNav username={username} nav={nav} />}
    </div>
  );
}
```

- [ ] **Step 4: `Sidebar` và `MobileNav` nhận `nav` từ ngoài**

`sidebar.tsx`: bỏ `import { NAV_ITEMS, MORE_ITEMS }`, thêm prop `nav: { main: NavItem[]; more: NavItem[] }`, thay `NAV_ITEMS` → `nav.main`, `MORE_ITEMS` → `nav.more`.

`mobile-nav.tsx`: tương tự — thêm prop `nav`, thay `NAV_ITEMS.slice(0, 2)` → `nav.main.slice(0, 2)`, `NAV_ITEMS.slice(2)` → `nav.main.slice(2)`, `MORE_ITEMS.map` → `nav.more.map`. Import kiểu: `import type { NavItem } from "./nav-config";`

- [ ] **Step 5: Typecheck — mọi trang phải vẫn biên dịch được**

Run: `npx tsc --noEmit`
Expected: không lỗi. `AppShell` async dùng được trong server component không cần sửa nơi gọi.

- [ ] **Step 6: Viết `src/app/admin/users/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import {
  countActiveAdmins,
  createUser,
  deleteUser,
  getUserById,
  setUserActive,
  setUserPassword,
  setUserRole,
} from "@/db/users";
import { guardLastAdmin, guardSelfAction, parseRole } from "@/lib/roles";

const PAGE = "/admin/users";

function back(error?: string): never {
  redirect(error ? `${PAGE}?err=${encodeURIComponent(error)}` : `${PAGE}?ok=1`);
}

export async function createUserAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const role = parseRole(String(formData.get("role") ?? ""));
  if (!role) back("Vai trò không hợp lệ.");

  const result = await createUser({
    username: String(formData.get("username") ?? ""),
    password: String(formData.get("password") ?? ""),
    role,
  });
  if (!result.ok) back(result.reason);

  revalidatePath(PAGE);
  back();
}

/**
 * Một cửa cho bốn thao tác lên tài khoản khác: đổi vai trò, khoá/mở, đặt lại
 * mật khẩu, xoá. Gộp lại vì cả bốn dùng chung đúng một bộ luật chặn.
 */
export async function userAdminAction(formData: FormData): Promise<void> {
  const me = await requireAdmin();

  const op = String(formData.get("op") ?? "");
  const targetId = Number(formData.get("id"));
  if (!Number.isInteger(targetId) || targetId <= 0) back("Yêu cầu không hợp lệ.");

  const target = await getUserById(targetId);
  if (!target) back("Không tìm thấy tài khoản.");

  // Đặt lại mật khẩu cho người khác là thao tác duy nhất KHÔNG cần hai luật
  // chặn — nó không làm mất admin nào.
  if (op === "password") {
    const result = await setUserPassword(
      targetId,
      String(formData.get("password") ?? ""),
    );
    if (!result.ok) back(result.reason);
    revalidatePath(PAGE);
    back();
  }

  const selfErr = guardSelfAction(targetId, me.id);
  if (selfErr) back(selfErr);

  const activeAdmins = await countActiveAdmins();
  const lastAdminErr = guardLastAdmin(target, activeAdmins);

  if (op === "delete") {
    if (lastAdminErr) back(lastAdminErr);
    const result = await deleteUser(targetId);
    if (!result.ok) back(result.reason);
  } else if (op === "active") {
    const next = String(formData.get("active")) === "true";
    // Chỉ khoá mới nguy hiểm; mở khoá thì không.
    if (!next && lastAdminErr) back(lastAdminErr);
    const result = await setUserActive(targetId, next);
    if (!result.ok) back(result.reason);
  } else if (op === "role") {
    const role = parseRole(String(formData.get("role") ?? ""));
    if (!role) back("Vai trò không hợp lệ.");
    // Chỉ HẠ vai trò mới nguy hiểm; nâng lên admin thì không.
    if (role !== "admin" && lastAdminErr) back(lastAdminErr);
    const result = await setUserRole(targetId, role);
    if (!result.ok) back(result.reason);
  } else {
    back("Thao tác không hợp lệ.");
  }

  revalidatePath(PAGE);
  back();
}
```

- [ ] **Step 7: Viết `src/app/admin/users/users-list.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Sheet } from "../../_components/sheet";
import { ListRow } from "../../_components/list-row";
import { ROLE_LABELS, USER_ROLES, type UserRole } from "@/lib/roles";
import { createUserAction, userAdminAction } from "./actions";

export type UserItem = {
  id: number;
  username: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
};

export function UsersList({
  users,
  currentUserId,
}: {
  users: UserItem[];
  currentUserId: number;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<UserItem | null>(null);

  return (
    <>
      <button
        type="button"
        className="header-action-float"
        onClick={() => setAddOpen(true)}
        aria-label="Thêm thành viên"
      >
        +
      </button>

      {users.map((u) => (
        <ListRow
          key={u.id}
          onClick={() => setEditing(u)}
          title={
            <>
              {u.username}
              {u.id === currentUserId && (
                <span className="muted small"> · bạn</span>
              )}
            </>
          }
          meta={`${ROLE_LABELS[u.role]} · ${u.active ? "Đang hoạt động" : "Đã khoá"} · ${u.createdAt}`}
        />
      ))}

      <Sheet
        open={addOpen}
        title="Thêm thành viên"
        onClose={() => setAddOpen(false)}
      >
        <form action={createUserAction}>
          <label className="field">
            <span>Tài khoản *</span>
            <input name="username" required autoComplete="off" />
          </label>
          <label className="field">
            <span>Mật khẩu *</span>
            <input
              name="password"
              type="password"
              required
              autoComplete="new-password"
            />
          </label>
          <label className="field">
            <span>Vai trò</span>
            <select name="role" defaultValue="nhan_vien">
              {USER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn" style={{ width: "100%" }}>
            Tạo tài khoản
          </button>
        </form>
      </Sheet>

      <Sheet
        open={editing !== null}
        title={editing ? editing.username : ""}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <div className="sheet-menu">
            <form action={userAdminAction}>
              <input type="hidden" name="op" value="role" />
              <input type="hidden" name="id" value={editing.id} />
              <label className="field">
                <span>Vai trò</span>
                <select name="role" defaultValue={editing.role}>
                  {USER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="btn btn-outline">
                Lưu vai trò
              </button>
            </form>

            <form action={userAdminAction}>
              <input type="hidden" name="op" value="password" />
              <input type="hidden" name="id" value={editing.id} />
              <label className="field">
                <span>Đặt lại mật khẩu</span>
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Mật khẩu mới"
                />
              </label>
              <button type="submit" className="btn btn-outline">
                Đặt lại mật khẩu
              </button>
            </form>

            <form action={userAdminAction}>
              <input type="hidden" name="op" value="active" />
              <input type="hidden" name="id" value={editing.id} />
              <input
                type="hidden"
                name="active"
                value={editing.active ? "false" : "true"}
              />
              <button type="submit" className="btn btn-outline">
                {editing.active ? "Khoá tài khoản" : "Mở khoá tài khoản"}
              </button>
            </form>

            <form action={userAdminAction}>
              <input type="hidden" name="op" value="delete" />
              <input type="hidden" name="id" value={editing.id} />
              <button type="submit" className="btn btn-danger">
                Xoá tài khoản
              </button>
            </form>
          </div>
        )}
      </Sheet>
    </>
  );
}
```

- [ ] **Step 8: Viết `src/app/admin/users/page.tsx`**

```tsx
import { requireAdmin } from "@/lib/auth";
import { listUsers } from "@/db/users";
import { AppShell } from "../../_components/app-shell";
import { UsersList, type UserItem } from "./users-list";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const [session, { ok, err }, users] = await Promise.all([
    requireAdmin(),
    searchParams,
    listUsers(),
  ]);

  const items: UserItem[] = users.map((u) => ({
    id: u.id,
    username: u.username,
    role: u.role,
    active: u.active,
    createdAt: u.createdAt.toLocaleDateString("vi-VN"),
  }));

  return (
    <AppShell username={session.username} title="Thành viên" backHref="/">
      {err && <div className="error">{err}</div>}
      {ok && <div className="ok-banner">✓ Đã lưu.</div>}
      <UsersList users={items} currentUserId={session.id} />
    </AppShell>
  );
}
```

- [ ] **Step 9: Thêm class `.btn-danger` nếu chưa có**

Kiểm: `grep -n "btn-danger" src/styles/*.css`. Nếu không có, thêm vào `src/styles/components.css`:

```css
.btn-danger {
  background: var(--danger, #b3261e);
  color: #fff;
  border-color: transparent;
}
```

- [ ] **Step 10: Typecheck + test**

Run: `npx tsc --noEmit && npm test`
Expected: không lỗi, toàn bộ test xanh.

- [ ] **Step 11: Kiểm bằng preview**

Đăng nhập bằng tài khoản admin → sidebar/sheet "Thêm" phải có mục **Thành viên**. Vào `/admin/users`, tạo một tài khoản `nhan_vien` thử. Đăng xuất, đăng nhập bằng tài khoản vừa tạo → **không** thấy mục Thành viên, và gõ thẳng `/admin/users` phải bị đẩy về `/`. Chụp màn hình cả hai trạng thái.

Kiểm cỡ chữ ô nhập trong Sheet bằng console:
```js
[...document.querySelectorAll("input,select,textarea")].map(el=>getComputedStyle(el).fontSize)
```
Expected: tất cả `"16px"`.

- [ ] **Step 12: Commit**

```bash
git add src/app/admin src/app/_components package.json
git commit -m "$(cat <<'MSG'
tài khoản: màn quản trị thành viên và điều hướng theo vai trò

nav-config đổi sang navItemsFor(role) — thêm màn mới vẫn chỉ sửa một chỗ.
Hai luật chặn (không tự tác động lên mình, không để hết admin) kiểm ở server
action chứ không dựa vào việc giấu nút.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 5: Đổi mật khẩu cá nhân ở `/settings`

**Files:**
- Create: `src/app/settings/password-form.tsx`
- Modify: `src/app/settings/actions.ts` (thêm action)
- Modify: `src/app/settings/page.tsx` (thêm khối)

**Interfaces:**
- Consumes: `requireAuth` (Task 3); `changeOwnPassword` (Task 2).
- Produces: `changePasswordAction(prev: PasswordState, formData: FormData): Promise<PasswordState>` với `type PasswordState = { error?: string; ok?: boolean }`

- [ ] **Step 1: Thêm action vào `src/app/settings/actions.ts`**

Nối vào cuối file (giữ nguyên `saveSettingsAction`):

```ts
import { requireAuth } from "@/lib/auth";
import { changeOwnPassword } from "@/db/users";

export type PasswordState = { error?: string; ok?: boolean };

export async function changePasswordAction(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const session = await requireAuth();

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next !== confirm)
    return { error: "Hai ô mật khẩu mới không khớp nhau." };

  const result = await changeOwnPassword(session.id, current, next);
  if (!result.ok) return { error: result.reason };
  return { ok: true };
}
```

- [ ] **Step 2: Viết `src/app/settings/password-form.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { changePasswordAction, type PasswordState } from "./actions";

export function PasswordForm() {
  const [state, formAction, pending] = useActionState<PasswordState, FormData>(
    changePasswordAction,
    {},
  );

  return (
    <section className="card" style={{ maxWidth: 520 }}>
      <h2 className="card-title">Đổi mật khẩu</h2>

      {state.error && <div className="error">{state.error}</div>}
      {state.ok && <div className="ok-banner">✓ Đã đổi mật khẩu.</div>}

      <form action={formAction}>
        <label className="field">
          <span>Mật khẩu hiện tại</span>
          <input
            name="current"
            type="password"
            required
            autoComplete="current-password"
          />
        </label>
        <label className="field">
          <span>Mật khẩu mới</span>
          <input
            name="next"
            type="password"
            required
            autoComplete="new-password"
          />
        </label>
        <label className="field">
          <span>Nhập lại mật khẩu mới</span>
          <input
            name="confirm"
            type="password"
            required
            autoComplete="new-password"
          />
        </label>
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Đang đổi…" : "Đổi mật khẩu"}
        </button>
      </form>

      <p className="muted small" style={{ marginBottom: 0 }}>
        Đổi mật khẩu không làm bạn bị đăng xuất trên máy này.
      </p>
    </section>
  );
}
```

- [ ] **Step 3: Nhúng vào `src/app/settings/page.tsx`**

Thêm `import { PasswordForm } from "./password-form";` và đặt `<PasswordForm />` ngay sau `</section>` của khối "Công thức giá".

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: không lỗi.

- [ ] **Step 5: Kiểm bằng preview**

Vào `/settings`, đổi mật khẩu với mật khẩu hiện tại **sai** → hiện "Mật khẩu hiện tại không đúng." Đổi với hai ô mới lệch nhau → hiện "Hai ô mật khẩu mới không khớp nhau." Đổi đúng → hiện banner ✓, đăng xuất rồi đăng nhập lại bằng mật khẩu mới thành công. Chụp màn hình.

- [ ] **Step 6: Commit**

```bash
git add src/app/settings
git commit -m "$(cat <<'MSG'
tài khoản: tự đổi mật khẩu ở màn Cài đặt

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Phần 2 — Xoá có kiểm soát

### Task 6: Module thuần `deletion.ts`

**Files:**
- Create: `src/lib/deletion.ts`
- Test: `tests/deletion.test.ts`

**Interfaces:**
- Consumes: `OrderStatus`, `STATUS_LABELS` (`src/lib/order-status.ts`, đã có).
- Produces:
  - `type DeleteCheck = { ok: true } | { ok: false; reason: string }`
  - `type OrderDeleteFacts = { status: OrderStatus; cnySpent: number; paymentCount: number; expenseCount: number }`
  - `canDeleteOrder(facts: OrderDeleteFacts): DeleteCheck`
  - `canDeleteCustomer(facts: { orderCount: number }): DeleteCheck`

- [ ] **Step 1: Viết test**

Tạo `tests/deletion.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canDeleteCustomer,
  canDeleteOrder,
  type OrderDeleteFacts,
} from "../src/lib/deletion.ts";

const clean: OrderDeleteFacts = {
  status: "khach_chot",
  cnySpent: 0,
  paymentCount: 0,
  expenseCount: 0,
};

test("đơn sạch ở Khách chốt thì xoá được", () => {
  assert.deepEqual(canDeleteOrder(clean), { ok: true });
});

test("đơn đã trừ ví ¥ bị chặn, thông báo nói rõ số tệ", () => {
  const r = canDeleteOrder({ ...clean, status: "da_mua_tq", cnySpent: 320 });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.reason, /320/);
    assert.match(r.reason, /Hủy|Sự cố/);
  }
});

test("đơn đã có phiếu thu bị chặn", () => {
  const r = canDeleteOrder({ ...clean, paymentCount: 1 });
  assert.equal(r.ok, false);
});

test("đơn đã có chi phí gắn vào bị chặn", () => {
  const r = canDeleteOrder({ ...clean, expenseCount: 2 });
  assert.equal(r.ok, false);
});

test("ba trạng thái đã cộng tồn kho đều bị chặn", () => {
  for (const status of ["ve_kho_vn", "hoan_tat", "khach_bom"] as const) {
    const r = canDeleteOrder({ ...clean, status });
    assert.equal(r.ok, false, `phải chặn ${status}`);
  }
});

test("đơn đã mua nhưng chưa tiêu ¥ nào (đơn 0 tệ) vẫn xoá được", () => {
  assert.deepEqual(canDeleteOrder({ ...clean, status: "da_mua_tq" }), {
    ok: true,
  });
});

test("đơn đã huỷ và đơn sự cố còn sạch thì xoá được", () => {
  assert.deepEqual(canDeleteOrder({ ...clean, status: "huy" }), { ok: true });
  assert.deepEqual(canDeleteOrder({ ...clean, status: "su_co" }), { ok: true });
});

test("khách còn đơn thì không xoá được, thông báo nói rõ số đơn", () => {
  const r = canDeleteCustomer({ orderCount: 3 });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /3/);
  assert.deepEqual(canDeleteCustomer({ orderCount: 0 }), { ok: true });
});
```

- [ ] **Step 2: Chạy test, xác nhận nó hỏng**

Run: `node --test tests/deletion.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/deletion.ts'`

- [ ] **Step 3: Viết `src/lib/deletion.ts`**

```ts
/**
 * Luật xoá đơn và khách (v6).
 *
 * Chính sách: xoá CỨNG, nhưng chỉ với đơn CHƯA để lại dấu vết nào. Không
 * dùng xoá mềm — xoá mềm buộc thêm điều kiện lọc vào rất nhiều câu SQL đang
 * có (danh sách, ba báo cáo tài chính, ví ¥, tồn kho); sót một chỗ là báo
 * cáo sai âm thầm.
 *
 * Module thuần, không phụ thuộc DB.
 */
import { STATUS_LABELS, type OrderStatus } from "./order-status.ts";

export type DeleteCheck = { ok: true } | { ok: false; reason: string };

export type OrderDeleteFacts = {
  status: OrderStatus;
  /** Tổng ¥ đã trừ khỏi ví cho đơn này (Σ các dòng 'chi'/'dieu_chinh'). */
  cnySpent: number;
  paymentCount: number;
  expenseCount: number;
};

/**
 * Ba trạng thái này nghĩa là tồn kho đã được cộng theo đơn — xoá đơn thì số
 * tồn còn đó mà nguồn gốc biến mất.
 */
const STOCK_TOUCHED: readonly OrderStatus[] = [
  "ve_kho_vn",
  "hoan_tat",
  "khach_bom",
];

export function canDeleteOrder(facts: OrderDeleteFacts): DeleteCheck {
  if (facts.cnySpent > 0)
    return {
      ok: false,
      reason: `Đơn đã trừ ${facts.cnySpent}¥ khỏi ví — dùng Hủy hoặc Sự cố thay vì xoá.`,
    };

  if (facts.paymentCount > 0)
    return {
      ok: false,
      reason: `Đơn đã có ${facts.paymentCount} phiếu thu tiền — xoá phiếu thu trước, hoặc dùng Hủy.`,
    };

  if (facts.expenseCount > 0)
    return {
      ok: false,
      reason: `Đơn đã có ${facts.expenseCount} khoản chi ghi vào sổ — xoá khoản chi trước, hoặc dùng Hủy.`,
    };

  if (STOCK_TOUCHED.includes(facts.status))
    return {
      ok: false,
      reason: `Đơn ở "${STATUS_LABELS[facts.status]}" đã cộng tồn kho — không xoá được.`,
    };

  return { ok: true };
}

export function canDeleteCustomer(facts: {
  orderCount: number;
}): DeleteCheck {
  if (facts.orderCount > 0)
    return {
      ok: false,
      reason: `Khách còn ${facts.orderCount} đơn — xoá đơn trước.`,
    };
  return { ok: true };
}
```

- [ ] **Step 4: Chạy test, xác nhận xanh**

Run: `node --test tests/deletion.test.ts`
Expected: PASS — 8 test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/deletion.ts tests/deletion.test.ts
git commit -m "$(cat <<'MSG'
xoá: luật xoá đơn và khách trong module thuần

Chặn theo dấu vết thật (ví ¥, phiếu thu, chi phí, tồn kho) chứ không theo
trạng thái đơn thuần — đơn 0 tệ ở "Đã mua" vẫn xoá được.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 7: Bảng `deletion_log` + tầng xoá

**Files:**
- Modify: `src/db/schema.ts` (thêm bảng `deletion_log`)
- Create: `src/db/deletion.ts`
- Create: `drizzle/0003_*.sql` (sinh bằng `npm run db:generate`)

**Interfaces:**
- Consumes: `canDeleteOrder`, `canDeleteCustomer`, `DeleteCheck` (Task 6); `withTx`, `raw`, `NOW_EPOCH_SQL` (`src/db/raw.ts`); `deletePhotoFile` (`src/lib/storage.ts`).
- Produces:
  - `type DeleteResult = { ok: true } | { ok: false; reason: string }`
  - `deleteOrderCascade(orderId: number, deletedBy: string): Promise<DeleteResult>`
  - `deleteCustomerRow(customerId: number, deletedBy: string): Promise<DeleteResult>`
  - `type DeletionLogRow = { id: number; entity: "order" | "customer"; entityId: number; deletedBy: string; deletedAt: Date; snapshot: string }`
  - `listDeletionLog(limit?: number): Promise<DeletionLogRow[]>`

- [ ] **Step 1: Thêm bảng vào `src/db/schema.ts`**

```ts
export const DELETION_ENTITIES = ["order", "customer"] as const;

// 12) Nhật ký xoá (v6). Xoá là không hoàn tác được — bảng này là thứ duy
// nhất trả lời được "đơn đó đi đâu mất rồi?" khi có nhiều người dùng.
export const deletionLog = pgTable("deletion_log", {
  id: serial("id").primaryKey(),
  entity: text("entity", { enum: DELETION_ENTITIES }).notNull(),
  entityId: integer("entity_id").notNull(),
  deletedBy: text("deleted_by").notNull(),
  deletedAt: epochSeconds("deleted_at").notNull().default(NOW_EPOCH),
  /** JSON: bản chụp dữ liệu trước khi xoá. */
  snapshot: text("snapshot").notNull(),
});
```

- [ ] **Step 2: Sinh và áp migration**

Run: `npm run db:generate && npm run db:migrate`
Expected: tạo `drizzle/0003_<tên>.sql` chứa `CREATE TABLE "deletion_log"`, áp xong không lỗi.

- [ ] **Step 3: Viết `src/db/deletion.ts`**

```ts
import "server-only";
import { basename } from "node:path";
import { raw, withTx, NOW_EPOCH_SQL, type Exec } from "./raw";
import { deletePhotoFile } from "@/lib/storage";
import {
  canDeleteCustomer,
  canDeleteOrder,
  type OrderDeleteFacts,
} from "@/lib/deletion";
import type { OrderStatus } from "@/lib/order-status";

export type DeleteResult = { ok: true } | { ok: false; reason: string };

/** Ghi nhật ký. Gọi BÊN TRONG transaction đang mở — dùng `x`, không dùng `raw`. */
async function logDeletion(
  x: Exec,
  entity: "order" | "customer",
  entityId: number,
  deletedBy: string,
  snapshot: unknown,
): Promise<void> {
  await x.run(
    `INSERT INTO deletion_log (entity, entity_id, deleted_by, deleted_at, snapshot)
     VALUES (?, ?, ?, ${NOW_EPOCH_SQL}, ?)`,
    [entity, entityId, deletedBy, JSON.stringify(snapshot)],
  );
}

/**
 * Xoá cứng một đơn. Cascade của FK tự dọn order_items, photos,
 * order_status_history, order_packages, payments.
 *
 * File ảnh trên Supabase Storage KHÔNG nằm trong cascade — phải đọc file_path
 * TRƯỚC khi xoá, rồi xoá file SAU khi transaction commit.
 */
export async function deleteOrderCascade(
  orderId: number,
  deletedBy: string,
): Promise<DeleteResult> {
  const facts = await raw.get<{
    status: OrderStatus;
    cnySpent: number;
    paymentCount: number;
    expenseCount: number;
  }>(
    `SELECT o.status AS status,
            COALESCE((SELECT SUM(-l.cny_delta) FROM cny_ledger l
                       WHERE l.order_id = o.id
                         AND l.kind IN ('chi','dieu_chinh')), 0)  AS "cnySpent",
            (SELECT COUNT(*)::int FROM payments p
              WHERE p.order_id = o.id)                            AS "paymentCount",
            (SELECT COUNT(*)::int FROM expenses e
              WHERE e.order_id = o.id)                            AS "expenseCount"
       FROM orders o WHERE o.id = ?`,
    [orderId],
  );
  if (!facts) return { ok: false, reason: "Không tìm thấy đơn." };

  const check = canDeleteOrder(facts as OrderDeleteFacts);
  if (!check.ok) return check;

  // Đọc tên file ảnh trước — sau khi xoá hàng thì không còn đường lấy.
  const photoRows = await raw.all<{ filePath: string }>(
    `SELECT file_path AS "filePath" FROM photos WHERE order_id = ?`,
    [orderId],
  );

  try {
    await withTx(async (x) => {
      const order = await x.get<Record<string, unknown>>(
        "SELECT * FROM orders WHERE id = ?",
        [orderId],
      );
      const items = await x.all<Record<string, unknown>>(
        "SELECT * FROM order_items WHERE order_id = ? ORDER BY id",
        [orderId],
      );
      const history = await x.all<Record<string, unknown>>(
        "SELECT * FROM order_status_history WHERE order_id = ? ORDER BY id",
        [orderId],
      );

      await logDeletion(x, "order", orderId, deletedBy, {
        order,
        items,
        history,
        photoPaths: photoRows.map((p) => p.filePath),
      });

      await x.run("DELETE FROM orders WHERE id = ?", [orderId]);
    });
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }

  // Dữ liệu đã sạch; file lỗi thì chỉ còn ảnh mồ côi trong bucket, không chặn.
  for (const p of photoRows) {
    try {
      await deletePhotoFile(basename(p.filePath));
    } catch {
      // bỏ qua có chủ đích
    }
  }

  return { ok: true };
}

export async function deleteCustomerRow(
  customerId: number,
  deletedBy: string,
): Promise<DeleteResult> {
  const facts = await raw.get<{ orderCount: number }>(
    `SELECT (SELECT COUNT(*)::int FROM orders o WHERE o.customer_id = ?)
              AS "orderCount"`,
    [customerId],
  );
  const check = canDeleteCustomer({ orderCount: facts?.orderCount ?? 0 });
  if (!check.ok) return check;

  try {
    await withTx(async (x) => {
      const customer = await x.get<Record<string, unknown>>(
        "SELECT * FROM customers WHERE id = ?",
        [customerId],
      );
      if (!customer) throw new Error("Không tìm thấy khách.");
      await logDeletion(x, "customer", customerId, deletedBy, { customer });
      await x.run("DELETE FROM customers WHERE id = ?", [customerId]);
    });
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
  return { ok: true };
}

export type DeletionLogRow = {
  id: number;
  entity: "order" | "customer";
  entityId: number;
  deletedBy: string;
  deletedAt: Date;
  snapshot: string;
};

export async function listDeletionLog(limit = 200): Promise<DeletionLogRow[]> {
  const rows = await raw.all<{
    id: number;
    entity: "order" | "customer";
    entityId: number;
    deletedBy: string;
    deletedAt: string | number;
    snapshot: string;
  }>(
    `SELECT id, entity, entity_id AS "entityId", deleted_by AS "deletedBy",
            deleted_at AS "deletedAt", snapshot
       FROM deletion_log ORDER BY id DESC LIMIT ?`,
    [limit],
  );
  return rows.map((r) => ({
    ...r,
    deletedAt: new Date(Number(r.deletedAt) * 1000),
  }));
}
```

- [ ] **Step 4: Kiểm `deletePhotoFile` có đúng chữ ký đang dùng**

Run: `grep -n "export async function deletePhotoFile" -A 4 src/lib/storage.ts`
Expected: nhận đúng một tham số là tên file. Nếu khác, chỉnh lời gọi cho khớp (đường gọi mẫu đã có sẵn ở `src/app/orders/actions.ts:362` trong `deletePhotoAction`).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: không lỗi.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts src/db/deletion.ts drizzle/
git commit -m "$(cat <<'MSG'
xoá: bảng deletion_log và tầng xoá đơn/khách

Nhật ký ghi trong cùng transaction với việc xoá. Ảnh trên Storage không nằm
trong cascade nên đọc file_path trước, xoá file sau khi commit.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 8: UI xoá đơn / xoá khách + màn nhật ký xoá

**Files:**
- Modify: `src/app/orders/actions.ts` (thêm `deleteOrderAction`)
- Create: `src/app/orders/[id]/danger-zone.tsx`
- Modify: `src/app/orders/[id]/page.tsx` (nhúng vào tab "Ảnh" — tab cuối)
- Create: `src/app/customers/actions.ts`
- Modify: `src/app/customers/page.tsx` (chuyển danh sách sang client component)
- Create: `src/app/customers/customers-list.tsx`
- Create: `src/app/admin/deletions/page.tsx`

**Interfaces:**
- Consumes: `deleteOrderCascade`, `deleteCustomerRow`, `listDeletionLog` (Task 7); `requireAdmin`, `Session` (Task 3).
- Produces:
  - `deleteOrderAction(formData: FormData): Promise<void>` — form gửi `orderId`
  - `deleteCustomerAction(formData: FormData): Promise<void>` — form gửi `customerId`

- [ ] **Step 1: Thêm `deleteOrderAction` vào `src/app/orders/actions.ts`**

Nối vào cuối file:

```ts
import { deleteOrderCascade } from "@/db/deletion";

/**
 * Xoá cứng một đơn. CHỈ admin. Đơn đã có dấu vết tiền/kho bị tầng dưới chặn
 * và trả lý do cụ thể — hiện lại trên chính màn chi tiết đơn.
 */
export async function deleteOrderAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/");

  const orderId = Number(formData.get("orderId"));
  if (!Number.isInteger(orderId) || orderId <= 0) redirect("/orders");

  const result = await deleteOrderCascade(orderId, session.username);
  if (!result.ok) {
    redirect(`/orders/${orderId}?tab=anh&err=${encodeURIComponent(result.reason)}`);
  }

  revalidatePath("/orders");
  redirect("/orders");
}
```

- [ ] **Step 2: Viết `src/app/orders/[id]/danger-zone.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Sheet } from "../../_components/sheet";
import { deleteOrderAction } from "../actions";

export function DangerZone({
  orderId,
  summary,
}: {
  orderId: number;
  /** Ví dụ: "Nguyễn A · 2 món · 4.520.000 ₫" */
  summary: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <section className="card">
        <h2 className="card-title">Vùng nguy hiểm</h2>
        <p className="muted small">
          Xoá đơn là không khôi phục được. Đơn đã trừ ví ¥, đã thu tiền hoặc đã
          cộng tồn kho sẽ bị chặn — dùng <strong>Hủy</strong> hoặc{" "}
          <strong>Sự cố</strong> cho những đơn đó.
        </p>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => setOpen(true)}
        >
          Xoá đơn #{orderId}
        </button>
      </section>

      <Sheet
        open={open}
        title={`Xoá đơn #${orderId}`}
        onClose={() => setOpen(false)}
        footer={
          <div className="sheet-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setOpen(false)}
            >
              Huỷ
            </button>
            <form action={deleteOrderAction}>
              <input type="hidden" name="orderId" value={orderId} />
              <button type="submit" className="btn btn-danger">
                Xoá đơn
              </button>
            </form>
          </div>
        }
      >
        <p>{summary}</p>
        <p className="muted">Không khôi phục được.</p>
      </Sheet>
    </>
  );
}
```

- [ ] **Step 3: Nhúng vào `src/app/orders/[id]/page.tsx`**

Thêm import `import { DangerZone } from "./danger-zone";`. Trong nhánh `{tab === "anh" && (...)}`, thêm ở cuối — chỉ hiện với admin:

```tsx
{session.role === "admin" && (
  <DangerZone
    orderId={order.id}
    summary={`${customer?.name ?? "Chưa có khách"} · ${items.length} món · ${formatVnd(order.quotedTotalVnd)}`}
  />
)}
```

Trang đã có `err` từ `searchParams` và đã render `{err && <div className="error">{err}</div>}` — kiểm lại chỗ đó còn nguyên; nếu chưa có thì thêm ngay dưới `<OrderTabs …>`.

- [ ] **Step 4: Viết `src/app/customers/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { deleteCustomerRow } from "@/db/deletion";

export async function deleteCustomerAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/");

  const customerId = Number(formData.get("customerId"));
  if (!Number.isInteger(customerId) || customerId <= 0) redirect("/customers");

  const result = await deleteCustomerRow(customerId, session.username);
  if (!result.ok) {
    redirect(`/customers?err=${encodeURIComponent(result.reason)}`);
  }

  revalidatePath("/customers");
  redirect("/customers");
}
```

- [ ] **Step 5: Viết `src/app/customers/customers-list.tsx`**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { ListRow } from "../_components/list-row";
import { Sheet } from "../_components/sheet";
import { deleteCustomerAction } from "./actions";

export type CustomerItem = {
  id: number;
  name: string;
  phone: string | null;
  orderCount: number;
  outstandingText: string | null;
  warningFlag: boolean;
  warningReason: string | null;
};

export function CustomersList({
  customers,
  canDelete,
}: {
  customers: CustomerItem[];
  canDelete: boolean;
}) {
  const [picked, setPicked] = useState<CustomerItem | null>(null);

  return (
    <>
      {customers.map((c) => (
        <ListRow
          key={c.id}
          // Nhân viên: chạm để xem đơn như cũ. Admin: chạm mở sheet có nút xoá.
          href={canDelete ? undefined : `/orders?q=${encodeURIComponent(c.name)}`}
          onClick={canDelete ? () => setPicked(c) : undefined}
          title={
            <>
              {c.warningFlag && (
                <span
                  className="warn-dot"
                  title={c.warningReason ?? "Khách có cờ cảnh báo"}
                />
              )}
              {c.name}
            </>
          }
          meta={`${c.phone ?? "—"} · ${c.orderCount} đơn`}
          amount={c.outstandingText ?? undefined}
        />
      ))}

      <Sheet
        open={picked !== null}
        title={picked ? picked.name : ""}
        onClose={() => setPicked(null)}
      >
        {picked && (
          <div className="sheet-menu">
            <Link
              href={`/orders?q=${encodeURIComponent(picked.name)}`}
              className="sheet-item"
            >
              Xem {picked.orderCount} đơn của khách
            </Link>
            <form action={deleteCustomerAction}>
              <input type="hidden" name="customerId" value={picked.id} />
              <button type="submit" className="btn btn-danger">
                Xoá khách
              </button>
            </form>
            <p className="muted small">
              Khách còn đơn thì không xoá được — xoá đơn trước.
            </p>
          </div>
        )}
      </Sheet>
    </>
  );
}
```

- [ ] **Step 6: Sửa `src/app/customers/page.tsx` để dùng component trên**

```tsx
import { requireAuth } from "@/lib/auth";
import { AppShell } from "../_components/app-shell";
import { listCustomersWithTotals } from "@/db/queries";
import { formatVnd } from "@/lib/format";
import { CustomersList, type CustomerItem } from "./customers-list";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const [session, { err }, customers] = await Promise.all([
    requireAuth(),
    searchParams,
    listCustomersWithTotals(),
  ]);

  const items: CustomerItem[] = customers.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    orderCount: c.orderCount,
    outstandingText: c.outstanding > 0 ? formatVnd(c.outstanding) : null,
    warningFlag: c.warningFlag,
    warningReason: c.warningReason,
  }));

  return (
    <AppShell username={session.username} title="Khách hàng">
      {err && <div className="error">{err}</div>}
      {items.length === 0 ? (
        <div className="card empty">
          <p>Chưa có khách nào. Khách sẽ được tạo khi lên đơn.</p>
        </div>
      ) : (
        <CustomersList
          customers={items}
          canDelete={session.role === "admin"}
        />
      )}
    </AppShell>
  );
}
```

- [ ] **Step 7: Viết `src/app/admin/deletions/page.tsx`**

```tsx
import { requireAdmin } from "@/lib/auth";
import { listDeletionLog } from "@/db/deletion";
import { AppShell } from "../../_components/app-shell";
import { formatDateTime } from "@/lib/format";

const ENTITY_LABELS: Record<"order" | "customer", string> = {
  order: "Đơn",
  customer: "Khách",
};

export default async function DeletionsPage() {
  const [session, rows] = await Promise.all([
    requireAdmin(),
    listDeletionLog(),
  ]);

  return (
    <AppShell username={session.username} title="Nhật ký xoá" backHref="/">
      {rows.length === 0 ? (
        <div className="card empty">
          <p>Chưa có gì bị xoá.</p>
        </div>
      ) : (
        rows.map((r) => (
          <details key={r.id} className="card">
            <summary>
              {ENTITY_LABELS[r.entity]} #{r.entityId} · {r.deletedBy} ·{" "}
              {formatDateTime(r.deletedAt)}
            </summary>
            <div className="table-scroll">
              <pre className="small">
                {JSON.stringify(JSON.parse(r.snapshot), null, 2)}
              </pre>
            </div>
          </details>
        ))
      )}
    </AppShell>
  );
}
```

Kiểm chữ ký `formatDateTime`: `grep -n "export function formatDateTime" -A 3 src/lib/format.ts`. Nếu nó nhận `Date` thì truyền thẳng như trên; nếu nhận epoch-seconds thì đổi thành `formatDateTime(Math.floor(r.deletedAt.getTime() / 1000))`.

- [ ] **Step 8: Typecheck + test**

Run: `npx tsc --noEmit && npm test`
Expected: không lỗi, test xanh.

- [ ] **Step 9: Kiểm bằng preview**

1. Tạo một đơn mới ở "Khách chốt" không cọc → mở tab **Ảnh** → Xoá đơn → xoá được, quay về `/orders`, đơn biến mất.
2. Vào `/admin/deletions` → thấy dòng vừa xoá, mở ra có JSON đơn + món.
3. Lấy một đơn đã ở "Đã mua, đang về" có ¥ > 0 → bấm Xoá → phải hiện lỗi *"Đơn đã trừ …¥ khỏi ví — dùng Hủy hoặc Sự cố thay vì xoá."*
4. Vào `/customers`, chạm một khách còn đơn → Xoá khách → hiện *"Khách còn N đơn — xoá đơn trước."*
5. Đăng nhập bằng tài khoản nhân viên → không thấy nút xoá ở cả hai màn.

Chụp màn hình bước 1, 3, 5.

- [ ] **Step 10: Commit**

```bash
git add src/app/orders src/app/customers src/app/admin
git commit -m "$(cat <<'MSG'
xoá: nút xoá đơn và xoá khách cho admin, kèm màn nhật ký xoá

Nhân viên không thấy nút; server action kiểm lại vai trò chứ không dựa vào
việc giấu nút. Đơn có dấu vết tiền/kho bị chặn kèm lý do cụ thể.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Phần 3 — Nhập đơn theo giá phải thu

### Task 9: `cnyFromSellPrice` + nới `validateLineItem`

**Files:**
- Modify: `src/lib/line-pricing.ts` (thêm hàm)
- Modify: `src/lib/money.ts` (`validateLineItem`)
- Test: `tests/line-pricing.test.ts` (thêm test)
- Test: `tests/money.test.ts` (sửa test cũ + thêm test)

**Interfaces:**
- Consumes: `PricingLine`, `lineCostVnd` (đã có trong `line-pricing.ts`).
- Produces:
  - `cnyFromSellPrice(sellVnd: number, sellRate: number, defaultMargin: number): number`
  - `marginFromSellPrice(sellVnd: number, line: PricingLine, sellRate: number): number`

- [ ] **Step 1: Thêm test vào `tests/line-pricing.test.ts`**

Thêm import `cnyFromSellPrice, marginFromSellPrice` vào khối import sẵn có, rồi nối vào cuối file:

```ts
test("suy ngược ¥ từ giá phải thu", () => {
  // 1.000.000 − 170.000 lời = 830.000 tiền hàng; / 3600 = 230,555… → 230,56
  assert.equal(cnyFromSellPrice(1_000_000, 3600, 170_000), 230.56);
});

test("giá thu thấp hơn hoặc bằng lời mặc định → ¥ = 0", () => {
  assert.equal(cnyFromSellPrice(170_000, 3600, 170_000), 0);
  assert.equal(cnyFromSellPrice(50_000, 3600, 170_000), 0);
});

test("tỷ giá không hợp lệ → ¥ = 0, không chia cho 0", () => {
  assert.equal(cnyFromSellPrice(1_000_000, 0, 170_000), 0);
  assert.equal(cnyFromSellPrice(1_000_000, -1, 170_000), 0);
});

test("lời của dòng là phần dư: Σ giá bán khớp đúng giá thu × SL", () => {
  const sell = 1_000_000;
  const rate = 3600;
  const cny = cnyFromSellPrice(sell, rate, 170_000);
  const l: PricingLine = { quantity: 2, unitPriceCny: cny, marginVnd: 0 };
  const margin = marginFromSellPrice(sell, l, rate);
  assert.equal(lineSellVnd({ ...l, marginVnd: margin }, rate), sell * 2);
});

test("phần lẻ do làm tròn ¥ rơi vào lời, Total không lệch 1₫", () => {
  const rate = 3600;
  const lines = [
    { sell: 1_000_000, qty: 2 },
    { sell: 450_000, qty: 1 },
    { sell: 333_333, qty: 3 },
  ];
  const built = lines.map(({ sell, qty }) => {
    const unitPriceCny = cnyFromSellPrice(sell, rate, 170_000);
    const base: PricingLine = { quantity: qty, unitPriceCny, marginVnd: 0 };
    return { ...base, marginVnd: marginFromSellPrice(sell, base, rate) };
  });
  const expected = lines.reduce((s, l) => s + l.sell * l.qty, 0);
  assert.equal(quotedTotalFromLines(built, rate), expected);
});
```

- [ ] **Step 2: Chạy test, xác nhận nó hỏng**

Run: `node --test tests/line-pricing.test.ts`
Expected: FAIL — `cnyFromSellPrice is not a function` (hoặc lỗi import).

- [ ] **Step 3: Thêm hai hàm vào cuối `src/lib/line-pricing.ts`**

```ts
/**
 * Suy ngược giá ¥ mỗi đơn vị từ GIÁ PHẢI THU của khách (v6 — đảo chiều nhập).
 *
 *   ¥ = (giá_thu − lời_mặc_định) / tỷ_giá_bán
 *
 * Người chốt đơn biết giá thu của khách, không biết giá ¥ ở shop TQ. Số trả
 * về là số MÁY ĐOÁN — dòng dùng nó phải giữ cost_confirmed = false, đúng quy
 * ước sẵn có: giá vốn chưa xác nhận không vào phần "chắc chắn" của báo cáo.
 *
 * Giá thu ≤ lời mặc định → 0 (toàn bộ giá thu là lời). Tỷ giá ≤ 0 → 0.
 */
export function cnyFromSellPrice(
  sellVnd: number,
  sellRate: number,
  defaultMargin: number,
): number {
  if (!(sellRate > 0)) return 0;
  const goods = Math.round(sellVnd) - Math.round(defaultMargin);
  if (!(goods > 0)) return 0;
  return Math.round((goods / sellRate) * 100) / 100;
}

/**
 * Lời của một dòng khi nhập theo giá phải thu = phần dư.
 *
 *   lời = giá_thu × SL − giá_vốn_dòng
 *
 * Vì ¥ đã bị làm tròn hai số lẻ, phần lẻ tự rơi vào đây — nhờ vậy Σ giá bán
 * khớp ĐÚNG Total, không lệch 1₫. Luật này bị test khoá.
 */
export function marginFromSellPrice(
  sellVnd: number,
  line: PricingLine,
  sellRate: number,
): number {
  return Math.round(sellVnd) * line.quantity - lineCostVnd(line, sellRate);
}
```

- [ ] **Step 4: Chạy test, xác nhận xanh**

Run: `node --test tests/line-pricing.test.ts`
Expected: PASS — mọi test cũ vẫn xanh, 5 test mới xanh.

- [ ] **Step 5: Sửa test của `validateLineItem` trong `tests/money.test.ts`**

Mở `tests/money.test.ts`, tìm test đang khẳng định `unitPriceCny <= 0` là lỗi. Thay bằng:

```ts
test("dòng thiếu giá ¥ vẫn hợp lệ — cờ thiếu giá vốn lo phần nhắc", () => {
  assert.deepEqual(validateLineItem({ quantity: 1, unitPriceCny: 0 }), []);
});

test("số lượng phải lớn hơn 0", () => {
  const errs = validateLineItem({ quantity: 0, unitPriceCny: 100 });
  assert.equal(errs.length, 1);
  assert.equal(errs[0].field, "quantity");
});

test("giá ¥ âm vẫn bị chặn", () => {
  const errs = validateLineItem({ quantity: 1, unitPriceCny: -1 });
  assert.equal(errs.length, 1);
  assert.equal(errs[0].field, "unitPriceCny");
});
```

Nếu file chưa import `validateLineItem`, thêm vào khối import.

- [ ] **Step 6: Chạy test, xác nhận nó hỏng**

Run: `node --test tests/money.test.ts`
Expected: FAIL ở test đầu — hiện `validateLineItem` vẫn trả lỗi khi `unitPriceCny = 0`.

- [ ] **Step 7: Nới `validateLineItem` trong `src/lib/money.ts`**

Thay thân hàm (dòng 70–77):

```ts
/**
 * Giá ¥ KHÔNG bắt buộc (spec v3-A): đơn tạo từ ảnh chốt hoặc nhập theo giá
 * phải thu (v6) có thể chưa biết giá vốn — cờ `thieu_gia_von` của order-gaps
 * lo phần nhắc bổ sung. Chỉ chặn số ÂM, vì âm là dữ liệu hỏng chứ không phải
 * "chưa biết".
 */
export function validateLineItem(item: LineItemLike): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!(item.quantity > 0))
    errors.push({ field: "quantity", message: "Số lượng phải lớn hơn 0" });
  if (item.unitPriceCny < 0)
    errors.push({ field: "unitPriceCny", message: "Đơn giá không được âm" });
  return errors;
}
```

- [ ] **Step 8: Sửa thông báo lỗi ở `src/app/orders/actions.ts`**

Dòng ~110 hiện ghi `"số lượng và đơn giá phải lớn hơn 0"` — sai kể từ giờ. Thay bằng thông báo lấy từ chính kết quả kiểm:

```ts
  for (const it of items) {
    const errs = validateLineItem(it);
    if (errs.length > 0)
      return {
        error: `Sản phẩm "${it.name}": ${errs.map((e) => e.message).join("; ")}.`,
      };
  }
```

- [ ] **Step 9: Chạy toàn bộ test + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: tất cả xanh.

- [ ] **Step 10: Commit**

```bash
git add src/lib/line-pricing.ts src/lib/money.ts src/app/orders/actions.ts tests/line-pricing.test.ts tests/money.test.ts
git commit -m "$(cat <<'MSG'
giá: suy ngược ¥ từ giá phải thu, bỏ ràng buộc ¥ > 0

validateLineItem trước đây bắt buộc unitPriceCny > 0 trong khi form client
không kiểm và comment ngay trên đó ghi ngược lại — món chưa biết giá vốn bị
server chặn với thông báo sai lệch. Giờ chỉ chặn số âm.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 10: `createOrder` trả `itemIds` + `linkPhotoToOrderItem`

**Files:**
- Modify: `src/db/queries.ts` (`createOrder`, thêm `linkPhotoToOrderItem`)
- Modify: `src/app/orders/actions.ts` (nơi gọi `createOrder`)
- Modify: `src/app/inventory/actions.ts` (nơi gọi thứ hai)

**Interfaces:**
- Consumes: `NewOrderInput` (đã có).
- Produces:
  - `createOrder(input: NewOrderInput): Promise<{ orderId: number; itemIds: number[] }>` — `itemIds` cùng thứ tự với `input.items`
  - `linkPhotoToOrderItem(photoId: number, orderItemId: number, orderId: number): Promise<void>`

- [ ] **Step 1: Đổi vòng lặp chèn món trong `createOrder` để thu id**

Trong `src/db/queries.ts`, thay khối `for (const [i, it] of input.items.entries())` bằng:

```ts
    const itemIds: number[] = [];
    for (const [i, it] of input.items.entries()) {
      const row = await x.get<{ id: number }>(
        `INSERT INTO order_items
           (order_id, product_url, name, attributes, quantity, unit_price_cny,
            margin_vnd, cost_confirmed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id`,
        [
          orderId,
          it.productUrl ?? null,
          it.name,
          it.attributes ?? null,
          it.quantity,
          it.unitPriceCny,
          margins[i],
          it.costConfirmed ?? false,
        ],
      );
      itemIds.push(row!.id);
    }
```

- [ ] **Step 2: Đổi giá trị trả về và kiểu hàm**

Đổi chữ ký:

```ts
export async function createOrder(
  input: NewOrderInput,
): Promise<{ orderId: number; itemIds: number[] }> {
```

và câu `return orderId;` ở cuối `withTx` thành:

```ts
    return { orderId, itemIds };
```

- [ ] **Step 3: Thêm `linkPhotoToOrderItem` ngay dưới `linkPhotoToOrder`**

```ts
/**
 * Gắn một ảnh đã tải lên vào ĐÚNG dòng sản phẩm (v6).
 *
 * Cột photos.order_item_id có trong schema từ MVP nhưng trước v6 chưa đường
 * nào ghi vào. Điều kiện `order_id IS NULL` giữ nguyên tinh thần của
 * linkPhotoToOrder: chỉ gắn ảnh chưa thuộc đơn nào, không cướp ảnh của đơn khác.
 */
export async function linkPhotoToOrderItem(
  photoId: number,
  orderItemId: number,
  orderId: number,
): Promise<void> {
  await raw.run(
    `UPDATE photos SET order_id = ?, order_item_id = ?
      WHERE id = ? AND order_id IS NULL`,
    [orderId, orderItemId, photoId],
  );
}
```

- [ ] **Step 4: Sửa nơi gọi trong `src/app/orders/actions.ts`**

Khối `let orderId: number;` … `orderId = await createOrder({…})` đổi thành:

```ts
  let created: { orderId: number; itemIds: number[] };
  try {
    created = await createOrder({
      customerId,
      newCustomer,
      orderType,
      exchangeRate,
      quotedTotalVnd,
      shippingFee,
      shipStatus,
      deposit,
      note,
      items,
      changedBy: session.username,
    });
  } catch (err) {
    return { error: `Không tạo được đơn: ${(err as Error).message}` };
  }
  const orderId = created.orderId;
```

Phần còn lại của hàm (gắn `zaloPhotoId`, `revalidatePath`, `redirect`) giữ nguyên — biến `orderId` vẫn tồn tại.

- [ ] **Step 5: Sửa nơi gọi trong `src/app/inventory/actions.ts:83`**

```ts
  const { orderId } = await createOrder({
```

(giữ nguyên phần thân object và mọi dòng sau đó dùng `orderId`).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: không lỗi. Nếu còn chỗ nào dùng giá trị trả về của `createOrder` như số, tsc sẽ chỉ ra.

- [ ] **Step 7: Chạy test + kiểm bằng preview**

Run: `npm test`
Expected: xanh.

Preview: tạo một đơn mới và một lần nhập kho chủ động (`/inventory`, nút `+`) — cả hai phải tạo được như trước. Kiểm SQL: `SELECT id, order_id FROM order_items ORDER BY id DESC LIMIT 5;`

- [ ] **Step 8: Commit**

```bash
git add src/db/queries.ts src/app/orders/actions.ts src/app/inventory/actions.ts
git commit -m "$(cat <<'MSG'
đơn: createOrder trả về id từng món, thêm linkPhotoToOrderItem

Cần id món (đúng thứ tự) để gắn ảnh vào đúng dòng ở bước sau. Cột
photos.order_item_id có từ MVP nhưng chưa đường nào ghi vào.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 11: Sheet thêm món — ô giá phải thu + ảnh theo món

**Files:**
- Modify: `src/app/orders/new/types.ts`
- Modify: `src/app/orders/new/item-sheet.tsx`
- Create: `src/app/orders/new/item-photos.tsx`

**Interfaces:**
- Consumes: `cnyFromSellPrice` (Task 9); `deletePhotoAction` (đã có ở `src/app/orders/actions.ts`); `/api/upload` (đã có).
- Produces:
  - `type ItemPhoto = { id: number; url: string }`
  - `ItemRow` thêm hai trường: `sellPriceVnd: string`, `photos: ItemPhoto[]`
  - `<ItemPhotos value={ItemPhoto[]} onChange={(next: ItemPhoto[]) => void} />`

- [ ] **Step 1: Mở rộng `src/app/orders/new/types.ts`**

```ts
/** Ảnh đã upload xong, gắn vào một dòng món. */
export type ItemPhoto = { id: number; url: string };

export type ItemRow = {
  name: string;
  productUrl: string;
  attributes: string;
  quantity: string;
  /** Giá phải thu của khách cho 1 CÁI (₫) — ô nhập chính từ v6. */
  sellPriceVnd: string;
  /** Giá vốn ¥ mỗi cái. Từ v6 thường là số suy ngược từ sellPriceVnd. */
  unitPriceCny: string;
  /** false = giá ¥ do máy gợi ý, chưa ai xác nhận. */
  costConfirmed: boolean;
  photos: ItemPhoto[];
};

export const emptyItem: ItemRow = {
  name: "",
  productUrl: "",
  attributes: "",
  quantity: "1",
  sellPriceVnd: "",
  unitPriceCny: "",
  costConfirmed: true,
  photos: [],
};
```

Giữ nguyên `CustomerOption`, `DroppedPhoto`, `PendingPhoto` ở cuối file.

- [ ] **Step 2: Viết `src/app/orders/new/item-photos.tsx`**

```tsx
"use client";

import { useRef, useState } from "react";
import { deletePhotoAction } from "../actions";
import type { ItemPhoto } from "./types";

/**
 * Chọn nhiều ảnh cho MỘT món. Upload ngay lúc chọn (label=product, chưa có
 * orderId) — ảnh được gắn vào dòng món sau khi đơn được tạo.
 *
 * Ảnh mồ côi khi bỏ đơn giữa chừng: chấp nhận, giống hành vi sẵn có của
 * luồng nhập nhanh từ ảnh.
 */
export function ItemPhotos({
  value,
  onChange,
}: {
  value: ItemPhoto[];
  onChange: (next: ItemPhoto[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("label", "product");
    for (const f of list) fd.append("files", f);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok !== true) {
        setError(data.error ?? "Tải ảnh thất bại");
      } else {
        const added: ItemPhoto[] = (data.ids as number[]).map((id) => ({
          id,
          url: `/api/photo/${id}`,
        }));
        onChange([...value, ...added]);
      }
    } catch {
      setError("Lỗi mạng khi tải ảnh");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(id: number) {
    // Gỡ khỏi form trước để người dùng thấy ngay; xoá trên server sau.
    onChange(value.filter((p) => p.id !== id));
    try {
      await deletePhotoAction(id);
    } catch {
      // Xoá server hỏng thì ảnh vẫn đã biến mất khỏi form — không chặn.
    }
  }

  return (
    <div className="field">
      <span>Ảnh sản phẩm</span>
      <div className="item-photos">
        {value.map((p) => (
          <span key={p.id} className="item-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt="" />
            <button
              type="button"
              className="item-photo-x"
              onClick={() => remove(p.id)}
              aria-label="Xoá ảnh"
            >
              ✕
            </button>
          </span>
        ))}
        <button
          type="button"
          className="item-photo-add"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          {busy ? "Đang tải…" : "+ Ảnh"}
        </button>
      </div>
      {error && <div className="error">{error}</div>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => e.target.files && upload(e.target.files)}
      />
    </div>
  );
}
```

- [ ] **Step 3: Thêm CSS vào `src/styles/components.css`**

```css
.item-photos {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}
.item-photo {
  position: relative;
  display: inline-block;
}
.item-photo img {
  width: 64px;
  height: 64px;
  object-fit: cover;
  border-radius: var(--r-2);
  display: block;
}
.item-photo-x {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  background: var(--ink);
  color: #fff;
  line-height: 1;
  font-size: 12px;
}
.item-photo-add {
  width: 64px;
  height: 64px;
  border: 1px dashed var(--line);
  border-radius: var(--r-2);
  background: transparent;
  color: var(--muted);
  font-size: var(--fs-2);
}
```

Nếu tên biến `--sp-2`, `--r-2`, `--ink`, `--line`, `--muted`, `--fs-2` không khớp, mở `src/styles/tokens.css` lấy tên thật đang dùng.

- [ ] **Step 4: Viết lại `src/app/orders/new/item-sheet.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { Sheet } from "../../_components/sheet";
import { cnyFromSellPrice } from "@/lib/line-pricing";
import { emptyItem, type ItemPhoto, type ItemRow } from "./types";
import { ItemPhotos } from "./item-photos";

export function ItemSheet({
  open,
  onClose,
  initial,
  onSave,
  onDelete,
  sellRate,
  defaultMarginVnd,
}: {
  open: boolean;
  onClose: () => void;
  initial: ItemRow | null;
  onSave: (item: ItemRow, addAnother: boolean) => void;
  onDelete?: () => void;
  sellRate: number;
  defaultMarginVnd: number;
}) {
  const [row, setRow] = useState<ItemRow>(initial ?? { ...emptyItem });

  // Mở lại sheet phải nạp đúng món đang sửa — không có dòng này thì lần mở
  // thứ hai vẫn hiện dữ liệu của lần trước.
  useEffect(() => {
    if (open) setRow(initial ?? { ...emptyItem });
  }, [open, initial]);

  const set = (patch: Partial<ItemRow>) => setRow((r) => ({ ...r, ...patch }));
  const num = (s: string) => Number(String(s).replace(/[.,\s]/g, "")) || 0;

  const sell = num(row.sellPriceVnd);
  const valid = row.name.trim() !== "" && Number(row.quantity) > 0 && sell > 0;

  /**
   * Gõ giá thu → suy ngược ¥ và đánh dấu là số máy đoán. Không ghi đè nếu
   * người dùng đã tự gõ ¥ (costConfirmed = true) — giá vốn thật luôn thắng
   * số suy đoán.
   */
  function setSell(v: string) {
    const nextSell = num(v);
    if (row.costConfirmed && row.unitPriceCny.trim() !== "") {
      set({ sellPriceVnd: v });
      return;
    }
    const cny = cnyFromSellPrice(nextSell, sellRate, defaultMarginVnd);
    set({
      sellPriceVnd: v,
      unitPriceCny: cny > 0 ? String(cny) : "",
      costConfirmed: false,
    });
  }

  function save(addAnother: boolean) {
    if (!valid) return;
    onSave(row, addAnother);
    if (addAnother) setRow({ ...emptyItem });
    else onClose();
  }

  return (
    <Sheet
      open={open}
      title={initial ? "Sửa món" : "Thêm món"}
      onClose={onClose}
      footer={
        <div className="sheet-actions">
          {onDelete && (
            <button type="button" className="btn btn-ghost" onClick={onDelete}>
              Xoá món
            </button>
          )}
          {!initial && (
            <button
              type="button"
              className="btn btn-outline"
              disabled={!valid}
              onClick={() => save(true)}
            >
              Lưu &amp; thêm nữa
            </button>
          )}
          <button
            type="button"
            className="btn"
            disabled={!valid}
            onClick={() => save(false)}
          >
            Xong
          </button>
        </div>
      }
    >
      {/* Thứ tự theo cách chốt đơn thật: tên → size/màu → SL → giá THU → ảnh.
          Giá vốn ¥ tụt xuống khối gập: người chốt đơn không biết số đó. */}
      <label className="field">
        <span>Tên hàng *</span>
        <input
          autoFocus
          value={row.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="VD: Giày Nike AF1"
          enterKeyHint="next"
        />
      </label>

      <label className="field">
        <span>Size / màu</span>
        <input
          value={row.attributes}
          onChange={(e) => set({ attributes: e.target.value })}
          placeholder="VD: 42 · trắng"
          enterKeyHint="next"
        />
      </label>

      <label className="field">
        <span>Số lượng *</span>
        <input
          inputMode="numeric"
          value={row.quantity}
          onChange={(e) => set({ quantity: e.target.value })}
          enterKeyHint="next"
        />
      </label>

      <label className="field">
        <span>Giá phải thu (₫) — cho 1 cái *</span>
        <input
          inputMode="numeric"
          value={row.sellPriceVnd}
          onChange={(e) => setSell(e.target.value)}
          placeholder="VD: 1.000.000"
          enterKeyHint="next"
        />
      </label>

      <ItemPhotos
        value={row.photos}
        onChange={(photos: ItemPhoto[]) => set({ photos })}
      />

      <details className="more-fields">
        <summary>Giá vốn &amp; link</summary>
        <label className="field">
          <span>
            Đơn giá ¥{" "}
            {!row.costConfirmed && row.unitPriceCny !== "" && (
              <em className="muted small">(máy tính)</em>
            )}
          </span>
          <input
            inputMode="decimal"
            value={row.unitPriceCny}
            onChange={(e) =>
              // Gõ tay = xác nhận giá vốn, không còn là số máy đoán.
              set({ unitPriceCny: e.target.value, costConfirmed: true })
            }
            className={row.costConfirmed ? undefined : "cny-suggested"}
            placeholder="Chưa biết thì để trống"
            enterKeyHint="next"
          />
        </label>

        <label className="field">
          <span>Link sản phẩm</span>
          <input
            type="url"
            inputMode="url"
            value={row.productUrl}
            onChange={(e) => set({ productUrl: e.target.value })}
            enterKeyHint="done"
          />
        </label>
      </details>
    </Sheet>
  );
}
```

- [ ] **Step 5: Typecheck — tsc sẽ báo `new-order-form.tsx` thiếu prop**

Run: `npx tsc --noEmit`
Expected: FAIL với lỗi ở `new-order-form.tsx` — `<ItemSheet>` thiếu `sellRate`/`defaultMarginVnd`, và các chỗ dựng `ItemRow` thiếu `sellPriceVnd`/`photos`. Đó là đúng — Task 12 sửa nốt. **Không commit ở bước này.**

- [ ] **Step 6: Chuyển sang Task 12 và commit chung**

Task 11 và 12 chạm cùng một luồng; commit khi cả hai xong để không để lại bản build hỏng.

---

### Task 12: Màn tạo đơn — Total = Σ dòng, gửi lời và ảnh theo món

**Files:**
- Modify: `src/app/orders/new/new-order-form.tsx`
- Modify: `src/app/orders/new/quick-import-sheet.tsx` (dựng `ItemRow` đủ trường)
- Modify: `src/app/orders/actions.ts` (`createOrderAction` nhận `sellPriceVnd`, `photoIds`)
- Modify: `src/db/queries.ts` (`NewOrderItemInput` thêm `marginVnd`)

**Interfaces:**
- Consumes: `ItemRow`, `ItemPhoto` (Task 11); `cnyFromSellPrice`, `marginFromSellPrice`, `allocateMargins` (Task 9); `createOrder`, `linkPhotoToOrderItem` (Task 10).
- Produces: form gửi `items` là JSON mảng `{ name, productUrl, attributes, quantity, unitPriceCny, costConfirmed, marginVnd, photoIds }`.

- [ ] **Step 1: Kiểm `NewOrderItemInput` đã có `marginVnd` chưa**

Run: `grep -n "NewOrderItemInput" -A 12 src/db/queries.ts | head -20`
Nếu chưa có `marginVnd?: number`, thêm vào type đó. (`createOrder` đã đọc `it.marginVnd` qua biến `hasMargins`, nên nhiều khả năng đã có.)

- [ ] **Step 2: Sửa `applyItemsFromExtract` và `new-order-form.tsx`**

Trong `src/app/orders/new/new-order-form.tsx`:

a) Bỏ state `quotedTotal` khỏi thân form và thêm state ghi đè:

```tsx
  // Total giờ là Σ các dòng. Ô này chỉ để GHI ĐÈ khi khách trả số tròn.
  const [totalOverride, setTotalOverride] = useState("");
```

Mọi chỗ đang gọi `setQuotedTotal` trong `applyMoneyPatch` đổi thành `setTotalOverride`, và `quotedTotal` trong `onExtract`/`QuickImportSheet` đổi thành `totalOverride` (ảnh chốt đơn cho biết Total khách đã đồng ý — đó đúng là một lần ghi đè).

b) `parsedItems` mang thêm giá thu, lời và ảnh:

```tsx
  const parsedItems = useMemo(
    () =>
      items.map((it) => {
        const quantity = num(it.quantity);
        const unitPriceCny = num(it.unitPriceCny);
        const sell = num(it.sellPriceVnd);
        const line = { quantity, unitPriceCny, marginVnd: 0 };
        return {
          name: it.name.trim(),
          productUrl: it.productUrl.trim(),
          attributes: it.attributes.trim(),
          quantity,
          unitPriceCny,
          costConfirmed: it.costConfirmed,
          sellVnd: sell,
          // Lời là PHẦN DƯ của dòng — phần lẻ do làm tròn ¥ rơi vào đây, nhờ
          // vậy Σ giá bán khớp đúng Total.
          marginVnd: marginFromSellPrice(sell, line, num(exchangeRate)),
          photoIds: it.photos.map((p) => p.id),
        };
      }),
    [items, exchangeRate],
  );
```

Thêm import: `import { cnyFromSellPrice, marginFromSellPrice, allocateMargins, suggestCnyFromTotal } from "@/lib/line-pricing";`

c) Total và lời:

```tsx
  const validItems = parsedItems.filter((it) => it.name !== "");
  const goodsTotalCny = sumLineItemsCny(validItems);
  const goodsVnd = Math.round(goodsTotalCny * num(exchangeRate));

  /** Σ giá bán các dòng — Total mặc định của đơn từ v6. */
  const linesTotal = validItems.reduce(
    (s, it) => s + it.sellVnd * it.quantity,
    0,
  );
  const overrideVnd = num(totalOverride);
  const totalVnd = totalOverride.trim() !== "" ? overrideVnd : linesTotal;

  /**
   * Ghi đè Total → lời từng dòng phải rải lại để Σ giá bán vẫn đúng bằng
   * Total. Tính ngay ở client rồi gửi lời đã rải đi (createOrder đi nhánh
   * hasMargins, không tự rải nữa).
   */
  const sentItems = useMemo(() => {
    if (totalOverride.trim() === "" || validItems.length === 0)
      return parsedItems;
    const margins = allocateMargins(
      overrideVnd,
      validItems.map((it) => ({
        quantity: it.quantity,
        unitPriceCny: it.unitPriceCny,
        marginVnd: it.marginVnd,
      })),
      num(exchangeRate),
      defaultMarginVnd,
    );
    let k = 0;
    return parsedItems.map((it) =>
      it.name === "" ? it : { ...it, marginVnd: margins[k++] },
    );
  }, [parsedItems, validItems, totalOverride, overrideVnd, exchangeRate, defaultMarginVnd]);

  const marginVnd = totalVnd - goodsVnd;
```

d) Input ẩn `items` gửi `sentItems`:

```tsx
        <input type="hidden" name="items" value={JSON.stringify(sentItems)} />
        <input type="hidden" name="quotedTotalVnd" value={totalVnd} />
```

e) Điều kiện lưu — giá thu bắt buộc thay cho ¥:

```tsx
  const canSubmit =
    validItems.length > 0 &&
    validItems.every((it) => it.quantity > 0 && it.sellVnd > 0) &&
    num(exchangeRate) > 0 &&
    totalVnd > 0;
```

f) Bỏ ô "Tổng chốt khách" khỏi khối `<h2 className="sec-label">Tiền</h2>` (giữ ô Cọc), và thêm ô ghi đè vào khối gập:

```tsx
        <details className="more-fields">
          <summary>Tỷ giá · ship · loại đơn</summary>
          <label className="field">
            <span>Chốt số khác với tổng món (₫)</span>
            <input
              inputMode="numeric"
              value={totalOverride}
              onChange={(e) => setTotalOverride(e.target.value)}
              onFocus={(e) =>
                setTotalOverride(e.target.value.replace(/[.,\s]/g, ""))
              }
              onBlur={(e) => setTotalOverride(groupDigits(e.target.value))}
              placeholder={`Bỏ trống = ${linesTotal.toLocaleString("vi-VN")}`}
            />
          </label>
          {/* … các ô Tỷ giá / Phí ship / Loại đơn / Ghi chú giữ nguyên … */}
        </details>
```

g) Thẻ món hiện thumbnail và giá thu:

```tsx
            <button
              key={i}
              type="button"
              className="item-card"
              onClick={() => setItemSheet({ open: true, index: i })}
            >
              {it.photos[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.photos[0].url} alt="" className="ic-thumb" />
              )}
              <span className="ic-name">{it.name || "(chưa đặt tên)"}</span>
              <span className="ic-meta">
                {it.attributes || "—"} · ×{it.quantity || 0}
              </span>
              <span className="ic-price num">
                {it.sellPriceVnd ? `${groupDigits(it.sellPriceVnd)}₫` : "—"}
              </span>
            </button>
```

h) Truyền hai prop mới vào `<ItemSheet>`:

```tsx
      <ItemSheet
        open={itemSheet.open}
        onClose={() => setItemSheet({ open: false })}
        initial={
          itemSheet.open && itemSheet.index !== null
            ? items[itemSheet.index]
            : null
        }
        onSave={saveItem}
        onDelete={
          itemSheet.open && itemSheet.index !== null ? deleteItem : undefined
        }
        sellRate={num(exchangeRate)}
        defaultMarginVnd={defaultMarginVnd}
      />
```

i) `applyItemsFromExtract` phải dựng `ItemRow` đủ trường mới — ảnh chốt đơn cho biết Total, không cho biết giá từng món, nên suy giá thu bằng cách chia đều:

```tsx
    const totalForFallback = order.totalVnd ?? num(currentTotalStr);
    const perLineSell =
      order.items.length > 0
        ? Math.round(totalForFallback / order.items.length)
        : 0;
    const fallbackCny = suggestCnyFromTotal(
      totalForFallback,
      order.items.length,
      defaultExchangeRate,
      defaultMarginVnd,
    );

    const newRows: ItemRow[] = order.items.map((it, i) => {
      const cny = fromHistory[i] ?? fallbackCny;
      return {
        name: it.name,
        productUrl: "",
        attributes: itemAttributes(it),
        quantity: String(it.quantity || 1),
        sellPriceVnd: perLineSell > 0 ? String(perLineSell) : "",
        unitPriceCny: cny > 0 ? String(cny) : "",
        costConfirmed: false,
        photos: [],
      };
    });
```

- [ ] **Step 3: Sửa `quick-import-sheet.tsx` nếu nó tự dựng `ItemRow`**

Run: `grep -n "emptyItem\|ItemRow" src/app/orders/new/quick-import-sheet.tsx`
Nếu có chỗ dựng object `ItemRow` bằng tay, thêm `sellPriceVnd: ""` và `photos: []`. Nếu chỉ dùng `emptyItem` thì không phải sửa gì.

- [ ] **Step 4: Sửa `createOrderAction` để đọc trường mới và gắn ảnh**

Trong `src/app/orders/actions.ts`, khối parse `items`:

```ts
  // Sản phẩm. photoIds tách riêng: chúng không thuộc NewOrderItemInput,
  // chỉ dùng sau khi đã có id món thật.
  let items: NewOrderItemInput[] = [];
  let photoIdsByItem: number[][] = [];
  try {
    const parsed = JSON.parse(String(formData.get("items") ?? "[]"));
    if (Array.isArray(parsed)) {
      const kept = parsed.filter(
        (it) => String(it.name ?? "").trim() !== "",
      );
      items = kept.map((it) => ({
        name: String(it.name ?? "").trim(),
        productUrl: String(it.productUrl ?? "").trim() || null,
        attributes: String(it.attributes ?? "").trim() || null,
        quantity: Number(it.quantity) || 0,
        unitPriceCny: Number(it.unitPriceCny) || 0,
        // Người gõ tay = đã xác nhận; số máy suy ngược thì form gửi false.
        costConfirmed: it.costConfirmed === true,
        marginVnd: Number(it.marginVnd) || 0,
      }));
      photoIdsByItem = kept.map((it) =>
        Array.isArray(it.photoIds)
          ? (it.photoIds as unknown[])
              .map((n) => Number(n))
              .filter((n) => Number.isInteger(n) && n > 0)
          : [],
      );
    }
  } catch {
    return { error: "Dữ liệu sản phẩm không hợp lệ." };
  }
```

Sau khi tạo đơn (ngay trước khối `zaloPhotoId`):

```ts
  // Gắn ảnh sản phẩm vào ĐÚNG dòng món. Lỗi ở đây không được chặn việc tạo
  // đơn — đơn đã nằm trong DB rồi, ảnh gắn thiếu thì bổ sung ở tab Ảnh.
  for (const [i, ids] of photoIdsByItem.entries()) {
    const itemId = created.itemIds[i];
    if (!itemId) continue;
    for (const photoId of ids) {
      try {
        await linkPhotoToOrderItem(photoId, itemId, orderId);
      } catch {
        // bỏ qua có chủ đích
      }
    }
  }
```

Thêm `linkPhotoToOrderItem` vào khối import từ `@/db/queries`.

- [ ] **Step 5: Thêm CSS cho thumbnail thẻ món**

Trong `src/styles/components.css`, thêm vào phần `.item-card`:

```css
.item-card .ic-thumb {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: var(--r-1);
  grid-row: span 2;
}
```

Mở `.item-card` sẵn có xem nó dùng grid hay flex rồi chỉnh cho khớp — mục tiêu là ảnh nằm bên trái, tên và meta bên phải.

- [ ] **Step 6: Typecheck + test**

Run: `npx tsc --noEmit && npm test`
Expected: không lỗi, test xanh.

- [ ] **Step 7: Kiểm bằng preview — đây là task đáng kiểm kỹ nhất**

1. `/orders/new` → chọn khách → **+ Thêm món**: nhập tên, SL 2, giá thu `1.000.000`. Mở khối gập → ô ¥ phải tự có `230.56` với nhãn *(máy tính)* (giả sử tỷ giá 3600, lời 170.000; số khác thì tính lại theo công thức).
2. Chọn 2 ảnh → thumbnail hiện trong Sheet, thẻ món hiện ảnh đầu.
3. Thanh dưới: **Tổng 2.000.000**. Lưu đơn.
4. Mở đơn vừa tạo → tab **Món**: `quoted_total_vnd` = 2.000.000, Σ giá bán các dòng = đúng 2.000.000. Kiểm SQL:
   ```sql
   SELECT o.quoted_total_vnd,
          SUM(ROUND(i.quantity * i.unit_price_cny * o.exchange_rate) + i.margin_vnd)::int AS sum_sell
     FROM orders o JOIN order_items i ON i.order_id = o.id
    WHERE o.id = <id> GROUP BY o.quoted_total_vnd;
   ```
   Hai số phải bằng nhau.
5. Kiểm ảnh đã gắn đúng dòng: `SELECT id, order_id, order_item_id FROM photos WHERE order_id = <id>;` → `order_item_id` không NULL.
6. Tạo đơn thứ hai, nhập ô **"Chốt số khác với tổng món"** = `1.900.000` → Total của đơn phải là 1.900.000 và Σ giá bán vẫn khớp (chạy lại SQL trên).
7. Kiểm cỡ chữ ô nhập:
   ```js
   [...document.querySelectorAll("input,select,textarea")].map(el=>getComputedStyle(el).fontSize)
   ```
   Expected: tất cả `"16px"`.

Chụp màn hình Sheet thêm món (có ảnh + ô giá thu) và tab Món của đơn đã tạo.

- [ ] **Step 8: Commit (gộp Task 11 + 12)**

```bash
git add src/app/orders src/styles/components.css src/db/queries.ts
git commit -m "$(cat <<'MSG'
nhập đơn: nhập theo giá phải thu, ảnh gắn thẳng vào từng món

Người chốt đơn biết giá thu của khách chứ không biết giá ¥ — giờ nhập giá
thu cho 1 cái, máy suy ngược ¥ và đánh dấu là số chưa xác nhận. Total của
đơn là Σ các dòng; ô ghi đè chuyển vào khối gập cho trường hợp khách trả số
tròn. Lời là phần dư nên Σ giá bán vẫn khớp Total không lệch 1₫.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Phần 4 — Chuyển trạng thái hàng loạt

### Task 13: Module thuần `bulk-status.ts` + `goodsTotalCny` trong danh sách đơn

**Files:**
- Create: `src/lib/bulk-status.ts`
- Test: `tests/bulk-status.test.ts`
- Modify: `src/db/queries.ts` (`OrderListRow` + `listOrders` thêm `goodsTotalCny`)

**Interfaces:**
- Consumes: `allowedNextStatuses`, `isTerminalFor`, `STATUS_LABELS`, `OrderStatus`, `OrderType` (`src/lib/order-status.ts`).
- Produces:
  - `type BulkOrder = { id: number; orderType: OrderType; status: OrderStatus; goodsTotalCny: number }`
  - `type BulkGroup = { from: OrderStatus; to: OrderStatus; ids: number[]; cnyTotal: number }`
  - `type BulkPlan = { groups: BulkGroup[]; skipped: { id: number; reason: string }[]; total: number }`
  - `planBulkAdvance(orders: BulkOrder[]): BulkPlan`
  - `BULK_LIMIT = 50`

- [ ] **Step 1: Viết test**

Tạo `tests/bulk-status.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BULK_LIMIT,
  planBulkAdvance,
  type BulkOrder,
} from "../src/lib/bulk-status.ts";

const o = (
  id: number,
  status: BulkOrder["status"],
  orderType: BulkOrder["orderType"] = "order_ho",
  goodsTotalCny = 0,
): BulkOrder => ({ id, status, orderType, goodsTotalCny });

test("gom các đơn cùng phép chuyển vào một nhóm", () => {
  const plan = planBulkAdvance([
    o(1, "da_mua_tq"),
    o(2, "da_mua_tq"),
    o(3, "da_mua_tq"),
  ]);
  assert.equal(plan.groups.length, 1);
  assert.equal(plan.groups[0].from, "da_mua_tq");
  assert.equal(plan.groups[0].to, "da_giao_khach");
  assert.deepEqual(plan.groups[0].ids, [1, 2, 3]);
  assert.equal(plan.total, 3);
});

test("trộn loại đơn: mỗi đơn tiến trên trục của riêng nó", () => {
  const plan = planBulkAdvance([
    o(1, "da_mua_tq", "order_ho"),
    o(2, "da_mua_tq", "nhap_kho"),
  ]);
  const tos = plan.groups.map((g) => g.to).sort();
  assert.deepEqual(tos, ["da_giao_khach", "ve_kho_vn"]);
});

test("cộng dồn ¥ của nhóm đi tới 'đã mua' — cảnh báo tiêu tiền thật", () => {
  const plan = planBulkAdvance([
    o(1, "khach_chot", "order_ho", 320),
    o(2, "khach_chot", "order_ho", 920),
  ]);
  assert.equal(plan.groups.length, 1);
  assert.equal(plan.groups[0].to, "da_mua_tq");
  assert.equal(plan.groups[0].cnyTotal, 1240);
});

test("nhóm không đi tới 'đã mua' thì cnyTotal = 0", () => {
  const plan = planBulkAdvance([o(1, "da_mua_tq", "order_ho", 500)]);
  assert.equal(plan.groups[0].cnyTotal, 0);
});

test("đơn ở bước cuối bị bỏ qua kèm lý do", () => {
  const plan = planBulkAdvance([o(1, "hoan_tat"), o(2, "da_mua_tq")]);
  assert.equal(plan.groups.length, 1);
  assert.equal(plan.skipped.length, 1);
  assert.equal(plan.skipped[0].id, 1);
  assert.match(plan.skipped[0].reason, /cuối|Hoàn tất/i);
});

test("đơn đang ở sự cố bị bỏ qua — có nhiều đường ra, máy không tự chọn", () => {
  const plan = planBulkAdvance([o(1, "su_co")]);
  assert.equal(plan.groups.length, 0);
  assert.equal(plan.skipped.length, 1);
});

test("danh sách rỗng ra kế hoạch rỗng", () => {
  assert.deepEqual(planBulkAdvance([]), { groups: [], skipped: [], total: 0 });
});

test("giới hạn mỗi lượt là 50 đơn", () => {
  assert.equal(BULK_LIMIT, 50);
});
```

- [ ] **Step 2: Chạy test, xác nhận nó hỏng**

Run: `node --test tests/bulk-status.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/bulk-status.ts'`

- [ ] **Step 3: Viết `src/lib/bulk-status.ts`**

```ts
/**
 * Kế hoạch chuyển bước hàng loạt (v6).
 *
 * Mỗi loại đơn đi một trục riêng nên "bước tiếp theo" khác nhau tuỳ đơn.
 * Module này gom các đơn được chọn thành từng nhóm cùng phép chuyển, để Sheet
 * xác nhận nói rõ chuyện gì sắp xảy ra thay vì bắt người dùng bấm mù.
 *
 * Module thuần, không phụ thuộc DB.
 */
import {
  allowedNextStatuses,
  isTerminalFor,
  STATUS_LABELS,
  type OrderStatus,
  type OrderType,
} from "./order-status.ts";

/** Trần mỗi lượt: thao tác chạy TUẦN TỰ, không được chạm maxDuration Vercel. */
export const BULK_LIMIT = 50;

export type BulkOrder = {
  id: number;
  orderType: OrderType;
  status: OrderStatus;
  goodsTotalCny: number;
};

export type BulkGroup = {
  from: OrderStatus;
  to: OrderStatus;
  ids: number[];
  /** ¥ sẽ bị trừ khỏi ví nếu xác nhận nhóm này. 0 nếu nhóm không tiêu ¥. */
  cnyTotal: number;
};

export type BulkPlan = {
  groups: BulkGroup[];
  skipped: { id: number; reason: string }[];
  /** Số đơn thật sự sẽ chuyển. */
  total: number;
};

/**
 * Bước tiếp theo TRÊN TRỤC của loại đơn — không phải nhánh.
 *
 * `allowedNextStatuses` trả cả nhánh (huỷ, sự cố, khách bom); thao tác hàng
 * loạt chỉ đi thẳng, nên lọc bỏ nhánh. Đơn đang ở `su_co` có nhiều đường ra
 * hợp lệ — máy không tự chọn hộ, bỏ qua để người dùng xử tay từng đơn.
 */
function forwardStep(order: BulkOrder): OrderStatus | null {
  if (order.status === "su_co") return null;
  const branches: readonly OrderStatus[] = ["huy", "su_co", "khach_bom"];
  const next = allowedNextStatuses(order.orderType, order.status).filter(
    (s) => !branches.includes(s),
  );
  return next.length === 1 ? next[0] : null;
}

export function planBulkAdvance(orders: BulkOrder[]): BulkPlan {
  const byKey = new Map<string, BulkGroup>();
  const skipped: { id: number; reason: string }[] = [];

  for (const order of orders) {
    if (isTerminalFor(order.orderType, order.status)) {
      skipped.push({
        id: order.id,
        reason: `"${STATUS_LABELS[order.status]}" là bước cuối của đơn này`,
      });
      continue;
    }

    const to = forwardStep(order);
    if (!to) {
      skipped.push({
        id: order.id,
        reason:
          order.status === "su_co"
            ? "Đơn đang ở Sự cố — chọn hướng xử lý ở từng đơn"
            : `Không có bước tiếp theo từ "${STATUS_LABELS[order.status]}"`,
      });
      continue;
    }

    const key = `${order.status}→${to}`;
    const group = byKey.get(key) ?? {
      from: order.status,
      to,
      ids: [],
      cnyTotal: 0,
    };
    group.ids.push(order.id);
    // Chỉ bước sang "đã mua" mới trừ ví — xem shouldDeductCny.
    if (to === "da_mua_tq") group.cnyTotal += order.goodsTotalCny;
    byKey.set(key, group);
  }

  const groups = [...byKey.values()];
  return {
    groups,
    skipped,
    total: groups.reduce((s, g) => s + g.ids.length, 0),
  };
}
```

- [ ] **Step 4: Chạy test, xác nhận xanh**

Run: `node --test tests/bulk-status.test.ts`
Expected: PASS — 8 test.

- [ ] **Step 5: Thêm `goodsTotalCny` vào `OrderListRow` và `listOrders`**

Trong `src/db/queries.ts`:

```ts
export type OrderListRow = {
  id: number;
  orderType: OrderType;
  status: OrderStatus;
  customerName: string;
  amountDue: number;
  deposit: number;
  /** Cần cho cảnh báo "sẽ trừ …¥" của thao tác hàng loạt (v6). */
  goodsTotalCny: number;
  createdAt: Date;
  statusChangedAt: Date;
  ageDays: number;
  isStale: boolean;
  needsAttention: boolean;
};
```

và thêm vào khối `.select({...})` của `listOrders`:

```ts
      goodsTotalCny: orders.goodsTotalCny,
```

- [ ] **Step 6: Typecheck + toàn bộ test**

Run: `npx tsc --noEmit && npm test`
Expected: không lỗi, tất cả xanh.

- [ ] **Step 7: Commit**

```bash
git add src/lib/bulk-status.ts tests/bulk-status.test.ts src/db/queries.ts
git commit -m "$(cat <<'MSG'
hàng loạt: luật gom nhóm phép chuyển trong module thuần

Mỗi loại đơn một trục nên "bước tiếp theo" khác nhau tuỳ đơn. Nhóm đi tới
"Đã mua" cộng dồn ¥ để Sheet xác nhận cảnh báo được số tiền thật sắp tiêu.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 14: Chọn nhiều đơn + `bulkAdvanceAction`

**Files:**
- Modify: `src/app/orders/actions.ts` (thêm `bulkAdvanceAction`)
- Create: `src/app/orders/orders-list.tsx`
- Create: `src/app/orders/bulk-sheet.tsx`
- Modify: `src/app/orders/page.tsx`
- Modify: `src/styles/components.css`

**Interfaces:**
- Consumes: `planBulkAdvance`, `BULK_LIMIT`, `BulkOrder`, `BulkPlan` (Task 13); `changeOrderStatus` (đã có).
- Produces:
  - `type BulkResult = { ok: number; failed: { id: number; reason: string }[] }`
  - `bulkAdvanceAction(ids: number[]): Promise<BulkResult>`
  - `<OrdersList rows={OrderRowItem[]} />`

- [ ] **Step 1: Viết `bulkAdvanceAction` trong `src/app/orders/actions.ts`**

```ts
import { BULK_LIMIT } from "@/lib/bulk-status";

export type BulkResult = { ok: number; failed: { id: number; reason: string }[] };

/**
 * Chuyển bước tiếp theo cho nhiều đơn.
 *
 * Chạy TUẦN TỰ, không Promise.all: side-effect ví ¥ là đọc-rồi-ghi (tính lại
 * số dư từ cny_ledger rồi ghi dòng mới), chạy song song sẽ đua nhau. Pool
 * cũng chỉ có max: 5.
 *
 * Mỗi đơn đi qua đúng changeOrderStatus — KHÔNG UPDATE thẳng orders.status —
 * để giữ nguyên side-effect ví/kho, dòng lịch sử, và autoCompleteIfPaid.
 */
export async function bulkAdvanceAction(ids: number[]): Promise<BulkResult> {
  const session = await getSession();
  if (!session)
    return { ok: 0, failed: [{ id: 0, reason: "Phiên đăng nhập đã hết hạn." }] };

  const clean = ids
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, BULK_LIMIT);

  const failed: { id: number; reason: string }[] = [];
  let ok = 0;

  for (const id of clean) {
    // Đọc lại trạng thái ngay trước khi chuyển: kế hoạch dựng ở client có thể
    // đã cũ nếu người kia vừa đổi đơn.
    const row = await raw.get<{ orderType: OrderType; status: OrderStatus }>(
      `SELECT order_type AS "orderType", status FROM orders WHERE id = ?`,
      [id],
    );
    if (!row) {
      failed.push({ id, reason: "Không tìm thấy đơn" });
      continue;
    }
    const plan = planBulkAdvance([
      { id, orderType: row.orderType, status: row.status, goodsTotalCny: 0 },
    ]);
    const to = plan.groups[0]?.to;
    if (!to) {
      failed.push({
        id,
        reason: plan.skipped[0]?.reason ?? "Không có bước tiếp theo",
      });
      continue;
    }

    const result = await changeOrderStatus(id, to, session.username);
    if (result.ok) ok += 1;
    else failed.push({ id, reason: result.reason });
  }

  revalidatePath("/orders");
  return { ok, failed };
}
```

Thêm vào các khối import sẵn có của file: `planBulkAdvance` từ `@/lib/bulk-status`, và `raw` từ `@/db/raw`.

- [ ] **Step 2: Viết `src/app/orders/bulk-sheet.tsx`**

```tsx
"use client";

import { Sheet } from "../_components/sheet";
import { STATUS_LABELS } from "@/lib/order-status";
import { formatCny } from "@/lib/format";
import type { BulkPlan } from "@/lib/bulk-status";

export function BulkSheet({
  open,
  plan,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  plan: BulkPlan;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Sheet
      open={open}
      title="Chuyển bước tiếp theo"
      onClose={onClose}
      footer={
        <div className="sheet-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Huỷ
          </button>
          <button
            type="button"
            className="btn"
            disabled={pending || plan.total === 0}
            onClick={onConfirm}
          >
            {pending ? "Đang chuyển…" : `Chuyển ${plan.total} đơn`}
          </button>
        </div>
      }
    >
      {plan.groups.map((g) => (
        <div key={`${g.from}-${g.to}`} className="bulk-group">
          <strong>{g.ids.length} đơn</strong>{" "}
          <span>
            {STATUS_LABELS[g.from]} → {STATUS_LABELS[g.to]}
          </span>
          {g.cnyTotal > 0 && (
            <div className="bulk-warn">
              ⚠ sẽ trừ {formatCny(g.cnyTotal)} khỏi ví
            </div>
          )}
        </div>
      ))}

      {plan.skipped.length > 0 && (
        <div className="bulk-group muted">
          <strong>{plan.skipped.length} đơn</strong> bỏ qua —{" "}
          {plan.skipped[0].reason}
          {plan.skipped.length > 1 && " (và tương tự)"}
        </div>
      )}

      {plan.total === 0 && <p className="muted">Không đơn nào chuyển được.</p>}
    </Sheet>
  );
}
```

- [ ] **Step 3: Viết `src/app/orders/orders-list.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ListRow } from "../_components/list-row";
import { StickyBar } from "../_components/sticky-bar";
import { BULK_LIMIT, planBulkAdvance, type BulkOrder } from "@/lib/bulk-status";
import { bulkAdvanceAction } from "./actions";
import { BulkSheet } from "./bulk-sheet";

/** Dữ liệu đã tính sẵn ở server — component này không truy vấn gì thêm. */
export type OrderRowItem = BulkOrder & {
  href: string;
  customerName: string;
  metaText: string;
  amountText: string;
  hasGap: boolean;
  gapTitle: string;
};

export function OrdersList({ rows }: { rows: OrderRowItem[] }) {
  const router = useRouter();
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const plan = useMemo(
    () => planBulkAdvance(rows.filter((r) => picked.has(r.id))),
    [rows, picked],
  );

  function toggle(id: number) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      // Trần BULK_LIMIT áp ngay ở client để người dùng biết trước, server
      // vẫn cắt lại lần nữa.
      else if (next.size < BULK_LIMIT) next.add(id);
      return next;
    });
  }

  function stopSelecting() {
    setSelecting(false);
    setPicked(new Set());
  }

  async function confirm() {
    setPending(true);
    const result = await bulkAdvanceAction([...picked]);
    setPending(false);
    setConfirmOpen(false);
    stopSelecting();
    setNotice(
      result.failed.length === 0
        ? `Đã chuyển ${result.ok} đơn.`
        : `Đã chuyển ${result.ok}/${result.ok + result.failed.length} đơn — #${result.failed[0].id}: ${result.failed[0].reason}`,
    );
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        className="header-action-float"
        onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
      >
        {selecting ? "Xong" : "Chọn"}
      </button>

      {notice && <div className="ok-banner">{notice}</div>}

      {rows.map((r) => (
        <ListRow
          key={r.id}
          href={selecting ? undefined : r.href}
          onClick={selecting ? () => toggle(r.id) : undefined}
          title={
            <>
              {selecting && (
                <span
                  className={`pick-box${picked.has(r.id) ? " on" : ""}`}
                  aria-hidden="true"
                >
                  {picked.has(r.id) ? "✓" : ""}
                </span>
              )}
              {r.customerName}
              {r.hasGap && <span className="gap-dot" title={r.gapTitle} />}
            </>
          }
          meta={r.metaText}
          amount={r.amountText}
          trailing={<span className="lr-id">#{r.id}</span>}
        />
      ))}

      {selecting && (
        <StickyBar>
          <span className="sb-money">
            <strong>Đã chọn {picked.size}</strong>
          </span>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() =>
              setPicked(new Set(rows.slice(0, BULK_LIMIT).map((r) => r.id)))
            }
          >
            Chọn tất cả
          </button>
          <button
            type="button"
            className="btn"
            disabled={picked.size === 0}
            onClick={() => setConfirmOpen(true)}
          >
            Chuyển bước tiếp →
          </button>
        </StickyBar>
      )}

      <BulkSheet
        open={confirmOpen}
        plan={plan}
        pending={pending}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirm}
      />
    </>
  );
}
```

> **Lưu ý:** `StickyBar` ở đây nằm trong thân trang, không truyền qua `AppShell bottomBar`, nên tabbar **không** tự ẩn. Xử lý ở Step 5 bằng CSS.

- [ ] **Step 4: Sửa `src/app/orders/page.tsx` để dựng `rows` rồi giao cho component**

Giữ nguyên toàn bộ phần truy vấn, lọc, sắp xếp và `ChipBar`. Thay khối render danh sách (từ `{rows.length === 0 ? … }` trở đi) bằng:

```tsx
      {rows.length === 0 ? (
        <div className="card empty">
          {q ? (
            <p>Không tìm thấy đơn khớp «{q}».</p>
          ) : (
            <p>Không có đơn nào ở mục này.</p>
          )}
        </div>
      ) : (
        <OrdersList
          rows={rows.map((o) => ({
            id: o.id,
            orderType: o.orderType,
            status: o.status,
            goodsTotalCny: o.goodsTotalCny,
            href: `/orders/${o.id}`,
            customerName: o.customerName,
            metaText: `${STATUS_LABELS[o.status]} · ${
              o.status === "su_co"
                ? "⚠️ Sự cố"
                : o.isStale
                  ? `⏳ ${o.ageDays} ngày`
                  : `${o.ageDays}n`
            }`,
            amountText: formatVnd(o.amountDue),
            hasGap: o.gaps.length > 0,
            gapTitle: o.gaps.map((g) => GAP_LABELS[g]).join(" · "),
          }))}
        />
      )}
```

Thêm `import { OrdersList } from "./orders-list";`. Bỏ import `ListRow` nếu không còn dùng ở file này.

- [ ] **Step 5: CSS cho ô tick và ẩn tabbar khi đang chọn**

Thêm vào `src/styles/components.css`:

```css
.pick-box {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-right: var(--sp-2);
  border: 2px solid var(--line);
  border-radius: var(--r-1);
  font-size: 14px;
  line-height: 1;
  vertical-align: middle;
}
.pick-box.on {
  background: var(--ink);
  border-color: var(--ink);
  color: #fff;
}

.bulk-group {
  padding: var(--sp-3) 0;
  border-bottom: 1px solid var(--line);
}
.bulk-group:last-child {
  border-bottom: none;
}
.bulk-warn {
  margin-top: var(--sp-1);
  color: var(--danger, #b3261e);
}
```

Và trong `src/styles/layout.css`, để `StickyBar` dựng từ trong thân trang cũng đẩy tabbar đi — thêm luật:

```css
/* Thanh chọn hàng loạt dựng từ trong trang (không qua AppShell bottomBar).
   Tabbar và sticky-bar không bao giờ được chồng lên nhau. */
.app-shell:has(.sticky-bar) .tabbar {
  display: none;
}
```

- [ ] **Step 6: Typecheck + test**

Run: `npx tsc --noEmit && npm test`
Expected: không lỗi, tất cả xanh.

- [ ] **Step 7: Kiểm bằng preview**

1. Tạo 2 đơn `order_ho` ở "Khách chốt" có ¥ > 0 và 1 đơn đã ở "Đã mua, đang về".
2. `/orders` → bấm **Chọn** → tick cả ba → thanh dưới hiện "Đã chọn 3", tabbar biến mất.
3. Bấm **Chuyển bước tiếp** → Sheet phải hiện **hai** nhóm, nhóm `Khách chốt → Đã mua` kèm dòng `⚠ sẽ trừ …¥ khỏi ví` với số bằng tổng ¥ của hai đơn.
4. Xác nhận → banner "Đã chuyển 3 đơn", danh sách cập nhật.
5. Kiểm ví ¥ ở `/finance`: số dư đã trừ đúng, có hai dòng `chi`.
6. Chọn một đơn đã `hoan_tat` → Sheet phải báo bỏ qua và nút bị vô hiệu.
7. Kiểm `order_status_history` có dòng cho từng đơn: `SELECT order_id, from_status, to_status, changed_by FROM order_status_history ORDER BY id DESC LIMIT 5;`

Chụp màn hình bước 2 và 3.

- [ ] **Step 8: Commit**

```bash
git add src/app/orders src/styles
git commit -m "$(cat <<'MSG'
hàng loạt: chọn nhiều đơn và chuyển bước tiếp theo

Chạy tuần tự qua changeOrderStatus để giữ nguyên side-effect ví/kho và lịch
sử. Sheet xác nhận cảnh báo rõ số ¥ sắp bị trừ — chuyển hàng loạt sang "Đã
mua" là tiêu tiền thật, không được để xảy ra sau một cú bấm mù.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Phần 5 — Thêm / xoá món trong đơn đã tạo

### Task 15: Luật Total mới + `addOrderItem` / `removeOrderItem`

Đây là task **nới một luật đang được test khoá**. Phải phân định rạch ròi:
sửa giá ¥ / kéo lời → Total **bất biến** (luật cũ, không đổi); thêm/xoá món →
Total **đổi theo**, vì đó là đổi *phạm vi* đơn chứ không phải đổi *giá*.

**Files:**
- Modify: `src/lib/line-pricing.ts` (hai hàm Total)
- Modify: `src/lib/order-status.ts` (`canEditOrderItems`)
- Test: `tests/line-pricing.test.ts` · `tests/order-status.test.ts`
- Modify: `src/db/queries.ts` (`addOrderItem`, `removeOrderItem`)

**Interfaces:**
- Consumes: `lineSellVnd`, `marginFromSellPrice` (Task 9); `recomputeOrderMoneyRow`, `readOrderMoneyRow` (đã có, private trong `queries.ts`).
- Produces:
  - `totalAfterAddLine(quotedTotal: number, sellVnd: number, quantity: number): number`
  - `totalAfterRemoveLine(quotedTotal: number, removed: PricingLine, sellRate: number): number`
  - `canEditOrderItems(status: OrderStatus): boolean`
  - `addOrderItem(orderId: number, input: { name: string; attributes: string | null; productUrl: string | null; quantity: number; sellVnd: number; unitPriceCny: number; costConfirmed: boolean }): Promise<LineActionResult & { itemId?: number }>`
  - `removeOrderItem(orderId: number, itemId: number): Promise<LineActionResult>`

- [ ] **Step 1: Viết test cho hai hàm Total**

Nối vào `tests/line-pricing.test.ts` (thêm `totalAfterAddLine, totalAfterRemoveLine` vào import):

```ts
test("thêm món: Total tăng đúng giá bán của món mới", () => {
  assert.equal(totalAfterAddLine(2_000_000, 450_000, 2), 2_900_000);
});

test("xoá món: Total giảm đúng giá bán của dòng bị xoá", () => {
  // 60¥ × 4000 = 240.000 giá vốn + 170.000 lời = 410.000 giá bán
  const removed: PricingLine = {
    quantity: 1,
    unitPriceCny: 60,
    marginVnd: 170_000,
  };
  assert.equal(totalAfterRemoveLine(2_000_000, removed, 4000), 1_590_000);
});

test("thêm rồi xoá đúng món đó thì Total quay về số cũ", () => {
  const rate = 4000;
  const sell = 450_000;
  const qty = 2;
  const cny = cnyFromSellPrice(sell, rate, 170_000);
  const base: PricingLine = { quantity: qty, unitPriceCny: cny, marginVnd: 0 };
  const line: PricingLine = {
    ...base,
    marginVnd: marginFromSellPrice(sell, base, rate),
  };
  const after = totalAfterAddLine(2_000_000, sell, qty);
  assert.equal(totalAfterRemoveLine(after, line, rate), 2_000_000);
});
```

- [ ] **Step 2: Viết test cho `canEditOrderItems`**

Nối vào `tests/order-status.test.ts` (thêm `canEditOrderItems` vào import):

```ts
test("đơn đã chốt sổ thì không sửa danh sách món được", () => {
  for (const s of ["hoan_tat", "huy", "khach_bom"] as const) {
    assert.equal(canEditOrderItems(s), false, `phải khoá ${s}`);
  }
});

test("đơn đang chạy thì sửa danh sách món được", () => {
  for (const s of ["khach_chot", "da_mua_tq", "da_giao_khach", "su_co"] as const) {
    assert.equal(canEditOrderItems(s), true, `phải mở ${s}`);
  }
});
```

- [ ] **Step 3: Chạy hai test, xác nhận hỏng**

Run: `node --test tests/line-pricing.test.ts tests/order-status.test.ts`
Expected: FAIL — các hàm chưa tồn tại.

- [ ] **Step 4: Thêm hai hàm vào cuối `src/lib/line-pricing.ts`**

```ts
/**
 * Total sau khi THÊM một món (v6).
 *
 * Luật cũ "Total bất biến" vẫn đúng với thao tác sửa giá ¥ / kéo lời. Thêm
 * hay xoá món là đổi PHẠM VI của đơn, không phải đổi giá — Total đổi theo.
 * Lời các dòng cũ giữ nguyên, không bị rải lại.
 */
export function totalAfterAddLine(
  quotedTotal: number,
  sellVnd: number,
  quantity: number,
): number {
  return Math.round(quotedTotal) + Math.round(sellVnd) * quantity;
}

/** Total sau khi XOÁ một dòng — trừ đúng giá bán của dòng đó. */
export function totalAfterRemoveLine(
  quotedTotal: number,
  removed: PricingLine,
  sellRate: number,
): number {
  return Math.round(quotedTotal) - lineSellVnd(removed, sellRate);
}
```

- [ ] **Step 5: Thêm `canEditOrderItems` vào `src/lib/order-status.ts`**

Đặt ngay dưới `isTerminalFor`:

```ts
/**
 * Đơn đã chốt sổ thì danh sách món khoá lại — sửa món của đơn đã hoàn tất
 * sẽ làm lệch báo cáo lãi của tháng đã chốt.
 */
const ITEMS_LOCKED: readonly OrderStatus[] = ["hoan_tat", "huy", "khach_bom"];

export function canEditOrderItems(status: OrderStatus): boolean {
  return !ITEMS_LOCKED.includes(status);
}
```

- [ ] **Step 6: Chạy test, xác nhận xanh**

Run: `node --test tests/line-pricing.test.ts tests/order-status.test.ts`
Expected: PASS toàn bộ, kể cả các test cũ về "Total bất biến".

- [ ] **Step 7: Thêm `addOrderItem` và `removeOrderItem` vào `src/db/queries.ts`**

Đặt ngay dưới `updateLineMargin`:

```ts
/**
 * Thêm một món vào đơn ĐÃ TẠO (v6). Total tăng thêm giá bán của món mới;
 * lời các dòng cũ KHÔNG bị rải lại — mỗi dòng giữ nguyên lời của nó.
 */
export async function addOrderItem(
  orderId: number,
  input: {
    name: string;
    attributes: string | null;
    productUrl: string | null;
    quantity: number;
    /** Giá phải thu cho 1 cái (₫). */
    sellVnd: number;
    unitPriceCny: number;
    costConfirmed: boolean;
  },
): Promise<LineActionResult & { itemId?: number }> {
  if (input.name.trim() === "")
    return { ok: false, reason: "Chưa nhập tên hàng." };
  if (!(input.quantity > 0))
    return { ok: false, reason: "Số lượng phải lớn hơn 0." };
  if (!(input.sellVnd > 0))
    return { ok: false, reason: "Chưa nhập giá phải thu." };

  try {
    return await withTx(async (x) => {
      const status = await x.get<{ status: OrderStatus }>(
        "SELECT status FROM orders WHERE id = ?",
        [orderId],
      );
      if (!status) throw new Error("Không tìm thấy đơn");
      if (!canEditOrderItems(status.status))
        throw new Error(
          `Đơn ở "${STATUS_LABELS[status.status]}" không sửa được danh sách món.`,
        );

      const order = await readOrderMoneyRow(x, orderId);
      const quoted = (await x.get<{ total: number }>(
        "SELECT quoted_total_vnd AS total FROM orders WHERE id = ?",
        [orderId],
      ))!;

      const line = {
        quantity: input.quantity,
        unitPriceCny: input.unitPriceCny,
        marginVnd: 0,
      };
      const margin = marginFromSellPrice(input.sellVnd, line, order.exchange_rate);

      const row = await x.get<{ id: number }>(
        `INSERT INTO order_items
           (order_id, product_url, name, attributes, quantity, unit_price_cny,
            margin_vnd, cost_confirmed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id`,
        [
          orderId,
          input.productUrl,
          input.name.trim(),
          input.attributes,
          input.quantity,
          input.unitPriceCny,
          margin,
          input.costConfirmed,
        ],
      );

      await x.run("UPDATE orders SET quoted_total_vnd = ? WHERE id = ?", [
        totalAfterAddLine(quoted.total, input.sellVnd, input.quantity),
        orderId,
      ]);

      await recomputeOrderMoneyRow(x, orderId, order);
      return { ok: true, itemId: row!.id } as LineActionResult & {
        itemId?: number;
      };
    });
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

/**
 * Xoá một món khỏi đơn ĐÃ TẠO (v6). Total giảm đúng giá bán của dòng đó.
 * Không xoá được món cuối cùng — đơn phải còn ≥ 1 món; muốn bỏ hẳn thì Xoá
 * đơn hoặc Hủy.
 */
export async function removeOrderItem(
  orderId: number,
  itemId: number,
): Promise<LineActionResult> {
  try {
    return await withTx(async (x) => {
      const status = await x.get<{ status: OrderStatus }>(
        "SELECT status FROM orders WHERE id = ?",
        [orderId],
      );
      if (!status) throw new Error("Không tìm thấy đơn");
      if (!canEditOrderItems(status.status))
        throw new Error(
          `Đơn ở "${STATUS_LABELS[status.status]}" không sửa được danh sách món.`,
        );

      const count = (await x.get<{ n: number }>(
        "SELECT COUNT(*)::int AS n FROM order_items WHERE order_id = ?",
        [orderId],
      ))!;
      if (count.n <= 1)
        throw new Error(
          "Đơn phải còn ít nhất 1 món — dùng Xoá đơn hoặc Hủy thay vì xoá món cuối.",
        );

      const item = await x.get<{
        quantity: number;
        unit_price_cny: number;
        margin_vnd: number;
      }>(
        `SELECT quantity, unit_price_cny, margin_vnd
           FROM order_items WHERE id = ? AND order_id = ?`,
        [itemId, orderId],
      );
      if (!item) throw new Error("Không tìm thấy dòng sản phẩm");

      const order = await readOrderMoneyRow(x, orderId);
      const quoted = (await x.get<{ total: number }>(
        "SELECT quoted_total_vnd AS total FROM orders WHERE id = ?",
        [orderId],
      ))!;

      await x.run("DELETE FROM order_items WHERE id = ? AND order_id = ?", [
        itemId,
        orderId,
      ]);

      await x.run("UPDATE orders SET quoted_total_vnd = ? WHERE id = ?", [
        totalAfterRemoveLine(
          quoted.total,
          {
            quantity: item.quantity,
            unitPriceCny: item.unit_price_cny,
            marginVnd: item.margin_vnd,
          },
          order.exchange_rate,
        ),
        orderId,
      ]);

      await recomputeOrderMoneyRow(x, orderId, order);
      return { ok: true } as LineActionResult;
    });
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}
```

Thêm vào khối import của `queries.ts`: `marginFromSellPrice`, `totalAfterAddLine`, `totalAfterRemoveLine` từ `@/lib/line-pricing`; `canEditOrderItems`, `STATUS_LABELS` từ `@/lib/order-status` (kiểm xem đã import chưa trước khi thêm trùng).

- [ ] **Step 8: Typecheck + toàn bộ test**

Run: `npx tsc --noEmit && npm test`
Expected: không lỗi, tất cả xanh — đặc biệt các test cũ về "Total bất biến khi sửa ¥" phải **vẫn** xanh.

- [ ] **Step 9: Commit**

```bash
git add src/lib/line-pricing.ts src/lib/order-status.ts src/db/queries.ts tests/
git commit -m "$(cat <<'MSG'
đơn: thêm và xoá món trong đơn đã tạo

Nới luật Total có phân định: sửa giá ¥ hay kéo lời thì Total vẫn bất biến;
thêm/xoá món là đổi phạm vi đơn nên Total đổi theo, lời các dòng cũ giữ
nguyên. Đơn đã hoàn tất/huỷ/khách bom bị khoá danh sách món.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 16: UI thêm / xoá món ở tab Món

**Files:**
- Modify: `src/app/orders/actions.ts` (`addItemAction`, `removeItemAction`)
- Create: `src/app/orders/[id]/item-editor.tsx`
- Modify: `src/app/orders/[id]/page.tsx`

**Interfaces:**
- Consumes: `addOrderItem`, `removeOrderItem` (Task 15); `cnyFromSellPrice` (Task 9); `Sheet` (đã có).
- Produces:
  - `addItemAction(formData: FormData): Promise<void>` — nhận `orderId, name, attributes, quantity, sellVnd, unitPriceCny, costConfirmed`
  - `removeItemAction(formData: FormData): Promise<void>` — nhận `orderId, itemId`

- [ ] **Step 1: Thêm hai action vào `src/app/orders/actions.ts`**

```ts
import { addOrderItem, removeOrderItem } from "@/db/queries";

export async function addItemAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const orderId = Number(formData.get("orderId"));
  if (!Number.isInteger(orderId) || orderId <= 0) redirect("/orders");

  const result = await addOrderItem(orderId, {
    name: String(formData.get("name") ?? ""),
    attributes: String(formData.get("attributes") ?? "").trim() || null,
    productUrl: String(formData.get("productUrl") ?? "").trim() || null,
    quantity: num(formData.get("quantity")),
    sellVnd: num(formData.get("sellVnd")),
    unitPriceCny: Number(String(formData.get("unitPriceCny") ?? "0")) || 0,
    costConfirmed: String(formData.get("costConfirmed")) === "true",
  });

  if (!result.ok) {
    redirect(`/orders/${orderId}?tab=mon&err=${encodeURIComponent(result.reason)}`);
  }
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  redirect(`/orders/${orderId}?tab=mon`);
}

export async function removeItemAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const orderId = Number(formData.get("orderId"));
  const itemId = Number(formData.get("itemId"));
  if (!Number.isInteger(orderId) || !Number.isInteger(itemId)) redirect("/orders");

  const result = await removeOrderItem(orderId, itemId);
  if (!result.ok) {
    redirect(`/orders/${orderId}?tab=mon&err=${encodeURIComponent(result.reason)}`);
  }
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  redirect(`/orders/${orderId}?tab=mon`);
}
```

> `num()` là helper sẵn có ở đầu file — nó đã lọc dấu chấm/phẩy phân cách nghìn.

- [ ] **Step 2: Viết `src/app/orders/[id]/item-editor.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Sheet } from "../../_components/sheet";
import { cnyFromSellPrice } from "@/lib/line-pricing";
import { addItemAction } from "../actions";

export function AddItemButton({
  orderId,
  sellRate,
  defaultMarginVnd,
}: {
  orderId: number;
  sellRate: number;
  defaultMarginVnd: number;
}) {
  const [open, setOpen] = useState(false);
  const [sell, setSell] = useState("");
  const [cny, setCny] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const num = (s: string) => Number(String(s).replace(/[.,\s]/g, "")) || 0;

  function onSellChange(v: string) {
    setSell(v);
    if (confirmed) return;
    const next = cnyFromSellPrice(num(v), sellRate, defaultMarginVnd);
    setCny(next > 0 ? String(next) : "");
  }

  function close() {
    setOpen(false);
    setSell("");
    setCny("");
    setConfirmed(false);
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-outline"
        onClick={() => setOpen(true)}
      >
        + Thêm món
      </button>

      <Sheet open={open} title="Thêm món vào đơn" onClose={close}>
        <p className="muted small">
          Thêm món làm <strong>tăng</strong> tổng chốt của đơn thêm đúng giá
          bán của món mới. Lời các món cũ giữ nguyên.
        </p>

        <form action={addItemAction}>
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="unitPriceCny" value={cny} />
          <input
            type="hidden"
            name="costConfirmed"
            value={confirmed ? "true" : "false"}
          />

          <label className="field">
            <span>Tên hàng *</span>
            <input name="name" required autoFocus enterKeyHint="next" />
          </label>

          <label className="field">
            <span>Size / màu</span>
            <input name="attributes" enterKeyHint="next" />
          </label>

          <label className="field">
            <span>Số lượng *</span>
            <input
              name="quantity"
              inputMode="numeric"
              defaultValue="1"
              required
              enterKeyHint="next"
            />
          </label>

          <label className="field">
            <span>Giá phải thu (₫) — cho 1 cái *</span>
            <input
              name="sellVnd"
              inputMode="numeric"
              value={sell}
              onChange={(e) => onSellChange(e.target.value)}
              required
              enterKeyHint="next"
            />
          </label>

          <details className="more-fields">
            <summary>Giá vốn &amp; link</summary>
            <label className="field">
              <span>
                Đơn giá ¥{" "}
                {!confirmed && cny !== "" && (
                  <em className="muted small">(máy tính)</em>
                )}
              </span>
              <input
                inputMode="decimal"
                value={cny}
                onChange={(e) => {
                  setCny(e.target.value);
                  setConfirmed(true);
                }}
                className={confirmed ? undefined : "cny-suggested"}
              />
            </label>
            <label className="field">
              <span>Link sản phẩm</span>
              <input name="productUrl" type="url" inputMode="url" />
            </label>
          </details>

          <button type="submit" className="btn" style={{ width: "100%" }}>
            Thêm món
          </button>
        </form>
      </Sheet>
    </>
  );
}
```

- [ ] **Step 3: Nhúng vào tab Món của `src/app/orders/[id]/page.tsx`**

Thêm import:

```tsx
import { canEditOrderItems } from "@/lib/order-status";
import { removeItemAction } from "../actions";
import { AddItemButton } from "./item-editor";
```

Trong nhánh `{tab === "mon" && (…)}`, thêm nút xoá vào `trailing` của mỗi `ListRow` và nút thêm ở cuối `<section>`. Vì `trailing` có thể đã chứa `<form>` của `lineExceptionAction`, gói cả hai vào một `<span>`:

```tsx
                  trailing={
                    <span className="lr-actions">
                      {/* … phần trailing hiện có giữ nguyên trong này … */}
                      {canEditOrderItems(order.status) && items.length > 1 && (
                        <form action={removeItemAction}>
                          <input type="hidden" name="orderId" value={order.id} />
                          <input type="hidden" name="itemId" value={it.id} />
                          <button
                            type="submit"
                            className="btn btn-sm btn-ghost"
                            aria-label={`Xoá món ${it.name}`}
                          >
                            Xoá
                          </button>
                        </form>
                      )}
                    </span>
                  }
```

> **Quan trọng:** `ListRow` chỉ trả `<div>` tĩnh khi không có `href` và không có `onClick` — đúng trường hợp ở đây, nên `<button>` trong `trailing` không bị lồng vào `<button>`. Nếu đổi `ListRow` này thành có `href`/`onClick` thì hydration sẽ vỡ (đã xảy ra thật ở `PaymentsBlock`).

Ngay sau danh sách món, trong cùng `<section className="card">`:

```tsx
            {canEditOrderItems(order.status) && (
              <AddItemButton
                orderId={order.id}
                sellRate={order.exchangeRate}
                defaultMarginVnd={settings.defaultMarginVnd}
              />
            )}
```

`settings` đã có sẵn trong `Promise.all` ở đầu trang.

- [ ] **Step 4: CSS cho `.lr-actions`**

Thêm vào `src/styles/components.css`:

```css
.lr-actions {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}
```

- [ ] **Step 5: Typecheck + test**

Run: `npx tsc --noEmit && npm test`
Expected: không lỗi, tất cả xanh.

- [ ] **Step 6: Kiểm bằng preview**

1. Mở một đơn đang ở "Khách chốt" có 2 món, Total 2.000.000 → tab **Món**.
2. **+ Thêm món**: tên "Dép", SL 1, giá thu `450.000` → ô ¥ tự có số. Lưu.
3. Total của đơn phải thành **2.450.000**; Σ giá bán vẫn khớp — chạy lại SQL kiểm ở Task 12 Step 7.4.
4. Bấm **Xoá** ở món vừa thêm → Total quay về 2.000.000, Σ vẫn khớp.
5. Xoá tới khi còn 1 món → nút Xoá biến mất (điều kiện `items.length > 1`).
6. Mở một đơn đã `hoan_tat` → không thấy nút Thêm món lẫn nút Xoá.
7. Không có lỗi hydration trong console.

Chụp màn hình bước 2 và bước 6.

- [ ] **Step 7: Commit**

```bash
git add src/app/orders src/styles/components.css
git commit -m "$(cat <<'MSG'
đơn: nút thêm và xoá món ở tab Món của chi tiết đơn

Trước đây đơn tạo xong chỉ sửa được giá của món; khách đặt thêm một đôi là
phải tạo đơn khác.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Phần 6 — Dọn dẹp

### Task 17: Sao lưu, tài liệu và rà cuối

**Files:**
- Modify: `src/app/api/backup/route.ts`
- Modify: `scripts/restore-from-json.ts`
- Modify: `CLAUDE.md`
- Modify: `.env.example`

**Interfaces:**
- Consumes: bảng `users`, `deletion_log` (Task 2, 7).
- Produces: không có API mới.

- [ ] **Step 1: Thêm hai bảng mới vào bản sao lưu**

Trong `src/app/api/backup/route.ts`, thêm vào mảng `TABLES`. **Thứ tự quan trọng khi nạp lại** — `users` không có FK nên đặt đầu; `deletion_log` cũng không có FK, đặt cuối:

```ts
const TABLES = [
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
```

- [ ] **Step 2: Đồng bộ `scripts/restore-from-json.ts`**

Run: `grep -n "TABLES\|users\|deletion_log" scripts/restore-from-json.ts | head -20`

Script này nạp lại theo thứ tự để không vi phạm FK. Thêm `users` và `deletion_log` vào đúng danh sách của nó, cùng thứ tự như trên. Nếu script có bước `TRUNCATE`/`DELETE` theo bảng, thêm hai bảng mới vào đó luôn — thiếu thì khôi phục xong tài khoản cũ vẫn nằm lại.

- [ ] **Step 3: Cập nhật `.env.example`**

Sửa ghi chú của `APP_ACCOUNTS`:

```
# Tài khoản HẠT GIỐNG — chỉ dùng cho lần chạy ĐẦU TIÊN, khi bảng `users` còn
# rỗng. Sau lần đó bảng `users` là nguồn chân lý; thêm/xoá tài khoản làm ở
# màn /admin/users, biến này không còn tác dụng.
# Người ĐẦU TIÊN trong danh sách nhận vai trò admin.
APP_ACCOUNTS=chu:matkhau,nhanvien:matkhau2
```

- [ ] **Step 4: Cập nhật `CLAUDE.md`**

a) Dòng trạng thái ở đầu — thêm sau đoạn v5:

```
**v6 xong** — tài khoản trong DB (bảng `users`, hash scrypt, hai vai trò
`admin`/`nhan_vien`), xoá đơn/khách có kiểm soát kèm nhật ký xoá, nhập đơn
theo giá phải thu (¥ suy ngược) + ảnh gắn theo từng món, chọn nhiều đơn
chuyển bước hàng loạt, thêm/xoá món trong đơn đã tạo. Spec:
`docs/superpowers/specs/2026-08-31-heyp-v6-tai-khoan-quyen-va-nhap-don-design.md`,
kế hoạch: `docs/superpowers/plans/2026-08-31-heyp-v6-tai-khoan-quyen-va-nhap-don.md`.
```

b) Mục **LƯU Ý QUAN TRỌNG** — thêm bốn gạch đầu dòng:

```
- **Đăng nhập đi qua bảng `users`, KHÔNG qua `.env`** (v6) — `APP_ACCOUNTS`
  chỉ là hạt giống cho `ensureUsersSeeded()` lúc bảng còn rỗng. `getSession()`
  đọc DB mỗi request (bọc `cache()` nên 1 truy vấn mỗi lần render) để cờ
  `active` có hiệu lực ngay; trước v6 cookie không đọc DB lần nào nên khoá tài
  khoản chẳng có tác dụng gì suốt 30 ngày. Quên mật khẩu admin duy nhất thì
  phải sửa `password_hash` thẳng trong Supabase.
- **Xoá đơn chỉ dành cho đơn CHƯA có dấu vết** (`src/lib/deletion.ts`) — đã
  trừ ví ¥, đã có phiếu thu, đã có chi phí, hoặc đã cộng tồn kho
  (`ve_kho_vn`/`hoan_tat`/`khach_bom`) thì chặn. KHÔNG dùng xoá mềm: thêm
  điều kiện lọc vào hàng chục câu SQL đang có, sót một chỗ là báo cáo sai âm
  thầm. Mọi lần xoá ghi vào `deletion_log` trong cùng transaction.
- **`quoted_total_vnd` bất biến với thao tác GIÁ, không bất biến với PHẠM VI**
  (v6) — sửa ¥ hay kéo lời thì Total giữ nguyên (luật v3-A, test khoá); thêm
  hoặc xoá món thì Total đổi theo (`totalAfterAddLine`/`totalAfterRemoveLine`)
  và lời các dòng cũ KHÔNG bị rải lại.
- **Nhập đơn theo GIÁ PHẢI THU** (v6) — form gửi lời từng dòng đã tính sẵn,
  `createOrder` đi nhánh `hasMargins` và không tự rải. Chỉ khi ghi đè Total
  thì client mới gọi `allocateMargins` rồi gửi lời đã rải. `¥` là số máy suy
  ngược (`cnyFromSellPrice`) nên luôn mang `cost_confirmed = false`.
```

c) Mục **Tài liệu** — thêm:

```
- Thiết kế v6 (tài khoản, quyền, xoá, nhập đơn): `docs/superpowers/specs/2026-08-31-heyp-v6-tai-khoan-quyen-va-nhap-don-design.md`, kế hoạch: `docs/superpowers/plans/2026-08-31-heyp-v6-tai-khoan-quyen-va-nhap-don.md`
```

d) Mục **Hosting** — sửa dòng Backup: `xuất toàn bộ 12 bảng` → `xuất toàn bộ 14 bảng`.

- [ ] **Step 5: Rà cuối toàn hệ thống**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: tất cả xanh, build thành công.

Kiểm không còn ai gọi `findAccount`:
Run: `grep -rn --include='*.ts' --include='*.tsx' "findAccount" src`
Expected: không có kết quả.

Kiểm không còn ai import `NAV_ITEMS`/`MORE_ITEMS`:
Run: `grep -rn --include='*.tsx' "NAV_ITEMS\|MORE_ITEMS" src`
Expected: không có kết quả.

- [ ] **Step 6: Kiểm bản sao lưu chạy được**

Preview → `/backup` → **Tải bản sao lưu** → mở file JSON, xác nhận có khoá `users` (mật khẩu là chuỗi `scrypt$…`, không phải plaintext) và khoá `deletion_log`.

- [ ] **Step 7: Kiểm cỡ chữ ô nhập trên MỌI form mới**

Mở lần lượt `/admin/users` (cả hai Sheet), `/settings`, `/orders/new` (Sheet thêm món), `/orders/<id>?tab=mon` (Sheet thêm món) và chạy trong console:

```js
[...document.querySelectorAll("input,select,textarea")].map(el=>getComputedStyle(el).fontSize)
```

Expected: mọi giá trị là `"16px"`. Nếu có `"14px"`, luật cũ trong `legacy.css` đang thắng — thêm luật đè trong `components.css` với độ đặc hiệu cao hơn. **Đừng tin bằng mắt.**

- [ ] **Step 8: Commit**

```bash
git add src/app/api/backup/route.ts scripts/restore-from-json.ts CLAUDE.md .env.example
git commit -m "$(cat <<'MSG'
v6: thêm users và deletion_log vào sao lưu, cập nhật tài liệu

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

- [ ] **Step 9: Push**

```bash
git push
```

---

## Rà soát trước khi bàn giao

Sau khi cả 17 task xong, kiểm lại các luật mà spec nói là "sai là mất tiền thật":

- [ ] `npm test` xanh toàn bộ, đặc biệt `line-pricing`, `money`, `order-status`, `deletion`, `bulk-status`, `password`, `roles`.
- [ ] Với mỗi đơn tạo bằng đường mới: `quoted_total_vnd` = Σ giá bán các dòng, không lệch 1₫.
- [ ] Ví ¥ sau một lượt chuyển hàng loạt = số dư trước − Σ ¥ của các đơn bước sang "Đã mua".
- [ ] Xoá một đơn đã trừ ví ¥ bị chặn; xoá đơn sạch thì `deletion_log` có dòng tương ứng với snapshot đầy đủ.
- [ ] Khoá một tài khoản đang đăng nhập ở máy khác → lần tải trang kế tiếp của họ bị đẩy về `/login`.
- [ ] Nhân viên gõ thẳng `/admin/users` và `/admin/deletions` đều bị đẩy về `/`.

## Việc cần báo người dùng khi lên bản

- **Mọi người phải đăng nhập lại một lần** — token đổi định dạng.
- **`APP_ACCOUNTS` hết tác dụng** sau lần đăng nhập đầu tiên. Đổi mật khẩu làm ở `/settings`, thêm người làm ở `/admin/users`.
- **Quên mật khẩu admin duy nhất** = phải sửa `password_hash` thẳng trong Supabase. Nên tạo sẵn tài khoản admin thứ hai.
