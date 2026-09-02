# HeyP v8-B — Tốc độ điều hướng và khung bền vững — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sidebar, tabbar và header thôi bị tháo-dựng lại mỗi lần chuyển màn; vùng nội dung hiện khung xương ngay lập tức thay cho spinner phủ toàn màn.

**Architecture:** Dựng route group `src/app/(app)/` có `layout.tsx` giữ khung (sidebar + header + tabbar) nằm **trên** ranh giới Suspense của `(app)/loading.tsx`, nên React không tháo khung khi chuyển màn và `redirect()` trong layout trả 307 thật. Tiêu đề và nút quay lại chuyển từ prop của trang sang module thuần `screen-meta.ts` tra theo đường dẫn, đọc bằng `usePathname()`.

**Tech Stack:** Next.js 15 (App Router) · React 19 · TypeScript · `node:test` · CSS thuần.

**Spec:** `docs/superpowers/specs/2026-09-02-heyp-v8b-toc-do-dieu-huong-design.md`

## Global Constraints

Trích từ `CLAUDE.md` và spec — áp cho MỌI task:

- **Middleware (`src/middleware.ts`) là cửa đăng nhập chính. KHÔNG sửa, KHÔNG bỏ, KHÔNG dựa vào thay đổi của v8-B để thay nó.** Nó chạy ở Edge, trả 307 thật, không đọc DB.
- **`RedirectRescue` giữ lại.** Nó vẫn cần cho redirect xảy ra DƯỚI boundary (`requireAdmin` ở màn admin, tài khoản bị khoá giữa chừng).
- **Nghiệm thu bắt buộc, không được bỏ:** `curl -i https://hey-p.vercel.app/` khi chưa đăng nhập phải trả **307** kèm `location: /login`. Đây là thứ đã hỏng ngày 01/09 và v8-B đụng đúng vùng đó.
- **Không thêm dependency mới. Không migration DB. Không đụng `src/db/*`, `drizzle/*`.**
- **Không đụng guardrail pooler**, không thêm ping giữ ấm, không giảm số truy vấn mỗi màn, không bật PPR.
- **Route group `(app)` KHÔNG được xuất hiện trong URL.** `/settings` phải vẫn là `/settings`, không phải `/(app)/settings`.
- **Module thuần dùng cho test KHÔNG được import file có alias `@/` ở runtime**; import module thuần khác bằng đuôi `.ts` tường minh (vd `../src/lib/screen-meta.ts`). `import type` bị xoá lúc chạy nên không tính.
- **Mọi ô nhập PHẢI `font-size: var(--fs-3)` (16px)** — dưới ngưỡng này Safari iOS tự phóng to trang.
- **Mọi thanh dính đáy/đỉnh phải cộng `env(safe-area-inset-*)`** (biến `--sat`/`--sab`).
- **UI tiếng Việt.** Tiền VND (₫), tệ (¥).
- **Commit tiếng Việt**, kết thúc bằng `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Lệnh kiểm tra: `npm test` · `npx tsc --noEmit` · một file: `node --test tests/<tên>.test.ts`.
- **KHÔNG chạy `npm run build` khi dev server đang sống** — cả hai ghi vào `.next/`.
- Chạy dev **không** dùng lệnh shell — dùng công cụ preview của harness (`.claude/launch.json`, tên cấu hình `dev`).
- **KHÔNG dùng `npx prettier`.** Dự án không có prettier; gọi qua `npx` sẽ tải bản mặc định và format lại cả file, biến một sửa đổi 40 dòng thành diff 380 dòng. Đã dính thật ở v8-A.

---

## Bản đồ file

**Tạo mới — module thuần (test được):**

| File | Trách nhiệm |
| --- | --- |
| `src/lib/screen-meta.ts` | `screenMetaFor(pathname)` → `{ title, backHref? }`; `KNOWN_PATHS` để test phủ sóng |

**Tạo mới — khung:**

| File | Trách nhiệm |
| --- | --- |
| `src/app/(app)/layout.tsx` | `requireAuth` + Sidebar + ScreenHeader + ScreenTitle + `<main>` + MobileNav |
| `src/app/(app)/loading.tsx` | Khung xương cho vùng `<main>` |
| `src/app/_components/screen-title.tsx` | `<h1 className="screen-title">` đọc `usePathname()` |
| `src/app/_components/content-skeleton.tsx` | Khối xám mờ + đồng hồ canh 8s + `RecoveryPanel` |

**Tạo mới — test:**

| File |
| --- |
| `tests/screen-meta.test.ts` |

**Xoá:**

| File | Vì sao |
| --- | --- |
| `src/app/loading.tsx` | Boundary ở gốc — nguyên nhân `redirect()` mất 307 (sự cố 01/09) |
| `src/app/_components/app-shell.tsx` | Khung chuyển vào `(app)/layout.tsx` |

**Chuyển vào `src/app/(app)/` (bằng `git mv`, không sửa nội dung ở task chuyển):**

`page.tsx` · `orders/` · `customers/` · `inventory/` · `finance/` · `reports/` · `settings/` · `backup/` · `admin/` · `tracking/`

**Ở NGUYÊN chỗ cũ:** `layout.tsx`, `error.tsx`, `global-error.tsx`, `not-found.tsx`, `globals.css`, `actions.ts`, `_components/`, `login/`, `api/`.

**Sửa:**

| File | Sửa gì |
| --- | --- |
| ~38 file trong `src/app` | Import tương đối `../_components/…`, `../actions` → alias `@/app/…` (Task 1) |
| `src/app/_components/screen-header.tsx` | Thành client component, bỏ prop, đọc `usePathname()` |
| 14 trang | Bỏ `<AppShell>`, chỉ render nội dung |
| `src/app/(app)/tracking/page.tsx` | Nút chạy sweep từ `action` của header vào thân trang |
| `src/styles/layout.css` | `.has-bottom-bar` → `:has(.sticky-bar)`; luật `.app-main` cho khung xương |
| `src/styles/components.css` | Bỏ `animation-delay` 250ms; thêm khối `.skel*` |
| `src/lib/ui-timeouts.ts` | Bỏ `SPINNER_DELAY_MS` (không còn spinner trễ) |
| `CLAUDE.md` | Mục v8-B, gotcha mới, mục Tài liệu |

---

## Task 1: Đổi import tương đối sang alias `@/app/…`

Đây là bước **dọn đường**: làm xong thì việc chuyển thư mục ở Task 4–5 là `git mv` thuần, không phải sửa lại đường dẫn của 38 file.

**Files:**
- Modify: mọi file trong `src/app` đang import `"../_components/…"`, `"../../_components/…"`, `"../actions"`, `"../../actions"`

**Interfaces:**
- Consumes: alias `@/*` → `./src/*` (đã có trong `tsconfig.json:19`)
- Produces: không

- [ ] **Step 1: Xem hiện trạng**

Chạy:

```bash
grep -rn '"\.\./_components/\|"\.\./\.\./_components/\|"\.\./\.\./\.\./_components/\|"\.\./actions"\|"\.\./\.\./actions"' src/app --include="*.tsx" --include="*.ts" | wc -l
```

Ghi lại con số. Kỳ vọng khoảng 60–80 dòng trên ~38 file.

- [ ] **Step 2: Đổi hàng loạt**

**KHÔNG thay chuỗi bằng regex mù.** `"../actions"` có hai đích khác nhau tuỳ vị trí file: từ `src/app/customers/page.tsx` nó là `src/app/actions.ts`, nhưng từ `src/app/orders/[id]/page.tsx` nó là `src/app/orders/actions.ts`. Gộp cả hai thành `@/app/actions` sinh ra 21 lỗi `TS2305 has no exported member` — đã dính thật khi chạy kế hoạch này.

Phải **giải đường dẫn thật** từ vị trí từng file:

```bash
cd "$(git rev-parse --show-toplevel)"
python3 - <<'PY'
import pathlib, re

root = pathlib.Path("src/app").resolve()
src = pathlib.Path("src").resolve()
pat = re.compile(r'(["\'])((?:\.\./)+)([^"\']+)\1')

changed = 0
for f in sorted(root.rglob("*")):
    if f.suffix not in (".ts", ".tsx"):
        continue
    text = f.read_text()

    def sub(m):
        quote, ups, rest = m.group(1), m.group(2), m.group(3)
        target = (f.parent / (ups + rest)).resolve()
        try:
            rel = target.relative_to(src)
        except ValueError:
            return m.group(0)  # trỏ ra ngoài src/ — để nguyên
        return f'{quote}@/{rel.as_posix()}{quote}'

    new = pat.sub(sub, text)
    if new != text:
        f.write_text(new)
        changed += 1

print(f"đã sửa {changed} file")
PY
```

Kỳ vọng: `đã sửa 40 file`.

- [ ] **Step 3: Kiểm không sót và không đổi nhầm**

Chạy:

```bash
grep -rn '"\.\./' src/app --include="*.tsx" --include="*.ts"
```

Kỳ vọng: **không dòng nào**.

Rồi kiểm rằng script KHÔNG gộp nhầm hai `actions` khác nhau:

```bash
grep -rho '"@/app/[^"]*actions"' src/app --include="*.tsx" --include="*.ts" | sort | uniq -c
```

Kỳ vọng: thấy CẢ HAI đích — `@/app/orders/actions` (12 lượt) và `@/app/actions` (2 lượt, chỉ `sidebar.tsx` và `mobile-nav.tsx` dùng `logoutAction`). Chỉ thấy một đích là script đã gộp sai.

Rồi:

```bash
npx tsc --noEmit
```

Kỳ vọng: không lỗi. Đây là bằng chứng mọi đường dẫn mới trỏ đúng file.

Import tương đối trong CÙNG thư mục (vd `"./item-sheet"`, `"./actions"`) **giữ nguyên** — chúng không đổi khi cả thư mục di chuyển.

- [ ] **Step 4: Xem app còn chạy**

Mở preview bằng công cụ preview của harness (cấu hình `dev`), vào `/`, `/orders`, `/customers`.
Kỳ vọng: ba màn hiện bình thường, `preview_logs` không lỗi import.

- [ ] **Step 5: Commit**

```bash
git add src/app
git commit -m "$(cat <<'EOF'
dọn đường: import tương đối lên _components/actions thành alias @/app

Không đổi hành vi. Làm trước để việc chuyển thư mục vào route group (app)
ở task sau là git mv thuần, không phải sửa lại đường dẫn của ~38 file.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Module thuần `screen-meta.ts`

**Files:**
- Create: `src/lib/screen-meta.ts`
- Test: `tests/screen-meta.test.ts`

**Interfaces:**
- Consumes: `navItemsFor` từ `src/app/_components/nav-config.ts` (chỉ trong test — đã kiểm chứng import được, mọi import trong file đó đều là `import type` nên bị xoá lúc chạy)
- Produces:
  - `type ScreenMeta = { title: string; backHref?: string }`
  - `screenMetaFor(pathname: string): ScreenMeta`
  - `KNOWN_PATHS: readonly string[]`

- [ ] **Step 1: Viết test trước**

Tạo `tests/screen-meta.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { screenMetaFor, KNOWN_PATHS } from "../src/lib/screen-meta.ts";
import { navItemsFor } from "../src/app/_components/nav-config.ts";

test("màn gốc", () => {
  assert.deepEqual(screenMetaFor("/"), { title: "Tổng quan" });
});

test("màn có nút quay lại", () => {
  assert.deepEqual(screenMetaFor("/orders/new"), {
    title: "Đơn mới",
    backHref: "/orders",
  });
});

test("chi tiết đơn suy tiêu đề từ id", () => {
  assert.deepEqual(screenMetaFor("/orders/13"), {
    title: "#13",
    backHref: "/orders",
  });
});

test("id nhiều chữ số vẫn đúng", () => {
  assert.equal(screenMetaFor("/orders/1042").title, "#1042");
});

test("/orders/new KHÔNG bị luật id nuốt mất", () => {
  // "new" không phải số — nếu regex viết lỏng thì màn tạo đơn sẽ ra "#new".
  assert.equal(screenMetaFor("/orders/new").title, "Đơn mới");
});

test("bỏ query string", () => {
  assert.equal(screenMetaFor("/orders?f=chu_y&sort=con_thu").title, "Đơn hàng");
  assert.equal(screenMetaFor("/orders/13?tab=tien").title, "#13");
});

test("bỏ dấu / thừa ở cuối", () => {
  assert.equal(screenMetaFor("/customers/").title, "Khách hàng");
});

test("đường dẫn lạ trả tên app, không ném lỗi", () => {
  assert.deepEqual(screenMetaFor("/khong-co-mau-nay"), { title: "HeyP" });
  assert.deepEqual(screenMetaFor("/orders/abc/def"), { title: "HeyP" });
});

test("KHOÁ PHỦ SÓNG: mọi mục trong nav-config đều có tiêu đề", () => {
  // Từ v8-B, `title` không còn là prop bắt buộc mà tsc bắt được. Test này là
  // lưới thay thế: thêm màn vào nav mà quên khai báo tiêu đề thì đỏ ở đây.
  const nav = navItemsFor("admin");
  for (const item of [...nav.main, ...nav.more]) {
    assert.notEqual(
      screenMetaFor(item.href).title,
      "HeyP",
      `Thiếu tiêu đề cho ${item.href} trong src/lib/screen-meta.ts`,
    );
  }
});

test("KNOWN_PATHS không có mục trùng", () => {
  assert.equal(new Set(KNOWN_PATHS).size, KNOWN_PATHS.length);
});
```

- [ ] **Step 2: Chạy để chắc nó ĐỎ**

Chạy: `node --test tests/screen-meta.test.ts`
Kỳ vọng: FAIL — `Cannot find module '../src/lib/screen-meta.ts'`.

- [ ] **Step 3: Viết module**

Tạo `src/lib/screen-meta.ts`:

```ts
/**
 * Tiêu đề và nút quay lại của từng màn, tra theo đường dẫn. Module thuần.
 *
 * VÌ SAO TỒN TẠI: từ v8-B khung (sidebar + header + tabbar) nằm ở
 * `src/app/(app)/layout.tsx` để nó không bị tháo-dựng lại mỗi lần chuyển màn.
 * Nhưng layout KHÔNG nhận được prop từ page, nên `title`/`backHref` không thể
 * là prop của trang nữa — chúng phải suy được từ chính đường dẫn.
 *
 * ĐÁNH ĐỔI ĐÃ BIẾT: `tsc` không còn bắt được "quên khai báo tiêu đề" như hồi
 * `title` là prop bắt buộc của AppShell. Lưới thay thế là test khoá phủ sóng
 * trong tests/screen-meta.test.ts — thêm màn vào nav-config mà quên thêm vào
 * đây thì test đỏ.
 *
 * Thêm màn mới: thêm MỘT dòng vào EXACT bên dưới.
 */
