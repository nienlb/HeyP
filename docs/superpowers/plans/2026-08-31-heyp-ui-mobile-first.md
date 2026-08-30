# HeyP v5 — Giao diện mobile-first: kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Viết lại tầng trình bày của HeyP theo hướng mobile-first cho iPhone 15 Pro / Pro Max, kèm ba việc bổ sung (nhập nhanh từ ảnh, sao lưu bằng tay, nhập kho chủ động) và vá một lỗi trừ ví ¥ không idempotent.

**Architecture:** Hệ token CSS mới viết mobile-first (`@media (min-width: 900px)` mới mở ra desktop), một bộ primitive dùng chung (`Sheet`, `Chip`, `StickyBar`, `ListRow`) mà mọi màn dựa vào, và khung điều hướng gồm header dính đỉnh + tabbar 5 ô. Route, server action và công thức tiền giữ nguyên; ngoại lệ duy nhất là hàm thuần `shouldDeductCny` thêm vào `src/lib/cny-wallet.ts`.

**Tech Stack:** Next.js 15 App Router · React 19 · TypeScript · CSS thuần (không framework UI) · Postgres/Supabase qua Drizzle · `node:test` built-in.

**Spec:** `docs/superpowers/specs/2026-08-31-heyp-ui-mobile-first-design.md` (commit `ceb18c0`)

## Global Constraints

Mọi task đều phải tuân thủ, không nhắc lại trong từng task:

- **UI tiếng Việt.** Đơn vị tiền VND (₫), tệ (¥).
- **Commit message tiếng Việt**, kết thúc bằng `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **CSS thuần.** Không thêm Tailwind hay bất kỳ framework UI nào.
- **Mobile-first.** Luật gốc viết cho điện thoại; chỉ dùng `@media (min-width: 900px)` để mở rộng. **Không** thêm luật `max-width` mới.
- **Mọi `input` / `select` / `textarea` dùng `font-size: var(--fs-3)` (16px).** Dưới 16px là Safari iOS tự phóng to trang. Không dùng `maximum-scale=1` hay `user-scalable=no`.
- **Mọi phần tử bấm được tối thiểu 44×44pt.**
- **Số tiền dùng `font-variant-numeric: tabular-nums`, căn phải.**
- **Không đụng công thức tiền:** `src/lib/money.ts`, `line-pricing.ts`, `inventory.ts`, `pnl.ts`, `order-status.ts` giữ nguyên. Ngoại lệ duy nhất là Task 1 (thêm hàm vào `cny-wallet.ts`) và Task 13 (thêm trường vào `settings.ts`).
- **SQL thô dùng placeholder `?`** (lớp `Exec` tự đổi sang `$1,$2`). Trong `withTx` **phải** dùng `x` được truyền vào, không dùng `raw` toàn cục.
- **Alias camelCase trong SQL thô phải bọc nháy kép** (`AS "orderType"`).
- **`SUM()`/`COUNT()` trên cột `integer` phải ép `::int`.**
- **Route đụng DB chạy runtime Node**, không Edge.
- **Test import module bằng đuôi `.ts` tường minh** (`../src/lib/money.ts`). Module dùng cho test không được import file có alias `@/`.
- Sau mỗi task: `npm test` xanh và `npx tsc --noEmit` sạch.
- Chạy dev **không** dùng lệnh shell — dùng công cụ preview của harness (`.claude/launch.json`, cấu hình tên `dev`).

## File Structure

**Tạo mới**

| File | Trách nhiệm |
|---|---|
| `src/styles/tokens.css` | biến màu, thang chữ, thang khoảng cách, bo góc, đổ bóng |
| `src/styles/base.css` | reset, `html`/`body`, typography gốc, quy tắc số tabular |
| `src/styles/layout.css` | app shell, header, tabbar, sheet, thanh dính đáy |
| `src/styles/components.css` | button, field, chip, card, badge, list-row |
| `src/styles/screens.css` | luật riêng của từng màn |
| `src/app/_components/sheet.tsx` | bottom sheet (mobile) / modal giữa màn (desktop) |
| `src/app/_components/chip.tsx` | chip lọc, cuộn ngang |
| `src/app/_components/sticky-bar.tsx` | thanh dính đáy có safe-area |
| `src/app/_components/list-row.tsx` | một dòng danh sách chạm được |
| `src/app/_components/screen-header.tsx` | header dính đỉnh + nút quay lại |
| `src/app/orders/new/customer-sheet.tsx` | sheet chọn/tạo khách |
| `src/app/orders/new/item-sheet.tsx` | sheet thêm/sửa một món |
| `src/app/orders/new/quick-import-sheet.tsx` | sheet nhập nhanh từ ảnh (thay `zalo-dropzone.tsx`) |
| `src/app/orders/[id]/order-tabs.tsx` | 4 tab của màn chi tiết đơn |
| `src/app/inventory/stock-in-sheet.tsx` | sheet nhập kho chủ động |
| `src/app/api/backup/route.ts` | xuất toàn bộ bảng ra JSON |
| `scripts/restore-from-json.ts` | nạp ngược bản sao lưu |
| `scripts/make-pwa-icons.ts` | sinh icon PWA bằng `sharp` |
| `public/manifest.webmanifest` | manifest PWA |
| `tests/cny-deduct.test.ts` | test luật trừ ví ¥ |

**Sửa**

`src/app/layout.tsx` · `src/app/globals.css` · `src/lib/cny-wallet.ts` · `src/lib/settings.ts` · `src/lib/photos.ts` · `src/lib/zalo-extract.ts` · `src/db/queries.ts` · `src/app/_components/{app-shell,sidebar,mobile-nav,nav-links,nav-config}.tsx` · toàn bộ `src/app/**/page.tsx` · `src/app/orders/new/*` · `src/app/orders/[id]/*` · `src/app/inventory/*` · `tests/settings.test.ts`

**Xoá**

`.github/workflows/db-backup.yml` · `src/app/orders/new/zalo-dropzone.tsx` (thay bằng `quick-import-sheet.tsx`)

---

## Task 1: Luật trừ ví ¥ idempotent

Lỗi hiện tại, hai biểu hiện cùng một gốc:

1. Đơn `nhap_kho` được tạo thẳng ở `da_mua_tq` (`queries.ts:230`, qua `initialStatus`), trong khi dòng `chi` chỉ ghi khi **chuyển tới** `da_mua_tq` (`queries.ts:841`). Nhập kho tiêu ¥ thật mà ví không bị trừ.
2. `order_ho` đi `da_mua_tq → su_co → da_mua_tq` trừ ví **hai lần** cho cùng một lô hàng.

**Files:**
- Modify: `src/lib/cny-wallet.ts` (thêm vào cuối file)
- Modify: `src/db/queries.ts` — `createOrder` (quanh dòng 202–250) và `changeOrderStatus` (quanh dòng 838–847)
- Test: `tests/cny-deduct.test.ts` (tạo mới)

**Interfaces:**
- Consumes: `OrderType` từ `src/lib/order-status.ts`
- Produces: `shouldDeductCny(input: CnyDeductInput): boolean` và `type CnyDeductInput` xuất từ `src/lib/cny-wallet.ts`. Không task nào khác dùng.

**Lưu ý về `orderType`:** tham số này trông thừa vì `ban_tu_kho` hôm nay không thể tới `da_mua_tq`. Giữ lại có chủ đích: đơn `ban_tu_kho` lưu **VND** trong cột `goods_total_cny` với `exchange_rate = 1`, nên nếu trục trạng thái đổi trong tương lai mà thiếu chốt chặn này thì hệ thống sẽ trừ một khoản ¥ khổng lồ và sai hoàn toàn.

- [ ] **Bước 1: Viết test thất bại**

Tạo `tests/cny-deduct.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldDeductCny } from "../src/lib/cny-wallet.ts";

test("đơn order hộ vừa tới 'đã mua' → trừ ví", () => {
  assert.equal(
    shouldDeductCny({
      orderType: "order_ho",
      toStatus: "da_mua_tq",
      goodsTotalCny: 320,
      alreadyDeducted: false,
    }),
    true,
  );
});

test("đơn nhập kho cũng trừ ví — đây là lỗ cũ đang vá", () => {
  assert.equal(
    shouldDeductCny({
      orderType: "nhap_kho",
      toStatus: "da_mua_tq",
      goodsTotalCny: 500,
      alreadyDeducted: false,
    }),
    true,
  );
});

test("đã trừ rồi thì không trừ lần hai (sự cố rồi quay lại)", () => {
  assert.equal(
    shouldDeductCny({
      orderType: "order_ho",
      toStatus: "da_mua_tq",
      goodsTotalCny: 320,
      alreadyDeducted: true,
    }),
    false,
  );
});

test("chưa nhập giá ¥ thì không ghi dòng chi vô nghĩa", () => {
  assert.equal(
    shouldDeductCny({
      orderType: "order_ho",
      toStatus: "da_mua_tq",
      goodsTotalCny: 0,
      alreadyDeducted: false,
    }),
    false,
  );
});

test("trạng thái khác 'đã mua' thì không đụng ví", () => {
  assert.equal(
    shouldDeductCny({
      orderType: "order_ho",
      toStatus: "da_giao_khach",
      goodsTotalCny: 320,
      alreadyDeducted: false,
    }),
    false,
  );
});

test("đơn bán từ kho không bao giờ trừ ví ¥ — cột goods_total_cny của nó là VND", () => {
  assert.equal(
    shouldDeductCny({
      orderType: "ban_tu_kho",
      toStatus: "da_mua_tq",
      goodsTotalCny: 1_200_000,
      alreadyDeducted: false,
    }),
    false,
  );
});
```

- [ ] **Bước 2: Chạy test để chắc nó đỏ**

```bash
node --test tests/cny-deduct.test.ts
```

Kỳ vọng: FAIL — `shouldDeductCny` chưa tồn tại.

- [ ] **Bước 3: Viết hàm thuần**

Thêm vào cuối `src/lib/cny-wallet.ts` (và thêm `import type { OrderStatus, OrderType } from "./order-status";` vào đầu file, cạnh import `LedgerKind` sẵn có):

```ts
export type CnyDeductInput = {
  orderType: OrderType;
  /** Trạng thái đơn VỪA đạt tới — dù do tạo mới hay do chuyển bước. */
  toStatus: OrderStatus;
  goodsTotalCny: number;
  /** Đơn này đã có dòng 'chi' trong sổ ¥ chưa. */
  alreadyDeducted: boolean;
};

/**
 * Có ghi dòng 'chi' vào sổ ¥ cho đơn này không.
 *
 * Một nguồn chân lý duy nhất cho CẢ hai đường: đơn tạo thẳng ở 'da_mua_tq'
 * (nhap_kho) và đơn chuyển bước tới 'da_mua_tq' (order_ho). Trước đây chỉ
 * đường thứ hai trừ ví, nên nhập kho không bao giờ bị trừ; và đường thứ hai
 * không kiểm trùng, nên 'sự cố rồi quay lại' trừ hai lần.
 *
 * `ban_tu_kho` bị chặn cứng: cột goods_total_cny của nó chứa VND
 * (exchange_rate = 1), trừ ví theo số đó sẽ sai một trời một vực.
 */
export function shouldDeductCny(input: CnyDeductInput): boolean {
  if (input.orderType === "ban_tu_kho") return false;
  if (input.toStatus !== "da_mua_tq") return false;
  if (!(input.goodsTotalCny > 0)) return false;
  return !input.alreadyDeducted;
}
```

- [ ] **Bước 4: Chạy test để chắc nó xanh**

```bash
node --test tests/cny-deduct.test.ts
```

Kỳ vọng: PASS, 6/6.

- [ ] **Bước 5: Nối vào `changeOrderStatus`**

Trong `src/db/queries.ts`, thay khối `if (to === "da_mua_tq" && order.goods_total_cny > 0) { ... }` (quanh dòng 838) bằng:

```ts
    // Đã mua hàng TQ → trừ ví ¥ và CHỐT CỨNG giá vốn tại thời điểm này.
    // Nạp ¥ đợt sau rẻ hơn không được làm đổi lãi/lỗ của đơn đã mua rồi.
    const deducted = await x.get<{ one: number }>(
      "SELECT 1 AS one FROM cny_ledger WHERE order_id = ? AND kind = 'chi' LIMIT 1",
      [id],
    );
    if (
      shouldDeductCny({
        orderType: order.order_type,
        toStatus: to,
        goodsTotalCny: order.goods_total_cny,
        alreadyDeducted: Boolean(deducted),
      })
    ) {
      const rate = Math.round(currentRate(await listLedger()));
      await x.run(
        `INSERT INTO cny_ledger (kind, cny_delta, rate_snapshot, order_id, note)
         VALUES ('chi', ?, ?, ?, ?)`,
        [-order.goods_total_cny, rate, id, `Mua hàng đơn #${id}`],
      );
    }
