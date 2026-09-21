# HeyP v9-C — Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sửa ảnh của mẫu lưu từ đơn; cho bán hàng tồn kho nhiều món ngay trong màn tạo đơn; thêm cột Ngày tạo và bộ lọc kiểu Excel cho danh sách đơn; hiện và tìm theo SĐT khi chọn khách; nén ảnh nhẹ hơn.

**Architecture:** Luật mới đi vào module thuần trong `src/lib/`, có test `node:test` (`phone.ts`, `order-filters.ts`, `planStockSale` trong `inventory.ts`, hai hàm giờ VN trong `vn-time.ts`). DB giữ đúng lối cũ: SQL thô qua `raw`/`withTx`. Giao diện bám các khối sẵn có (`Sheet`, `DataTable`, `.picker`, `.sheet-item`). Lọc đơn chạy trên server với tham số URL, giống cách `f`/`sort` đang làm.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Postgres (Supabase) qua `postgres-js`, `sharp`, `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-21-heyp-v9c-anh-ban-kho-loc-don-design.md`

## Global Constraints

- UI tiếng Việt. Tiền VND `₫`, tệ `¥`.
- Số người dùng gõ PHẢI đọc qua `src/lib/parse-number.ts` (`parseVnd` cho VND, `parseDecimal` cho ¥).
- SQL thô: placeholder `?`; alias camelCase bọc nháy kép (`AS "avgCost"`); `SUM()/COUNT()` trên cột integer ép `::int`; cột bigint đọc bằng SQL thô ra CHUỖI.
- Trong `withTx` chỉ dùng `x`, không dùng `raw` toàn cục. Không retry trong transaction.
- `logActivity` gọi NGOÀI transaction. Server action mới hoặc đổi tên phải có trong `tests/activity-coverage.test.ts`.
- `autoCompleteIfPaid` gọi NGOÀI `withTx`.
- Mọi `input/select/textarea` mới: `font-size: var(--fs-3)` (16px).
- Mọi `padding/margin/gap` mới trong `src/styles/`: `var(--sp-*)` (`tests/spacing-grid.test.ts`).
- Chỗ hiển thị ảnh ≤140px dùng `photoUrl(id, "thumb")`.
- Module thuần dùng cho test: import nội bộ có đuôi `.ts` (`./order-status.ts`), không dùng alias `@/`.
- Cắt ngày theo giờ Việt Nam (UTC+7, không có giờ mùa hè).
- Commit tiếng Việt, kết thúc bằng `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Trước mỗi commit: `npm test` và `npx tsc --noEmit` xanh.
- **Migration trong Task 6 chạy trên DB thật (Supabase).** Hỏi người dùng trước khi chạy `npm run db:migrate`.

## Bản đồ file

| File | Việc |
| --- | --- |
| `src/lib/phone.ts` (mới) | `normalizePhone`, `phoneNeedle`, `matchesCustomer` |
| `src/lib/vn-time.ts` | thêm `vnYmd`, `vnMidnightMs`, `shortDateVn` |
| `src/lib/order-filters.ts` (mới) | parse/serialize/match bộ lọc đơn |
| `src/lib/inventory.ts` | thêm `planStockSale` |
| `src/lib/deletion.ts`, `src/db/deletion.ts` | chặn xoá đơn `ban_tu_kho` |
| `src/db/queries.ts` | viết lại `sellFromStock`, thêm `listSellableStock` |
| `src/db/product-photos.ts` | thêm `copyPhotosToProduct`, tách `copyOneFile` |
| `src/lib/image.ts` | hằng số nén mới |
| `drizzle/0010_ban_tu_kho_backfill.sql` (mới) + `_journal.json` | vá doanh thu đơn bán kho cũ |
| `src/app/_components/data-table.tsx` | `Column.headerExtra` |
| `src/app/(app)/orders/page.tsx` | đọc bộ lọc, lọc, nút Lọc |
| `src/app/(app)/orders/orders-list.tsx` | cột Ngày tạo, ▾ đầu cột |
| `src/app/(app)/orders/filter-fields.tsx` (mới) | một nhóm lọc (dùng chung) |
| `src/app/(app)/orders/order-filter-sheet.tsx` (mới) | nút "Lọc (n)" + Sheet |
| `src/app/(app)/orders/column-filter.tsx` (mới) | ▾ + bảng nổi cho một cột |
| `src/app/(app)/orders/actions.ts` | nhánh `ban_tu_kho` trong `createOrderAction` |
| `src/app/(app)/orders/new/types.ts` | `CustomerOption.phone`, `ItemRow.inventoryId/stockLeft`, `StockOption` |
| `src/app/(app)/orders/new/customer-sheet.tsx` | SĐT, tìm theo SĐT |
| `src/app/(app)/orders/new/stock-picker-sheet.tsx` (mới) | Sheet chọn hàng tồn |
| `src/app/(app)/orders/new/item-sheet.tsx` | chế độ món kho; gửi ảnh khi lưu mẫu |
| `src/app/(app)/orders/new/new-order-form.tsx` | ô tên khách mới, chế độ bán kho |
| `src/app/(app)/orders/new/page.tsx` | nạp `phone`, nạp hàng tồn |
| `src/app/(app)/inventory/actions.ts`, `sell-form.tsx` | gọi `sellFromStock` mới, giá theo cái |
| `src/app/(app)/products/actions.ts` | `quickSaveProductAction` chép ảnh |
| `src/styles/screens.css` | CSS lọc, SĐT trong sheet, hàng tồn |
| `scripts/compare-image-quality.mjs` (mới) | đo nén ảnh |
| `CLAUDE.md` | ghi nhận v9-C + gotcha |

---

### Task 1: Chuẩn hoá SĐT và tìm khách theo SĐT (hàm thuần)

**Files:**
- Create: `src/lib/phone.ts`
- Test: `tests/phone.test.ts`

**Interfaces:**
- Produces:
  - `normalizePhone(s: string): string`
  - `phoneNeedle(q: string): string | null` (chuỗi số đã chuẩn hoá, hoặc null nếu `q` không giống SĐT)
  - `matchesCustomer(c: { name: string; phone: string | null }, q: string): boolean`

- [ ] **Step 1: Viết test (sẽ đỏ)**

```ts
// tests/phone.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  matchesCustomer,
  normalizePhone,
  phoneNeedle,
} from "../src/lib/phone.ts";

test("bỏ mọi ký tự không phải số", () => {
  assert.equal(normalizePhone("0912.345 678"), "0912345678");
  assert.equal(normalizePhone("(091) 234-5678"), "0912345678");
});

test("+84 và 84 đầu số đổi về 0", () => {
  assert.equal(normalizePhone("+84 912 345 678"), "0912345678");
  assert.equal(normalizePhone("84912345678"), "0912345678");
  // Gõ dở "+84 91" vẫn đổi — dấu + nói rõ đây là mã nước.
  assert.equal(normalizePhone("+84 91"), "091");
});

test("84 đứng đầu một số NGẮN không bị đổi (có thể là đoạn giữa số)", () => {
  assert.equal(normalizePhone("8491"), "8491");
});

test("phoneNeedle: cần ít nhất 3 chữ số và chỉ gồm ký tự của số điện thoại", () => {
  assert.equal(phoneNeedle("09"), null);
  assert.equal(phoneNeedle("Lan"), null);
  assert.equal(phoneNeedle("Lan 0912"), null);
  assert.equal(phoneNeedle("0912"), "0912");
  assert.equal(phoneNeedle("912 345"), "912345");
  assert.equal(phoneNeedle("+84 912"), "0912");
});

test("matchesCustomer khớp tên (không phân biệt hoa thường) hoặc SĐT một phần", () => {
  const c = { name: "Lan Anh", phone: "0912 345 678" };
  assert.equal(matchesCustomer(c, "lan"), true);
  assert.equal(matchesCustomer(c, "0912"), true);
  assert.equal(matchesCustomer(c, "345 678"), true);
  assert.equal(matchesCustomer(c, "+84 912"), true);
  assert.equal(matchesCustomer(c, "0988"), false);
  assert.equal(matchesCustomer({ name: "Hoa", phone: null }, "0912"), false);
  assert.equal(matchesCustomer(c, ""), true);
});
```

- [ ] **Step 2: Chạy test, xác nhận đỏ**

Run: `node --test tests/phone.test.ts`
Expected: FAIL, không tìm thấy module `../src/lib/phone.ts`.

- [ ] **Step 3: Viết hàm**

```ts
// src/lib/phone.ts
/**
 * SĐT khách — chuẩn hoá để TÌM, không để lưu. Module thuần.
 *
 * Khách gõ SĐT đủ kiểu: "0912.345.678", "+84 912 345 678", "(091) 234-5678".
 * So chuỗi thô thì "0912" không khớp "+84 912…", nên cả hai phía đều qua
 * normalizePhone trước khi so.
 */
export function normalizePhone(s: string): string {
  const raw = s.trim();
  const digits = raw.replace(/\D/g, "");
  // "+84" là mã nước rõ ràng, đổi ngay kể cả khi gõ dở.
  if (raw.startsWith("+84")) return "0" + digits.slice(2);
  // "84" không có dấu + chỉ đổi khi đủ dài một số di động (84 + 9 số);
  // số ngắn bắt đầu bằng 84 có thể là đoạn giữa số người ta đang gõ.
  if (digits.startsWith("84") && digits.length >= 11) return "0" + digits.slice(2);
  return digits;
}

/** Chuỗi gõ vào có phải đang tìm SĐT không. Có thì trả về số đã chuẩn hoá. */
export function phoneNeedle(q: string): string | null {
  const t = q.trim();
  if (!/^[\d\s.+()-]+$/.test(t)) return null;
  if (t.replace(/\D/g, "").length < 3) return null;
  return normalizePhone(t);
}

export function matchesCustomer(
  c: { name: string; phone: string | null },
  q: string,
): boolean {
  const needle = q.trim().toLowerCase();
  if (needle === "") return true;
  if (c.name.toLowerCase().includes(needle)) return true;
  const p = phoneNeedle(q);
  return p !== null && c.phone !== null && normalizePhone(c.phone).includes(p);
}
```

- [ ] **Step 4: Chạy test, xác nhận xanh**

Run: `node --test tests/phone.test.ts`
Expected: PASS (5 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/phone.ts tests/phone.test.ts
git commit -m "SĐT: chuẩn hoá và khớp khách theo tên hoặc số

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Sheet chọn khách hiện và tìm theo SĐT

**Files:**
- Modify: `src/app/(app)/orders/new/types.ts` (`CustomerOption`)
- Modify: `src/app/(app)/orders/new/page.tsx` (truyền `phone`)
- Modify: `src/app/(app)/orders/new/customer-sheet.tsx`
- Modify: `src/app/(app)/orders/new/new-order-form.tsx` (khối khách)
- Modify: `src/styles/screens.css`

**Interfaces:**
- Consumes: `matchesCustomer`, `phoneNeedle` (Task 1).
- Produces: `CustomerPick = { mode: "existing"; id: number; name: string } | { mode: "new"; name: string; phone?: string }`.

- [ ] **Step 1: Thêm `phone` vào `CustomerOption`**

Trong `types.ts`, thêm trường vào `CustomerOption`:

```ts
export type CustomerOption = {
  id: number;
  name: string;
  /** v9-C: hiện dưới tên và dùng để tìm — tên không phải định danh duy nhất. */
  phone: string | null;
  warningFlag: boolean;
  warningReason: string | null;
};
```

Trong `orders/new/page.tsx`, trong `customers.map(...)` thêm `phone: c.phone,` (drizzle `listCustomers()` đã trả cột này).

- [ ] **Step 2: Viết lại phần lọc và danh sách của `CustomerSheet`**

Thay `CustomerPick` và thân component (giữ nguyên import `Sheet`, thêm import từ `@/lib/phone`):

```tsx
import { matchesCustomer, phoneNeedle } from "@/lib/phone";

export type CustomerPick =
  | { mode: "existing"; id: number; name: string }
  | { mode: "new"; name: string; phone?: string };
```

```tsx
  const needle = q.trim().toLowerCase();
  const matches = useMemo(
    () => customers.filter((c) => matchesCustomer(c, q)),
    [customers, q],
  );

  // Gõ dãy số → đang tìm theo SĐT. Không ai khớp thì mời tạo khách mới với
  // số đó; tên để trống và form sẽ bắt nhập.
  const phone = phoneNeedle(q);
  // Trùng tên KHÔNG chặn tạo mới — hai "Lan" khác SĐT là hai người. Chỉ nói
  // rõ là đang có người trùng tên.
  const sameName = customers.filter((c) => c.name.toLowerCase() === needle).length;
  const canCreate = needle.length > 0 && (phone === null || matches.length === 0);
```

Danh sách (thay khối `<div className="sheet-list">`):

```tsx
      <div className="sheet-list">
        {canCreate &&
          (phone !== null ? (
            <button
              type="button"
              className="sheet-item sheet-item-create"
              onClick={() => pick({ mode: "new", name: "", phone: q.trim() })}
            >
              + Tạo khách mới với SĐT {q.trim()}
            </button>
          ) : (
            <button
              type="button"
              className="sheet-item sheet-item-create"
              onClick={() => pick({ mode: "new", name: q.trim() })}
            >
              + Tạo khách mới «{q.trim()}»
              {sameName > 0 && ` (đã có ${sameName} người trùng tên)`}
            </button>
          ))}
        {matches.map((c) => (
          <button
            key={c.id}
            type="button"
            className="sheet-item cust-item"
            onClick={() => pick({ mode: "existing", id: c.id, name: c.name })}
          >
            {c.warningFlag && <span className="warn-dot" title="Khách có cờ cảnh báo" />}
            <span className="cust-text">
              <span>{c.name}</span>
              <span className={c.phone ? "cust-phone" : "cust-phone muted"}>
                {c.phone ?? "chưa có SĐT"}
              </span>
            </span>
          </button>
        ))}
        {matches.length === 0 && !canCreate && (
          <p className="muted">Chưa có khách nào. Gõ tên hoặc SĐT để tạo mới.</p>
        )}
      </div>