export type ScreenMeta = { title: string; backHref?: string };

const EXACT: Record<string, ScreenMeta> = {
  "/": { title: "Tổng quan" },
  "/orders": { title: "Đơn hàng" },
  "/orders/new": { title: "Đơn mới", backHref: "/orders" },
  "/customers": { title: "Khách hàng" },
  "/inventory": { title: "Tồn kho" },
  "/finance": { title: "Tài chính" },
  "/reports": { title: "Báo cáo" },
  "/settings": { title: "Cài đặt" },
  // /backup CỐ Ý không có backHref — giữ đúng hành vi trước v8-B, nơi màn này
  // gọi <AppShell title="Sao lưu"> không kèm backHref.
  "/backup": { title: "Sao lưu" },
  "/tracking": { title: "Tracking" },
  "/admin/users": { title: "Thành viên", backHref: "/" },
  "/admin/deletions": { title: "Nhật ký xoá", backHref: "/" },
};

export const KNOWN_PATHS: readonly string[] = Object.keys(EXACT);

/**
 * Tiêu đề động DUY NHẤT của app. `\d+` chứ không phải `[^/]+`: viết lỏng thì
 * /orders/new cũng khớp và màn tạo đơn hiện tiêu đề "#new".
 */
const ORDER_DETAIL = /^\/orders\/(\d+)$/;

