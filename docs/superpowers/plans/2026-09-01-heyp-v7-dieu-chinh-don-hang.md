# HeyP v7 — Điều chỉnh đơn hàng — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép sửa khách hàng, chi tiết món, Tổng chốt, ghi chú và tỷ giá của một đơn đã tạo, không phá luật tiền đang được test khoá.

**Architecture:** Không thêm màn hình mới — chỉ thêm nút Sửa vào đúng chỗ dữ liệu đang hiển thị trong màn chi tiết đơn. Luật tiền đặt ở module thuần (`src/lib/line-pricing.ts`, `order-status.ts`) để test được; tầng DB gọi lại module đó và chạy trong transaction; mỗi thao tác sửa là một server action riêng.

**Tech Stack:** Next.js 15 · React 19 · TypeScript · Postgres (Supabase) + Drizzle (`postgres-js`) · `node:test` · CSS thuần.

**Spec:** `docs/superpowers/specs/2026-09-01-heyp-v7-dieu-chinh-don-hang-design.md`

## Global Constraints

Trích từ `CLAUDE.md` và spec — áp cho MỌI task:

- **Không thêm dependency mới.**
- **SQL thô viết placeholder `?`** — lớp `Exec` (`src/db/raw.ts`) tự đổi sang `$1,$2`.
- **Trong `withTx` PHẢI dùng `x` được truyền vào**, KHÔNG dùng `raw` toàn cục.
- **Alias camelCase trong SQL thô phải bọc nháy kép**: `AS "orderType"`.
- **`SUM()`/`COUNT()` trên cột `integer` phải ép `::int`.**
- **Thời gian là epoch-seconds `bigint`**; SQL thô dùng hằng `NOW_EPOCH_SQL`.
- **Boolean là `boolean` thật**: SQL so `= true`, JS so `=== true`.
- **Đọc số người dùng gõ PHẢI qua `src/lib/parse-number.ts`** — `parseVnd` cho tiền VND VÀ tỷ giá (dấu chấm = ngăn nghìn), `parseDecimal` cho giá ¥ (dấu chấm = thập phân). TUYỆT ĐỐI không viết hàm `num()` riêng: đó là gốc của hai bug tiền đã sửa ngày 01/09.
- **Mọi ô nhập PHẢI `font-size: var(--fs-3)` (16px)** — dưới ngưỡng này Safari iOS tự phóng to trang. Kiểm bằng `[...document.querySelectorAll("input,select,textarea")].map(el=>getComputedStyle(el).fontSize)`.
- **`ListRow` chỉ trả `<div>` khi KHÔNG có `href` và KHÔNG có `onClick`.** Dòng món ở tab Món đang chứa `<form><button>` trong `trailing`; thêm `onClick` sẽ biến nó thành `<button>` lồng `<button>` và **vỡ hydration** (đã xảy ra thật ở `PaymentsBlock`). Nút Sửa phải là một nút riêng trong `trailing`, không phải click cả dòng.
- **Module thuần dùng cho test KHÔNG được import file có alias `@/`**; import module thuần khác bằng đuôi `.ts` tường minh.
- **UI tiếng Việt.** Tiền VND (₫), tệ (¥).
- **Commit tiếng Việt**, kết thúc bằng `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Lệnh kiểm tra: `npm test` · `npx tsc --noEmit` · một file: `node --test tests/<tên>.test.ts`.
- **KHÔNG chạy `npm run build` khi dev server đang sống** — cả hai ghi vào `.next/`, dev server sẽ hỏng manifest. Tắt server trước, hoặc `rm -rf .next` sau khi build.

---

## Bản đồ file

**Sửa — module thuần (test được):**

| File | Thêm gì |
| --- | --- |
| `src/lib/line-pricing.ts` | `sellPerUnitVnd`, `totalAfterEditLine` |
| `src/lib/order-status.ts` | `canEditExchangeRate` |

**Sửa — tầng DB:**

| File | Thêm gì |
| --- | --- |
| `src/db/queries.ts` | `adjustCnyLedgerForOrder` (tách từ `updateLineCost`), `setOrderCustomer`, `updateCustomerInfo`, `updateOrderMeta`, `updateOrderItemFields`, `setQuotedTotal` |

**Sửa — server actions:**

| File | Thêm gì |
| --- | --- |
| `src/app/orders/actions.ts` | `setOrderCustomerAction`, `updateCustomerAction`, `updateOrderMetaAction`, `updateItemAction`, `setQuotedTotalAction` |

**Tạo mới — giao diện:**

| File | Trách nhiệm |
| --- | --- |
| `src/app/orders/[id]/customer-block.tsx` | Khối Khách hàng có nút Sửa (tab Tóm tắt) |
| `src/app/orders/[id]/order-meta-block.tsx` | Khối Ghi chú + tỷ giá (tab Tóm tắt) |
| `src/app/orders/[id]/total-editor.tsx` | Sửa Tổng chốt (tab Tiền) |

**Sửa — giao diện:**

| File | Sửa gì |
| --- | --- |
| `src/app/orders/[id]/item-editor.tsx` | Mở rộng từ "chỉ thêm" thành "thêm + sửa" |
| `src/app/orders/[id]/page.tsx` | Nạp `listCustomers()`, nhúng 3 khối mới, thêm nút Sửa vào dòng món |
| `CLAUDE.md` | Luật tiền mở rộng, mục Tài liệu |

**Thứ tự phụ thuộc:** Task 1 (module thuần) và Task 2 (tách helper ví ¥) là nền, làm trước. Task 3–6 là bốn lát cắt dọc độc lập nhau, làm theo thứ tự nào cũng được. Task 7 dọn cuối.

---

## Task 1: Module thuần — công thức sửa dòng và luật khoá tỷ giá

**Files:**
- Modify: `src/lib/line-pricing.ts` (thêm vào cuối file)
- Modify: `src/lib/order-status.ts` (thêm cạnh `canEditOrderItems`)
- Test: `tests/line-pricing.test.ts` (thêm test)
- Test: `tests/order-status.test.ts` (thêm test)

**Interfaces:**
- Consumes: `PricingLine`, `lineSellVnd`, `cnyFromSellPrice`, `marginFromSellPrice` (đã có trong `line-pricing.ts`); `OrderStatus` (đã có).
- Produces:
  - `sellPerUnitVnd(line: PricingLine, sellRate: number): number`
  - `totalAfterEditLine(quotedTotal: number, oldLine: PricingLine, newSellVnd: number, newQty: number, sellRate: number): number`
  - `canEditExchangeRate(status: OrderStatus): boolean`

- [ ] **Step 1: Viết test cho hai hàm giá**

Thêm `sellPerUnitVnd, totalAfterEditLine` vào khối import sẵn có ở đầu `tests/line-pricing.test.ts`, rồi nối vào cuối file:

```ts
test("suy ngược giá phải thu/1 cái từ dòng đã lưu", () => {
  // Dòng tạo từ giá thu 1.000.000, SL 2, tỷ giá 3600, lời mặc định 170.000
  const rate = 3600;
  const sell = 1_000_000;
  const cny = cnyFromSellPrice(sell, rate, 170_000);
  const base: PricingLine = { quantity: 2, unitPriceCny: cny, marginVnd: 0 };
  const line: PricingLine = {
    ...base,
    marginVnd: marginFromSellPrice(sell, base, rate),
  };
  assert.equal(sellPerUnitVnd(line, rate), sell);
});

test("suy ngược đúng cả khi lời đã bị rải lại", () => {
  // 60¥ × 4000 = 240.000 giá vốn + 170.000 lời = 410.000 giá bán, SL 1
  const line: PricingLine = { quantity: 1, unitPriceCny: 60, marginVnd: 170_000 };
  assert.equal(sellPerUnitVnd(line, 4000), 410_000);
});

test("Total sau khi đổi SỐ LƯỢNG của một dòng", () => {
  // Đơn 2.000.000, dòng cũ giá bán 410.000 (SL 1), đổi thành SL 3 giá thu 410.000
  const old: PricingLine = { quantity: 1, unitPriceCny: 60, marginVnd: 170_000 };
  assert.equal(
    totalAfterEditLine(2_000_000, old, 410_000, 3, 4000),
    2_000_000 - 410_000 + 410_000 * 3,
  );
});

test("Total sau khi đổi GIÁ THU của một dòng", () => {
  const old: PricingLine = { quantity: 1, unitPriceCny: 60, marginVnd: 170_000 };
  assert.equal(totalAfterEditLine(2_000_000, old, 500_000, 1, 4000), 2_090_000);
});

test("đổi cả số lượng lẫn giá thu", () => {
  const old: PricingLine = { quantity: 2, unitPriceCny: 60, marginVnd: 340_000 };
  // giá bán dòng cũ = 2×60×4000 + 340.000 = 820.000
  assert.equal(
    totalAfterEditLine(2_000_000, old, 300_000, 4, 4000),
    2_000_000 - 820_000 + 300_000 * 4,
  );
});