```

Đổi placeholder ô tìm thành `"Gõ tên hoặc SĐT…"`.

- [ ] **Step 3: Form tạo đơn nhận khách mới chưa có tên**

Trong `new-order-form.tsx`:

1. Truyền `onPick` là hàm mới thay cho `setPicked`:

```tsx
  function pickCustomer(p: CustomerPick) {
    setPicked(p);
    // Khách mới tạo từ SĐT: điền sẵn số vào ô SĐT.
    if (p.mode === "new" && p.phone) setNewCustomerPhone(p.phone);
  }
```

và `<CustomerSheet ... onPick={pickCustomer} />`.

2. Thay input ẩn `newCustomerName` (hiện đang là `{picked?.mode === "new" && (<input type="hidden" name="newCustomerName" .../>)}`) bằng: chỉ render input ẩn khi `picked.name !== ""`:

```tsx
          {picked?.mode === "new" && picked.name !== "" && (
            <input type="hidden" name="newCustomerName" value={picked.name} />
          )}
```

3. Nút picker hiện SĐT của khách có sẵn. Ngay sau nút `.picker` của khách, khi khách mới chưa có tên thì hiện ô bắt buộc nhập tên:

```tsx
          <button
            type="button"
            className="picker"
            onClick={() => setCustomerSheet(true)}
          >
            {picked
              ? picked.name ||
                (picked.mode === "new" ? `Khách mới · ${newCustomerPhone}` : "")
              : "+ Chọn khách"}
            {picked?.mode === "existing" &&
              (() => {
                const p = customers.find((c) => c.id === picked.id)?.phone;
                return p ? <span className="picker-sub"> · {p}</span> : null;
              })()}
          </button>

          {picked?.mode === "new" && picked.name === "" && (
            <label className="field">
              <span>Tên khách *</span>
              <input
                name="newCustomerName"
                autoFocus
                required
                placeholder="VD: Lan Anh"
              />
            </label>
          )}
```

Lưu ý: ô tên này CỐ Ý không điều khiển (không `value`, không `onChange`). Nếu gõ vào mà cập nhật `picked.name` thì điều kiện `picked.name === ""` sai ngay ký tự đầu và ô biến mất. `required` để trình duyệt chặn gửi form khi trống; server vẫn trả lỗi "Chưa nhập tên khách mới." nếu lọt.

4. `<details className="more-fields">` của khách mới: thêm `open={newCustomerPhone !== ""}` để khi tạo từ SĐT thì ô SĐT hiện sẵn.

- [ ] **Step 4: CSS**

Thêm vào `src/styles/screens.css`, ngay sau khối `.warn-dot`:

```css
/* v9-C: tên + SĐT trong Sheet chọn khách. */
.cust-text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
}
.cust-phone {
  font-size: var(--fs-2);
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}
.picker-sub {
  margin-left: var(--sp-1);
  font-weight: 400;
  color: var(--muted);
}
```

- [ ] **Step 5: Typecheck + test**

Run: `npx tsc --noEmit && npm test`
Expected: không lỗi, mọi test xanh.

- [ ] **Step 6: Kiểm trên trình duyệt**

`preview_start` với tên trong `.claude/launch.json`, đăng nhập, mở `/orders/new` ở cỡ `mobile`:
- Mở Sheet chọn khách: mỗi dòng có tên + SĐT (hoặc "chưa có SĐT").
- Gõ 3–4 số cuối SĐT một khách có thật → khách đó hiện ra.
- Gõ `0999 000 111` (không ai có) → nút "+ Tạo khách mới với SĐT 0999 000 111"; bấm → ô "Tên khách *" hiện, khối SĐT mở sẵn với số đó.
- Chạy trong console: `[...document.querySelectorAll("input,select,textarea")].map(el=>getComputedStyle(el).fontSize)` → mọi giá trị là `16px`.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(app\)/orders/new src/styles/screens.css
git commit -m "chọn khách: hiện SĐT, tìm theo SĐT, tạo khách mới từ SĐT

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Bộ lọc đơn (hàm thuần) + giờ VN

**Files:**
- Modify: `src/lib/vn-time.ts`
- Create: `src/lib/order-filters.ts`
- Test: `tests/vn-time.test.ts` (thêm), `tests/order-filters.test.ts` (mới)

**Interfaces:**
- Produces (`vn-time.ts`):
  - `vnYmd(d: Date): { y: number; m: number; d: number }`
  - `vnMidnightMs(y: number, m: number, d: number): number` (m từ 1; tràn tháng tự xử lý)
  - `shortDateVn(d: Date, now: Date): string` (`dd/mm`, khác năm thì `dd/mm/yy`)
- Produces (`order-filters.ts`):
  - `FILTER_STATUSES`, `DATE_PRESETS`, `DATE_PRESET_LABELS`, `DUE_LABELS`
  - `type DatePreset`, `type DateFilter = { preset: DatePreset } | { from: string; to: string }`, `type DueFilter = "paid" | "owing"`
  - `type OrderFilters = { date: DateFilter | null; statuses: OrderStatus[]; types: OrderType[]; due: DueFilter | null }`
  - `type FilterGroup = "date" | "status" | "type" | "due"`
  - `EMPTY_FILTERS: OrderFilters`
  - `FILTER_PARAM_KEYS = ["d", "st", "type", "due"] as const`
  - `parseOrderFilters(sp: { d?: string; st?: string; type?: string; due?: string }): OrderFilters`
  - `filtersToParams(f: OrderFilters, base: URLSearchParams): URLSearchParams`
  - `dateBounds(d: DateFilter, now: Date): { fromMs: number; toMs: number }` (nửa mở `[from, to)`)
  - `matchesOrderFilters(row: { createdAt: Date; status: OrderStatus; orderType: OrderType; amountDue: number }, f: OrderFilters, now: Date): boolean`
  - `isGroupActive(f: OrderFilters, g: FilterGroup): boolean`
  - `activeGroupCount(f: OrderFilters): number`
  - `clearGroup(f: OrderFilters, g: FilterGroup): OrderFilters`

- [ ] **Step 1: Test giờ VN (đỏ)**

Thêm vào cuối `tests/vn-time.test.ts` (sửa dòng import thành `import { shortDateVn, vnMidnightMs, vnYmd, yearInVn, yearsFromDates } from "../src/lib/vn-time.ts";`):

```ts
test("vnYmd: 23:30 UTC là sáng hôm sau ở VN", () => {
  assert.deepEqual(vnYmd(new Date("2026-09-20T23:30:00Z")), { y: 2026, m: 9, d: 21 });
  assert.deepEqual(vnYmd(new Date("2026-09-20T16:59:59Z")), { y: 2026, m: 9, d: 20 });
});

test("vnMidnightMs: 00:00 giờ VN = 17:00 UTC hôm trước, tràn tháng tự xử lý", () => {
  assert.equal(vnMidnightMs(2026, 9, 21), Date.parse("2026-09-20T17:00:00Z"));
  assert.equal(vnMidnightMs(2026, 13, 1), Date.parse("2026-12-31T17:00:00Z"));
  assert.equal(vnMidnightMs(2026, 0, 1), Date.parse("2025-11-30T17:00:00Z"));
});

test("shortDateVn: cùng năm dd/mm, khác năm dd/mm/yy", () => {
  const now = new Date("2026-09-21T05:00:00Z");
  assert.equal(shortDateVn(new Date("2026-09-20T23:30:00Z"), now), "21/09");
  assert.equal(shortDateVn(new Date("2025-12-31T18:00:00Z"), now), "01/01");
  assert.equal(shortDateVn(new Date("2025-12-31T10:00:00Z"), now), "31/12/25");
});
```

- [ ] **Step 2: Chạy, xác nhận đỏ**

Run: `node --test tests/vn-time.test.ts`
Expected: FAIL (`vnYmd` không được export).

- [ ] **Step 3: Viết hàm giờ VN**

Thêm vào cuối `src/lib/vn-time.ts`:

```ts
/**
 * Việt Nam cố định UTC+7, không có giờ mùa hè — cộng thẳng offset là đủ,
 * không cần Intl cho phép tính ngày (Intl chậm và khó ghép ngược ra epoch).
 */
const VN_OFFSET_MS = 7 * 3600 * 1000;

export function vnYmd(d: Date): { y: number; m: number; d: number } {
  const s = new Date(d.getTime() + VN_OFFSET_MS);
  return { y: s.getUTCFullYear(), m: s.getUTCMonth() + 1, d: s.getUTCDate() };
}

/** 00:00 giờ VN của ngày (y, m, d) tính bằng epoch ms. m=13 hay m=0 tự tràn năm. */
export function vnMidnightMs(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d) - VN_OFFSET_MS;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Ngày ngắn cho cột bảng: "21/09"; khác năm hiện tại thì "31/12/25". */
export function shortDateVn(d: Date, now: Date): string {
  const a = vnYmd(d);
  const base = `${pad2(a.d)}/${pad2(a.m)}`;
  return a.y === vnYmd(now).y ? base : `${base}/${String(a.y).slice(2)}`;
}
```

- [ ] **Step 4: Chạy, xác nhận xanh**

Run: `node --test tests/vn-time.test.ts`
Expected: PASS.

- [ ] **Step 5: Test bộ lọc (đỏ)**

```ts
// tests/order-filters.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_FILTERS,
  activeGroupCount,
  clearGroup,
  dateBounds,
  filtersToParams,
  matchesOrderFilters,
  parseOrderFilters,
} from "../src/lib/order-filters.ts";

// 21/09/2026 12:00 giờ VN.
const NOW = new Date("2026-09-21T05:00:00Z");
const row = (over: Partial<Parameters<typeof matchesOrderFilters>[0]> = {}) => ({
  createdAt: new Date("2026-09-21T02:00:00Z"),
  status: "da_mua_tq" as const,
  orderType: "order_ho" as const,
  amountDue: 100_000,
  ...over,
});

test("parse: giá trị hợp lệ", () => {
  const f = parseOrderFilters({
    d: "7d",
    st: "da_mua_tq,da_giao_khach",
    type: "ban_tu_kho",
    due: "owing",
  });
  assert.deepEqual(f, {
    date: { preset: "7d" },
    statuses: ["da_mua_tq", "da_giao_khach"],
    types: ["ban_tu_kho"],
    due: "owing",
  });
});

test("parse: giá trị lạ bị bỏ qua, không lỗi; mã về hưu không lọc được", () => {
  const f = parseOrderFilters({
    d: "xyz",
    st: "da_mua_tq,bogus,cho_bao_gia,da_mua_tq",
    type: "abc",
    due: "maybe",
  });
  assert.deepEqual(f, { ...EMPTY_FILTERS, statuses: ["da_mua_tq"] });
});

test("parse: khoảng ngày, đảo ngược thì tự sửa, sai định dạng thì bỏ", () => {
  assert.deepEqual(parseOrderFilters({ d: "2026-09-01_2026-09-15" }).date, {
    from: "2026-09-01",
    to: "2026-09-15",
  });
  assert.deepEqual(parseOrderFilters({ d: "2026-09-15_2026-09-01" }).date, {
    from: "2026-09-01",
    to: "2026-09-15",
  });
  assert.equal(parseOrderFilters({ d: "2026-9-1_2026-09-15" }).date, null);
});

test("serialize rồi parse lại ra đúng cái cũ, và giữ tham số khác", () => {
  const f = parseOrderFilters({ d: "2026-09-01_2026-09-15", st: "hoan_tat", due: "paid" });
  const p = filtersToParams(f, new URLSearchParams("q=lan&f=&d=today"));
  assert.equal(p.get("q"), "lan");
  assert.equal(p.get("f"), "");
  assert.deepEqual(
    parseOrderFilters(Object.fromEntries(p) as Record<string, string>),
    f,
  );
  assert.equal(filtersToParams(EMPTY_FILTERS, new URLSearchParams("d=7d")).has("d"), false);
});

test("dateBounds: hôm nay theo giờ VN", () => {
  const b = dateBounds({ preset: "today" }, NOW);
  assert.equal(b.fromMs, Date.parse("2026-09-20T17:00:00Z"));
  assert.equal(b.toMs, Date.parse("2026-09-21T17:00:00Z"));
});

test("dateBounds: 7 ngày = hôm nay + 6 ngày trước", () => {
  const b = dateBounds({ preset: "7d" }, NOW);
  assert.equal(b.fromMs, Date.parse("2026-09-14T17:00:00Z"));
  assert.equal(b.toMs, Date.parse("2026-09-21T17:00:00Z"));
});

test("dateBounds: tháng trước khi đang ở tháng 1 lùi về tháng 12 năm trước", () => {
  const jan = new Date("2027-01-10T05:00:00Z");
  const b = dateBounds({ preset: "prev_month" }, jan);
  assert.equal(b.fromMs, Date.parse("2026-11-30T17:00:00Z"));
  assert.equal(b.toMs, Date.parse("2026-12-31T17:00:00Z"));
});

test("dateBounds: khoảng từ–đến bao gồm cả ngày cuối", () => {
  const b = dateBounds({ from: "2026-09-01", to: "2026-09-15" }, NOW);
  assert.equal(b.fromMs, Date.parse("2026-08-31T17:00:00Z"));
  assert.equal(b.toMs, Date.parse("2026-09-15T17:00:00Z"));
});