function normalize(pathname: string): string {
  const cut = pathname.split("?")[0].split("#")[0];
  if (cut.length > 1 && cut.endsWith("/")) return cut.slice(0, -1);
  return cut;
}

export function screenMetaFor(pathname: string): ScreenMeta {
  const clean = normalize(pathname);

  const exact = EXACT[clean];
  if (exact) return exact;

  const m = ORDER_DETAIL.exec(clean);
  if (m) return { title: `#${m[1]}`, backHref: "/orders" };

  return { title: "HeyP" };
}
```

- [ ] **Step 4: Chạy để chắc nó XANH**

Chạy: `node --test tests/screen-meta.test.ts`
Kỳ vọng: PASS, 10/10.

Rồi `npm test` — kỳ vọng toàn bộ xanh.

- [ ] **Step 5: Commit**

```bash
git add src/lib/screen-meta.ts tests/screen-meta.test.ts
git commit -m "$(cat <<'EOF'
điều hướng: bảng tra tiêu đề và nút quay lại theo đường dẫn

Chuẩn bị cho khung bền vững ở (app)/layout.tsx — layout không nhận prop từ
page nên title/backHref phải suy từ pathname. Kèm test khoá phủ sóng thay
cho việc tsc không còn bắt được title thiếu.

Chưa nơi nào dùng tới.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `ScreenHeader` và `ScreenTitle` tự đọc đường dẫn

Làm TRƯỚC khi dựng route group, để app cũ vẫn chạy và ta kiểm được rằng tiêu đề mọi màn không đổi.

**Files:**
- Modify: `src/app/_components/screen-header.tsx`
- Create: `src/app/_components/screen-title.tsx`
- Modify: `src/app/_components/app-shell.tsx`

**Interfaces:**
- Consumes: `screenMetaFor` từ `src/lib/screen-meta.ts` (Task 2)
- Produces: `<ScreenHeader />` và `<ScreenTitle />` không nhận prop nào

- [ ] **Step 1: Viết lại `screen-header.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";
import { screenMetaFor } from "@/lib/screen-meta";

/**
 * Header dính đỉnh. Từ v8-B nó KHÔNG nhận prop: nó sống trong
 * `src/app/(app)/layout.tsx` để không bị tháo-dựng lại mỗi lần chuyển màn,
 * mà layout thì không nhận được prop từ page.
 *
 * Đọc `usePathname()` — đúng khuôn NavLinks đã dùng. Hệ quả tốt: tiêu đề và
 * nút quay lại đổi NGAY lúc bấm, trước khi server trả gì.
 *
 * `backHref` là đường dẫn TƯỜNG MINH, không dùng history.back(): ở chế độ
 * standalone (đã cài ra màn hình chính) người dùng có thể mở thẳng một URL
 * sâu và không có gì để lùi về.
 */
export function ScreenHeader() {
  const { title, backHref } = screenMetaFor(usePathname());
  return (
    <header className="screen-header">
      {backHref ? (
        <Link href={backHref} className="sh-back" aria-label="Quay lại">
          <Icon name="chevron-left" size={24} />
        </Link>
      ) : (
        <span className="sh-back-spacer" />
      )}
      <span className="sh-title">{title}</span>
      {/*
        Ô hành động bên phải CỐ Ý để trống. Nút "Chọn" (/orders), "Nhập nhanh
        từ ảnh" (/orders/new) và "+" (/inventory) là `.header-action-float` —
        position: fixed neo vào TOẠ ĐỘ của ô này chứ không nằm trong nó, nên
        chúng vẫn chạy dù header đã lên layout. Ô này giữ chỗ để tiêu đề vẫn
        nằm chính giữa.
      */}
      <span className="sh-action" />
    </header>
  );
}
```

- [ ] **Step 2: Tạo `screen-title.tsx`**

```tsx
"use client";

import { usePathname } from "next/navigation";
import { screenMetaFor } from "@/lib/screen-meta";

/**
 * Tiêu đề lớn đầu vùng nội dung. Tách khỏi ScreenHeader vì nó nằm TRONG
 * <main> chứ không trong <header> — nhưng cùng nguồn dữ liệu, nên đổi tiêu
 * đề chỉ phải sửa src/lib/screen-meta.ts.
 */
export function ScreenTitle() {
  return <h1 className="screen-title">{screenMetaFor(usePathname()).title}</h1>;
}
```

- [ ] **Step 3: Nối vào `AppShell` hiện có**

Trong `src/app/_components/app-shell.tsx`, đổi phần thân (giữ nguyên prop `title` để 14 trang chưa phải sửa — task sau mới bỏ):

