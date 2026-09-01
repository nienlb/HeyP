# HeyP v8-A — Giao diện desktop và sắp xếp lại màn — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho laptop một bố cục được thiết kế thật (hàng KPI ở Tổng quan, bảng ở các màn danh sách, cột phải dính ở Tạo đơn và Chi tiết đơn), ẩn màn Tracking và thêm trang 404 — mà không đổi một pixel nào dưới 900px.

**Architecture:** Toàn bộ luật mới nằm trong `@media (min-width: 900px)` của `src/styles/`. Mỗi phần tử chỉ render **một** bộ DOM cho cả hai kích thước; CSS quyết định nó trông thế nào. Logic thuần (sắp xếp bảng, suy năm theo giờ VN, badge quá hạn) tách sang `src/lib/` để test bằng `node:test`; component `DataTable` không có hook nên dùng được từ cả server lẫn client component.

**Tech Stack:** Next.js 15 · React 19 · TypeScript · Postgres (Supabase) + Drizzle (`postgres-js`) · `node:test` · CSS thuần.

**Spec:** `docs/superpowers/specs/2026-09-01-heyp-v8a-giao-dien-desktop-design.md`

## Global Constraints

Trích từ `CLAUDE.md` và spec — áp cho MỌI task:

- **Dưới 900px không đổi một pixel nào.** Mọi luật CSS mới nằm trong `@media (min-width: 900px)`, hoặc là luật ẩn/hiện có cặp media query. Nghiệm thu bằng ảnh chụp 390px trước/sau.
- **Luật một-DOM.** Không render hai lần rồi ẩn một bằng `.only-desktop`/`.only-mobile`. Hai nguồn chân lý cho cùng một dòng dữ liệu là lỗi không test nào bắt được.
- **Không thêm dependency mới. Không migration DB nào** (v8-A không đụng `src/db/schema.ts`).
- **Không đụng** `src/app/loading.tsx`, `src/middleware.ts`, `src/app/_components/redirect-rescue.tsx` — đó là v8-B.
- **SQL thô viết placeholder `?`** — lớp `Exec` (`src/db/raw.ts`) tự đổi sang `$1,$2`.
- **Alias camelCase trong SQL thô phải bọc nháy kép**: `AS "itemCount"`. Postgres hạ chữ thường alias không nháy kép → JS đọc `undefined`, không lỗi cú pháp.
- **`SUM()`/`COUNT()` trên cột `integer` phải ép `::int`** — nếu không, postgres-js trả `bigint`→string và JS `+` nối chuỗi thay vì cộng số.
- **Thời gian là epoch-seconds `bigint`**, không phải `timestamptz`. Đổi sang thời điểm trong SQL bằng `to_timestamp(cột)`.
- **Mọi ô nhập PHẢI `font-size: var(--fs-3)` (16px)** — dưới ngưỡng này Safari iOS tự phóng to trang. Kiểm bằng `[...document.querySelectorAll("input,select,textarea")].map(el=>getComputedStyle(el).fontSize)`.
- **Mọi thanh dính đáy/đỉnh phải cộng `env(safe-area-inset-*)`** (biến `--sat`/`--sab`).
- **Module thuần dùng cho test KHÔNG được import file có alias `@/`**; import module thuần khác bằng đuôi `.ts` tường minh (vd `../src/lib/table-sort.ts`).
- **UI tiếng Việt.** Tiền VND (₫), tệ (¥).
- **Commit tiếng Việt**, kết thúc bằng `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Lệnh kiểm tra: `npm test` · `npx tsc --noEmit` · một file: `node --test tests/<tên>.test.ts`.
- **KHÔNG chạy `npm run build` khi dev server đang sống** — cả hai ghi vào `.next/`.
- Chạy dev **không** dùng lệnh shell — dùng công cụ preview của harness (`.claude/launch.json`, tên cấu hình `dev`).

---

## Bản đồ file

**Tạo mới — module thuần (test được):**

| File | Trách nhiệm |
| --- | --- |
| `src/lib/table-sort.ts` | `sortRows`, kiểu `SortDir` — sắp xếp ổn định, `null` xuống cuối |
| `src/lib/vn-time.ts` | `yearInVn`, `yearsFromDates` — cắt năm theo giờ Việt Nam |
| `src/lib/order-badge.ts` | `ageBadge` — badge quá hạn thay cho cột Tuổi đã bỏ |

**Tạo mới — giao diện:**

| File | Trách nhiệm |
| --- | --- |
| `src/app/_components/data-table.tsx` | Bảng CSS Grid, một DOM cho cả hai kích thước |
| `src/app/not-found.tsx` | Trang 404, không bọc `AppShell` |

**Tạo mới — test:**

| File |
| --- |
| `tests/table-sort.test.ts` |
| `tests/vn-time.test.ts` |
| `tests/order-badge.test.ts` |

**Sửa — CSS:**

| File | Sửa gì |
| --- | --- |
| `src/styles/layout.css` | `max-width` 960→1280; thêm `.kpi-row`, `.card-grid`, `.with-rail`, `.rail`, `.rail-detail`; gỡ `margin-left` của `.sticky-bar` khi nó nằm trong `.with-rail` |
| `src/styles/components.css` | Thêm khối `.dt*` (DataTable) và `.kpi*` |
| `src/styles/screens.css` | Hàng tìm kiếm + nút Tạo đơn cùng dòng trên desktop |

**Sửa — tầng DB:**

| File | Sửa gì |
| --- | --- |
| `src/db/queries.ts` | `listOrdersWithGaps` thêm `itemCount`; thêm `listCustomerStats(year)` và kiểu `CustomerStatsRow` |

**Sửa — giao diện:**

| File | Sửa gì |
| --- | --- |
| `src/app/_components/nav-config.ts` | Bỏ dòng Tracking khỏi `MORE` |
| `src/app/page.tsx` | Hàng KPI + xếp lại 6 khối |
| `src/app/orders/page.tsx` | Truyền `itemCount`, `sort`/`dir` từ searchParams |
| `src/app/orders/orders-list.tsx` | Đổi `ListRow` → `DataTable` |
| `src/app/customers/page.tsx` | Chip năm, gọi `listCustomerStats` |
| `src/app/customers/customers-list.tsx` | Đổi `ListRow` → `DataTable` |
| `src/app/orders/new/new-order-form.tsx` | Bọc `.with-rail`, khối tiền thành cột phải |
| `src/app/orders/[id]/page.tsx` | Bọc `.with-rail`, `order-head` + `OrderJourney` sang cột phải |
| `CLAUDE.md` | Mục v8-A, luật một-DOM, mục Tài liệu |

**KHÔNG đụng:** `src/app/_components/list-row.tsx` (5 chỗ khác còn dùng), `src/app/tracking/*`, `src/db/schema.ts`, `drizzle/*`.

---

## Task 1: Nền bố cục dùng chung

**Files:**
- Modify: `src/styles/layout.css`

**Interfaces:**
- Consumes: không
- Produces: ba class dùng cho mọi task sau — `.kpi-row`, `.card-grid`, `.with-rail` (kèm `.rail`, `.rail-detail`)

- [ ] **Step 1: Nới bề rộng nội dung desktop**

Trong `src/styles/layout.css`, khối `@media (min-width: 900px)`, sửa `.app-main`:

```css
  .app-main {
    max-width: 1280px;
    padding: var(--sp-5);
    padding-bottom: var(--sp-7);
  }
  .app-shell.has-bottom-bar .app-main {
    /* Desktop không có thanh dính đáy nữa — khối tiền thành cột phải
       (xem .with-rail bên dưới), nên không cần chừa 96px ở đáy. */
    padding-bottom: var(--sp-7);
  }
```

- [ ] **Step 2: Thêm ba lớp bố cục**

Thêm vào cuối `src/styles/layout.css`, **ngoài** mọi media query:

```css
/* ---------- Ba lớp bố cục dùng chung (v8-A) ----------
   Mobile-first: mặc định là bố cục điện thoại, desktop ghi đè bên dưới.
   Xem docs/superpowers/specs/2026-09-01-heyp-v8a-giao-dien-desktop-design.md */

/* Hàng ô số liệu. Điện thoại 2×2, desktop 4 cột. */
.kpi-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-3);
  margin-bottom: var(--sp-4);
}

/* Lưới thẻ tự xếp. auto-fit lo luôn phần điện thoại — không cần media query. */
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: var(--sp-3);
  align-items: start;
}

/* Nội dung + cột phải. Điện thoại: một cột, cột phải rơi xuống dưới
   (hoặc giữ nguyên thanh dính đáy — xem .with-rail .sticky-bar). */