test("match: biên ngày theo giờ VN — 23:30 và 00:30", () => {
  const f = { ...EMPTY_FILTERS, date: { preset: "today" as const } };
  // 20/09 23:30 giờ VN — hôm qua.
  assert.equal(matchesOrderFilters(row({ createdAt: new Date("2026-09-20T16:30:00Z") }), f, NOW), false);
  // 21/09 00:30 giờ VN — hôm nay (theo UTC vẫn là 20/09).
  assert.equal(matchesOrderFilters(row({ createdAt: new Date("2026-09-20T17:30:00Z") }), f, NOW), true);
});

test("match: trạng thái và loại đơn là HOẶC trong nhóm, VÀ giữa các nhóm", () => {
  const ff = parseOrderFilters({ st: "da_mua_tq,hoan_tat", type: "order_ho" });
  assert.equal(matchesOrderFilters(row(), ff, NOW), true);
  assert.equal(matchesOrderFilters(row({ status: "hoan_tat" }), ff, NOW), true);
  assert.equal(matchesOrderFilters(row({ status: "khach_chot" }), ff, NOW), false);
  assert.equal(matchesOrderFilters(row({ orderType: "ban_tu_kho" }), ff, NOW), false);
});

test("match: còn nợ bỏ qua đơn huỷ và đơn nhập kho (giống chip Chưa thu đủ)", () => {
  const owing = { ...EMPTY_FILTERS, due: "owing" as const };
  const paid = { ...EMPTY_FILTERS, due: "paid" as const };
  assert.equal(matchesOrderFilters(row(), owing, NOW), true);
  assert.equal(matchesOrderFilters(row({ status: "huy" }), owing, NOW), false);
  assert.equal(matchesOrderFilters(row({ orderType: "nhap_kho" }), owing, NOW), false);
  assert.equal(matchesOrderFilters(row({ amountDue: 0 }), paid, NOW), true);
  assert.equal(matchesOrderFilters(row(), paid, NOW), false);
});

test("đếm nhóm đang lọc và xoá một nhóm", () => {
  const f = parseOrderFilters({ d: "month", st: "hoan_tat", due: "paid" });
  assert.equal(activeGroupCount(f), 3);
  assert.equal(activeGroupCount(clearGroup(f, "status")), 2);
  assert.equal(activeGroupCount(EMPTY_FILTERS), 0);
});
```

- [ ] **Step 6: Chạy, xác nhận đỏ**

Run: `node --test tests/order-filters.test.ts`
Expected: FAIL (không có module).

- [ ] **Step 7: Viết module**

```ts
// src/lib/order-filters.ts
/**
 * Bộ lọc danh sách đơn kiểu Excel (v9-C). Module thuần — chạy cả server
 * (lọc thật) lẫn client (dựng URL), và test bằng node:test.
 *
 * Trạng thái lọc nằm trên URL: ?d=7d | ?d=2026-09-01_2026-09-15,
 * ?st=da_mua_tq,hoan_tat, ?type=ban_tu_kho, ?due=owing|paid. Giá trị lạ bị
 * bỏ qua chứ không ném lỗi — link cũ hay gõ tay sai vẫn mở được trang.
 *
 * Ngày cắt theo giờ VN (vn-time.ts). Cắt theo UTC thì đơn tạo 6h sáng giờ
 * VN rơi sang hôm trước — cùng loại lỗi đã khoá ở chip năm của v8-A.
 */
import {
  BRANCH_STATUSES,
  MAIN_CHAIN,
  ORDER_TYPES,
  type OrderStatus,
  type OrderType,
} from "./order-status.ts";
import { vnMidnightMs, vnYmd } from "./vn-time.ts";

/** Trạng thái đang dùng — KHÔNG gồm mã về hưu (không đơn mới nào mang chúng). */
export const FILTER_STATUSES: readonly OrderStatus[] = [
  ...MAIN_CHAIN,
  "ve_kho_vn",
  ...BRANCH_STATUSES,
];

export const DATE_PRESETS = ["today", "7d", "month", "prev_month"] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];
export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  today: "Hôm nay",
  "7d": "7 ngày",
  month: "Tháng này",
  prev_month: "Tháng trước",
};

export type DateFilter = { preset: DatePreset } | { from: string; to: string };
export type DueFilter = "paid" | "owing";
export const DUE_LABELS: Record<DueFilter, string> = {
  paid: "Đã thu đủ",
  owing: "Còn nợ",
};

export type OrderFilters = {
  date: DateFilter | null;
  statuses: OrderStatus[];
  types: OrderType[];
  due: DueFilter | null;
};
export type FilterGroup = "date" | "status" | "type" | "due";

export const EMPTY_FILTERS: OrderFilters = {
  date: null,
  statuses: [],
  types: [],
  due: null,
};

export const FILTER_PARAM_KEYS = ["d", "st", "type", "due"] as const;

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function pickList<T extends string>(raw: string | undefined, allowed: readonly T[]): T[] {
  const ok = new Set<string>(allowed);
  return [...new Set((raw ?? "").split(","))].filter((v): v is T => ok.has(v));
}

export function parseOrderFilters(sp: {
  d?: string;
  st?: string;
  type?: string;
  due?: string;
}): OrderFilters {
  let date: DateFilter | null = null;
  if (sp.d) {
    if ((DATE_PRESETS as readonly string[]).includes(sp.d)) {
      date = { preset: sp.d as DatePreset };
    } else {
      const [a, b] = sp.d.split("_");
      if (a && b && YMD.test(a) && YMD.test(b))
        date = a <= b ? { from: a, to: b } : { from: b, to: a };
    }
  }
  return {
    date,
    statuses: pickList(sp.st, FILTER_STATUSES),
    types: pickList(sp.type, ORDER_TYPES),
    due: sp.due === "paid" || sp.due === "owing" ? sp.due : null,
  };
}

/** Ghi bộ lọc vào một bản sao của `base`; tham số khác (q, f, sort…) giữ nguyên. */
export function filtersToParams(f: OrderFilters, base: URLSearchParams): URLSearchParams {
  const p = new URLSearchParams(base);
  for (const k of FILTER_PARAM_KEYS) p.delete(k);
  if (f.date) p.set("d", "preset" in f.date ? f.date.preset : `${f.date.from}_${f.date.to}`);
  if (f.statuses.length > 0) p.set("st", f.statuses.join(","));
  if (f.types.length > 0) p.set("type", f.types.join(","));
  if (f.due) p.set("due", f.due);
  return p;
}

function ymdMs(s: string): number {
  const [y, m, d] = s.split("-").map(Number);
  return vnMidnightMs(y, m, d);
}

export function dateBounds(df: DateFilter, now: Date): { fromMs: number; toMs: number } {
  if (!("preset" in df)) return { fromMs: ymdMs(df.from), toMs: ymdMs(df.to) + DAY_MS };
  const { y, m, d } = vnYmd(now);
  const todayStart = vnMidnightMs(y, m, d);
  switch (df.preset) {
    case "today":
      return { fromMs: todayStart, toMs: todayStart + DAY_MS };
    case "7d":
      return { fromMs: todayStart - 6 * DAY_MS, toMs: todayStart + DAY_MS };
    case "month":
      return { fromMs: vnMidnightMs(y, m, 1), toMs: vnMidnightMs(y, m + 1, 1) };
    case "prev_month":
      return { fromMs: vnMidnightMs(y, m - 1, 1), toMs: vnMidnightMs(y, m, 1) };
  }
}

export function matchesOrderFilters(
  row: { createdAt: Date; status: OrderStatus; orderType: OrderType; amountDue: number },
  f: OrderFilters,
  now: Date,
): boolean {
  if (f.date) {
    const { fromMs, toMs } = dateBounds(f.date, now);
    const t = row.createdAt.getTime();
    if (t < fromMs || t >= toMs) return false;
  }
  if (f.statuses.length > 0 && !f.statuses.includes(row.status)) return false;
  if (f.types.length > 0 && !f.types.includes(row.orderType)) return false;
  if (f.due === "owing") {
    // Cùng nghĩa với chip "Chưa thu đủ": đơn huỷ và đơn nhập kho (không có
    // khách) thì amountDue không phải nợ của ai.
    if (!(row.amountDue > 0 && row.status !== "huy" && row.orderType !== "nhap_kho"))
      return false;
  }
  if (f.due === "paid" && row.amountDue > 0) return false;
  return true;
}

export function isGroupActive(f: OrderFilters, g: FilterGroup): boolean {
  switch (g) {
    case "date":
      return f.date !== null;
    case "status":
      return f.statuses.length > 0;
    case "type":
      return f.types.length > 0;
    case "due":
      return f.due !== null;
  }
}

export function activeGroupCount(f: OrderFilters): number {
  return (["date", "status", "type", "due"] as const).filter((g) => isGroupActive(f, g)).length;
}

export function clearGroup(f: OrderFilters, g: FilterGroup): OrderFilters {
  switch (g) {
    case "date":
      return { ...f, date: null };
    case "status":
      return { ...f, statuses: [] };
    case "type":
      return { ...f, types: [] };
    case "due":
      return { ...f, due: null };
  }
}
```

- [ ] **Step 8: Chạy, xác nhận xanh**

Run: `node --test tests/order-filters.test.ts tests/vn-time.test.ts && npx tsc --noEmit`
Expected: PASS, không lỗi kiểu.

- [ ] **Step 9: Commit**

```bash
git add src/lib/vn-time.ts src/lib/order-filters.ts tests/vn-time.test.ts tests/order-filters.test.ts
git commit -m "lọc đơn: hàm thuần cho bộ lọc kiểu Excel, cắt ngày theo giờ VN

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Danh sách đơn — cột Ngày tạo, nút Lọc, ▾ đầu cột

**Files:**
- Modify: `src/app/_components/data-table.tsx`
- Create: `src/app/(app)/orders/filter-fields.tsx`
- Create: `src/app/(app)/orders/order-filter-sheet.tsx`
- Create: `src/app/(app)/orders/column-filter.tsx`
- Modify: `src/app/(app)/orders/orders-list.tsx`
- Modify: `src/app/(app)/orders/page.tsx`
- Modify: `src/styles/screens.css`, `src/styles/components.css`

**Interfaces:**
- Consumes: mọi export của `order-filters.ts`, `shortDateVn` (Task 3).
- Produces:
  - `Column<T>.headerExtra?: ReactNode`
  - `FilterFields({ group, value, onChange }: { group: FilterGroup; value: OrderFilters; onChange: (f: OrderFilters) => void })`
  - `OrderFilterButton({ filters, baseQuery }: { filters: OrderFilters; baseQuery: string })`
  - `ColumnFilter({ group, filters, baseQuery }: { group: FilterGroup; filters: OrderFilters; baseQuery: string })`
  - `OrderRowItem` thêm `createdAtMs: number; createdText: string`
  - `OrdersList` thêm prop `filters: OrderFilters; baseQuery: string`

`baseQuery` = chuỗi query hiện tại **không gồm** 4 khoá lọc (có q/gap/f/sort/dir). Client dựng URL bằng `"/orders?" + filtersToParams(draft, new URLSearchParams(baseQuery))`. Truyền chuỗi, không truyền hàm (gotcha v8-A).

- [ ] **Step 1: `DataTable` nhận `headerExtra`**

Trong `Column<T>` thêm:

```ts
  /**
   * v9-C: phần tử cạnh tiêu đề cột (nút ▾ lọc). ReactNode chứ không phải
   * hàm, nên bảng vẫn không cần "use client".
   */
  headerExtra?: ReactNode;
```

Trong phần render `.dt-head`, thay `<span key={c.key} className={cellClass(c)}>{label}</span>` bằng:

```tsx
            <span key={c.key} className={cellClass(c)}>
              {label}
              {c.headerExtra}
            </span>
```

- [ ] **Step 2: `FilterFields` — một nhóm lọc**

```tsx
// src/app/(app)/orders/filter-fields.tsx
"use client";

import { ORDER_TYPES, ORDER_TYPE_LABELS, STATUS_LABELS } from "@/lib/order-status";
import {
  DATE_PRESETS,
  DATE_PRESET_LABELS,
  DUE_LABELS,
  FILTER_STATUSES,
  type FilterGroup,
  type OrderFilters,
} from "@/lib/order-filters";

/** Một nhóm lọc. Dùng chung cho Sheet (điện thoại) và bảng nổi ▾ (desktop). */
export function FilterFields({
  group,
  value,
  onChange,
}: {
  group: FilterGroup;
  value: OrderFilters;
  onChange: (f: OrderFilters) => void;
}) {
  if (group === "date") {
    const range = value.date && !("preset" in value.date) ? value.date : null;
    return (
      <div className="flt-group">
        <div className="chip-row">
          {DATE_PRESETS.map((p) => {
            const on = value.date !== null && "preset" in value.date && value.date.preset === p;
            return (
              <button
                key={p}
                type="button"
                className={`chip${on ? " chip-on" : ""}`}
                onClick={() => onChange({ ...value, date: on ? null : { preset: p } })}
              >
                {DATE_PRESET_LABELS[p]}
              </button>
            );
          })}
        </div>
        <div className="flt-range">
          <label className="field">
            <span>Từ ngày</span>
            <input
              type="date"
              value={range?.from ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  date: e.target.value
                    ? { from: e.target.value, to: range?.to ?? e.target.value }
                    : null,
                })
              }
            />
          </label>
          <label className="field">
            <span>Đến ngày</span>
            <input
              type="date"
              value={range?.to ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  date: e.target.value
                    ? { from: range?.from ?? e.target.value, to: e.target.value }
                    : null,
                })
              }
            />
          </label>
        </div>
      </div>
    );
  }

  if (group === "status" || group === "type") {
    const options = group === "status" ? FILTER_STATUSES : ORDER_TYPES;
    const picked: readonly string[] = group === "status" ? value.statuses : value.types;
    const label = (k: string) =>
      group === "status"
        ? STATUS_LABELS[k as keyof typeof STATUS_LABELS]
        : ORDER_TYPE_LABELS[k as keyof typeof ORDER_TYPE_LABELS];
    function toggle(k: string) {
      const next = picked.includes(k) ? picked.filter((v) => v !== k) : [...picked, k];
      onChange(
        group === "status"
          ? { ...value, statuses: next as OrderFilters["statuses"] }
          : { ...value, types: next as OrderFilters["types"] },
      );
    }
    return (
      <div className="flt-group">
        {options.map((k) => (
          <label key={k} className="flt-check">
            <input type="checkbox" checked={picked.includes(k)} onChange={() => toggle(k)} />
            {label(k)}
          </label>
        ))}
      </div>
    );
  }

  return (
    <div className="flt-group">
      {(["paid", "owing"] as const).map((k) => (
        <label key={k} className="flt-check">
          <input
            type="radio"
            name="flt-due"
            checked={value.due === k}
            onChange={() => onChange({ ...value, due: k })}
          />
          {DUE_LABELS[k]}
        </label>
      ))}
    </div>
  );
}

export const GROUP_TITLES: Record<FilterGroup, string> = {
  date: "Ngày tạo",
  status: "Trạng thái",
  type: "Loại đơn",
  due: "Còn thu",
};
```