test("BẤT BIẾN: sửa dòng mà không đổi gì thì Total giữ nguyên", () => {
  const rate = 4000;
  const old: PricingLine = { quantity: 2, unitPriceCny: 60, marginVnd: 340_000 };
  const sell = sellPerUnitVnd(old, rate);
  assert.equal(totalAfterEditLine(2_000_000, old, sell, old.quantity, rate), 2_000_000);
});
```

- [ ] **Step 2: Chạy test, xác nhận nó hỏng**

Run: `node --test tests/line-pricing.test.ts`
Expected: FAIL — `sellPerUnitVnd is not a function`.

- [ ] **Step 3: Thêm hai hàm vào cuối `src/lib/line-pricing.ts`**

```ts
/**
 * Giá phải thu cho 1 CÁI, suy ngược từ dòng đã lưu (v7).
 *
 * `sellVnd` KHÔNG có trong DB — bảng order_items chỉ lưu `unit_price_cny` và
 * `margin_vnd`, giá bán là số dẫn xuất. Hàm này để màn sửa món hiện lại đúng
 * con số người dùng đã gõ.
 *
 * Làm tròn hai lần (trong lineSellVnd, rồi chia SL) nên có thể lệch vài đồng
 * so với số gõ ban đầu — đó là lý do `updateOrderItemFields` KHÔNG được tính
 * lại khối tiền khi số lượng và giá thu không đổi.
 */
export function sellPerUnitVnd(line: PricingLine, sellRate: number): number {
  if (!(line.quantity > 0)) return 0;
  return Math.round(lineSellVnd(line, sellRate) / line.quantity);
}

/**
 * Total sau khi SỬA một dòng: bỏ giá bán cũ ra, cộng giá bán mới vào.
 *
 * Cùng họ với totalAfterAddLine/totalAfterRemoveLine (v6): đụng phía BÁN
 * (số lượng, giá thu) thì Total đổi theo. Đụng phía GIÁ VỐN (¥, tỷ giá) thì
 * Total ghim và lời rải lại — đó là việc của allocateMargins, không phải hàm này.
 */
export function totalAfterEditLine(
  quotedTotal: number,
  oldLine: PricingLine,
  newSellVnd: number,
  newQty: number,
  sellRate: number,
): number {
  return (
    Math.round(quotedTotal) -
    lineSellVnd(oldLine, sellRate) +
    Math.round(newSellVnd) * newQty
  );
}
```

- [ ] **Step 4: Chạy test, xác nhận xanh**

Run: `node --test tests/line-pricing.test.ts`
Expected: PASS — mọi test cũ vẫn xanh, 6 test mới xanh.

- [ ] **Step 5: Viết test cho `canEditExchangeRate`**

Thêm `canEditExchangeRate` vào khối import sẵn có của `tests/order-status.test.ts`, rồi nối vào cuối file:

```ts
test("tỷ giá chỉ sửa được khi đơn chưa mua hàng", () => {
  assert.equal(canEditExchangeRate("khach_chot"), true);
});

test("mua hàng rồi thì tỷ giá khoá — đã dùng để chốt giá vốn và trừ ví", () => {
  for (const s of ["da_mua_tq", "da_giao_khach", "ve_kho_vn", "hoan_tat",
                   "huy", "khach_bom", "su_co"] as const) {
    assert.equal(canEditExchangeRate(s), false, `phải khoá ${s}`);
  }
});
```

- [ ] **Step 6: Chạy test, xác nhận nó hỏng**

Run: `node --test tests/order-status.test.ts`
Expected: FAIL — `canEditExchangeRate` chưa tồn tại.

- [ ] **Step 7: Thêm `canEditExchangeRate` ngay dưới `canEditOrderItems` trong `src/lib/order-status.ts`**

```ts
/**
 * Tỷ giá chỉ sửa được khi đơn CHƯA mua hàng.
 *
 * Từ `da_mua_tq` trở đi, tỷ giá đã dùng để chốt giá vốn thật và trừ ví ¥
 * (xem shouldDeductCny). Đổi nó sau đó làm sai lãi đã ghi nhận, và không có
 * cách nào sửa lại sổ ví cho khớp — sổ ví là append-only.
 */
export function canEditExchangeRate(status: OrderStatus): boolean {
  return status === "khach_chot";
}
```

- [ ] **Step 8: Chạy toàn bộ test + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: tất cả xanh.

- [ ] **Step 9: Commit**

```bash
git add src/lib/line-pricing.ts src/lib/order-status.ts tests/line-pricing.test.ts tests/order-status.test.ts
git commit -m "$(cat <<'MSG'
sửa đơn: công thức sửa dòng và luật khoá tỷ giá trong module thuần

sellPerUnitVnd suy ngược giá phải thu từ dòng đã lưu (giá bán không có trong
DB, chỉ lưu ¥ và lời). totalAfterEditLine cùng họ với totalAfterAddLine của
v6: đụng phía bán thì Total đổi theo.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Task 2: Tách helper ghi điều chỉnh ví ¥

Đoạn ghi dòng `dieu_chinh` đang nằm lẫn trong thân `updateLineCost`. Task 5 cần
đúng logic đó khi sửa số lượng; chép lại là nhân đôi logic tiền.

**Files:**
- Modify: `src/db/queries.ts` (tách hàm, sửa `updateLineCost` gọi hàm mới)

**Interfaces:**
- Consumes: `Exec` (`src/db/raw.ts`), `currentRate`, `listLedger` (đã có).
- Produces: `adjustCnyLedgerForOrder(x: Exec, orderId: number, ledger: LedgerRow[], note: string): Promise<void>` — hàm nội bộ, KHÔNG export.

- [ ] **Step 1: Thêm hàm mới ngay TRÊN `updateLineCost` trong `src/db/queries.ts`**

```ts
/**
 * Ghi dòng `dieu_chinh` vào ví ¥ khi giá vốn của đơn vừa đổi mà đơn ĐÃ tiêu ¥.
 *
 * Sổ ví là append-only: không bao giờ sửa dòng cũ. Chênh lệch giữa số ¥ theo
 * các dòng sản phẩm hiện tại và số ¥ đã ghi sổ được bù bằng một dòng mới.
 *
 * Gọi BÊN TRONG transaction đang mở — dùng `x`, không dùng `raw`.
 * `ledger` phải đọc TRƯỚC khi mở transaction (listLedger dùng `raw` toàn cục).
 */
async function adjustCnyLedgerForOrder(
  x: Exec,
  orderId: number,
  ledger: Awaited<ReturnType<typeof listLedger>>,
  note: string,
): Promise<void> {
  const spent = (await x.get<{ cny: number }>(
    `SELECT COALESCE(SUM(-cny_delta), 0) AS cny
       FROM cny_ledger WHERE order_id = ? AND kind IN ('chi','dieu_chinh')`,
    [orderId],
  ))!;
  if (!(spent.cny > 0)) return; // đơn chưa tiêu ¥ → không có gì để bù

  const agg = (await x.get<{ cny: number }>(
    "SELECT COALESCE(SUM(quantity * unit_price_cny), 0) AS cny FROM order_items WHERE order_id = ?",
    [orderId],
  ))!;
  const diff = agg.cny - spent.cny;
  if (Math.abs(diff) <= 0.0001) return; // không lệch thì không ghi dòng thừa

  await x.run(
    `INSERT INTO cny_ledger (kind, cny_delta, rate_snapshot, order_id, note)
     VALUES ('dieu_chinh', ?, ?, ?, ?)`,
    [-diff, Math.round(currentRate(ledger)), orderId, note],
  );
}
```

- [ ] **Step 2: Thay đoạn cũ trong `updateLineCost` bằng lời gọi hàm mới**

Xoá nguyên khối này trong thân `updateLineCost`:

```ts
      // Đơn đã mua hàng rồi mà giá ¥ mới sửa → ghi dòng điều chỉnh bằng phần
      // chênh vào ví. Sổ ví là append-only: không bao giờ sửa quá khứ.
      const spent = (await x.get<{ cny: number }>(
        `SELECT COALESCE(SUM(-cny_delta), 0) AS cny
           FROM cny_ledger WHERE order_id = ? AND kind IN ('chi','dieu_chinh')`,
        [orderId],
      ))!;

      if (spent.cny > 0) {
        const agg = (await x.get<{ cny: number }>(
          "SELECT COALESCE(SUM(quantity * unit_price_cny), 0) AS cny FROM order_items WHERE order_id = ?",
          [orderId],
        ))!;
        const diff = agg.cny - spent.cny;
        if (Math.abs(diff) > 0.0001) {
          const rate = Math.round(currentRate(ledger));
          await x.run(
            `INSERT INTO cny_ledger (kind, cny_delta, rate_snapshot, order_id, note)
             VALUES ('dieu_chinh', ?, ?, ?, ?)`,
            [-diff, rate, orderId, `Sửa giá ¥ đơn #${orderId}`],
          );
        }
      }
```

và thay bằng:

```ts
      await adjustCnyLedgerForOrder(x, orderId, ledger, `Sửa giá ¥ đơn #${orderId}`);