```tsx
      <Sidebar username={username} logoUrl={logoUrl} nav={nav} />
      <ScreenHeader />
      <main className="app-main">
        <ScreenTitle />
        {children}
      </main>
      {bottomBar ?? <MobileNav username={username} nav={nav} />}
```

Thêm `import { ScreenTitle } from "./screen-title";` và bỏ `<h1 className="screen-title">{title}</h1>` cũ.

`title`, `backHref`, `action` giờ là prop **không dùng tới**. Đánh dấu bằng chú thích, đừng xoá vội — xoá chúng là phải sửa 14 trang trong cùng một task:

```tsx
  /** @deprecated v8-B: tiêu đề lấy từ src/lib/screen-meta.ts. Prop này bị
   *  bỏ qua; xoá khỏi các trang ở task chuyển route group. */
  title: string;
  /** @deprecated v8-B: xem `title`. */
  backHref?: string;
  /** @deprecated v8-B: xem `title`. Màn Tracking chuyển nút này vào thân trang. */
  action?: ReactNode;
```

`ScreenHeader` không còn nhận `title`/`backHref`/`action` nên phải bỏ ba dòng truyền prop đó trong `AppShell`.

- [ ] **Step 4: Kiểm tiêu đề mọi màn KHÔNG đổi**

Chạy: `npx tsc --noEmit` và `npm test` — kỳ vọng cả hai xanh.

Mở preview và đi qua **từng màn**, đối chiếu tiêu đề ở header và ở `<h1>`:

| Đường dẫn | Tiêu đề phải thấy | Nút quay lại |
| --- | --- | --- |
| `/` | Tổng quan | không |
| `/orders` | Đơn hàng | không |
| `/orders/new` | Đơn mới | có, về `/orders` |
| `/orders/13` | #13 | có, về `/orders` |
| `/customers` | Khách hàng | không |
| `/inventory` | Tồn kho | không |
| `/finance` | Tài chính | không |
| `/reports` | Báo cáo | không |
| `/settings` | Cài đặt | không |
| `/backup` | Sao lưu | không |
| `/tracking` | Tracking | không |
| `/admin/users` | Thành viên | có, về `/` |
| `/admin/deletions` | Nhật ký xoá | có, về `/` |

Bất kỳ ô nào lệch là bảng `EXACT` sai — sửa `src/lib/screen-meta.ts`, không sửa trang.

Kiểm thêm ở `/orders`: nút "Chọn" ở góc phải header vẫn bấm được (nó là `.header-action-float`, `position: fixed`).

- [ ] **Step 5: Commit**

```bash
git add src/app/_components/screen-header.tsx src/app/_components/screen-title.tsx src/app/_components/app-shell.tsx
git commit -m "$(cat <<'EOF'
điều hướng: header và tiêu đề tự đọc đường dẫn thay vì nhận prop

Bước đệm: AppShell vẫn còn, 14 trang chưa phải sửa. Tiêu đề mọi màn đã
đối chiếu bằng tay, không màn nào đổi.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Dựng route group `(app)` và chuyển MỘT màn

Chuyển đúng một màn trước để chứng minh URL không đổi và khung hoạt động. Chọn `/settings`: nó đơn giản, không tham số, không sticky bar.

**Files:**
- Create: `src/app/(app)/layout.tsx`
- Move: `src/app/settings/` → `src/app/(app)/settings/`
- Modify: `src/app/(app)/settings/page.tsx`

**Interfaces:**
- Consumes: `ScreenHeader`, `ScreenTitle` (Task 3); `requireAuth` từ `@/lib/auth`; `navItemsFor` từ `@/app/_components/nav-config`; `getLogoUrl` từ `@/lib/logo`
- Produces: `src/app/(app)/layout.tsx` — mọi màn chuyển vào group ở Task 5 sẽ nằm dưới nó

- [ ] **Step 1: Tạo layout của group**

Tạo `src/app/(app)/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { requireAuth } from "@/lib/auth";
import { getLogoUrl } from "@/lib/logo";
import { navItemsFor } from "@/app/_components/nav-config";
import { Sidebar } from "@/app/_components/sidebar";
import { MobileNav } from "@/app/_components/mobile-nav";
import { ScreenHeader } from "@/app/_components/screen-header";
import { ScreenTitle } from "@/app/_components/screen-title";

/**
 * Khung của mọi màn có đăng nhập.
 *
 * VÌ SAO Ở ĐÂY chứ không phải trong từng trang (như AppShell trước v8-B):
 * layout nằm TRÊN ranh giới Suspense do `(app)/loading.tsx` tạo ra, nên React
 * KHÔNG tháo sidebar/header/tabbar khi chuyển màn — chỉ `{children}` bị thay.
 * Đó là bản sửa thật cho hiện tượng "chớp tắt". Trước v8-B khung nằm trong
 * từng trang nên mỗi lần chuyển màn là tháo sạch rồi dựng lại.
 *
 * HỆ QUẢ THỨ HAI, quan trọng không kém: requireAuth() gọi ở đây tức là gọi
 * TRÊN boundary, nên redirect("/login") của nó trả 307 THẬT — thứ đã mất từ
 * khi có src/app/loading.tsx ở gốc (sự cố khoá cửa đăng nhập 01/09, xem
 * chú thích dài trong src/middleware.ts).
 *
 * NHƯNG middleware vẫn là cửa chính và KHÔNG được bỏ: nó chạy ở Edge, không
 * đọc DB, rẻ hơn, và không phụ thuộc React. Đây chỉ là lưới an toàn thứ hai.
 *
 * GIỮ LAYOUT NÀY NHẸ: mọi việc nặng phải nằm ở page (dưới boundary) để khung
 * xương che được. Ở đây chỉ có đúng một truy vấn — getSession() bên trong
 * requireAuth(), đo được ~20ms. Thêm truy vấn vào đây là kéo dài đúng cái cửa
 * sổ màn hình trắng mà v8-B đang cố thu hẹp.
 */