- [ ] **Step 3: `OrderFilterButton` — nút "Lọc (n)" + Sheet**

```tsx
// src/app/(app)/orders/order-filter-sheet.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/app/_components/sheet";
import {
  EMPTY_FILTERS,
  activeGroupCount,
  filtersToParams,
  type OrderFilters,
} from "@/lib/order-filters";
import { FilterFields, GROUP_TITLES } from "./filter-fields";

export function OrderFilterButton({
  filters,
  baseQuery,
}: {
  filters: OrderFilters;
  baseQuery: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Bản nháp: chỉnh thoải mái trong Sheet, bấm Áp dụng mới đổi URL.
  const [draft, setDraft] = useState(filters);
  const n = activeGroupCount(filters);

  function go(f: OrderFilters) {
    setOpen(false);
    router.push(`/orders?${filtersToParams(f, new URLSearchParams(baseQuery))}`);
  }

  return (
    <>
      <button
        type="button"
        className={`btn btn-outline flt-btn${n > 0 ? " flt-on" : ""}`}
        onClick={() => {
          setDraft(filters);
          setOpen(true);
        }}
      >
        Lọc{n > 0 ? ` (${n})` : ""}
      </button>
      <Sheet
        open={open}
        title="Lọc đơn"
        onClose={() => setOpen(false)}
        footer={
          <div className="sheet-actions">
            <button type="button" className="btn btn-ghost" onClick={() => go(EMPTY_FILTERS)}>
              Xoá lọc
            </button>
            <button type="button" className="btn" onClick={() => go(draft)}>
              Áp dụng
            </button>
          </div>
        }
      >
        {(["date", "status", "type", "due"] as const).map((g) => (
          <section key={g}>
            <h2 className="sec-label">{GROUP_TITLES[g]}</h2>
            <FilterFields group={g} value={draft} onChange={setDraft} />
          </section>
        ))}
      </Sheet>
    </>
  );
}
```

- [ ] **Step 4: `ColumnFilter` — ▾ đầu cột (desktop)**

```tsx
// src/app/(app)/orders/column-filter.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  clearGroup,
  filtersToParams,
  isGroupActive,
  type FilterGroup,
  type OrderFilters,
} from "@/lib/order-filters";
import { FilterFields, GROUP_TITLES } from "./filter-fields";

/**
 * Nút ▾ đầu cột kiểu Excel. Bảng nổi dùng position: fixed vì ô tiêu đề
 * (.dt-c) có overflow: hidden — absolute sẽ bị cắt mất.
 */
export function ColumnFilter({
  group,
  filters,
  baseQuery,
}: {
  group: FilterGroup;
  filters: OrderFilters;
  baseQuery: string;
}) {
  const router = useRouter();
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [draft, setDraft] = useState(filters);
  const active = isGroupActive(filters, group);

  useEffect(() => {
    if (!pos) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !btn.current?.contains(t)) setPos(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPos(null);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pos]);

  function toggle() {
    if (pos) return setPos(null);
    const r = btn.current!.getBoundingClientRect();
    // Không để bảng nổi (rộng 280px) tràn mép phải cửa sổ.
    setPos({ top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - 296) });
    setDraft(filters);
  }

  function go(f: OrderFilters) {
    setPos(null);
    router.push(`/orders?${filtersToParams(f, new URLSearchParams(baseQuery))}`);
  }

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`col-flt${active ? " col-flt-on" : ""}`}
        aria-label={`Lọc theo ${GROUP_TITLES[group]}`}
        onClick={toggle}
      >
        ▾
      </button>
      {pos && (
        <div ref={panel} className="col-flt-panel" style={{ top: pos.top, left: pos.left }}>
          <FilterFields group={group} value={draft} onChange={setDraft} />
          <div className="sheet-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => go(clearGroup(filters, group))}>
              Xoá lọc
            </button>
            <button type="button" className="btn btn-sm" onClick={() => go(draft)}>
              Áp dụng
            </button>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 5: `OrdersList` — cột Ngày tạo và ▾**

Trong `orders-list.tsx`:
1. Import `ColumnFilter` và `type OrderFilters`.
2. `OrderRowItem` thêm `createdAtMs: number; createdText: string;`.
3. Props thêm `filters: OrderFilters; baseQuery: string;`.
4. Dòng phụ `.dt-sub` thêm ngày: `#{r.id} · {r.statusText}{…} · {r.itemCount} món · {r.createdText}`.
5. Chèn cột sau cột `id`, và gắn ▾ vào cột Trạng thái và Còn thu:

```tsx
    {
      key: "ngay",
      header: "Ngày tạo",
      width: "96px",
      sortBy: (r) => r.createdAtMs,
      headerExtra: <ColumnFilter group="date" filters={filters} baseQuery={baseQuery} />,
      cell: (r) => r.createdText,
    },
```

Ở cột `trang_thai` thêm `headerExtra: <ColumnFilter group="status" filters={filters} baseQuery={baseQuery} />,`; cột `con_thu` thêm `headerExtra: <ColumnFilter group="due" filters={filters} baseQuery={baseQuery} />,`.

- [ ] **Step 6: `page.tsx` — đọc bộ lọc, lọc, giữ bộ lọc trong mọi link**

1. `searchParams` thêm `d?: string; st?: string; type?: string; due?: string;`.
2. `Promise.all` hiện destructure thẳng `{ q, gap, f: rawF, sort, dir: rawDir }`. Đổi thành nhận nguyên object rồi tách ra:

```ts
  const [session, sp, all] = await Promise.all([
    requireAuth(),
    searchParams,
    listOrdersWithGaps(),
  ]);
  const { q, gap, f: rawF, sort, dir: rawDir } = sp;
  const filters = parseOrderFilters(sp);
  const now = new Date();
```

3. Lọc: đổi `gapFiltered.filter((r) => matchesFilter(r, f))` thành `gapFiltered.filter((r) => matchesFilter(r, f) && matchesOrderFilters(r, filters, now))`.

4. `attentionCount` giữ tính trên `gapFiltered` (chip đếm không theo bộ lọc mới — đổi hành vi đó không nằm trong spec).

5. `qs(code)` và `sortBase` phải giữ bộ lọc: cuối mỗi hàm, trả về chuỗi đã qua `filtersToParams(filters, p)`:

```ts
    return `/orders?${filtersToParams(filters, p).toString()}`;
```

```ts
    return filtersToParams(filters, p).toString();
```

6. `baseQuery` (không gồm khoá lọc):

```ts
  const baseQuery = (() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (activeGap) p.set("gap", activeGap);
    p.set("f", f);
    if (sort) p.set("sort", sort);
    if (rawDir) p.set("dir", rawDir);
    return p.toString();
  })();
```

7. Thanh công cụ: thêm nút lọc cạnh ô tìm (luôn hiện, kể cả khi 0 kết quả — nếu không thì lọc ra rỗng là không còn đường gỡ):

```tsx
      <div className="list-toolbar list-toolbar-filter">
        <form className="search" action="/orders" method="get">…giữ nguyên…</form>
        <OrderFilterButton filters={filters} baseQuery={baseQuery} />
      </div>
```

Ô tìm là form GET chỉ gửi `q` — lọc bị mất khi tìm. Thêm input ẩn cho từng khoá đang có:

```tsx
          {[...filtersToParams(filters, new URLSearchParams())].map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
```

8. Trạng thái rỗng: khi `activeGroupCount(filters) > 0` thì hiện thêm link gỡ lọc:

```tsx
          {activeGroupCount(filters) > 0 && (
            <Link href={`/orders?${baseQuery}`} className="btn btn-sm btn-outline">
              Xoá lọc
            </Link>
          )}
```

9. Map dòng: thêm

```ts
            createdAtMs: o.createdAt.getTime(),
            createdText: shortDateVn(o.createdAt, now),
```

và truyền `filters={filters} baseQuery={baseQuery}` vào `<OrdersList>`.

Import: `parseOrderFilters, matchesOrderFilters, filtersToParams, activeGroupCount` từ `@/lib/order-filters`, `shortDateVn` từ `@/lib/vn-time`, `OrderFilterButton` từ `./order-filter-sheet`.

- [ ] **Step 7: CSS**

`src/styles/screens.css`, thêm TRƯỚC khối `@media (min-width: 900px)` của màn danh sách:

```css
/* ---------- Lọc đơn kiểu Excel (v9-C) ---------- */
.list-toolbar-filter {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}
.list-toolbar-filter .search {
  flex: 1;
}
.flt-btn {
  flex: none;
}
.flt-on {
  border-color: var(--brand);
  color: var(--brand);
}
.flt-group {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  margin-bottom: var(--sp-3);
}
.flt-range {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-2);
}
.flt-range input {
  font-size: var(--fs-3);
}
.flt-check {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-height: var(--tap);
  font-size: var(--fs-3);
}
.col-flt {
  margin-left: var(--sp-1);
  padding: 0 var(--sp-1);
  border: none;
  background: none;
  color: var(--muted);
  cursor: pointer;
}
.col-flt-on {
  color: var(--brand);
  font-weight: 700;
}
.col-flt-panel {
  position: fixed;
  z-index: 50;
  width: 280px;
  padding: var(--sp-3);
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.12);
  text-transform: none;
  letter-spacing: normal;
  font-weight: 400;
  color: var(--text);
}
```

Kiểm `src/styles/components.css`: luật `.dt-head` trên desktop có `text-transform`/`font-size` riêng — bảng nổi đã tự đặt lại `text-transform`, `letter-spacing`, `font-weight`; nếu `.dt-head` còn đặt `font-size` nhỏ thì thêm `font-size: var(--fs-3);` vào `.col-flt-panel`. Nếu `.dt-head a` hoặc `.dt-head` có `white-space: nowrap` gây tràn thì không sao, bảng nổi là fixed.

- [ ] **Step 8: Typecheck + test**

Run: `npx tsc --noEmit && npm test`
Expected: xanh (gồm `spacing-grid`).

- [ ] **Step 9: Kiểm trên trình duyệt**

Desktop (thu `resize_window` preset `desktop`, cửa sổ ≥900px), `/orders?f=`:
- Có cột "Ngày tạo", bấm tiêu đề thì sắp xếp.
- Bấm ▾ ở "Trạng thái" → bảng nổi hiện ĐỦ (không bị cắt), tích "Hoàn tất" → Áp dụng → URL có `st=hoan_tat`, bảng chỉ còn đơn hoàn tất, ▾ tô màu.
- Tải lại trang → vẫn lọc. Bấm tiêu đề cột để sắp xếp → vẫn lọc. Gõ ô tìm + Enter → vẫn lọc.
- Bấm chip "Tất cả" → vẫn lọc.
Điện thoại (preset `mobile`):
- Nút "Lọc" cạnh ô tìm; bấm → Sheet 4 nhóm; chọn "Hôm nay" → Áp dụng → "Lọc (1)".
- Dòng phụ có ngày tạo.
- Lọc ra 0 đơn → có nút "Xoá lọc".
- Console: font-size mọi ô nhập = `16px` (gồm `input[type=date]`).
Chụp màn hình hai cỡ.

- [ ] **Step 10: Commit**

```bash
git add src/app/_components/data-table.tsx src/app/\(app\)/orders src/styles
git commit -m "danh sách đơn: cột Ngày tạo và bộ lọc kiểu Excel (▾ đầu cột, Sheet trên điện thoại)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Luật bán nhiều món từ kho (hàm thuần)

**Files:**
- Modify: `src/lib/inventory.ts`
- Test: `tests/inventory.test.ts` (thêm)

**Interfaces:**
- Produces:

```ts
export type StockSaleLine = { inventoryId: number; quantity: number; sellPriceVnd: number };
export type StockSaleStock = { id: number; name: string; quantity: number; avgCost: number };
export type StockSalePlan =
  | {
      ok: true;
      /** Cùng thứ tự với đầu vào. lineCost = quantity × avgCost. */
      lines: (StockSaleLine & { lineCost: number })[];
      /** Mỗi dòng tồn MỘT lần, số lượng sau khi trừ gộp. */
      deductions: { inventoryId: number; after: number }[];
      saleCost: number;
      totalVnd: number;
    }
  | { ok: false; reason: string };
export function planStockSale(lines: StockSaleLine[], stock: StockSaleStock[]): StockSalePlan;
```

- [ ] **Step 1: Test (đỏ)**

Thêm vào `tests/inventory.test.ts` (thêm `planStockSale` vào dòng import từ `../src/lib/inventory.ts`):

```ts
const STOCK = [
  { id: 1, name: "Dép A 38", quantity: 3, avgCost: 150_000 },
  { id: 2, name: "Giày B 42", quantity: 1, avgCost: 400_000 },
];