```

Thêm `shouldDeductCny` vào import từ `@/lib/cny-wallet` ở đầu file (đã import `currentRate` từ đó).

- [ ] **Bước 6: Nối vào `createOrder`**

Trong `createOrder`, **trước** dòng `return withTx(async (x) => {`, tính sẵn tỷ giá — `listLedger()` dùng `raw` toàn cục nên gọi nó bên trong `withTx` sẽ chạy ngoài transaction:

```ts
  // Tính TRƯỚC khi mở transaction: listLedger() dùng `raw` toàn cục, gọi bên
  // trong withTx thì câu đó chạy ngoài transaction, không rollback theo.
  const startStatusForCny = initialStatus(input.orderType);
  const willDeductCny = shouldDeductCny({
    orderType: input.orderType,
    toStatus: startStatusForCny,
    goodsTotalCny,
    // Đơn mới tinh, chưa thể có dòng sổ nào.
    alreadyDeducted: false,
  });
  const cnyRateSnapshot = willDeductCny
    ? Math.round(currentRate(await listLedger()))
    : 0;
```

Rồi bên trong `withTx`, ngay **sau** khi vòng lặp chèn `order_items` chạy xong (để `orderId` đã có), thêm:

```ts
    // Đơn nhap_kho sinh ra thẳng ở 'da_mua_tq' nên không bao giờ đi qua
    // changeOrderStatus — nếu không ghi ở đây thì ví ¥ không bao giờ bị trừ.
    if (willDeductCny) {
      await x.run(
        `INSERT INTO cny_ledger (kind, cny_delta, rate_snapshot, order_id, note)
         VALUES ('chi', ?, ?, ?, ?)`,
        [-goodsTotalCny, cnyRateSnapshot, orderId, `Mua hàng đơn #${orderId}`],
      );
    }
```

Thêm `shouldDeductCny`, `currentRate`, `listLedger` vào phạm vi nếu chưa có.

- [ ] **Bước 7: Chạy toàn bộ test và typecheck**

```bash
npm test && npx tsc --noEmit
```

Kỳ vọng: mọi test xanh (kể cả `cny-wallet.test.ts`, `money.test.ts`, `order-status.test.ts`), tsc không báo lỗi.

- [ ] **Bước 8: Commit**

```bash
git add src/lib/cny-wallet.ts src/db/queries.ts tests/cny-deduct.test.ts
git commit -m "$(cat <<'MSG'
nghiệp vụ: trừ ví ¥ đúng một lần, kể cả đơn nhập kho

Đơn nhap_kho tạo thẳng ở 'da_mua_tq' nên không bao giờ qua
changeOrderStatus — ví ¥ không hề bị trừ. Đơn order_ho đi
'đã mua → sự cố → đã mua' thì bị trừ hai lần.

Tách luật ra hàm thuần shouldDeductCny và cho cả hai đường gọi chung.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Task 2: Hệ token và tách `globals.css`

**Chiến lược di trú, đọc kỹ trước khi làm.** Không xoá CSS cũ trong task này. `globals.css` sẽ `@import` các file mới **trước** rồi `legacy.css` **sau cùng**, để luật cũ vẫn thắng ở những màn chưa di trú. Mỗi task màn về sau sẽ xoá phần legacy của riêng nó. Task 18 xoá `legacy.css` và xác nhận nó rỗng.

Hệ quả: các token cũ (`--card`, `--brand-hover`, `--font-display`) phải được giữ làm alias tạm trong `tokens.css`, nếu không mọi luật cũ tham chiếu chúng sẽ vỡ ngay.

**Files:**
- Create: `src/styles/tokens.css`, `src/styles/base.css`, `src/styles/layout.css`, `src/styles/components.css`, `src/styles/screens.css`, `src/styles/legacy.css`
- Modify: `src/app/globals.css` (còn lại chỉ các `@import`)

**Interfaces:**
- Produces: toàn bộ biến CSS mà mọi task sau dùng — `--fs-1…6`, `--sp-1…7`, `--radius`, `--radius-sm`, `--radius-pill`, `--header-h`, `--tabbar-h`, `--tap`, `--sat`, `--sab`, `--brand*`, `--bg`, `--surface`, `--surface-2`, `--border`, `--border-strong`, `--text`, `--muted`, `--text-subtle`, `--danger*`, `--warning*`, `--success*`, `--shadow-sm/md/lg`. Và lớp tiện ích `.num`.

- [ ] **Bước 1: Chuyển toàn bộ nội dung cũ sang `legacy.css`**

```bash
git mv src/app/globals.css src/styles/legacy.css
```

Rồi **xoá khối `:root { ... }` ở đầu `src/styles/legacy.css`** (dòng 1–48 của file cũ, từ `:root {` tới `}` đóng ngay trước `* { box-sizing: border-box; }`). Token mới sẽ định nghĩa lại chúng với giá trị khác; để lại bản cũ là nền giấy ấm sẽ thắng và thiết kế mới không có tác dụng.

- [ ] **Bước 2: Viết `src/styles/tokens.css`**

```css
/* Thang tỷ lệ và bảng màu HeyP v5 — mobile-first.
   Thang chữ: cơ số 16px, tỷ lệ 1.2. Thang khoảng cách: lưới 4pt. */
:root {
  /* Thương hiệu — navy từ logo HeyP, màu nhận diện DUY NHẤT */
  --brand: #0e5a87;
  --brand-strong: #0a4468;
  --brand-deep: #0a3d5c;
  --brand-tint: #e8f1f7;
  --brand-tint-2: #d3e5f1;
  --on-brand: #ffffff;

  /* Trung tính lạnh — thay nền giấy ấm của v2 */
  --bg: #f4f6f8;
  --surface: #ffffff;
  --surface-2: #eef1f5;
  --border: #e3e8ee;
  --border-strong: #cfd7e0;
  --text: #10161f;
  --muted: #5b6673;
  --text-subtle: #8b949f;

  /* Ngữ nghĩa — giữ nguyên giá trị v2, trạng thái đơn đã neo vào */
  --danger: #dc2a25;
  --danger-tint: #fef2f2;
  --danger-border: #fecdca;
  --warning: #b7791f;
  --warning-tint: #fff7e6;
  --warning-border: #fedf89;
  --success: #1f9d57;
  --success-tint: #eaf7ef;
  --success-border: #a6f4c5;

  /* Thang chữ — sáu bậc, KHÔNG thêm bậc thứ bảy */
  --fs-1: 11px; /* nhãn tab, badge */
  --fs-2: 13px; /* chú thích, nhãn phụ */
  --fs-3: 16px; /* thân chữ VÀ mọi ô nhập — dưới 16px là iOS tự zoom */
  --fs-4: 19px; /* tiêu đề thẻ, số tiền trong dòng */
  --fs-5: 23px; /* tiêu đề màn */
  --fs-6: 28px; /* tổng tiền thanh đáy, số lớn Tổng quan */

  /* Thang khoảng cách — lưới 4pt */
  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-5: 24px;
  --sp-6: 32px;
  --sp-7: 48px;

  --radius: 14px;
  --radius-sm: 10px;
  --radius-pill: 999px;

  --shadow-sm: 0 1px 2px rgba(16, 32, 43, 0.06);
  --shadow-md: 0 6px 20px rgba(16, 32, 43, 0.1);
  --shadow-lg: 0 -8px 32px rgba(16, 32, 43, 0.12);

  /* Khung màn hình */
  --header-h: 52px;
  --tabbar-h: 56px;
  --tap: 44px; /* vùng chạm tối thiểu theo Apple HIG */

  /* Safe area — giá trị dự phòng 0px cho trình duyệt không hỗ trợ */
  --sat: env(safe-area-inset-top, 0px);
  --sab: env(safe-area-inset-bottom, 0px);

  /* ---- Alias TẠM cho CSS cũ. Task 18 xoá cả khối này. ---- */
  --card: var(--surface);
  --brand-hover: var(--brand-strong);
  --accent: var(--brand);
  --accent-strong: var(--brand-strong);
  --accent-tint: var(--brand-tint);
  --font-display: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
```

- [ ] **Bước 3: Viết `src/styles/base.css`**

```css
* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--text);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, sans-serif;
  font-size: var(--fs-3);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  /* Chặn kéo ngang cả trang; nội dung rộng tự cuộn trong khung của nó. */
  overflow-x: hidden;
}

a {
  color: var(--brand);
}

/* Mọi ô nhập PHẢI ≥16px — dưới ngưỡng này Safari iOS tự phóng to trang
   mỗi lần chạm vào ô. Đây là luật gốc, đừng ghi đè ở bất cứ đâu. */
input,
select,
textarea,
button {
  font-family: inherit;
  font-size: var(--fs-3);
}

/* Số tiền: luôn tabular để cột số thẳng hàng khi đọc lướt. */
.num,
.money {
  font-variant-numeric: tabular-nums;
  text-align: right;
}

/* Ký hiệu tiền mờ hơn chữ số một bậc. */
.cur {
  color: var(--text-subtle);
  font-size: 0.85em;
  margin-left: 0.15em;
}

h1 {
  font-size: var(--fs-5);
  margin: 0 0 var(--sp-4);
}
h2 {
  font-size: var(--fs-4);
  margin: 0 0 var(--sp-3);
}
```

- [ ] **Bước 4: Tạo ba file còn lại rỗng có chú thích**

`src/styles/layout.css`, `src/styles/components.css`, `src/styles/screens.css` — mỗi file một dòng chú thích nói nó chứa gì (theo bảng File Structure ở đầu kế hoạch). Các task sau sẽ đổ nội dung vào.

- [ ] **Bước 5: Viết `src/app/globals.css` mới**

```css
/* Thứ tự import có ý nghĩa: legacy.css đứng CUỐI để luật cũ vẫn thắng ở
   những màn chưa di trú sang hệ mới. Mỗi task màn xoá dần phần legacy của
   nó; Task 18 xoá hẳn file legacy.css. */
@import "../styles/tokens.css";
@import "../styles/base.css";
@import "../styles/layout.css";
@import "../styles/components.css";
@import "../styles/screens.css";
@import "../styles/legacy.css";
```

- [ ] **Bước 6: Kiểm bằng preview**

Mở preview bằng công cụ của harness: `preview_start` với `{ name: "dev" }`. Đặt khổ máy bằng `resize_window` `{ preset: "mobile", width: 393, height: 852 }`. Vào `/orders`, chụp màn hình.

Kỳ vọng: **trang vẫn dùng được, chỉ đổi tông màu** — nền xám lạnh thay nền giấy ấm, tiêu đề không còn serif nghiêng. Bố cục chưa đổi (đó là việc của các task sau). Nếu có màn trắng bốc hoặc mất hoàn toàn định dạng thì `@import` sai đường dẫn hoặc khối `:root` cũ chưa được xoá khỏi `legacy.css`.

Kiểm thêm bằng `read_console_messages` `{ onlyErrors: true }`: không có lỗi.

- [ ] **Bước 7: Typecheck và commit**

```bash
npx tsc --noEmit && npm test
```

```bash
git add -A src/styles src/app/globals.css
git commit -m "$(cat <<'MSG'
giao diện: hệ token mới và tách globals.css thành src/styles

Thang chữ cơ số 16px tỷ lệ 1.2, thang khoảng cách lưới 4pt, bảng màu
trung tính lạnh giữ navy thương hiệu. Ô nhập 16px để Safari iOS thôi
tự phóng to trang.

CSS cũ chuyển sang legacy.css và import sau cùng để màn chưa di trú
vẫn chạy; các task sau xoá dần.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Task 3: Viewport, safe-area và PWA

**Files:**
- Modify: `src/app/layout.tsx`
- Create: `public/manifest.webmanifest`, `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png`
- Create: `scripts/make-pwa-icons.ts`

**Interfaces:**
- Produces: biến `--sat` / `--sab` (đã có từ Task 2) trở nên **thật sự có giá trị** nhờ `viewportFit: "cover"`. Mọi task sau dựa vào điều này.

- [ ] **Bước 1: Thêm `viewport` vào `src/app/layout.tsx`**

```tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HeyP — Quản lý đơn order hộ",
  description: "Hệ thống quản lý đơn order hộ Trung Quốc",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "HeyP",
    statusBarStyle: "default",
  },
};

/**
 * `viewportFit: "cover"` là thứ làm env(safe-area-inset-*) có giá trị thật.
 * Thiếu nó thì mọi tính toán safe-area trong CSS đều ra 0 và tabbar nằm
 * dưới thanh home indicator của iPhone.
 *
 * KHÔNG đặt maximumScale/userScalable — chặn zoom là tước quyền phóng to
 * của người dùng. Chống zoom-khi-gõ đã xử lý bằng cỡ chữ 16px ở base.css.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0e5a87",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Bước 2: Viết `public/manifest.webmanifest`**

```json
{
  "name": "HeyP — Quản lý đơn order hộ",
  "short_name": "HeyP",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#f4f6f8",
  "theme_color": "#0e5a87",
  "lang": "vi",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

- [ ] **Bước 3: Viết `scripts/make-pwa-icons.ts`**

`sharp` đã có sẵn trong `dependencies`. Chưa có `public/logo.png` nên sinh icon chữ; thay logo thật sau chỉ là ghi đè ba file PNG, không đụng code.

```ts
/**
 * Sinh icon PWA từ một SVG chữ. Chạy lại khi có logo thật:
 *   node --experimental-strip-types scripts/make-pwa-icons.ts
 */
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const svg = (size: number) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="#0e5a87"/>
  <text x="50%" y="50%" dy="0.35em" text-anchor="middle"
        font-family="system-ui, -apple-system, Helvetica, Arial, sans-serif"
        font-size="${Math.round(size * 0.3)}" font-weight="700" fill="#ffffff"
  >HeyP</text>
</svg>`;

for (const [size, name] of [
  [192, "icon-192.png"],
  [512, "icon-512.png"],
  [180, "apple-touch-icon.png"],
] as const) {
  const png = await sharp(Buffer.from(svg(size))).png().toBuffer();
  await writeFile(new URL(`../public/${name}`, import.meta.url), png);
  console.log(`đã sinh public/${name}`);
}
```

- [ ] **Bước 4: Chạy script và xác nhận ba file PNG ra đời**

```bash
node --experimental-strip-types scripts/make-pwa-icons.ts && ls -lh public/
```

Kỳ vọng: ba file `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` với kích thước khác 0.

- [ ] **Bước 5: Kiểm manifest nạp được**

Preview đang chạy (từ Task 2) thì tải lại; chưa chạy thì `preview_start` `{ name: "dev" }`. Dùng `read_network_requests` `{ urlPattern: "manifest" }`.

Kỳ vọng: `/manifest.webmanifest` trả 200, không phải 404. Dùng `read_network_requests` với `requestId` để xem nội dung khớp file vừa viết.

- [ ] **Bước 6: Commit**

```bash
git add src/app/layout.tsx public scripts/make-pwa-icons.ts
git commit -m "$(cat <<'MSG'
giao diện: viewport-fit=cover và manifest PWA

Thiếu viewport-fit=cover thì env(safe-area-inset-*) luôn ra 0 và tabbar
nằm dưới thanh home indicator. Kèm manifest + icon để cài ra màn hình
chính iPhone, lấy lại phần chiều cao mà thanh Safari đang chiếm.

Icon tạm là chữ trên nền navy; có logo.png thật thì chạy lại
scripts/make-pwa-icons.ts, không phải sửa code.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Task 4: Primitive dùng chung

Bốn component này là nền của mọi màn còn lại. Làm cẩn thận ở đây thì mười task sau chỉ còn là lắp ghép.

**Files:**
- Create: `src/app/_components/sheet.tsx`, `chip.tsx`, `sticky-bar.tsx`, `list-row.tsx`, `screen-header.tsx`
- Modify: `src/styles/layout.css`, `src/styles/components.css`

**Interfaces:**
- Produces, mọi task sau dùng đúng các chữ ký này:
  - `<Sheet open: boolean, title: string, onClose: () => void, footer?: ReactNode, children: ReactNode />`
  - `<Chip active: boolean, href: string, label: string, count?: number />`
  - `<ChipBar children: ReactNode />`
  - `<StickyBar children: ReactNode />`
  - `<ListRow href?: string, onClick?: () => void, title: ReactNode, meta?: ReactNode, amount?: ReactNode, trailing?: ReactNode />`
  - `<ScreenHeader title: string, backHref?: string, action?: ReactNode />`

- [ ] **Bước 1: Viết `src/app/_components/sheet.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

/**
 * Bottom sheet — nơi diễn ra mọi thao tác phụ của app.
 *
 * Trên mobile trượt lên từ đáy; từ 900px trở lên CSS biến nó thành modal
 * giữa màn hình (cùng component, khác vị trí — xem layout.css).
 *
 * Đóng được bằng ba cách: chạm nền, vuốt xuống quá 100px, hoặc Esc.
 */
export function Sheet({
  open,
  title,
  onClose,
  footer,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const [dragY, setDragY] = useState(0);
  const startY = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Khoá cuộn nền: không có dòng này thì vuốt trong sheet sẽ kéo cả trang.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  // Mở lại phải về đúng chỗ — nếu không sheet giữ nguyên độ lệch của lần
  // vuốt dở dang trước đó và trông như bị tụt.
  useEffect(() => {
    if (open) setDragY(0);
  }, [open]);

  if (!open) return null;

  function down(e: PointerEvent<HTMLDivElement>) {
    startY.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    if (startY.current === null) return;
    setDragY(Math.max(0, e.clientY - startY.current));
  }
  function up() {
    if (startY.current === null) return;
    startY.current = null;
    if (dragY > 100) onClose();
    else setDragY(0);
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={
          dragY
            ? { transform: `translateY(${dragY}px)`, transition: "none" }
            : undefined
        }
      >
        <div
          className="sheet-grab"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        >
          <span className="sheet-grab-bar" />
        </div>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button
            type="button"
            className="sheet-close"
            onClick={onClose}
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}
```

- [ ] **Bước 2: Viết `chip.tsx`, `sticky-bar.tsx`, `list-row.tsx`, `screen-header.tsx`**

`src/app/_components/chip.tsx`:

```tsx
import Link from "next/link";
import type { ReactNode } from "react";

/** Hàng chip lọc, cuộn ngang, dính dưới ô tìm. */
export function ChipBar({ children }: { children: ReactNode }) {
  return <div className="chip-bar">{children}</div>;
}

export function Chip({
  active,
  href,
  label,
  count,
}: {
  active: boolean;
  href: string;
  label: string;
  count?: number;
}) {
  return (
    <Link
      href={href}
      className={`chip${active ? " chip-on" : ""}`}
      aria-current={active ? "page" : undefined}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className="chip-count">{count}</span>
      )}
    </Link>
  );
}
```

`src/app/_components/sticky-bar.tsx`:

```tsx
import type { ReactNode } from "react";

/**
 * Thanh dính đáy. Truyền vào `AppShell bottomBar` thì tabbar tự ẩn — một
 * màn không bao giờ có cả hai, chúng chồng lên nhau.
 */
export function StickyBar({ children }: { children: ReactNode }) {
  return <div className="sticky-bar">{children}</div>;
}
```

`src/app/_components/list-row.tsx`:

```tsx
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Một dòng danh sách chạm được — thay cho mẹo bẻ <table> bằng CSS.
 * Cao tối thiểu 76px để cả dòng là vùng chạm thoải mái.
 */
export function ListRow({
  href,
  onClick,
  title,
  meta,
  amount,
  trailing,
}: {
  href?: string;
  onClick?: () => void;
  title: ReactNode;
  meta?: ReactNode;
  amount?: ReactNode;
  trailing?: ReactNode;
}) {
  const inner = (
    <>
      <span className="lr-main">
        <span className="lr-title">{title}</span>
        {meta && <span className="lr-meta">{meta}</span>}
      </span>
      {amount && <span className="lr-amount num">{amount}</span>}
      {trailing}
    </>
  );
  if (href) {
    return (
      <Link href={href} className="list-row">
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" className="list-row" onClick={onClick}>
      {inner}
    </button>
  );
}
```

`src/app/_components/screen-header.tsx`:

```tsx
import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./icons";

/**
 * Header dính đỉnh. `backHref` là đường dẫn TƯỜNG MINH, không dùng
 * history.back(): ở chế độ standalone (đã cài ra màn hình chính) người dùng
 * có thể mở thẳng một URL sâu và không có gì để lùi về.
 */
export function ScreenHeader({
  title,
  backHref,
  action,
}: {
  title: string;
  backHref?: string;
  action?: ReactNode;
}) {
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
      <span className="sh-action">{action}</span>
    </header>
  );
}
```

- [ ] **Bước 3: Thêm icon `chevron-left` vào `src/app/_components/icons.tsx`**

Mở file, xem một icon sẵn có được khai báo thế nào, rồi thêm `chevron-left` theo đúng khuôn đó (đường dẫn SVG: `M15 18l-6-6 6-6`, `fill="none"` `stroke="currentColor"` `stroke-width="2"` `stroke-linecap="round"` `stroke-linejoin="round"`). Bổ sung `"chevron-left"` vào union `IconName`.

- [ ] **Bước 4: Viết CSS cho các primitive**

Thêm vào `src/styles/layout.css`:

```css
/* ---------- Sheet ---------- */
.sheet-overlay {
  position: fixed;
  inset: 0;
  background: rgba(16, 22, 31, 0.45);
  z-index: 50;
  display: flex;
  align-items: flex-end;
}
.sheet {
  width: 100%;
  max-height: 90dvh;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-radius: 20px 20px 0 0;
  box-shadow: var(--shadow-lg);
  padding-bottom: var(--sab);
  transition: transform 0.2s ease;
}
.sheet-grab {
  padding: var(--sp-3) 0 var(--sp-2);
  display: flex;
  justify-content: center;
  cursor: grab;
  touch-action: none; /* để pointermove không bị trình duyệt nuốt mất */
}
.sheet-grab-bar {
  width: 40px;
  height: 4px;
  border-radius: var(--radius-pill);
  background: var(--border-strong);
}
.sheet-head {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: 0 var(--sp-4) var(--sp-3);
  border-bottom: 1px solid var(--border);
}
.sheet-head h2 {
  flex: 1;
  margin: 0;
  font-size: var(--fs-4);
}
.sheet-close {
  width: var(--tap);
  height: var(--tap);
  border: none;
  background: none;
  color: var(--muted);
  cursor: pointer;
}
.sheet-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--sp-4);
}
.sheet-foot {
  padding: var(--sp-3) var(--sp-4);
  border-top: 1px solid var(--border);
}

