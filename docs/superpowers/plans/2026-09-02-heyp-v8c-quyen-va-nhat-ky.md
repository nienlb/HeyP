# HeyP v8-C — Ba bậc quyền và nhật ký hoạt động — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng ba bậc quyền `owner` > `admin` > `member`, vá sáu thao tác hệ trọng đang chỉ kiểm "đã đăng nhập", và ghi nhật ký hoạt động truy vết được ai làm gì.

**Architecture:** Thang bậc vai trò đặt ở module thuần `src/lib/roles.ts` (`atLeast`), mọi chỗ kiểm quyền đi qua `requireRole(min)` trong `auth.ts` thay cho `role === "admin"` rải rác. Nhật ký ghi qua `logActivity()` chạy **sau** thao tác, **ngoài** transaction, **nuốt lỗi** — nhật ký hỏng không được kéo đổ nghiệp vụ tiền. `deletion_log` giữ nguyên trong transaction vì nó là bản chụp để khôi phục, không phải dòng thời gian.

**Tech Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Postgres (Supabase) + Drizzle (`postgres-js`) · `node:test` · CSS thuần.

**Spec:** `docs/superpowers/specs/2026-09-02-heyp-v8c-quyen-va-nhat-ky-design.md`

## Global Constraints

Trích từ `CLAUDE.md` và spec — áp cho MỌI task:

- **KHÔNG làm nút reset DB.** Đã rút khỏi phạm vi trong lúc brainstorm.
- **Ẩn nút KHÔNG phải là chặn quyền.** Mọi thao tác giới hạn phải chặn ở **server action / route**, phần ẩn nút chỉ là lịch sự với người dùng. Nghiệm thu bằng cách gọi thẳng action, không chỉ nhìn giao diện.
- **Nhãn vai trò dùng đúng ba chữ `Owner` / `Admin` / `Member`, không dịch.** Cố ý lệch khỏi luật "UI tiếng Việt" — đây là tên vai trò, không phải câu chữ giao diện.
- **`logActivity` chạy NGOÀI transaction và nuốt lỗi.** Không bao giờ đặt nó trong `withTx`.
- **KHÔNG bao giờ ghi mật khẩu vào nhật ký**, kể cả đã băm. Không truyền `formData` thô vào `detail`.
- **`deletion_log` giữ nguyên trong transaction**, không đụng tới.
- **SQL thô viết placeholder `?`** — lớp `Exec` (`src/db/raw.ts`) tự đổi sang `$1,$2`.
- **Alias camelCase trong SQL thô phải bọc nháy kép**: `AS "entityId"`.
- **`SUM()`/`COUNT()` trên cột `integer` phải ép `::int`.**
- **Thời gian là epoch-seconds `bigint`**; SQL thô dùng hằng `NOW_EPOCH_SQL` trong `raw.ts`.
- **Boolean là `boolean` thật**: SQL so `= true`, JS so `=== true`.
- **Module thuần dùng cho test KHÔNG được import file có alias `@/` ở runtime**; import module thuần khác bằng đuôi `.ts` tường minh. `import type` bị xoá lúc chạy nên không tính.
- **Mọi ô nhập PHẢI `font-size: var(--fs-3)` (16px)** — dưới ngưỡng này Safari iOS tự phóng to trang.
- **UI tiếng Việt** (trừ ba nhãn vai trò ở trên). Tiền VND (₫), tệ (¥).
- **Commit tiếng Việt**, kết thúc bằng `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Lệnh kiểm tra: `npm test` · `npx tsc --noEmit` · một file: `node --test tests/<tên>.test.ts` · `npm run db:migrate` (cần `DIRECT_URL`).
- **KHÔNG chạy `npm run build` khi dev server đang sống** — cả hai ghi vào `.next/`.
- **KHÔNG dùng `npx prettier`** — dự án không có prettier; gọi qua `npx` sẽ tải bản mặc định và format lại cả file. Đã dính thật ở v8-A.
- Chạy dev **không** dùng lệnh shell — dùng công cụ preview của harness (`.claude/launch.json`, tên cấu hình `dev`).

---

## Bản đồ file

**Tạo mới — module thuần (test được):**

| File | Trách nhiệm |
| --- | --- |
| `src/lib/activity-codes.ts` | Mã hành động, nhãn tiếng Việt, danh sách entity |

**Tạo mới — tầng DB:**

| File | Trách nhiệm |
| --- | --- |
| `src/db/activity.ts` | `logActivity`, `listActivity`, `purgeOldActivity` |

**Tạo mới — migration:**

| File | Nội dung |
| --- | --- |
| `drizzle/0006_roles.sql` | Đổi `nhan_vien`→`member`, default mới, nâng `nien` lên `owner` |
| `drizzle/0007_activity_log.sql` | Bảng `activity_log` + 2 index |

**Tạo mới — giao diện:**

| File | Trách nhiệm |
| --- | --- |
| `src/app/(app)/admin/activity/page.tsx` | Màn nhật ký hoạt động |
| `src/app/(app)/admin/activity/activity-list.tsx` | `DataTable` + chip lọc |

**Tạo mới — test:**

| File |
| --- |
| `tests/roles.test.ts` (mở rộng file đã có) |
| `tests/activity-codes.test.ts` |
| `tests/activity-coverage.test.ts` |

**Sửa:**

| File | Sửa gì |
| --- | --- |
| `src/lib/roles.ts` | Ba vai trò, `atLeast`, `guardLastOwner` thay `guardLastAdmin` |
| `src/lib/auth.ts` | `requireRole(min)`; `requireAdmin` thành wrapper |
| `src/lib/screen-meta.ts` | Thêm `/admin/activity` |
| `src/db/schema.ts` | Bảng `activityLog` |
| `src/db/users.ts` | `ensureUsersSeeded` gieo `owner`/`member`; `countActiveOwners` |
| `src/app/(app)/settings/actions.ts` | `saveSettingsAction` → Owner |
| `src/app/(app)/finance/actions.ts` | 3 action → Owner; ghi nhật ký |
| `src/app/(app)/orders/actions.ts` | `deletePaymentAction` → Owner; ghi nhật ký 13 chỗ |
| `src/app/(app)/customers/actions.ts` | Ghi nhật ký |
| `src/app/(app)/inventory/actions.ts` | Ghi nhật ký |
| `src/app/(app)/admin/users/actions.ts` | `requireRole("owner")`; `guardLastOwner`; ghi nhật ký |
| `src/app/(app)/login/actions.ts` | Ghi `session.login` / `session.login_failed` |
| `src/app/api/backup/route.ts` | → Owner; ghi nhật ký |
| `src/app/api/cron/track/route.ts` | Dọn nhật ký cũ hơn 180 ngày |
| `src/app/(app)/settings/page.tsx` | Link Nhật ký hoạt động; gác theo vai trò |
| `src/app/(app)/finance/page.tsx` | Ẩn nút Owner-only |
| `src/app/(app)/orders/[id]/payments-block.tsx` | Ẩn nút Xoá phiếu thu |
| `src/app/(app)/admin/users/users-list.tsx` | Nhãn vai trò mới |
| `src/app/(app)/backup/page.tsx` | Ẩn nút tải với non-Owner |
| `CLAUDE.md` | Mục v8-C, gotcha, mục Tài liệu |

---

## Task 1: Ba vai trò và thang bậc

**Files:**
- Modify: `src/lib/roles.ts`
- Test: `tests/roles.test.ts`

**Interfaces:**
- Consumes: không
- Produces:
  - `USER_ROLES = ["owner", "admin", "member"] as const`
  - `atLeast(role: UserRole, min: UserRole): boolean`
  - `guardLastOwner(target: { role: UserRole; active: boolean }, activeOwnerCount: number): string | null`
  - `ROLE_LABELS: Record<UserRole, string>` — giá trị `"Owner"` / `"Admin"` / `"Member"`
  - `parseRole(raw: string): UserRole | null`
  - `guardSelfAction` giữ nguyên chữ ký

- [ ] **Step 1: Viết test trước**

Mở `tests/roles.test.ts`, **thay** các test đang dùng `nhan_vien` và `guardLastAdmin` bằng:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  atLeast,
  guardLastOwner,
  guardSelfAction,
  parseRole,
  ROLE_LABELS,
  USER_ROLES,
} from "../src/lib/roles.ts";

test("ba vai trò, đúng thứ tự từ cao xuống thấp", () => {
  assert.deepEqual([...USER_ROLES], ["owner", "admin", "member"]);
});

test("nhãn dùng đúng chữ tiếng Anh, không dịch", () => {
  assert.equal(ROLE_LABELS.owner, "Owner");
  assert.equal(ROLE_LABELS.admin, "Admin");
  assert.equal(ROLE_LABELS.member, "Member");
});

test("atLeast: owner làm được mọi thứ admin làm được", () => {
  assert.equal(atLeast("owner", "admin"), true);
  assert.equal(atLeast("owner", "member"), true);
  assert.equal(atLeast("owner", "owner"), true);
});

test("atLeast: admin KHÔNG chạm được bậc owner", () => {
  assert.equal(atLeast("admin", "owner"), false);
  assert.equal(atLeast("admin", "admin"), true);
  assert.equal(atLeast("admin", "member"), true);
});

test("atLeast: member chỉ ở bậc member", () => {
  assert.equal(atLeast("member", "owner"), false);
  assert.equal(atLeast("member", "admin"), false);
  assert.equal(atLeast("member", "member"), true);
});

test("parseRole nhận ba giá trị mới", () => {
  assert.equal(parseRole("owner"), "owner");
  assert.equal(parseRole("admin"), "admin");
  assert.equal(parseRole("member"), "member");
});

test("parseRole TỪ CHỐI mã cũ nhan_vien", () => {
  // Migration 0006 đã đổi hết sang 'member'. Còn nhận 'nhan_vien' thì một
  // form cũ hoặc URL gõ tay sẽ ghi lại giá trị chết vào DB.
  assert.equal(parseRole("nhan_vien"), null);
  assert.equal(parseRole("linh tinh"), null);
});

test("guardLastOwner: chặn khi chỉ còn một owner đang hoạt động", () => {
  const err = guardLastOwner({ role: "owner", active: true }, 1);
  assert.ok(err, "phải trả về thông báo chặn");
  assert.match(err, /owner/i);
});

test("guardLastOwner: cho qua khi còn từ hai owner trở lên", () => {
  assert.equal(guardLastOwner({ role: "owner", active: true }, 2), null);
});

test("guardLastOwner: không chặn khi target không phải owner", () => {
  assert.equal(guardLastOwner({ role: "admin", active: true }, 1), null);
  assert.equal(guardLastOwner({ role: "member", active: true }, 1), null);
});

test("guardLastOwner: không chặn khi owner đó vốn đã bị khoá", () => {
  // Đã khoá thì nó không nằm trong activeOwnerCount, xoá nó không làm mất
  // owner nào đang hoạt động.
  assert.equal(guardLastOwner({ role: "owner", active: false }, 1), null);
});

test("guardSelfAction chặn tự thao tác lên chính mình", () => {
  assert.ok(guardSelfAction(5, 5));
  assert.equal(guardSelfAction(5, 6), null);
});
```