.with-rail {
  display: block;
}
.rail-detail {
  display: none;
}
```

- [ ] **Step 3: Thêm phần desktop của ba lớp**

Thêm vào **trong** khối `@media (min-width: 900px)` của `src/styles/layout.css`, đặt sau luật `.screen-header, .app-main, .sticky-bar { margin-left: 240px; }`:

```css
  .kpi-row {
    grid-template-columns: repeat(4, 1fr);
    gap: var(--sp-4);
  }

  .with-rail {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    gap: var(--sp-5);
    align-items: start;
  }
  .rail {
    position: sticky;
    top: calc(var(--header-h) + var(--sat) + var(--sp-4));
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }
  .rail-detail {
    display: block;
  }

  /* Khối tiền thôi làm thanh dính đáy, thành thẻ trong cột phải.
     PHẢI gỡ margin-left: 240px ở luật gộp phía trên — nếu không cột bị
     đẩy lệch đúng 240px. Độ đặc hiệu .with-rail .sticky-bar (0,2,0) thắng
     .sticky-bar (0,1,0) nên không phụ thuộc thứ tự. */
  .with-rail .sticky-bar {
    position: static;
    inset: auto;
    margin-left: 0;
    flex-direction: column;
    align-items: stretch;
    gap: var(--sp-3);
    padding: var(--sp-4);
    background: var(--surface);
    backdrop-filter: none;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
```

- [ ] **Step 4: Kiểm không vỡ gì**

Chạy: `npx tsc --noEmit`
Kỳ vọng: không lỗi (CSS không ảnh hưởng tsc, bước này chỉ để chắc chưa ai làm hỏng gì khác).

Mở preview bằng công cụ preview của harness (cấu hình `dev`), vào `/`. Chụp màn ở 390px và 1440px.
Kỳ vọng: 390px **giống hệt** trước khi sửa. 1440px nội dung rộng ra 1280px, các thẻ vẫn xếp dọc (chưa task nào dùng `.card-grid`).

- [ ] **Step 5: Commit**

```bash
git add src/styles/layout.css
git commit -m "$(cat <<'EOF'
giao diện: nền bố cục desktop — nới 1280px, thêm kpi-row/card-grid/with-rail

Ba lớp dùng chung cho các màn ở task sau. Chưa màn nào dùng tới.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Ẩn Tracking và thêm trang 404

**Files:**
- Modify: `src/app/_components/nav-config.ts:24`
- Create: `src/app/not-found.tsx`

**Interfaces:**
- Consumes: `getLogoUrl` từ `src/lib/logo.ts` (đã có, dùng ở `app-shell.tsx`)
- Produces: không

- [ ] **Step 1: Bỏ Tracking khỏi điều hướng**

Trong `src/app/_components/nav-config.ts`, xoá đúng dòng này khỏi mảng `MORE`:

```ts
  { href: "/tracking", label: "Tracking", icon: "tracking" },
```

Thêm chú thích ngay trên mảng `MORE`, sau chú thích đang có:

```ts
/**
 * Tracking đã bỏ khỏi đây (v8-A) vì CARRIER_ADAPTERS còn rỗng — chưa có đơn
 * vị vận chuyển nào. Route /tracking, bảng packages/order_packages và cron
 * sweep GIỮ NGUYÊN: lúc có adapter thật chỉ cần thêm lại đúng dòng này.
 */
```

**Không** xoá `"tracking"` khỏi `IconName` trong `icons.tsx` — route vẫn dùng icon đó.

- [ ] **Step 2: Viết trang 404**

Tạo `src/app/not-found.tsx`:

```tsx
import Link from "next/link";
import { getLogoUrl } from "@/lib/logo";

/**
 * Trang 404 — CỐ Ý không bọc <AppShell>.
 *
 * AppShell gọi getSession(), tức là đọc bảng users mỗi lần render. Nhưng 404
 * là màn phải hiện được cả khi phiên hỏng hoặc DB chậm; bắt nó đọc DB là tự
 * thêm một chỗ có thể treo, đúng vào lúc mọi thứ khác đã hỏng.
 *
 * Người CHƯA đăng nhập gõ URL sai sẽ bị middleware đá về /login trước khi tới
 * đây (middleware gác mọi GET), nên trang này gần như chỉ người đã đăng nhập
 * mới thấy.
 */
export default function NotFound() {
  const logoUrl = getLogoUrl();
  return (
    <div className="error-screen">
      <div className="error-screen-inner">
        {logoUrl ? (
          <img src={logoUrl} alt="HeyP" width={56} height={56} />
        ) : (
          <strong style={{ fontSize: "var(--fs-5)" }}>HeyP</strong>
        )}
        <h1 className="error-screen-heading">Không tìm thấy trang</h1>
        <p className="recovery-detail" style={{ margin: 0 }}>
          Đường dẫn này không tồn tại, hoặc mục bạn tìm đã bị xoá.
        </p>
        <div className="recovery-actions">
          <Link className="btn" href="/">
            Về Tổng quan
          </Link>
          <Link className="btn btn-outline" href="/orders">
            Xem danh sách đơn
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Kiểm kiểu và xem thật**

Chạy: `npx tsc --noEmit`
Kỳ vọng: không lỗi. `getLogoUrl(): string | null` (đã kiểm — `src/lib/logo.ts`), và nó có `import "server-only"`; `not-found.tsx` là server component nên gọi được.

Mở preview, vào `/khong-co-trang-nay`.
Kỳ vọng: thấy trang 404, hai nút bấm được. Vào `/`, sidebar (desktop) và sheet "Thêm" (mobile) **không còn** mục Tracking. Vào thẳng `/tracking` vẫn mở được như cũ.

- [ ] **Step 4: Commit**

```bash
git add src/app/_components/nav-config.ts src/app/not-found.tsx
git commit -m "$(cat <<'EOF'
giao diện: ẩn Tracking khỏi nav, thêm trang 404

Tracking chỉ bỏ khỏi nav-config — route, bảng packages và cron sweep giữ
nguyên vì CARRIER_ADAPTERS còn rỗng.

Trang 404 cố ý không bọc AppShell: AppShell đọc bảng users mỗi lần render,
mà 404 phải hiện được cả khi DB chậm.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Module thuần — sắp xếp bảng

**Files:**
- Create: `src/lib/table-sort.ts`
- Test: `tests/table-sort.test.ts`

**Interfaces:**
- Consumes: không
- Produces:
  - `type SortDir = "asc" | "desc"`
  - `sortRows<T>(rows: T[], keyOf: ((row: T) => number | string | null) | undefined, dir: SortDir): T[]`

- [ ] **Step 1: Viết test trước**

Tạo `tests/table-sort.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { sortRows } from "../src/lib/table-sort.ts";

type Row = { id: number; ten: string; tien: number | null };

const ROWS: Row[] = [
  { id: 1, ten: "Bình", tien: 300 },
  { id: 2, ten: "Ánh", tien: 100 },
  { id: 3, ten: "Cường", tien: null },
  { id: 4, ten: "Ánh", tien: 200 },
];

test("sắp xếp số tăng dần", () => {
  const out = sortRows(ROWS, (r) => r.tien, "asc");
  assert.deepEqual(
    out.map((r) => r.id),
    [2, 4, 1, 3],
  );
});

test("sắp xếp số giảm dần", () => {
  const out = sortRows(ROWS, (r) => r.tien, "desc");
  assert.deepEqual(
    out.map((r) => r.id),
    [1, 4, 2, 3],
  );
});

test("null luôn xuống cuối, bất kể chiều", () => {
  const asc = sortRows(ROWS, (r) => r.tien, "asc");
  const desc = sortRows(ROWS, (r) => r.tien, "desc");
  assert.equal(asc[asc.length - 1].id, 3);
  assert.equal(desc[desc.length - 1].id, 3);
});

test("chuỗi so theo tiếng Việt: Á đứng trước B", () => {
  const out = sortRows(ROWS, (r) => r.ten, "asc");
  assert.deepEqual(
    out.map((r) => r.ten),
    ["Ánh", "Ánh", "Bình", "Cường"],
  );
});

test("ổn định: hai hàng cùng khoá giữ nguyên thứ tự gốc", () => {
  const out = sortRows(ROWS, (r) => r.ten, "asc");
  // Hai "Ánh": id 2 đứng trước id 4 trong mảng gốc.
  assert.deepEqual(
    out.filter((r) => r.ten === "Ánh").map((r) => r.id),
    [2, 4],
  );
});

test("không có keyOf thì trả nguyên thứ tự gốc", () => {
  const out = sortRows(ROWS, undefined, "desc");
  assert.deepEqual(
    out.map((r) => r.id),
    [1, 2, 3, 4],
  );
});

test("không sửa mảng gốc", () => {
  const before = ROWS.map((r) => r.id);
  sortRows(ROWS, (r) => r.tien, "desc");
  assert.deepEqual(
    ROWS.map((r) => r.id),
    before,
  );
});
```

- [ ] **Step 2: Chạy test để chắc nó ĐỎ**

Chạy: `node --test tests/table-sort.test.ts`
Kỳ vọng: FAIL — `Cannot find module '../src/lib/table-sort.ts'`.

- [ ] **Step 3: Viết module**

Tạo `src/lib/table-sort.ts`:

```ts
/**
 * Sắp xếp hàng cho DataTable. Module thuần — không import gì có alias `@/`.
 *
 * Ba tính chất phải giữ, đều có test khoá:
 *  - ỔN ĐỊNH: hai hàng cùng khoá giữ nguyên thứ tự gốc. Array.prototype.sort
 *    của V8 đã ổn định từ ES2019, nhưng ta vẫn kèm chỉ số gốc làm khoá phụ
 *    để tính chất này là của HÀM này chứ không phải đi mượn của runtime.
 *  - NULL XUỐNG CUỐI, bất kể chiều. Đảo cả null theo `desc` thì "chưa có số"
 *    nhảy lên đầu bảng — đúng chỗ mắt nhìn trước tiên, sai chỗ cần nhìn.
 *  - KHÔNG SỬA MẢNG GỐC.
 */
export type SortDir = "asc" | "desc";

type Key = number | string | null;

function compareKeys(a: Key, b: Key): number {
  if (a === null && b === null) return 0;
  // Trả 1/-1 trực tiếp, KHÔNG qua nhánh đảo dấu của caller — đó là cách
  // "null luôn xuống cuối" tồn tại được ở cả hai chiều.
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  // localeCompare "vi": "Ánh" < "Bình". So bằng mã ký tự thì "Á" (U+00C1)
  // rơi sau "Z" và tên có dấu bị dồn xuống cuối bảng.
  return String(a).localeCompare(String(b), "vi");
}

export function sortRows<T>(
  rows: T[],
  keyOf: ((row: T) => Key) | undefined,
  dir: SortDir,
): T[] {
  if (!keyOf) return [...rows];
  return rows
    .map((row, i) => ({ row, i, k: keyOf(row) }))
    .sort((a, b) => {
      const nullish = (a.k === null ? 1 : 0) - (b.k === null ? 1 : 0);
      if (nullish !== 0) return nullish;
      const c = compareKeys(a.k, b.k);
      if (c !== 0) return dir === "asc" ? c : -c;
      return a.i - b.i;
    })
    .map((x) => x.row);
}
```

- [ ] **Step 4: Chạy test để chắc nó XANH**

Chạy: `node --test tests/table-sort.test.ts`
Kỳ vọng: PASS, 7/7.

Rồi chạy toàn bộ: `npm test` — kỳ vọng không test cũ nào đỏ.

- [ ] **Step 5: Commit**

```bash
git add src/lib/table-sort.ts tests/table-sort.test.ts
git commit -m "$(cat <<'EOF'
bảng: hàm sắp xếp ổn định, null xuống cuối, chuỗi so theo tiếng Việt

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Module thuần — năm theo giờ VN và badge quá hạn

**Files:**
- Create: `src/lib/vn-time.ts`
- Create: `src/lib/order-badge.ts`
- Test: `tests/vn-time.test.ts`
- Test: `tests/order-badge.test.ts`

**Interfaces:**
- Consumes: không
- Produces:
  - `VN_TZ: "Asia/Ho_Chi_Minh"`
  - `yearInVn(d: Date): number`
  - `yearsFromDates(dates: Date[]): number[]` — giảm dần, không trùng
  - `ageBadge(row: { status: string; isStale: boolean; ageDays: number }): string | null`

- [ ] **Step 1: Viết test cho vn-time**

Tạo `tests/vn-time.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { yearInVn, yearsFromDates } from "../src/lib/vn-time.ts";

test("đúng năm cho một thời điểm giữa năm", () => {
  assert.equal(yearInVn(new Date("2026-06-15T03:00:00Z")), 2026);
});

test("5h sáng 01/01 giờ VN vẫn là năm mới, dù UTC còn ở năm cũ", () => {
  // 2025-12-31T22:00:00Z = 2026-01-01 05:00 giờ VN (UTC+7).
  // Đây là ca đã suýt làm đơn rơi nhầm năm — xem spec mục 6.2.
  assert.equal(yearInVn(new Date("2025-12-31T22:00:00Z")), 2026);
});

test("23h30 ngày 31/12 giờ VN vẫn là năm cũ", () => {
  // 2025-12-31T16:30:00Z = 2025-12-31 23:30 giờ VN.
  assert.equal(yearInVn(new Date("2025-12-31T16:30:00Z")), 2025);
});

test("danh sách năm: giảm dần, không trùng", () => {
  const out = yearsFromDates([
    new Date("2025-03-01T00:00:00Z"),
    new Date("2026-07-01T00:00:00Z"),
    new Date("2025-09-01T00:00:00Z"),
    new Date("2025-12-31T22:00:00Z"), // → 2026 giờ VN
  ]);
  assert.deepEqual(out, [2026, 2025]);
});

test("mảng rỗng trả mảng rỗng", () => {
  assert.deepEqual(yearsFromDates([]), []);
});
```

- [ ] **Step 2: Chạy để chắc nó ĐỎ**

Chạy: `node --test tests/vn-time.test.ts`
Kỳ vọng: FAIL — không tìm thấy module.

- [ ] **Step 3: Viết vn-time.ts**

Tạo `src/lib/vn-time.ts`:

```ts
/**
 * Cắt năm theo giờ Việt Nam. Module thuần.
 *
 * VÌ SAO CẦN: thời gian lưu epoch-seconds, mọi phép đổi mặc định ra UTC. Đơn
 * tạo 5h sáng 01/01 giờ VN là 22h 31/12 giờ UTC — lấy năm theo UTC là nó rơi
 * nhầm sang năm trước, và bộ lọc năm ở màn Khách hàng thiếu mất đơn đó mà
 * không báo lỗi gì.
 *
 * Phía SQL dùng đúng múi này:
 *   EXTRACT(YEAR FROM to_timestamp(created_at) AT TIME ZONE 'Asia/Ho_Chi_Minh')
 * Hai nơi PHẢI khớp nhau, nếu không chip năm hiện ra một danh sách mà truy
 * vấn lại trả về tập khác.
 */
export const VN_TZ = "Asia/Ho_Chi_Minh";

export function yearInVn(d: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: VN_TZ,
      year: "numeric",
    }).format(d),
  );
}