/* ---------- Thanh dính đáy ---------- */
.sticky-bar {
  position: fixed;
  inset: auto 0 0 0;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4) calc(var(--sp-3) + var(--sab));
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(20px);
  border-top: 1px solid var(--border);
}

/* ---------- Header màn ---------- */
.screen-header {
  position: sticky;
  top: 0;
  z-index: 25;
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  height: calc(var(--header-h) + var(--sat));
  padding: var(--sat) var(--sp-2) 0;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--border);
}
.sh-back,
.sh-action > * {
  min-width: var(--tap);
  min-height: var(--tap);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--brand);
}
.sh-back-spacer {
  width: var(--tap);
}
.sh-title {
  flex: 1;
  text-align: center;
  font-size: var(--fs-3);
  font-weight: 600;
}
.sh-action {
  min-width: var(--tap);
  display: flex;
  justify-content: flex-end;
}
```

Thêm vào `src/styles/components.css`:

```css
/* ---------- Chip lọc ---------- */
.chip-bar {
  display: flex;
  gap: var(--sp-2);
  overflow-x: auto;
  padding: var(--sp-3) var(--sp-4);
  scrollbar-width: none;
}
.chip-bar::-webkit-scrollbar {
  display: none;
}
.chip {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  min-height: 36px;
  padding: 0 var(--sp-3);
  border-radius: var(--radius-pill);
  border: 1px solid var(--border-strong);
  background: var(--surface);
  color: var(--text);
  font-size: var(--fs-2);
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}
.chip-on {
  background: var(--brand);
  border-color: var(--brand);
  color: var(--on-brand);
}
.chip-count {
  font-variant-numeric: tabular-nums;
  opacity: 0.8;
}

/* ---------- Dòng danh sách ---------- */
.list-row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  width: 100%;
  min-height: 76px;
  padding: var(--sp-3) var(--sp-4);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-bottom: var(--sp-2);
  text-align: left;
  text-decoration: none;
  color: var(--text);
  cursor: pointer;
  font-size: var(--fs-3);
}
.lr-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}
.lr-title {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lr-meta {
  font-size: var(--fs-2);
  color: var(--muted);
}
.lr-amount {
  font-size: var(--fs-4);
  font-weight: 600;
  white-space: nowrap;
}
```

- [ ] **Bước 5: Kiểm bằng preview**

Các primitive chưa được màn nào dùng nên chưa nhìn thấy được. Chỉ cần chắc không có gì vỡ: `npx tsc --noEmit` sạch, và preview vào `/orders` vẫn hiện bình thường, `read_console_messages` `{ onlyErrors: true }` không có lỗi.

- [ ] **Bước 6: Commit**

```bash
git add src/app/_components src/styles
git commit -m "$(cat <<'MSG'
giao diện: primitive Sheet, Chip, StickyBar, ListRow, ScreenHeader

Sheet là nền của mọi thao tác phụ về sau — đóng bằng chạm nền, vuốt
xuống, hoặc Esc; khoá cuộn nền khi mở. ScreenHeader nhận backHref
tường minh chứ không history.back(), vì ở chế độ standalone có thể
không có gì để lùi về.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Task 5: Khung điều hướng mới

**Files:**
- Modify: `src/app/_components/app-shell.tsx`, `mobile-nav.tsx`, `nav-config.ts`, `sidebar.tsx`
- Modify: `src/styles/layout.css`
- Modify: `src/styles/legacy.css` (xoá khối nav cũ)

**Interfaces:**
- Consumes: `ScreenHeader` từ Task 4.
- Produces: chữ ký `AppShell` mới mà **mọi trang** phải theo:

```tsx
<AppShell
  username={string}
  title={string}
  backHref?={string}
  action?={ReactNode}
  bottomBar?={ReactNode}   // có bottomBar thì tabbar tự ẩn
>
```

- [ ] **Bước 1: Sửa `nav-config.ts`**

Tabbar 5 ô chỉ còn bốn chỗ cho mục điều hướng (ba mục + nút Thêm), nên Khách hàng xuống nhóm phụ:

```ts
/** Mục chính — sidebar (desktop) và ba ô đầu của tabbar (mobile). */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Tổng quan", icon: "dashboard" },
  { href: "/orders", label: "Đơn", icon: "orders" },
  { href: "/inventory", label: "Kho", icon: "inventory" },
];

/** Mục phụ — sidebar hiện thêm; mobile gom vào sheet "Thêm". */
export const MORE_ITEMS: NavItem[] = [
  { href: "/customers", label: "Khách hàng", icon: "customers" },
  { href: "/tracking", label: "Tracking", icon: "tracking" },
  { href: "/finance", label: "Tài chính", icon: "finance" },
  { href: "/reports", label: "Báo cáo", icon: "reports" },
  { href: "/settings", label: "Cài đặt", icon: "settings" },
  { href: "/backup", label: "Sao lưu", icon: "backup" },
];
```

`sidebar.tsx` không cần sửa — nó đọc cả hai mảng, Khách hàng chỉ đổi nhóm.

- [ ] **Bước 2: Viết lại `mobile-nav.tsx`**

Xoá `.mobile-top` (thanh chỉ đựng logo) và `.fab` (nút trôi che góc dưới phải). Dùng `Sheet` của Task 4 cho menu "Thêm".

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { logoutAction } from "../actions";
import { NavLinks } from "./nav-links";
import { NAV_ITEMS, MORE_ITEMS } from "./nav-config";
import { Icon } from "./icons";
import { Sheet } from "./sheet";

export function MobileNav({ username }: { username: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <nav className="tabbar">
        <NavLinks items={NAV_ITEMS.slice(0, 2)} variant="tab" />

        {/* Ô giữa LUÔN là tạo đơn — không đổi nghĩa theo màn đang mở.
            Nút nhập kho là nút riêng ở header màn Kho. */}
        <Link href="/orders/new" className="tab-new" aria-label="Tạo đơn">
          <Icon name="plus" size={26} />
        </Link>

        <NavLinks items={NAV_ITEMS.slice(2)} variant="tab" />
        <button className="tab-link" type="button" onClick={() => setOpen(true)}>
          <Icon name="menu" size={22} />
          <span>Thêm</span>
        </button>
      </nav>

      <Sheet open={open} title={username} onClose={() => setOpen(false)}>
        <div className="sheet-menu">
          {MORE_ITEMS.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className="sheet-item"
              onClick={() => setOpen(false)}
            >
              <Icon name={it.icon} size={20} /> {it.label}
            </Link>
          ))}
          <form action={logoutAction}>
            <button className="sheet-item" type="submit">
              <Icon name="logout" size={20} /> Đăng xuất
            </button>
          </form>
        </div>
      </Sheet>
    </>
  );
}
```

- [ ] **Bước 3: Viết lại `app-shell.tsx`**

```tsx
import type { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";
import { ScreenHeader } from "./screen-header";
import { getLogoUrl } from "@/lib/logo";

export function AppShell({
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
  return (
    <div className={`app-shell${bottomBar ? " has-bottom-bar" : ""}`}>
      <Sidebar username={username} logoUrl={logoUrl} />
      <ScreenHeader title={title} backHref={backHref} action={action} />
      <main className="app-main">
        <h1 className="screen-title">{title}</h1>
        {children}
      </main>
      {bottomBar ?? <MobileNav username={username} />}
    </div>
  );
}
```

Tiêu đề lớn `h1.screen-title` nằm **trong** nội dung và cuộn đi mất; header dính đỉnh giữ bản nhỏ. Đó là kiểu iOS, và tránh đọc thấy tiêu đề hai lần.

- [ ] **Bước 4: CSS khung**

Thêm vào `src/styles/layout.css`:

```css
.app-main {
  padding: var(--sp-4);
  /* Chừa chỗ cho tabbar; màn có thanh dính đáy ghi đè bên dưới. */
  padding-bottom: calc(var(--tabbar-h) + var(--sab) + var(--sp-5));
}
.app-shell.has-bottom-bar .app-main {
  padding-bottom: calc(84px + var(--sab) + var(--sp-4));
}
.screen-title {
  font-size: var(--fs-5);
  margin: var(--sp-2) 0 var(--sp-4);
}

.tabbar {
  position: fixed;
  inset: auto 0 0 0;
  z-index: 30;
  display: flex;
  align-items: stretch;
  height: calc(var(--tabbar-h) + var(--sab));
  padding-bottom: var(--sab);
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(20px);
  border-top: 1px solid var(--border);
}
.tab-link {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: var(--tap);
  font-size: var(--fs-1);
  font-weight: 600;
  color: var(--muted);
  text-decoration: none;
  border: none;
  background: none;
  cursor: pointer;
}
.tab-link.active {
  color: var(--brand);
}
.tab-new {
  flex: none;
  width: 52px;
  height: 52px;
  margin: -12px var(--sp-2) 0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--brand);
  color: var(--on-brand);
  box-shadow: var(--shadow-md);
}

.sidebar {
  display: none;
}

.sheet-menu {
  display: flex;
  flex-direction: column;
}
.sheet-item {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  width: 100%;
  min-height: var(--tap);
  padding: var(--sp-3) 0;
  border: none;
  background: none;
  color: var(--text);
  font-size: var(--fs-3);
  text-decoration: none;
  cursor: pointer;
}
```

Trong `src/styles/legacy.css`, **xoá** hai khối nav cũ: khối `/* ---------- AppShell: Sidebar (desktop) ---------- */` và khối `/* ---------- AppShell: Mobile nav ---------- */` cùng mọi `@media (max-width: 767px)` bên trong chúng (khoảng dòng 899–1060 của file gốc). Sidebar desktop dựng lại ở Task 18.

- [ ] **Bước 5: Sửa lời gọi `AppShell` ở mọi trang cho hợp chữ ký mới**

Mười trang đang gọi `<AppShell username={...}>` rồi tự dựng `<div className="page-head"><h1>…</h1></div>`. Với mỗi trang: bỏ khối `page-head`, chuyển tiêu đề lên prop `title`.

| File | `title` |
|---|---|
| `src/app/page.tsx` | `"Tổng quan"` |
| `src/app/orders/page.tsx` | `"Đơn hàng"` |
| `src/app/orders/[id]/page.tsx` | `` `#${order.id}` `` , thêm `backHref="/orders"` |
| `src/app/orders/new/page.tsx` | `"Đơn mới"`, thêm `backHref="/orders"` |
| `src/app/customers/page.tsx` | `"Khách hàng"` |
| `src/app/inventory/page.tsx` | `"Tồn kho"` |
| `src/app/tracking/page.tsx` | `"Tracking"` |
| `src/app/finance/page.tsx` | `"Tài chính"` |
| `src/app/reports/page.tsx` | `"Báo cáo"` |
| `src/app/settings/page.tsx` | `"Cài đặt"` |
| `src/app/backup/page.tsx` | `"Sao lưu"` |

Đây mới chỉ là sửa cho biên dịch được và điều hướng chạy; bố cục từng màn là việc của các task sau.

- [ ] **Bước 6: Kiểm bằng preview**

`preview_start` `{ name: "dev" }`, `resize_window` `{ preset: "mobile", width: 393, height: 852 }`.

Kiểm bốn điều, chụp màn hình làm bằng:

1. Vào `/` — tabbar có đúng 5 ô, nút `+` navy tròn ở giữa nhô lên.
2. **Tabbar không bị thanh home indicator che.** Trong preview, dùng `javascript_tool` chạy `getComputedStyle(document.querySelector('.tabbar')).paddingBottom` — trên máy thật giá trị này khác `0px`; trong preview trình duyệt nó có thể là `0px`, điều đó bình thường vì không có safe area. Điều phải xác nhận ở đây là **luật CSS tồn tại**, chứ không phải giá trị.
3. Chạm "Thêm" — sheet trượt lên, có Khách hàng, Tracking, Tài chính, Báo cáo, Cài đặt, Sao lưu, Đăng xuất. Chạm nền đóng lại.
4. Chạm nút `+` — sang `/orders/new`.

`read_console_messages` `{ onlyErrors: true }`: không lỗi.

- [ ] **Bước 7: Typecheck, test, commit**

```bash
npx tsc --noEmit && npm test
```

```bash
git add -A src/app src/styles
git commit -m "$(cat <<'MSG'
giao diện: tabbar 5 ô với nút tạo đơn ở giữa

Bỏ thanh đỉnh chỉ đựng logo và nút FAB trôi che góc phải. Header mới
dính đỉnh có nút quay lại tường minh cho chế độ standalone. AppShell
nhận thêm title/backHref/action/bottomBar; có bottomBar thì tabbar ẩn.

Khách hàng chuyển xuống nhóm phụ vì tabbar chỉ còn ba chỗ.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Task 6: Sheet chọn khách

Bỏ cặp nút "Khách có sẵn / Khách mới". Người dùng gõ tên; máy tự biết khách đã có hay chưa.

**Files:**
- Create: `src/app/orders/new/customer-sheet.tsx`
- Delete: `src/app/orders/new/customer-block.tsx` (Task 8 gỡ lời gọi cuối cùng)
- Modify: `src/styles/screens.css`

**Interfaces:**
- Consumes: `Sheet` (Task 4), `CustomerOption` từ `./types`.
- Produces:

```tsx
<CustomerSheet
  open={boolean}
  onClose={() => void}
  customers={CustomerOption[]}
  onPick={(pick: CustomerPick) => void}
/>
```

```ts
export type CustomerPick =
  | { mode: "existing"; id: number; name: string }
  | { mode: "new"; name: string };
```

Task 8 giữ `CustomerPick | null` trong state và tự lo phần SĐT/địa chỉ (gập trong màn chính), nên sheet này chỉ lo **tên**.

- [ ] **Bước 1: Viết `customer-sheet.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import { Sheet } from "../../_components/sheet";
import type { CustomerOption } from "./types";

export type CustomerPick =
  | { mode: "existing"; id: number; name: string }
  | { mode: "new"; name: string };

export function CustomerSheet({
  open,
  onClose,
  customers,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  customers: CustomerOption[];
  onPick: (pick: CustomerPick) => void;
}) {
  const [q, setQ] = useState("");

  const needle = q.trim().toLowerCase();
  const matches = useMemo(
    () =>
      needle
        ? customers.filter((c) => c.name.toLowerCase().includes(needle))
        : customers,
    [customers, needle],
  );

  // Chỉ mời tạo mới khi đã gõ gì đó và không có khách nào TRÙNG KHÍT tên.
  // Trùng một phần vẫn mời tạo — "Lan" và "Lan Anh" là hai người.
  const exact = customers.some((c) => c.name.toLowerCase() === needle);
  const canCreate = needle.length > 0 && !exact;

  function pick(p: CustomerPick) {
    onPick(p);
    setQ("");
    onClose();
  }

  return (
    <Sheet open={open} title="Chọn khách" onClose={onClose}>
      <input
        className="sheet-search"
        type="search"
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Gõ tên khách…"
        enterKeyHint="done"
      />

      <div className="sheet-list">
        {canCreate && (
          <button
            type="button"
            className="sheet-item sheet-item-create"
            onClick={() => pick({ mode: "new", name: q.trim() })}
          >
            + Tạo khách mới «{q.trim()}»
          </button>
        )}
        {matches.map((c) => (
          <button
            key={c.id}
            type="button"
            className="sheet-item"
            onClick={() => pick({ mode: "existing", id: c.id, name: c.name })}
          >
            {c.warningFlag && <span className="warn-dot" title="Khách có cờ cảnh báo" />}
            {c.name}
          </button>
        ))}
        {matches.length === 0 && !canCreate && (
          <p className="muted">Chưa có khách nào. Gõ tên để tạo mới.</p>
        )}
      </div>
    </Sheet>
  );
}
```

- [ ] **Bước 2: CSS**

Thêm vào `src/styles/screens.css`:

```css
.sheet-search {
  width: 100%;
  min-height: var(--tap);
  padding: 0 var(--sp-3);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  margin-bottom: var(--sp-3);
}
.sheet-list {
  display: flex;
  flex-direction: column;
}
.sheet-item-create {
  color: var(--brand);
  font-weight: 600;
}
.warn-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--warning);
  margin-right: var(--sp-2);
  flex: none;
}
```

- [ ] **Bước 3: Typecheck**

```bash
npx tsc --noEmit
```

Kỳ vọng: sạch. Component chưa có ai gọi — đó là bình thường, Task 8 nối vào.

- [ ] **Bước 4: Commit**

```bash
git add src/app/orders/new/customer-sheet.tsx src/styles/screens.css
git commit -m "$(cat <<'MSG'
nhập đơn: sheet chọn khách, gõ tên là đủ