```

- [ ] **Step 3: Typecheck + chạy toàn bộ test**

Run: `npx tsc --noEmit && npm test`
Expected: tất cả xanh. Đây là refactor thuần — hành vi KHÔNG được đổi, test cũ về ví ¥ (`tests/cny-deduct.test.ts`, `tests/cny-wallet.test.ts`) phải vẫn xanh.

- [ ] **Step 4: Commit**

```bash
git add src/db/queries.ts
git commit -m "$(cat <<'MSG'
ví ¥: tách hàm ghi dòng điều chỉnh ra khỏi updateLineCost

Refactor thuần, không đổi hành vi. Việc sửa số lượng món (v7) cần đúng logic
này; để nguyên trong thân updateLineCost thì phải chép lại logic tiền.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Task 3: Sửa khách hàng của đơn

Lát cắt dọc trọn vẹn: DB → action → giao diện. Đây là lỗ hổng nặng nhất — app
đang nhắc cờ `thieu_khach` mà không có đường nào bổ sung.

**Files:**
- Modify: `src/db/queries.ts` (thêm `setOrderCustomer`, `updateCustomerInfo`)
- Modify: `src/app/orders/actions.ts` (thêm 2 action)
- Create: `src/app/orders/[id]/customer-block.tsx`
- Modify: `src/app/orders/[id]/page.tsx`

**Interfaces:**
- Consumes: `withTx`, `Exec` (`src/db/raw.ts`); `LineActionResult` (đã có trong `queries.ts`); `CustomerSheet`, `CustomerPick` (`src/app/orders/new/customer-sheet.tsx`); `listCustomers` (đã có); `parseVnd` (`src/lib/parse-number.ts`).
- Produces:
  - `setOrderCustomer(orderId: number, input: { customerId?: number | null; newCustomer?: { name: string } | null }): Promise<LineActionResult>`
  - `updateCustomerInfo(customerId: number, input: { name: string; phone: string | null; address: string | null }): Promise<LineActionResult>`
  - `setOrderCustomerAction(formData: FormData): Promise<void>` — nhận `orderId`, `customerId` HOẶC `newCustomerName`
  - `updateCustomerAction(formData: FormData): Promise<void>` — nhận `orderId`, `customerId`, `name`, `phone`, `address`

- [ ] **Step 1: Thêm hai hàm DB vào `src/db/queries.ts`** (đặt ngay dưới `getCustomer`)

```ts
/**
 * Gắn hoặc đổi khách cho một đơn (v7).
 *
 * KHÔNG khoá theo trạng thái: đơn đã hoàn tất vẫn được gán khách nếu lúc tạo
 * quên — đó là bổ sung thông tin, không phải sửa sổ sách. Tiền không đổi.
 */
export async function setOrderCustomer(
  orderId: number,
  input: { customerId?: number | null; newCustomer?: { name: string } | null },
): Promise<LineActionResult> {
  try {
    return await withTx(async (x) => {
      const order = await x.get<{ id: number }>(
        "SELECT id FROM orders WHERE id = ?",
        [orderId],
      );
      if (!order) throw new Error("Không tìm thấy đơn");

      let customerId = input.customerId ?? null;
      if (!customerId && input.newCustomer) {
        const name = input.newCustomer.name.trim();
        if (name === "") throw new Error("Chưa nhập tên khách mới.");
        const c = await x.get<{ id: number }>(
          "INSERT INTO customers(name) VALUES(?) RETURNING id",
          [name],
        );
        customerId = c!.id;
      }
      if (!customerId) throw new Error("Chưa chọn khách.");

      await x.run("UPDATE orders SET customer_id = ? WHERE id = ?", [
        customerId,
        orderId,
      ]);
      return { ok: true } as LineActionResult;
    });
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

/**
 * Sửa thông tin khách. LƯU Ý: đụng bảng `customers` nên đổi cho MỌI đơn của
 * khách đó — một khách một bản ghi. Giao diện phải nói rõ điều này.
 */
export async function updateCustomerInfo(
  customerId: number,
  input: { name: string; phone: string | null; address: string | null },
): Promise<LineActionResult> {
  const name = input.name.trim();
  if (name === "") return { ok: false, reason: "Tên khách không được để trống." };
  try {
    await raw.run(
      "UPDATE customers SET name = ?, phone = ?, address = ? WHERE id = ?",
      [name, input.phone, input.address, customerId],
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}
```

- [ ] **Step 2: Thêm hai action vào cuối `src/app/orders/actions.ts`**

```ts
import { setOrderCustomer, updateCustomerInfo } from "@/db/queries";

/** Gắn/đổi khách cho đơn. Chọn khách có sẵn hoặc tạo khách mới theo tên. */
export async function setOrderCustomerAction(
  formData: FormData,
): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const orderId = parseVnd(formData.get("orderId"));
  if (!Number.isInteger(orderId) || orderId <= 0) redirect("/orders");

  const customerId = parseVnd(formData.get("customerId")) || null;
  const newName = String(formData.get("newCustomerName") ?? "").trim();

  const result = await setOrderCustomer(orderId, {
    customerId,
    newCustomer: newName ? { name: newName } : null,
  });
  if (!result.ok) {
    redirect(`/orders/${orderId}?err=${encodeURIComponent(result.reason)}`);
  }
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/customers");
  redirect(`/orders/${orderId}`);
}

/** Sửa tên/SĐT/địa chỉ khách — đổi cho MỌI đơn của khách đó. */
export async function updateCustomerAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const orderId = parseVnd(formData.get("orderId"));
  const customerId = parseVnd(formData.get("customerId"));
  if (!Number.isInteger(customerId) || customerId <= 0) redirect("/orders");

  const result = await updateCustomerInfo(customerId, {
    name: String(formData.get("name") ?? ""),
    phone: String(formData.get("phone") ?? "").trim() || null,
    address: String(formData.get("address") ?? "").trim() || null,
  });
  if (!result.ok) {
    redirect(`/orders/${orderId}?err=${encodeURIComponent(result.reason)}`);
  }
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/customers");
  redirect(`/orders/${orderId}`);
}
```

- [ ] **Step 3: Viết `src/app/orders/[id]/customer-block.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Sheet } from "../../_components/sheet";
import { CopyButton } from "../../_components/copy-button";
import {
  CustomerSheet,
  type CustomerPick,
} from "../new/customer-sheet";
import type { CustomerOption } from "../new/types";
import { setOrderCustomerAction, updateCustomerAction } from "../actions";

export type OrderCustomer = {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
};

export function CustomerBlock({
  orderId,
  customer,
  customers,
}: {
  orderId: number;
  customer: OrderCustomer | null;
  customers: CustomerOption[];
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  // Khách vừa chọn ở CustomerSheet, chờ bấm nút để gửi lên server.
  const [picked, setPicked] = useState<CustomerPick | null>(null);

  return (
    <>
      <section className="card">
        <h2 className="card-title">
          Khách hàng
          <button
            type="button"
            className="btn btn-sm btn-ghost card-title-action"
            onClick={() => (customer ? setEditOpen(true) : setPickOpen(true))}
          >
            {customer ? "Sửa" : "+ Chọn khách"}
          </button>
        </h2>
        <div className="kv">
          <span>Tên</span>
          {customer ? (
            <strong>{customer.name}</strong>
          ) : (
            <em className="muted">— chưa có khách —</em>
          )}
        </div>
        {customer?.phone && (
          <div className="kv">
            <span>SĐT/Zalo</span>
            <a href={`tel:${customer.phone.replace(/\s/g, "")}`}>
              {customer.phone}
            </a>
          </div>
        )}
        {customer?.address && (
          <div className="kv">
            <span>Địa chỉ</span>
            <span className="kv-copy">
              {customer.address}
              <CopyButton
                text={customer.address}
                label="Copy"
                className="btn btn-ghost btn-sm"
              />
            </span>
          </div>
        )}
      </section>

      {/* Sheet sửa thông tin khách hiện tại */}
      <Sheet
        open={editOpen}
        title={customer ? customer.name : ""}
        onClose={() => setEditOpen(false)}
      >
        {customer && (
          <>
            <p className="muted small">
              Sửa ở đây đổi cho <strong>mọi đơn</strong> của khách này — thông
              tin khách là dữ liệu dùng chung, không phải của riêng đơn.
            </p>
            <form action={updateCustomerAction}>
              <input type="hidden" name="orderId" value={orderId} />
              <input type="hidden" name="customerId" value={customer.id} />
              <label className="field">
                <span>Tên khách *</span>
                <input name="name" defaultValue={customer.name} required />
              </label>
              <label className="field">
                <span>SĐT / Zalo</span>
                <input
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  defaultValue={customer.phone ?? ""}
                  placeholder="09..."
                />
              </label>
              <label className="field">
                <span>Địa chỉ giao</span>
                <input name="address" defaultValue={customer.address ?? ""} />
              </label>
              <button type="submit" className="btn" style={{ width: "100%" }}>
                Lưu thông tin khách
              </button>
            </form>

            <button
              type="button"
              className="btn btn-outline"
              style={{ width: "100%", marginTop: 12 }}
              onClick={() => {
                setEditOpen(false);
                setPickOpen(true);
              }}
            >
              Đổi sang khách khác
            </button>
          </>
        )}
      </Sheet>

      {/* Sheet chọn khách — dùng lại đúng component của màn tạo đơn */}
      <CustomerSheet
        open={pickOpen}
        onClose={() => setPickOpen(false)}
        customers={customers}
        onPick={setPicked}
      />

      {/* Chọn xong thì hiện nút xác nhận: CustomerSheet chỉ trả lựa chọn về,
          không tự gửi form. */}
      <Sheet
        open={picked !== null}
        title="Gắn khách vào đơn"
        onClose={() => setPicked(null)}
      >
        {picked && (
          <form action={setOrderCustomerAction}>
            <input type="hidden" name="orderId" value={orderId} />
            {picked.mode === "existing" && (
              <input type="hidden" name="customerId" value={picked.id} />
            )}
            {picked.mode === "new" && (
              <input type="hidden" name="newCustomerName" value={picked.name} />
            )}
            <p>
              Gắn đơn #{orderId} cho khách <strong>{picked.name}</strong>
              {picked.mode === "new" && " (khách mới)"}.
            </p>
            <button type="submit" className="btn" style={{ width: "100%" }}>
              Xác nhận
            </button>
          </form>
        )}
      </Sheet>
    </>
  );
}
```