/** Các năm có mặt trong danh sách, giảm dần, không trùng. */
export function yearsFromDates(dates: Date[]): number[] {
  return [...new Set(dates.map(yearInVn))].sort((a, b) => b - a);
}
```

- [ ] **Step 4: Chạy để chắc nó XANH**

Chạy: `node --test tests/vn-time.test.ts`
Kỳ vọng: PASS, 5/5.

- [ ] **Step 5: Viết test cho order-badge**

Tạo `tests/order-badge.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { ageBadge } from "../src/lib/order-badge.ts";

test("đơn bình thường: không badge", () => {
  assert.equal(
    ageBadge({ status: "da_mua_tq", isStale: false, ageDays: 3 }),
    null,
  );
});

test("đơn quá hạn: hiện số ngày", () => {
  assert.equal(
    ageBadge({ status: "da_mua_tq", isStale: true, ageDays: 12 }),
    "⏳ 12n",
  );
});

test("đơn sự cố: hiện số ngày kể cả khi chưa quá hạn", () => {
  assert.equal(
    ageBadge({ status: "su_co", isStale: false, ageDays: 2 }),
    "⏳ 2n",
  );
});

test("đơn đã hoàn tất không bao giờ có badge", () => {
  assert.equal(
    ageBadge({ status: "hoan_tat", isStale: false, ageDays: 400 }),
    null,
  );
});
```

- [ ] **Step 6: Chạy để chắc nó ĐỎ**

Chạy: `node --test tests/order-badge.test.ts`
Kỳ vọng: FAIL — không tìm thấy module.

- [ ] **Step 7: Viết order-badge.ts**

Tạo `src/lib/order-badge.ts`:

```ts
/**
 * Badge tuổi đơn cho màn danh sách. Module thuần.
 *
 * v8-A bỏ cột "Tuổi" khỏi bảng (6 cột đọc thoáng hơn 8), nhưng tuổi đơn chính
 * là thứ sinh ra cờ `isStale` — bỏ cột thì tín hiệu phải chuyển sang badge,
 * không được bỏ luôn.
 *
 * Badge CỐ Ý không lặp lại chữ "Sự cố": cột Trạng thái ngay cạnh đã in chữ
 * đó rồi. Với đơn sự cố ta hiện số ngày, vì đó mới là thông tin cột kia
 * không có.
 *
 * Kiểu `status` để `string` chứ không phải `OrderStatus`: giữ module này
 * thuần, không kéo theo `order-status.ts`.
 */
export function ageBadge(row: {
  status: string;
  isStale: boolean;
  ageDays: number;
}): string | null {
  if (row.status === "su_co" || row.isStale) return `⏳ ${row.ageDays}n`;
  return null;
}
```

- [ ] **Step 8: Chạy để chắc nó XANH**

Chạy: `node --test tests/order-badge.test.ts`
Kỳ vọng: PASS, 4/4.

Rồi `npm test` — kỳ vọng toàn bộ xanh.

- [ ] **Step 9: Commit**

```bash
git add src/lib/vn-time.ts src/lib/order-badge.ts tests/vn-time.test.ts tests/order-badge.test.ts
git commit -m "$(cat <<'EOF'
bảng: cắt năm theo giờ VN và badge tuổi đơn

yearInVn phải khớp với AT TIME ZONE trong SQL — lấy năm theo UTC thì đơn
tạo rạng sáng 01/01 rơi nhầm sang năm trước.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Component `DataTable`

**Files:**
- Create: `src/app/_components/data-table.tsx`
- Modify: `src/styles/components.css`

**Interfaces:**
- Consumes: `sortRows`, `SortDir` từ `src/lib/table-sort.ts`
- Produces:
  - `type Column<T> = { key, header, width, align?, mobile?, sortBy?, cell }`
  - `DataTable<T>` với props `{ columns, rows, rowKey, rowHref?, rowOnClick?, sort?, dir?, sortHref? }`

- [ ] **Step 1: Viết component**

Tạo `src/app/_components/data-table.tsx`:

```tsx
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { sortRows, type SortDir } from "@/lib/table-sort";

/**
 * Bảng cho màn danh sách. MỘT bộ DOM phục vụ cả hai kích thước.
 *
 * VÌ SAO KHÔNG DÙNG <table>: dòng hiện tại là <Link className="list-row"> —
 * cả dòng là một link, và HTML không cho <a> bọc <tr>. Dùng <table> thật thì
 * phải bỏ hành vi bấm-cả-dòng, mà đó chính là thứ màn điện thoại sống nhờ.
 * Nên "bảng" ở đây dựng bằng CSS Grid.
 *
 * VÌ SAO KHÔNG CÓ "use client": component này không dùng hook nào. Bỏ trống
 * chỉ thị thì nó chạy được ở CẢ server component lẫn client component —
 * `orders-list.tsx` và `customers-list.tsx` đều là client, còn màn khác có
 * thể gọi thẳng từ server. Thêm "use client" vào đây sẽ cấm đường thứ hai
 * (props `cell`/`sortBy` là hàm, không tuần tự hoá qua ranh giới được).
 *
 * Điện thoại ↔ desktop:
 *  - Điện thoại: grid 2 cột cứng; cột nào không có `mobile: true` bị ẩn.
 *    Thông tin phụ nằm trong ô tên dưới dạng <span className="dt-sub">.
 *  - Desktop: grid theo `--dt-cols`; `.dt-sub` bị ẩn vì lúc này nó đã có
 *    cột riêng.
 */
export type Column<T> = {
  key: string;
  header: string;
  /** Một phần của grid-template-columns: "1fr" | "90px" | "minmax(0,2fr)" */
  width: string;
  align?: "right";
  /** true = hiện cả trên điện thoại. Mặc định false: chỉ từ 900px. */
  mobile?: boolean;
  /** Vắng mặt = cột không sắp xếp được (không có link ở tiêu đề). */
  sortBy?: (row: T) => number | string | null;
  cell: (row: T) => ReactNode;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowHref,
  rowOnClick,
  sort,
  dir = "desc",
  sortHref,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  /** Trả về undefined cho hàng không bấm được. */
  rowHref?: (row: T) => string | undefined;
  rowOnClick?: (row: T) => void;
  /** `key` của cột đang sắp xếp. */
  sort?: string;
  dir?: SortDir;
  /** Sinh URL cho tiêu đề cột. Vắng mặt = tắt sắp xếp cả bảng. */
  sortHref?: (key: string, dir: SortDir) => string;
}) {
  const active = columns.find((c) => c.key === sort && c.sortBy);
  const ordered = active ? sortRows(rows, active.sortBy, dir) : rows;

  const style = {
    "--dt-cols": columns.map((c) => c.width).join(" "),
  } as CSSProperties;

  const cellClass = (c: Column<T>) =>
    `dt-c${c.mobile ? " dt-m" : ""}${c.align === "right" ? " dt-r" : ""}`;

  return (
    <div className="dt" style={style}>
      <div className="dt-head" role="row">
        {columns.map((c) => {
          const label =
            c.sortBy && sortHref ? (
              <Link
                href={sortHref(
                  c.key,
                  // Bấm lại đúng cột đang sắp xếp thì đảo chiều.
                  sort === c.key && dir === "desc" ? "asc" : "desc",
                )}
              >
                {c.header}
                {sort === c.key ? (dir === "desc" ? " ↓" : " ↑") : ""}
              </Link>
            ) : (
              c.header
            );
          return (
            <span key={c.key} className={cellClass(c)}>
              {label}
            </span>
          );
        })}
      </div>

      {ordered.map((row) => {
        const inner = columns.map((c) => (
          <span key={c.key} className={cellClass(c)}>
            {c.cell(row)}
          </span>
        ));
        const href = rowHref?.(row);
        if (href) {
          return (
            <Link key={rowKey(row)} href={href} className="dt-row">
              {inner}
            </Link>
          );
        }
        if (rowOnClick) {
          return (
            <button
              key={rowKey(row)}
              type="button"
              className="dt-row"
              onClick={() => rowOnClick(row)}
            >
              {inner}
            </button>
          );
        }
        return (
          <div key={rowKey(row)} className="dt-row dt-row-static">
            {inner}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Viết CSS cho bảng**

Thêm vào cuối `src/styles/components.css`:

```css
/* ---------- DataTable (v8-A) ----------
   Điện thoại: mỗi hàng là một thẻ 2 cột, trông y hệt .list-row cũ.
   Desktop (≥900px): cả khối thành bảng, hàng thấp lại còn 44px.
   Xem chú thích dài trong src/app/_components/data-table.tsx. */