Bỏ cặp nút "Khách có sẵn / Khách mới" — máy tự biết khách đã có hay
chưa, không bắt người dùng khai trước. Trùng khít tên mới thôi mời
tạo mới; "Lan" và "Lan Anh" là hai người khác nhau.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Task 7: Sheet thêm/sửa một món

`.item-row` hiện nhồi sáu `input` vào một hàng, trên phone rơi xuống lưới `1fr 1fr` — sáu ô tí hon. Trong sheet mỗi ô một dòng đủ rộng.

**Files:**
- Create: `src/app/orders/new/item-sheet.tsx`
- Modify: `src/styles/screens.css`
- Delete về sau: `src/app/orders/new/items-block.tsx` (Task 8)

**Interfaces:**
- Consumes: `Sheet` (Task 4), `ItemRow` và `emptyItem` từ `./types`.
- Produces:

```tsx
<ItemSheet
  open={boolean}
  onClose={() => void}
  initial={ItemRow | null}   // null = thêm mới
  onSave={(item: ItemRow, addAnother: boolean) => void}
  onDelete={(() => void) | undefined}  // chỉ khi đang sửa
/>
```

- [ ] **Bước 1: Viết `item-sheet.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { Sheet } from "../../_components/sheet";
import { emptyItem, type ItemRow } from "./types";

export function ItemSheet({
  open,
  onClose,
  initial,
  onSave,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  initial: ItemRow | null;
  onSave: (item: ItemRow, addAnother: boolean) => void;
  onDelete?: () => void;
}) {
  const [row, setRow] = useState<ItemRow>(initial ?? { ...emptyItem });

  // Mở lại sheet phải nạp đúng món đang sửa — không có dòng này thì lần mở
  // thứ hai vẫn hiện dữ liệu của lần trước.
  useEffect(() => {
    if (open) setRow(initial ?? { ...emptyItem });
  }, [open, initial]);

  const set = (patch: Partial<ItemRow>) => setRow((r) => ({ ...r, ...patch }));
  const valid = row.name.trim() !== "" && Number(row.quantity) > 0;

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
      {/* Thứ tự theo cách đọc đơn thật: tên → số lượng → giá → chi tiết. */}
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
        <span>Số lượng *</span>
        <input
          inputMode="numeric"
          value={row.quantity}
          onChange={(e) => set({ quantity: e.target.value })}
          enterKeyHint="next"
        />
      </label>

      <label className="field">
        <span>Đơn giá (¥)</span>
        <input
          inputMode="decimal"
          value={row.unitPriceCny}
          onChange={(e) =>
            // Gõ tay = xác nhận giá vốn, không còn là gợi ý của máy.
            set({ unitPriceCny: e.target.value, costConfirmed: true })
          }
          className={row.costConfirmed ? undefined : "cny-suggested"}
          placeholder="Chưa biết thì để trống"
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
        <span>Link sản phẩm</span>
        <input
          type="url"
          inputMode="url"
          value={row.productUrl}
          onChange={(e) => set({ productUrl: e.target.value })}
          enterKeyHint="done"
        />
      </label>
    </Sheet>
  );
}
```

- [ ] **Bước 2: CSS cho `.field` và `.sheet-actions`**

Thêm vào `src/styles/components.css`:

```css
.field {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  margin-bottom: var(--sp-4);
}
.field > span {
  font-size: var(--fs-2);
  font-weight: 600;
  color: var(--muted);
}
.field input,
.field select,
.field textarea {
  min-height: var(--tap);
  padding: 0 var(--sp-3);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  width: 100%;
}
.field textarea {
  padding: var(--sp-3);
  min-height: 88px;
}
.field input:focus,
.field select:focus,
.field textarea:focus {
  outline: 2px solid var(--brand);
  border-color: var(--brand);
}
.sheet-actions {
  display: flex;
  gap: var(--sp-2);
}
.sheet-actions .btn {
  flex: 1;
  min-height: var(--tap);
}
```

- [ ] **Bước 3: Typecheck và commit**

```bash
npx tsc --noEmit
```

```bash
git add src/app/orders/new/item-sheet.tsx src/styles/components.css
git commit -m "$(cat <<'MSG'
nhập đơn: sheet nhập món, mỗi ô một dòng

Thay hàng sáu ô chen chúc bằng sheet đủ rộng, thứ tự theo cách đọc đơn
thật. Nút "Lưu & thêm nữa" để nhập liên tiếp không phải đóng mở lại.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Task 8: Màn tạo đơn kiểu POS

**Files:**
- Modify: `src/app/orders/new/new-order-form.tsx`, `src/app/orders/new/page.tsx`
- Delete: `src/app/orders/new/customer-block.tsx`, `src/app/orders/new/items-block.tsx`, `src/app/orders/new/money-block.tsx`
- Modify: `src/styles/screens.css`

**Interfaces:**
- Consumes: `CustomerSheet` + `CustomerPick` (Task 6), `ItemSheet` (Task 7), `StickyBar` (Task 4), `AppShell` chữ ký mới (Task 5).
- Produces: không có gì cho task sau.

**Giữ nguyên tuyệt đối, chỉ đổi phần render.** Toàn bộ phần tính toán trong `new-order-form.tsx` — `parsedItems`, `validItems`, `goodsTotalCny`, `goodsVnd`, `totalVnd`, `marginVnd`, `money`, `quote`, `canSubmit`, `handleShippingFeeChange`, `applyMoneyPatch`, `applyItemsFromExtract`, `onExtract` — **copy nguyên văn**, không sửa một dòng. Các `<input type="hidden">` (`items`, `customerMode`, `quotedTotalVnd`, `shipStatus`) cũng giữ nguyên: `createOrderAction` đọc chúng.

- [ ] **Bước 1: Thay ba state khách bằng một `CustomerPick`**

Trong `new-order-form.tsx`, bỏ `customerMode`, `customerId`, `newCustomerName` và thay bằng:

```tsx
const [picked, setPicked] = useState<CustomerPick | null>(
  customers[0] ? { mode: "existing", id: customers[0].id, name: customers[0].name } : null,
);
const [customerSheet, setCustomerSheet] = useState(false);
// SĐT/địa chỉ vẫn là state riêng, nằm ở khối gập trong màn chính.
const [newCustomerPhone, setNewCustomerPhone] = useState("");
const [newCustomerAddress, setNewCustomerAddress] = useState("");
```

`applyMoneyPatch` đang set `customerMode` / `newCustomerName` từ kết quả đọc ảnh — sửa hai nhánh đó thành:

```tsx
    if (patch.newCustomerName !== undefined && patch.newCustomerName !== "")
      setPicked({ mode: "new", name: patch.newCustomerName });
```

và **xoá** nhánh `if (patch.customerMode) setCustomerMode(...)` — chế độ giờ suy ra từ `picked.mode`.

`customerName` tính lại thành `const customerName = picked?.name ?? "";`

Ba hidden input tương ứng:

```tsx
<input type="hidden" name="customerMode" value={picked?.mode ?? "new"} />
{picked?.mode === "existing" && (
  <input type="hidden" name="customerId" value={picked.id} />
)}
{picked?.mode === "new" && (
  <input type="hidden" name="newCustomerName" value={picked.name} />
)}
```

- [ ] **Bước 2: Thay quản lý món bằng sheet**

```tsx
const [itemSheet, setItemSheet] = useState<
  { open: false } | { open: true; index: number | null }
>({ open: false });

function saveItem(row: ItemRow, addAnother: boolean) {
  setItems((prev) => {
    if (!itemSheet.open || itemSheet.index === null) return [...prev, row];
    return prev.map((it, i) => (i === itemSheet.index ? row : it));
  });
  // Thêm liên tiếp: giữ sheet ở chế độ "thêm mới" cho món kế tiếp.
  if (addAnother) setItemSheet({ open: true, index: null });
}