export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await requireAuth();
  const nav = navItemsFor(session.role);
  const logoUrl = getLogoUrl();

  return (
    <div className="app-shell">
      <Sidebar username={session.username} logoUrl={logoUrl} nav={nav} />
      <ScreenHeader />
      <main className="app-main">
        <ScreenTitle />
        {children}
      </main>
      <MobileNav username={session.username} nav={nav} />
    </div>
  );
}
```

- [ ] **Step 2: Chuyển màn Cài đặt vào group**

```bash
mkdir -p "src/app/(app)"
git mv src/app/settings "src/app/(app)/settings"
```

- [ ] **Step 3: Bỏ `AppShell` khỏi trang Cài đặt**

Trong `src/app/(app)/settings/page.tsx`: bỏ `import { AppShell } …`, đổi `<AppShell username={session.username} title="Cài đặt">…</AppShell>` thành `<>…</>`.

`session` vẫn cần cho phần thân trang thì giữ `requireAuth()`; nếu sau khi bỏ AppShell mà `session` không còn được dùng ở đâu, đổi `const session = await requireAuth()` thành `await requireAuth()`.

**Giữ `requireAuth()` trong trang** dù layout đã gọi: `getSession` bọc `cache()` nên trong cùng một lần render nó KHÔNG tốn thêm truy vấn, và giữ lại thì mỗi trang vẫn tự bảo vệ được nếu sau này bị chuyển ra khỏi group.

- [ ] **Step 4: NGHIỆM THU — URL không được đổi**

Chạy: `npx tsc --noEmit` — kỳ vọng không lỗi.

Mở preview, vào **`/settings`** (không phải `/(app)/settings`).

Kỳ vọng:
- Trang mở được ở đúng `/settings`.
- Có sidebar (desktop) / tabbar (mobile), header ghi "Cài đặt", `<h1>` ghi "Cài đặt".
- **Không có hai lớp khung** — nếu thấy hai sidebar hoặc hai header thì trang chưa bỏ `AppShell`.
- Vào `/orders` (chưa chuyển): vẫn chạy bình thường với AppShell cũ.

Đây là task quyết định: nếu URL thành `/(app)/settings` thì dừng lại, **không** chuyển tiếp 9 nhóm còn lại.

- [ ] **Step 5: Commit**

```bash
git add -A "src/app/(app)" src/app/settings
git commit -m "$(cat <<'EOF'
điều hướng: dựng route group (app) với layout giữ khung, chuyển màn Cài đặt

Layout nằm TRÊN ranh giới Suspense nên React không tháo sidebar/header/
tabbar khi chuyển màn, và requireAuth() trong đó trả 307 thật.

Mới chuyển một màn để xác nhận URL vẫn là /settings. Chín nhóm còn lại ở
task sau.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Chuyển 13 màn còn lại vào `(app)` và xoá `AppShell`

**Files:**
- Move: `page.tsx`, `orders/`, `customers/`, `inventory/`, `finance/`, `reports/`, `backup/`, `admin/`, `tracking/` → `src/app/(app)/`
- Modify: 13 trang — bỏ `<AppShell>`
- Modify: `src/app/(app)/tracking/page.tsx` — nút sweep vào thân trang
- Delete: `src/app/_components/app-shell.tsx`

**Interfaces:**
- Consumes: `src/app/(app)/layout.tsx` (Task 4)
- Produces: không còn file nào import `app-shell`

- [ ] **Step 1: Chuyển thư mục**

```bash
cd "$(git rev-parse --show-toplevel)"
for d in orders customers inventory finance reports backup admin tracking; do
  git mv "src/app/$d" "src/app/(app)/$d"
done
git mv src/app/page.tsx "src/app/(app)/page.tsx"
```

**KHÔNG** chuyển: `login/`, `api/`, `layout.tsx`, `error.tsx`, `global-error.tsx`, `not-found.tsx`, `loading.tsx`, `globals.css`, `actions.ts`, `_components/`.

- [ ] **Step 2: Bỏ `AppShell` khỏi 13 trang**

Với **từng** file dưới đây: bỏ dòng `import { AppShell } …`, đổi thẻ mở `<AppShell …>` thành `<>` và thẻ đóng `</AppShell>` thành `</>`.

```
src/app/(app)/page.tsx
src/app/(app)/orders/page.tsx
src/app/(app)/orders/new/page.tsx
src/app/(app)/orders/[id]/page.tsx
src/app/(app)/customers/page.tsx
src/app/(app)/inventory/page.tsx
src/app/(app)/finance/page.tsx
src/app/(app)/reports/page.tsx
src/app/(app)/backup/page.tsx
src/app/(app)/tracking/page.tsx
src/app/(app)/admin/users/page.tsx
src/app/(app)/admin/deletions/page.tsx
```

(12 file — `settings` đã làm ở Task 4.)

Ba lưu ý:

- `orders/new/page.tsx` có `bottomBar={<></>}` — bỏ luôn, Task 6 xử lý phần CSS thay thế.
- `orders/[id]/page.tsx` và `orders/new/page.tsx` có `backHref` — bỏ, `screen-meta.ts` đã lo.
- `tracking/page.tsx` có `action={…}` chứa `<form action={runSweepAction}>` — **đừng xoá nội dung form**, Step 3 chuyển nó vào thân trang.

Sau đó tìm chỗ nào `session` thành biến không dùng và đổi thành `await requireAuth()`.

- [ ] **Step 3: Chuyển nút chạy sweep của Tracking vào thân trang**

Form hiện nằm trong prop `action` của `AppShell` (`tracking/page.tsx:18–24`) và có đúng nội dung này — không có input ẩn nào:

```tsx
        <form action={runSweepAction}>
          <button className="btn btn-ghost btn-sm" type="submit">
            Chạy tra tự động ngay
          </button>
        </form>
```

Đặt nguyên form đó lên **đầu** thân trang, ngay trước khối `{carriers.length === 0 && …}`, chỉ thêm một lớp bọc để nó có khoảng cách và đổi `btn-ghost` → `btn-outline` (trong header nút chìm là hợp lý, đứng giữa thân trang thì cần viền để thấy được):

```tsx
      <div style={{ marginBottom: "var(--sp-4)" }}>
        <form action={runSweepAction}>
          <button className="btn btn-outline btn-sm" type="submit">
            Chạy tra tự động ngay
          </button>
        </form>
      </div>
```

Giữ nguyên `runSweepAction` và nhãn chữ.

- [ ] **Step 4: Xoá `AppShell`**

```bash
git rm src/app/_components/app-shell.tsx
grep -rn "app-shell\"" src/app --include="*.tsx" || echo "không còn ai import app-shell"
```

Lưu ý: `grep` trên **chuỗi import** (`"…/app-shell"`), không phải class CSS `className="app-shell"` — class đó vẫn dùng trong `(app)/layout.tsx` và trong `layout.css`, **giữ nguyên**.

- [ ] **Step 5: Kiểm toàn bộ đường dẫn**

Chạy: `npx tsc --noEmit` và `npm test` — kỳ vọng cả hai xanh.

Mở preview và mở **từng** URL, xác nhận URL không có `(app)` và trang hiện đúng:

`/` · `/orders` · `/orders/new` · `/orders/13` · `/customers` · `/inventory` · `/finance` · `/reports` · `/settings` · `/backup` · `/tracking` · `/admin/users` · `/admin/deletions` · `/login` · `/khong-co-trang-nay`

Kỳ vọng thêm:
- `/login` và `/khong-co-trang-nay` **không** có sidebar/tabbar (chúng ngoài group).
- Không màn nào có hai lớp khung.
- `/api/health` vẫn trả JSON.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
điều hướng: chuyển 13 màn vào route group (app), xoá AppShell

Khung giờ ở (app)/layout.tsx nên nó không bị tháo-dựng lại mỗi lần chuyển
màn. Route group không xuất hiện trong URL — đã kiểm từng đường dẫn.