- [ ] **Step 4: Nhúng vào `src/app/orders/[id]/page.tsx`**

Thêm `listCustomers` vào import từ `@/db/queries`, và `CustomerBlock` vào import:

```tsx
import { CustomerBlock } from "./customer-block";
```

Thêm `listCustomers()` vào `Promise.all` đang nạp dữ liệu (khối `const [detail, orderPackages, settings, suggestedFinal] = await Promise.all([...])`) — thành:

```tsx
  const [detail, orderPackages, settings, suggestedFinal, allCustomers] =
    await Promise.all([
      getOrderDetail(orderId),
      getPackagesForOrder(orderId),
      getSettings(),
      suggestFinalPayment(orderId),
      listCustomers(),
    ]);
```

Thay nguyên `<section className="card">` chứa `<h2 className="card-title">Khách hàng</h2>` (và toàn bộ các `kv` bên trong) bằng:

```tsx
          <CustomerBlock
            orderId={order.id}
            customer={
              customer
                ? {
                    id: customer.id,
                    name: customer.name,
                    phone: customer.phone,
                    address: customer.address,
                  }
                : null
            }
            customers={allCustomers.map((c) => ({
              id: c.id,
              name: c.name,
              warningFlag: c.warningFlag,
              warningReason: c.warningReason,
            }))}
          />
```

- [ ] **Step 5: Thêm CSS cho nút trong tiêu đề thẻ**

Kiểm đã có chưa: `grep -n "card-title-action" src/styles/*.css`. Nếu chưa, thêm vào `src/styles/components.css`:

```css
.card-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
}
.card-title-action {
  font-weight: 400;
}
```

Nếu `.card-title` đã có luật khác trong `legacy.css` thì **đừng sửa luật cũ** — thêm luật mới ở `components.css` sẽ bị đè (legacy import sau). Trường hợp đó, đặt hai luật trên vào `legacy.css` cạnh `.card-title` hiện có.

- [ ] **Step 6: Typecheck + test**

Run: `npx tsc --noEmit && npm test`
Expected: không lỗi, tất cả xanh.

- [ ] **Step 7: Kiểm bằng preview**

Tắt dev server cũ nếu đang chạy, khởi động lại, rồi:
1. Mở một đơn **chưa có khách** → tab Tóm tắt phải có nút **+ Chọn khách** → chọn một khách có sẵn → xác nhận → tên khách hiện ra, cờ "Thiếu thông tin khách" ở màn Tổng quan giảm đi 1.
2. Bấm **Sửa** → nhập SĐT và địa chỉ → lưu → hiện đúng, và sheet có dòng cảnh báo "đổi cho mọi đơn của khách này".
3. Bấm **Sửa → Đổi sang khách khác** → chọn khách khác → đơn đổi chủ.
4. Gõ một tên chưa có trong danh sách → **+ Tạo khách mới «...»** → khách mới được tạo và gắn vào đơn.
5. Kiểm cỡ chữ ô nhập trong sheet:
   ```js
   [...document.querySelectorAll("input,select,textarea")].map(el=>getComputedStyle(el).fontSize)
   ```
   Expected: tất cả `"16px"`.

- [ ] **Step 8: Commit**

```bash
git add src/db/queries.ts src/app/orders src/styles
git commit -m "$(cat <<'MSG'
sửa đơn: gắn/đổi khách và sửa thông tin khách ngay trong màn đơn

Lấp lỗ hổng nặng nhất: app vẫn nhắc cờ "Thiếu thông tin khách" mà trước đây
không có đường nào bổ sung. Sheet sửa ghi rõ thông tin khách là dữ liệu dùng
chung — sửa ở đây đổi cho mọi đơn của khách đó.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Task 4: Sửa ghi chú và tỷ giá

**Files:**
- Modify: `src/db/queries.ts` (thêm `updateOrderMeta`)
- Modify: `src/app/orders/actions.ts` (thêm `updateOrderMetaAction`)
- Create: `src/app/orders/[id]/order-meta-block.tsx`
- Modify: `src/app/orders/[id]/page.tsx`

**Interfaces:**
- Consumes: `canEditExchangeRate` (Task 1); `allocateMargins`, `getSettings`, `readOrderMoneyRow`, `recomputeOrderMoneyRow`, `LineActionResult` (đã có); `parseVnd` (`src/lib/parse-number.ts`).
- Produces:
  - `updateOrderMeta(orderId: number, input: { note: string | null; exchangeRate?: number }): Promise<LineActionResult>`
  - `updateOrderMetaAction(formData: FormData): Promise<void>` — nhận `orderId`, `note`, `exchangeRate`

- [ ] **Step 1: Thêm `updateOrderMeta` vào `src/db/queries.ts`** (đặt dưới `setQuotedTotal` nếu đã có, hoặc cạnh `updateLineMargin`)

```ts
/**
 * Sửa ghi chú và tỷ giá của đơn (v7).
 *
 * Ghi chú không đụng tiền → sửa được mọi lúc.
 *
 * Tỷ giá chỉ sửa được khi đơn còn ở `khach_chot` (canEditExchangeRate). Đổi
 * tỷ giá làm đổi GIÁ VỐN của mọi dòng, nên theo luật v7 thì Total GHIM và lời
 * được rải lại — cùng cách updateLineCost xử lý khi sửa giá ¥.
 */
export async function updateOrderMeta(
  orderId: number,
  input: { note: string | null; exchangeRate?: number },
): Promise<LineActionResult> {
  const defaultMargin = (await getSettings()).defaultMarginVnd;

  try {
    return await withTx(async (x) => {
      const row = await x.get<{ status: OrderStatus; exchange_rate: number }>(
        "SELECT status, exchange_rate FROM orders WHERE id = ?",
        [orderId],
      );
      if (!row) throw new Error("Không tìm thấy đơn");

      await x.run("UPDATE orders SET note = ? WHERE id = ?", [
        input.note,
        orderId,
      ]);

      const wantsRate =
        input.exchangeRate !== undefined &&
        input.exchangeRate > 0 &&
        input.exchangeRate !== row.exchange_rate;

      if (wantsRate) {
        if (!canEditExchangeRate(row.status))
          throw new Error(
            `Đơn ở "${STATUS_LABELS[row.status]}" không sửa được tỷ giá — tỷ giá đã dùng để chốt giá vốn và trừ ví ¥.`,
          );

        await x.run("UPDATE orders SET exchange_rate = ? WHERE id = ?", [
          input.exchangeRate,
          orderId,
        ]);

        // Giá vốn đổi → rải lại lời để Σ giá bán vẫn đúng bằng Total.
        const quoted = (await x.get<{ total: number }>(
          "SELECT quoted_total_vnd AS total FROM orders WHERE id = ?",
          [orderId],
        ))!;
        const rows = await x.all<{
          id: number;
          quantity: number;
          unit_price_cny: number;
          margin_vnd: number;
        }>(
          "SELECT id, quantity, unit_price_cny, margin_vnd FROM order_items WHERE order_id = ? ORDER BY id",
          [orderId],
        );
        const margins = allocateMargins(
          quoted.total,
          rows.map((r) => ({
            quantity: r.quantity,
            unitPriceCny: r.unit_price_cny,
            marginVnd: r.margin_vnd,
          })),
          input.exchangeRate!,
          defaultMargin,
        );
        for (const [i, r] of rows.entries()) {
          await x.run("UPDATE order_items SET margin_vnd = ? WHERE id = ?", [
            margins[i],
            r.id,
          ]);
        }

        const order = await readOrderMoneyRow(x, orderId);
        await recomputeOrderMoneyRow(x, orderId, order);
      }

      return { ok: true } as LineActionResult;
    });
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}
```

Thêm `canEditExchangeRate` vào khối import từ `@/lib/order-status` ở đầu `queries.ts` (khối này đã có `STATUS_LABELS`, `canEditOrderItems`).

- [ ] **Step 2: Thêm action vào cuối `src/app/orders/actions.ts`**

```ts
import { updateOrderMeta } from "@/db/queries";

export async function updateOrderMetaAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const orderId = parseVnd(formData.get("orderId"));
  if (!Number.isInteger(orderId) || orderId <= 0) redirect("/orders");

  const rateRaw = formData.get("exchangeRate");
  const result = await updateOrderMeta(orderId, {
    note: String(formData.get("note") ?? "").trim() || null,
    // Ô tỷ giá chỉ có mặt khi đơn còn sửa được — không có thì đừng đụng tới.
    exchangeRate: rateRaw === null ? undefined : parseVnd(rateRaw),
  });

  if (!result.ok) {
    redirect(`/orders/${orderId}?err=${encodeURIComponent(result.reason)}`);
  }
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  redirect(`/orders/${orderId}`);
}
```

- [ ] **Step 3: Viết `src/app/orders/[id]/order-meta-block.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Sheet } from "../../_components/sheet";
import { groupVnd } from "@/lib/parse-number";
import { updateOrderMetaAction } from "../actions";