test("planStockSale: đủ hàng — tổng tiền, giá vốn, số tồn sau", () => {
  const p = planStockSale(
    [
      { inventoryId: 1, quantity: 2, sellPriceVnd: 250_000 },
      { inventoryId: 2, quantity: 1, sellPriceVnd: 650_000 },
    ],
    STOCK,
  );
  assert.equal(p.ok, true);
  if (!p.ok) return;
  assert.equal(p.totalVnd, 1_150_000);
  assert.equal(p.saleCost, 700_000);
  assert.deepEqual(p.lines.map((l) => l.lineCost), [300_000, 400_000]);
  assert.deepEqual(p.deductions, [
    { inventoryId: 1, after: 1 },
    { inventoryId: 2, after: 0 },
  ]);
});

test("planStockSale: thiếu một dòng thì từ chối CẢ đơn và nói rõ", () => {
  const p = planStockSale(
    [
      { inventoryId: 1, quantity: 1, sellPriceVnd: 250_000 },
      { inventoryId: 2, quantity: 2, sellPriceVnd: 650_000 },
    ],
    STOCK,
  );
  assert.deepEqual(p, { ok: false, reason: "Giày B 42: còn 1, muốn bán 2" });
});

test("planStockSale: cùng một dòng tồn chọn hai lần thì CỘNG số lượng trước khi kiểm", () => {
  const p = planStockSale(
    [
      { inventoryId: 1, quantity: 2, sellPriceVnd: 250_000 },
      { inventoryId: 1, quantity: 2, sellPriceVnd: 240_000 },
    ],
    STOCK,
  );
  assert.deepEqual(p, { ok: false, reason: "Dép A 38: còn 3, muốn bán 4" });
});

test("planStockSale: dòng tồn không tồn tại, số lượng hoặc giá không hợp lệ", () => {
  assert.equal(planStockSale([{ inventoryId: 9, quantity: 1, sellPriceVnd: 1 }], STOCK).ok, false);
  assert.equal(planStockSale([{ inventoryId: 1, quantity: 0, sellPriceVnd: 1 }], STOCK).ok, false);
  assert.equal(planStockSale([{ inventoryId: 1, quantity: 1.5, sellPriceVnd: 1 }], STOCK).ok, false);
  assert.equal(planStockSale([{ inventoryId: 1, quantity: 1, sellPriceVnd: 0 }], STOCK).ok, false);
  assert.equal(planStockSale([], STOCK).ok, false);
});
```

- [ ] **Step 2: Chạy, xác nhận đỏ**

Run: `node --test tests/inventory.test.ts`
Expected: FAIL (`planStockSale` không tồn tại).

- [ ] **Step 3: Viết hàm**

Thêm vào cuối `src/lib/inventory.ts`:

```ts
export type StockSaleLine = { inventoryId: number; quantity: number; sellPriceVnd: number };
export type StockSaleStock = { id: number; name: string; quantity: number; avgCost: number };
export type StockSalePlan =
  | {
      ok: true;
      lines: (StockSaleLine & { lineCost: number })[];
      deductions: { inventoryId: number; after: number }[];
      saleCost: number;
      totalVnd: number;
    }
  | { ok: false; reason: string };

/**
 * Kế hoạch bán nhiều món từ kho (v9-C). Thuần — DB gọi hàm này SAU khi đã
 * `SELECT … FOR UPDATE` các dòng tồn, nên số tồn truyền vào là số đã khoá.
 *
 * Cùng một dòng tồn có thể nằm ở hai dòng bán (giá khác nhau): số lượng
 * được CỘNG theo dòng tồn trước khi so với tồn, nếu không mỗi dòng tự thấy
 * "đủ" và tồn bị âm.
 */
export function planStockSale(
  lines: StockSaleLine[],
  stock: StockSaleStock[],
): StockSalePlan {
  if (lines.length === 0) return { ok: false, reason: "Chưa có món nào" };
  const byId = new Map(stock.map((s) => [s.id, s]));
  const wanted = new Map<number, number>();

  for (const l of lines) {
    const s = byId.get(l.inventoryId);
    if (!s) return { ok: false, reason: "Không tìm thấy hàng trong kho" };
    if (!Number.isInteger(l.quantity) || l.quantity <= 0)
      return { ok: false, reason: `${s.name}: số lượng phải là số nguyên > 0` };
    if (!(l.sellPriceVnd > 0))
      return { ok: false, reason: `${s.name}: giá bán phải > 0` };
    wanted.set(l.inventoryId, (wanted.get(l.inventoryId) ?? 0) + l.quantity);
  }

  const deductions: { inventoryId: number; after: number }[] = [];
  for (const [id, qty] of wanted) {
    const s = byId.get(id)!;
    if (qty > s.quantity)
      return { ok: false, reason: `${s.name}: còn ${s.quantity}, muốn bán ${qty}` };
    deductions.push({ inventoryId: id, after: applyStockOut({ quantity: s.quantity, avgCost: s.avgCost }, qty).quantity });
  }

  const out = lines.map((l) => ({
    ...l,
    sellPriceVnd: Math.round(l.sellPriceVnd),
    lineCost: l.quantity * byId.get(l.inventoryId)!.avgCost,
  }));
  return {
    ok: true,
    lines: out,
    deductions,
    saleCost: out.reduce((s, l) => s + l.lineCost, 0),
    totalVnd: out.reduce((s, l) => s + l.quantity * l.sellPriceVnd, 0),
  };
}
```

- [ ] **Step 4: Chạy, xác nhận xanh**

Run: `node --test tests/inventory.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/inventory.ts tests/inventory.test.ts
git commit -m "kho: luật bán nhiều món một lần (planStockSale), gộp dòng tồn trùng trước khi kiểm

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: `sellFromStock` nhiều dòng, khoá trong transaction; vá doanh thu đơn bán kho cũ

**Files:**
- Modify: `src/db/queries.ts` (`SellFromStockInput`, `sellFromStock`, thêm `listSellableStock`)
- Modify: `src/app/(app)/inventory/actions.ts`, `src/app/(app)/inventory/sell-form.tsx`
- Modify: `src/lib/deletion.ts`, `src/db/deletion.ts`, `tests/deletion.test.ts` (chặn xoá đơn bán kho)
- Create: `drizzle/0010_ban_tu_kho_backfill.sql`
- Modify: `drizzle/meta/_journal.json`

**Bug đang có (tìm thấy lúc lập kế hoạch):** `sellFromStock` hiện KHÔNG ghi `quoted_total_vnd` (mặc định 0) và `order_items.cost_confirmed` (mặc định false). Báo cáo lãi (`src/lib/pnl.ts`, `buildBlock`) lấy doanh thu từ `quotedTotalVnd` → đơn bán kho có **doanh thu 0, lãi gộp âm bằng giá vốn**, và rơi vào khối "ước tính" thay vì "đã xác nhận". Ngoài ra số tồn được kiểm ngoài transaction.

**Interfaces:**
- Consumes: `planStockSale`, `StockSaleLine` (Task 5); `computeOrderMoney` (`@/lib/money`).
- Produces:

```ts
export type SellFromStockInput = {
  lines: StockSaleLine[];
  deposit: number;
  customerId?: number | null;
  newCustomer?: { name: string; phone?: string; address?: string } | null;
  note?: string | null;
  orderPhotoIds?: number[];
  changedBy?: string | null;
};
export type SellResult = { ok: true; orderId: number } | { ok: false; reason: string }; // giữ nguyên
export async function sellFromStock(input: SellFromStockInput): Promise<SellResult>;

export type SellableStockRow = {
  id: number; name: string; size: string; color: string; quantity: number;
  avgCost: number; source: string; productId: number | null;
  defaultSellVnd: number | null; photoId: number | null;
};
export async function listSellableStock(): Promise<SellableStockRow[]>;
```

- [ ] **Step 1: Viết lại `sellFromStock`**

Thay nguyên phần `SellFromStockInput` + `sellFromStock` (từ `export type SellFromStockInput` tới hết hàm) bằng:

```ts
export type SellFromStockInput = {
  lines: StockSaleLine[];
  deposit: number;
  customerId?: number | null;
  newCustomer?: { name: string; phone?: string; address?: string } | null;
  note?: string | null;
  orderPhotoIds?: number[];
  changedBy?: string | null;
};

export type SellResult =
  | { ok: true; orderId: number }
  | { ok: false; reason: string };

/** Lỗi nghiệp vụ ném ra để rollback, bắt lại ngoài withTx thành SellResult. */
class StockSaleError extends Error {}

/**
 * Bán từ kho, NHIỀU món một đơn (v9-C): trừ tồn, tạo đơn ban_tu_kho ở
 * "Đã giao khách", chốt giá vốn bình quân vào sale_cost.
 *
 * Kiểm tồn nằm TRONG transaction, sau SELECT … FOR UPDATE — trước v9-C nó
 * nằm ngoài, hai người bán cùng dòng tồn cùng lúc đều qua được bước kiểm và
 * tồn bị âm. Cùng luật với xoá đơn (src/db/deletion.ts).
 *
 * quoted_total_vnd = Σ giá bán và cost_confirmed = true là BẮT BUỘC: báo cáo
 * lãi đọc doanh thu từ quoted_total_vnd; trước v9-C cột này bằng 0 nên đơn
 * bán kho ra doanh thu 0 (drizzle/0010 vá dữ liệu cũ).
 *
 * KHÔNG tự hoàn tất ở đây: autoCompleteIfPaid mở transaction riêng qua
 * changeOrderStatus, phải gọi NGOÀI withTx — nơi gọi hàm này lo việc đó.
 */
export async function sellFromStock(
  input: SellFromStockInput,
): Promise<SellResult> {
  const ids = [...new Set(input.lines.map((l) => l.inventoryId))];
  if (ids.length === 0) return { ok: false, reason: "Chưa có món nào" };
  if (input.deposit < 0) return { ok: false, reason: "Cọc không được âm" };

  try {
    return await withTx(async (x) => {
      const holes = ids.map(() => "?").join(", ");
      // ORDER BY id: hai giao dịch khoá cùng tập dòng theo cùng thứ tự thì
      // không thể khoá chéo nhau (deadlock).
      const stock = await x.all<{
        id: number;
        name: string;
        quantity: number;
        avgCost: number;
        productId: number | null;
        size: string;
        color: string;
      }>(
        `SELECT id, product_name AS name, quantity, avg_cost AS "avgCost",
                product_id AS "productId", size, color
           FROM inventory WHERE id IN (${holes})
          ORDER BY id FOR UPDATE`,
        ids,
      );

      const plan = planStockSale(input.lines, stock);
      if (!plan.ok) throw new StockSaleError(plan.reason);
      if (input.deposit > plan.totalVnd)
        throw new StockSaleError("Cọc lớn hơn tổng tiền đơn");

      // Khách: có sẵn / mới / khách lẻ.
      let customerId = input.customerId ?? null;
      if (!customerId && input.newCustomer?.name) {
        const c = await x.get<{ id: number }>(
          "INSERT INTO customers(name, phone, address) VALUES(?, ?, ?) RETURNING id",
          [
            input.newCustomer.name,
            input.newCustomer.phone ?? null,
            input.newCustomer.address ?? null,
          ],
        );
        customerId = c!.id;
      }
      if (!customerId) {
        const walkin = await x.get<{ id: number }>(
          "SELECT id FROM customers WHERE name = 'Khách lẻ'",
        );
        customerId =
          walkin?.id ??
          (await x.get<{ id: number }>(
            "INSERT INTO customers(name) VALUES('Khách lẻ') RETURNING id",
          ))!.id;
      }

      for (const d of plan.deductions) {
        await x.run("UPDATE inventory SET quantity = ? WHERE id = ?", [
          d.after,
          d.inventoryId,
        ]);
      }

      const deposit = Math.round(input.deposit);
      const money = computeOrderMoney({
        goodsTotalCny: plan.totalVnd,
        exchangeRate: 1,
        serviceFee: 0,
        shippingFee: 0,
        deposit,
      });

      const o = await x.get<{ id: number }>(
        `INSERT INTO orders
           (customer_id, order_type, status, exchange_rate, goods_total_cny,
            margin_vnd, shipping_fee, deposit, amount_due, sale_cost, note,
            quoted_total_vnd, status_changed_at)
         VALUES (?, 'ban_tu_kho', 'da_giao_khach', 1, ?, 0, 0, ?, ?, ?, ?, ?, ${NOW_EPOCH_SQL})
         RETURNING id`,
        [
          customerId,
          plan.totalVnd,
          deposit,
          money.amountDue,
          plan.saleCost,
          input.note ?? null,
          plan.totalVnd,
        ],
      );
      const orderId = o!.id;

      const byId = new Map(stock.map((s) => [s.id, s]));
      for (const l of plan.lines) {
        const s = byId.get(l.inventoryId)!;
        await x.run(
          `INSERT INTO order_items
             (order_id, name, quantity, unit_price_cny, margin_vnd,
              cost_confirmed, product_id, size, color)
           VALUES (?, ?, ?, ?, 0, true, ?, ?, ?)`,
          [orderId, s.name, l.quantity, l.sellPriceVnd, s.productId, s.size, s.color],
        );
      }

      for (const photoId of input.orderPhotoIds ?? []) {
        await x.run(
          "UPDATE photos SET order_id = ? WHERE id = ? AND order_id IS NULL",
          [orderId, photoId],
        );
      }

      await x.run(
        `INSERT INTO order_status_history(order_id, to_status, changed_by, note)
         VALUES (?, 'da_giao_khach', ?, 'Bán từ kho')`,
        [orderId, input.changedBy ?? null],
      );

      // Cọc là một phiếu thu, không chỉ là con số trên đơn — cùng lối createOrder
      // (deposit là số dẫn xuất = Σ payments, spec v3-B).
      if (deposit > 0) {
        await x.run(
          `INSERT INTO payments (order_id, amount_vnd, paid_at, kind, method, note)
           VALUES (?, ?, ${NOW_EPOCH_SQL}, 'coc', 'chuyen_khoan', NULL)`,
          [orderId, deposit],
        );
      }

      return { ok: true, orderId } as SellResult;
    });
  } catch (err) {
    if (err instanceof StockSaleError) return { ok: false, reason: err.message };
    throw err;
  }
}
```