Nút "Tra lại tất cả" của màn Tracking chuyển từ ô hành động của header vào
thân trang, vì header không còn nhận prop từ trang.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Khung xương, bỏ `loading.tsx` gốc, bỏ độ trễ 250ms

**Files:**
- Create: `src/app/_components/content-skeleton.tsx`
- Create: `src/app/(app)/loading.tsx`
- Delete: `src/app/loading.tsx`
- Modify: `src/styles/components.css`
- Modify: `src/styles/layout.css`
- Modify: `src/lib/ui-timeouts.ts`

**Interfaces:**
- Consumes: `probeHealth`, `RecoveryPanel`, `Diagnosis` từ `src/app/_components/recovery.tsx`; `SLOW_AFTER_MS` từ `src/lib/ui-timeouts.ts`
- Produces: `<ContentSkeleton />`

- [ ] **Step 1: Viết khung xương**

Tạo `src/app/_components/content-skeleton.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { SLOW_AFTER_MS } from "@/lib/ui-timeouts";
import { probeHealth, RecoveryPanel, type Diagnosis } from "./recovery";

/**
 * Nội dung tạm cho vùng <main> trong lúc màn mới đang về.
 *
 * KHÁC LoadingScreen cũ ở hai điểm cốt lõi:
 *  - Nó KHÔNG phủ toàn màn. Sidebar/header/tabbar do (app)/layout.tsx giữ,
 *    nằm trên ranh giới Suspense nên không bị tháo.
 *  - Nó hiện NGAY LẬP TỨC, không có độ trễ 250ms. Độ trễ đó tồn tại để
 *    spinner phủ màn không nháy khi điều hướng nhanh — nhưng đo trên
 *    production ngày 02/09 thì TTFB là 260–300ms, tức rơi ngay SAU ngưỡng
 *    250ms, nên spinner bật rồi tắt gần như mỗi lần bấm. Đó chính là cái
 *    người dùng gọi là "chớp tắt". Khung xương thì không có vấn đề đó: nó
 *    nằm đúng chỗ nội dung thật sắp hiện ra, nên không có gì để nháy.
 *
 * Giữ nguyên đồng hồ canh 8 giây và bảng chẩn đoán — chúng là thứ v6 thêm
 * vào để người dùng biết "đơ" là vì phiên hết hạn hay vì DB chết.
 */
export function ContentSkeleton() {
  const [slow, setSlow] = useState(false);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      if (!alive) return;
      setSlow(true);
      // Chẩn đoán chạy SAU khi đã bật cảnh báo, không phải trước: người dùng
      // thấy "có gì đó không ổn" ngay ở giây thứ 8, phần "không ổn ở đâu"
      // điền vào sau vài trăm mili giây nữa.
      void probeHealth().then((d) => {
        if (alive) setDiagnosis(d);
      });
    }, SLOW_AFTER_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className="skel" aria-busy="true" aria-label="Đang tải">
      <div className="skel-card">
        <span className="skel-line skel-w60" />
        <span className="skel-line skel-w90" />
        <span className="skel-line skel-w75" />
      </div>
      <div className="skel-card">
        <span className="skel-line skel-w45" />
        <span className="skel-line skel-w90" />
      </div>
      <div className="skel-card">
        <span className="skel-line skel-w60" />
        <span className="skel-line skel-w75" />
        <span className="skel-line skel-w90" />
      </div>

      {slow ? <RecoveryPanel diagnosis={diagnosis} /> : null}

      {/*
        Khối tĩnh hiện bằng animation-delay của CSS, KHÔNG bằng useEffect ở
        trên. Lý do: React không hydrate nội dung fallback của Suspense, nên
        ở LẦN TẢI ĐẦU (gõ thẳng URL, chạm icon PWA) mọi hook trong đây đều
        câm. CSS thì chạy trong lúc trang đang stream. Đừng xoá vì "React lo
        rồi": React chỉ lo được đường chuyển màn trong app.
      */}
      <div className="recovery recovery-static" role="alert">
        <p className="recovery-title">Màn hình đứng lâu bất thường</p>
        <p className="recovery-detail">
          Máy chủ chưa trả lời. Đăng nhập lại là đường ra chắc ăn nhất.
        </p>
        <div className="recovery-actions">
          <a className="btn" href="/login">
            Đăng nhập lại
          </a>
          <a className="btn btn-outline" href="/">
            Về Tổng quan
          </a>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Nối vào boundary của group**

Tạo `src/app/(app)/loading.tsx`:

```tsx
import { ContentSkeleton } from "@/app/_components/content-skeleton";
import { RedirectRescue } from "@/app/_components/redirect-rescue";

/**
 * Ranh giới Suspense của group. Nó bọc {children} của (app)/layout.tsx, nên
 * khung (sidebar/header/tabbar) nằm TRÊN nó và không bị thay.
 *
 * RedirectRescue vẫn cần: redirect() xảy ra DƯỚI boundary này — requireAdmin()
 * ở màn admin, và tài khoản bị khoá giữa chừng — vẫn không trả 307 được.
 * Xem chú thích dài trong src/app/_components/redirect-rescue.tsx.
 */
export default function Loading() {
  return (
    <>
      <RedirectRescue />
      <ContentSkeleton />
    </>
  );
}
```

- [ ] **Step 3: Xoá `loading.tsx` ở gốc**

```bash
git rm src/app/loading.tsx
```

`src/app/loading.tsx` là nơi **duy nhất** import `LoadingScreen` (đã kiểm: chỗ nhắc tên còn lại chỉ nằm trong chú thích của `redirect-rescue.tsx`). Nên xoá luôn:

```bash
git rm src/app/_components/loading-screen.tsx
grep -rn "from \"./_components/loading-screen\"\|from \"@/app/_components/loading-screen\"" src || echo "không còn ai import"
```

Sửa chú thích trong `src/app/_components/redirect-rescue.tsx` cho khỏi trỏ tới file đã xoá — đổi cụm "chính LoadingScreen đã phải học điều này bằng khối `.recovery-static`" thành "chính `ContentSkeleton` phải học điều này bằng khối `.recovery-static`".

- [ ] **Step 4: CSS cho khung xương, bỏ độ trễ spinner**

`LoadingScreen` đã bị xoá ở Step 3, nên CSS của nó thành code chết. Trong `src/styles/components.css` xoá ba khối `.loading-screen` (dòng ~238), `.loading-screen-inner` (~255), `.loading-text` (~264), **và** luật `.loading-screen` trong khối `@media (prefers-reduced-motion: reduce)` (~355).

Đây cũng chính là chỗ chứa `animation: heyp-appear 0.2s ease-out 0.25s forwards` — độ trễ 250ms gây "chớp tắt". Xoá khối là xoá luôn nó.

**Giữ nguyên** `@keyframes heyp-appear`, `.spinner`, `.spinner-inline`, `.recovery*` — `Spinner` vẫn dùng ở nút Đăng nhập (`login/submit-button.tsx`), và `.recovery-static` vẫn dùng `heyp-appear`.

Thêm vào cuối `src/styles/components.css`:

```css
/* ---------- Khung xương vùng nội dung (v8-B) ----------
   Hiện NGAY, không có độ trễ. Xem chú thích trong content-skeleton.tsx. */