- [ ] **Step 2: Chạy để chắc nó ĐỎ**

Chạy: `node --test tests/roles.test.ts`
Kỳ vọng: FAIL — `atLeast`/`guardLastOwner` chưa tồn tại, và `USER_ROLES` còn là `["admin","nhan_vien"]`.

- [ ] **Step 3: Viết lại `src/lib/roles.ts`**

```ts
/**
 * Vai trò người dùng. v8-C đổi từ hai bậc (`admin`/`nhan_vien`) sang BA bậc.
 *
 * Nhãn dùng đúng ba chữ tiếng Anh, CỐ Ý không dịch — đây là tên vai trò, không
 * phải câu chữ giao diện.
 *
 * Module thuần, không đụng DB. `src/db/schema.ts` import enum từ đây, cùng
 * cách ORDER_STATUSES đang làm.
 */

export const USER_ROLES = ["owner", "admin", "member"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

/**
 * Thang bậc. Mọi chỗ kiểm quyền đi qua đây thay vì so `role === "admin"`.
 *
 * VÌ SAO: với ba bậc, so bằng buộc phải liệt kê hai vai trò ở mỗi chỗ kiểm
 * (`role === "owner" || role === "admin"`) — và chỉ cần quên một chỗ là Owner
 * bị chặn khỏi thứ mà Admin làm được, một lỗi vô lý mà không test nào bắt.
 */
const RANK: Record<UserRole, number> = { member: 0, admin: 1, owner: 2 };

export function atLeast(role: UserRole, min: UserRole): boolean {
  return RANK[role] >= RANK[min];
}

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
 * Chặn thao tác khiến hệ thống còn 0 owner đang hoạt động. Áp cho cả ba
 * đường: xoá, khoá, và hạ vai trò.
 *
 * VÌ SAO LÀ OWNER CHỨ KHÔNG PHẢI ADMIN (đổi ở v8-C): quản lý thành viên là
 * Owner-only. Mất owner cuối cùng thì KHÔNG AI thêm lại được nữa, kể cả
 * admin — phải sửa `role` thẳng trong Supabase mới cứu được.
 *
 * `activeOwnerCount` là số owner đang hoạt động TRƯỚC thao tác, kể cả target.
 */
export function guardLastOwner(
  target: { role: UserRole; active: boolean },
  activeOwnerCount: number,
): string | null {
  if (target.role !== "owner" || !target.active) return null;
  return activeOwnerCount <= 1
    ? "Phải còn ít nhất một Owner đang hoạt động."
    : null;
}
```

- [ ] **Step 4: Chạy để chắc nó XANH**

Chạy: `node --test tests/roles.test.ts`
Kỳ vọng: PASS, 12/12.

`npx tsc --noEmit` sẽ **còn lỗi** ở các file dùng `"nhan_vien"` và `guardLastAdmin` — đúng như dự kiến, Task 2 dọn.

- [ ] **Step 5: Commit**

```bash
git add src/lib/roles.ts tests/roles.test.ts
git commit -m "$(cat <<'EOF'
quyền: ba bậc owner > admin > member với thang bậc atLeast()

guardLastAdmin thành guardLastOwner: quản lý thành viên là Owner-only nên
mất owner cuối là không ai thêm lại được, kể cả admin.

tsc còn đỏ ở các chỗ dùng mã cũ — task sau dọn.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `requireRole` và dọn mọi chỗ dùng mã vai trò cũ

**Files:**
- Modify: `src/lib/auth.ts`
- Modify: `src/db/users.ts`
- Modify: `src/app/(app)/admin/users/actions.ts`
- Modify: `src/app/(app)/admin/users/users-list.tsx`
- Modify: `src/app/(app)/customers/page.tsx:86`
- Modify: `src/app/(app)/settings/page.tsx:67`
- Modify: `src/app/(app)/orders/[id]/page.tsx:486`
- Modify: `src/app/(app)/orders/actions.ts` (`deleteOrderAction`)
- Modify: `src/app/(app)/customers/actions.ts`

**Interfaces:**
- Consumes: `atLeast`, `guardLastOwner`, `USER_ROLES` (Task 1)
- Produces:
  - `requireRole(min: UserRole): Promise<Session>` trong `src/lib/auth.ts`
  - `requireAdmin(): Promise<Session>` = `requireRole("admin")`
  - `requireOwner(): Promise<Session>` = `requireRole("owner")`
  - `countActiveOwners(): Promise<number>` trong `src/db/users.ts`

- [ ] **Step 1: Thêm `requireRole` vào `src/lib/auth.ts`**

Thay hàm `requireAdmin` hiện có bằng:

```ts
/**
 * Chặn theo THANG BẬC, không so bằng: `requireRole("admin")` cho Owner qua.
 * Xem chú thích RANK trong src/lib/roles.ts.
 */
export async function requireRole(min: UserRole): Promise<Session> {
  const session = await requireAuth();
  if (!atLeast(session.role, min)) redirect("/");
  return session;
}

export async function requireAdmin(): Promise<Session> {
  return requireRole("admin");
}

export async function requireOwner(): Promise<Session> {
  return requireRole("owner");
}
```

Thêm import: `import { atLeast, type UserRole } from "./roles";`

- [ ] **Step 2: Sửa `src/db/users.ts`**

Đổi `countActiveAdmins` thành `countActiveOwners`:

```ts
export async function countActiveOwners(): Promise<number> {
  const r = await raw.get<{ n: number }>(
    "SELECT COUNT(*)::int AS n FROM users WHERE role = 'owner' AND active = true",
  );
  return r?.n ?? 0;
}
```

Và sửa `ensureUsersSeeded` — nó đang gieo `i === 0 ? "admin" : "nhan_vien"`, cả hai mã đều sai sau v8-C:

```ts
        i === 0 ? "owner" : "member",
```

Thêm chú thích ngay trên dòng đó:

```ts
      // Tài khoản đầu trong APP_ACCOUNTS thành Owner — nếu gieo ra 0 owner
      // thì không ai vào được màn Thành viên (nó là Owner-only).
```

- [ ] **Step 3: Sửa màn Thành viên sang Owner-only**

Trong `src/app/(app)/admin/users/actions.ts`:

- Đổi cả hai `await requireAdmin()` thành `await requireOwner()` (dòng 24 và 45).
- Đổi import `guardLastAdmin` → `guardLastOwner`, `countActiveAdmins` → `countActiveOwners`.
- Thay khối tính:

```ts
  const activeOwners = await countActiveOwners();
  const lastOwnerErr = guardLastOwner(target, activeOwners);