Import thêm ở đầu `queries.ts`: `planStockSale, type StockSaleLine` từ `@/lib/inventory` (file đã import từ module này — gộp vào dòng sẵn có). `computeOrderMoney` đã được import (createOrder dùng). Xoá `getInventoryItem` nếu sau thay đổi không còn ai gọi (`grep -rn getInventoryItem src`).

Kiểm: `payments.kind`/`method` có nhận `'coc'`/`'chuyen_khoan'` — createOrder đang dùng đúng hai giá trị này nên hợp lệ.

- [ ] **Step 2: Thêm `listSellableStock`**

Đặt ngay sau `listInventory()`:

```ts
export type SellableStockRow = {
  id: number;
  name: string;
  size: string;
  color: string;
  quantity: number;
  avgCost: number;
  source: string;
  productId: number | null;
  /** Giá bán gợi ý của mẫu; null nếu dòng tồn không gắn mẫu. */
  defaultSellVnd: number | null;
  /** Ảnh đại diện: ảnh của chính dòng tồn, không có thì ảnh đầu của mẫu. */
  photoId: number | null;
};

/** Dòng tồn còn hàng cho Sheet chọn hàng lúc tạo đơn bán kho — MỘT câu, không N+1. */
export async function listSellableStock(): Promise<SellableStockRow[]> {
  return raw.all<SellableStockRow>(
    `SELECT i.id, i.product_name AS name, i.size, i.color, i.quantity,
            i.avg_cost AS "avgCost", i.source, i.product_id AS "productId",
            p.default_sell_vnd AS "defaultSellVnd",
            COALESCE(
              (SELECT ph.id FROM photos ph WHERE ph.inventory_id = i.id ORDER BY ph.id LIMIT 1),
              (SELECT ph.id FROM photos ph WHERE ph.product_id = i.product_id ORDER BY ph.id LIMIT 1)
            ) AS "photoId"
       FROM inventory i
       LEFT JOIN products p ON p.id = i.product_id
      WHERE i.quantity > 0
      ORDER BY i.product_name, i.size, i.color`,
  );
}
```

- [ ] **Step 3: Màn `/inventory` gọi hàm mới — giá theo CÁI**

`src/app/(app)/inventory/actions.ts`, `sellFromStockAction`:

```ts
  const inventoryId = parseVnd(formData.get("inventoryId"));
  const quantity = parseVnd(formData.get("quantity"));
  const sellPriceVnd = parseVnd(formData.get("sellPrice"));
  const deposit = parseVnd(formData.get("deposit"));
  const newName = String(formData.get("customerName") ?? "").trim();

  if (!inventoryId) return { error: "Thiếu mã hàng." };
  if (quantity <= 0) return { error: "Số lượng bán phải lớn hơn 0." };
  if (sellPriceVnd <= 0) return { error: "Giá bán phải lớn hơn 0." };

  const result = await sellFromStock({
    lines: [{ inventoryId, quantity, sellPriceVnd }],
    deposit,
    newCustomer: newName ? { name: newName } : null,
    changedBy: session.username,
  });

  if (!result.ok) return { error: result.reason };
  // Ngoài transaction: changeOrderStatus tự mở transaction riêng.
  await autoCompleteIfPaid(result.orderId, session.username);

  await logActivity({
    actor: session.username,
    action: "inventory.sell",
    entityId: result.orderId,
    detail: { soLuong: quantity, giaBan: sellPriceVnd * quantity },
  });
```

(Import thêm `autoCompleteIfPaid` từ `@/db/queries`.)

`sell-form.tsx`: đổi ô giá thành giá MỖI CÁI, lãi tính theo đó:

```tsx
  const [sellPrice, setSellPrice] = useState("");
  const cost = parseVnd(qty) * avgCost;
  const profit = parseVnd(sellPrice) * parseVnd(qty) - cost;
```

```tsx
        <label>
          Giá bán mỗi cái (₫)
          <input
            name="sellPrice"
            inputMode="numeric"
            value={sellPrice}
            onChange={(e) => setSellPrice(e.target.value)}
          />
        </label>
```

và điều kiện `disabled` dùng `parseVnd(sellPrice) <= 0`.

- [ ] **Step 4: Migration vá dữ liệu cũ**

```sql
-- drizzle/0010_ban_tu_kho_backfill.sql
-- v9-C. Đơn bán kho tạo trước v9-C có quoted_total_vnd = 0 và
-- cost_confirmed = false, nên báo cáo lãi ghi doanh thu 0 và xếp chúng vào
-- khối "ước tính". Với ban_tu_kho, goods_total_cny chính là tổng giá bán VND
-- (exchange_rate = 1), nên dùng lại được.
UPDATE orders
   SET quoted_total_vnd = ROUND(goods_total_cny)::int
 WHERE order_type = 'ban_tu_kho' AND quoted_total_vnd = 0;
--> statement-breakpoint
UPDATE order_items
   SET cost_confirmed = true
 WHERE cost_confirmed = false
   AND order_id IN (SELECT id FROM orders WHERE order_type = 'ban_tu_kho');
```

Thêm mục vào cuối mảng `entries` của `drizzle/meta/_journal.json` (nhớ dấu phẩy sau mục 0009):

```json
    {
      "idx": 10,
      "version": "7",
      "when": 1790035200000,
      "tag": "0010_ban_tu_kho_backfill",
      "breakpoints": true
    }
```

(Thiếu mục journal thì `db:migrate` báo thành công mà **bỏ qua file** — gotcha v8-C.)

- [ ] **Step 5: Chặn xoá đơn bán kho (lỗ hổng cũ, tìm thấy lúc lập kế hoạch)**

`canDeleteOrder` (`src/lib/deletion.ts`) chỉ chặn đơn đã CỘNG tồn (`STOCK_TOUCHED`). Đơn `ban_tu_kho` thì đã TRỪ tồn ngay lúc tạo, ở trạng thái `da_giao_khach` (không nằm trong danh sách), nên chưa có phiếu thu là xoá được, và số hàng đã trừ không bao giờ quay lại kho. Từ v9-C, tạo đơn bán kho có cọc 0 ngay trên màn tạo đơn là chuyện thường, nên lỗ này dễ dính hơn nhiều.

Test trước — trong `tests/deletion.test.ts`, thêm `orderType: "order_ho"` vào hằng `clean`, rồi thêm:

```ts
test("đơn bán từ kho bị chặn dù chưa có phiếu thu — tồn đã bị trừ", () => {
  const r = canDeleteOrder({ ...clean, orderType: "ban_tu_kho", status: "da_giao_khach" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /tồn kho/);
});
```

Run: `node --test tests/deletion.test.ts` → FAIL (thiếu trường / chưa chặn).

Sửa `src/lib/deletion.ts`: import thêm `type OrderType` từ `./order-status.ts`; `OrderDeleteFacts` thêm `orderType: OrderType;`; trong `canDeleteOrder`, ngay trước khối `STOCK_TOUCHED`:

```ts
  // Đơn bán kho TRỪ tồn ngay lúc tạo (v9-C: sellFromStock). Xoá đơn thì hàng
  // đã trừ không quay lại kho — tồn hụt âm thầm.
  if (facts.orderType === "ban_tu_kho")
    return {
      ok: false,
      reason: "Đơn bán từ kho đã trừ tồn kho — dùng Đổi/trả từng món để đưa hàng về kho.",
    };
```

Sửa câu `SELECT` lấy `facts` trong `src/db/deletion.ts`: thêm `o.order_type AS "orderType",` và `orderType: OrderType;` vào kiểu (import `type OrderType` từ `@/lib/order-status`).

Run: `node --test tests/deletion.test.ts` → PASS.

- [ ] **Step 6: Typecheck + test**

Run: `npx tsc --noEmit && npm test`
Expected: xanh. `activity-coverage` vẫn thấy `logActivity` trong `sellFromStockAction`.

- [ ] **Step 7: HỎI người dùng rồi mới chạy migration**

Trước khi chạy, đếm số dòng sẽ đổi (chỉ đọc) và báo người dùng:

```bash
node --experimental-strip-types -e "
import postgres from 'postgres';
const sql = postgres(process.env.DIRECT_URL, { prepare: false });
const r = await sql\`SELECT COUNT(*)::int AS n FROM orders WHERE order_type='ban_tu_kho' AND quoted_total_vnd = 0\`;
console.log(r[0]); await sql.end();
"
```

(Chạy với `.env` đã nạp: `node --env-file=.env --experimental-strip-types -e "…"`.)

Người dùng đồng ý thì: `npm run db:migrate`. Chạy lại câu đếm → phải ra `0`.

- [ ] **Step 8: Kiểm trên trình duyệt (HỎI người dùng trước)**

DB dev chính là DB thật, và từ Step 5 đơn bán kho KHÔNG xoá được. Hỏi người dùng có cho tạo một đơn bán thử không, và dùng dòng tồn nào. Nếu đồng ý:

`/inventory`: bán 1 cái dòng đã chọn, giá mỗi cái 100.000, cọc 100.000 → mở đơn: loại Bán từ kho, trạng thái **Hoàn tất** (thu đủ nên tự hoàn tất), có một phiếu thu cọc, tồn giảm 1. Mở `/reports` tháng này: doanh thu có tính đơn đó (không phải 0). Bấm xoá đơn → bị chặn với thông báo "đã trừ tồn kho".

Báo lại người dùng mã đơn thử để họ tự xử lý (Đổi/trả món đó nếu muốn đưa hàng về kho). Không đồng ý thì bỏ qua bước này; Task 7 sẽ kiểm luồng bán kho qua màn tạo đơn.

- [ ] **Step 9: Commit**

```bash
git add src/db/queries.ts src/db/deletion.ts src/lib/deletion.ts tests/deletion.test.ts src/app/\(app\)/inventory drizzle
git commit -m "bán kho: nhiều món một đơn, kiểm tồn trong transaction, cọc qua phiếu thu

Vá thêm: đơn bán kho trước đây có quoted_total_vnd = 0 nên báo cáo lãi
ghi doanh thu 0 (migration 0010 vá dữ liệu cũ), và xoá được dù đã trừ tồn.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Màn tạo đơn — chế độ Bán từ kho

**Files:**
- Modify: `src/app/(app)/orders/new/types.ts`
- Create: `src/app/(app)/orders/new/stock-picker-sheet.tsx`
- Modify: `src/app/(app)/orders/new/item-sheet.tsx`
- Modify: `src/app/(app)/orders/new/new-order-form.tsx`
- Modify: `src/app/(app)/orders/new/page.tsx`
- Modify: `src/app/(app)/orders/actions.ts` (`createOrderAction`)
- Modify: `src/styles/screens.css`

**Interfaces:**
- Consumes: `listSellableStock`, `SellableStockRow`, `sellFromStock` (Task 6); `autoCompleteIfPaid`.
- Produces:
  - `ItemRow` thêm `inventoryId: number | null; stockLeft: number;`
  - `type StockOption = SellableStockRow` (khai báo lại cấu trúc trong `types.ts`, KHÔNG import `@/db/queries` vào client)
  - `StockPickerSheet({ open, onClose, stock, onPick }: { open: boolean; onClose: () => void; stock: StockOption[]; onPick: (s: StockOption) => void })`
  - `ItemSheet` thêm prop `mode: "order" | "stock"`

- [ ] **Step 1: Kiểu dữ liệu**

`types.ts`:

```ts
export type ItemRow = {
  // …giữ nguyên các trường cũ…
  /** v9-C: món lấy từ dòng tồn (đơn Bán từ kho). null = món order hộ. */
  inventoryId: number | null;
  /** Số tồn lúc chọn — chặn gõ quá ở client; server kiểm lại trong transaction. */
  stockLeft: number;
};

// emptyItem thêm:
//   inventoryId: null,
//   stockLeft: 0,

/** Dòng tồn còn hàng — cùng hình với SellableStockRow của src/db/queries.ts. */
export type StockOption = {
  id: number;
  name: string;
  size: string;
  color: string;
  quantity: number;
  avgCost: number;
  source: string;
  productId: number | null;
  defaultSellVnd: number | null;
  photoId: number | null;
};
```

`tsc` sẽ chỉ ra mọi chỗ dựng `ItemRow` bằng object literal thiếu hai trường mới (`applyItemsFromExtract` trong `new-order-form.tsx`, `ProductPickerSheet` hoặc `product-grid.tsx`) — thêm `inventoryId: null, stockLeft: 0` ở từng chỗ.

- [ ] **Step 2: `StockPickerSheet`**

```tsx
// src/app/(app)/orders/new/stock-picker-sheet.tsx
"use client";

import { useMemo, useState } from "react";
import { Sheet } from "@/app/_components/sheet";
import { photoUrl } from "@/lib/photos";
import { displayVariant } from "@/lib/product-catalog";
import { INVENTORY_SOURCE_LABELS, type InventorySource } from "@/lib/inventory";
import type { StockOption } from "./types";