export function OrderMetaBlock({
  orderId,
  note,
  exchangeRate,
  canEditRate,
}: {
  orderId: number;
  note: string | null;
  exchangeRate: number;
  /** false khi đơn đã mua hàng — tỷ giá lúc đó đã chốt giá vốn và trừ ví ¥. */
  canEditRate: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <section className="card">
        <h2 className="card-title">
          Ghi chú
          <button
            type="button"
            className="btn btn-sm btn-ghost card-title-action"
            onClick={() => setOpen(true)}
          >
            Sửa
          </button>
        </h2>
        {note ? (
          <p style={{ margin: 0 }}>{note}</p>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            — chưa có ghi chú —
          </p>
        )}
      </section>

      <Sheet open={open} title="Ghi chú & tỷ giá" onClose={() => setOpen(false)}>
        <form action={updateOrderMetaAction}>
          <input type="hidden" name="orderId" value={orderId} />

          <label className="field">
            <span>Ghi chú nội bộ</span>
            <textarea name="note" rows={3} defaultValue={note ?? ""} />
          </label>

          {canEditRate ? (
            <label className="field">
              <span>Tỷ giá (₫/¥)</span>
              <input
                name="exchangeRate"
                inputMode="numeric"
                defaultValue={groupVnd(String(exchangeRate))}
              />
            </label>
          ) : (
            <p className="muted small">
              Tỷ giá <strong>{groupVnd(String(exchangeRate))}</strong> đã khoá —
              đơn đã mua hàng nên tỷ giá này đã dùng để chốt giá vốn và trừ ví ¥.
            </p>
          )}

          <button type="submit" className="btn" style={{ width: "100%" }}>
            Lưu
          </button>
        </form>
      </Sheet>
    </>
  );
}
```

- [ ] **Step 4: Nhúng vào `src/app/orders/[id]/page.tsx`**

Thêm import:

```tsx
import { canEditExchangeRate } from "@/lib/order-status";
import { OrderMetaBlock } from "./order-meta-block";
```

(`canEditExchangeRate` thêm vào khối import sẵn có từ `@/lib/order-status`.)

Thay nguyên khối này:

```tsx
          {order.note && (
            <section className="card">
              <h2 className="card-title">Ghi chú</h2>
              <p style={{ margin: 0 }}>{order.note}</p>
            </section>
          )}
```

bằng:

```tsx
          <OrderMetaBlock
            orderId={order.id}
            note={order.note}
            exchangeRate={order.exchangeRate}
            canEditRate={canEditExchangeRate(order.status)}
          />
```

Lưu ý: khối cũ ẩn hoàn toàn khi `order.note` rỗng — đó là lý do trước đây không có chỗ nào thêm ghi chú. Khối mới luôn hiện.

- [ ] **Step 5: Typecheck + test**

Run: `npx tsc --noEmit && npm test`
Expected: không lỗi, tất cả xanh.

- [ ] **Step 6: Kiểm bằng preview**

1. Đơn ở **"Khách chốt"** → tab Tóm tắt → khối Ghi chú hiện cả khi trống → Sửa → nhập ghi chú và đổi tỷ giá từ 4.000 thành 4.100 → lưu.
2. Vào tab Tiền, đối chiếu: Tổng chốt **không đổi**, "Tiền hàng" đổi theo tỷ giá mới, "Lời" đổi bù lại. Kiểm bằng SQL:
   ```sql
   SELECT o.quoted_total_vnd,
          SUM(ROUND(i.quantity * i.unit_price_cny * o.exchange_rate) + i.margin_vnd)::int AS sum_sell
     FROM orders o JOIN order_items i ON i.order_id = o.id
    WHERE o.id = <id> GROUP BY o.quoted_total_vnd;
   ```
   Hai số phải bằng nhau.
3. Đơn ở **"Đã mua, đang về"** → mở sheet → **không có ô tỷ giá**, chỉ có dòng giải thích vì sao khoá.

- [ ] **Step 7: Commit**

```bash
git add src/db/queries.ts src/app/orders
git commit -m "$(cat <<'MSG'
sửa đơn: ghi chú và tỷ giá

Khối Ghi chú giờ hiện cả khi trống — trước đây ẩn hẳn nên không có chỗ nào
thêm ghi chú sau khi tạo đơn.

Tỷ giá chỉ sửa được khi đơn còn ở "Khách chốt"; đổi tỷ giá làm đổi giá vốn nên
Total ghim và lời rải lại, đúng cách updateLineCost xử lý khi sửa giá ¥.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Task 5: Sửa chi tiết món

Task khó nhất — chứa cái bẫy làm tròn ở mục 4 của spec.

**Files:**
- Modify: `src/db/queries.ts` (thêm `updateOrderItemFields`)
- Modify: `src/app/orders/actions.ts` (thêm `updateItemAction`)
- Modify: `src/app/orders/[id]/item-editor.tsx` (mở rộng thành thêm + sửa)
- Modify: `src/app/orders/[id]/page.tsx` (nút Sửa trong `trailing` của dòng món)

**Interfaces:**
- Consumes: `sellPerUnitVnd`, `totalAfterEditLine` (Task 1); `adjustCnyLedgerForOrder` (Task 2); `canEditOrderItems`, `marginFromSellPrice`, `listLedger`, `readOrderMoneyRow`, `recomputeOrderMoneyRow` (đã có).
- Produces:
  - `updateOrderItemFields(orderId, itemId, input: { name: string; attributes: string | null; productUrl: string | null; quantity: number; sellVnd: number; unitPriceCny: number; costConfirmed: boolean }): Promise<LineActionResult>`
  - `updateItemAction(formData: FormData): Promise<void>`
  - `ItemSheetButton` — component thay cho `AddItemButton`, có prop `initial?: EditableItem`

- [ ] **Step 1: Thêm `updateOrderItemFields` vào `src/db/queries.ts`** (đặt ngay dưới `addOrderItem`)