.dt {
  display: flex;
  flex-direction: column;
}
.dt-head {
  display: none;
}
.dt-row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: var(--sp-1) var(--sp-3);
  width: 100%;
  min-height: 76px;
  padding: var(--sp-3) var(--sp-4);
  margin-bottom: var(--sp-2);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  font-size: var(--fs-3);
  text-align: left;
  text-decoration: none;
  cursor: pointer;
}
.dt-row-static {
  cursor: default;
}
.dt-c {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Điện thoại chỉ giữ cột có mobile: true. */
.dt-c:not(.dt-m) {
  display: none;
}
.dt-r {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
/* Dòng phụ trong ô tên — chỉ tồn tại trên điện thoại. */
.dt-sub {
  display: block;
  margin-top: var(--sp-1);
  font-size: var(--fs-2);
  font-weight: 400;
  color: var(--muted);
}
.dt-name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dt-badge {
  display: inline-block;
  margin-left: var(--sp-2);
  font-size: var(--fs-2);
  color: var(--warning);
  white-space: nowrap;
}

@media (min-width: 900px) {
  .dt {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .dt-head,
  .dt-row {
    display: grid;
    grid-template-columns: var(--dt-cols);
    gap: var(--sp-3);
    align-items: center;
  }
  .dt-head {
    padding: var(--sp-2) var(--sp-4);
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
    font-size: var(--fs-2);
    font-weight: 700;
    color: var(--muted);
  }
  .dt-head a {
    color: inherit;
    text-decoration: none;
  }
  .dt-head a:hover {
    color: var(--brand);
  }
  .dt-row {
    min-height: 44px;
    padding: var(--sp-2) var(--sp-4);
    margin-bottom: 0;
    border: none;
    border-bottom: 1px solid var(--border);
    border-radius: 0;
  }
  .dt-row:last-child {
    border-bottom: none;
  }
  .dt-row:hover {
    background: var(--brand-tint);
  }
  .dt-c:not(.dt-m) {
    display: block;
  }
  /* Desktop: thông tin phụ đã có cột riêng. */
  .dt-sub {
    display: none;
  }
}
```

- [ ] **Step 3: Kiểm kiểu**

Chạy: `npx tsc --noEmit`
Kỳ vọng: không lỗi. Chưa màn nào dùng `DataTable` nên chưa có gì để xem trên preview.

- [ ] **Step 4: Commit**

```bash
git add src/app/_components/data-table.tsx src/styles/components.css
git commit -m "$(cat <<'EOF'
bảng: component DataTable — một DOM cho cả điện thoại lẫn desktop

Dựng bằng CSS Grid chứ không phải <table>: cả dòng là một link, mà HTML
không cho <a> bọc <tr>. Cố ý không có "use client" để dùng được từ cả
server lẫn client component.

Chưa màn nào dùng tới.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Màn Đơn dùng `DataTable`

**Files:**
- Modify: `src/db/queries.ts` (`listOrdersWithGaps`)
- Modify: `src/app/orders/page.tsx`
- Modify: `src/app/orders/orders-list.tsx`
- Modify: `src/styles/screens.css`

**Interfaces:**
- Consumes: `DataTable`, `Column` (Task 5); `ageBadge` (Task 4); `SortDir` (Task 3)
- Produces: `listOrdersWithGaps()` trả thêm trường `itemCount: number`; `OrderRowItem` thêm `itemCount`, `depositText`, `statusText`, `ageBadgeText`

- [ ] **Step 1: Thêm `itemCount` vào truy vấn meta**

Trong `src/db/queries.ts`, hàm `listOrdersWithGaps`: thêm `itemCount` vào kiểu trả về của `raw.all` và thêm một subquery vào SELECT, **ngay sau** dòng `productPhotos` đang có:

```ts
    unconfirmed: number;
    productPhotos: number;
    itemCount: number;
```

```sql
            (SELECT COALESCE(SUM(i.quantity), 0)::int FROM order_items i
              WHERE i.order_id = o.id)                            AS "itemCount"
```

Chú ý: đặt dấu phẩy đúng chỗ — `productPhotos` đang là dòng cuối trước `FROM`.

Dùng `SUM(quantity)` chứ không phải `COUNT(*)`: một dòng "Dép Adidas × 3" là **3 món khách mua**, không phải 1. Cùng định nghĩa này dùng lại ở màn Khách hàng (Task 8).

Rồi sửa hai nhánh `return` ở cuối hàm để mang `itemCount` ra ngoài:

```ts
    if (!m) return { ...r, gaps: [] as GapCode[], itemCount: 0 };
    return {
      ...r,
      itemCount: m.itemCount,
      gaps: orderGaps(
```

Và mở rộng kiểu trả về của hàm:

```ts
export async function listOrdersWithGaps(): Promise<
  (OrderListRow & { gaps: GapCode[]; itemCount: number })[]
> {
```

- [ ] **Step 2: Kiểm truy vấn chạy thật**

Chạy: `npx tsc --noEmit` — kỳ vọng không lỗi.

Mở preview, vào `/orders`. Kỳ vọng: màn vẫn hiện như cũ (chưa đổi giao diện), không lỗi trong console. Nếu `itemCount` sai kiểu, biểu hiện là chuỗi nối thay vì số — đó là dấu hiệu quên `::int`.

- [ ] **Step 3: Đổi `OrdersList` sang `DataTable`**

Trong `src/app/orders/orders-list.tsx`:

Đổi import:

```tsx
import { DataTable, type Column } from "../_components/data-table";
import type { SortDir } from "@/lib/table-sort";
```

(bỏ `import { ListRow } ...`)

Mở rộng kiểu hàng:

```tsx
export type OrderRowItem = BulkOrder & {
  href: string;
  customerName: string;
  statusText: string;
  /** null = đơn bình thường, không hiện badge. */
  ageBadgeText: string | null;
  itemCount: number;
  deposit: number;
  depositText: string;
  amountDue: number;
  amountText: string;
  hasGap: boolean;
  gapTitle: string;
};
```

Thêm hai prop vào chữ ký component:

```tsx
export function OrdersList({
  rows,
  sort,
  dir,
  sortHref,
}: {
  rows: OrderRowItem[];
  sort?: string;
  dir: SortDir;
  sortHref: (key: string, dir: SortDir) => string;
}) {
```

Thay toàn bộ khối `{rows.map((r) => (<ListRow …/>))}` bằng:

```tsx
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => (selecting ? undefined : r.href)}
        rowOnClick={selecting ? (r) => toggle(r.id) : undefined}
        sort={sort}
        dir={dir}
        sortHref={sortHref}
      />
```

**`COLUMNS` phải nằm TRONG component** vì ô "Khách hàng" cần đọc `selecting` và `picked`. Đặt ngay trước `return`:

```tsx
  const COLUMNS: Column<OrderRowItem>[] = [
    {
      key: "id",
      header: "#",
      width: "56px",
      cell: (r) => <span className="lr-id">{r.id}</span>,
    },
    {
      key: "khach",
      header: "Khách hàng",
      width: "minmax(0, 2fr)",
      mobile: true,
      sortBy: (r) => r.customerName,
      cell: (r) => (
        <>
          <span className="dt-name">
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
          </span>
          {/* Chỉ hiện trên điện thoại — desktop có cột Trạng thái riêng. */}
          <span className="dt-sub">
            {r.statusText}
            {r.ageBadgeText ? ` · ${r.ageBadgeText}` : ""} · {r.itemCount} món
          </span>
        </>
      ),
    },
    {
      key: "trang_thai",
      header: "Trạng thái",
      width: "160px",
      sortBy: (r) => r.statusText,
      cell: (r) => (
        <>
          {r.statusText}
          {r.ageBadgeText && (
            <span className="dt-badge">{r.ageBadgeText}</span>
          )}
        </>
      ),
    },
    {
      key: "mon",
      header: "Món",
      width: "64px",
      align: "right",
      sortBy: (r) => r.itemCount,
      cell: (r) => r.itemCount,
    },
    {
      key: "da_thu",
      header: "Đã thu",
      width: "120px",
      align: "right",
      sortBy: (r) => r.deposit,
      cell: (r) => r.depositText,
    },
    {
      key: "con_thu",
      header: "Còn thu",
      width: "130px",
      align: "right",
      mobile: true,
      sortBy: (r) => r.amountDue,
      cell: (r) => r.amountText,
    },
  ];
```

- [ ] **Step 4: Nối dữ liệu ở `orders/page.tsx`**

Trong `src/app/orders/page.tsx`:

Thêm import:

```tsx
import { ageBadge } from "@/lib/order-badge";
import type { SortDir } from "@/lib/table-sort";
```

Mở rộng `searchParams` và đọc hai tham số mới:

```tsx
  searchParams: Promise<{
    q?: string;
    gap?: string;
    f?: string;
    sort?: string;
    dir?: string;
  }>;
```

```tsx
  const [session, { q, gap, f: rawF, sort, dir: rawDir }, all] =
    await Promise.all([requireAuth(), searchParams, listOrdersWithGaps()]);

  const dir: SortDir = rawDir === "asc" ? "asc" : "desc";
```

Sửa hàm `qs` để **giữ** `sort`/`dir` khi đổi chip lọc, và thêm hàm sinh URL cho tiêu đề cột:

```tsx
  const qs = (code: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (activeGap) p.set("gap", activeGap);
    if (sort) p.set("sort", sort);
    if (rawDir) p.set("dir", rawDir);
    // Chuỗi rỗng cũng phải ghi để phân biệt "chọn Tất cả" với "chưa chọn gì".
    p.set("f", code);
    return `/orders?${p.toString()}`;
  };

  const sortHref = (key: string, nextDir: SortDir) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (activeGap) p.set("gap", activeGap);
    p.set("f", f);
    p.set("sort", key);
    p.set("dir", nextDir);
    return `/orders?${p.toString()}`;
  };
```

Đổi phần dựng `rows` truyền vào `OrdersList` (thay cho `metaText` cũ):

```tsx
        <OrdersList
          sort={sort}
          dir={dir}
          sortHref={sortHref}
          rows={rows.map((o) => ({
            id: o.id,
            orderType: o.orderType,
            status: o.status,
            goodsTotalCny: o.goodsTotalCny,
            href: `/orders/${o.id}`,
            customerName: o.customerName,
            statusText: STATUS_LABELS[o.status],
            ageBadgeText: ageBadge(o),
            itemCount: o.itemCount,
            deposit: o.deposit,
            depositText: o.deposit > 0 ? formatVnd(o.deposit) : "—",
            amountDue: o.amountDue,
            amountText: formatVnd(o.amountDue),
            hasGap: o.gaps.length > 0,
            gapTitle: o.gaps.map((g) => GAP_LABELS[g]).join(" · "),
          }))}
        />
```

Lưu ý: sắp xếp mặc định của màn (sự cố lên trước, rồi đơn đứng lâu nhất) **giữ nguyên** trong `rows.sort(...)`. `DataTable` chỉ sắp xếp lại khi người dùng bấm tiêu đề cột — không có `sort` thì nó trả nguyên thứ tự nhận được.

- [ ] **Step 5: Xếp ô tìm kiếm và nút Tạo đơn cùng hàng trên desktop**

Thêm vào cuối `src/styles/screens.css`:

```css
/* ---------- Màn danh sách trên desktop (v8-A) ---------- */
@media (min-width: 900px) {
  /* Ô tìm và nút hành động về cùng một hàng — desktop không có ô hành động
     cố định ở header để neo vào (xem .header-action-float trong layout.css). */
  .list-toolbar {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
  }
  .list-toolbar .search {
    flex: 1;
  }
  /* Chip lọc thôi dính và thôi tràn viền — desktop đủ chỗ cho cả hàng. */
  .chip-bar {
    position: static;
    margin: 0 0 var(--sp-4);
    padding: 0;
    overflow-x: visible;
    flex-wrap: wrap;
  }
}
```

Trong `src/app/orders/page.tsx`, bọc form tìm kiếm:

```tsx
      <div className="list-toolbar">
        <form className="search" action="/orders" method="get">
          <input
            type="search"
            name="q"
            placeholder="Tìm tên khách / mã đơn…"
            defaultValue={q ?? ""}
            enterKeyHint="search"
          />
        </form>
      </div>
```

(Nút "Chọn" của chế độ chọn hàng loạt vẫn là `.header-action-float` trong `OrdersList`, không đụng.)

- [ ] **Step 6: Kiểm ba bề rộng**

Chạy: `npx tsc --noEmit` và `npm test` — kỳ vọng cả hai xanh.

Mở preview, vào `/orders`. Chụp màn ở **390px**, **900px**, **1440px**.

Kỳ vọng:
- 390px: giống hệt trước v8-A — tên khách + dòng meta xám + số tiền bên phải.
- 1440px: bảng 6 cột, tiền canh phải, bấm tiêu đề "Còn thu" thì sắp xếp và mũi tên ↓ hiện ra.
- Bấm "Chọn" → hàng thành nút chọn, thanh dính đáy hiện, tabbar ẩn (ở mobile). Đây là chỗ dễ vỡ nhất vì `rowHref`/`rowOnClick` đổi vai — phải thử thật.

Chạy trong console trình duyệt:
`[...document.querySelectorAll("input,select,textarea")].map(el=>getComputedStyle(el).fontSize)`
Kỳ vọng: mọi giá trị là `"16px"`.

- [ ] **Step 7: Commit**

```bash
git add src/db/queries.ts src/app/orders/page.tsx src/app/orders/orders-list.tsx src/styles/screens.css
git commit -m "$(cat <<'EOF'
đơn: màn danh sách thành bảng 6 cột trên laptop

Thêm cột Món (SUM quantity, gộp vào truy vấn meta sẵn có) và Đã thu. Bỏ
cột Loại và Tuổi; tín hiệu quá hạn chuyển sang badge cạnh Trạng thái.
Sắp xếp làm ở server qua query string, không thêm JS phía client.

Điện thoại không đổi.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Truy vấn thống kê khách hàng theo năm

**Files:**
- Modify: `src/db/queries.ts`

**Interfaces:**
- Consumes: `openOrderSql` (đã có, `src/db/queries.ts:91`)
- Produces:
  - `type CustomerStatsRow = { id, name, phone, warningFlag, warningReason, orderCount, itemCount, paidVnd, outstandingVnd }`
  - `listCustomerStats(year: number | null): Promise<CustomerStatsRow[]>`
  - `listOrderYears(): Promise<number[]>`

- [ ] **Step 1: Viết truy vấn**

Thêm vào `src/db/queries.ts`, đặt ngay sau `listCustomersWithTotals` (giữ hàm cũ — Tổng quan vẫn dùng nó):

```ts
export type CustomerStatsRow = {
  id: number;
  name: string;
  phone: string | null;
  warningFlag: boolean;
  warningReason: string | null;
  orderCount: number;
  itemCount: number;
  paidVnd: number;
  outstandingVnd: number;
};

/**
 * Thống kê khách theo NĂM TẠO ĐƠN (v8-A).
 *
 * `year === null` = tất cả các năm, và hiện MỌI khách kể cả khách chưa có đơn
 * nào. Chọn một năm cụ thể thì chỉ hiện khách có ít nhất một đơn trong năm đó
 * — nếu không danh sách đầy khách toàn số 0, đúng thứ không ai cần nhìn.
 *
 * BA CÁI BẪY, cả ba đều cho ra SỐ SAI mà không báo lỗi:
 *
 * 1. KHÔNG JOIN order_items rồi SUM(o.deposit). JOIN món nhân bản dòng đơn:
 *    một đơn 3 món bị cộng tiền 3 lần. Vì vậy `agg` (gom đơn) và `itm` (gom
 *    món) là HAI CTE riêng, ghép vào customers bằng hai LEFT JOIN độc lập.
 * 2. Cắt năm theo giờ Việt Nam, không theo UTC. Đơn tạo 5h sáng 01/01 giờ VN
 *    là 22h 31/12 giờ UTC — thiếu AT TIME ZONE là nó rơi nhầm sang năm trước.
 *    Phải khớp với yearInVn() trong src/lib/vn-time.ts.
 * 3. ::int cho mọi SUM/COUNT trên cột integer, alias camelCase bọc nháy kép.
 */
export async function listCustomerStats(
  year: number | null,
): Promise<CustomerStatsRow[]> {
  const yearWhere =
    year === null
      ? ""
      : ` AND EXTRACT(YEAR FROM to_timestamp(o.created_at)
                       AT TIME ZONE 'Asia/Ho_Chi_Minh') = ?`;
  const params = year === null ? [] : [year];
  // Chọn một năm thì bỏ khách không có đơn nào trong năm đó.
  const joinAgg = year === null ? "LEFT JOIN" : "JOIN";

  const rows = await raw.all<{
    id: number;
    name: string;
    phone: string | null;
    warning_flag: boolean;
    warning_reason: string | null;
    orderCount: number;
    itemCount: number;
    paidVnd: number;
    outstandingVnd: number;
  }>(
    `WITH ord AS (
       SELECT o.id, o.customer_id, o.deposit, o.amount_due,
              o.status, o.order_type
         FROM orders o
        WHERE o.customer_id IS NOT NULL${yearWhere}
     ),
     agg AS (
       SELECT ord.customer_id,
              COUNT(*)::int                                   AS order_count,
              SUM(ord.deposit)::int                           AS paid,
              SUM(CASE WHEN ${openOrderSql("ord")}
                       THEN ord.amount_due ELSE 0 END)::int   AS outstanding
         FROM ord GROUP BY ord.customer_id
     ),
     itm AS (
       SELECT ord.customer_id, SUM(i.quantity)::int AS item_count
         FROM ord JOIN order_items i ON i.order_id = ord.id
        GROUP BY ord.customer_id
     )
     SELECT c.id, c.name, c.phone, c.warning_flag, c.warning_reason,
            COALESCE(agg.order_count, 0)  AS "orderCount",
            COALESCE(itm.item_count, 0)   AS "itemCount",
            COALESCE(agg.paid, 0)         AS "paidVnd",
            COALESCE(agg.outstanding, 0)  AS "outstandingVnd"
       FROM customers c
       ${joinAgg} agg ON agg.customer_id = c.id
       LEFT JOIN itm ON itm.customer_id = c.id
      ORDER BY "outstandingVnd" DESC, c.name`,
    params,
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    warningFlag: r.warning_flag === true,
    warningReason: r.warning_reason,
    orderCount: r.orderCount,
    itemCount: r.itemCount,
    paidVnd: r.paidVnd,
    outstandingVnd: r.outstandingVnd,
  }));
}

/** Các năm có đơn, giảm dần — dùng dựng chip lọc. */
export async function listOrderYears(): Promise<number[]> {
  const rows = await raw.all<{ y: number }>(
    `SELECT DISTINCT
            EXTRACT(YEAR FROM to_timestamp(created_at)
                    AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS y
       FROM orders
      ORDER BY y DESC`,
  );
  return rows.map((r) => r.y);
}
```

- [ ] **Step 2: Kiểm cú pháp SQL bằng cách gọi thật**

Chạy: `npx tsc --noEmit` — kỳ vọng không lỗi.

Chưa có màn gọi nó. Kiểm bằng cách tạm thời thêm vào đầu `src/app/customers/page.tsx`:

```tsx
  const _thu = await listCustomerStats(null);
  console.log("listCustomerStats(null):", _thu.slice(0, 3));
  console.log("listOrderYears:", await listOrderYears());
```

Mở preview, vào `/customers`, đọc log của server trong `preview_logs`.
Kỳ vọng: in ra mảng có đủ 9 trường, `orderCount`/`itemCount`/`paidVnd`/`outstandingVnd` là **số** chứ không phải chuỗi. Thấy chuỗi tức là quên `::int` ở đâu đó.

Xoá đoạn tạm này ngay sau khi xem xong.

- [ ] **Step 3: NGHIỆM THU BẮT BUỘC — đối chiếu tay**

Đây **không** phải bước tuỳ chọn. SQL này không có test tự động (dự án không có DB test) và cái bẫy nhân bản dòng ở bước 1 sẽ cho ra số sai mà mọi thứ vẫn "chạy".

Chọn **một khách có ít nhất một đơn từ 2 món trở lên**. Chạy trên SQL editor của Supabase:

```sql
-- Thay 123 bằng id khách thật.
SELECT COUNT(*)                AS so_don,
       SUM(o.deposit)          AS da_tra
  FROM orders o WHERE o.customer_id = 123;

SELECT SUM(i.quantity)         AS so_mon
  FROM orders o JOIN order_items i ON i.order_id = o.id
 WHERE o.customer_id = 123;
```

So ba số này với `listCustomerStats(null)` cho đúng khách đó.
Kỳ vọng: **khớp tuyệt đối**. `da_tra` lệch lên đúng bội số của số món là dấu hiệu JOIN đã nhân bản dòng — quay lại bước 1 sửa CTE.

Ghi kết quả đối chiếu vào phần mô tả commit.

- [ ] **Step 4: Commit**

```bash
git add src/db/queries.ts
git commit -m "$(cat <<'EOF'
khách hàng: truy vấn thống kê theo năm tạo đơn

listCustomerStats gom đơn và gom món ở hai CTE riêng — JOIN order_items
rồi SUM(deposit) sẽ cộng tiền một đơn n lần theo số món. Cắt năm theo
Asia/Ho_Chi_Minh để đơn tạo rạng sáng 01/01 không rơi nhầm năm.

Đã đối chiếu tay với Supabase cho khách #<id>: <n> đơn / <n> món /
<n>₫ đã trả — khớp.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Màn Khách hàng — chip năm và bảng

**Files:**
- Modify: `src/app/customers/page.tsx`
- Modify: `src/app/customers/customers-list.tsx`

**Interfaces:**
- Consumes: `listCustomerStats`, `listOrderYears` (Task 7); `DataTable`, `Column` (Task 5); `SortDir` (Task 3)
- Produces: không

- [ ] **Step 1: Viết lại `customers/page.tsx`**

```tsx
import { requireAuth } from "@/lib/auth";
import { AppShell } from "../_components/app-shell";
import { ChipBar, Chip } from "../_components/chip";
import { listCustomerStats, listOrderYears } from "@/db/queries";
import { formatVnd } from "@/lib/format";
import type { SortDir } from "@/lib/table-sort";
import { CustomersList, type CustomerItem } from "./customers-list";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{
    err?: string;
    year?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const [session, { err, year: rawYear, sort, dir: rawDir }, years] =
    await Promise.all([requireAuth(), searchParams, listOrderYears()]);

  // "" hoặc thiếu = tất cả các năm. Năm lạ (gõ tay vào URL) cũng về tất cả.
  const parsed = Number(rawYear);
  const year =
    rawYear && Number.isInteger(parsed) && years.includes(parsed)
      ? parsed
      : null;
  const dir: SortDir = rawDir === "asc" ? "asc" : "desc";

  const customers = await listCustomerStats(year);

  const items: CustomerItem[] = customers.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    phoneText: c.phone ?? "—",
    orderCount: c.orderCount,
    itemCount: c.itemCount,
    paidVnd: c.paidVnd,
    paidText: c.paidVnd > 0 ? formatVnd(c.paidVnd) : "—",
    outstandingVnd: c.outstandingVnd,
    outstandingText: c.outstandingVnd > 0 ? formatVnd(c.outstandingVnd) : "—",
    warningFlag: c.warningFlag,
    warningReason: c.warningReason,
  }));

  const chipHref = (y: number | null) => {
    const p = new URLSearchParams();
    if (y !== null) p.set("year", String(y));
    if (sort) p.set("sort", sort);
    if (rawDir) p.set("dir", rawDir);
    const qs = p.toString();
    return qs ? `/customers?${qs}` : "/customers";
  };

  const sortHref = (key: string, nextDir: SortDir) => {
    const p = new URLSearchParams();
    if (year !== null) p.set("year", String(year));
    p.set("sort", key);
    p.set("dir", nextDir);
    return `/customers?${p.toString()}`;
  };

  return (
    <AppShell username={session.username} title="Khách hàng">
      {err && <div className="error">{err}</div>}

      <ChipBar>
        <Chip href={chipHref(null)} label="Tất cả" active={year === null} />
        {years.map((y) => (
          <Chip
            key={y}
            href={chipHref(y)}
            label={String(y)}
            active={year === y}
          />
        ))}
      </ChipBar>

      {items.length === 0 ? (
        <div className="card empty">
          <p>
            {year === null
              ? "Chưa có khách nào. Khách sẽ được tạo khi lên đơn."
              : `Không có khách nào đặt đơn trong năm ${year}.`}
          </p>
        </div>
      ) : (
        <CustomersList
          customers={items}
          canDelete={session.role === "admin"}
          sort={sort}
          dir={dir}
          sortHref={sortHref}
        />
      )}
    </AppShell>
  );
}
```

- [ ] **Step 2: Viết lại `customers-list.tsx`**

Giữ nguyên phần `Sheet` xoá khách; chỉ đổi phần render danh sách:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { DataTable, type Column } from "../_components/data-table";
import { Sheet } from "../_components/sheet";
import type { SortDir } from "@/lib/table-sort";
import { deleteCustomerAction } from "./actions";

export type CustomerItem = {
  id: number;
  name: string;
  phone: string | null;
  phoneText: string;
  orderCount: number;
  itemCount: number;
  paidVnd: number;
  paidText: string;
  outstandingVnd: number;
  outstandingText: string;
  warningFlag: boolean;
  warningReason: string | null;
};

const COLUMNS: Column<CustomerItem>[] = [
  {
    key: "ten",
    header: "Khách hàng",
    width: "minmax(0, 2fr)",
    mobile: true,
    sortBy: (c) => c.name,
    cell: (c) => (
      <>
        <span className="dt-name">
          {c.warningFlag && (
            <span
              className="warn-dot"
              title={c.warningReason ?? "Khách có cờ cảnh báo"}
            />
          )}
          {c.name}
        </span>
        {/* Chỉ hiện trên điện thoại — desktop có cột riêng cho từng số. */}
        <span className="dt-sub">
          {c.phoneText} · {c.orderCount} đơn · {c.itemCount} món
        </span>
      </>
    ),
  },
  {
    key: "sdt",
    header: "SĐT",
    width: "130px",
    sortBy: (c) => c.phone,
    cell: (c) => c.phoneText,
  },
  {
    key: "don",
    header: "Đơn",
    width: "64px",
    align: "right",
    sortBy: (c) => c.orderCount,
    cell: (c) => c.orderCount,
  },
  {
    key: "mon",
    header: "Món",
    width: "64px",
    align: "right",
    sortBy: (c) => c.itemCount,
    cell: (c) => c.itemCount,
  },
  {
    key: "da_tra",
    header: "Đã trả",
    width: "130px",
    align: "right",
    sortBy: (c) => c.paidVnd,
    cell: (c) => c.paidText,
  },
  {
    key: "con_no",
    header: "Còn nợ",
    width: "130px",
    align: "right",
    mobile: true,
    sortBy: (c) => c.outstandingVnd,
    cell: (c) => c.outstandingText,
  },
];

export function CustomersList({
  customers,
  canDelete,
  sort,
  dir,
  sortHref,
}: {
  customers: CustomerItem[];
  canDelete: boolean;
  sort?: string;
  dir: SortDir;
  sortHref: (key: string, dir: SortDir) => string;
}) {
  const [picked, setPicked] = useState<CustomerItem | null>(null);

  return (
    <>
      <DataTable
        columns={COLUMNS}
        rows={customers}
        rowKey={(c) => c.id}
        // Nhân viên: chạm để xem đơn như cũ. Admin: chạm mở sheet có nút xoá.
        rowHref={
          canDelete
            ? undefined
            : (c) => `/orders?q=${encodeURIComponent(c.name)}`
        }
        rowOnClick={canDelete ? (c) => setPicked(c) : undefined}
        sort={sort}
        dir={dir}
        sortHref={sortHref}
      />

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

- [ ] **Step 3: Kiểm ba bề rộng và hai vai trò**

Chạy: `npx tsc --noEmit` và `npm test` — kỳ vọng cả hai xanh.

Mở preview, vào `/customers`. Chụp **390px**, **900px**, **1440px**.

Kỳ vọng:
- 390px: tên + dòng xám "SĐT · n đơn · n món" + số nợ bên phải. Chip năm cuộn ngang được.
- 1440px: bảng 6 cột, chip năm xuống dòng thay vì cuộn.
- Bấm chip "2025" → số đổi, và **`orderCount` của một khách phải ≤ số của "Tất cả"**.
- Đăng nhập bằng tài khoản admin: chạm một khách mở sheet có nút Xoá. Đăng nhập bằng nhân viên: chạm nhảy sang `/orders?q=…`. Hai đường này dùng `rowOnClick` và `rowHref` khác nhau — phải thử cả hai.

- [ ] **Step 4: Commit**

```bash
git add src/app/customers/page.tsx src/app/customers/customers-list.tsx
git commit -m "$(cat <<'EOF'
khách hàng: bảng 6 cột kèm chip lọc theo năm

Thêm số món và tiền đã trả. Mốc năm là ngày TẠO ĐƠN nên bốn cột cùng nói
về một tập đơn và cộng trừ khớp nhau. Chọn một năm cụ thể thì ẩn khách
không có đơn năm đó.

Điện thoại không đổi.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Màn Tổng quan — hàng KPI và lưới việc

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/styles/components.css`
- Modify: `src/styles/screens.css`

**Interfaces:**
- Consumes: `.kpi-row`, `.card-grid` (Task 1)
- Produces: không

- [ ] **Step 1: CSS cho ô KPI**

Thêm vào cuối `src/styles/components.css`:

```css
/* ---------- Ô số liệu ở Tổng quan (v8-A) ---------- */
.kpi {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  padding: var(--sp-3) var(--sp-4);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  text-decoration: none;
  min-width: 0;
}
.kpi-label {
  font-size: var(--fs-2);
  font-weight: 600;
  color: var(--muted);
}
.kpi-value {
  font-size: var(--fs-5);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--brand);
  overflow: hidden;
  text-overflow: ellipsis;
}
.kpi-value.profit-negative {
  color: var(--danger);
}
.kpi-sub {
  font-size: var(--fs-2);
  color: var(--text-subtle);
}
@media (min-width: 900px) {
  .kpi-value {
    font-size: var(--fs-6);
  }
}
```

- [ ] **Step 2: Thêm hàng KPI vào `page.tsx`**

Trong `src/app/page.tsx`, ngay **sau** khối `{backupOverdue && …}` và **trước** section "Cần chú ý", chèn:

```tsx
      <div className="kpi-row">
        <Link href="/reports" className="kpi">
          <span className="kpi-label">Doanh thu tháng này</span>
          <strong className="kpi-value">{formatVnd(revenueVnd)}</strong>
          <span className="kpi-sub">{pnlOrderCount} đơn hoàn tất</span>
        </Link>
        <Link href="/reports" className="kpi">
          <span className="kpi-label">Lãi tháng này</span>
          <strong
            className={`kpi-value${pnl.netProfitVnd < 0 ? " profit-negative" : ""}`}
          >
            {formatVnd(pnl.netProfitVnd)}
          </strong>
          <span className="kpi-sub">
            {pnl.estimated.orderCount > 0
              ? `${pnl.estimated.orderCount} đơn còn ước tính`
              : "đã xác nhận đủ giá vốn"}
          </span>
        </Link>
        <Link href="/customers" className="kpi">
          <span className="kpi-label">Công nợ</span>
          <strong className="kpi-value">{formatVnd(totalOutstanding)}</strong>
          <span className="kpi-sub">{topDebtors.length} khách còn nợ</span>
        </Link>
        <Link href="/finance" className="kpi">
          <span className="kpi-label">Ví ¥</span>
          <strong
            className={`kpi-value${wallet.balance < 0 ? " profit-negative" : ""}`}
          >
            {wallet.balance.toLocaleString("vi-VN")}¥
          </strong>
          <span className="kpi-sub">≈ {formatVnd(wallet.valueVnd)}</span>
        </Link>
      </div>
```

Ngay dưới `const pnl = computePnl(pnlData);` thêm hai biến dẫn xuất:

```tsx
  // Doanh thu và số đơn gộp cả khối đã xác nhận lẫn khối còn ước tính —
  // PnlBlock.revenueVnd đã tính sẵn, màn này chỉ chưa hiển thị.
  const revenueVnd = pnl.confirmed.revenueVnd + pnl.estimated.revenueVnd;
  const pnlOrderCount = pnl.confirmed.orderCount + pnl.estimated.orderCount;
```

Sửa `topDebtors` để đếm được **tất cả** khách còn nợ, không chỉ 5:

```tsx
  const debtors = customers.filter((c) => c.outstanding > 0);
  const topDebtors = debtors.slice(0, 5);
```

và đổi `kpi-sub` của ô Công nợ thành `{debtors.length} khách còn nợ`.

- [ ] **Step 3: Xoá hai thẻ cũ đã lên KPI, tách thẻ Công nợ**

Trong `src/app/page.tsx`:

- **Xoá hẳn** `<section className="card">` của **Ví ¥** và của **Lãi tháng này** (cả hai đã thành ô KPI).
- Đổi thẻ **Công nợ** thành thẻ chỉ còn danh sách khách nợ (số tổng đã lên KPI):

```tsx
      <section className="card">
        <h2 className="card-title">Khách nợ nhiều nhất</h2>
        {topDebtors.length === 0 ? (
          <p className="muted">Không khách nào còn nợ 👍</p>
        ) : (
          <ul className="dash-debtors">
            {topDebtors.map((c) => (
              <li key={c.id}>
                <Link href="/customers">{c.name}</Link>
                <span>{formatVnd(c.outstanding)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
```

- [ ] **Step 4: Xếp bốn thẻ còn lại thành hai lưới**

Thứ tự cuối cùng trong `page.tsx`: hàng KPI → "Đơn theo trạng thái" (cả bề rộng, để nguyên) → lưới 1 → lưới 2.

Bọc bốn thẻ còn lại:

```tsx
      <div className="card-grid">
        {/* Cần chú ý — giữ nguyên nội dung, chỉ đổi .slice ở trên */}
        <section className="card"> … </section>
        {/* Khách nợ nhiều nhất */}
        <section className="card"> … </section>
      </div>

      <div className="card-grid">
        {/* Cần bổ sung */}
        <section className="card"> … </section>
        {/* Tác vụ nhanh */}
        <section className="card"> … </section>
      </div>
```

Đổi `attention` để lấy 8 đơn thay vì 5:

```tsx
    .slice(0, 8);
```

và trong phần render, gắn class cho ba dòng cuối:

```tsx
          attention.map((o, i) => (
            <div key={o.id} className={i >= 5 ? "row-desk-only" : undefined}>
              <ListRow
                href={`/orders/${o.id}`}
                title={o.customerName}
                meta={o.status === "su_co" ? "⚠️ Sự cố" : `⏳ ${o.ageDays} ngày`}
                amount={formatVnd(o.amountDue)}
              />
            </div>
          ))
```

Thêm vào cuối `src/styles/screens.css`:

```css
/* Ba dòng cuối của "Cần chú ý" chỉ hiện từ 900px — desktop có chỗ cho 8 đơn,
   điện thoại thì 5 là vừa một màn. Server luôn render đủ 8 (luật một-DOM);
   đây là chỗ duy nhất cắt bằng CSS. */
.row-desk-only {
  display: none;
}
@media (min-width: 900px) {
  .row-desk-only {
    display: block;
  }
}
```

- [ ] **Step 5: Kiểm ba bề rộng**

Chạy: `npx tsc --noEmit` và `npm test` — kỳ vọng cả hai xanh.

Mở preview, vào `/`. Chụp **390px**, **900px**, **1440px**.

Kỳ vọng:
- 390px: hàng KPI là lưới 2×2; bốn thẻ dưới xếp một cột; "Cần chú ý" hiện **5** đơn.
- 1440px: hàng KPI 4 cột ngang; hai lưới mỗi lưới 2 thẻ; "Cần chú ý" hiện **8** đơn.
- Bấm từng ô KPI: Doanh thu và Lãi → `/reports`, Công nợ → `/customers`, Ví ¥ → `/finance`.
- Số ở ô Doanh thu **không** được là `0` nếu tháng này có đơn hoàn tất. Nếu bằng 0 mà lãi khác 0, kiểm lại `pnl.confirmed.revenueVnd`.

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx src/styles/components.css src/styles/screens.css
git commit -m "$(cat <<'EOF'
tổng quan: hàng KPI trên cùng, lưới việc bên dưới

Bốn ô số: doanh thu (PnlBlock.revenueVnd, trước nay đã tính mà chưa hiện),
lãi tháng, công nợ, ví ¥. Ví ¥ và Lãi thôi làm thẻ riêng; Công nợ tách số
tổng lên KPI, danh sách khách nợ thành thẻ riêng.

Điện thoại giữ nguyên thứ tự khối, chỉ khác KPI xếp 2×2 và "Cần chú ý"
hiện 5 đơn thay vì 8.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Cột phải cho màn Tạo đơn

**Files:**
- Modify: `src/app/orders/new/new-order-form.tsx`

**Interfaces:**
- Consumes: `.with-rail`, `.rail`, `.rail-detail` (Task 1)
- Produces: không

- [ ] **Step 1: Bọc thân form và thanh tiền vào `.with-rail`**

Trong `src/app/orders/new/new-order-form.tsx`, phần `return`: hiện `<form id="new-order-form">` và `<StickyBar>` là hai anh em cùng cấp (StickyBar dùng `form="new-order-form"` để submit, nên **không** cần nằm trong form). Bọc cả hai:

```tsx
      <div className="with-rail">
        <form id="new-order-form" action={formAction}>
          {/* … toàn bộ nội dung form giữ nguyên … */}
        </form>

        <div className="rail">
          <StickyBar>
            {/* … nội dung mới ở bước 2 … */}
          </StickyBar>
        </div>
      </div>
```

**Không** đổi thứ tự hay nội dung bên trong `<form>`. Giữ nguyên các `<Sheet>` (`CustomerSheet`, `ItemSheet`, `QuickImportSheet`) **ngoài** `.with-rail` — chúng là overlay `position: fixed`, nằm trong lưới sẽ bị lưới kéo méo.

- [ ] **Step 2: Thêm phần chi tiết tiền chỉ hiện trên desktop**

Trước hết, tách cọc đã đọc ra một biến dùng chung. Hiện `computeOrderMoney` được gọi với `deposit: parseVnd(deposit)` ngay tại chỗ (`new-order-form.tsx:224–230`), và **`OrderMoneyResult` KHÔNG có trường `deposit`** — nó chỉ trả `{ goodsTotalVnd, subtotalVnd, amountDue }` (đã kiểm `src/lib/money.ts`). Nên sửa thành:

```tsx
  const depositVnd = parseVnd(deposit);

  const money = computeOrderMoney({
    goodsTotalCny,
    exchangeRate: parseVnd(exchangeRate),
    serviceFee: marginVnd,
    shippingFee: parseVnd(shippingFee),
    deposit: depositVnd,
  });
```

Rồi thay nội dung `<StickyBar>` bằng:

```tsx
          <StickyBar>
            {/* Bốn dòng này chỉ hiện từ 900px — điện thoại vẫn chỉ thấy
                dòng Tổng như trước, thanh dính đáy không cao thêm. */}
            <div className="rail-detail">
              <div className="kv">
                <span className="muted">Tiền hàng</span>
                <span className="num">{goodsTotalCny.toLocaleString("vi-VN")}¥</span>
              </div>
              <div className="kv">
                <span className="muted">Giá vốn quy đổi</span>
                <span className="num">{formatVnd(goodsVnd)}</span>
              </div>
              <div className="kv">
                <span className="muted">Lời</span>
                <span className={`num${marginVnd < 0 ? " neg" : ""}`}>
                  {formatVnd(marginVnd)}
                </span>
              </div>
              <div className="kv">
                <span className="muted">Cọc</span>
                <span className="num">{formatVnd(depositVnd)}</span>
              </div>
            </div>

            <span className="sb-money">
              <span className="sb-label">Tổng</span>
              <strong className="num">{formatVnd(totalVnd)}</strong>
              <span className="sb-label">
                Lời{" "}
                <span className={marginVnd < 0 ? "neg" : ""}>
                  {formatVnd(marginVnd)}
                </span>
              </span>
            </span>
            <button
              type="submit"
              form="new-order-form"
              className="btn"
              disabled={!canSubmit || pending}
            >
              {pending ? "Đang lưu…" : "Lưu đơn"}
            </button>
          </StickyBar>
```

Bốn biến còn lại đều **đã có sẵn** trong component: `goodsTotalCny`, `goodsVnd`, `marginVnd`, `totalVnd` (`new-order-form.tsx:180–222`).

**KHÔNG định nghĩa class `.kv`** — nó đã có ở `legacy.css:294` (flex, space-between, viền đứt dưới, `span:first-child` màu `--muted`), và `legacy.css` được import **cuối cùng** nên luật mới cùng độ đặc hiệu sẽ thua nó. Dùng lại luật sẵn có.

- [ ] **Step 3: Kiểm ba bề rộng**

Chạy: `npx tsc --noEmit` — kỳ vọng không lỗi.

Mở preview, vào `/orders/new`. Chụp **390px**, **900px**, **1440px**.

Kỳ vọng:
- 390px: **giống hệt trước v8-A** — thanh dính đáy ở đáy màn, chỉ có dòng Tổng + Lời + nút Lưu đơn. Bốn dòng chi tiết **không** hiện. Tabbar ẩn.
- 1440px: form bên trái, thẻ tiền bên phải, thẻ dính lại khi cuộn. Thẻ **không** bị đẩy lệch sang phải 240px (nếu lệch → luật `.with-rail .sticky-bar { margin-left: 0 }` ở Task 1 chưa ăn).
- Thử tạo một đơn thật ở 1440px: thêm khách, thêm 2 món, bấm Lưu đơn. Đơn phải tạo thành công — nút submit qua `form="new-order-form"` là chỗ dễ đứt nhất khi bọc lại DOM.

Chạy trong console:
`[...document.querySelectorAll("input,select,textarea")].map(el=>getComputedStyle(el).fontSize)`
Kỳ vọng: mọi giá trị `"16px"`.

- [ ] **Step 4: Commit**

```bash
git add src/app/orders/new/new-order-form.tsx
git commit -m "$(cat <<'EOF'
tạo đơn: khối tiền thành cột phải dính trên laptop

Cùng một khối DOM: dưới 900px vẫn là .sticky-bar ở đáy màn như cũ, từ
900px thành thẻ trong cột phải. Bốn dòng chi tiết (tiền hàng ¥, giá vốn,
lời, cọc) mang .rail-detail nên điện thoại không thấy.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Cột phải cho màn Chi tiết đơn

**Files:**
- Modify: `src/app/orders/[id]/page.tsx`

**Interfaces:**
- Consumes: `.with-rail`, `.rail` (Task 1)
- Produces: không

- [ ] **Step 1: Bọc lại phần thân**

Trong `src/app/orders/[id]/page.tsx`, hiện thứ tự là: `<section className="order-head">` → `{err && …}` → `<OrderJourney …>` → `<OrderTabs …>` → các khối `{tab === "…" && …}`.

Xếp lại thành:

```tsx
      {err && <div className="error">{err}</div>}

      <div className="with-rail">
        <div>
          <OrderTabs orderId={order.id} active={tab} />

          {tab === "tom_tat" && ( /* … giữ nguyên … */ )}
          {tab === "mon" && ( /* … giữ nguyên … */ )}
          {tab === "tien" && ( /* … giữ nguyên … */ )}
          {tab === "anh" && ( /* … giữ nguyên … */ )}
        </div>

        <div className="rail">
          <section className="order-head">
            <span className="oh-label">Còn phải thu</span>
            <strong className="oh-amount num">
              {formatVnd(money.amountDue)}
            </strong>
            <span className="oh-meta">
              {ORDER_TYPE_LABELS[order.orderType]} ·{" "}
              {ageInDays(order.statusChangedAt)} ngày
            </span>
            {/* LINK, không phải nút thu tiền. Thu tiền là thao tác ghi tiền
                thật — đặt cùng một hành động ở hai nơi là cách chắc chắn để
                có người bấm hai lần. Form thu tiền ở nguyên tab Tiền. */}
            {tab !== "tien" && money.amountDue > 0 && (
              <Link
                href={`/orders/${order.id}?tab=tien`}
                className="btn btn-outline"
              >
                Thu tiền →
              </Link>
            )}
          </section>

          <OrderJourney
            orderId={order.id}
            orderType={order.orderType}
            status={order.status}
            positionStatus={positionStatus}
            nextStatuses={nextStatuses}
          />
        </div>
      </div>
```

Kiểm `Link` đã được import ở đầu file; nếu chưa, thêm `import Link from "next/link";`.

- [ ] **Step 2: Cho `order-head` trông như một thẻ trong cột phải**

Thêm vào cuối `src/styles/screens.css`, **trong** một khối media query mới:

```css
@media (min-width: 900px) {
  /* order-head thôi làm tiêu đề trôi trong luồng, thành thẻ ở cột phải. */
  .rail .order-head {
    padding: var(--sp-4);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    gap: var(--sp-2);
  }
  /* Tab thôi dính đỉnh: trong cột trái của lưới, sticky đo theo khung cha
     nên nó dính sai chỗ. */
  .with-rail .tabs {
    position: static;
    margin-top: 0;
  }
}
```

- [ ] **Step 3: Kiểm ba bề rộng và cả bốn tab**

Chạy: `npx tsc --noEmit` và `npm test` — kỳ vọng cả hai xanh.

Mở preview, vào một đơn có tiền chưa thu đủ. Chụp **390px**, **900px**, **1440px**.

Kỳ vọng:
- 390px: **giống hệt trước v8-A** — số tiền lớn trên cùng, rồi hành trình đơn, rồi tab. Nút "Thu tiền →" cũng hiện (nó không bị `.rail-detail` che), chấp nhận được vì nó chỉ là link tới tab đang có.
- 1440px: tab và nội dung bên trái; số tiền + hành trình đơn bên phải, dính khi cuộn.
- Bấm qua **cả bốn tab** (Tóm tắt, Món, Tiền, Ảnh). Ở tab Tiền, nút "Thu tiền →" **không** hiện.
- Thử một thao tác ghi thật: chuyển bước ở cột phải, và thu một khoản ở tab Tiền. Cả hai phải chạy như cũ.

- [ ] **Step 4: Commit**

```bash
git add "src/app/orders/[id]/page.tsx" src/styles/screens.css
git commit -m "$(cat <<'EOF'
chi tiết đơn: số tiền và hành trình đơn sang cột phải dính

order-head và OrderJourney vốn đã render ngoài phần tab nên chỉ là bọc
lại div. Cột phải cố ý KHÔNG có nút thu tiền — chỉ link sang tab Tiền,
để một thao tác ghi tiền không có hai chỗ bấm.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Nghiệm thu toàn phần và cập nhật `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: mọi task trước
- Produces: không

- [ ] **Step 1: Rà lại toàn bộ màn ở ba bề rộng**

Mở preview và đi qua **tất cả** các màn ở 390px rồi 1440px:

`/` · `/orders` · `/orders/new` · `/orders/<id>` (cả 4 tab) · `/customers` · `/inventory` · `/finance` · `/reports` · `/settings` · `/backup` · `/admin/users` · `/admin/deletions` · `/khong-co-trang-nay`

Kỳ vọng ở 390px: **không màn nào đổi so với trước v8-A**, trừ ba chỗ đã biết và cố ý — Tổng quan có thêm hàng KPI 2×2, màn Khách hàng có thêm chip năm và thêm số món trong dòng meta, sidebar/sheet không còn mục Tracking.

Kỳ vọng ở 1440px: không màn nào còn bị ghim 960px; không màn nào tràn ngang (cuộn ngang là lỗi).

Các màn chưa được thiết kế riêng (`/inventory`, `/finance`, `/reports`, `/settings`) sẽ chỉ rộng ra 1280px — đúng như spec, chúng không nằm trong phạm vi v8-A.

- [ ] **Step 2: Kiểm cỡ chữ ô nhập trên mọi màn có form**

Ở `/orders/new`, `/settings`, `/customers`, và trong một `Sheet` đang mở, chạy trong console:

```js
[...document.querySelectorAll("input,select,textarea")].map(el=>getComputedStyle(el).fontSize)
```

Kỳ vọng: mọi giá trị đúng `"16px"`. Bất kỳ giá trị nào nhỏ hơn là Safari iOS sẽ tự phóng to trang khi chạm — sửa ngay, đừng để lại.

- [ ] **Step 3: Chạy đủ bộ kiểm tra**

```bash
npm test
```
Kỳ vọng: toàn bộ xanh, gồm 3 file test mới (`table-sort`, `vn-time`, `order-badge`).

```bash
npx tsc --noEmit
```
Kỳ vọng: không lỗi.

- [ ] **Step 4: Cập nhật `CLAUDE.md`**

Trong đoạn mở đầu, nối vào sau câu về v7:

```
**v8-A xong** — giao diện desktop: màn Tổng quan có hàng KPI (doanh thu, lãi
tháng, công nợ, ví ¥) rồi tới lưới việc; màn Đơn và Khách hàng thành bảng 6
cột từ 900px (`DataTable`, dựng bằng CSS Grid chứ không phải `<table>`); màn
Khách hàng lọc theo năm tạo đơn; Tạo đơn và Chi tiết đơn có cột phải dính
chứa khối tiền; ẩn Tracking khỏi nav; thêm trang 404. Dưới 900px không đổi
một pixel. Spec: `docs/superpowers/specs/2026-09-01-heyp-v8a-giao-dien-desktop-design.md`,
kế hoạch: `docs/superpowers/plans/2026-09-01-heyp-v8a-giao-dien-desktop.md`.
```

Thêm bốn mục vào phần **LƯU Ý QUAN TRỌNG (gotchas)**:

```markdown
- **Bố cục desktop dùng một DOM, KHÔNG render hai lần rồi ẩn một** (v8-A) —
  `DataTable` (`src/app/_components/data-table.tsx`) đổi hình bằng CSS: điện
  thoại là grid 2 cột và các cột không có `mobile: true` bị ẩn, desktop là
  grid theo `--dt-cols`. Thông tin phụ nằm trong ô tên dưới dạng `.dt-sub`,
  ẩn từ 900px. Cách kia (`.only-desktop`/`.only-mobile`) tạo hai nguồn chân
  lý cho cùng một dòng dữ liệu — sửa một quên một, và không test nào bắt được
  vì cả hai bản đều chạy.
- **`DataTable` cố ý KHÔNG có `"use client"`** — nó không dùng hook nào, nên
  bỏ trống chỉ thị thì dùng được ở cả server lẫn client component. Thêm
  `"use client"` vào là cấm luôn đường server, vì `cell`/`sortBy` là hàm,
  không tuần tự hoá qua ranh giới được. Và **KHÔNG** dùng `<table>` thật: cả
  dòng là một `<Link>`, mà HTML không cho `<a>` bọc `<tr>`.
- **Cắt năm PHẢI theo giờ Việt Nam ở CẢ HAI phía** (v8-A) — SQL dùng
  `EXTRACT(YEAR FROM to_timestamp(created_at) AT TIME ZONE 'Asia/Ho_Chi_Minh')`,
  JS dùng `yearInVn()` trong `src/lib/vn-time.ts`. Lệch nhau thì chip năm hiện
  ra một danh sách mà truy vấn trả về tập khác. Lấy năm theo UTC thì đơn tạo
  5h sáng 01/01 giờ VN rơi nhầm sang năm trước.
- **`listCustomerStats` gom đơn và gom món ở HAI CTE riêng** (`src/db/queries.ts`)
  — JOIN `order_items` vào rồi `SUM(o.deposit)` sẽ cộng tiền một đơn n lần
  theo số món của nó. Không có test tự động cho câu này (không có DB test),
  nên sửa nó xong phải đối chiếu tay với Supabase trên một khách có đơn nhiều
  món.
```

Thêm hai dòng vào mục **Tài liệu**:

```markdown
- Thiết kế v8-A (giao diện desktop): `docs/superpowers/specs/2026-09-01-heyp-v8a-giao-dien-desktop-design.md`, kế hoạch: `docs/superpowers/plans/2026-09-01-heyp-v8a-giao-dien-desktop.md`
```

Trong mục **Điều hướng (v5)**, nối thêm:

```markdown
  Tracking đã bỏ khỏi `nav-config.ts` từ v8-A nhưng route `/tracking` vẫn sống
  — thêm lại một dòng là nó quay về menu.
```

- [ ] **Step 5: Commit và push**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
tài liệu: ghi nhận v8-A và bốn gotcha mới

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
git push
```

---

## Nghiệm thu v8-A

Đánh dấu khi đã kiểm thật, không suy đoán:

- [ ] Ảnh chụp 390px của `/`, `/orders`, `/orders/new`, `/orders/<id>`, `/customers` **không khác** trước v8-A (trừ ba thay đổi cố ý ở Task 12 bước 1)
- [ ] Ảnh chụp 1440px: không màn nào bị ghim 960px, không màn nào cuộn ngang
- [ ] Bảng ở `/orders` sắp xếp được bằng cách bấm tiêu đề cột, và đảo chiều khi bấm lại
- [ ] Chế độ "Chọn" hàng loạt ở `/orders` vẫn chạy (hàng đổi từ link sang nút chọn)
- [ ] Chip năm ở `/customers` đổi số đúng; `orderCount` của một năm ≤ của "Tất cả"
- [ ] **Đối chiếu tay `listCustomerStats` với Supabase trên một khách có đơn nhiều món — ba số khớp tuyệt đối**
- [ ] Tài khoản admin mở được sheet xoá khách; tài khoản nhân viên nhảy sang `/orders?q=…`
- [ ] Tạo được một đơn thật từ `/orders/new` ở bề rộng 1440px
- [ ] Chuyển bước và thu tiền ở `/orders/<id>` vẫn chạy ở cả hai bề rộng
- [ ] Sidebar và sheet "Thêm" không còn mục Tracking; vào thẳng `/tracking` vẫn mở được
- [ ] `/khong-co-trang-nay` ra trang 404 với hai nút bấm được
- [ ] Mọi `input`/`select`/`textarea` trả `"16px"`
- [ ] `npm test` xanh · `npx tsc --noEmit` không lỗi