export function StockPickerSheet({
  open,
  onClose,
  stock,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  stock: StockOption[];
  onPick: (s: StockOption) => void;
}) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const rows = useMemo(
    () =>
      needle
        ? stock.filter((s) =>
            `${s.name} ${s.size} ${s.color}`.toLowerCase().includes(needle),
          )
        : stock,
    [stock, needle],
  );

  return (
    <Sheet open={open} title="Chọn hàng trong kho" onClose={onClose}>
      <input
        className="sheet-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Tìm tên, size, màu…"
        enterKeyHint="done"
      />
      <div className="sheet-list">
        {rows.map((s) => (
          <button
            key={s.id}
            type="button"
            className="sheet-item stock-item"
            onClick={() => {
              onPick(s);
              setQ("");
              onClose();
            }}
          >
            {s.photoId ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl(s.photoId, "thumb")} alt="" className="ic-thumb" loading="lazy" />
            ) : (
              <span className="ic-thumb stock-nophoto" aria-hidden="true" />
            )}
            <span className="cust-text">
              <span>{s.name}</span>
              <span className="cust-phone">
                {[
                  displayVariant(s),
                  s.source !== "active"
                    ? INVENTORY_SOURCE_LABELS[s.source as InventorySource]
                    : "",
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </span>
            </span>
            <span className="stock-left num">còn {s.quantity}</span>
          </button>
        ))}
        {rows.length === 0 && (
          <p className="muted">
            {stock.length === 0 ? "Kho đang trống." : `Không có hàng khớp «${q}».`}
          </p>
        )}
      </div>
    </Sheet>
  );
}
```

- [ ] **Step 3: `ItemSheet` chế độ món kho**

Thêm prop `mode: "order" | "stock"`. Khi `row.inventoryId !== null`:
- Ô Tên, Size, Màu: thêm `readOnly` và bỏ chip gợi ý (`row.sizeOptions`/`colorOptions` đã rỗng vì món kho không đặt chúng).
- Ô Số lượng: nhãn `Số lượng * (còn ${row.stockLeft})`.
- Ẩn: `<ItemPhotos>`, nút "★ Lưu vào danh mục", khối "Giá vốn & link", khối gợi ý tách `attributes`.
- Đổi `setSell`: món kho không suy ngược ¥ — gọi `set({ sellPriceVnd: v })` thẳng.
- `valid` thêm điều kiện: `(row.inventoryId === null || Number(row.quantity) <= row.stockLeft)`.
- Ẩn nút "Lưu & thêm nữa" khi `mode === "stock"` (món kế tiếp phải chọn từ Sheet kho, không gõ tay).

Cách viết gọn: `const isStock = row.inventoryId !== null;` rồi bọc từng khối bằng `{!isStock && (…)}`. Prop `mode` chỉ dùng cho nút "Lưu & thêm nữa".

- [ ] **Step 4: Form tạo đơn**

`new-order-form.tsx`:

1. Props thêm `stock: StockOption[]`. State `const [stockOpen, setStockOpen] = useState(false);`. `const isStockSale = orderType === "ban_tu_kho";`.

2. Chọn một dòng tồn:

```tsx
  function pickStock(s: StockOption) {
    // Đã có trong đơn → mở lại dòng đó để sửa, không thêm dòng thứ hai.
    const existing = items.findIndex((it) => it.inventoryId === s.id);
    if (existing >= 0) {
      setItemSheet({ open: true, index: existing });
      return;
    }
    const row: ItemRow = {
      ...emptyItem,
      name: s.name,
      size: s.size,
      color: s.color,
      productId: s.productId,
      inventoryId: s.id,
      stockLeft: s.quantity,
      quantity: "1",
      sellPriceVnd: s.defaultSellVnd ? String(s.defaultSellVnd) : "",
      costConfirmed: true,
    };
    setItems((prev) => [...prev, row]);
    // Mở ngay dòng vừa thêm để nhập giá/số lượng.
    setItemSheet({ open: true, index: items.length });
  }
```

3. `parsedItems` thêm `inventoryId: it.inventoryId,` trong object trả về.

4. Nút thêm món: khi `isStockSale` chỉ hiện MỘT nút:

```tsx
          {isStockSale ? (
            <button type="button" className="picker" onClick={() => setStockOpen(true)}>
              + Chọn hàng trong kho
            </button>
          ) : (
            <>
              {/* hai nút cũ: "★ Chọn từ danh mục" và "+ Thêm món" */}
            </>
          )}
```

5. Đổi loại đơn: hỏi xác nhận nếu đã có món và đổi qua/lại `ban_tu_kho`:

```tsx
                onChange={(e) => {
                  const next = e.target.value as OrderType;
                  const crossing = (next === "ban_tu_kho") !== isStockSale;
                  if (crossing && items.length > 0) {
                    if (!window.confirm("Đổi loại đơn sẽ xoá các món đã nhập. Tiếp tục?")) return;
                    for (const it of items)
                      for (const p of it.photos) deletePhotoAction(p.id).catch(() => {});
                    setItems([]);
                  }
                  setOrderType(next);
                }}
```

6. Ẩn với đơn bán kho (không có nghĩa): ô "Chốt số khác với tổng món", "Tỷ giá", "Phí ship"; ô ¥ trong cột phải (`Tiền hàng`, `Giá vốn quy đổi`). Với đơn bán kho `totalVnd = linesTotal`, và "Lời" ở thanh đáy tính bằng giá vốn kho:

```tsx
  const stockCost = isStockSale
    ? items.reduce((s, it) => {
        const opt = stock.find((o) => o.id === it.inventoryId);
        return s + (opt ? opt.avgCost * parseVnd(it.quantity) : 0);
      }, 0)
    : 0;
  const shownMargin = isStockSale ? linesTotal - stockCost : marginVnd;
```

Hiện `shownMargin` thay cho `marginVnd` ở hai chỗ "Lời". Khi `isStockSale`, dùng `linesTotal` cho `totalVnd` (bỏ qua `totalOverride`).

7. `canSubmit` với đơn bán kho bỏ điều kiện tỷ giá: `(isStockSale || parseVnd(exchangeRate) > 0)`, và thêm `validItems.every((it) => it.inventoryId === null || it.quantity <= (items.find(r => r.inventoryId === it.inventoryId)?.stockLeft ?? 0))`.

8. Render thêm:

```tsx
      <StockPickerSheet
        open={stockOpen}
        onClose={() => setStockOpen(false)}
        stock={stock}
        onPick={pickStock}
      />