@keyframes heyp-skel {
  0%,
  100% {
    opacity: 0.55;
  }
  50% {
    opacity: 0.9;
  }
}
.skel {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.skel-card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-4);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.skel-line {
  height: 12px;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  animation: heyp-skel 1.4s ease-in-out infinite;
}
.skel-w45 {
  width: 45%;
}
.skel-w60 {
  width: 60%;
}
.skel-w75 {
  width: 75%;
}
.skel-w90 {
  width: 90%;
}
/* Ai tắt hiệu ứng chuyển động thì không nhấp nháy, nhưng vẫn phải THẤY đây
   là chỗ trống đang chờ. */
@media (prefers-reduced-motion: reduce) {
  .skel-line {
    animation: none;
    opacity: 0.7;
  }
}
```

Trong `src/styles/layout.css`, đổi hai luật `.has-bottom-bar` sang `:has()` — prop `bottomBar` đã biến mất cùng `AppShell`:

```css
.app-shell:has(.sticky-bar) .app-main {
  padding-bottom: calc(84px + var(--sab) + var(--sp-4));
}
```

và trong khối `@media (min-width: 900px)`:

```css
  .app-shell:has(.sticky-bar) .app-main {
    padding-bottom: var(--sp-7);
  }
```

Luật `.app-shell:has(.sticky-bar) .tabbar { display: none }` đã có sẵn — **giữ nguyên**. Đây cũng là một cải thiện: ở chế độ chọn hàng loạt của `/orders`, thanh dính đáy xuất hiện động và giờ phần đệm đáy tự cập nhật theo.

- [ ] **Step 5: Bỏ hằng số không còn dùng**

Trong `src/lib/ui-timeouts.ts`, xoá `SPINNER_DELAY_MS` và chú thích của nó.

Kiểm không còn ai dùng:

```bash
grep -rn "SPINNER_DELAY_MS" src tests || echo "không còn ai dùng"
```

Kiểm luôn rằng chú thích 8 giây trong `components.css` (`.recovery-static { animation-delay: 8s }`) **vẫn khớp** `SLOW_AFTER_MS = 8000`. Hai chỗ này phải sửa cùng nhau; task này không đổi giá trị nào nên chỉ cần xác nhận.

- [ ] **Step 6: Kiểm bằng mắt — đây là mục tiêu của cả v8-B**

Chạy: `npx tsc --noEmit` và `npm test` — kỳ vọng cả hai xanh.

Mở preview ở **1440px**, bấm qua lại: Tổng quan → Đơn → Khách hàng → Kho → Tổng quan.

Kỳ vọng:
- **Sidebar đứng yên hoàn toàn.** Không nháy, không dựng lại.
- Mục nav vừa bấm sáng lên **ngay**, tiêu đề header đổi **ngay**.
- Vùng nội dung hiện khung xương xám rồi được thay bằng nội dung thật.
- **Không có spinner phủ toàn màn ở bất kỳ thời điểm nào.**

Lặp lại ở **390px**: tabbar và header đứng yên, chỉ ruột đổi.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
điều hướng: khung xương thay spinner toàn màn, bỏ loading.tsx ở gốc

Boundary Suspense chuyển từ gốc xuống (app)/, nên khung nằm trên nó và
không bị thay. Khung xương hiện ngay, bỏ độ trễ 250ms — ngưỡng đó đặt cho
điều hướng nhanh hơn thực tế (TTFB production 260–300ms) nên spinner bật
rồi tắt gần như mỗi lần bấm.

Bỏ loading.tsx gốc cũng gỡ luôn nguyên nhân redirect() mất 307 (sự cố
01/09). Middleware vẫn là cửa chính, RedirectRescue vẫn giữ cho các
redirect nằm dưới boundary.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Nghiệm thu production và cập nhật `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: mọi task trước
- Produces: không

- [ ] **Step 1: NGHIỆM THU BẮT BUỘC — cửa đăng nhập, đo TRƯỚC khi deploy**

Trên máy, với dev server đang chạy:

```bash
curl -i -s -o /dev/null -w '%{http_code} %{redirect_url}\n' \
  --max-redirs 0 http://localhost:3000/
```

Kỳ vọng: **`307`** kèm `http://localhost:3000/login`.

Nếu ra `200`, **DỪNG LẠI** — cửa đăng nhập đã hỏng đúng như sự cố 01/09. Không deploy.

- [ ] **Step 2: Kiểm quyền admin**

Đăng nhập bằng một tài khoản `nhan_vien` (tạo ở `/admin/users` bằng tài khoản admin nếu chưa có), rồi mở `/admin/users`.

Kỳ vọng: bị đá về `/`, **không** treo ở khung xương. Đây là đường `requireAdmin()` — nó nằm **dưới** boundary nên phải nhờ `RedirectRescue`; nếu treo thì `RedirectRescue` đã hỏng.

- [ ] **Step 3: Chạy đủ bộ kiểm tra rồi push**

```bash
npm test
npx tsc --noEmit
```

Kỳ vọng: toàn bộ xanh, gồm `tests/screen-meta.test.ts` (10 test).

```bash
git push
```

- [ ] **Step 4: Đo lại production sau khi Vercel deploy xong**

Đợi deploy xong, rồi chạy đúng bộ đã dùng ngày 02/09:

```bash
FMT='%{http_code} | TTFB %{time_starttransfer}s | tổng %{time_total}s'
for u in / /api/health /login; do
  echo "--- $u ---"
  for i in 1 2 3 4 5; do
    curl -s -o /dev/null -w "  $FMT\n" "https://hey-p.vercel.app$u"
  done
done
```

Mốc so sánh (đo ngày 02/09, trước v8-B):

| Đường dẫn | TTFB ấm trước v8-B |
| --- | --- |
| `/` (307) | 0,222–0,233s |
| `/api/health` | 0,228–0,255s |
| `/login` | 0,284–0,320s |

Kỳ vọng: **không xấu đi**. Mục tiêu v8-B là cảm giác, không phải tốc độ thô — nếu TTFB tăng đáng kể thì có gì đó bị kéo lên layout mà lẽ ra phải ở dưới boundary.

- [ ] **Step 5: NGHIỆM THU BẮT BUỘC — cửa đăng nhập trên production**

```bash
curl -i -s -o /dev/null -w '%{http_code} %{redirect_url}\n' \
  --max-redirs 0 https://hey-p.vercel.app/
```

Kỳ vọng: **`307`** kèm `https://hey-p.vercel.app/login`.

Ra `200` là cửa đăng nhập hỏng trên production — lùi commit ngay, đừng chẩn đoán khi app đang chết.