function deleteItem() {
  if (!itemSheet.open || itemSheet.index === null) return;
  const i = itemSheet.index;
  setItems((prev) => prev.filter((_, idx) => idx !== i));
  setItemSheet({ open: false });
}
```

Khởi tạo `items` đổi từ `[{ ...emptyItem }]` thành `[]` — danh sách rỗng đúng nghĩa hơn một dòng trống, và `validItems.length > 0` trong `canSubmit` vẫn chặn được việc lưu đơn không món.

- [ ] **Bước 3: Viết lại phần render**

```tsx
  return (
    <>
      <form action={formAction} className="order-form" id="new-order-form">
        {state.error && <div className="error">{state.error}</div>}

        <input type="hidden" name="items" value={JSON.stringify(parsedItems)} />
        <input type="hidden" name="quotedTotalVnd" value={totalVnd} />
        <input type="hidden" name="shipStatus" value={shipStatus} />
        <input type="hidden" name="customerMode" value={picked?.mode ?? "new"} />
        {picked?.mode === "existing" && (
          <input type="hidden" name="customerId" value={picked.id} />
        )}
        {picked?.mode === "new" && (
          <input type="hidden" name="newCustomerName" value={picked.name} />
        )}

        <h2 className="sec-label">Khách</h2>
        <button
          type="button"
          className="picker"
          onClick={() => setCustomerSheet(true)}
        >
          {picked ? picked.name : "+ Chọn khách"}
        </button>

        {picked?.mode === "new" && (
          <details className="more-fields">
            <summary>Thêm SĐT / địa chỉ</summary>
            <label className="field">
              <span>SĐT / Zalo</span>
              <input
                name="newCustomerPhone"
                type="tel"
                inputMode="tel"
                value={newCustomerPhone}
                onChange={(e) => setNewCustomerPhone(e.target.value)}
                placeholder="09…"
              />
            </label>
            <label className="field">
              <span>Địa chỉ giao</span>
              <input
                name="newCustomerAddress"
                value={newCustomerAddress}
                onChange={(e) => setNewCustomerAddress(e.target.value)}
              />
            </label>
          </details>
        )}

        <h2 className="sec-label">Món ({validItems.length})</h2>
        <div className="item-cards">
          {items.map((it, i) => (
            <button
              key={i}
              type="button"
              className="item-card"
              onClick={() => setItemSheet({ open: true, index: i })}
            >
              <span className="ic-name">{it.name || "(chưa đặt tên)"}</span>
              <span className="ic-meta">
                {it.attributes || "—"} · ×{it.quantity || 0}
              </span>
              <span className="ic-price num">
                {it.unitPriceCny ? `¥${it.unitPriceCny}` : "¥ —"}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="picker"
          onClick={() => setItemSheet({ open: true, index: null })}
        >
          + Thêm món
        </button>

        <h2 className="sec-label">Tiền</h2>
        <label className="field">
          <span>Tổng chốt khách (₫)</span>
          <input
            inputMode="numeric"
            value={quotedTotal}
            onChange={(e) => setQuotedTotal(e.target.value)}
            placeholder={String(totalVnd)}
            enterKeyHint="next"
          />
        </label>
        <label className="field">
          <span>Cọc (₫)</span>
          <input
            name="deposit"
            inputMode="numeric"
            value={deposit}
            onChange={(e) => setDeposit(e.target.value)}
            enterKeyHint="done"
          />
        </label>

        <details className="more-fields">
          <summary>Tỷ giá · ship · loại đơn</summary>
          <label className="field">
            <span>Tỷ giá (₫/¥)</span>
            <input
              name="exchangeRate"
              inputMode="numeric"
              value={exchangeRate}
              onChange={(e) => setExchangeRate(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Phí ship (₫)</span>
            <input
              name="shippingFee"
              inputMode="numeric"
              value={shippingFee}
              onChange={(e) => handleShippingFeeChange(e.target.value)}
              placeholder="Chưa biết thì để trống"
            />
          </label>
          <label className="field">
            <span>Loại đơn</span>
            <select
              name="orderType"
              value={orderType}
              onChange={(e) => setOrderType(e.target.value as OrderType)}
            >
              {ORDER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ORDER_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Ghi chú</span>
            <textarea name="note" rows={2} placeholder="Ghi chú nội bộ" />
          </label>
        </details>
      </form>

      <CustomerSheet
        open={customerSheet}
        onClose={() => setCustomerSheet(false)}
        customers={customers}
        onPick={setPicked}
      />

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
      />
    </>
  );
```

- [ ] **Bước 3b: Ô tiền tự chèn dấu phân cách khi rời ô**

Ba ô tiền (Tổng chốt khách, Cọc, Phí ship) thêm `onBlur` để định dạng lại và `onFocus` để gỡ định dạng, gõ tiếp không vướng dấu chấm. Helper dùng chung, đặt ngay trong `new-order-form.tsx`:

```tsx
/** 4520000 → "4.520.000". Chuỗi rỗng giữ nguyên rỗng. */
function groupDigits(s: string): string {
  if (s.trim() === "") return s;
  const n = Number(String(s).replace(/[.,\s]/g, ""));
  return Number.isFinite(n) ? n.toLocaleString("vi-VN") : s;
}
```

Áp cho từng ô tiền, ví dụ ô Tổng chốt khách:

```tsx
  onFocus={(e) => setQuotedTotal(e.target.value.replace(/[.,\s]/g, ""))}
  onBlur={(e) => setQuotedTotal(groupDigits(e.target.value))}
```

**Bắt buộc kèm theo:** hàm `num()` sẵn có trong form đang strip `/[,\s]/` — mở rộng thành `/[.,\s]/`. Không làm bước này thì `num("4.520.000")` ra `4.52` chứ không phải `4520000`, và mọi con số của đơn sai bét. Kiểm bằng cách gõ `4520000` vào ô Tổng, chạm ra ngoài (thấy `4.520.000`), rồi xem thanh đáy vẫn hiện đúng `4.520.000` — không phải `5`.

- [ ] **Bước 4: Thanh dính đáy trong `page.tsx`**

Nút submit nằm **ngoài** `<form>` nên phải trỏ vào form bằng `form="new-order-form"` — đó là lý do form có `id` ở bước 3. Trong `new-order-form.tsx`, xuất thêm phần thanh đáy; cách gọn nhất là để chính `NewOrderForm` render `<StickyBar>` như phần tử cuối của fragment:

```tsx
      <StickyBar>
        <span className="sb-money">
          <span className="sb-label">Tổng</span>
          <strong className="num">{formatVnd(totalVnd)}</strong>
          <span className="sb-label">
            Lời <span className={marginVnd < 0 ? "neg" : ""}>{formatVnd(marginVnd)}</span>
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

Trong `src/app/orders/new/page.tsx`, gọi `AppShell` với `bottomBar` **rỗng nhưng khác `undefined`** để tabbar ẩn — cách đơn giản và trung thực là truyền `bottomBar={null}` **không** dùng được (nullish coalescing sẽ rơi về `MobileNav`). Thay vào đó truyền `bottomBar={<></>}`:

```tsx
<AppShell
  username={session.username}
  title="Đơn mới"
  backHref="/orders"
  bottomBar={<></>}
>
  <NewOrderForm ... />
</AppShell>
```

`NewOrderForm` tự render `StickyBar` của nó; `AppShell` chỉ cần biết "màn này có thanh đáy" để ẩn tabbar và nới `padding-bottom`.

- [ ] **Bước 5: Xoá ba component cũ**

```bash
git rm src/app/orders/new/customer-block.tsx src/app/orders/new/items-block.tsx src/app/orders/new/money-block.tsx
```

Trong `src/styles/legacy.css`, xoá luật `.item-row`, `.items`, `.it-name`, `.it-url`, `.it-attr`, `.it-qty`, `.it-price`, `.it-del`, `.seg`, `.seg-on`, `.two-col`, `.form-actions` và mọi `@media (max-width: 720px)` chỉ phục vụ chúng.

- [ ] **Bước 6: CSS màn tạo đơn**

Thêm vào `src/styles/screens.css`:

```css
.sec-label {
  font-size: var(--fs-2);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
  margin: var(--sp-5) 0 var(--sp-2);
}
.picker {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: var(--tap);
  padding: 0 var(--sp-4);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--brand);
  font-weight: 600;
  cursor: pointer;
}
.item-cards {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  margin-bottom: var(--sp-2);
}
.item-card {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--sp-1) var(--sp-3);
  width: 100%;
  padding: var(--sp-3) var(--sp-4);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  text-align: left;
  cursor: pointer;
}
.ic-name {
  font-weight: 600;
}
.ic-meta {
  grid-column: 1;
  font-size: var(--fs-2);
  color: var(--muted);
}
.ic-price {
  grid-row: 1 / span 2;
  grid-column: 2;
  align-self: center;
  font-size: var(--fs-4);
  font-weight: 600;
}
.more-fields > summary {
  min-height: var(--tap);
  display: flex;
  align-items: center;
  color: var(--brand);
  font-size: var(--fs-2);
  font-weight: 600;
  cursor: pointer;
  list-style: none;
}
.sb-money {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sb-money strong {
  font-size: var(--fs-6);
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}
.sb-label {
  font-size: var(--fs-2);
  color: var(--muted);
}
.neg {
  color: var(--danger);
}
.sticky-bar .btn {
  min-height: var(--tap);
  padding: 0 var(--sp-5);
}
```

- [ ] **Bước 7: Kiểm bằng preview, đây là màn quan trọng nhất**

`preview_start` `{ name: "dev" }`, `resize_window` `{ preset: "mobile", width: 393, height: 852 }`, vào `/orders/new`.

Kiểm bảy điều, chụp màn hình sau mỗi bước quan trọng:

1. Chạm "+ Chọn khách" → sheet trượt lên, ô tìm có bàn phím. Gõ một tên chưa có → hiện dòng *Tạo khách mới «…»*. Chạm nó → sheet đóng, tên hiện trên nút.
2. Chạm "+ Thêm món" → nhập tên và số lượng → "Lưu & thêm nữa" → sheet vẫn mở, ô đã trống, đếm món tăng.
3. Chạm một thẻ món đã có → sheet mở đúng dữ liệu món đó, sửa được, có nút Xoá món.
4. **Chạm vào ô "Tổng chốt khách": trang KHÔNG được phóng to.** Đây là bài kiểm quan trọng nhất của cả dự án. Xác nhận bằng `javascript_tool`: `getComputedStyle(document.querySelector('input[inputmode="numeric"]')).fontSize` phải là `"16px"`.
5. Thanh đáy luôn hiện Tổng và nút Lưu khi cuộn lên xuống; **tabbar không hiện** ở màn này.
6. Nhập đủ tên khách, một món có tên và số lượng, một Tổng → nút "Lưu đơn" bật sáng → bấm → sang được màn chi tiết đơn.
7. `read_console_messages` `{ onlyErrors: true }`: không lỗi.

- [ ] **Bước 8: Typecheck, test, commit**

```bash
npx tsc --noEmit && npm test
```

```bash
git add -A src/app/orders/new src/styles
git commit -m "$(cat <<'MSG'
nhập đơn: bố cục kiểu POS, thanh đáy luôn thấy tổng tiền

Một màn duy nhất: khách ở đỉnh, danh sách món ở giữa, thanh dính đáy
luôn hiện Tổng + Lời + nút Lưu. Không còn phải cuộn tới đáy trang mới
lưu được. Thêm/sửa khách và món đều mở sheet riêng.

Toàn bộ phần tính tiền giữ nguyên văn — chỉ đổi cách hiển thị.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Task 9: Nhập nhanh từ ảnh

Nguồn ảnh không nhất thiết là Zalo, và nhập tay mới là cách làm chính — nên khối đọc ảnh rời khỏi vị trí đầu form, thành một nút ở header.

**Files:**
- Create: `src/app/orders/new/quick-import-sheet.tsx` (chuyển từ `zalo-dropzone.tsx`)
- Delete: `src/app/orders/new/zalo-dropzone.tsx`
- Modify: `src/app/orders/new/new-order-form.tsx`, `src/app/orders/new/page.tsx`, `src/lib/photos.ts`

**Interfaces:**
- Consumes: `Sheet` (Task 4), `onExtract` từ `NewOrderForm` (Task 8, giữ nguyên chữ ký).
- Produces:

```tsx
<QuickImportSheet
  open={boolean}
  onClose={() => void}
  quotedTotal={string}
  onExtract={(order: ZaloExtract, currentTotalStr: string) => Promise<string>}
/>
```

- [ ] **Bước 1: Chuyển file, giữ nguyên logic**

```bash
git mv src/app/orders/new/zalo-dropzone.tsx src/app/orders/new/quick-import-sheet.tsx
```

Trong file mới: đổi tên hàm `ZaloDropzone` → `QuickImportSheet`, thêm hai prop `open` và `onClose`, và bọc toàn bộ phần JSX đang trả về trong `<Sheet open={open} title="Nhập nhanh từ ảnh" onClose={onClose}> … </Sheet>`.

**Giữ nguyên không sửa:** toàn bộ state (`photos`, `pendingPhotos`, `zaloBusy`, `zaloError`, `zaloInfo`, `zaloPhotoId`), hàm đọc ảnh, vòng lặp nhiều ảnh, và `useEffect` nghe Ctrl+V. Chỉ sửa `useEffect` dán ảnh để **chỉ gắn listener khi `open === true`** — sheet đóng thì Ctrl+V không nên cướp thao tác dán ở ô khác:

```tsx
  useEffect(() => {
    if (!open) return;
    function handlePaste(e: ClipboardEvent) {
      /* …giữ nguyên toàn bộ thân hàm cũ… */
    }
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [open]);
```

Đổi mọi chuỗi hiển thị có chữ "Zalo" sang chữ trung tính: "Đọc ảnh chốt đơn", "Thả hoặc dán ảnh chốt đơn", "Ảnh chốt đơn". **Không** đổi tên biến nội bộ (`zaloBusy`, `zaloPhotoId`…) — đổi chỉ tạo nhiễu diff mà không đem lại gì.

- [ ] **Bước 2: Đổi nhãn ảnh hiển thị**

Trong `src/lib/photos.ts`, sửa **duy nhất** dòng nhãn hiển thị:

```ts
export const PHOTO_LABEL_LABELS: Record<PhotoLabel, string> = {
  product: "Ảnh sản phẩm",
  // Nguồn ảnh không nhất thiết là Zalo. Giá trị enum trong DB vẫn là
  // 'zalo_confirm' — đổi nó cần migration và làm hỏng các dòng ảnh cũ.
  zalo_confirm: "Ảnh chốt đơn",
  actual: "Ảnh thực tế",
  listing: "Ảnh đăng bán",
};
```

**Không** đụng mảng `PHOTO_LABELS`.

- [ ] **Bước 3: Chạy test ảnh để chắc không vỡ**

```bash
node --test tests/photos.test.ts
```

Kỳ vọng: PASS. Nếu có test khẳng định chuỗi "Ảnh chốt đơn Zalo" thì sửa test theo nhãn mới — đây là thay đổi chủ ý.

- [ ] **Bước 4: Nối nút vào header màn tạo đơn**

`QuickImportSheet` cần state `open` do `NewOrderForm` giữ (nó đã giữ `onExtract`), nhưng nút mở lại nằm ở header do `AppShell` render. Cách gọn nhất: `NewOrderForm` tự render cả nút lẫn sheet, và nút nổi ở đầu nội dung thay vì trong header — nhưng spec yêu cầu nút ở header.

Giải: `page.tsx` là Server Component, không giữ được state. Nên tách một Client Component mỏng bọc cả hai:

Trong `new-order-form.tsx`, thêm state và render nút vào **đầu** fragment, kèm class đưa nó lên header bằng CSS:

```tsx
const [importOpen, setImportOpen] = useState(false);
```

```tsx
      <button
        type="button"
        className="header-action-float"
        onClick={() => setImportOpen(true)}
        aria-label="Nhập nhanh từ ảnh"
      >
        <Icon name="image" size={22} />
      </button>

      <QuickImportSheet
        open={importOpen}
        onClose={() => setImportOpen(false)}
        quotedTotal={quotedTotal}
        onExtract={onExtract}
      />
```

CSS đưa nút vào đúng vị trí ô hành động của header (thêm vào `src/styles/screens.css`):

```css
/* Nút này thuộc về header nhưng state của nó nằm trong form (Client
   Component), còn header do AppShell (Server Component) dựng. Neo bằng
   position: fixed vào đúng ô hành động thay vì kéo state lên trên. */
.header-action-float {
  position: fixed;
  top: var(--sat);
  right: var(--sp-2);
  z-index: 26;
  width: var(--tap);
  height: var(--header-h);
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  color: var(--brand);
  cursor: pointer;
}
```

Nếu `icons.tsx` chưa có icon `image`, thêm theo đúng khuôn các icon sẵn có (đường dẫn SVG: `rect x=3 y=3 width=18 height=18 rx=2`, `circle cx=8.5 cy=8.5 r=1.5`, `M21 15l-5-5L5 21`), và bổ sung `"image"` vào union `IconName`.

- [ ] **Bước 5: Kiểm bằng preview**

Vào `/orders/new` ở khổ 393×852.

1. Nút ảnh hiện ở góc phải header, chạm được (≥44pt).
2. Chạm → sheet "Nhập nhanh từ ảnh" trượt lên, không còn chữ "Zalo" nào trong tiêu đề hay hướng dẫn.
3. Đóng sheet, chạm vào ô "Tổng chốt khách", nhấn Ctrl+V — **không** có gì xảy ra (listener chỉ gắn khi sheet mở).
4. Chụp màn hình cả hai trạng thái.

**Không gọi API Gemini thật trong bước kiểm này.** Test live dễ đụng quota 429 dùng chung với người dùng thật. Chỉ kiểm phần giao diện; việc đọc ảnh thật để người dùng tự thử.

- [ ] **Bước 6: Typecheck, test, commit**

```bash
npx tsc --noEmit && npm test
```

```bash
git add -A src/app/orders/new src/lib/photos.ts src/app/_components/icons.tsx src/styles tests
git commit -m "$(cat <<'MSG'
nhập đơn: "nhập nhanh từ ảnh" thay cho khối ảnh Zalo

Ảnh không nhất thiết chụp từ Zalo, và nhập tay mới là cách làm chính —
nên khối đọc ảnh rời vị trí đầu form, thành nút ở header. Nhãn ảnh
hiển thị đổi thành "Ảnh chốt đơn"; enum DB giữ nguyên zalo_confirm.

Listener Ctrl+V giờ chỉ gắn khi sheet mở, không cướp thao tác dán ở
ô nhập khác.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Task 10: Danh sách đơn phẳng có chip lọc

**Files:**
- Modify: `src/app/orders/page.tsx`
- Modify: `src/styles/screens.css`, `src/styles/legacy.css`

**Interfaces:**
- Consumes: `Chip` / `ChipBar` / `ListRow` (Task 4), `AppShell` (Task 5).
- Produces: không có gì cho task sau.

**Bộ lọc — định nghĩa chính xác, đừng tự chế:**

| Mã (`?f=`) | Nhãn | Điều kiện |
|---|---|---|
| `chu_y` | Cần chú ý | `r.needsAttention === true` |
| (không có) | Tất cả | không lọc |
| `dang_ve` | Đang về | `r.status === "da_mua_tq"` |
| `da_giao` | Đã giao | `r.status === "da_giao_khach"` |
| `chua_thu` | Chưa thu đủ | `r.amountDue > 0 && r.status !== "huy" && r.orderType !== "nhap_kho"` |

Đơn `nhap_kho` bị loại khỏi "Chưa thu đủ" có chủ đích: nó không có khách nên `amountDue` của nó không phải khoản phải thu của ai cả. Task 12 sẽ tạo loại đơn này thường xuyên.

Lọc bằng URL (`?f=…`), không bằng state client — nút Back của trình duyệt và chế độ standalone đều hoạt động đúng, và trang vẫn là Server Component.

- [ ] **Bước 1: Viết lại `src/app/orders/page.tsx`**

Giữ nguyên `listOrdersWithGaps()`, phần lọc theo `q`, và phần lọc theo `gap` (dùng cho link từ màn Tổng quan). Thay phần nhóm theo trạng thái bằng:

```tsx
const FILTERS = [
  { code: "chu_y", label: "Cần chú ý" },
  { code: "", label: "Tất cả" },
  { code: "dang_ve", label: "Đang về" },
  { code: "da_giao", label: "Đã giao" },
  { code: "chua_thu", label: "Chưa thu đủ" },
] as const;

function matchesFilter(r: RowWithGaps, code: string): boolean {
  switch (code) {
    case "chu_y":
      return r.needsAttention;
    case "dang_ve":
      return r.status === "da_mua_tq";
    case "da_giao":
      return r.status === "da_giao_khach";
    case "chua_thu":
      // Đơn nhập kho không có khách — amountDue của nó không phải nợ của ai.
      return r.amountDue > 0 && r.status !== "huy" && r.orderType !== "nhap_kho";
    default:
      return true;
  }
}
```

Trong component, sau khi đã có `searched` (lọc theo `q`) và `activeGap`:

```tsx
  const attentionCount = searched.filter((r) => r.needsAttention).length;
  // Mặc định mở ở "Cần chú ý" khi có đơn cần chú ý; không thì "Tất cả".
  const f = typeof rawF === "string" ? rawF : attentionCount > 0 ? "chu_y" : "";

  const rows = (activeGap
    ? searched.filter((r) => r.gaps.includes(activeGap))
    : searched
  )
    .filter((r) => matchesFilter(r, f))
    .sort((a, b) => {
      // Sự cố lên trước, rồi tới đơn đứng lâu nhất.
      if (a.status === "su_co" && b.status !== "su_co") return -1;
      if (b.status === "su_co" && a.status !== "su_co") return 1;
      return b.ageDays - a.ageDays;
    });
```

`searchParams` đổi thành `Promise<{ q?: string; gap?: string; f?: string }>`, và `rawF` là `f` đọc ra từ đó.

Phần render:

```tsx
  const qs = (code: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (activeGap) p.set("gap", activeGap);
    if (code) p.set("f", code);
    // Chuỗi rỗng cũng phải ghi để phân biệt "chọn Tất cả" với "chưa chọn gì".
    else p.set("f", "");
    return `/orders?${p.toString()}`;
  };

  return (
    <AppShell username={session.username} title="Đơn hàng">
      <form className="search" action="/orders" method="get">
        <input
          type="search"
          name="q"
          placeholder="Tìm tên khách / mã đơn…"
          defaultValue={q ?? ""}
          enterKeyHint="search"
        />
      </form>

      <ChipBar>
        {FILTERS.map((it) => (
          <Chip
            key={it.code}
            href={qs(it.code)}
            label={it.label}
            active={f === it.code}
            count={it.code === "chu_y" ? attentionCount : undefined}
          />
        ))}
      </ChipBar>

      {activeGap && (
        <div className="filter-bar">
          <span className="gap-chip">Đang lọc: {GAP_LABELS[activeGap]}</span>
          <Link href="/orders" className="btn btn-sm btn-outline">Bỏ lọc</Link>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="card empty">
          <p>
            {q ? `Không tìm thấy đơn khớp «${q}».` : "Không có đơn nào ở mục này."}
          </p>
        </div>
      ) : (
        rows.map((o) => (
          <ListRow
            key={o.id}
            href={`/orders/${o.id}`}
            title={
              <>
                {o.customerName}
                {o.gaps.length > 0 && (
                  <span
                    className="gap-dot"
                    title={o.gaps.map((g) => GAP_LABELS[g]).join(" · ")}
                  />
                )}
              </>
            }
            meta={
              <>
                {STATUS_LABELS[o.status]} · {o.status === "su_co"
                  ? "⚠️ Sự cố"
                  : o.isStale
                    ? `⏳ ${o.ageDays} ngày`
                    : `${o.ageDays}n`}
              </>
            }
            amount={formatVnd(o.amountDue)}
            trailing={<span className="lr-id">#{o.id}</span>}
          />
        ))
      )}
    </AppShell>
  );
```

Xoá import `MAIN_CHAIN`, `BRANCH_STATUSES`, `ORDER_TYPE_LABELS` và hằng `DISPLAY_ORDER` nếu không còn dùng.

- [ ] **Bước 2: CSS**

Thêm vào `src/styles/screens.css`:

```css
.search input {
  width: 100%;
  min-height: var(--tap);
  padding: 0 var(--sp-3);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
}
.chip-bar {
  position: sticky;
  top: calc(var(--header-h) + var(--sat));
  z-index: 20;
  background: var(--bg);
  margin: 0 calc(-1 * var(--sp-4));
}
.lr-id {
  font-size: var(--fs-2);
  color: var(--text-subtle);
  font-variant-numeric: tabular-nums;
}
.gap-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--warning);
  margin-left: var(--sp-2);
}
```

Trong `src/styles/legacy.css`, xoá luật `.order-row`, `.order-id`, `.order-customer`, `.order-due`, `.order-age`, `.order-list`, `.attention`, `.attention-item`, `.attention-status`, `.status-group`.

**Lưu ý:** `src/app/page.tsx` (Tổng quan) cũng đang dùng `.order-row` và `.order-list`. Task 15 sửa nó. Trong lúc chờ, Tổng quan sẽ hiện xấu — chấp nhận được, đừng vì vậy mà giữ lại luật cũ.

- [ ] **Bước 3: Kiểm bằng preview**

Vào `/orders` ở 393×852.

1. Chip cuộn ngang được; mặc định "Cần chú ý" sáng nếu có đơn cần chú ý.
2. Chạm từng chip → URL đổi, danh sách lọc đúng, chip đó sáng.
3. Nút Back của trình duyệt quay lại chip trước.
4. Cuộn xuống → chip vẫn dính dưới header.
5. Chạm một thẻ đơn → sang màn chi tiết.
6. Chụp màn hình. `read_console_messages` `{ onlyErrors: true }`: không lỗi.

- [ ] **Bước 4: Typecheck, test, commit**

```bash
npx tsc --noEmit && npm test
```

```bash
git add -A src/app/orders/page.tsx src/styles
git commit -m "$(cat <<'MSG'
đơn hàng: danh sách phẳng với chip lọc thay cho bảy nhóm trạng thái

Tìm một đơn không còn phải cuộn qua bảy tiêu đề nhóm. Lọc bằng URL
nên nút Back hoạt động đúng và trang vẫn là Server Component.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Task 11: Chi tiết đơn — đầu màn cố định và bốn tab

Chín khối xếp chồng thành đầu màn + bốn tab. Tab chọn bằng `?tab=` để trang vẫn là Server Component và nút Back đi đúng.

**Files:**
- Create: `src/app/orders/[id]/order-tabs.tsx`
- Modify: `src/app/orders/[id]/page.tsx`
- Modify: `src/styles/screens.css`

**Interfaces:**
- Consumes: `AppShell` (Task 5), `StickyBar` (Task 4), `OrderJourney` / `LinePricingTable` / `PaymentsBlock` / `PhotoUpload` / `PhotoGallery` (giữ nguyên, không sửa).
- Produces:

```tsx
<OrderTabs orderId={number} active={TabCode} />
export type TabCode = "tom_tat" | "mon" | "tien" | "anh";
```

- [ ] **Bước 1: Viết `order-tabs.tsx`**

```tsx
import Link from "next/link";

export type TabCode = "tom_tat" | "mon" | "tien" | "anh";

const TABS: { code: TabCode; label: string }[] = [
  { code: "tom_tat", label: "Tóm tắt" },
  { code: "mon", label: "Món" },
  { code: "tien", label: "Tiền" },
  { code: "anh", label: "Ảnh" },
];

export function OrderTabs({
  orderId,
  active,
}: {
  orderId: number;
  active: TabCode;
}) {
  return (
    <nav className="tabs">
      {TABS.map((t) => (
        <Link
          key={t.code}
          href={`/orders/${orderId}?tab=${t.code}`}
          className={`tab${active === t.code ? " tab-on" : ""}`}
          aria-current={active === t.code ? "page" : undefined}
          scroll={false}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
```

- [ ] **Bước 2: Sửa `page.tsx` — đọc tab và dựng đầu màn**

`searchParams` đổi thành `Promise<{ err?: string; tab?: string }>`. Sau khi có `detail`:

```tsx
const TAB_CODES = ["tom_tat", "mon", "tien", "anh"] as const;
const tab: TabCode = (TAB_CODES as readonly string[]).includes(rawTab ?? "")
  ? (rawTab as TabCode)
  : "tom_tat";
```

Đầu màn, đặt ngay sau mở `AppShell`:

```tsx
      <section className="order-head">
        <span className="oh-label">Còn phải thu</span>
        <strong className="oh-amount num">{formatVnd(money.amountDue)}</strong>
        <span className="oh-meta">
          {ORDER_TYPE_LABELS[order.orderType]} · {STATUS_LABELS[order.status]}
        </span>
        <OrderJourney
          orderId={order.id}
          orderType={order.orderType}
          status={order.status}
          positionStatus={positionStatus}
          nextStatuses={nextStatuses}
        />
      </section>

      <OrderTabs orderId={order.id} active={tab} />
```

- [ ] **Bước 3: Phân bổ chín khối cũ vào bốn tab**

Bọc từng nhóm trong `{tab === "…" && ( … )}`, **giữ nguyên nội dung bên trong**, chỉ bỏ lớp `two-col`:

| Tab | Khối giữ lại từ bản cũ |
|---|---|
| `tom_tat` | cờ `gap-chips`, `warn-flag` khách, `<section>` Khách hàng, ghi chú đơn, Kiện vận chuyển, Lịch sử trạng thái |
| `mon` | `<LinePricingTable …/>` và `<section>` Sản phẩm |
| `tien` | `<section>` Khối tiền, `<CopyButton text={quote} />`, `<PaymentsBlock …/>` |

Trong tab `tien`, bảng lịch sử thu tiền bên trong `src/app/orders/[id]/payments-block.tsx` cũng đổi sang `ListRow` — spec kể nó vào ba bảng thật sự đọc trên phone. Mỗi lần thu là một dòng: `title` = phương thức thu, `meta` = thời điểm (kèm ghi chú nếu có), `amount` = số tiền, `trailing` = nút xoá. Form ghi nhận thu tiền chuyển vào `Sheet` mở từ nút *Ghi nhận thu tiền*. Giữ nguyên `addPaymentAction` / `deletePaymentAction`, chỉ đổi cách hiển thị.
| `anh` | `<PhotoUpload …/>` và `<PhotoGallery …/>` |

Trong tab `tom_tat`, thêm hai tiện ích chỉ có nghĩa trên điện thoại, thay cho hai dòng `kv` hiện tại:

```tsx
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
                    <CopyButton text={customer.address} label="Copy" className="btn btn-ghost btn-sm" />
                  </span>
                </div>
              )}
```

Trong tab `mon`, bảng `.tbl` Sản phẩm đổi sang `ListRow` cho mobile: bỏ `<table>`, render mỗi món một `ListRow` với `title={it.name}`, `meta={`${it.attributes ?? "—"} · ×${it.quantity}`}`, `amount={money2(it.quantity * it.unitPriceCny)}`. Hai nút *Lỗi NCC* / *Đổi trả* (khi `showLineActions`) đưa vào `trailing`.

- [ ] **Bước 4: Thanh đáy — bước kế tiếp trên trục**

`OrderJourney` hiện chứa cả stepper lẫn nút đổi trạng thái. Giữ stepper ở đầu màn, và thêm ở cuối `AppShell` một `StickyBar` với hành động chính:

```tsx
  const primaryNext = nextStatuses.find((s) =>
    journeyTrack(order.orderType).includes(s),
  );
```

```tsx
      bottomBar={
        primaryNext ? (
          <StickyBar>
            <form action={changeStatusAction} style={{ flex: 1, display: "flex" }}>
              <input type="hidden" name="orderId" value={order.id} />
              <input type="hidden" name="to" value={primaryNext} />
              <button type="submit" className="btn" style={{ flex: 1 }}>
                {STATUS_LABELS[primaryNext]} →
              </button>
            </form>
          </StickyBar>
        ) : undefined
      }
```

Nhánh `su_co` / `huy` / `khach_bom` **không** lên thanh đáy — chúng ở lại trong `OrderJourney` phía trên. Trục chính phải hiển nhiên, nhánh phải cố ý mới chạm tới.

Kiểm chữ ký `changeStatusAction` trong `src/app/orders/actions.ts:178` và dùng đúng tên trường `FormData` mà nó đọc; nếu khác `orderId`/`to` thì sửa theo file đó, đừng đổi action.

- [ ] **Bước 5: CSS**

Thêm vào `src/styles/screens.css`:

```css
.order-head {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  padding: var(--sp-4) 0 var(--sp-3);
}
.oh-label {
  font-size: var(--fs-2);
  color: var(--muted);
}
.oh-amount {
  font-size: var(--fs-6);
  font-weight: 700;
  line-height: 1.1;
  text-align: left;
}
.oh-meta {
  font-size: var(--fs-2);
  color: var(--muted);
}
.tabs {
  display: flex;
  position: sticky;
  top: calc(var(--header-h) + var(--sat));
  z-index: 20;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  margin: 0 calc(-1 * var(--sp-4)) var(--sp-4);
  padding: 0 var(--sp-4);
}
.tab {
  flex: 1;
  min-height: var(--tap);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--fs-2);
  font-weight: 600;
  color: var(--muted);
  text-decoration: none;
  border-bottom: 2px solid transparent;
}
.tab-on {
  color: var(--brand);
  border-bottom-color: var(--brand);
}
.kv {
  display: flex;
  justify-content: space-between;
  gap: var(--sp-3);
  padding: var(--sp-3) 0;
  border-bottom: 1px solid var(--border);
}
.kv > span:first-child {
  color: var(--muted);
  flex: none;
}
.kv-copy {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  text-align: right;
}
```

- [ ] **Bước 6: Kiểm bằng preview**

Mở một đơn ở 393×852.

1. Đầu màn hiện "Còn phải thu" với số lớn tabular, và stepper một dòng.
2. Bốn tab chuyển qua lại được; URL đổi theo; Back đi đúng thứ tự tab.
3. Tab Tóm tắt: SĐT là link `tel:` (kiểm bằng `read_page`, thẻ `<a href="tel:…">`), địa chỉ có nút Copy.
4. Tab Món: mỗi món một dòng, không phải bảng ngang.
5. Thanh đáy hiện đúng **một** nút là bước kế tiếp trên trục; tabbar không hiện.
6. Đơn đã `hoan_tat` → không có thanh đáy, tabbar hiện lại.
7. Chụp cả bốn tab.

- [ ] **Bước 7: Typecheck, test, commit**

```bash
npx tsc --noEmit && npm test
```

```bash
git add -A "src/app/orders/[id]" src/styles
git commit -m "$(cat <<'MSG'
chi tiết đơn: đầu màn cố định và bốn tab thay chín khối xếp chồng

Số còn phải thu và bước hiện tại luôn thấy ngay; nội dung chia Tóm tắt
/ Món / Tiền / Ảnh chọn bằng ?tab= nên Back đi đúng. Thanh đáy giữ
đúng một hành động là bước kế tiếp trên trục; nhánh sự cố và huỷ ở lại
trong hành trình phía trên.

Thêm SĐT bấm gọi được và nút copy địa chỉ giao.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Task 12: Nhập kho chủ động

**Không viết hàm cộng tồn mới.** Sheet tạo một đơn `nhap_kho` không khách rồi đẩy qua `changeOrderStatus` tới `ve_kho_vn`. Cộng tồn nguồn `active`, bình quân gia quyền, lịch sử trạng thái, và trừ ví ¥ (đã vá ở Task 1) đều chạy bằng code sẵn có và đã có test.

**Files:**
- Create: `src/app/inventory/stock-in-sheet.tsx`
- Modify: `src/app/inventory/actions.ts`, `src/app/inventory/page.tsx`
- Modify: `src/styles/screens.css`

**Interfaces:**
- Consumes: `Sheet` (Task 4), `createOrder` / `changeOrderStatus` / `getSettings` từ `@/db/queries`, `shouldDeductCny` gián tiếp qua Task 1.
- Produces:

```ts
export type StockInState = { error?: string };
export async function stockInAction(
  prev: StockInState,
  formData: FormData,
): Promise<StockInState>;
```

- [ ] **Bước 1: Thêm `stockInAction` vào `src/app/inventory/actions.ts`**

```ts
import { createOrder, changeOrderStatus, getSettings } from "@/db/queries";

export type StockInState = { error?: string };

/**
 * Nhập kho chủ động = một đơn `nhap_kho` không khách, đẩy thẳng tới
 * `ve_kho_vn`. Đi đường này thay vì cộng tồn tay để dùng lại toàn bộ
 * side-effect đã có và đã test: cộng tồn nguồn 'active', bình quân gia
 * quyền, lịch sử trạng thái, và trừ ví ¥.
 *
 * Phần thưởng kèm theo: mỗi lần trữ hàng đều có bản ghi mua gì, bao nhiêu,
 * ngày nào — thay vì một dòng tồn kho từ trên trời rơi xuống.
 */
export async function stockInAction(
  _prev: StockInState,
  formData: FormData,
): Promise<StockInState> {
  const session = await getSession();
  if (!session) return { error: "Phiên đăng nhập đã hết hạn." };

  const name = String(formData.get("productName") ?? "").trim();
  const quantity = num(formData.get("quantity"));
  const unitPriceCny = num(formData.get("unitPriceCny"));
  const rateRaw = num(formData.get("exchangeRate"));
  const exchangeRate = rateRaw > 0 ? rateRaw : (await getSettings()).sellRate;

  if (!name) return { error: "Thiếu tên hàng." };
  if (quantity <= 0) return { error: "Số lượng phải lớn hơn 0." };
  if (unitPriceCny <= 0) return { error: "Đơn giá ¥ phải lớn hơn 0." };

  const goodsVnd = Math.round(quantity * unitPriceCny * exchangeRate);

  const orderId = await createOrder({
    orderType: "nhap_kho",
    exchangeRate,
    // Đơn nhập kho không bán cho ai: Total bằng đúng tiền hàng, lời bằng 0.
    quotedTotalVnd: goodsVnd,
    shippingFee: 0,
    shipStatus: "unknown",
    deposit: 0,
    note: "Nhập kho chủ động",
    items: [{ name, quantity, unitPriceCny, marginVnd: 0 }],
    changedBy: session.username,
  });

  const moved = await changeOrderStatus(
    orderId,
    "ve_kho_vn",
    session.username,
    "Nhập kho chủ động",
  );
  if (!moved.ok) return { error: moved.reason };

  revalidatePath("/inventory");
  revalidatePath("/orders");
  return {};
}
```

Kiểm `NewOrderItemInput` trong `src/db/queries.ts` xem trường bắt buộc có đúng `{ name, quantity, unitPriceCny, marginVnd? }` không; thiếu trường nào thì bổ sung theo đúng kiểu đó (ví dụ `productUrl: ""`, `attributes: ""`), đừng đổi kiểu.

- [ ] **Bước 2: Viết `src/app/inventory/stock-in-sheet.tsx`**

```tsx
"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "../_components/sheet";
import { stockInAction, type StockInState } from "./actions";

export function StockInSheet({ defaultRate }: { defaultRate: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<StockInState, FormData>(
    stockInAction,
    {},
  );

  // Lưu xong (không lỗi, không còn chạy) thì đóng sheet và nạp lại tồn kho.
  useEffect(() => {
    if (!pending && !state.error && open) {
      setOpen(false);
      router.refresh();
    }
    // Chỉ phản ứng khi lượt gửi vừa kết thúc.
  }, [pending]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <button
        type="button"
        className="header-action-float"
        onClick={() => setOpen(true)}
        aria-label="Nhập kho"
      >
        +
      </button>

      <Sheet open={open} title="Nhập kho" onClose={() => setOpen(false)}>
        <form action={formAction} id="stock-in-form">
          {state.error && <div className="error">{state.error}</div>}

          <label className="field">
            <span>Tên hàng *</span>
            <input name="productName" autoFocus required enterKeyHint="next" />
          </label>

          <label className="field">
            <span>Số lượng *</span>
            <input
              name="quantity"
              inputMode="numeric"
              defaultValue="1"
              enterKeyHint="next"
            />
          </label>

          <label className="field">
            <span>Đơn giá (¥) *</span>
            <input name="unitPriceCny" inputMode="decimal" enterKeyHint="done" />
          </label>

          <details className="more-fields">
            <summary>Tỷ giá (mặc định {defaultRate.toLocaleString("vi-VN")})</summary>
            <label className="field">
              <span>Tỷ giá (₫/¥)</span>
              <input
                name="exchangeRate"
                inputMode="numeric"
                defaultValue={String(defaultRate)}
              />
            </label>
          </details>

          <p className="muted small">
            Nhập kho sẽ trừ số ¥ tương ứng khỏi ví ¥.
          </p>

          <button type="submit" className="btn" disabled={pending}>
            {pending ? "Đang nhập…" : "Nhập kho"}
          </button>
        </form>
      </Sheet>
    </>
  );
}
```

- [ ] **Bước 3: Nối vào màn Kho**

Trong `src/app/inventory/page.tsx`: đọc thêm `getSettings()` vào `Promise.all`, và render `<StockInSheet defaultRate={settings.sellRate} />` ngay trong `AppShell`. Đổi câu kho trống thành:

```tsx
<p>Kho trống. Bấm + ở góc trên để nhập hàng, hoặc hàng vào kho từ đơn Nhập kho, hàng lỗi NCC, đổi trả, hoặc khách bom.</p>
```

Đổi mỗi dòng tồn kho từ `<details class="inv-item card">` sang `ListRow` mở `Sheet` bán hàng — nhưng **nếu việc đó làm task phình to thì để lại cho Task 16**; task này chỉ cần thêm đường nhập kho.

- [ ] **Bước 4: Kiểm bằng preview — bài kiểm tiền, làm cẩn thận**

Trước khi thử, ghi lại số dư ví ¥ hiện tại: vào `/finance`, chụp màn hình, ghi con số.

1. Vào `/inventory`, chạm `+`, nhập: tên `Test nhập kho`, SL `2`, đơn giá `100`, tỷ giá để mặc định.
2. Bấm "Nhập kho" → sheet đóng, dòng `Test nhập kho` hiện ở nhóm **Nhập chủ động** với số lượng 2.
3. Vào `/orders` → có một đơn mới loại Nhập kho ở trạng thái *Về kho*.
4. Chip **"Chưa thu đủ"** → đơn nhập kho đó **không** được xuất hiện.
5. Vào `/finance` → số dư ví ¥ đã **giảm đúng 200¥** so với con số ghi ở trên, và sổ có một dòng `chi` gắn với đơn vừa tạo. Đây là bằng chứng Task 1 chạy đúng.
6. Chụp màn hình các bước 2, 3, 5.

- [ ] **Bước 5: Typecheck, test, commit**

```bash
npx tsc --noEmit && npm test
```

```bash
git add -A src/app/inventory src/styles
git commit -m "$(cat <<'MSG'
tồn kho: nhập hàng chủ động không cần đi qua đơn

Sheet nhập kho tạo một đơn nhap_kho không khách rồi đẩy tới ve_kho_vn,
dùng lại toàn bộ side-effect đã có: cộng tồn nguồn active, bình quân
gia quyền, lịch sử, và trừ ví ¥. Không viết logic tiền mới.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Task 13: `lastBackupAt` trong settings

**Files:**
- Modify: `src/lib/settings.ts`, `src/db/queries.ts`
- Modify: `tests/settings.test.ts`

**Interfaces:**
- Produces: `AppSettings.lastBackupAt: number | null` (epoch-seconds) và `SETTING_KEYS.lastBackupAt = "last_backup_at"`. Hàm `touchBackupAt(): Promise<void>` trong `queries.ts` — Task 14 gọi.

`settings` là bảng khoá-giá-trị (`key text primary key, value text`) nên **không cần migration**.

- [ ] **Bước 1: Viết test thất bại**

Thêm vào cuối `tests/settings.test.ts`:

```ts
test("chưa từng sao lưu → lastBackupAt là null, KHÔNG phải 0", () => {
  assert.equal(parseSettings([]).lastBackupAt, null);
});

test("đọc được mốc sao lưu gần nhất", () => {
  const s = parseSettings([{ key: "last_backup_at", value: "1756600000" }]);
  assert.equal(s.lastBackupAt, 1756600000);
});

test("giá trị rác ở mốc sao lưu → null, coi như chưa từng sao lưu", () => {
  assert.equal(parseSettings([{ key: "last_backup_at", value: "abc" }]).lastBackupAt, null);
  assert.equal(parseSettings([{ key: "last_backup_at", value: "" }]).lastBackupAt, null);
});
```

- [ ] **Bước 2: Chạy test để chắc nó đỏ**

```bash
node --test tests/settings.test.ts
```

Kỳ vọng: FAIL — `lastBackupAt` là `undefined`, không phải `null`.

- [ ] **Bước 3: Sửa `src/lib/settings.ts`**

```ts
export const SETTING_KEYS = {
  sellRate: "sell_rate",
  defaultMarginVnd: "default_margin_vnd",
  lastBackupAt: "last_backup_at",
} as const;
```

Thêm vào `AppSettings`:

```ts
  /**
   * Epoch-seconds của lần tải bản sao lưu gần nhất, hoặc null nếu chưa từng.
   *
   * KHÔNG đi qua positiveOr/nonNegativeOr như hai tham số trên: "chưa từng
   * sao lưu" là trạng thái hợp lệ và phải phân biệt được với "sao lưu lúc
   * epoch 0". Hai tham số kia luôn có giá trị mặc định; cái này thì không.
   */
  lastBackupAt: number | null;
```

Hàm phân tích riêng, và thêm vào `parseSettings`:

```ts
function epochOrNull(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}
```

```ts
    lastBackupAt: epochOrNull(map.get(SETTING_KEYS.lastBackupAt)),
```

- [ ] **Bước 4: Chạy test để chắc nó xanh**

```bash
node --test tests/settings.test.ts
```

Kỳ vọng: PASS toàn bộ, kể cả ba test cũ.

- [ ] **Bước 5: Thêm `touchBackupAt` vào `src/db/queries.ts`**

`saveSettings` hiện chỉ ghi hai khoá — **giữ nguyên nó**, đừng cho nó ghi `last_backup_at`, vì màn Cài đặt gọi `saveSettings` và sẽ vô tình xoá mốc sao lưu. Viết hàm riêng:

```ts
/** Đánh dấu vừa tải một bản sao lưu. Tách khỏi saveSettings có chủ đích:
 *  màn Cài đặt gọi saveSettings và không được phép đụng vào mốc này. */
export async function touchBackupAt(): Promise<void> {
  await raw.run(
    `INSERT INTO settings(key, value) VALUES(?, ${NOW_EPOCH_SQL}::text)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [SETTING_KEYS.lastBackupAt],
  );
}
```

- [ ] **Bước 6: Typecheck, test, commit**

```bash
npx tsc --noEmit && npm test
```

Nếu `tsc` báo lỗi ở màn Cài đặt vì `AppSettings` thiếu trường khi dựng object, sửa chỗ đó truyền `lastBackupAt: settings.lastBackupAt` (giữ nguyên giá trị đang có).

```bash
git add src/lib/settings.ts src/db/queries.ts tests/settings.test.ts
git commit -m "$(cat <<'MSG'
cài đặt: ghi mốc sao lưu gần nhất

Chuẩn bị cho việc bỏ backup tự động: cần biết lần cuối tải bản sao lưu
là khi nào để còn nhắc. Bảng settings là khoá-giá-trị nên không cần
migration. Trường này là number | null vì "chưa từng sao lưu" là trạng
thái hợp lệ, khác hẳn hai tham số số luôn có mặc định.

touchBackupAt tách khỏi saveSettings để màn Cài đặt không xoá nhầm mốc.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Task 14: Sao lưu bằng tay

**Files:**
- Create: `src/app/api/backup/route.ts`, `scripts/restore-from-json.ts`
- Modify: `src/app/backup/page.tsx`
- Delete: `.github/workflows/db-backup.yml`

**Interfaces:**
- Consumes: `touchBackupAt` (Task 13), `raw` từ `@/db/raw`, `getSession` từ `@/lib/auth`.
- Produces: `GET /api/backup` trả JSON `{ version: 1, exportedAt: string, tables: Record<string, unknown[]> }`.

Xoá `db-backup.yml` an toàn về vận hành: job chống Supabase tự ngủ nằm ở `tracking-sweep.yml`, không dính gì tới nó.

- [ ] **Bước 1: Viết `src/app/api/backup/route.ts`**

```ts
import { getSession } from "@/lib/auth";
import { raw } from "@/db/raw";
import { touchBackupAt } from "@/db/queries";

// Route đụng DB → runtime Node, không Edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Thứ tự KHÔNG quan trọng khi xuất, nhưng quan trọng khi nạp lại — xem
 * scripts/restore-from-json.ts. Danh sách là hằng số trong mã nguồn, không
 * phải dữ liệu người dùng, nên nội suy thẳng vào SQL ở đây là an toàn.
 */
const TABLES = [
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
] as const;

export async function GET() {
  const session = await getSession();
  if (!session) {
    return new Response("Chưa đăng nhập", { status: 401 });
  }

  const tables: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    tables[t] = await raw.all(`SELECT * FROM ${t}`);
  }

  await touchBackupAt();

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;

  const body = JSON.stringify(
    { version: 1, exportedAt: now.toISOString(), tables },
    null,
    2,
  );

  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="heyp-backup-${stamp}.json"`,
      "cache-control": "no-store",
    },
  });
}
```

- [ ] **Bước 2: Viết `scripts/restore-from-json.ts`**

```ts
/**
 * Nạp ngược một bản sao lưu JSON. GHI ĐÈ toàn bộ dữ liệu hiện tại.
 *
 *   node --experimental-strip-types scripts/restore-from-json.ts file.json --toi-chac-chan
 *
 * Cờ --toi-chac-chan là bắt buộc: lệnh này xoá sạch mọi bảng trước khi nạp.
 */
import { readFile } from "node:fs/promises";
import postgres from "postgres";

const [file, confirm] = process.argv.slice(2);
if (!file || confirm !== "--toi-chac-chan") {
  console.error(
    "Dùng: node --experimental-strip-types scripts/restore-from-json.ts <file.json> --toi-chac-chan",
  );
  process.exit(1);
}

const url = process.env.DIRECT_URL;
if (!url) {
  console.error("Thiếu DIRECT_URL trong môi trường.");
  process.exit(1);
}

// Thứ tự này tôn trọng khoá ngoại: cha trước, con sau.
const ORDER = [
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
] as const;

const dump = JSON.parse(await readFile(file, "utf8")) as {
  version: number;
  tables: Record<string, Record<string, unknown>[]>;
};
if (dump.version !== 1) {
  console.error(`Không đọc được bản sao lưu version ${dump.version}.`);
  process.exit(1);
}

// Dùng DIRECT_URL (session pooler) chứ không phải pooler transaction —
// TRUNCATE và setval cần một phiên ổn định.
const sql = postgres(url, { prepare: false });

try {
  // Xoá ngược thứ tự để không vướng khoá ngoại.
  for (const t of [...ORDER].reverse()) {
    await sql.unsafe(`TRUNCATE TABLE ${t} CASCADE`);
  }

  for (const t of ORDER) {
    const rows = dump.tables[t] ?? [];
    if (rows.length === 0) continue;
    for (const row of rows) {
      const cols = Object.keys(row);
      const holes = cols.map((_, i) => `$${i + 1}`).join(", ");
      await sql.unsafe(
        `INSERT INTO ${t} (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${holes})`,
        cols.map((c) => row[c]),
      );
    }
    console.log(`${t}: nạp ${rows.length} dòng`);
  }

  // Đặt lại bộ đếm id, nếu không thì lần INSERT tiếp theo sẽ đụng khoá chính.
  for (const t of ORDER) {
    if (t === "settings" || t === "order_packages") continue; // không có cột id
    await sql.unsafe(
      `SELECT setval(pg_get_serial_sequence('${t}', 'id'),
                     COALESCE((SELECT MAX(id) FROM ${t}), 1))`,
    );
  }

  console.log("Khôi phục xong.");
} finally {
  await sql.end();
}
```

- [ ] **Bước 3: Viết lại `src/app/backup/page.tsx`**

```tsx
import { requireAuth } from "@/lib/auth";
import { AppShell } from "../_components/app-shell";
import { getSettings } from "@/db/queries";
import { formatDateTime } from "@/lib/format";

export default async function BackupPage() {
  const [session, settings] = await Promise.all([requireAuth(), getSettings()]);

  return (
    <AppShell username={session.username} title="Sao lưu">
      <div className="card">
        <p>
          Supabase gói miễn phí <strong>không có sao lưu tự động</strong> và
          không có PITR. Bản sao duy nhất là bản gần nhất bạn tự tải.
        </p>
        <p className="muted">
          Lần sao lưu gần nhất:{" "}
          {settings.lastBackupAt
            ? formatDateTime(new Date(settings.lastBackupAt * 1000))
            : "chưa bao giờ"}
        </p>
        <a href="/api/backup" className="btn" download>
          Tải bản sao lưu
        </a>
      </div>

      <div className="card">
        <p>
          <strong>Ảnh không nằm trong file này.</strong> Ảnh ở Supabase Storage
          (bucket <code>photos</code>) — tải từ dashboard Supabase khi cần.
        </p>
      </div>

      <div className="card">
        <p>
          <strong>Khôi phục</strong> chạy trên máy tính, sau khi đã tải file về.
          Lệnh này <strong>ghi đè toàn bộ dữ liệu hiện tại</strong>:
        </p>
        <p className="muted">
          <code>
            node --experimental-strip-types scripts/restore-from-json.ts
            duong-dan-file.json --toi-chac-chan
          </code>
        </p>
      </div>
    </AppShell>
  );
}
```

Kiểm chữ ký `formatDateTime` trong `src/lib/format.ts` — nếu nó nhận epoch-seconds chứ không nhận `Date`, truyền `settings.lastBackupAt` thẳng.

- [ ] **Bước 4: Xoá workflow backup tự động**

```bash
git rm .github/workflows/db-backup.yml
```

Xác nhận `tracking-sweep.yml` **vẫn còn** — nó là thứ giữ Supabase free tier khỏi tự ngủ sau 7 ngày:

```bash
ls .github/workflows/
```

Kỳ vọng: chỉ còn `tracking-sweep.yml`.

- [ ] **Bước 5: Kiểm bằng preview**

1. Vào `/backup` ở 393×852 — thấy "chưa bao giờ", nút "Tải bản sao lưu".
2. Kiểm route trả đúng: `read_network_requests` sau khi mở `/api/backup` trong tab. Xác nhận status 200, `content-disposition` có `attachment; filename="heyp-backup-…json"`, và thân JSON có khoá `tables` với đủ 12 bảng.
3. Tải lại `/backup` — dòng "Lần sao lưu gần nhất" giờ hiện thời điểm vừa rồi. Đây là bằng chứng `touchBackupAt` chạy.
4. Đăng xuất rồi mở thẳng `/api/backup` — phải trả **401**, không phải dữ liệu. Kiểm bằng `read_network_requests`.
5. Chụp màn hình bước 1 và 3.

- [ ] **Bước 6: Typecheck, test, commit**

```bash
npx tsc --noEmit && npm test
```

```bash
git add -A src/app/api/backup src/app/backup scripts .github
git commit -m "$(cat <<'MSG'
sao lưu: bỏ backup tự động, thêm nút tải bản sao lưu

Workflow pg_dump hằng ngày bị bỏ theo yêu cầu; thay bằng route có xác
thực xuất toàn bộ bảng ra JSON, tải được thẳng từ iPhone vào Files.
Kèm script nạp ngược. Mỗi lần tải ghi lại mốc để còn nhắc.

Job chống Supabase tự ngủ (tracking-sweep) giữ nguyên, không liên quan.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Task 15: Tổng quan một cột, kèm nhắc sao lưu

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/styles/screens.css`, `src/styles/legacy.css`

**Interfaces:**
- Consumes: `ListRow` (Task 4), `AppShell` (Task 5), `AppSettings.lastBackupAt` (Task 13).

- [ ] **Bước 1: Thêm cảnh báo sao lưu**

Trong `src/app/page.tsx`, thêm `getSettings()` vào `Promise.all`, rồi:

```tsx
const BACKUP_WARN_DAYS = 14;
const daysSinceBackup =
  settings.lastBackupAt === null
    ? null
    : Math.floor((Date.now() / 1000 - settings.lastBackupAt) / 86400);
const backupOverdue =
  daysSinceBackup === null || daysSinceBackup >= BACKUP_WARN_DAYS;
```

Render **trên cùng**, trước cả "Cần chú ý":

```tsx
      {backupOverdue && (
        <Link href="/backup" className="card warn-card">
          <strong>Đã lâu chưa sao lưu</strong>
          <span className="muted">
            {daysSinceBackup === null
              ? "Chưa từng tải bản sao lưu nào."
              : `Lần gần nhất cách đây ${daysSinceBackup} ngày.`}{" "}
            Supabase gói miễn phí không tự sao lưu — chạm để tải bản mới.
          </span>
        </Link>
      )}
```

- [ ] **Bước 2: Xếp lại một cột theo mức cấp bách**

Bỏ `dash-grid`. Thứ tự các khối, từ trên xuống: nhắc sao lưu (nếu có) → Cần chú ý → Tổng còn phải thu → Cần bổ sung → Ví ¥ → Lãi tháng. Đổi mọi `<Link className="order-row">` trong khối "Cần chú ý" sang `ListRow` (Task 10 đã xoá luật CSS `.order-row`):

```tsx
            {attention.map((o) => (
              <ListRow
                key={o.id}
                href={`/orders/${o.id}`}
                title={o.customerName}
                meta={o.status === "su_co" ? "⚠️ Sự cố" : `⏳ ${o.ageDays} ngày`}
                amount={formatVnd(o.amountDue)}
              />
            ))}
```

Giữ nguyên toàn bộ phần tính toán (`attention`, `totalOutstanding`, `topDebtors`, `needInfo`, `gapCounts`, `pnl`) — chỉ đổi cách hiển thị.

- [ ] **Bước 3: CSS**

Thêm vào `src/styles/screens.css`:

```css
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: var(--sp-4);
  margin-bottom: var(--sp-3);
}
.card-title {
  font-size: var(--fs-4);
  margin: 0 0 var(--sp-3);
}
.warn-card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  background: var(--warning-tint);
  border-color: var(--warning-border);
  color: var(--text);
  text-decoration: none;
}
.dash-big {
  font-size: var(--fs-6);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
```

Trong `src/styles/legacy.css`, xoá `.dash-grid`, `.dash-attention`, `.dash-actions`, `.dash-debtors` và khối `@media (max-width: 767px) { .dash-grid { … } }`.

- [ ] **Bước 4: Kiểm bằng preview**

1. Vào `/` ở 393×852 — thẻ nhắc sao lưu vàng nằm trên cùng (vì Task 14 vừa tải một bản, nếu nó không hiện thì đúng — thử lại sau khi sửa `last_backup_at` trong DB về một mốc cũ, hoặc chấp nhận và chuyển sang bước 2).
2. Mọi khối xếp một cột, không tràn ngang.
3. Chạm một đơn ở "Cần chú ý" → sang màn chi tiết.
4. `javascript_tool`: `document.documentElement.scrollWidth <= document.documentElement.clientWidth` phải là `true` — trang không được cuộn ngang.
5. Chụp màn hình.

- [ ] **Bước 5: Typecheck, test, commit**

```bash
npx tsc --noEmit && npm test
```

```bash
git add -A src/app/page.tsx src/styles
git commit -m "$(cat <<'MSG'
tổng quan: xếp một cột theo mức cấp bách, thêm nhắc sao lưu

Backup thủ công hỏng ở chỗ người ta quên — thẻ nhắc sau 14 ngày là thứ
thay thế cho cron vừa bỏ.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Task 16: Các màn còn lại

Bảy màn dùng chung bộ primitive. Làm lần lượt, **commit riêng từng màn** để dễ soi lại nếu một màn vỡ.

**Files:** `src/app/customers/page.tsx` · `src/app/inventory/page.tsx` + `sell-form.tsx` · `src/app/finance/page.tsx` · `src/app/reports/page.tsx` · `src/app/tracking/page.tsx` + `create-package-form.tsx` · `src/app/settings/page.tsx` · `src/app/login/page.tsx` · `src/styles/screens.css` · `src/styles/legacy.css`

**Interfaces:** chỉ tiêu thụ (`ListRow`, `Sheet`, `Chip`, `AppShell`), không sản sinh gì mới.

**Luật chung cho cả bảy màn:**
- Mọi `<table class="tbl">` mà bạn **thật sự đọc trên phone** → `ListRow`. Áp dụng cho: tồn kho, lịch sử thu tiền, danh sách khách.
- Bảng còn lại (Báo cáo, sổ chi phí) → giữ `<table>` nhưng bọc trong `<div class="table-scroll">` với `overflow-x: auto`.
- Mọi form con đang nhét thẳng vào trang → `Sheet`.
- Sau mỗi màn, xoá phần `legacy.css` chỉ phục vụ màn đó.

- [ ] **Bước 1: Khách hàng** — mỗi khách một `ListRow`. Đây là khuôn mẫu cho cả sáu bước sau, làm đúng rồi nhân bản:

```tsx
        {customers.map((c) => (
          <ListRow
            key={c.id}
            href={`/orders?q=${encodeURIComponent(c.name)}`}
            title={
              <>
                {c.warningFlag && (
                  <span className="warn-dot" title={c.warningReason ?? "Khách có cờ cảnh báo"} />
                )}
                {c.name}
              </>
            }
            meta={`${c.orderCount} đơn`}
            amount={formatVnd(c.outstanding)}
          />
        ))}
```

Kiểm tên trường thật của `listCustomersWithTotals` trong `src/db/queries.ts` và dùng đúng tên đó; đừng đổi query. Commit.

- [ ] **Bước 2: Tồn kho** — thay `<details class="inv-item card">` bằng `ListRow` mở một `Sheet` chứa `SellForm` + `PhotoUpload` + `PhotoGallery`. Giữ nguyên `SellForm` bên trong, chỉ bọc lại. Commit.

- [ ] **Bước 3: Tài chính** — ví ¥ và sổ chi phí. Số dư ví dùng `.dash-big`. Form nạp ¥ và form ghi chi phí chuyển vào `Sheet` mở từ nút ở header. Bảng sổ giữ `<table>` trong `.table-scroll`. Commit.

- [ ] **Bước 4: Báo cáo** — ba báo cáo giữ `<table>` trong `.table-scroll`. Đây là màn ít đọc trên phone nhất, đừng đầu tư quá. Commit.

- [ ] **Bước 5: Tracking** — danh sách kiện thành `ListRow`; `create-package-form` chuyển vào `Sheet`. Commit.

- [ ] **Bước 6: Cài đặt và Đăng nhập** — hai màn form thuần, chỉ cần `.field` mới và nút cao ≥44pt. Màn Đăng nhập **không** dùng `AppShell` (chưa đăng nhập) nên tự dựng bố cục căn giữa, dùng `100dvh` chứ không `100vh`. Commit.

- [ ] **Bước 7: Thêm CSS bảng cuộn**

```css
.table-scroll {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  margin: 0 calc(-1 * var(--sp-4));
  padding: 0 var(--sp-4);
}
.table-scroll table {
  min-width: max-content;
  border-collapse: collapse;
  font-size: var(--fs-2);
}
.table-scroll th,
.table-scroll td {
  padding: var(--sp-2) var(--sp-3);
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}
.table-scroll .num {
  font-variant-numeric: tabular-nums;
  text-align: right;
}
```

Trong `legacy.css`, xoá khối `/* ---------- Bảng → thẻ xếp dọc trên mobile ---------- */` (mẹo `td::before { content: attr(data-label) }`) — nó không còn cần và sẽ đánh nhau với `.table-scroll`.

- [ ] **Bước 8: Kiểm cả bảy màn**

Ở 393×852, vào từng màn, chụp màn hình, và với mỗi màn chạy `javascript_tool`:

```js
document.documentElement.scrollWidth <= document.documentElement.clientWidth
```

Phải là `true` ở cả bảy. Đây là bài kiểm "trang không cuộn ngang" — bảng rộng phải cuộn trong khung của nó, không kéo cả trang.

`read_console_messages` `{ onlyErrors: true }` ở mỗi màn: không lỗi.

- [ ] **Bước 9: Typecheck, test**

```bash
npx tsc --noEmit && npm test
```

---

## Task 17: Nới prompt đọc ảnh

Nguồn ảnh không nhất thiết là Zalo — có thể là Messenger, tin nhắn thường, hay ảnh chụp giấy viết tay.

**Files:**
- Modify: `src/lib/zalo-extract.ts`
- Modify: `tests/zalo-extract.test.ts` (nếu có test khẳng định chuỗi prompt)

- [ ] **Bước 1: Đọc prompt hiện tại**

```bash
grep -n "Zalo\|zalo\|HeyP" src/lib/zalo-extract.ts
```

- [ ] **Bước 2: Nới câu mở đầu của prompt**

Sửa phần mô tả bối cảnh: thay khẳng định "đây là ảnh chốt đơn Zalo theo mẫu HeyP" bằng cách nói rằng ảnh **có thể** đến từ Zalo, Messenger, tin nhắn, hoặc ảnh chụp ghi chép tay; mẫu chốt đơn HeyP là dạng thường gặp nhất và được mô tả bên dưới làm ví dụ, nhưng **không phải** dạng duy nhất. Yêu cầu model trả về đúng `responseSchema` sẵn có trong mọi trường hợp, và để trống trường nào không đọc được thay vì bịa.

**Giữ nguyên tuyệt đối:** `responseSchema`, tên trường, kiểu dữ liệu, và mọi ví dụ mẫu HeyP đang có trong prompt. Chỉ nới phần khẳng định về nguồn ảnh.

- [ ] **Bước 3: Chạy test**

```bash
node --test tests/zalo-extract.test.ts
```

Kỳ vọng: PASS. Nếu một test khẳng định chuỗi prompt cũ, sửa test theo prompt mới — đây là thay đổi chủ ý.

- [ ] **Bước 4: KHÔNG gọi API thật trong bước này**

Đọc ảnh thật đụng quota Gemini dùng chung với người dùng thật; dính 429 là hỏng việc của họ. Chỉ kiểm bằng test và `tsc`. Việc thử ảnh thật (một ảnh Zalo chuẩn và một ảnh không phải Zalo) để người dùng tự làm, và báo lại nếu độ chính xác giảm.

- [ ] **Bước 5: Commit**

```bash
npx tsc --noEmit && npm test
```

```bash
git add src/lib/zalo-extract.ts tests/zalo-extract.test.ts
git commit -m "$(cat <<'MSG'
đọc ảnh: prompt không còn giả định ảnh đến từ Zalo

Ảnh có thể từ Messenger, tin nhắn thường, hay chụp giấy viết tay. Mẫu
chốt đơn HeyP vẫn nằm trong prompt làm ví dụ dạng thường gặp nhất.
responseSchema và tên trường giữ nguyên.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Task 18: Desktop, dọn legacy, nghiệm thu cuối

**Files:**
- Modify: `src/styles/layout.css`, `src/styles/tokens.css`
- Delete: `src/styles/legacy.css`
- Modify: `src/app/globals.css`
- Modify: `CLAUDE.md`

- [ ] **Bước 1: Kiểm `legacy.css` còn lại gì**

```bash
grep -c "" src/styles/legacy.css && grep -n "^\." src/styles/legacy.css | head -40
```

Mỗi luật còn lại: hoặc chuyển sang file đúng vai trò trong `src/styles/`, hoặc xoá nếu không còn selector nào dùng tới. Kiểm bằng cách grep tên class trong `src/app`:

```bash
grep -rn "className=\"[^\"]*ten-class" src/app | head
```

- [ ] **Bước 2: Xoá `legacy.css` và alias tạm**

```bash
git rm src/styles/legacy.css
```

Bỏ dòng `@import "../styles/legacy.css";` khỏi `globals.css`, và xoá khối "Alias TẠM cho CSS cũ" ở cuối `tokens.css` (`--card`, `--brand-hover`, `--accent*`, `--font-display`). Chạy `npm run build` để chắc không còn tham chiếu:

```bash
npm run build
```

Kỳ vọng: build thành công. Nếu một màn dùng biến vừa xoá thì sửa màn đó sang biến mới, đừng khôi phục alias.

- [ ] **Bước 3: Viết luật desktop**

Thêm vào cuối `src/styles/layout.css`:

```css
/* ---------- Desktop: từ 900px trở lên ----------
   Cùng component, chỉ đổi vị trí. Sidebar quay lại, tabbar ẩn, sheet
   thành modal giữa màn hình. */
@media (min-width: 900px) {
  .sidebar {
    display: flex;
    position: fixed;
    inset: 0 auto 0 0;
    width: 240px;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-4) var(--sp-3);
    background: var(--brand-deep);
    color: #fff;
    z-index: 20;
  }
  .sidebar-link {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-height: var(--tap);
    padding: 0 var(--sp-3);
    border: none;
    border-left: 3px solid transparent;
    border-radius: var(--radius-sm);
    background: none;
    color: rgba(255, 255, 255, 0.82);
    font-size: var(--fs-2);
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
    width: 100%;
    text-align: left;
  }
  .sidebar-link.active {
    background: rgba(255, 255, 255, 0.14);
    border-left-color: #fff;
    color: #fff;
  }
  .sidebar-brand {
    display: flex;
    align-items: center;
    font-size: var(--fs-5);
    font-weight: 700;
    color: #fff;
    text-decoration: none;
    padding: var(--sp-1) var(--sp-2);
  }
  .sidebar-foot {
    margin-top: auto;
  }
  .sidebar-user {
    font-size: var(--fs-2);
    color: rgba(255, 255, 255, 0.7);
    padding: 0 var(--sp-3);
  }

  .tabbar {
    display: none;
  }
  /* Nút "Nhập nhanh từ ảnh" / "Nhập kho" thôi neo vào header, trôi theo
     dòng nội dung — desktop không có ô hành động cố định để neo vào. */
  .header-action-float {
    position: static;
    height: var(--tap);
    margin-bottom: var(--sp-3);
  }

  .screen-header,
  .app-main,
  .sticky-bar {
    margin-left: 240px;
  }
  .app-main {
    max-width: 960px;
    padding: var(--sp-5);
    padding-bottom: var(--sp-7);
  }
  .app-shell.has-bottom-bar .app-main {
    padding-bottom: 96px;
  }

  /* Sheet thành modal giữa màn hình — cùng component, khác chỗ đứng. */
  .sheet-overlay {
    align-items: center;
    justify-content: center;
  }
  .sheet {
    width: min(560px, 92vw);
    max-height: 80dvh;
    border-radius: var(--radius);
    padding-bottom: 0;
  }
  .sheet-grab {
    display: none;
  }
}
```

- [ ] **Bước 4: Cập nhật `CLAUDE.md`**

Sửa các mục sau cho khớp thực tế mới:
- Dòng trạng thái: thêm "**v5 xong** — giao diện mobile-first cho iPhone…" với đường dẫn spec và plan này.
- Mục **Hosting**: xoá đoạn nói `db-backup.yml` chạy `pg_dump` hằng ngày; thay bằng: sao lưu **thủ công** qua `GET /api/backup`, mốc gần nhất lưu ở `settings.last_backup_at`, Tổng quan nhắc sau 14 ngày, khôi phục bằng `scripts/restore-from-json.ts`.
- Mục **gotchas**: thêm ba dòng — (a) mọi ô nhập phải ≥16px nếu không Safari iOS tự zoom; (b) mọi thanh dính đáy phải cộng `env(safe-area-inset-bottom)`; (c) trừ ví ¥ đi qua `shouldDeductCny`, không viết điều kiện tay ở hai chỗ.
- Mục **Điều hướng**: cập nhật theo `AppShell` chữ ký mới và tabbar 5 ô; ghi rõ CSS nằm ở `src/styles/*` chứ không còn một `globals.css` khổng lồ.
- Mục **Nghiệp vụ cốt lõi**: ghi nhận đường nhập kho chủ động tạo đơn `nhap_kho` rồi đẩy tới `ve_kho_vn`.

- [ ] **Bước 5: Nghiệm thu toàn diện**

`npm test` và `npx tsc --noEmit` và `npm run build` — cả ba phải sạch.

Rồi qua preview, **ba khổ máy**:

`resize_window` `{ width: 393, height: 852 }` (iPhone 15 Pro) — đi hết mười một màn (`/`, `/orders`, `/orders/new`, một `/orders/[id]` với cả bốn tab, `/customers`, `/inventory`, `/tracking`, `/finance`, `/reports`, `/settings`, `/backup`), chụp từng màn.

`resize_window` `{ width: 430, height: 932 }` (15 Pro Max) — đi lại `/`, `/orders`, `/orders/new`, `/orders/[id]`.

`resize_window` `{ preset: "desktop" }` — đi lại cả mười một màn, chắc sidebar hiện, tabbar ẩn, sheet thành modal giữa màn.

Ba bài kiểm bắt buộc, ghi kết quả rõ ràng:

1. **Không zoom khi gõ.** Ở `/orders/new`, chạy `javascript_tool`:
   ```js
   [...document.querySelectorAll("input,select,textarea")]
     .map(el => getComputedStyle(el).fontSize)
     .filter(s => parseFloat(s) < 16)
   ```
   Kỳ vọng: mảng **rỗng**. Có phần tử nào lọt là còn chỗ gây zoom.

2. **Safe-area có luật.** Chạy:
   ```js
   [...document.styleSheets].flatMap(s => { try { return [...s.cssRules] } catch { return [] } })
     .filter(r => r.cssText && r.cssText.includes("safe-area-inset")).length
   ```
   Kỳ vọng: **≥ 3** (tabbar, sticky-bar, screen-header).

3. **Không cuộn ngang.** Ở từng màn:
   ```js
   document.documentElement.scrollWidth <= document.documentElement.clientWidth
   ```
   Kỳ vọng: `true` ở **mọi** màn, cả ba khổ.

- [ ] **Bước 6: Commit cuối**

```bash
git add -A
git commit -m "$(cat <<'MSG'
giao diện: bố cục desktop và dọn sạch CSS cũ

Sidebar quay lại từ 900px, tabbar ẩn, sheet thành modal giữa màn —
cùng component, chỉ đổi chỗ đứng. Xoá legacy.css và các alias token
tạm; globals.css giờ chỉ còn năm dòng @import.

Cập nhật CLAUDE.md theo v5.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

- [ ] **Bước 7: Báo cáo cho người dùng những việc chỉ họ làm được**

Ba việc nằm ngoài tầm với của agent, phải nói rõ chứ đừng lặng lẽ bỏ qua:

1. **Cài ra màn hình chính** và kiểm chế độ standalone trên máy thật — Safari → Chia sẻ → Thêm vào Màn hình chính. Kiểm: tabbar không bị thanh home indicator che, và mọi màn chi tiết quay lại được mà không cần nút Back của trình duyệt.
2. **Thử đọc ảnh thật** (Task 17): một ảnh chốt đơn Zalo chuẩn và một ảnh không phải Zalo, báo lại nếu độ chính xác giảm.
3. **Thay logo thật:** đặt `public/logo.png` rồi chạy lại `scripts/make-pwa-icons.ts`. Icon hiện tại là chữ "HeyP" trên nền navy.