```

và `<ItemSheet … mode={isStockSale ? "stock" : "order"} />`.

`page.tsx`: thêm `listSellableStock()` vào `Promise.all` và truyền `stock={stock}` (mảng đã đúng hình `StockOption`).

- [ ] **Step 5: Server — nhánh bán kho trong `createOrderAction`**

Trong `createOrderAction`, ngay SAU khối đọc khách (`customerMode`…) và TRƯỚC khối "Sản phẩm", thêm nhánh:

```ts
  if (orderType === "ban_tu_kho") {
    let lines: { inventoryId: number; quantity: number; sellPriceVnd: number }[] = [];
    try {
      const parsed = JSON.parse(String(formData.get("items") ?? "[]"));
      if (Array.isArray(parsed))
        lines = parsed
          .filter((it) => Number(it.inventoryId) > 0)
          .map((it) => ({
            inventoryId: Number(it.inventoryId),
            quantity: Number(it.quantity) || 0,
            sellPriceVnd: Number(it.sellVnd) || 0,
          }));
    } catch {
      return { error: "Dữ liệu sản phẩm không hợp lệ." };
    }
    if (lines.length === 0) return { error: "Chọn ít nhất 1 món trong kho." };

    const orderPhotoIds = String(formData.get("zaloPhotoIds") ?? "")
      .split(",")
      .map((v) => Number(v.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);

    const result = await sellFromStock({
      lines,
      deposit,
      customerId,
      newCustomer,
      note,
      orderPhotoIds,
      changedBy: session.username,
    });
    if (!result.ok) return { error: result.reason };
    // Ngoài transaction: changeOrderStatus tự mở transaction riêng.
    await autoCompleteIfPaid(result.orderId, session.username);

    await logActivity({
      actor: session.username,
      action: "order.create",
      entityId: result.orderId,
      detail: { op: "ban_tu_kho", mon: lines.length },
    });
    revalidatePath("/orders");
    revalidatePath("/inventory");
    redirect(`/orders/${result.orderId}`);
  }
```

Lưu ý khách: nhánh `customerMode === "new"` phía trên đang `return { error: "Chưa nhập tên khách mới." }` khi thiếu tên. Với đơn bán kho, form không chọn khách thì rơi vào nhánh `"new"` với tên rỗng (`picked?.mode ?? "new"`). Sửa nhánh đó: khi `orderType === "ban_tu_kho"` và tên rỗng, để `newCustomer = null` (thành Khách lẻ) thay vì báo lỗi:

```ts
    if (!name) {
      if (orderType !== "ban_tu_kho") return { error: "Chưa nhập tên khách mới." };
    } else {
      newCustomer = { … như cũ … };
    }
```

Kiểm `detail` của `logActivity` có kiểu nhận object tự do (`Record<string, unknown>`) — các chỗ khác đang truyền `{ ten, op }` nên hợp lệ. Import `sellFromStock`, `autoCompleteIfPaid` từ `@/db/queries`.

**Đây là một lỗi cũ được vá luôn:** trước v9-C, chọn "Bán từ kho" ở màn tạo đơn đi qua `createOrder` → tạo đơn `ban_tu_kho` KHÔNG trừ tồn, `sale_cost` rỗng.

- [ ] **Step 6: CSS**

`screens.css`, cạnh khối `.cust-text` của Task 2:

```css
/* v9-C: dòng tồn trong Sheet chọn hàng kho. */
.stock-item .cust-text {
  flex: 1;
}
.stock-left {
  flex: none;
  font-size: var(--fs-2);
  color: var(--muted);
}
.stock-nophoto {
  background: var(--border);
}
```

Nếu `.ic-thumb` chỉ có kích thước trong ngữ cảnh `.item-card` (kiểm `grep -n "ic-thumb" src/styles/*.css`), thêm luật riêng `.stock-item .ic-thumb { width: 40px; height: 40px; border-radius: var(--radius-sm); object-fit: cover; flex: none; }` (40px nằm trong ngưỡng dùng bản thumb).

- [ ] **Step 7: Typecheck + test**

Run: `npx tsc --noEmit && npm test`
Expected: xanh.

- [ ] **Step 8: Kiểm trên trình duyệt (mobile + desktop)**

Các bước tới "Đổi lại loại đơn" KHÔNG ghi gì vào DB — làm thoải mái. Bước "Tạo đơn bán kho" ghi dữ liệu thật và đơn đó không xoá được (Task 6 Step 5): HỎI người dùng trước, dùng dòng tồn họ chỉ định, ghi lại số tồn trước khi thử.
- `/orders/new` → "Tỷ giá · ship · loại đơn" → Loại đơn "Bán từ kho" → chỉ còn nút "+ Chọn hàng trong kho", các ô tỷ giá/ship/chốt số khác biến mất.
- Chọn dòng A → Sheet món mở, tên/size/màu không sửa được, không có khối ảnh/giá vốn. Gõ số lượng lớn hơn tồn → nút Xong bị tắt.
- Chọn lại đúng dòng A → mở lại dòng cũ, không thêm dòng mới.
- Thêm dòng B. Thanh đáy: Tổng = Σ giá bán, Lời = Tổng − giá vốn kho.
- Đổi lại loại đơn "Order hộ" → hỏi xác nhận → món bị xoá.
- Tạo đơn bán kho 2 dòng, cọc 0 → vào chi tiết: loại Bán từ kho, "Đã giao khách", 2 món có size/màu. `/inventory`: tồn A và B giảm đúng.
- Font-size mọi ô nhập = 16px.

Báo lại người dùng mã đơn thử và dòng tồn đã giảm.

- [ ] **Step 9: Commit**

```bash
git add src/app/\(app\)/orders src/styles/screens.css
git commit -m "tạo đơn: bán hàng tồn kho nhiều món ngay trong màn tạo đơn

Vá thêm: trước đây chọn loại 'Bán từ kho' ở màn này tạo đơn mà không trừ tồn.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Mẫu lưu từ đơn mang theo ảnh

**Files:**
- Modify: `src/db/product-photos.ts`
- Modify: `src/app/(app)/products/actions.ts` (`quickSaveProductAction`)
- Modify: `src/app/(app)/orders/new/item-sheet.tsx`

**Interfaces:**
- Produces:
  - `copyPhotosToProduct(productId: number, photoIds: number[]): Promise<{ copied: number; total: number }>`
  - `quickSaveProductAction(input: { …như cũ…; photoIds: number[] }): Promise<{ productId: number; photosCopied: number; photosTotal: number } | { error: string }>`

- [ ] **Step 1: Tách hàm chép một file, thêm `copyPhotosToProduct`**

Trong `src/db/product-photos.ts`, tách phần sinh tên + chép thành helper dùng chung, rồi viết hàm mới:

```ts
/** Chép một file ảnh sang tên mới. null = chép hỏng (bỏ qua ảnh đó). */
async function copyOneFile(filePath: string): Promise<string | null> {
  const dot = filePath.lastIndexOf(".");
  const ext = dot > 0 ? filePath.slice(dot) : "";
  const target = `${Date.now()}-${randomBytes(6).toString("hex")}${ext}`;
  try {
    await copyPhotoFile(filePath, target);
    return target;
  } catch {
    return null;
  }
}
```

Sửa vòng lặp của `copyProductPhotos` dùng `const target = await copyOneFile(r.filePath); if (!target) continue;`.

```ts
/**
 * v9-C: "★ Lưu vào danh mục" từ Sheet món — CHÉP ảnh của món sang mẫu mới.
 *
 * Chép chứ không dùng chung dòng photos: ảnh của món sẽ gắn vào đơn, mà
 * photos có ON DELETE CASCADE tới order_items — dùng chung thì xoá đơn là
 * cướp mất ảnh của danh mục. Chép thẳng file đã nén, không nén lại.
 *
 * Dòng mới mang product_id ngay lúc INSERT nên job dọn ảnh mồ côi (điều kiện
 * product_id IS NULL) không đụng tới. Chỉ nhận ảnh nhãn 'product'.
 */
export async function copyPhotosToProduct(
  productId: number,
  photoIds: number[],
): Promise<{ copied: number; total: number }> {
  const ids = [...new Set(photoIds)].filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return { copied: 0, total: 0 };
  const holes = ids.map(() => "?").join(", ");
  const rows = await raw.all<{ filePath: string }>(
    `SELECT file_path AS "filePath" FROM photos
      WHERE id IN (${holes}) AND label = 'product' ORDER BY id`,
    ids,
  );

  let copied = 0;
  for (const r of rows) {
    const target = await copyOneFile(r.filePath);
    if (!target) continue;
    await raw.run(
      `INSERT INTO photos(file_path, label, order_id, inventory_id, product_id)
       VALUES(?, 'product', NULL, NULL, ?)`,
      [target, productId],
    );
    copied++;
  }
  return { copied, total: ids.length };
}
```

(`raw.run` là câu ghi nên lớp retry không chạy lại nó — đúng như gotcha retry.)

- [ ] **Step 2: `quickSaveProductAction` nhận ảnh**

Thêm `photoIds: number[];` vào kiểu `input`. Sau `createProduct(...)` (vẫn truyền `photoIds: []` cho `createProduct` — ảnh của món không được gắn thẳng):

```ts
  // Mẫu tạo trước, ảnh chép sau: chép hỏng một ảnh không làm mất cả mẫu.
  const photos = await copyPhotosToProduct(productId, input.photoIds ?? []);
```

`logActivity` thêm `anh: photos.copied` vào `detail`. Trả về `{ productId, photosCopied: photos.copied, photosTotal: photos.total }`. Sửa comment đầu hàm ("Ảnh của món KHÔNG bị lấy đi… Ở đây chỉ lưu chữ và giá.") thành: ảnh của món được CHÉP sang mẫu, bản gốc vẫn ở lại với món. Import `copyPhotosToProduct` từ `@/db/product-photos` (file đã import `copyProductPhotos` từ đó).

- [ ] **Step 3: `ItemSheet` gửi ảnh và báo kết quả**

Trong lời gọi `quickSaveProductAction({...})` thêm `photoIds: row.photos.map((p) => p.id),`. Thông báo thành công:

```ts
                setSavedMsg(
                  res.photosTotal === 0
                    ? "Đã lưu vào danh mục."
                    : res.photosCopied === res.photosTotal
                      ? `Đã lưu vào danh mục kèm ${res.photosCopied} ảnh.`
                      : `Đã lưu vào danh mục (${res.photosCopied}/${res.photosTotal} ảnh).`,
                );
```

- [ ] **Step 4: Typecheck + test**

Run: `npx tsc --noEmit && npm test`
Expected: xanh (`quickSaveProductAction` vẫn có `logActivity`).

- [ ] **Step 5: Kiểm trên trình duyệt**

`/orders/new` → "+ Thêm món" → tên "Thử v9-C", giá 100.000, thêm 2 ảnh → "★ Lưu vào danh mục" → thông báo "kèm 2 ảnh". Mở `/products`: mẫu "Thử v9-C" có ảnh đại diện. Đóng sheet không lưu đơn. Xoá mẫu thử ở `/products` (Admin).

- [ ] **Step 6: Commit**

```bash
git add src/db/product-photos.ts src/app/\(app\)/products/actions.ts src/app/\(app\)/orders/new/item-sheet.tsx
git commit -m "danh mục: mẫu lưu từ đơn chép theo ảnh của món

Trước đây quickSaveProductAction cố ý bỏ ảnh nên mẫu tạo từ đơn không bao giờ có ảnh.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Nén ảnh nhẹ hơn (chọn bằng đo đạc)

**Files:**
- Create: `scripts/compare-image-quality.mjs`
- Modify: `src/lib/image.ts`

**Số đo sơ bộ lúc lập kế hoạch** (10 ảnh trong `uploads/`, phần lớn là ảnh chụp màn hình 1179×2556, KHÔNG phải ảnh sản phẩm — chỉ để ước lượng), KB trung bình:

| Mức | Bản chính | | Mức | Bản nhỏ |
| --- | ---: | --- | --- | ---: |
| 1280 q80 (hiện tại) | 43 | | 400 q72 (hiện tại) | 7 |
| 1080 q70 | 31 | | 320 q60 | 4 |
| 960 q65 | 25 | | 280 q55 | 3 |
| 800 q60 | 19 | | | |
| 720 q55 | 16 | | | |

Ứng viên mặc định: **bản chính 800 q60 (−55%), bản nhỏ 320 q60 (−43%)**. Chốt sau khi người dùng xem ảnh sản phẩm thật.

- [ ] **Step 1: Script đo**

```js
// scripts/compare-image-quality.mjs
// Đo dung lượng WebP ở nhiều mức nén và xuất ảnh để so bằng mắt.
// Dùng: node scripts/compare-image-quality.mjs <thư mục ảnh gốc> <thư mục ra>
import sharp from "sharp";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, parse } from "node:path";

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error("Dùng: node scripts/compare-image-quality.mjs <src> <out>");
  process.exit(1);
}
mkdirSync(out, { recursive: true });

const LEVELS = [
  ["main", 1280, 80],
  ["main", 960, 65],
  ["main", 800, 60],
  ["main", 720, 55],
  ["thumb", 400, 72],
  ["thumb", 320, 60],
];
const files = readdirSync(src).filter((f) => /\.(jpe?g|png|webp|heic)$/i.test(f));
const total = {};
for (const f of files) {
  const buf = readFileSync(join(src, f));
  const parts = [f];
  for (const [kind, dim, q] of LEVELS) {
    const img = await sharp(buf)
      .rotate()
      .resize({ width: dim, height: dim, fit: "inside", withoutEnlargement: true })
      .webp({ quality: q })
      .toBuffer();
    const key = `${kind}-${dim}q${q}`;
    total[key] = (total[key] ?? 0) + img.length;
    writeFileSync(join(out, `${parse(f).name}__${key}.webp`), img);
    parts.push(`${key}:${Math.round(img.length / 1024)}KB`);
  }
  console.log(parts.join("  "));
}
console.log("Trung bình (KB):");
for (const [k, v] of Object.entries(total))
  console.log(`  ${k}: ${Math.round(v / files.length / 1024)}`);
```

- [ ] **Step 2: Lấy ảnh sản phẩm thật**

Hỏi người dùng 5–10 ảnh sản phẩm thật (giày/dép/quần áo, ảnh gốc từ shop TQ hoặc chụp). Đặt vào thư mục scratchpad (KHÔNG commit ảnh). Chạy:

```bash
node scripts/compare-image-quality.mjs <thư mục ảnh> <scratchpad>/compare
```

- [ ] **Step 3: Cho người dùng chọn**

Gửi người dùng (SendUserFile) cho 2–3 ảnh: mỗi ảnh gồm bản `1280q80`, `800q60`, `720q55`, cùng bảng dung lượng trung bình. Hỏi mức thấp nhất vẫn "đủ nhìn thấy". Mặc định đề xuất: `800q60` + thumb `320q60`.

- [ ] **Step 4: Sửa hằng số**

Trong `src/lib/image.ts`, thay hai khối hằng số theo mức đã chọn (ví dụ với mặc định):

```ts
/**
 * v9-C: người dùng chọn "đủ nhìn thấy, không cần nét đẹp" — hạ từ 1280 q80.
 * Đo trên <N> ảnh sản phẩm thật ngày <dd/mm>: 1280 q80 → <a>KB, 800 q60 →
 * <b>KB (−<x>%). Mức chọn bằng mắt trên ảnh so cạnh nhau, không phải con số.
 * Ảnh chốt đơn (DOC_*) KHÔNG đổi: đó là ảnh CHỮ làm bằng chứng.
 */
const PHOTO_MAX_DIMENSION = 800;
const PHOTO_QUALITY = 60;
```

```ts
/**
 * v9-C: 320 q60 — ô 140px ở ~2.3x, hơi mềm nhưng đủ nhận ra mẫu; người
 * dùng chấp nhận đổi độ nét lấy dung lượng (−<y>% so với 400 q72).
 */
const THUMB_MAX_DIMENSION = 320;
const THUMB_QUALITY = 60;
```

Điền `<N>`, `<dd/mm>`, `<a>`, `<b>`, `<x>`, `<y>` bằng số đo THẬT ở Step 2 — không để trống, không để chữ trong ngoặc nhọn. Giữ nguyên `AI_*` và `DOC_*`.

- [ ] **Step 5: Typecheck + test**

Run: `npx tsc --noEmit && npm test`
Expected: xanh.

- [ ] **Step 6: Kiểm trên trình duyệt**

Tải một ảnh sản phẩm lên ở Sheet món; mở ảnh (`/api/photo/<id>`) trong tab mới, `read_network_requests` xem kích thước phản hồi — khớp mức mới (cỡ bản chính ≈ con số đo). Tải một ảnh chốt đơn ở màn nhập nhanh — ảnh vẫn cạnh 1600 (xem kích thước bằng `javascript_tool`: tạo `Image` từ URL, đọc `naturalWidth/Height`). Xoá ảnh thử (đóng sheet không lưu thì ItemPhotos tự xoá).

- [ ] **Step 7: Commit**

```bash
git add scripts/compare-image-quality.mjs src/lib/image.ts
git commit -m "ảnh: nén nhẹ hơn cho ảnh sản phẩm và bản nhỏ, giữ nguyên ảnh chốt đơn

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Tài liệu và nghiệm thu cuối

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Ghi nhận v9-C trong `CLAUDE.md`**

Trong đoạn **Trạng thái**, sau câu về v9-B, thêm:

```
**v9-C xong** — mẫu lưu từ đơn chép theo ảnh của món (`copyPhotosToProduct`);
bán hàng tồn kho nhiều món ngay ở màn tạo đơn (`sellFromStock` nhận nhiều
dòng, kiểm tồn trong transaction sau `FOR UPDATE`, cọc qua phiếu thu); danh
sách đơn có cột Ngày tạo và bộ lọc kiểu Excel (`src/lib/order-filters.ts`,
trạng thái lọc trên URL); chọn khách hiện và tìm theo SĐT (`src/lib/phone.ts`);
ảnh sản phẩm nén nhẹ hơn. Vá kèm: đơn bán kho trước đây có
`quoted_total_vnd = 0` nên báo cáo lãi ghi doanh thu 0 (migration `0010`).
Spec: `docs/superpowers/specs/2026-09-21-heyp-v9c-anh-ban-kho-loc-don-design.md`,
kế hoạch: `docs/superpowers/plans/2026-09-21-heyp-v9c-anh-ban-kho-loc-don.md`.
```

Trong **LƯU Ý QUAN TRỌNG**, thêm các gotcha:

```
- **Đơn `ban_tu_kho` PHẢI có `quoted_total_vnd` = Σ giá bán và mọi
  `order_items.cost_confirmed = true`** (v9-C) — báo cáo lãi đọc doanh thu từ
  `quoted_total_vnd`, không từ `goods_total_cny`. Trước v9-C `sellFromStock`
  bỏ trống cột này nên mọi đơn bán kho ra doanh thu 0 và lãi âm bằng giá vốn,
  không lỗi nào nổ. `drizzle/0010` vá dữ liệu cũ.
- **Mọi đường bán kho đi qua `sellFromStock`** (v9-C) — cả màn `/inventory`
  lẫn màn tạo đơn (`createOrderAction` rẽ nhánh khi `orderType = ban_tu_kho`).
  Trước v9-C chọn "Bán từ kho" ở màn tạo đơn đi qua `createOrder` và tạo đơn
  mà KHÔNG trừ tồn. Kiểm tồn nằm sau `SELECT … FOR UPDATE ORDER BY id`, luật
  cộng dòng trùng nằm trong `planStockSale` (thuần, có test).
- **Bộ lọc đơn nằm trên URL (`d`, `st`, `type`, `due`) và MỌI link của màn
  Đơn phải giữ nó** (v9-C) — chip, sắp xếp, ô tìm (input ẩn). Thêm link mới
  vào màn này thì đi qua `filtersToParams`, nếu không bấm vào là mất lọc.
- **Bảng nổi lọc đầu cột dùng `position: fixed`** — `.dt-c` có
  `overflow: hidden`, `absolute` sẽ bị cắt. Thêm `transform`/`filter` lên
  `.dt` hay tổ tiên của nó là phá cơ chế này.
```

- [ ] **Step 2: Nghiệm thu toàn bộ**

Run: `npm test && npx tsc --noEmit`
Expected: xanh.

Chạy lại nhanh các bước kiểm trình duyệt của Task 2, 4, 7, 8 ở cỡ `mobile` và `desktop`, chụp màn hình: Sheet chọn khách có SĐT; danh sách đơn có cột Ngày tạo + ▾ + "Lọc (n)"; Sheet chọn hàng tồn; mẫu có ảnh ở `/products`. Đặt lại `resize_window` preset `desktop` khi xong.

- [ ] **Step 3: Commit + push**

```bash
git add CLAUDE.md
git commit -m "tài liệu: ghi nhận v9-C và năm gotcha mới

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git push
```

Sau khi Vercel deploy xong, kiểm cửa đăng nhập production vẫn trả 307:

```bash
curl -s -o /dev/null -w '%{http_code}' --max-redirs 0 https://hey-p.vercel.app/
```

Expected: `307`.