```

- Thay ba chỗ dùng `lastAdminErr` thành `lastOwnerErr`.
- Sửa nhánh đổi vai trò — luật cũ là "chỉ hạ khỏi admin mới nguy hiểm", luật mới là "chỉ hạ khỏi owner mới nguy hiểm":

```ts
  } else if (op === "role") {
    const role = parseRole(String(formData.get("role") ?? ""));
    if (!role) back("Vai trò không hợp lệ.");
    // Chỉ HẠ khỏi owner mới nguy hiểm; nâng lên owner thì không.
    if (role !== "owner" && lastOwnerErr) back(lastOwnerErr);
    const result = await setUserRole(targetId, role);
    if (!result.ok) back(result.reason);
  } else {
```

Trong `src/app/(app)/admin/users/page.tsx`: đổi `requireAdmin()` → `requireOwner()`.

Trong `src/app/(app)/admin/users/users-list.tsx`: đổi `defaultValue="nhan_vien"` (dòng 75) thành `defaultValue="member"`. `USER_ROLES`/`ROLE_LABELS` tự có giá trị mới, không phải sửa gì thêm.

- [ ] **Step 4: Đổi ba chỗ so bằng `role === "admin"` sang `atLeast`**

Ba chỗ, đổi y hệt nhau — thêm `import { atLeast } from "@/lib/roles";` vào từng file:

- `src/app/(app)/customers/page.tsx:86`: `canDelete={session.role === "admin"}` → `canDelete={atLeast(session.role, "admin")}`
- `src/app/(app)/settings/page.tsx:67`: `{session.role === "admin" && (` → `{atLeast(session.role, "admin") && (`
- `src/app/(app)/orders/[id]/page.tsx:486`: `{session.role === "admin" && (` → `{atLeast(session.role, "owner") && (`

Chú ý chỗ thứ ba: đó là `DangerZone` (xoá đơn) — theo bảng phân quyền ở spec mục 4, xoá đơn là **Owner-only**, nên nó dùng `"owner"` chứ không phải `"admin"`.

- [ ] **Step 5: Chặn server cho hai action xoá**

Trong `src/app/(app)/orders/actions.ts`, `deleteOrderAction` (khoảng dòng 391) — đổi:

```ts
  if (session.role !== "admin") redirect("/");
```

thành:

```ts
  // Xoá đơn là Owner-only (v8-C). Ẩn nút ở page.tsx KHÔNG đủ — ai biết
  // đường gọi action vẫn gọi được.
  if (!atLeast(session.role, "owner")) redirect("/");
```

Trong `src/app/(app)/customers/actions.ts`, `deleteCustomerAction` — xoá khách vẫn là Admin:

```ts
  if (!atLeast(session.role, "admin")) redirect("/");
```

Thêm `import { atLeast } from "@/lib/roles";` vào cả hai file.

- [ ] **Step 6: Kiểm không còn dấu vết mã cũ**

```bash
grep -rn "nhan_vien\|guardLastAdmin\|countActiveAdmins\|role === \"admin\"" src tests
```

Kỳ vọng: **không dòng nào**.

```bash
npx tsc --noEmit && npm test
```

Kỳ vọng: cả hai xanh.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
quyền: requireRole theo thang bậc, dọn hết mã vai trò cũ

Màn Thành viên thành Owner-only. Xoá đơn cũng thành Owner-only — và chặn
ở server action, không chỉ ẩn nút.

ensureUsersSeeded gieo owner/member thay admin/nhan_vien: gieo ra 0 owner
là không ai vào được màn Thành viên.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Migration đổi vai trò trong DB

**Files:**
- Create: `drizzle/0006_roles.sql`

**Interfaces:**
- Consumes: không
- Produces: DB có `role` ∈ {owner, admin, member}, `nien` là owner

- [ ] **Step 1: Viết migration**

Tạo `drizzle/0006_roles.sql`:

```sql
-- v8-C: hai vai trò (admin/nhan_vien) thành ba (owner/admin/member).
--
-- Cột `users.role` là `text` thuần, KHÔNG có CHECK constraint (đã kiểm trên
-- DB thật ngày 02/09), nên không cần DDL nào cho tập giá trị — enum của
-- Drizzle chỉ tồn tại ở tầng TypeScript.

UPDATE users SET role = 'member' WHERE role = 'nhan_vien';

ALTER TABLE users ALTER COLUMN role SET DEFAULT 'member';

-- Dòng này là DỮ LIỆU, không phải cấu trúc — cố ý để trong migration.
-- Thiếu nó thì ngay sau deploy hệ thống có 0 owner, và vì quản lý thành viên
-- là Owner-only nên KHÔNG AI vào được màn đó nữa để tự sửa; phải sửa thẳng
-- trong Supabase mới cứu được.
UPDATE users SET role = 'owner' WHERE username = 'nien';
```

- [ ] **Step 2: ĐĂNG KÝ migration vào journal — thiếu bước này nó sẽ bị BỎ QUA**

drizzle-kit chỉ chạy những file có mục trong `drizzle/meta/_journal.json`.
File viết tay không tự được thêm vào — `0004` va `0005` đều có mục riêng do
người viết thêm bằng tay. Quên bước này thì `npm run db:migrate` báo
**"migrations applied successfully"** mà thực ra không chạy gì cả, và DB vẫn
y nguyên. Đã dính thật khi chạy kế hoạch này.

Thêm một mục vào mảng `entries` của `drizzle/meta/_journal.json`:

```json
    {
      "idx": 6,
      "version": "7",
      "when": 1788330000000,
      "tag": "0006_roles",
      "breakpoints": true
    }
```

`when` phải LỚN HƠN mục cuối đang có (`0005` = `1788246900000`), `idx` là số
kế tiếp, `tag` phải khớp ĐÚNG tên file không kể đuôi `.sql`.

- [ ] **Step 3: Xem trước sẽ đụng những dòng nào**

Trước khi chạy, đọc hiện trạng:

```bash
cd "$(git rev-parse --show-toplevel)"
cat > ./_r.mjs <<'EOF'
import postgres from "postgres";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env","utf8").split("\n").filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sql = postgres(env.DIRECT_URL ?? env.DATABASE_URL, { prepare: false, max: 1 });
console.table(await sql`SELECT id, username, role, active FROM users ORDER BY id`);
await sql.end();
EOF
node ./_r.mjs; rm -f ./_r.mjs
```

Ghi lại bảng này vào phần mô tả commit. Kỳ vọng ngày 02/09: `nien`, `phuong`, `han`, cả ba `admin`, không ai `nhan_vien`.

- [ ] **Step 4: Chạy migration**

```bash
npm run db:migrate
```

Kỳ vọng: chạy xong không lỗi.

- [ ] **Step 5: Kiểm kết quả trên DB thật**

Chạy lại đúng script ở Step 3.

Kỳ vọng: `nien` = `owner`; `phuong` và `han` = `admin`; **không ai** còn `nhan_vien`.

Nếu `nien` vẫn là `admin` thì username trong DB khác với chuỗi trong migration — **dừng lại**, sửa migration cho khớp rồi chạy lại, đừng đi tiếp.

- [ ] **Step 6: Commit**

```bash
git add drizzle/0006_roles.sql drizzle/meta/_journal.json
git commit -m "$(cat <<'EOF'
quyền: migration đổi nhan_vien thành member, nâng nien lên owner

Cột role là text thuần không có CHECK constraint nên không cần DDL cho
tập giá trị. Dòng nâng nien lên owner là dữ liệu, cố ý để trong migration:
thiếu nó là deploy xong có 0 owner và không ai vào được màn Thành viên.

Sau migration: nien=owner, phuong=admin, han=admin.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Vá sáu lỗ hổng quyền

Đây là phần việc chính của mục 7 trong yêu cầu gốc. Sáu thao tác dưới đây hiện **chỉ kiểm "đã đăng nhập"**.

**Files:**
- Modify: `src/app/(app)/settings/actions.ts` (`saveSettingsAction`)
- Modify: `src/app/(app)/finance/actions.ts` (`addTopupAction`, `deleteLedgerAction`, `deleteExpenseAction`)
- Modify: `src/app/(app)/orders/actions.ts` (`deletePaymentAction`)
- Modify: `src/app/api/backup/route.ts`
- Modify: `src/app/(app)/finance/page.tsx`
- Modify: `src/app/(app)/orders/[id]/payments-block.tsx`
- Modify: `src/app/(app)/backup/page.tsx`

**Interfaces:**
- Consumes: `atLeast` (Task 1), `requireOwner` (Task 2)
- Produces: không

- [ ] **Step 1: Chặn ở server — bốn server action**

Trong **mỗi** hàm dưới đây, ngay sau `if (!session) redirect("/login");`, chèn:

```ts
  if (!atLeast(session.role, "owner")) redirect("/");
```

Danh sách:

| File | Hàm | Chuyển hướng khi bị chặn |
| --- | --- | --- |
| `settings/actions.ts` | `saveSettingsAction` | `redirect("/settings")` |
| `finance/actions.ts` | `addTopupAction` | `redirect("/finance")` |
| `finance/actions.ts` | `deleteLedgerAction` | `redirect("/finance")` |
| `finance/actions.ts` | `deleteExpenseAction` | `redirect("/finance")` |
| `orders/actions.ts` | `deletePaymentAction` | `redirect("/orders")` |

Dùng đích chuyển hướng ở cột phải thay cho `"/"` — người bị chặn ở lại đúng màn họ đang xem, đỡ mất phương hướng.

Thêm `import { atLeast } from "@/lib/roles";` vào ba file.

**`addExpenseAction` KHÔNG đụng** — thêm chi phí là việc hằng ngày, Member làm được (spec mục 4). Chỉ *xoá* mới lên Owner.

- [ ] **Step 2: Chặn ở route sao lưu**

Trong `src/app/api/backup/route.ts`, sau khi lấy `session`:

```ts
  // Bản sao lưu chứa cả 13 bảng, gồm thông tin khách và toàn bộ số liệu
  // tiền. Owner-only (v8-C) — trước đó ai đăng nhập cũng tải được.
  if (!session || !atLeast(session.role, "owner"))
    return new Response("Forbidden", { status: 403 });
```

Thay cho luật kiểm session hiện có. Thêm `import { atLeast } from "@/lib/roles";`.

- [ ] **Step 3: Ẩn nút cho người không phải Owner**

Đây chỉ là phần lịch sự — chặn thật đã làm ở Step 1–2.

`src/app/(app)/finance/page.tsx`: trang đã có `session`. Bọc nút "+ Nạp ¥", nút "Xoá" của dòng ví, và nút "Xoá" của dòng chi phí bằng `{atLeast(session.role, "owner") && ( … )}`.

`src/app/(app)/orders/[id]/payments-block.tsx`: component này nhận prop từ page. Thêm prop `canDelete: boolean`, bọc form nút Xoá bằng `{canDelete && ( … )}`, và ở `orders/[id]/page.tsx` truyền `canDelete={atLeast(session.role, "owner")}`.

`src/app/(app)/settings/page.tsx`: bọc khối "Công thức giá" (form `saveSettingsAction`) bằng `{atLeast(session.role, "owner") && ( … )}`. Người không phải Owner vẫn thấy khối "Đổi mật khẩu".

`src/app/(app)/backup/page.tsx`: trang **đã có** `session` (dòng 6, `const [session, settings] = await Promise.all([requireAuth(), getSettings()])`). Chỉ cần bọc nút "Tải bản sao lưu" bằng `{atLeast(session.role, "owner") && ( … )}`.

**Cảnh báo về `PaymentsBlock`:** `ListRow` chỉ trả `<div>` khi KHÔNG có `href` và KHÔNG có `onClick`. Dòng phiếu thu đang chứa `<form><button>` trong `trailing` — đừng thêm `onClick` vào dòng, sẽ thành `<button>` lồng `<button>` và **vỡ hydration** (đã xảy ra thật ở chính component này).

- [ ] **Step 4: Kiểm kiểu và chạy thử**

```bash
npx tsc --noEmit && npm test
```

Kỳ vọng: cả hai xanh.

Mở preview, đăng nhập bằng tài khoản Owner (`nien`): cả sáu thao tác vẫn thấy và vẫn làm được.

- [ ] **Step 5: NGHIỆM THU BẮT BUỘC — chặn có thật ở server không**

Đây là bước dễ bỏ nhất và cũng là bước quan trọng nhất. Ẩn nút mà quên chặn action là **quyền giả**.

Tạm hạ một tài khoản xuống `admin` (nếu chưa có) ở `/admin/users`, đăng nhập bằng nó, rồi trong console trình duyệt gọi thẳng route sao lưu:

```js
(await fetch("/api/backup")).status
```

Kỳ vọng: **403**. Ra `200` là chặn chưa ăn.

Với bốn server action, kiểm bằng cách bấm nút — nhưng nút đã ẩn. Cách kiểm thật: tạm bỏ điều kiện ẩn nút ở một chỗ (sửa tạm trong file, không commit), bấm nút bằng tài khoản Admin, xác nhận bị đá về đúng màn và **dữ liệu không đổi**, rồi hoàn lại điều kiện ẩn.

Làm phép này với **`deleteLedgerAction`** — nó đại diện cho cả nhóm và hậu quả dễ thấy nhất (số dư ví ¥ phải giữ nguyên).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
quyền: vá sáu thao tác chỉ kiểm "đã đăng nhập"

Sửa tỷ giá/lời mặc định, nạp và xoá dòng ví ¥, xoá chi phí, xoá phiếu thu,
tải bản sao lưu — cả sáu giờ là Owner-only, chặn ở server action/route.
Ẩn nút chỉ là phần lịch sự.

Thêm chi phí và thêm phiếu thu CỐ Ý giữ ở Member: đó là việc hằng ngày.

Đã kiểm bằng tài khoản Admin: GET /api/backup trả 403; deleteLedgerAction
bị đá về /finance và số dư ví không đổi.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Mã hành động (module thuần)

**Files:**
- Create: `src/lib/activity-codes.ts`
- Test: `tests/activity-codes.test.ts`

**Interfaces:**
- Consumes: không
- Produces:
  - `ACTIVITY_ENTITIES` — danh sách entity
  - `type ActivityEntity`
  - `ACTION_LABELS: Record<string, string>` — nhãn tiếng Việt cho từng mã
  - `actionLabel(code: string): string`
  - `entityOf(code: string): string` — phần trước dấu chấm

- [ ] **Step 1: Viết test trước**

Tạo `tests/activity-codes.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACTION_LABELS,
  ACTIVITY_ENTITIES,
  actionLabel,
  entityOf,
} from "../src/lib/activity-codes.ts";

test("entityOf cắt phần trước dấu chấm", () => {
  assert.equal(entityOf("order.delete"), "order");
  assert.equal(entityOf("session.login_failed"), "session");
});

test("entityOf với mã không có dấu chấm trả nguyên chuỗi", () => {
  assert.equal(entityOf("linhtinh"), "linhtinh");
});

test("mọi mã trong ACTION_LABELS đều có entity hợp lệ", () => {
  for (const code of Object.keys(ACTION_LABELS)) {
    assert.ok(
      (ACTIVITY_ENTITIES as readonly string[]).includes(entityOf(code)),
      `Mã ${code} có entity "${entityOf(code)}" không nằm trong ACTIVITY_ENTITIES`,
    );
  }
});

test("actionLabel trả nhãn tiếng Việt cho mã đã biết", () => {
  assert.equal(actionLabel("order.delete"), "Xoá đơn");
  assert.equal(actionLabel("cny.topup"), "Nạp ví ¥");
});

test("actionLabel trả chính mã khi chưa có nhãn — không ném lỗi", () => {
  // Nhật ký phải đọc được kể cả khi có mã cũ mà bảng nhãn không còn.
  assert.equal(actionLabel("gi.do.la"), "gi.do.la");
});

test("không mã nào thiếu nhãn", () => {
  for (const [code, label] of Object.entries(ACTION_LABELS)) {
    assert.ok(label.trim().length > 0, `Mã ${code} có nhãn rỗng`);
  }
});
```

- [ ] **Step 2: Chạy để chắc nó ĐỎ**

Chạy: `node --test tests/activity-codes.test.ts`
Kỳ vọng: FAIL — không tìm thấy module.

- [ ] **Step 3: Viết module**

Tạo `src/lib/activity-codes.ts`:

```ts
/**
 * Mã hành động cho nhật ký hoạt động (v8-C). Module thuần.
 *
 * Khuôn mã: `<entity>.<verb>`. Phần entity phải nằm trong ACTIVITY_ENTITIES —
 * có test khoá — để màn nhật ký lọc theo nhóm được mà không phải đoán.
 *
 * Nhãn để riêng khỏi mã: mã đi vào DB và không bao giờ đổi (dòng cũ vẫn phải
 * đọc được), còn nhãn là câu chữ giao diện, sửa lúc nào cũng được.
 */
export const ACTIVITY_ENTITIES = [
  "order",
  "customer",
  "payment",
  "expense",
  "cny",
  "inventory",
  "user",
  "settings",
  "backup",
  "session",
] as const;
export type ActivityEntity = (typeof ACTIVITY_ENTITIES)[number];

export const ACTION_LABELS: Record<string, string> = {
  "order.create": "Tạo đơn",
  "order.update": "Sửa đơn",
  "order.status": "Đổi trạng thái đơn",
  "order.item_add": "Thêm món",
  "order.item_remove": "Xoá món",
  "order.delete": "Xoá đơn",
  "order.photo_delete": "Xoá ảnh",
  "customer.delete": "Xoá khách",
  "payment.add": "Thu tiền",
  "payment.delete": "Xoá phiếu thu",
  "expense.add": "Thêm chi phí",
  "expense.delete": "Xoá chi phí",
  "cny.topup": "Nạp ví ¥",
  "cny.delete": "Xoá dòng ví ¥",
  "inventory.stock_in": "Nhập kho",
  "inventory.sell": "Bán từ kho",
  "user.create": "Tạo thành viên",
  "user.update": "Sửa thành viên",
  "settings.save": "Sửa cài đặt giá",
  "backup.download": "Tải bản sao lưu",
  "session.login": "Đăng nhập",
  "session.login_failed": "Đăng nhập thất bại",
};

export function entityOf(code: string): string {
  const i = code.indexOf(".");
  return i < 0 ? code : code.slice(0, i);
}

/** Trả chính mã khi chưa có nhãn — nhật ký cũ phải đọc được, không được vỡ. */
export function actionLabel(code: string): string {
  return ACTION_LABELS[code] ?? code;
}
```

- [ ] **Step 4: Chạy để chắc nó XANH**

Chạy: `node --test tests/activity-codes.test.ts`
Kỳ vọng: PASS, 6/6. Rồi `npm test` — toàn bộ xanh.

- [ ] **Step 5: Commit**

```bash
git add src/lib/activity-codes.ts tests/activity-codes.test.ts
git commit -m "$(cat <<'EOF'
nhật ký: mã hành động và nhãn tiếng Việt

Mã đi vào DB nên bất biến; nhãn để riêng vì là câu chữ giao diện.
actionLabel trả chính mã khi thiếu nhãn — dòng nhật ký cũ vẫn đọc được.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Bảng `activity_log` và `logActivity`

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0007_activity_log.sql`
- Create: `src/db/activity.ts`

**Interfaces:**
- Consumes: `ACTIVITY_ENTITIES` (Task 5)
- Produces:
  - `logActivity(input: { actor: string; action: string; entityId?: number | null; detail?: Record<string, unknown> | null }): Promise<void>`
  - `listActivity(opts: { limit: number; actor?: string; entity?: string }): Promise<ActivityRow[]>`
  - `listActivityActors(): Promise<string[]>`
  - `purgeOldActivity(days: number): Promise<number>`
  - `type ActivityRow = { id, actor, action, entity, entityId, detail, createdAt }`

- [ ] **Step 1: Thêm bảng vào schema**

Trong `src/db/schema.ts`, thêm sau `deletionLog`:

```ts
export const activityLog = pgTable(
  "activity_log",
  {
    id: serial("id").primaryKey(),
    /**
     * username, KHÔNG phải khoá ngoại tới users.id — có chủ ý: xoá một thành
     * viên thì nhật ký vẫn đọc được tên người thực hiện. Nhật ký truy vết mà
     * mất tên người làm thì vô dụng.
     */
    actor: text("actor").notNull(),
    /** Mã `<entity>.<verb>`, xem src/lib/activity-codes.ts. */
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: integer("entity_id"),
    /** JSON nhỏ. TUYỆT ĐỐI không chứa mật khẩu, kể cả đã băm. */
    detail: text("detail"),
    createdAt: createdAt(),
  },
  (t) => [
    index("activity_log_created_idx").on(t.createdAt),
    index("activity_log_entity_idx").on(t.entity, t.entityId),
  ],
);
```

Thêm `index` vào danh sách import từ `drizzle-orm/pg-core` nếu chưa có.

- [ ] **Step 2: Sinh migration**

```bash
npm run db:generate
```

Đổi tên file vừa sinh thành `drizzle/0007_activity_log.sql` nếu drizzle-kit đặt tên khác, và **đọc nội dung** để chắc nó chỉ có `CREATE TABLE activity_log` + hai `CREATE INDEX` — không có `DROP` nào. Có `DROP` là schema đã lệch với DB ở chỗ khác; dừng lại tìm hiểu, đừng chạy.

```bash
npm run db:migrate
```

- [ ] **Step 3: Kiểm bảng có thật**

```bash
cd "$(git rev-parse --show-toplevel)"
cat > ./_a.mjs <<'EOF'
import postgres from "postgres";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env","utf8").split("\n").filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sql = postgres(env.DIRECT_URL ?? env.DATABASE_URL, { prepare: false, max: 1 });
console.table(await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='activity_log' ORDER BY ordinal_position`);
console.table(await sql`SELECT indexname FROM pg_indexes WHERE tablename='activity_log'`);
await sql.end();
EOF
node ./_a.mjs; rm -f ./_a.mjs
```

Kỳ vọng: 7 cột (`id`, `actor`, `action`, `entity`, `entity_id`, `detail`, `created_at`) và 3 index (khoá chính + hai index vừa tạo).

- [ ] **Step 4: Viết `src/db/activity.ts`**

```ts
import "server-only";
import { raw, NOW_EPOCH_SQL } from "./raw";
import { entityOf } from "@/lib/activity-codes";

export type ActivityRow = {
  id: number;
  actor: string;
  action: string;
  entity: string;
  entityId: number | null;
  detail: string | null;
  createdAt: number;
};

/**
 * Ghi một dòng nhật ký.
 *
 * BA QUY TẮC, đừng đổi mà không đọc spec v8-C mục 8:
 *
 * 1. Gọi SAU khi thao tác nghiệp vụ đã thành công.
 * 2. Gọi NGOÀI transaction — không bao giờ đặt trong `withTx`.
 * 3. NUỐT LỖI. Ghi nhật ký hỏng thì mất một dòng; ghi nhật ký ném lỗi trong
 *    transaction thì rollback cả việc thu tiền. Một nhật ký kiểm toán chặn
 *    được nghiệp vụ tiền tệ hơn một nhật ký thủng lỗ chỗ.
 *
 * `deletion_log` thì NGƯỢC LẠI — nó ở trong transaction, vì nó là bản chụp
 * để khôi phục chứ không phải dòng thời gian. Hai bảng khác mục đích.
 */
export async function logActivity(input: {
  actor: string;
  action: string;
  entityId?: number | null;
  detail?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await raw.run(
      `INSERT INTO activity_log (actor, action, entity, entity_id, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ${NOW_EPOCH_SQL})`,
      [
        input.actor,
        input.action,
        entityOf(input.action),
        input.entityId ?? null,
        input.detail ? JSON.stringify(input.detail) : null,
      ],
    );
  } catch (e) {
    // Nuốt có chủ đích — xem quy tắc 3 ở trên.
    console.error("logActivity hỏng:", input.action, e);
  }
}

export async function listActivity(opts: {
  limit: number;
  actor?: string;
  entity?: string;
}): Promise<ActivityRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.actor) {
    where.push("actor = ?");
    params.push(opts.actor);
  }
  if (opts.entity) {
    where.push("entity = ?");
    params.push(opts.entity);
  }
  params.push(opts.limit);

  return raw.all<ActivityRow>(
    `SELECT id, actor, action, entity,
            entity_id  AS "entityId",
            detail,
            created_at AS "createdAt"
       FROM activity_log
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY created_at DESC, id DESC
      LIMIT ?`,
    params,
  );
}

/** Danh sách người từng có hoạt động — dùng dựng chip lọc. */
export async function listActivityActors(): Promise<string[]> {
  const rows = await raw.all<{ actor: string }>(
    "SELECT DISTINCT actor FROM activity_log ORDER BY actor",
  );
  return rows.map((r) => r.actor);
}

/** Xoá dòng cũ hơn `days` ngày. Trả về số dòng đã xoá. */
export async function purgeOldActivity(days: number): Promise<number> {
  const rows = await raw.all<{ id: number }>(
    `DELETE FROM activity_log
      WHERE created_at < ${NOW_EPOCH_SQL} - ?
      RETURNING id`,
    [days * 86400],
  );
  return rows.length;
}
```

`NOW_EPOCH_SQL` xuất ra từ `src/db/raw.ts:7` với giá trị `"EXTRACT(EPOCH FROM now())::bigint"` — đã kiểm, dùng đúng tên đó.

- [ ] **Step 5: Kiểm ghi/đọc chạy thật**

```bash
npx tsc --noEmit
```

Kỳ vọng: không lỗi.

Mở preview, và trong console trình duyệt (đang đăng nhập) chưa có gì gọi `logActivity` — nên kiểm bằng SQL trực tiếp: chèn tay một dòng rồi đọc lại.

```bash
cd "$(git rev-parse --show-toplevel)"
cat > ./_a2.mjs <<'EOF'
import postgres from "postgres";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env","utf8").split("\n").filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sql = postgres(env.DATABASE_URL, { prepare: false, max: 1 });
await sql`INSERT INTO activity_log (actor, action, entity, entity_id, detail) VALUES ('kiem-thu','order.delete','order',999,'{"ghi_chu":"dong thu"}')`;
console.table(await sql`SELECT id, actor, action, entity, entity_id, detail, created_at FROM activity_log ORDER BY id DESC LIMIT 3`);
await sql`DELETE FROM activity_log WHERE actor = 'kiem-thu'`;
console.log("đã xoá dòng thử:", (await sql`SELECT COUNT(*)::int AS n FROM activity_log WHERE actor='kiem-thu'`)[0]);
await sql.end();
EOF
node ./_a2.mjs; rm -f ./_a2.mjs
```

Kỳ vọng: dòng chèn được, `created_at` là số epoch hợp lý (10 chữ số), và dòng thử bị xoá sạch (`n: 0`).

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts src/db/activity.ts drizzle/0007_activity_log.sql drizzle/meta
git commit -m "$(cat <<'EOF'
nhật ký: bảng activity_log và logActivity

logActivity chạy NGOÀI transaction và nuốt lỗi — nhật ký kiểm toán chặn
được nghiệp vụ tiền thì tệ hơn nhật ký thủng lỗ chỗ. deletion_log ngược
lại, vẫn trong transaction vì nó là bản chụp để khôi phục.

actor lưu username chứ không phải khoá ngoại tới users.id: xoá thành viên
thì nhật ký vẫn đọc được tên người làm.

Chưa nơi nào gọi tới.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Gắn điểm ghi và test quét mã nguồn

**Files:**
- Modify: `src/app/(app)/orders/actions.ts`
- Modify: `src/app/(app)/customers/actions.ts`
- Modify: `src/app/(app)/finance/actions.ts`
- Modify: `src/app/(app)/inventory/actions.ts`
- Modify: `src/app/(app)/settings/actions.ts`
- Modify: `src/app/(app)/admin/users/actions.ts`
- Modify: `src/app/(app)/login/actions.ts`
- Modify: `src/app/api/backup/route.ts`
- Test: `tests/activity-coverage.test.ts`

**Interfaces:**
- Consumes: `logActivity` (Task 6), mã hành động (Task 5)
- Produces: không

- [ ] **Step 1: Viết test quét mã nguồn TRƯỚC**

Tạo `tests/activity-coverage.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Lưới an toàn cho việc "thêm action mới rồi quên ghi nhật ký".
 *
 * Nó khớp CHUỖI trên mã nguồn chứ không chạy thật — không đẹp, nhưng dự án
 * không có DB test, và đây là cách rẻ nhất bắt được đúng lỗi hay xảy ra nhất.
 */
const PHAI_GHI: Record<string, string[]> = {
  "src/app/(app)/orders/actions.ts": [
    "createOrderAction",
    "changeStatusAction",
    "bulkAdvanceAction",
    "addItemAction",
    "removeItemAction",
    "updateItemAction",
    "setQuotedTotalAction",
    "setOrderCustomerAction",
    "updateCustomerAction",
    "updateOrderMetaAction",
    "setShipFeeAction",
    "updateLineCostAction",
    "updateLineMarginAction",
    "lineExceptionAction",
    "addPaymentAction",
    "deletePaymentAction",
    "deleteOrderAction",
    "deletePhotoAction",
  ],
  "src/app/(app)/customers/actions.ts": ["deleteCustomerAction"],
  "src/app/(app)/finance/actions.ts": [
    "addTopupAction",
    "deleteLedgerAction",
    "addExpenseAction",
    "deleteExpenseAction",
  ],
  "src/app/(app)/inventory/actions.ts": ["stockInAction", "sellFromStockAction"],
  "src/app/(app)/settings/actions.ts": ["saveSettingsAction"],
  "src/app/(app)/admin/users/actions.ts": ["createUserAction", "userAdminAction"],
  "src/app/(app)/login/actions.ts": ["loginAction"],
};

/** Cắt thân một hàm: từ dòng khai báo tới khai báo `export` kế tiếp. */
function thanHam(nguon: string, ten: string): string | null {
  const mo = nguon.indexOf(`export async function ${ten}`);
  if (mo < 0) return null;
  const sau = nguon.slice(mo + 1);
  const ke = sau.search(/\nexport (async function|function|const|type) /);
  return ke < 0 ? sau : sau.slice(0, ke);
}

for (const [duongDan, tenHams] of Object.entries(PHAI_GHI)) {
  test(`${duongDan}: mọi action bắt buộc đều gọi logActivity`, () => {
    const nguon = readFileSync(duongDan, "utf8");
    const thieu: string[] = [];
    for (const ten of tenHams) {
      const than = thanHam(nguon, ten);
      assert.ok(than !== null, `Không tìm thấy hàm ${ten} trong ${duongDan}`);
      if (!than.includes("logActivity(")) thieu.push(ten);
    }
    assert.deepEqual(
      thieu,
      [],
      `Thiếu logActivity trong: ${thieu.join(", ")}`,
    );
  });
}

test("không action nào ghi mật khẩu vào nhật ký", () => {
  for (const duongDan of Object.keys(PHAI_GHI)) {
    const nguon = readFileSync(duongDan, "utf8");
    // Bắt kiểu `detail: { ... password ... }` — đọc thô nhưng đủ để chặn
    // cú copy-paste vô ý.
    const xau = /logActivity\([^)]*password/is.test(nguon);
    assert.equal(xau, false, `${duongDan} có vẻ truyền password vào logActivity`);
  }
});
```

- [ ] **Step 2: Chạy để chắc nó ĐỎ**

Chạy: `node --test tests/activity-coverage.test.ts`
Kỳ vọng: FAIL — mọi file đều thiếu `logActivity`.

- [ ] **Step 3: Gắn điểm ghi**

Trong **mỗi** hàm, đặt `await logActivity({...})` **ngay trước** lời gọi `revalidatePath`/`redirect` cuối cùng — tức sau khi thao tác đã thành công. Thêm `import { logActivity } from "@/db/activity";` vào mỗi file.

Bảng mã và `detail` cho từng hàm:

| Hàm | `action` | `entityId` | `detail` |
| --- | --- | --- | --- |
| `createOrderAction` | `order.create` | id đơn mới | `{ total: quotedTotalVnd, soMon: items.length }` |
| `changeStatusAction` | `order.status` | orderId | `{ tu: trạng thái cũ, den: trạng thái mới }` |
| `bulkAdvanceAction` | `order.status` | mỗi đơn một dòng | `{ hangLoat: true, den: trạng thái mới }` |
| `addItemAction` | `order.item_add` | orderId | `{ ten: tên món }` |
| `removeItemAction` | `order.item_remove` | orderId | `{ itemId }` |
| `updateItemAction` | `order.update` | orderId | `{ truong: "mon", itemId }` |
| `setQuotedTotalAction` | `order.update` | orderId | `{ truong: "tong_chot", giaTri: total mới }` |
| `setOrderCustomerAction` | `order.update` | orderId | `{ truong: "khach", customerId }` |
| `updateCustomerAction` | `order.update` | orderId | `{ truong: "thong_tin_khach" }` |
| `updateOrderMetaAction` | `order.update` | orderId | `{ truong: "ghi_chu_ty_gia" }` |
| `setShipFeeAction` | `order.update` | orderId | `{ truong: "phi_ship", giaTri }` |
| `updateLineCostAction` | `order.update` | orderId | `{ truong: "gia_von", itemId }` |
| `updateLineMarginAction` | `order.update` | orderId | `{ truong: "loi", itemId }` |
| `lineExceptionAction` | `order.update` | orderId | `{ truong: "ngoai_le_dong", itemId }` |
| `addPaymentAction` | `payment.add` | orderId | `{ soTien: amountVnd, hinhThuc: method }` |
| `deletePaymentAction` | `payment.delete` | orderId | `{ paymentId }` |
| `deleteOrderAction` | `order.delete` | orderId | `null` |
| `deletePhotoAction` | `order.photo_delete` | orderId hoặc `null` | `{ photoId }` |
| `deleteCustomerAction` | `customer.delete` | customerId | `null` |
| `addTopupAction` | `cny.topup` | `null` | `{ cny, vndPaid }` |
| `deleteLedgerAction` | `cny.delete` | id dòng ví | `null` |
| `addExpenseAction` | `expense.add` | id chi phí | `{ soTien, nhom }` |
| `deleteExpenseAction` | `expense.delete` | id chi phí | `null` |
| `stockInAction` | `inventory.stock_in` | id đơn nhập kho | `{ soMon }` |
| `sellFromStockAction` | `inventory.sell` | id đơn bán | `{ soLuong, giaBan }` |
| `saveSettingsAction` | `settings.save` | `null` | `{ sellRate, defaultMarginVnd }` |
| `createUserAction` | `user.create` | id user mới | `{ username, role }` |
| `userAdminAction` | `user.update` | targetId | `{ op }` |
| `loginAction` (thành công) | `session.login` | id user | `null` |
| `loginAction` (thất bại) | `session.login_failed` | `null` | `{ username: tên đã gõ }` |

`actor` luôn là `session.username`. Riêng `loginAction` thất bại thì chưa có session — dùng chính username người ta gõ làm `actor`.

**`userAdminAction` có `op === "password"` thoát sớm** ở giữa hàm — nhớ ghi nhật ký cả nhánh đó (`user.update`, `detail: { op: "password" }`), nếu không test ở Step 1 vẫn xanh mà nhánh đó lại không ghi gì.

**Không** ghi `changePasswordAction` (tự đổi mật khẩu của mình) — nó không nằm trong danh sách bắt buộc và ghi vào chỉ tạo tiếng ồn.

- [ ] **Step 4: Gắn điểm ghi cho route sao lưu**

Trong `src/app/api/backup/route.ts`, sau khi dựng xong dữ liệu và trước khi trả `Response`:

```ts
  await logActivity({
    actor: session.username,
    action: "backup.download",
    detail: { soBang: Object.keys(tables).length },
  });
```

Biến chứa object các bảng trong file đó tên là **`tables`** (`src/app/api/backup/route.ts:37`) — dùng `Object.keys(tables).length`.

- [ ] **Step 5: Chạy test và thử thật**

```bash
node --test tests/activity-coverage.test.ts
```

Kỳ vọng: PASS toàn bộ.

```bash
npx tsc --noEmit && npm test
```

Kỳ vọng: cả hai xanh.

Mở preview, làm **ba** thao tác thật: đổi trạng thái một đơn, thêm một khoản thu, và đăng xuất rồi đăng nhập lại. Rồi đọc DB:

```bash
cd "$(git rev-parse --show-toplevel)"
cat > ./_a3.mjs <<'EOF'
import postgres from "postgres";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env","utf8").split("\n").filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sql = postgres(env.DATABASE_URL, { prepare: false, max: 1 });
console.table(await sql`SELECT id, actor, action, entity, entity_id, detail, to_timestamp(created_at) AT TIME ZONE 'Asia/Ho_Chi_Minh' AS luc FROM activity_log ORDER BY id DESC LIMIT 10`);
await sql.end();
EOF
node ./_a3.mjs; rm -f ./_a3.mjs
```

Kỳ vọng: thấy `order.status`, `payment.add`, `session.login` với đúng `actor` và thời điểm hợp lý.

**Kiểm quan trọng:** trong `detail` của `session.login` và `session.login_failed` **không được** có chuỗi nào trông giống mật khẩu.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
nhật ký: gắn 30 điểm ghi và test quét mã nguồn

Test đọc chính mã nguồn để bắt lỗi "thêm action rồi quên ghi nhật ký" —
dự án không có DB test nên đây là lưới rẻ nhất mà có thật. Kèm một test
chặn việc vô ý truyền password vào logActivity.

Đã kiểm bằng ba thao tác thật: order.status, payment.add, session.login
đều vào bảng đúng actor và thời điểm.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Màn `/admin/activity`

**Files:**
- Create: `src/app/(app)/admin/activity/page.tsx`
- Create: `src/app/(app)/admin/activity/activity-list.tsx`
- Modify: `src/lib/screen-meta.ts`
- Modify: `src/app/(app)/settings/page.tsx`

**Interfaces:**
- Consumes: `listActivity`, `listActivityActors`, `ActivityRow` (Task 6); `actionLabel`, `ACTIVITY_ENTITIES` (Task 5); `DataTable`, `Column` (v8-A); `SortDir` (v8-A); `requireAdmin` (Task 2)
- Produces: không

- [ ] **Step 1: Thêm tiêu đề màn**

Trong `src/lib/screen-meta.ts`, thêm vào `EXACT`:

```ts
  "/admin/activity": { title: "Nhật ký hoạt động", backHref: "/" },
```

Test khoá phủ sóng ở `tests/screen-meta.test.ts` không bắt màn này (nó không nằm trong `nav-config.ts`), nhưng thêm vào đây là điều kiện để header hiện đúng tiêu đề thay vì "HeyP".

- [ ] **Step 2: Viết trang**

Tạo `src/app/(app)/admin/activity/page.tsx`:

```tsx
import { requireAdmin } from "@/lib/auth";
import { ChipBar, Chip } from "@/app/_components/chip";
import { listActivity, listActivityActors } from "@/db/activity";
import { ACTIVITY_ENTITIES, actionLabel } from "@/lib/activity-codes";
import { formatDateTime } from "@/lib/format";
import type { SortDir } from "@/lib/table-sort";
import { ActivityList, type ActivityItem } from "./activity-list";

const GIOI_HAN = 200;

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{
    actor?: string;
    entity?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const [, { actor, entity, sort, dir: rawDir }, actors] = await Promise.all([
    // Admin trở lên — Owner tự động qua nhờ thang bậc.
    requireAdmin(),
    searchParams,
    listActivityActors(),
  ]);

  const entityHopLe = (ACTIVITY_ENTITIES as readonly string[]).includes(
    entity ?? "",
  )
    ? entity
    : undefined;
  const actorHopLe = actor && actors.includes(actor) ? actor : undefined;
  const dir: SortDir = rawDir === "asc" ? "asc" : "desc";

  const rows = await listActivity({
    limit: GIOI_HAN,
    actor: actorHopLe,
    entity: entityHopLe,
  });

  const items: ActivityItem[] = rows.map((r) => ({
    id: r.id,
    actor: r.actor,
    actionText: actionLabel(r.action),
    entity: r.entity,
    entityId: r.entityId,
    // Link chéo sang bản chụp khi đây là dòng xoá đơn/khách.
    snapshotHref: r.action.endsWith(".delete") ? "/admin/deletions" : null,
    detailText: r.detail ?? "—",
    createdAt: r.createdAt,
    timeText: formatDateTime(r.createdAt),
  }));

  const chipHref = (k: "actor" | "entity", v: string | null) => {
    const p = new URLSearchParams();
    if (k === "actor" ? v : actorHopLe) p.set("actor", k === "actor" ? v! : actorHopLe!);
    if (k === "entity" ? v : entityHopLe)
      p.set("entity", k === "entity" ? v! : entityHopLe!);
    const qs = p.toString();
    return qs ? `/admin/activity?${qs}` : "/admin/activity";
  };

  const sortBase = (() => {
    const p = new URLSearchParams();
    if (actorHopLe) p.set("actor", actorHopLe);
    if (entityHopLe) p.set("entity", entityHopLe);
    return p.toString();
  })();

  return (
    <>
      <ChipBar>
        <Chip href={chipHref("actor", null)} label="Mọi người" active={!actorHopLe} />
        {actors.map((a) => (
          <Chip
            key={a}
            href={chipHref("actor", a)}
            label={a}
            active={actorHopLe === a}
          />
        ))}
      </ChipBar>

      <ChipBar>
        <Chip href={chipHref("entity", null)} label="Mọi loại" active={!entityHopLe} />
        {ACTIVITY_ENTITIES.map((e) => (
          <Chip
            key={e}
            href={chipHref("entity", e)}
            label={e}
            active={entityHopLe === e}
          />
        ))}
      </ChipBar>

      {items.length === 0 ? (
        <div className="card empty">
          <p>Chưa có hoạt động nào khớp bộ lọc.</p>
        </div>
      ) : (
        <>
          <ActivityList items={items} sort={sort} dir={dir} sortBase={sortBase} />
          {items.length === GIOI_HAN && (
            <p className="muted small">
              Đang hiện {GIOI_HAN} dòng gần nhất. Lọc theo người hoặc loại để
              thu hẹp.
            </p>
          )}
        </>
      )}
    </>
  );
}
```

`formatDateTime(d: Date | number)` nhận **cả hai**, và tự nhân 1000 khi là số (`src/lib/format.ts:21`) — truyền thẳng `r.createdAt` là đúng, không bọc `new Date()`.

- [ ] **Step 3: Viết danh sách**

Tạo `src/app/(app)/admin/activity/activity-list.tsx`:

```tsx
"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/app/_components/data-table";
import type { SortDir } from "@/lib/table-sort";

export type ActivityItem = {
  id: number;
  actor: string;
  actionText: string;
  entity: string;
  entityId: number | null;
  snapshotHref: string | null;
  detailText: string;
  createdAt: number;
  timeText: string;
};

const COLUMNS: Column<ActivityItem>[] = [
  {
    key: "luc",
    header: "Thời gian",
    width: "150px",
    sortBy: (r) => r.createdAt,
    cell: (r) => r.timeText,
  },
  {
    key: "nguoi",
    header: "Người",
    width: "110px",
    mobile: true,
    sortBy: (r) => r.actor,
    cell: (r) => (
      <>
        <span className="dt-name">{r.actor}</span>
        {/* Chỉ hiện trên điện thoại — desktop có cột riêng cho từng mẩu. */}
        <span className="dt-sub">
          {r.timeText} · {r.actionText}
          {r.entityId !== null ? ` #${r.entityId}` : ""}
        </span>
      </>
    ),
  },
  {
    key: "hanh_dong",
    header: "Hành động",
    width: "minmax(0, 1fr)",
    sortBy: (r) => r.actionText,
    cell: (r) => r.actionText,
  },
  {
    key: "doi_tuong",
    header: "Đối tượng",
    width: "130px",
    cell: (r) =>
      r.entityId === null ? (
        r.entity
      ) : r.snapshotHref ? (
        <Link href={r.snapshotHref}>
          {r.entity} #{r.entityId}
        </Link>
      ) : (
        `${r.entity} #${r.entityId}`
      ),
  },
  {
    key: "chi_tiet",
    header: "Chi tiết",
    width: "minmax(0, 1.5fr)",
    cell: (r) => <span className="small">{r.detailText}</span>,
  },
];

export function ActivityList({
  items,
  sort,
  dir,
  sortBase,
}: {
  items: ActivityItem[];
  sort?: string;
  dir: SortDir;
  /**
   * Chuỗi query đã có sẵn (actor/entity), KHÔNG gồm sort và dir. Phải là
   * chuỗi chứ không phải hàm: component này là "use client", React không
   * tuần tự hoá được prop kiểu hàm qua ranh giới server→client.
   */
  sortBase: string;
}) {
  const sortHref = (key: string, nextDir: SortDir) => {
    const p = new URLSearchParams(sortBase);
    p.set("sort", key);
    p.set("dir", nextDir);
    return `/admin/activity?${p.toString()}`;
  };

  return (
    <DataTable
      columns={COLUMNS}
      rows={items}
      rowKey={(r) => r.id}
      sort={sort}
      dir={dir}
      sortHref={sortHref}
    />
  );
}
```

Không truyền `rowHref` hay `rowOnClick` — dòng nhật ký không dẫn đi đâu; `DataTable` sẽ render `<div className="dt-row dt-row-static">`.

- [ ] **Step 4: Thêm link vào màn Cài đặt**

Trong `src/app/(app)/settings/page.tsx`, khối khu quản trị (`{atLeast(session.role, "admin") && …}`) đang có link "Nhật ký xoá" — thêm ngay cạnh nó:

```tsx
            <Link href="/admin/activity" className="sheet-item">
              Nhật ký hoạt động
            </Link>
```

Giữ nguyên class và cách trình bày của link "Nhật ký xoá" bên cạnh cho đồng bộ.

- [ ] **Step 5: Kiểm ba bề rộng và hai vai trò**

```bash
npx tsc --noEmit && npm test
```

Kỳ vọng: cả hai xanh.

Mở preview, vào `/admin/activity` bằng tài khoản Owner. Chụp **390px** và **1440px**.

Kỳ vọng:
- 1440px: bảng 5 cột, hai hàng chip (người / loại), bấm tiêu đề cột sắp xếp được.
- 390px: mỗi dòng là tên người + dòng phụ xám "thời gian · hành động #id".
- Bấm chip lọc theo người: chỉ còn dòng của người đó.
- Dòng loại `*.delete` có link sang `/admin/deletions`.

Đăng nhập bằng tài khoản **Admin**: vào `/admin/activity` được. Nếu có tài khoản **Member**: phải bị đá về `/`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
nhật ký: màn /admin/activity với chip lọc theo người và loại

Admin trở lên xem được (Owner qua nhờ thang bậc). Dùng DataTable của v8-A
nên điện thoại tự về dạng dòng. Dòng xoá có link chéo sang bản chụp ở
/admin/deletions — hai bảng giữ riêng vì khác mục đích.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Dọn nhật ký cũ trong cron

**Files:**
- Modify: `src/app/api/cron/track/route.ts`

**Interfaces:**
- Consumes: `purgeOldActivity` (Task 6)
- Produces: không

- [ ] **Step 1: Gắn vào cron 4h sẵn có**

Trong `src/app/api/cron/track/route.ts`, sau khối dọn ảnh mồ côi (`sweepOrphanPhotos`), thêm:

```ts
  // Dọn nhật ký hoạt động cũ, đi nhờ cùng lịch cron 4h — không đáng dựng
  // workflow riêng. 180 ngày: đủ dài để truy vết một mùa hàng, đủ ngắn để
  // bảng không phình trong 500MB của Supabase free.
  // Hỏng ở đây KHÔNG được làm hỏng kết quả tra tracking.
  let activityPurged = 0;
  try {
    activityPurged = await purgeOldActivity(ACTIVITY_KEEP_DAYS);
  } catch {
    // bỏ qua có chủ đích
  }
```

Thêm hằng số ở đầu file, cạnh `ORPHAN_BATCH`:

```ts
/** Giữ nhật ký hoạt động bao lâu. */
const ACTIVITY_KEEP_DAYS = 180;
```

Thêm `activityPurged` vào object trả về của route, cạnh `orphanPhotosDeleted`, để gọi cron xong là biết nó có chạy không.

Thêm `import { purgeOldActivity } from "@/db/activity";`.

- [ ] **Step 2: Kiểm chạy thật**

```bash
npx tsc --noEmit
```

Kỳ vọng: không lỗi.

Gọi cron bằng phiên đang đăng nhập — trong console trình duyệt:

```js
await (await fetch("/api/cron/track", { method: "POST" })).json()
```

Kỳ vọng: JSON trả về có trường `activityPurged` (giá trị `0` là đúng — chưa có dòng nào quá 180 ngày), và **không** ném lỗi.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/track/route.ts
git commit -m "$(cat <<'EOF'
nhật ký: dọn dòng cũ hơn 180 ngày trong cron 4h sẵn có

Ước lượng 20–25MB/năm nên chưa cấp bách, nhưng gắn luôn để khỏi phải nhớ.
Lỗi ở bước dọn không được làm hỏng kết quả tra tracking.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Nghiệm thu toàn phần và cập nhật `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: mọi task trước
- Produces: không

- [ ] **Step 1: NGHIỆM THU BẮT BUỘC — quyền có thật, không phải quyền giả**

Tạo (hoặc dùng lại) một tài khoản **Admin** ở `/admin/users`, đăng nhập bằng nó, rồi thử **cả sáu** thao tác Owner-only. Với mỗi cái, xác nhận **dữ liệu không đổi**, không chỉ xác nhận nút bị ẩn:

| Thao tác | Cách thử | Kỳ vọng |
| --- | --- | --- |
| Tải sao lưu | console: `(await fetch("/api/backup")).status` | `403` |
| Sửa tỷ giá bán | mở `/settings` | Khối "Công thức giá" không hiện |
| Nạp ví ¥ | mở `/finance` | Nút "+ Nạp ¥" không hiện |
| Xoá dòng ví ¥ | mở `/finance` | Nút "Xoá" ở dòng ví không hiện |
| Xoá chi phí | mở `/finance` | Nút "Xoá" ở dòng chi phí không hiện |
| Xoá phiếu thu | mở một đơn, tab Tiền | Nút "Xoá" ở phiếu thu không hiện |
| Xoá đơn | mở một đơn, tab Ảnh | Khối "Vùng nguy hiểm" không hiện |
| Quản lý thành viên | mở `/admin/users` | Bị đá về `/` |

Rồi **một phép thử chặn thật ở server**: tạm bỏ điều kiện ẩn ở nút "Xoá" của dòng ví ¥ (sửa file, không commit), bấm nó bằng tài khoản Admin.

Kỳ vọng: bị đá về `/finance`, **số dư ví ¥ không đổi**. Hoàn lại điều kiện ẩn sau khi thử xong.

- [ ] **Step 2: Kiểm rào owner cuối cùng**

Bằng tài khoản Owner (`nien`), vào `/admin/users` và thử hạ chính `nien` xuống Admin.

Kỳ vọng: bị chặn — hoặc bởi `guardSelfAction` ("Không thể tự khoá, tự hạ vai trò hay tự xoá chính mình"), hoặc bởi `guardLastOwner`.

Rồi nâng `phuong` lên Owner, và thử hạ `nien` xuống Admin lần nữa.

Kỳ vọng: vẫn bị `guardSelfAction` chặn (tự hạ chính mình). Đăng nhập bằng `phuong` rồi hạ `nien` — lần này **được**, vì đã còn 2 owner. Hạ `phuong` về Admin lại cho về trạng thái ban đầu, và **nâng `nien` lên Owner lại**.

Ghi lại trạng thái cuối: `nien` = Owner, `phuong` = Admin, `han` = Admin.

- [ ] **Step 3: Kiểm nhật ký ghi đủ**

Sau khi làm hết Step 1–2, đọc bảng:

```bash
cd "$(git rev-parse --show-toplevel)"
cat > ./_a4.mjs <<'EOF'
import postgres from "postgres";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env","utf8").split("\n").filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sql = postgres(env.DATABASE_URL, { prepare: false, max: 1 });
console.table(await sql`SELECT action, COUNT(*)::int AS lan FROM activity_log GROUP BY action ORDER BY lan DESC`);
console.log("có dòng nào chứa chữ 'password' không:",
  (await sql`SELECT COUNT(*)::int AS n FROM activity_log WHERE detail ILIKE '%password%' OR detail ILIKE '%mat khau%'`)[0]);
await sql.end();
EOF
node ./_a4.mjs; rm -f ./_a4.mjs
```

Kỳ vọng: thấy `user.update` (từ Step 2), `session.login`, `backup.download` **không** có (bị 403 nên không tới chỗ ghi). Và `n: 0` cho phép kiểm mật khẩu — **bắt buộc phải là 0**.

- [ ] **Step 4: Chạy đủ bộ kiểm tra**

```bash
npm test
npx tsc --noEmit
```

Kỳ vọng: toàn bộ xanh, gồm `tests/roles.test.ts` (12), `tests/activity-codes.test.ts` (6), `tests/activity-coverage.test.ts` (8).

- [ ] **Step 5: Cập nhật `CLAUDE.md`**

Nối vào đoạn mở đầu, sau câu về v8-B:

```
**v8-C xong** — ba bậc quyền `owner` > `admin` > `member` (thang bậc
`atLeast()` trong `src/lib/roles.ts`, `requireRole()` trong `auth.ts`); vá sáu
thao tác trước đó chỉ kiểm "đã đăng nhập" (sửa tỷ giá/lời mặc định, nạp và
xoá dòng ví ¥, xoá chi phí, xoá phiếu thu, tải bản sao lưu) thành Owner-only;
bảng `activity_log` + màn `/admin/activity`. Spec:
`docs/superpowers/specs/2026-09-02-heyp-v8c-quyen-va-nhat-ky-design.md`,
kế hoạch: `docs/superpowers/plans/2026-09-02-heyp-v8c-quyen-va-nhat-ky.md`.
```

Thêm vào phần **LƯU Ý QUAN TRỌNG (gotchas)**:

```markdown
- **Kiểm quyền đi qua `atLeast(role, min)`, KHÔNG so bằng `role === "..."`**
  (v8-C) — với ba bậc, so bằng buộc phải liệt kê hai vai trò ở mỗi chỗ kiểm
  và chỉ cần quên một chỗ là Owner bị chặn khỏi thứ Admin làm được. Dùng
  `requireRole(min)` / `requireAdmin()` / `requireOwner()` trong `auth.ts`.
- **Ẩn nút KHÔNG phải là chặn quyền** — mọi thao tác giới hạn phải chặn ở
  server action hoặc route. Sáu thao tác của v8-C từng chỉ kiểm "đã đăng
  nhập" dù giao diện đã ẩn nút: sửa tỷ giá bán, nạp/xoá dòng ví ¥, xoá chi
  phí, xoá phiếu thu, tải bản sao lưu. Nghiệm thu bằng cách gọi thẳng action
  hoặc route, không chỉ nhìn giao diện.
- **`guardLastOwner`, không phải `guardLastAdmin`** (v8-C) — quản lý thành
  viên là Owner-only, nên mất owner cuối cùng là KHÔNG AI thêm lại được, kể
  cả admin; phải sửa `role` thẳng trong Supabase. `ensureUsersSeeded` cũng
  gieo tài khoản đầu thành `owner` vì lý do đó.
- **`logActivity` chạy NGOÀI transaction và NUỐT LỖI** (`src/db/activity.ts`)
  — đặt nó trong `withTx` thì một sự cố ở bảng nhật ký sẽ rollback cả việc
  thu tiền. Nhật ký kiểm toán chặn được nghiệp vụ tiền tệ hơn nhật ký thủng
  lỗ chỗ. **`deletion_log` thì NGƯỢC LẠI** — vẫn trong transaction, vì nó là
  bản chụp để khôi phục chứ không phải dòng thời gian. Hai bảng khác mục
  đích nên KHÔNG gộp.
- **`activity_log.actor` là username, KHÔNG phải khoá ngoại tới `users.id`**
  — xoá một thành viên thì nhật ký vẫn đọc được tên người thực hiện.
- **Thêm server action mới thì phải thêm vào `tests/activity-coverage.test.ts`**
  — test đó đọc chính mã nguồn và bắt lỗi "quên ghi nhật ký". Nó khớp chuỗi
  chứ không chạy thật; đổi tên hàm mà quên sửa danh sách thì test báo "không
  tìm thấy hàm", không phải báo xanh giả.
- **KHÔNG bao giờ ghi mật khẩu vào `detail`**, kể cả đã băm, và không truyền
  `formData` thô vào. Có một test chặn kiểu copy-paste vô ý.
```

Trong mục **Điều hướng (v5)**, nối thêm:

```markdown
  Từ v8-C có thêm `/admin/activity` (nhật ký hoạt động, Admin trở lên), đặt
  cạnh Nhật ký xoá trong màn Cài đặt, không vào nav chính.
```

Thêm vào mục **Tài liệu**:

```markdown
- Thiết kế v8-C (quyền và nhật ký): `docs/superpowers/specs/2026-09-02-heyp-v8c-quyen-va-nhat-ky-design.md`, kế hoạch: `docs/superpowers/plans/2026-09-02-heyp-v8c-quyen-va-nhat-ky.md`
```

Sửa luôn mục gotcha cũ về đăng nhập: chỗ ghi `APP_ACCOUNTS` gieo `admin`/`nhan_vien` giờ là `owner`/`member`.

- [ ] **Step 6: Commit và push**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
tài liệu: ghi nhận v8-C và bảy gotcha mới

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
git push
```

- [ ] **Step 7: Nghiệm thu trên production sau khi deploy**

```bash
curl -s -o /dev/null -w '%{http_code}\n' --max-redirs 0 https://hey-p.vercel.app/
```

Kỳ vọng: **307** (cửa đăng nhập vẫn nguyên — v8-C không đụng vùng đó nhưng vẫn kiểm, nó rẻ).

Đăng nhập bằng `nien` trên production, mở `/admin/activity`, xác nhận thấy dòng `session.login` vừa tạo.

---

## Nghiệm thu v8-C

Đánh dấu khi đã kiểm thật, không suy đoán:

- [ ] `nien` = Owner, `phuong` = Admin, `han` = Admin trong DB
- [ ] Không còn dòng nào trong `src` chứa `nhan_vien`, `guardLastAdmin`, `countActiveAdmins`, `role === "admin"`
- [ ] **Tài khoản Admin: `GET /api/backup` trả 403**
- [ ] **Tài khoản Admin bấm được nút Xoá dòng ví ¥ (sau khi tạm bỏ điều kiện ẩn) thì bị đá về `/finance` và số dư ví KHÔNG đổi**
- [ ] Tài khoản Admin: `/admin/users` đá về `/`
- [ ] Tài khoản Admin không thấy: khối Công thức giá, nút Nạp ¥, nút Xoá ví/chi phí/phiếu thu, Vùng nguy hiểm của đơn
- [ ] Owner làm được cả sáu thao tác
- [ ] Không hạ được owner cuối cùng (`guardLastOwner` hoặc `guardSelfAction` chặn)
- [ ] `/admin/activity` mở được bằng Admin và Owner
- [ ] Ba thao tác thật (đổi trạng thái, thu tiền, đăng nhập) đều có dòng trong `activity_log` với đúng `actor`
- [ ] **`SELECT COUNT(*) FROM activity_log WHERE detail ILIKE '%password%'` trả 0**
- [ ] `POST /api/cron/track` trả JSON có `activityPurged`, không ném lỗi
- [ ] Ảnh chụp `/admin/activity` ở 390px và 1440px đúng như mô tả Task 8 Step 5
- [ ] `npm test` xanh · `npx tsc --noEmit` không lỗi
- [ ] Production: `curl --max-redirs 0 /` trả 307