```ts
/**
 * Sửa một món của đơn đã tạo (v7).
 *
 * CÁI BẪY: `sellVnd` KHÔNG có trong DB, nó là số suy ngược từ ¥ và lời, phải
 * làm tròn hai lần. Nếu cứ tính lại khối tiền mỗi lần lưu thì người dùng chỉ
 * sửa TÊN MÓN cũng làm Total trôi vài đồng, lặp nhiều lần thì lệch thật.
 * → Số lượng và giá thu KHÔNG đổi thì tuyệt đối không đụng tới khối tiền.
 */
export async function updateOrderItemFields(
  orderId: number,
  itemId: number,
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
): Promise<LineActionResult> {
  if (input.name.trim() === "")
    return { ok: false, reason: "Chưa nhập tên hàng." };

  const ledger = await listLedger();

  try {
    return await withTx(async (x) => {
      const status = await x.get<{ status: OrderStatus }>(
        "SELECT status FROM orders WHERE id = ?",
        [orderId],
      );
      if (!status) throw new Error("Không tìm thấy đơn");

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
      const oldLine = {
        quantity: item.quantity,
        unitPriceCny: item.unit_price_cny,
        marginVnd: item.margin_vnd,
      };
      const oldSell = sellPerUnitVnd(oldLine, order.exchange_rate);

      const moneyChanged =
        input.quantity !== item.quantity ||
        input.sellVnd !== oldSell ||
        input.unitPriceCny !== item.unit_price_cny;

      // Chỉ sửa chữ → ghi mấy cột chữ rồi thôi. Không đụng tiền, không trôi số.
      if (!moneyChanged) {
        await x.run(
          `UPDATE order_items SET name = ?, attributes = ?, product_url = ?
            WHERE id = ? AND order_id = ?`,
          [input.name.trim(), input.attributes, input.productUrl, itemId, orderId],
        );
        return { ok: true } as LineActionResult;
      }

      if (!canEditOrderItems(status.status))
        throw new Error(
          `Đơn ở "${STATUS_LABELS[status.status]}" không sửa được số lượng hay giá.`,
        );
      if (!(input.quantity > 0))
        throw new Error("Số lượng phải lớn hơn 0.");
      if (!(input.sellVnd > 0))
        throw new Error("Chưa nhập giá phải thu.");

      const quoted = (await x.get<{ total: number }>(
        "SELECT quoted_total_vnd AS total FROM orders WHERE id = ?",
        [orderId],
      ))!;

      const newLine = {
        quantity: input.quantity,
        unitPriceCny: input.unitPriceCny,
        marginVnd: 0,
      };
      const margin = marginFromSellPrice(
        input.sellVnd,
        newLine,
        order.exchange_rate,
      );

      await x.run(
        `UPDATE order_items
            SET name = ?, attributes = ?, product_url = ?, quantity = ?,
                unit_price_cny = ?, margin_vnd = ?, cost_confirmed = ?
          WHERE id = ? AND order_id = ?`,
        [
          input.name.trim(),
          input.attributes,
          input.productUrl,
          input.quantity,
          input.unitPriceCny,
          margin,
          input.costConfirmed,
          itemId,
          orderId,
        ],
      );

      await x.run("UPDATE orders SET quoted_total_vnd = ? WHERE id = ?", [
        totalAfterEditLine(
          quoted.total,
          oldLine,
          input.sellVnd,
          input.quantity,
          order.exchange_rate,
        ),
        orderId,
      ]);

      // Đơn đã tiêu ¥ mà giá vốn vừa đổi → bù bằng một dòng điều chỉnh.
      await adjustCnyLedgerForOrder(
        x,
        orderId,
        ledger,
        `Sửa món đơn #${orderId}`,
      );

      await recomputeOrderMoneyRow(x, orderId, order);
      return { ok: true } as LineActionResult;
    });
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}
```

Thêm `sellPerUnitVnd, totalAfterEditLine` vào khối import từ `@/lib/line-pricing` ở đầu `queries.ts`.

- [ ] **Step 2: Thêm action vào cuối `src/app/orders/actions.ts`**

```ts
import { updateOrderItemFields } from "@/db/queries";

export async function updateItemAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const orderId = parseVnd(formData.get("orderId"));
  const itemId = parseVnd(formData.get("itemId"));
  if (!Number.isInteger(orderId) || !Number.isInteger(itemId))
    redirect("/orders");

  const result = await updateOrderItemFields(orderId, itemId, {
    name: String(formData.get("name") ?? ""),
    attributes: String(formData.get("attributes") ?? "").trim() || null,
    productUrl: String(formData.get("productUrl") ?? "").trim() || null,
    quantity: parseVnd(formData.get("quantity")),
    sellVnd: parseVnd(formData.get("sellVnd")),
    unitPriceCny: parseDecimal(formData.get("unitPriceCny")),
    costConfirmed: String(formData.get("costConfirmed")) === "true",
  });

  if (!result.ok) {
    redirect(`/orders/${orderId}?tab=mon&err=${encodeURIComponent(result.reason)}`);
  }
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  redirect(`/orders/${orderId}?tab=mon`);
}
```

- [ ] **Step 3: Mở rộng `src/app/orders/[id]/item-editor.tsx` thành thêm + sửa**

Đổi `AddItemButton` thành `ItemSheetButton` nhận thêm `initial`. Giữ nguyên toàn bộ phần suy ngược ¥ — các ô y hệt nhau, tách đôi component là nhân bản logic tiền.

```tsx
"use client";

import { useState } from "react";
import { Sheet } from "../../_components/sheet";
import { ItemPhotos, type ItemPhoto } from "../../_components/item-photos";
import { cnyFromSellPrice } from "@/lib/line-pricing";
import { groupVnd, parseVnd } from "@/lib/parse-number";
import { addItemAction, deletePhotoAction, updateItemAction } from "../actions";

/** Món đang sửa. `sellVnd` là số suy ngược (sellPerUnitVnd), không có trong DB. */
export type EditableItem = {
  id: number;
  name: string;
  attributes: string;
  productUrl: string;
  quantity: number;
  sellVnd: number;
  unitPriceCny: number;
  costConfirmed: boolean;
};

export function ItemSheetButton({
  orderId,
  sellRate,
  defaultMarginVnd,
  initial,
  label,
}: {
  orderId: number;
  sellRate: number;
  defaultMarginVnd: number;
  /** Có = chế độ SỬA; không có = chế độ THÊM. */
  initial?: EditableItem;
  /** Chữ trên nút mở sheet. */
  label: string;
}) {
  const editing = initial !== undefined;
  const [open, setOpen] = useState(false);
  const [sell, setSell] = useState(
    initial ? groupVnd(String(initial.sellVnd)) : "",
  );
  const [cny, setCny] = useState(initial ? String(initial.unitPriceCny) : "");
  const [confirmed, setConfirmed] = useState(initial?.costConfirmed ?? false);
  const [photos, setPhotos] = useState<ItemPhoto[]>([]);

  function onSellChange(v: string) {
    setSell(v);
    if (confirmed) return;
    const next = cnyFromSellPrice(parseVnd(v), sellRate, defaultMarginVnd);
    setCny(next > 0 ? String(next) : "");
  }

  /**
   * Đóng mà KHÔNG lưu thì xoá ảnh vừa tải lên, nếu không chúng nằm lại trong
   * DB (order_id NULL) và trên Storage. Ảnh đã gắn đơn thì an toàn:
   * deletePhoto chỉ xoá dòng có order_id IS NULL.
   */
  function close() {
    for (const p of photos) {
      deletePhotoAction(p.id).catch(() => {
        // Xoá hỏng thì job dọn ảnh mồ côi lo nốt.
      });
    }
    setOpen(false);
    setPhotos([]);
    // Chế độ sửa: trả ô về đúng giá trị của món, không xoá trắng.
    setSell(initial ? groupVnd(String(initial.sellVnd)) : "");
    setCny(initial ? String(initial.unitPriceCny) : "");
    setConfirmed(initial?.costConfirmed ?? false);
  }

  return (
    <>
      <button
        type="button"
        className={editing ? "btn btn-sm btn-ghost" : "btn btn-outline"}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>

      <Sheet
        open={open}
        title={editing ? "Sửa món" : "Thêm món vào đơn"}
        onClose={close}
      >
        <p className="muted small">
          {editing
            ? "Đổi số lượng hoặc giá phải thu sẽ làm tổng chốt của đơn đổi theo. Sửa mỗi tên hay size thì tiền giữ nguyên."
            : "Thêm món làm tăng tổng chốt của đơn thêm đúng giá bán của món mới. Lời các món cũ giữ nguyên."}
        </p>

        <form action={editing ? updateItemAction : addItemAction}>
          <input type="hidden" name="orderId" value={orderId} />
          {editing && <input type="hidden" name="itemId" value={initial.id} />}
          <input type="hidden" name="unitPriceCny" value={cny} />
          <input
            type="hidden"
            name="costConfirmed"
            value={confirmed ? "true" : "false"}
          />
          {!editing && (
            <input
              type="hidden"
              name="photoIds"
              value={photos.map((p) => p.id).join(",")}
            />
          )}

          <label className="field">
            <span>Tên hàng *</span>
            <input
              name="name"
              required
              autoFocus
              defaultValue={initial?.name ?? ""}
              enterKeyHint="next"
            />
          </label>

          <label className="field">
            <span>Size / màu</span>
            <input
              name="attributes"
              defaultValue={initial?.attributes ?? ""}
              enterKeyHint="next"
            />
          </label>

          <label className="field">
            <span>Số lượng *</span>
            <input
              name="quantity"
              inputMode="numeric"
              defaultValue={String(initial?.quantity ?? 1)}
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

          {/* Ảnh chỉ có ở chế độ THÊM: sửa món mà đính thêm ảnh cần đường gắn
              riêng, để dành khi thật sự cần. Ảnh của món sửa được ở tab Ảnh. */}
          {!editing && <ItemPhotos value={photos} onChange={setPhotos} />}

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
              <input
                name="productUrl"
                type="url"
                inputMode="url"
                defaultValue={initial?.productUrl ?? ""}
              />
            </label>
          </details>

          <button type="submit" className="btn" style={{ width: "100%" }}>
            {editing ? "Lưu món" : "Thêm món"}
          </button>
        </form>
      </Sheet>
    </>
  );
}
```

- [ ] **Step 4: Cập nhật `src/app/orders/[id]/page.tsx`**

Đổi import:

```tsx
import { ItemSheetButton } from "./item-editor";
```

Thêm import công thức suy ngược:

```tsx
import { sellPerUnitVnd } from "@/lib/line-pricing";
```

Thay lời gọi `<AddItemButton …>` ở cuối khối Sản phẩm bằng:

```tsx
            {canEditOrderItems(order.status) && (
              <ItemSheetButton
                orderId={order.id}
                sellRate={sellRate}
                defaultMarginVnd={settings.defaultMarginVnd}
                label="+ Thêm món"
              />
            )}