- [ ] **Step 6: Cập nhật `CLAUDE.md`**

Nối vào đoạn mở đầu, sau câu về v8-A:

```
**v8-B xong** — khung bền vững: sidebar/header/tabbar chuyển vào
`src/app/(app)/layout.tsx` nên không bị tháo-dựng lại mỗi lần chuyển màn;
tiêu đề và nút quay lại suy từ đường dẫn (`src/lib/screen-meta.ts`); vùng nội
dung hiện khung xương ngay thay cho spinner phủ toàn màn; bỏ `loading.tsx` ở
gốc. Spec: `docs/superpowers/specs/2026-09-02-heyp-v8b-toc-do-dieu-huong-design.md`,
kế hoạch: `docs/superpowers/plans/2026-09-02-heyp-v8b-toc-do-dieu-huong.md`.
```

Thêm vào phần **LƯU Ý QUAN TRỌNG (gotchas)**:

```markdown
- **Khung app nằm ở `src/app/(app)/layout.tsx`, KHÔNG ở từng trang** (v8-B) —
  layout nằm TRÊN ranh giới Suspense của `(app)/loading.tsx` nên React không
  tháo sidebar/header/tabbar khi chuyển màn. Đưa khung ngược vào trang là
  hiện tượng "chớp tắt" quay lại ngay. `AppShell` đã bị xoá.
- **GIỮ `(app)/layout.tsx` NHẸ — chỉ một truy vấn** (`getSession()` trong
  `requireAuth()`, đo được ~20ms). Mọi thứ nặng phải ở page, tức DƯỚI
  boundary, để khung xương che được. Thêm truy vấn vào layout là kéo dài đúng
  cửa sổ màn hình trắng mà v8-B thu hẹp — vì bỏ `loading.tsx` gốc rồi thì
  layout treo là trắng màn, không còn spinner nào của mình.
- **Tiêu đề màn lấy từ `src/lib/screen-meta.ts`, không phải prop** (v8-B) —
  layout không nhận được prop từ page. Hệ quả: `tsc` KHÔNG còn bắt được
  "quên khai báo tiêu đề"; lưới thay thế là test khoá trong
  `tests/screen-meta.test.ts` (mọi href trong `nav-config.ts` phải có mục
  trong `screen-meta.ts`). Thêm màn mới là sửa CẢ HAI file đó.
- **Regex tiêu đề động phải là `\d+`, không phải `[^/]+`** — viết lỏng thì
  `/orders/new` cũng khớp và màn tạo đơn hiện tiêu đề "#new". Có test khoá.
- **Đừng đặt lại độ trễ cho trạng thái chờ** (v8-B) — `SPINNER_DELAY_MS` cũ
  là 250ms, đặt để spinner không nháy khi điều hướng nhanh. Nhưng TTFB
  production đo được là 260–300ms, tức rơi ngay SAU ngưỡng, nên spinner bật
  rồi tắt gần như mỗi lần bấm. Đó chính là "chớp tắt". Khung xương hiện NGAY
  và không có vấn đề đó vì nó nằm đúng chỗ nội dung thật sắp hiện ra.
- **`redirect()` trong `(app)/layout.tsx` trả 307 THẬT** (v8-B, khác hẳn tình
  trạng trước đó) vì layout nằm trên boundary. NHƯNG middleware vẫn là cửa
  chính và không được bỏ, và `RedirectRescue` vẫn cần cho redirect nằm DƯỚI
  boundary (`requireAdmin` ở màn admin, tài khoản bị khoá giữa chừng). Sau
  mỗi lần đụng vùng này PHẢI kiểm:
  `curl -i --max-redirs 0 https://hey-p.vercel.app/` khi chưa đăng nhập phải
  trả **307**, không phải 200.
- **Số đo production ngày 02/09 để đối chiếu về sau** — từ Việt Nam, edge
  `hkg1` → function `sin1`: nền TLS 0,113s; `/` (307, chỉ middleware) 0,225s;
  `/api/health` (Node + một câu `SELECT 1`) 0,233s; `/login` (render RSC, không
  DB) 0,285–0,320s; **cold start +640ms**. Một câu DB chỉ ~10–30ms, nên tối ưu
  số truy vấn mỗi màn gần như không đáng — nút thắt là cold start và cách
  trình bày trạng thái chờ.
```

Trong mục **Điều hướng (v5)**, nối thêm:

```markdown
  Từ v8-B, khung không còn dựng trong từng trang: trang chỉ render nội dung,
  `src/app/(app)/layout.tsx` lo phần còn lại. `login/`, `not-found.tsx` và
  `api/` nằm NGOÀI group nên không có khung.
```

Thêm vào mục **Tài liệu**:

```markdown
- Thiết kế v8-B (tốc độ điều hướng): `docs/superpowers/specs/2026-09-02-heyp-v8b-toc-do-dieu-huong-design.md`, kế hoạch: `docs/superpowers/plans/2026-09-02-heyp-v8b-toc-do-dieu-huong.md`
```

- [ ] **Step 7: Commit và push**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
tài liệu: ghi nhận v8-B và bảy gotcha mới

Kèm số đo production ngày 02/09 để lần sau có mốc đối chiếu.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
git push
```

---

## Nghiệm thu v8-B

Đánh dấu khi đã kiểm thật, không suy đoán:

- [ ] **`curl -i --max-redirs 0 https://hey-p.vercel.app/` khi chưa đăng nhập trả 307 kèm `location: /login`** — bắt buộc, không được bỏ
- [ ] Tài khoản `nhan_vien` mở `/admin/users` bị đá về `/`, không treo ở khung xương
- [ ] Chuyển màn ở 1440px: sidebar đứng yên hoàn toàn, không nháy
- [ ] Chuyển màn ở 390px: tabbar và header đứng yên, chỉ ruột đổi
- [ ] Mục nav và tiêu đề header đổi **ngay lúc bấm**, trước khi dữ liệu về
- [ ] Không còn spinner phủ toàn màn ở bất kỳ thời điểm nào
- [ ] Mọi URL không có `(app)`: `/`, `/orders`, `/orders/new`, `/orders/13`, `/customers`, `/inventory`, `/finance`, `/reports`, `/settings`, `/backup`, `/tracking`, `/admin/users`, `/admin/deletions`
- [ ] `/login` và trang 404 **không** có sidebar/tabbar
- [ ] `/api/health` vẫn trả JSON
- [ ] Tiêu đề 13 màn khớp bảng ở Task 3 Step 4
- [ ] Nút `.header-action-float` vẫn bấm được: "Chọn" ở `/orders`, "Nhập nhanh từ ảnh" ở `/orders/new`, `+` ở `/inventory`
- [ ] Chế độ chọn hàng loạt ở `/orders`: thanh dính đáy hiện, tabbar ẩn, đệm đáy đúng
- [ ] TTFB production **không xấu đi** so với mốc 02/09 ở Task 7 Step 4
- [ ] `npm test` xanh · `npx tsc --noEmit` không lỗi