```

Thêm nút Sửa vào `trailing` của dòng món — **đặt cạnh các nút khác trong
`<span className="lr-actions">`, KHÔNG biến cả dòng thành clickable**: dòng
đang chứa `<form><button>`, cho `ListRow` một `onClick` sẽ tạo `<button>` lồng
`<button>` và vỡ hydration.

```tsx
                  trailing={
                    <span className="lr-actions">
                      {lineActions}
                      <ItemSheetButton
                        orderId={order.id}
                        sellRate={sellRate}
                        defaultMarginVnd={settings.defaultMarginVnd}
                        label="Sửa"
                        initial={{
                          id: it.id,
                          name: it.name,
                          attributes: it.attributes ?? "",
                          productUrl: it.productUrl ?? "",
                          quantity: it.quantity,
                          // PHẢI dùng order.exchangeRate, KHÔNG dùng biến
                          // `sellRate` (= order.exchangeRate || settings.sellRate).
                          // updateOrderItemFields suy ngược bằng đúng
                          // order.exchange_rate; hai bên lệch tỷ giá thì
                          // sellVnd lệch theo và hàm tưởng nhầm là người dùng
                          // vừa đổi giá, rồi tính lại khối tiền một cách vô cớ.
                          sellVnd: sellPerUnitVnd(
                            {
                              quantity: it.quantity,
                              unitPriceCny: it.unitPriceCny,
                              marginVnd: it.marginVnd,
                            },
                            order.exchangeRate,
                          ),
                          unitPriceCny: it.unitPriceCny,
                          costConfirmed: it.costConfirmed,
                        }}
                      />
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

- [ ] **Step 5: Typecheck + test**

Run: `npx tsc --noEmit && npm test`
Expected: không lỗi, tất cả xanh.

- [ ] **Step 6: Kiểm bằng preview — đây là task đáng kiểm kỹ nhất**

1. Mở đơn ở "Khách chốt" có 2 món → tab Món → bấm **Sửa** ở một món → ô Giá phải thu phải hiện **đúng** số đã nhập lúc tạo đơn.
2. **Chỉ đổi tên món**, bấm Lưu. Kiểm SQL — `quoted_total_vnd`, `margin_vnd`, `goods_total_cny` phải **y hệt trước đó, không lệch một đồng**:
   ```sql
   SELECT id, quoted_total_vnd, goods_total_cny, margin_vnd FROM orders WHERE id = <id>;
   ```
   Lặp lại 3 lần liên tiếp (sửa tên 3 lần) — số vẫn không đổi. Đây là cái bẫy chính của task này.
3. Đổi **số lượng** 1 → 3 → Tổng chốt tăng thêm đúng 2 × giá thu. Σ giá bán vẫn khớp Total:
   ```sql
   SELECT o.quoted_total_vnd,
          SUM(ROUND(i.quantity * i.unit_price_cny * o.exchange_rate) + i.margin_vnd)::int AS sum_sell
     FROM orders o JOIN order_items i ON i.order_id = o.id
    WHERE o.id = <id> GROUP BY o.quoted_total_vnd;
   ```
4. Đổi **giá phải thu** → Tổng đổi theo, Σ vẫn khớp.
5. Đơn đã **Hoàn tất** → nút Sửa vẫn hiện, sửa tên được; đổi số lượng thì báo lỗi *"Đơn ở «Hoàn tất» không sửa được số lượng hay giá."*
6. Đơn ở **"Đã mua, đang về"** có ¥ > 0 → đổi số lượng → vào `/finance` xem có một dòng `dieu_chinh` mới bằng đúng phần chênh ¥.
7. Console không có lỗi hydration.

- [ ] **Step 7: Commit**

```bash
git add src/db/queries.ts src/app/orders
git commit -m "$(cat <<'MSG'
sửa đơn: sửa chi tiết món (tên, size, số lượng, giá phải thu)

Trước đây món tạo xong chỉ sửa được giá ¥ và lời; gõ nhầm tên hay chọn nhầm
size phải xoá món rồi thêm lại.

Chốt một cái bẫy: giá phải thu không có trong DB mà là số suy ngược, làm tròn
hai lần. Nếu cứ tính lại khối tiền mỗi lần lưu thì sửa mỗi tên món cũng làm
Total trôi vài đồng. Luật: số lượng và giá thu không đổi thì không đụng tiền.

Nút Sửa nằm cạnh các nút khác trong trailing, KHÔNG cho click cả dòng — dòng
đang chứa form nên ListRow có onClick sẽ vỡ hydration.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Task 6: Sửa Tổng chốt

**Files:**
- Modify: `src/db/queries.ts` (thêm `setQuotedTotal`)
- Modify: `src/app/orders/actions.ts` (thêm `setQuotedTotalAction`)
- Create: `src/app/orders/[id]/total-editor.tsx`
- Modify: `src/app/orders/[id]/page.tsx`

**Interfaces:**
- Consumes: `canEditOrderItems`, `allocateMargins`, `getSettings`, `readOrderMoneyRow`, `recomputeOrderMoneyRow`, `LineActionResult` (đã có); `groupVnd`, `parseVnd` (`src/lib/parse-number.ts`).
- Produces:
  - `setQuotedTotal(orderId: number, total: number): Promise<LineActionResult>`
  - `setQuotedTotalAction(formData: FormData): Promise<void>` — nhận `orderId`, `quotedTotalVnd`

- [ ] **Step 1: Thêm `setQuotedTotal` vào `src/db/queries.ts`** (đặt dưới `updateOrderItemFields`)

```ts
/**
 * Sửa thẳng Tổng chốt với khách (v7) — dùng khi khách thương lượng lại giá.
 *
 * Total là số MỚI, lời được rải lại cho các dòng để Σ giá bán khớp đúng nó —
 * cùng cơ chế ô "Chốt số khác với tổng món" ở màn tạo đơn. Giá vốn ¥ không đổi
 * nên ví ¥ không bị đụng tới.
 */
export async function setQuotedTotal(
  orderId: number,
  total: number,
): Promise<LineActionResult> {
  if (!(total > 0)) return { ok: false, reason: "Tổng chốt phải lớn hơn 0." };

  const defaultMargin = (await getSettings()).defaultMarginVnd;

  try {
    return await withTx(async (x) => {
      const status = await x.get<{ status: OrderStatus }>(
        "SELECT status FROM orders WHERE id = ?",
        [orderId],
      );
      if (!status) throw new Error("Không tìm thấy đơn");
      if (!canEditOrderItems(status.status))
        throw new Error(
          `Đơn ở "${STATUS_LABELS[status.status]}" không sửa được tổng chốt.`,
        );

      const order = await readOrderMoneyRow(x, orderId);
      const rows = await x.all<{
        id: number;
        quantity: number;
        unit_price_cny: number;
        margin_vnd: number;
      }>(
        "SELECT id, quantity, unit_price_cny, margin_vnd FROM order_items WHERE order_id = ? ORDER BY id",
        [orderId],
      );
      if (rows.length === 0) throw new Error("Đơn chưa có món nào.");

      const margins = allocateMargins(
        Math.round(total),
        rows.map((r) => ({
          quantity: r.quantity,
          unitPriceCny: r.unit_price_cny,
          marginVnd: r.margin_vnd,
        })),
        order.exchange_rate,
        defaultMargin,
      );
      for (const [i, r] of rows.entries()) {
        await x.run("UPDATE order_items SET margin_vnd = ? WHERE id = ?", [
          margins[i],
          r.id,
        ]);
      }

      await x.run("UPDATE orders SET quoted_total_vnd = ? WHERE id = ?", [
        Math.round(total),
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

- [ ] **Step 2: Thêm action vào cuối `src/app/orders/actions.ts`**

```ts
import { setQuotedTotal } from "@/db/queries";

export async function setQuotedTotalAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const orderId = parseVnd(formData.get("orderId"));
  if (!Number.isInteger(orderId) || orderId <= 0) redirect("/orders");

  const result = await setQuotedTotal(
    orderId,
    parseVnd(formData.get("quotedTotalVnd")),
  );
  if (!result.ok) {
    redirect(`/orders/${orderId}?tab=tien&err=${encodeURIComponent(result.reason)}`);
  }
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  redirect(`/orders/${orderId}?tab=tien`);
}
```

- [ ] **Step 3: Viết `src/app/orders/[id]/total-editor.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Sheet } from "../../_components/sheet";
import { groupVnd } from "@/lib/parse-number";
import { setQuotedTotalAction } from "../actions";

export function TotalEditor({
  orderId,
  quotedTotalVnd,
  canEdit,
}: {
  orderId: number;
  quotedTotalVnd: number;
  /** false khi đơn đã chốt sổ (Hoàn tất / Hủy / Khách bom). */
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!canEdit) {
    return (
      <p className="muted small" style={{ marginBottom: 0 }}>
        Đơn đã chốt sổ — không sửa được tổng chốt.
      </p>
    );
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        onClick={() => setOpen(true)}
      >
        Sửa tổng chốt
      </button>

      <Sheet
        open={open}
        title="Sửa tổng chốt"
        onClose={() => setOpen(false)}
      >
        <p className="muted small">
          Dùng khi khách thương lượng lại giá. Giá vốn ¥ giữ nguyên, phần lời
          của các món được rải lại để khớp con số mới — ví ¥ không bị đụng tới.
        </p>
        <form action={setQuotedTotalAction}>
          <input type="hidden" name="orderId" value={orderId} />
          <label className="field">
            <span>Tổng chốt với khách (₫)</span>
            <input
              name="quotedTotalVnd"
              inputMode="numeric"
              defaultValue={groupVnd(String(quotedTotalVnd))}
              required
              autoFocus
            />
          </label>
          <button type="submit" className="btn" style={{ width: "100%" }}>
            Lưu tổng chốt
          </button>
        </form>
      </Sheet>
    </>
  );
}
```

- [ ] **Step 4: Nhúng vào tab Tiền của `src/app/orders/[id]/page.tsx`**

Thêm import:

```tsx
import { TotalEditor } from "./total-editor";
```

Trong nhánh `{tab === "tien" && (…)}`, ở nhánh **không phải** `isStockSale`
(khối có `<span>Tiền hàng</span>`), thêm ngay trước `<div style={{ marginTop: 14 }}><CopyButton … /></div>`:

```tsx
                <div style={{ marginTop: 14 }}>
                  <TotalEditor
                    orderId={order.id}
                    quotedTotalVnd={order.quotedTotalVnd}
                    canEdit={canEditOrderItems(order.status)}
                  />
                </div>
```

Đơn `ban_tu_kho` không có Tổng chốt theo nghĩa này (giá bán nằm ở
`goods_total_cny` với tỷ giá 1) nên không thêm vào nhánh `isStockSale`.

- [ ] **Step 5: Typecheck + test**

Run: `npx tsc --noEmit && npm test`
Expected: không lỗi, tất cả xanh.

- [ ] **Step 6: Kiểm bằng preview**

1. Đơn ở "Khách chốt" Tổng 2.000.000 → tab Tiền → **Sửa tổng chốt** → đổi thành 1.900.000 → lưu.
2. Kiểm Σ giá bán vẫn khớp Total mới:
   ```sql
   SELECT o.quoted_total_vnd,
          SUM(ROUND(i.quantity * i.unit_price_cny * o.exchange_rate) + i.margin_vnd)::int AS sum_sell
     FROM orders o JOIN order_items i ON i.order_id = o.id
    WHERE o.id = <id> GROUP BY o.quoted_total_vnd;
   ```
   Hai số phải bằng nhau và bằng 1.900.000.
3. Kiểm `goods_total_cny` **không đổi** (giá vốn không bị đụng), và `/finance` không có dòng ví ¥ mới.
4. Đơn đã **Hoàn tất** → chỗ đó hiện dòng "Đơn đã chốt sổ — không sửa được tổng chốt", không có nút.

- [ ] **Step 7: Commit**

```bash
git add src/db/queries.ts src/app/orders
git commit -m "$(cat <<'MSG'
sửa đơn: sửa thẳng tổng chốt với khách

Dùng khi khách thương lượng lại giá sau khi đã chốt đơn. Lời rải lại để Σ giá
bán khớp con số mới, giá vốn ¥ giữ nguyên nên ví ¥ không bị đụng tới — cùng cơ
chế ô "Chốt số khác với tổng món" ở màn tạo đơn.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Task 7: Tài liệu và rà cuối

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: mọi thứ từ Task 1–6.
- Produces: không có API mới.

- [ ] **Step 1: Cập nhật dòng trạng thái ở đầu `CLAUDE.md`**

Nối vào cuối đoạn trạng thái (sau phần v6):

```
**v7 xong** — điều chỉnh đơn hàng: gắn/đổi khách và sửa thông tin khách, sửa
chi tiết món (tên, size, số lượng, giá phải thu), sửa tổng chốt, sửa ghi chú
và tỷ giá. Spec:
`docs/superpowers/specs/2026-09-01-heyp-v7-dieu-chinh-don-hang-design.md`,
kế hoạch: `docs/superpowers/plans/2026-09-01-heyp-v7-dieu-chinh-don-hang.md`.
```

- [ ] **Step 2: Thêm ba gạch đầu dòng vào mục LƯU Ý QUAN TRỌNG**

Đặt ngay trên gạch đầu dòng `- **SQL thô đi qua lớp \`Exec\`**`:

```
- **Luật tiền khi SỬA đơn (v7) — đụng phía nào thì bên đó là biến tự do:**
  đụng GIÁ VỐN (¥, tỷ giá) → Total ghim, lời rải lại; đụng phía BÁN (số lượng,
  giá phải thu, thêm/xoá món) → Total tính lại; sửa thẳng ô Tổng → lời rải lại
  toàn bộ. Bất biến xuyên suốt: Σ giá bán các dòng luôn bằng Total.
- **Giá phải thu KHÔNG có trong DB** — `order_items` chỉ lưu `unit_price_cny`
  và `margin_vnd`; giá bán là số dẫn xuất, phải làm tròn hai lần
  (`sellPerUnitVnd`). Vì vậy `updateOrderItemFields` KHÔNG được tính lại khối
  tiền khi số lượng và giá thu không đổi — nếu không, sửa mỗi tên món cũng làm
  Total trôi vài đồng, lặp nhiều lần thì lệch thật.
- **Ba tầng khoá khi sửa đơn** — thông tin không đụng tiền (khách, SĐT, địa
  chỉ, ghi chú, tên món, size) sửa được MỌI LÚC kể cả đơn đã hoàn tất; số
  lượng/giá/Tổng chỉ khi `canEditOrderItems`; tỷ giá chỉ khi
  `canEditExchangeRate` (đơn còn ở `khach_chot`, vì từ `da_mua_tq` trở đi tỷ
  giá đã dùng để chốt giá vốn và trừ ví ¥).
```

- [ ] **Step 3: Thêm spec và kế hoạch v7 vào mục Tài liệu**

Dòng spec đã được thêm lúc viết spec. Thêm tiếp kế hoạch vào cùng dòng đó:

```
- Thiết kế v7 (điều chỉnh đơn hàng): `docs/superpowers/specs/2026-09-01-heyp-v7-dieu-chinh-don-hang-design.md`, kế hoạch: `docs/superpowers/plans/2026-09-01-heyp-v7-dieu-chinh-don-hang.md`
```

- [ ] **Step 4: Rà cuối toàn hệ thống**

Run: `npm test && npx tsc --noEmit`
Expected: tất cả xanh.

Tắt dev server rồi mới build (hai bên cùng ghi `.next/`):

```bash
lsof -tiTCP:3000 -sTCP:LISTEN | xargs -r kill -9
npm run build
rm -rf .next
```
Expected: `Compiled successfully`.

Kiểm không còn hàm đọc số viết tay nào lọt vào:
Run: `grep -rn "const num = \|^function num(" --include='*.ts' --include='*.tsx' src/`
Expected: không có kết quả.

- [ ] **Step 5: Commit và push**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'MSG'
tài liệu: luật tiền khi sửa đơn và ba tầng khoá (v7)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
git push origin main
```

---

## Rà soát trước khi bàn giao

Sau khi cả 7 task xong, kiểm lại các luật mà spec nói là "sai là mất tiền thật":

- [ ] `npm test` xanh toàn bộ, đặc biệt `line-pricing`, `order-status`, `money`, `cny-deduct`, `cny-wallet`.
- [ ] Sửa mỗi tên món **ba lần liên tiếp** → `quoted_total_vnd`, `goods_total_cny`, `margin_vnd` không đổi một đồng.
- [ ] Sau **mỗi** loại sửa (số lượng, giá thu, Tổng, tỷ giá): Σ giá bán các dòng = `quoted_total_vnd`, không lệch 1₫.
- [ ] Sửa tỷ giá của đơn `khach_chot` → Total ghim, `goods_total_cny` × tỷ giá mới + lời mới = Total.
- [ ] Đơn `da_mua_tq` → không sửa được tỷ giá; sửa số lượng thì có đúng một dòng `dieu_chinh` mới trong ví ¥.
- [ ] Đơn `hoan_tat` → sửa được tên khách và tên món, KHÔNG sửa được số lượng/giá/Tổng.
- [ ] Gắn khách cho đơn chưa có khách → cờ "Thiếu thông tin khách" ở Tổng quan giảm đi 1.
- [ ] Console không có lỗi hydration ở tab Món (nút Sửa nằm trong `trailing`, không phải click cả dòng).
- [ ] Mọi ô nhập trong các sheet mới đều `16px`.
- [ ] `initial.sellVnd` ở page.tsx tính bằng `order.exchangeRate` (không phải
  biến `sellRate`) — lệch tỷ giá giữa client và server sẽ làm
  `updateOrderItemFields` tưởng nhầm giá vừa đổi và tính lại tiền vô cớ.
