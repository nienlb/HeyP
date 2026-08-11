# Kế hoạch thực thi HeyP v3-B — Ví ¥, chi phí, dòng tiền & báo cáo

> **Cho người/agent thực thi:** dùng skill `subagent-driven-development` (khuyến nghị) hoặc `executing-plans` để làm từng task một. Các bước dùng cú pháp checkbox (`- [ ]`).

**Mục tiêu:** Biết **giá vốn thật của 1¥**, ghi được chi phí vận hành và ngày tiền chạy, rồi ráp thành ba báo cáo: dòng tiền, lãi/lỗ, và cơ cấu tài sản.

**Kiến trúc:** Ba bảng mới (`cny_ledger`, `expenses`, `payments`). Ví ¥ **không lưu số dư** — số dư và giá vốn bình quân tính lại bằng cách chạy lại sổ, nên về nguyên tắc không thể lệch. Toàn bộ phép tính nằm ở ba module **thuần** (`cny-wallet.ts`, `payments.ts`, `pnl.ts`), UI chỉ đọc kết quả.

**Tech stack:** Next.js 15 App Router, React 19, TypeScript, `node:sqlite` + Drizzle (`sqlite-proxy`), CSS thuần, test bằng `node:test`.

**Spec:** `docs/2026-08-11-heyp-v3b-tai-chinh-design.md`

> **PHỤ THUỘC: phải hoàn tất toàn bộ kế hoạch v3-A trước** (`docs/2026-08-11-heyp-v3a-implementation-plan.md`). v3-B đọc các cột do v3-A tạo: `orders.quoted_total_vnd`, `order_items.margin_vnd`, `order_items.cost_confirmed`, và dùng lại hàm `recomputeOrderMoneyRow` mà v3-A dựng trong `src/db/queries.ts`.

## Ràng buộc toàn cục

Giống hệt kế hoạch v3-A, nhắc lại để task chạy độc lập được:

- **Dùng `node:sqlite`, KHÔNG dùng `better-sqlite3`.**
- **ĐỌC bằng Drizzle** (`db`); **GHI có transaction bằng `sqlite`** (DatabaseSync) thô.
- **`node:sqlite` bind số JS thành REAL** → dựng chuỗi trong JS rồi truyền tham số, **không** nối `|| số ||` trong SQL.
- **Migration viết tay SQL** trong `drizzle/*.sql`, áp bằng `npm run db:migrate`. **KHÔNG** dùng `drizzle-kit`.
- **Test import module bằng đuôi `.ts` tường minh**; module thuần **không được** import file có alias `@/`.
- **UI tiếng Việt.** VND (₫), tệ (¥).
- **KHÔNG `rm data/app.sqlite`.** Trước mỗi lần migrate DB thật: `npm run db:backup`.
- **Commit tiếng Việt**, kết thúc bằng `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Kỳ báo cáo = **tháng dương lịch**. Đơn vào báo cáo lãi theo **ngày Hoàn tất**, đọc từ `order_status_history`.
- `payments.amount_vnd` của khoản `hoan_tra` là **số âm**.

## Bản đồ file

| File | Trách nhiệm |
|---|---|
| `drizzle/0004_v3b_tai_chinh.sql` *(mới)* | 3 bảng mới + backfill `payments` từ `deposit` |
| `src/db/schema.ts` *(sửa)* | Khai báo 3 bảng mới |
| `src/lib/cny-wallet.ts` *(mới)* | Chạy lại sổ ¥ → số dư + giá vốn bq — **thuần** |
| `src/lib/payments.ts` *(mới)* | Tổng đã thu, còn phải thu — **thuần** |
| `src/lib/expenses.ts` *(mới)* | Hằng nhóm chi phí + nhãn — **thuần** |
| `src/lib/pnl.ts` *(mới)* | Báo cáo lãi/lỗ — **thuần** |
| `src/db/queries.ts` *(sửa)* | CRUD 3 bảng, trừ ví khi mua, dữ liệu cho báo cáo |
| `src/app/finance/*` *(mới)* | Ví ¥ + sổ chi phí |
| `src/app/reports/*` *(mới)* | Ba báo cáo theo tháng |
| `src/app/orders/[id]/*` *(sửa)* | Khối Thu tiền |
| `src/app/page.tsx` *(sửa)* | Thẻ Ví ¥ + Lãi tháng này |

---

## Task 1: Ba bảng mới

**Files:**
- Create: `drizzle/0004_v3b_tai_chinh.sql`
- Modify: `src/db/schema.ts`
- Create: `src/lib/expenses.ts`

**Interfaces:**
- Consumes: schema sau v3-A (`orders.quoted_total_vnd`, `order_items.cost_confirmed`).
- Produces: bảng `cny_ledger`, `expenses`, `payments`; từ `src/lib/expenses.ts`: `EXPENSE_CATEGORIES`, `EXPENSE_CATEGORY_LABELS`, `type ExpenseCategory`, `PAYMENT_KINDS`, `PAYMENT_KIND_LABELS`, `type PaymentKind`, `PAYMENT_METHODS`, `type PaymentMethod`, `LEDGER_KINDS`, `type LedgerKind`.

- [ ] **Bước 1: Viết `drizzle/0004_v3b_tai_chinh.sql`**

```sql
-- Migration 0004 (v3-B): ví ¥, chi phí, sổ thu tiền.
--   cny_ledger: MỌI biến động ¥. Số dư & giá vốn bình quân KHÔNG lưu —
--               tính lại bằng cách chạy lại sổ (src/lib/cny-wallet.ts).
--   expenses:   chi phí VND. order_id NULL = chi phí theo kỳ.
--   payments:   sổ thu tiền. orders.deposit trở thành số DẪN XUẤT = Σ payments.

CREATE TABLE cny_ledger (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kind          TEXT NOT NULL,              -- 'nap' | 'chi' | 'dieu_chinh'
  cny_delta     REAL NOT NULL,              -- +120 khi nạp, −60 khi mua hàng
  vnd_paid      INTEGER,                    -- chỉ 'nap': thực trả bao nhiêu VND
  rate_snapshot INTEGER,                    -- chỉ 'chi'/'dieu_chinh': giá vốn đã chốt
  order_id      INTEGER REFERENCES orders(id),
  note          TEXT,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_cny_ledger_order ON cny_ledger(order_id);

CREATE TABLE expenses (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  spent_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  category   TEXT NOT NULL,
  amount_vnd INTEGER NOT NULL,
  order_id   INTEGER REFERENCES orders(id),
  method     TEXT NOT NULL DEFAULT 'chuyen_khoan',
  note       TEXT
);
CREATE INDEX idx_expenses_spent_at ON expenses(spent_at);
CREATE INDEX idx_expenses_order ON expenses(order_id);

CREATE TABLE payments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount_vnd INTEGER NOT NULL,              -- khoản 'hoan_tra' mang dấu ÂM
  paid_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  kind       TEXT NOT NULL,                 -- 'coc' | 'thu_not' | 'hoan_tra'
  method     TEXT NOT NULL DEFAULT 'chuyen_khoan',
  note       TEXT
);
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_paid_at ON payments(paid_at);

-- Backfill: cọc đang lưu ở orders.deposit thành một dòng thu tiền,
-- ngày lấy theo ngày tạo đơn. Sau bước này deposit là số DẪN XUẤT.
INSERT INTO payments (order_id, amount_vnd, paid_at, kind, method, note)
SELECT id, deposit, created_at, 'coc', 'chuyen_khoan', 'Chuyển từ dữ liệu cũ'
  FROM orders WHERE deposit > 0;
```

- [ ] **Bước 2: Chạy thử trên bản sao DB thật**

```bash
cp data/app.sqlite /tmp/heyp-v3b.sqlite && DATABASE_PATH=/tmp/heyp-v3b.sqlite npm run db:migrate
```

Kỳ vọng: `✓ đã áp dụng 0004_v3b_tai_chinh.sql`, không có vi phạm khoá ngoại.

- [ ] **Bước 3: Kiểm backfill khớp tuyệt đối**

```bash
node -e "
const {DatabaseSync}=require('node:sqlite');
const d=new DatabaseSync('/tmp/heyp-v3b.sqlite');
const r=d.prepare('SELECT COUNT(*) c FROM orders o WHERE o.deposit <> (SELECT COALESCE(SUM(p.amount_vnd),0) FROM payments p WHERE p.order_id=o.id)').get();
console.log(r.c===0?'✓ deposit khớp Σ payments cho mọi đơn':'✗ '+r.c+' đơn lệch');
"
```

Kỳ vọng: `✓`. Lệch thì dừng, sửa migration, xoá `/tmp/heyp-v3b.sqlite` rồi làm lại từ Bước 2.

- [ ] **Bước 4: Viết `src/lib/expenses.ts`**

```ts
/**
 * Hằng phân loại cho sổ chi phí, sổ thu tiền và sổ ví ¥ (spec v3-B mục 3).
 * Module thuần — dùng chung cho schema, query, UI và test.
 */

export const EXPENSE_CATEGORIES = [
  "bao_bi",
  "tem_nhan",
  "quang_cao",
  "luong",
  "ship_tra_shipper",
  "den_khach",
  "khac",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  bao_bi: "Bao bì",
  tem_nhan: "Tem nhãn",
  quang_cao: "Quảng cáo",
  luong: "Lương",
  ship_tra_shipper: "Ship trả shipper",
  den_khach: "Đền khách",
  khac: "Khác",
};

export const PAYMENT_KINDS = ["coc", "thu_not", "hoan_tra"] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

export const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = {
  coc: "Cọc",
  thu_not: "Thu nốt",
  hoan_tra: "Hoàn trả khách",
};

export const PAYMENT_METHODS = ["chuyen_khoan", "tien_mat"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  chuyen_khoan: "Chuyển khoản",
  tien_mat: "Tiền mặt",
};

export const LEDGER_KINDS = ["nap", "chi", "dieu_chinh"] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

export const LEDGER_KIND_LABELS: Record<LedgerKind, string> = {
  nap: "Nạp ¥",
  chi: "Mua hàng",
  dieu_chinh: "Điều chỉnh",
};
```

- [ ] **Bước 5: Khai báo ba bảng trong `src/db/schema.ts`**

Thêm vào cuối file (import các hằng từ `@/lib/expenses`):

```ts
// 8) Sổ ví ¥ — số dư và giá vốn bq KHÔNG lưu, tính lại từ sổ.
export const cnyLedger = sqliteTable("cny_ledger", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", { enum: LEDGER_KINDS }).notNull(),
  cnyDelta: real("cny_delta").notNull(),
  vndPaid: integer("vnd_paid"),
  rateSnapshot: integer("rate_snapshot"),
  orderId: integer("order_id").references(() => orders.id),
  note: text("note"),
  createdAt: createdAt(),
});

// 9) Chi phí VND. order_id NULL = chi phí theo kỳ.
export const expenses = sqliteTable("expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  spentAt: integer("spent_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  category: text("category", { enum: EXPENSE_CATEGORIES }).notNull(),
  amountVnd: integer("amount_vnd").notNull(),
  orderId: integer("order_id").references(() => orders.id),
  method: text("method", { enum: PAYMENT_METHODS })
    .notNull()
    .default("chuyen_khoan"),
  note: text("note"),
});

// 10) Sổ thu tiền — orders.deposit là Σ của bảng này.
export const payments = sqliteTable("payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  amountVnd: integer("amount_vnd").notNull(),
  paidAt: integer("paid_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  kind: text("kind", { enum: PAYMENT_KINDS }).notNull(),
  method: text("method", { enum: PAYMENT_METHODS })
    .notNull()
    .default("chuyen_khoan"),
  note: text("note"),
});
```

- [ ] **Bước 6: Migrate DB thật, typecheck, commit**

```bash
npm run db:backup && npm run db:migrate && npm test && npx tsc --noEmit
```

```bash
git add drizzle/0004_v3b_tai_chinh.sql src/db/schema.ts src/lib/expenses.ts
git commit -m "$(cat <<'EOF'
v3B-1: ba bảng tài chính — sổ ví ¥, chi phí, thu tiền

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `cny-wallet.ts` — chạy lại sổ ví ¥

**Files:**
- Create: `src/lib/cny-wallet.ts`
- Test: `tests/cny-wallet.test.ts`

**Interfaces:**
- Consumes: `type LedgerKind` (Task 1).
- Produces:
  - `type LedgerEntry = { kind: LedgerKind; cnyDelta: number; vndPaid: number | null }`
  - `type WalletState = { balance: number; avgCost: number }`
  - `replayLedger(entries: LedgerEntry[]): WalletState`
  - `currentRate(entries: LedgerEntry[]): number`
  - `walletValueVnd(state: WalletState): number`

- [ ] **Bước 1: Viết test thất bại**

Tạo `tests/cny-wallet.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  currentRate,
  replayLedger,
  walletValueVnd,
  type LedgerEntry,
} from "../src/lib/cny-wallet.ts";

const nap = (cny: number, vnd: number): LedgerEntry => ({
  kind: "nap",
  cnyDelta: cny,
  vndPaid: vnd,
});
const chi = (cny: number): LedgerEntry => ({
  kind: "chi",
  cnyDelta: -cny,
  vndPaid: null,
});

test("sổ rỗng → số dư 0, giá vốn 0", () => {
  const s = replayLedger([]);
  assert.equal(s.balance, 0);
  assert.equal(s.avgCost, 0);
});

test("nạp lần đầu: giá vốn = VND trả ÷ ¥ nhận", () => {
  // 10.000.000₫ mua 2.700¥ → 3.703,7₫/¥
  const s = replayLedger([nap(2700, 10000000)]);
  assert.equal(s.balance, 2700);
  assert.equal(Math.round(s.avgCost), 3704);
});

test("nạp đợt hai: bình quân gia quyền", () => {
  // 1000¥ giá 3.600 + 1000¥ giá 3.800 → bq 3.700
  const s = replayLedger([nap(1000, 3600000), nap(1000, 3800000)]);
  assert.equal(s.balance, 2000);
  assert.equal(s.avgCost, 3700);
});

test("chi tiền chỉ trừ số dư, KHÔNG làm đổi giá vốn", () => {
  const s = replayLedger([nap(1000, 3600000), chi(400)]);
  assert.equal(s.balance, 600);
  assert.equal(s.avgCost, 3600);
});

test("chi rồi nạp tiếp: bình quân tính trên số dư CÒN LẠI", () => {
  // còn 600¥ giá 3.600 (=2.160.000) + nạp 400¥ giá 4.000 (=1.600.000)
  // → (2.160.000 + 1.600.000) / 1000 = 3.760
  const s = replayLedger([nap(1000, 3600000), chi(400), nap(400, 1600000)]);
  assert.equal(s.balance, 1000);
  assert.equal(s.avgCost, 3760);
});

test("số dư âm được phép — ghi được sự thật quan trọng hơn sổ đẹp", () => {
  const s = replayLedger([nap(100, 360000), chi(300)]);
  assert.equal(s.balance, -200);
});

test("nạp khi số dư ÂM → ĐẶT LẠI giá vốn, không bình quân với số âm", () => {
  // Bình quân với số dư âm cho ra giá vốn vô nghĩa (thậm chí âm).
  const s = replayLedger([nap(100, 360000), chi(300), nap(500, 2000000)]);
  assert.equal(s.balance, 300);
  assert.equal(s.avgCost, 4000, "giá vốn phải đặt lại = 2.000.000/500");
});

test("nạp khi số dư đúng bằng 0 → đặt lại giá vốn", () => {
  const s = replayLedger([nap(100, 360000), chi(100), nap(200, 800000)]);
  assert.equal(s.balance, 200);
  assert.equal(s.avgCost, 4000);
});

test("dòng điều chỉnh cư xử như chi: chỉ đổi số dư", () => {
  const s = replayLedger([
    nap(1000, 3600000),
    chi(400),
    { kind: "dieu_chinh", cnyDelta: -50, vndPaid: null },
  ]);
  assert.equal(s.balance, 550);
  assert.equal(s.avgCost, 3600);
});

test("điều chỉnh dương (nhập ¥ thừa, trả lại ví)", () => {
  const s = replayLedger([
    nap(1000, 3600000),
    chi(400),
    { kind: "dieu_chinh", cnyDelta: 30, vndPaid: null },
  ]);
  assert.equal(s.balance, 630);
  assert.equal(s.avgCost, 3600);
});

test("nạp với ¥ bằng 0 bị bỏ qua, không làm vỡ phép chia", () => {
  const s = replayLedger([nap(1000, 3600000), nap(0, 500000)]);
  assert.equal(s.balance, 1000);
  assert.equal(s.avgCost, 3600);
});

test("currentRate trả giá vốn hiện tại để chốt cứng vào đơn", () => {
  assert.equal(currentRate([nap(1000, 3600000)]), 3600);
  assert.equal(currentRate([]), 0);
});

test("quy giá trị ví ra VND", () => {
  assert.equal(walletValueVnd({ balance: 1000, avgCost: 3600 }), 3600000);
  assert.equal(walletValueVnd({ balance: -200, avgCost: 3600 }), -720000);
});
```

- [ ] **Bước 2: Chạy test, xác nhận nó hỏng**

```bash
npm test -- --test-name-pattern="sổ rỗng"
```

Kỳ vọng: FAIL — `Cannot find module '../src/lib/cny-wallet.ts'`.

- [ ] **Bước 3: Viết `src/lib/cny-wallet.ts`**

```ts
/**
 * Ví tiền tệ (spec v3-B mục 2.2, 4.1).
 *
 * KHÔNG lưu số dư và giá vốn bình quân — chúng được tính lại bằng cách chạy
 * lại toàn bộ sổ chuyển động mỗi lần đọc. Một lần ghi hỏng giữa chừng không
 * thể để lại lệch vĩnh viễn, vì chẳng có gì để lệch.
 *
 * Giá vốn bình quân gia quyền, cùng công thức với inventory.avgCost.
 *
 * Module thuần, không phụ thuộc DB.
 */
import type { LedgerKind } from "./expenses";

export type LedgerEntry = {
  kind: LedgerKind;
  /** +120 khi nạp, −60 khi mua hàng. */
  cnyDelta: number;
  /** Chỉ với 'nap': thực trả bao nhiêu VND. */
  vndPaid: number | null;
};

export type WalletState = {
  /** Số dư ¥. Có thể ÂM — nghĩa là có đợt nạp chưa ghi. */
  balance: number;
  /** Giá vốn bình quân (VND cho 1¥). */
  avgCost: number;
};

/**
 * Chạy lại sổ theo thứ tự thời gian.
 *
 * - `nap` khi số dư > 0 → bình quân gia quyền với phần đang giữ.
 * - `nap` khi số dư ≤ 0 → ĐẶT LẠI giá vốn = vndPaid / cnyDelta. Bình quân với
 *   số dư âm cho ra giá vốn vô nghĩa (có thể âm), nên phải cắt ở đây.
 * - `chi` / `dieu_chinh` → chỉ đổi số dư, giá vốn giữ nguyên. Giá vốn của đơn
 *   đã được chốt cứng vào rate_snapshot của dòng sổ, không phụ thuộc chỗ này.
 */
export function replayLedger(entries: LedgerEntry[]): WalletState {
  let balance = 0;
  let avgCost = 0;

  for (const e of entries) {
    if (e.kind === "nap") {
      const cnyIn = e.cnyDelta;
      const vndIn = e.vndPaid ?? 0;
      // Đợt nạp rỗng: bỏ qua, đừng chia cho 0.
      if (!(cnyIn > 0)) continue;

      if (balance > 0) {
        avgCost = (balance * avgCost + vndIn) / (balance + cnyIn);
      } else {
        avgCost = vndIn / cnyIn;
      }
      balance += cnyIn;
    } else {
      balance += e.cnyDelta;
    }
  }

  return { balance, avgCost };
}

/** Giá vốn bình quân hiện tại — dùng để chốt cứng rate_snapshot khi mua hàng. */
export function currentRate(entries: LedgerEntry[]): number {
  return replayLedger(entries).avgCost;
}

/** Giá trị ví quy ra VND (làm tròn về đồng). */
export function walletValueVnd(state: WalletState): number {
  return Math.round(state.balance * state.avgCost);
}
```

- [ ] **Bước 4: Chạy test + typecheck**

```bash
npm test && npx tsc --noEmit
```

- [ ] **Bước 5: Commit**

```bash
git add src/lib/cny-wallet.ts tests/cny-wallet.test.ts
git commit -m "$(cat <<'EOF'
v3B-2: ví ¥ — chạy lại sổ ra số dư và giá vốn bình quân

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `payments.ts` + `orders.deposit` thành số dẫn xuất

**Files:**
- Create: `src/lib/payments.ts`
- Test: `tests/payments.test.ts`
- Modify: `src/db/queries.ts`
- Modify: `src/app/orders/actions.ts`

**Interfaces:**
- Consumes: `type PaymentKind`, `type PaymentMethod` (Task 1); `recomputeOrderMoneyRow` (v3-A Task 5).
- Produces:
  - `type PaymentLike = { amountVnd: number }`
  - `sumPaid(payments: PaymentLike[]): number`
  - `amountDue(quotedTotalVnd: number, shippingFee: number, payments: PaymentLike[]): number`
  - Từ `queries.ts`: `addPayment(input): LineActionResult`, `deletePayment(id: number, orderId: number): LineActionResult`, `listPaymentsForOrder(orderId: number)`, `suggestFinalPayment(orderId: number): number`

- [ ] **Bước 1: Viết test thất bại**

Tạo `tests/payments.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { amountDue, sumPaid } from "../src/lib/payments.ts";

test("chưa trả đồng nào", () => {
  assert.equal(sumPaid([]), 0);
  assert.equal(amountDue(410000, 0, []), 410000);
});

test("cọc rồi thu nốt", () => {
  const ps = [{ amountVnd: 100000 }, { amountVnd: 310000 }];
  assert.equal(sumPaid(ps), 410000);
  assert.equal(amountDue(410000, 0, ps), 0);
});

test("hoàn trả mang dấu âm nên tự trừ, không cần nhánh riêng", () => {
  const ps = [{ amountVnd: 410000 }, { amountVnd: -50000 }];
  assert.equal(sumPaid(ps), 360000);
  assert.equal(amountDue(410000, 0, ps), 50000);
});

test("ship cộng vào phần phải thu", () => {
  assert.equal(amountDue(410000, 30000, [{ amountVnd: 100000 }]), 340000);
});

test("khách trả dư → còn phải thu âm (phải hoàn lại khách)", () => {
  assert.equal(amountDue(410000, 0, [{ amountVnd: 500000 }]), -90000);
});

test("làm tròn về số nguyên đồng", () => {
  assert.equal(amountDue(410000.4, 0.4, [{ amountVnd: 0 }]), 410000);
});
```

- [ ] **Bước 2: Chạy test, xác nhận nó hỏng**

```bash
npm test -- --test-name-pattern="chưa trả đồng nào"
```

Kỳ vọng: FAIL — module chưa tồn tại.

- [ ] **Bước 3: Viết `src/lib/payments.ts`**

```ts
/**
 * Sổ thu tiền (spec v3-B mục 3, 4.3).
 *
 * orders.deposit là số DẪN XUẤT = Σ payments. Một chỗ tính duy nhất, để
 * không rơi vào bẫy hai nguồn chân lý.
 *
 * Module thuần, không phụ thuộc DB.
 */

export type PaymentLike = {
  /** Khoản 'hoan_tra' mang dấu ÂM nên phép cộng vẫn đúng. */
  amountVnd: number;
};

/** Tổng đã thu của một đơn. */
export function sumPaid(payments: PaymentLike[]): number {
  return payments.reduce((sum, p) => sum + Math.round(p.amountVnd), 0);
}

/** Còn phải thu = tiền hàng + ship − đã thu. Âm nghĩa là phải hoàn lại khách. */
export function amountDue(
  quotedTotalVnd: number,
  shippingFee: number,
  payments: PaymentLike[],
): number {
  return (
    Math.round(quotedTotalVnd) + Math.round(shippingFee) - sumPaid(payments)
  );
}
```

- [ ] **Bước 4: Chạy test, xác nhận xanh**

```bash
npm test -- --test-name-pattern="cọc rồi thu nốt|hoàn trả mang dấu âm|khách trả dư"
```

- [ ] **Bước 5: CRUD thu tiền trong `src/db/queries.ts`**

```ts
// ---------- Sổ thu tiền ----------

export async function listPaymentsForOrder(orderId: number) {
  return db
    .select()
    .from(payments)
    .where(eq(payments.orderId, orderId))
    .orderBy(payments.paidAt, payments.id);
}

/** Số tiền đề xuất cho khoản "thu nốt": đúng bằng phần còn phải thu. */
export function suggestFinalPayment(orderId: number): number {
  const row = sqlite
    .prepare(
      `SELECT o.quoted_total_vnd AS total, o.shipping_fee AS ship,
              COALESCE((SELECT SUM(p.amount_vnd) FROM payments p
                         WHERE p.order_id = o.id), 0) AS paid
         FROM orders o WHERE o.id = ?`,
    )
    .get(orderId) as
    | { total: number; ship: number; paid: number }
    | undefined;
  if (!row) return 0;
  return row.total + row.ship - row.paid;
}

export type AddPaymentInput = {
  orderId: number;
  amountVnd: number;
  paidAt: Date;
  kind: PaymentKind;
  method: PaymentMethod;
  note?: string | null;
};

export function addPayment(input: AddPaymentInput): LineActionResult {
  // Hoàn trả lưu số ÂM; các khoản thu phải dương.
  const amount =
    input.kind === "hoan_tra"
      ? -Math.abs(Math.round(input.amountVnd))
      : Math.round(input.amountVnd);
  if (amount === 0) return { ok: false, reason: "Số tiền phải khác 0" };

  sqlite.exec("BEGIN");
  try {
    sqlite
      .prepare(
        `INSERT INTO payments (order_id, amount_vnd, paid_at, kind, method, note)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.orderId,
        amount,
        Math.floor(input.paidAt.getTime() / 1000),
        input.kind,
        input.method,
        input.note ?? null,
      );
    syncOrderDeposit(input.orderId);
    sqlite.exec("COMMIT");
    return { ok: true };
  } catch (err) {
    sqlite.exec("ROLLBACK");
    return { ok: false, reason: (err as Error).message };
  }
}

export function deletePayment(id: number, orderId: number): LineActionResult {
  sqlite.exec("BEGIN");
  try {
    sqlite
      .prepare("DELETE FROM payments WHERE id = ? AND order_id = ?")
      .run(id, orderId);
    syncOrderDeposit(orderId);
    sqlite.exec("COMMIT");
    return { ok: true };
  } catch (err) {
    sqlite.exec("ROLLBACK");
    return { ok: false, reason: (err as Error).message };
  }
}

/**
 * Đồng bộ orders.deposit từ sổ thu tiền rồi tính lại khối tiền của đơn.
 * Gọi BÊN TRONG transaction đang mở.
 */
function syncOrderDeposit(orderId: number): void {
  const row = sqlite
    .prepare(
      `SELECT COALESCE(SUM(amount_vnd), 0) AS paid FROM payments WHERE order_id = ?`,
    )
    .get(orderId) as { paid: number };

  sqlite
    .prepare("UPDATE orders SET deposit = ? WHERE id = ?")
    .run(row.paid, orderId);

  const order = sqlite
    .prepare("SELECT exchange_rate, shipping_fee, deposit FROM orders WHERE id = ?")
    .get(orderId) as {
    exchange_rate: number;
    shipping_fee: number;
    deposit: number;
  };
  recomputeOrderMoneyRow(orderId, order);
}
```

- [ ] **Bước 6: Ô cọc ở màn tạo đơn sinh dòng `payments`**

Trong `createOrder` (`src/db/queries.ts`), sau khi chèn `order_items` và trước `COMMIT`, thay việc ghi thẳng `deposit` bằng:

```ts
    // Cọc đọc từ ảnh Zalo → một dòng thu tiền, không ghi thẳng vào orders.deposit
    // (deposit giờ là số dẫn xuất, xem spec v3-B mục 3).
    if (input.deposit > 0) {
      sqlite
        .prepare(
          `INSERT INTO payments (order_id, amount_vnd, paid_at, kind, method, note)
           VALUES (?, ?, unixepoch(), 'coc', 'chuyen_khoan', NULL)`,
        )
        .run(orderId, Math.round(input.deposit));
    }
```

`orders.deposit` vẫn được ghi giá trị ban đầu trong câu `INSERT INTO orders` như cũ — hai con số khớp nhau ngay từ đầu, và mọi thay đổi về sau đi qua `syncOrderDeposit`.

- [ ] **Bước 7: Server action thêm/xoá khoản thu**

Trong `src/app/orders/actions.ts`, thêm `addPaymentAction` và `deletePaymentAction` theo đúng khuôn `lineExceptionAction` (kiểm phiên → gọi query → `revalidatePath` → `redirect` kèm `?err=` khi hỏng).

- [ ] **Bước 8: Test + typecheck + commit**

```bash
npm test && npx tsc --noEmit
```

```bash
git add src/lib/payments.ts tests/payments.test.ts src/db/queries.ts src/app/orders/actions.ts
git commit -m "$(cat <<'EOF'
v3B-3: sổ thu tiền — deposit thành số dẫn xuất từ payments

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Trừ ví ¥ khi mua hàng TQ

**Files:**
- Modify: `src/db/queries.ts`

**Interfaces:**
- Consumes: `currentRate` (Task 2); `changeOrderStatus`, `updateLineCost` (đã có / v3-A).
- Produces: `listLedger()`, `addTopup(input): LineActionResult`, `deleteLedgerEntry(id): LineActionResult`, `getWallet(): WalletState`; side-effect trừ ví trong `changeOrderStatus`.

- [ ] **Bước 1: Đọc ví và ghi đợt nạp**

```ts
// ---------- Ví ¥ ----------

export function listLedger() {
  return sqlite
    .prepare(
      `SELECT id, kind, cny_delta AS cnyDelta, vnd_paid AS vndPaid,
              rate_snapshot AS rateSnapshot, order_id AS orderId, note,
              created_at AS createdAt
         FROM cny_ledger ORDER BY created_at, id`,
    )
    .all() as {
    id: number;
    kind: LedgerKind;
    cnyDelta: number;
    vndPaid: number | null;
    rateSnapshot: number | null;
    orderId: number | null;
    note: string | null;
    createdAt: number;
  }[];
}

export function getWallet(): WalletState {
  return replayLedger(listLedger());
}

export function addTopup(input: {
  cny: number;
  vndPaid: number;
  note?: string | null;
}): LineActionResult {
  if (!(input.cny > 0)) return { ok: false, reason: "Số tệ phải lớn hơn 0" };
  if (!(input.vndPaid > 0))
    return { ok: false, reason: "Số tiền trả phải lớn hơn 0" };

  sqlite
    .prepare(
      `INSERT INTO cny_ledger (kind, cny_delta, vnd_paid, note)
       VALUES ('nap', ?, ?, ?)`,
    )
    .run(input.cny, Math.round(input.vndPaid), input.note ?? null);
  return { ok: true };
}

/**
 * Chỉ cho xoá dòng 'nap' — dòng 'chi' sinh tự động từ trạng thái đơn.
 *
 * Spec mục 7 nói "sửa/xoá đợt nạp"; ở đây chỉ làm XOÁ, sửa = xoá rồi nạp lại.
 * Kết quả giống hệt (số dư chạy lại từ sổ) mà không phải dựng thêm form sửa.
 */
export function deleteLedgerEntry(id: number): LineActionResult {
  const row = sqlite
    .prepare("SELECT kind FROM cny_ledger WHERE id = ?")
    .get(id) as { kind: LedgerKind } | undefined;
  if (!row) return { ok: false, reason: "Không tìm thấy dòng sổ" };
  if (row.kind !== "nap")
    return {
      ok: false,
      reason: "Chỉ xoá được đợt nạp. Dòng mua hàng sửa bằng cách ghi điều chỉnh.",
    };
  sqlite.prepare("DELETE FROM cny_ledger WHERE id = ?").run(id);
  return { ok: true };
}
```

- [ ] **Bước 2: Trừ ví trong `changeOrderStatus`**

Trong `changeOrderStatus` (`src/db/queries.ts`), thêm ngay sau khối `if (to === "khach_bom") { ... }`, vẫn **bên trong** transaction:

```ts
    // Đã mua hàng TQ → trừ ví ¥ và CHỐT CỨNG giá vốn tại thời điểm này.
    // Nạp ¥ đợt sau rẻ hơn không được làm đổi lãi/lỗ của đơn đã mua rồi.
    if (to === "da_mua_tq" && order.goods_total_cny > 0) {
      const rate = Math.round(currentRate(listLedger()));
      sqlite
        .prepare(
          `INSERT INTO cny_ledger (kind, cny_delta, rate_snapshot, order_id, note)
           VALUES ('chi', ?, ?, ?, ?)`,
        )
        .run(-order.goods_total_cny, rate, id, `Mua hàng đơn #${id}`);
    }
```

Đơn có `goods_total_cny = 0` thì **không ghi dòng nào** — dòng chi 0¥ vô nghĩa. Cảnh báo hiển thị ở UI (Task 7).

- [ ] **Bước 3: Ghi `dieu_chinh` khi giá ¥ đổi sau lúc mua**

Trong `updateLineCost` (v3-A Task 5), sau khi cập nhật dòng và **trước** `recomputeOrderMoneyRow`, chèn:

```ts
    // Đơn đã mua hàng rồi mà giá ¥ mới sửa → ghi dòng điều chỉnh bằng phần
    // chênh. Sổ ví là append-only: không bao giờ sửa quá khứ.
    const spent = sqlite
      .prepare(
        `SELECT COALESCE(SUM(-cny_delta), 0) AS cny
           FROM cny_ledger WHERE order_id = ? AND kind IN ('chi','dieu_chinh')`,
      )
      .get(orderId) as { cny: number };

    if (spent.cny > 0) {
      const agg = sqlite
        .prepare(
          "SELECT COALESCE(SUM(quantity * unit_price_cny), 0) AS cny FROM order_items WHERE order_id = ?",
        )
        .get(orderId) as { cny: number };
      const diff = agg.cny - spent.cny;
      if (Math.abs(diff) > 0.0001) {
        const rate = Math.round(currentRate(listLedger()));
        sqlite
          .prepare(
            `INSERT INTO cny_ledger (kind, cny_delta, rate_snapshot, order_id, note)
             VALUES ('dieu_chinh', ?, ?, ?, ?)`,
          )
          .run(-diff, rate, orderId, `Sửa giá ¥ đơn #${orderId}`);
      }
    }
```

- [ ] **Bước 4: Kiểm bằng tay trên DB thật**

```bash
npm run db:backup
```

Qua preview: nạp một đợt ¥ ở `/finance`, cho một đơn đi tới *Đã mua hàng TQ*, rồi:

```bash
node -e "
const {DatabaseSync}=require('node:sqlite');
const d=new DatabaseSync('data/app.sqlite');
console.table(d.prepare('SELECT id,kind,cny_delta,vnd_paid,rate_snapshot,order_id FROM cny_ledger ORDER BY id').all());
"
```

Kỳ vọng: một dòng `nap` có `vnd_paid`, một dòng `chi` có `rate_snapshot` khác 0 và `order_id` đúng.

- [ ] **Bước 5: Test + typecheck + commit**

```bash
npm test && npx tsc --noEmit
```

```bash
git add src/db/queries.ts
git commit -m "$(cat <<'EOF'
v3B-4: trừ ví ¥ khi mua hàng TQ, chốt cứng giá vốn, ghi điều chỉnh khi sửa ¥

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `pnl.ts` — báo cáo lãi/lỗ

**Files:**
- Create: `src/lib/pnl.ts`
- Test: `tests/pnl.test.ts`

**Interfaces:**
- Consumes: `type ExpenseCategory` (Task 1); `type OrderType` (`src/lib/order-status.ts`).
- Produces: `type PnlOrder`, `type PnlExpense`, `type PnlInput`, `type PnlBlock`, `type PnlReport`, `computePnl(input: PnlInput): PnlReport`.

- [ ] **Bước 1: Viết test thất bại**

Tạo `tests/pnl.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { computePnl, type PnlOrder } from "../src/lib/pnl.ts";

/** Đơn 60¥, bán 410.000 (60×4000 + 170.000 lời), giá vốn thật 3.600₫/¥. */
const order = (over: Partial<PnlOrder> = {}): PnlOrder => ({
  id: 1,
  orderType: "order_ho",
  quotedTotalVnd: 410000,
  shippingFee: 0,
  goodsTotalCny: 60,
  sellRate: 4000,
  costRate: 3600,
  saleCost: null,
  costConfirmed: true,
  marginVnd: 170000,
  ...over,
});

test("tháng trống → mọi số bằng 0, không chia cho 0", () => {
  const r = computePnl({ orders: [], expenses: [], bomDepositsVnd: 0 });
  assert.equal(r.netProfitVnd, 0);
  assert.equal(r.allocatedPerOrderVnd, null);
});

test("một đơn: lời gộp tách thành lời định giá và lời chênh tỷ giá", () => {
  const r = computePnl({ orders: [order()], expenses: [], bomDepositsVnd: 0 });
  assert.equal(r.confirmed.revenueVnd, 410000);
  assert.equal(r.confirmed.goodsCostVnd, 216000); // 60 × 3600
  assert.equal(r.confirmed.grossProfitVnd, 194000);
  assert.equal(r.confirmed.pricingMarginVnd, 170000);
  assert.equal(r.confirmed.fxMarginVnd, 24000); // 60 × (4000 − 3600)
});

test("BẤT BIẾN: lời gộp = lời định giá + lời chênh tỷ giá", () => {
  const r = computePnl({
    orders: [order(), order({ id: 2, goodsTotalCny: 88.5, costRate: 3712 })],
    expenses: [],
    bomDepositsVnd: 0,
  });
  assert.equal(
    r.confirmed.grossProfitVnd,
    r.confirmed.pricingMarginVnd + r.confirmed.fxMarginVnd,
  );
});

test("đơn còn dòng chưa xác nhận ¥ nằm ở khối ƯỚC TÍNH, không trộn", () => {
  const r = computePnl({
    orders: [order(), order({ id: 2, costConfirmed: false })],
    expenses: [],
    bomDepositsVnd: 0,
  });
  assert.equal(r.confirmed.orderCount, 1);
  assert.equal(r.estimated.orderCount, 1);
  assert.equal(r.confirmed.revenueVnd, 410000);
  assert.equal(r.estimated.revenueVnd, 410000);
});

test("đơn bán từ kho lấy giá vốn ở sale_cost, không dính ví ¥", () => {
  const r = computePnl({
    orders: [
      order({
        orderType: "ban_tu_kho",
        quotedTotalVnd: 500000,
        goodsTotalCny: 500000,
        sellRate: 1,
        costRate: null,
        saleCost: 300000,
        marginVnd: 0,
      }),
    ],
    expenses: [],
    bomDepositsVnd: 0,
  });
  assert.equal(r.confirmed.goodsCostVnd, 300000);
  assert.equal(r.confirmed.grossProfitVnd, 200000);
  assert.equal(r.confirmed.fxMarginVnd, 0, "hàng tồn kho không có chênh tỷ giá");
});

test("chưa mua hàng (chưa có giá vốn chốt) → coi như không có chênh tỷ giá", () => {
  const r = computePnl({
    orders: [order({ costRate: null })],
    expenses: [],
    bomDepositsVnd: 0,
  });
  assert.equal(r.confirmed.goodsCostVnd, 240000); // dùng tỷ giá bán
  assert.equal(r.confirmed.fxMarginVnd, 0);
});

test("chi phí gắn đơn trừ vào khối của đơn đó", () => {
  const r = computePnl({
    orders: [order()],
    expenses: [{ amountVnd: 30000, category: "ship_tra_shipper", orderId: 1 }],
    bomDepositsVnd: 0,
  });
  assert.equal(r.confirmed.orderExpensesVnd, 30000);
  assert.equal(r.periodExpensesVnd, 0);
});

test("chi phí không gắn đơn là chi phí theo kỳ, chia bình quân", () => {
  const r = computePnl({
    orders: [order(), order({ id: 2 })],
    expenses: [{ amountVnd: 500000, category: "quang_cao", orderId: null }],
    bomDepositsVnd: 0,
  });
  assert.equal(r.periodExpensesVnd, 500000);
  assert.equal(r.allocatedPerOrderVnd, 250000);
});

test("có chi phí kỳ nhưng KHÔNG đơn nào → không chia cho 0", () => {
  const r = computePnl({
    orders: [],
    expenses: [{ amountVnd: 500000, category: "luong", orderId: null }],
    bomDepositsVnd: 0,
  });
  assert.equal(r.periodExpensesVnd, 500000);
  assert.equal(r.allocatedPerOrderVnd, null);
  assert.equal(r.netProfitVnd, -500000);
});

test("ship thu cộng vào, cọc đơn khách bom cộng vào", () => {
  const r = computePnl({
    orders: [order({ shippingFee: 30000 })],
    expenses: [],
    bomDepositsVnd: 100000,
  });
  assert.equal(r.confirmed.shipCollectedVnd, 30000);
  assert.equal(r.bomDepositsVnd, 100000);
  assert.equal(r.netProfitVnd, 194000 + 30000 + 100000);
});

test("lãi ròng gộp đủ mọi thành phần", () => {
  const r = computePnl({
    orders: [order(), order({ id: 2, costConfirmed: false })],
    expenses: [
      { amountVnd: 30000, category: "den_khach", orderId: 1 },
      { amountVnd: 200000, category: "bao_bi", orderId: null },
    ],
    bomDepositsVnd: 50000,
  });
  // (194.000 − 30.000) + 194.000 − 200.000 + 50.000
  assert.equal(r.netProfitVnd, 208000);
});

test("gộp chi phí kỳ theo nhóm để hiển thị", () => {
  const r = computePnl({
    orders: [order()],
    expenses: [
      { amountVnd: 100000, category: "bao_bi", orderId: null },
      { amountVnd: 50000, category: "bao_bi", orderId: null },
      { amountVnd: 300000, category: "quang_cao", orderId: null },
    ],
    bomDepositsVnd: 0,
  });
  const byCat = Object.fromEntries(
    r.periodExpenseByCategory.map((c) => [c.category, c.amountVnd]),
  );
  assert.equal(byCat.bao_bi, 150000);
  assert.equal(byCat.quang_cao, 300000);
});
```

- [ ] **Bước 2: Chạy test, xác nhận nó hỏng**

```bash
npm test -- --test-name-pattern="tháng trống"
```

- [ ] **Bước 3: Viết `src/lib/pnl.ts`**

```ts
/**
 * Báo cáo lãi/lỗ theo tháng (spec v3-B mục 6.2).
 *
 * Đơn chỉ vào đây khi đã HOÀN TẤT — nhờ vậy con số lãi không bao giờ bị khách
 * bom hay huỷ đơn làm sai ngược.
 *
 * Hai khối tách bạch, KHÔNG trộn: "chắc chắn" (mọi dòng đã xác nhận giá ¥) và
 * "đang ước tính" (còn dòng dùng giá gợi ý). Một con số lãi dựng trên phỏng
 * đoán mà trông như sự thật thì nguy hơn là không có con số nào.
 *
 * Module thuần, không phụ thuộc DB.
 */
import type { ExpenseCategory } from "./expenses";
import type { OrderType } from "./order-status";

export type PnlOrder = {
  id: number;
  orderType: OrderType;
  /** Total đã chốt với khách (không gồm ship). */
  quotedTotalVnd: number;
  shippingFee: number;
  /** Tổng ¥ của đơn. Đơn ban_tu_kho: đây là VND với sellRate = 1. */
  goodsTotalCny: number;
  /** Tỷ giá BÁN của đơn (4000). */
  sellRate: number;
  /** Giá vốn ¥ đã chốt cứng lúc mua. null = chưa mua / không áp dụng. */
  costRate: number | null;
  /** Giá vốn tồn kho, chỉ đơn ban_tu_kho. */
  saleCost: number | null;
  /** Mọi dòng của đơn đã xác nhận giá ¥? */
  costConfirmed: boolean;
  /** Σ order_items.margin_vnd. */
  marginVnd: number;
};

export type PnlExpense = {
  amountVnd: number;
  category: ExpenseCategory;
  /** null = chi phí theo kỳ. */
  orderId: number | null;
};

export type PnlInput = {
  /** Đơn hoàn tất trong tháng. */
  orders: PnlOrder[];
  /** Chi phí phát sinh trong tháng (cả gắn đơn lẫn theo kỳ). */
  expenses: PnlExpense[];
  /** Cọc giữ được từ các đơn chuyển sang khach_bom trong tháng. */
  bomDepositsVnd: number;
};

export type PnlBlock = {
  orderCount: number;
  revenueVnd: number;
  goodsCostVnd: number;
  grossProfitVnd: number;
  pricingMarginVnd: number;
  fxMarginVnd: number;
  shipCollectedVnd: number;
  orderExpensesVnd: number;
};

export type PnlReport = {
  confirmed: PnlBlock;
  estimated: PnlBlock;
  periodExpensesVnd: number;
  periodExpenseByCategory: { category: ExpenseCategory; amountVnd: number }[];
  bomDepositsVnd: number;
  /** Chi phí kỳ chia cho số đơn. null khi tháng không có đơn nào. */
  allocatedPerOrderVnd: number | null;
  netProfitVnd: number;
};

const EMPTY_BLOCK: PnlBlock = {
  orderCount: 0,
  revenueVnd: 0,
  goodsCostVnd: 0,
  grossProfitVnd: 0,
  pricingMarginVnd: 0,
  fxMarginVnd: 0,
  shipCollectedVnd: 0,
  orderExpensesVnd: 0,
};

/** Giá vốn hàng của một đơn. */
function goodsCostOf(o: PnlOrder): number {
  // Hàng tồn kho: giá vốn đã chốt ở sale_cost, không mua bằng ¥ lúc bán.
  if (o.orderType === "ban_tu_kho") return Math.round(o.saleCost ?? 0);
  // Chưa mua hàng → chưa có giá vốn thật; dùng tỷ giá bán để chênh tỷ giá = 0.
  const rate = o.costRate ?? o.sellRate;
  return Math.round(o.goodsTotalCny * rate);
}

/** Lời chênh tỷ giá — khoản lời ẩn từ việc mua ¥ rẻ hơn tỷ giá bán. */
function fxMarginOf(o: PnlOrder): number {
  if (o.orderType === "ban_tu_kho" || o.costRate === null) return 0;
  return Math.round(o.goodsTotalCny * (o.sellRate - o.costRate));
}

function buildBlock(orders: PnlOrder[], expenses: PnlExpense[]): PnlBlock {
  const ids = new Set(orders.map((o) => o.id));
  const block = { ...EMPTY_BLOCK, orderCount: orders.length };

  for (const o of orders) {
    const cost = goodsCostOf(o);
    block.revenueVnd += Math.round(o.quotedTotalVnd);
    block.goodsCostVnd += cost;
    block.grossProfitVnd += Math.round(o.quotedTotalVnd) - cost;
    block.pricingMarginVnd += Math.round(o.marginVnd);
    block.fxMarginVnd += fxMarginOf(o);
    block.shipCollectedVnd += Math.round(o.shippingFee);
  }

  for (const e of expenses) {
    if (e.orderId !== null && ids.has(e.orderId)) {
      block.orderExpensesVnd += Math.round(e.amountVnd);
    }
  }

  return block;
}

export function computePnl(input: PnlInput): PnlReport {
  const confirmed = buildBlock(
    input.orders.filter((o) => o.costConfirmed),
    input.expenses,
  );
  const estimated = buildBlock(
    input.orders.filter((o) => !o.costConfirmed),
    input.expenses,
  );

  const periodExpenses = input.expenses.filter((e) => e.orderId === null);
  const periodExpensesVnd = periodExpenses.reduce(
    (s, e) => s + Math.round(e.amountVnd),
    0,
  );

  const byCategory = new Map<ExpenseCategory, number>();
  for (const e of periodExpenses) {
    byCategory.set(
      e.category,
      (byCategory.get(e.category) ?? 0) + Math.round(e.amountVnd),
    );
  }

  const orderCount = input.orders.length;

  const netProfitVnd =
    confirmed.grossProfitVnd +
    estimated.grossProfitVnd +
    confirmed.shipCollectedVnd +
    estimated.shipCollectedVnd -
    confirmed.orderExpensesVnd -
    estimated.orderExpensesVnd -
    periodExpensesVnd +
    Math.round(input.bomDepositsVnd);

  return {
    confirmed,
    estimated,
    periodExpensesVnd,
    periodExpenseByCategory: [...byCategory.entries()].map(
      ([category, amountVnd]) => ({ category, amountVnd }),
    ),
    bomDepositsVnd: Math.round(input.bomDepositsVnd),
    // Tháng không có đơn nào thì không chia — hiện nguyên tổng chi phí.
    allocatedPerOrderVnd:
      orderCount > 0 ? Math.round(periodExpensesVnd / orderCount) : null,
    netProfitVnd,
  };
}
```

- [ ] **Bước 4: Chạy test + typecheck**

```bash
npm test && npx tsc --noEmit
```

- [ ] **Bước 5: Commit**

```bash
git add src/lib/pnl.ts tests/pnl.test.ts
git commit -m "$(cat <<'EOF'
v3B-5: pnl — báo cáo lãi/lỗ tách khối chắc chắn và ước tính

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Màn `/finance` — ví ¥ và sổ chi phí

**Files:**
- Create: `src/app/finance/page.tsx`
- Create: `src/app/finance/actions.ts`
- Create: `src/app/finance/topup-form.tsx`
- Create: `src/app/finance/expense-form.tsx`
- Modify: `src/db/queries.ts`
- Modify: `src/app/_components/nav-config.ts`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `getWallet`, `listLedger`, `addTopup`, `deleteLedgerEntry` (Task 4); `EXPENSE_CATEGORIES`, `EXPENSE_CATEGORY_LABELS`, `LEDGER_KIND_LABELS` (Task 1); `walletValueVnd` (Task 2).
- Produces: `listExpenses(from?: Date, to?: Date)`, `addExpense(input)`, `deleteExpense(id)` trong `queries.ts`; route `/finance`.

- [ ] **Bước 1: CRUD chi phí trong `queries.ts`**

```ts
export type AddExpenseInput = {
  spentAt: Date;
  category: ExpenseCategory;
  amountVnd: number;
  orderId?: number | null;
  method: PaymentMethod;
  note?: string | null;
};

export function addExpense(input: AddExpenseInput): LineActionResult {
  if (!(input.amountVnd > 0))
    return { ok: false, reason: "Số tiền phải lớn hơn 0" };
  if (input.orderId != null) {
    const exists = sqlite
      .prepare("SELECT 1 AS x FROM orders WHERE id = ?")
      .get(input.orderId);
    if (!exists) return { ok: false, reason: "Đơn không tồn tại" };
  }
  sqlite
    .prepare(
      `INSERT INTO expenses (spent_at, category, amount_vnd, order_id, method, note)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      Math.floor(input.spentAt.getTime() / 1000),
      input.category,
      Math.round(input.amountVnd),
      input.orderId ?? null,
      input.method,
      input.note ?? null,
    );
  return { ok: true };
}

export function deleteExpense(id: number): LineActionResult {
  sqlite.prepare("DELETE FROM expenses WHERE id = ?").run(id);
  return { ok: true };
}
```

`listExpenses` đọc bằng Drizzle, sắp xếp `desc(expenses.spentAt)`, lọc theo khoảng thời gian nếu có tham số.

- [ ] **Bước 2: Trang `/finance`**

Bọc `<AppShell username={session.username}>`, hai `<section className="card">`:

**Thẻ Ví ¥** — số dư lớn kèm quy đổi VND (`walletValueVnd`), giá vốn bq, nút *Nạp ¥*, và bảng sổ chuyển động (ngày, loại, ¥, VND trả, giá vốn chốt, đơn liên quan). Dòng `nap` có nút Xoá; dòng `chi`/`dieu_chinh` không có.

Số dư âm thì thêm dải cảnh báo:

```tsx
{wallet.balance < 0 && (
  <p className="warn-banner">
    ⚠️ Ví ¥ đang âm ({wallet.balance}¥) — có đợt nạp nào chưa ghi?
  </p>
)}
```

**Thẻ Chi phí** — nút *Thêm chi phí*, danh sách gần đây (ngày, nhóm, số tiền, đơn gắn kèm nếu có, hình thức), mỗi dòng có nút Xoá.

- [ ] **Bước 3: Hai form**

`topup-form.tsx`: hai ô số **Số tệ nhận** và **Số tiền trả (₫)**, hiện ngay tỷ giá suy ra (`vnd / cny`) để người dùng thấy mình mua giá bao nhiêu trước khi lưu.

`expense-form.tsx`: ngày (mặc định hôm nay), `<select>` nhóm chi phí, số tiền, ô số đơn (tuỳ chọn — để trống là chi phí theo kỳ), `<select>` hình thức. Chú thích dưới ô đơn: *"Để trống = chi phí chung, báo cáo sẽ chia bình quân cho các đơn trong tháng."*

- [ ] **Bước 4: Server action**

`src/app/finance/actions.ts` — `addTopupAction`, `deleteLedgerAction`, `addExpenseAction`, `deleteExpenseAction`, theo khuôn action hiện có (kiểm phiên → gọi query → `revalidatePath("/finance")` → redirect kèm `?err=`).

- [ ] **Bước 5: Điều hướng**

Thêm mục `/finance` vào `src/app/_components/nav-config.ts` — một chỗ duy nhất, sidebar và bottom-tab tự nhận.

- [ ] **Bước 6: Kiểm chứng bằng preview**

Nạp một đợt ¥, kiểm số dư và giá vốn đúng; nạp đợt hai giá khác, kiểm giá vốn bình quân đổi đúng; thêm một chi phí gắn đơn và một chi phí chung; xoá một đợt nạp và kiểm số dư tính lại đúng. Chụp màn hình mobile + desktop.

- [ ] **Bước 7: Commit**

```bash
git add src/app/finance src/db/queries.ts src/app/_components/nav-config.ts src/app/globals.css
git commit -m "$(cat <<'EOF'
v3B-6: màn Tài chính — ví ¥ và sổ chi phí

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Màn `/reports` — ba báo cáo

**Files:**
- Create: `src/app/reports/page.tsx`
- Modify: `src/db/queries.ts`
- Modify: `src/app/_components/nav-config.ts`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `computePnl` (Task 5); `getWallet`, `walletValueVnd` (Task 2, 4).
- Produces: `getPnlData(year: number, month: number): PnlInput`, `getCashFlow(year, month)`, `getAssetSnapshot()` trong `queries.ts`.

- [ ] **Bước 1: Gom dữ liệu cho báo cáo lãi/lỗ**

```ts
/** Đơn HOÀN TẤT trong tháng — ngày lấy từ order_status_history, không từ
 *  orders.status_changed_at (cột đó chỉ giữ lần đổi gần nhất). */
export function getPnlData(year: number, month: number): PnlInput {
  const from = Math.floor(Date.UTC(year, month - 1, 1) / 1000);
  const to = Math.floor(Date.UTC(year, month, 1) / 1000);

  const orders = sqlite
    .prepare(
      `SELECT o.id                     AS id,
              o.order_type             AS orderType,
              o.quoted_total_vnd       AS quotedTotalVnd,
              o.shipping_fee           AS shippingFee,
              o.goods_total_cny        AS goodsTotalCny,
              o.exchange_rate          AS sellRate,
              o.sale_cost              AS saleCost,
              (SELECT l.rate_snapshot FROM cny_ledger l
                WHERE l.order_id = o.id AND l.kind = 'chi'
                ORDER BY l.id LIMIT 1)                        AS costRate,
              (SELECT COALESCE(SUM(i.margin_vnd), 0) FROM order_items i
                WHERE i.order_id = o.id)                      AS marginVnd,
              (SELECT COUNT(*) = 0 FROM order_items i
                WHERE i.order_id = o.id AND i.cost_confirmed = 0) AS costConfirmed
         FROM orders o
        WHERE EXISTS (SELECT 1 FROM order_status_history h
                       WHERE h.order_id = o.id AND h.to_status = 'hoan_tat'
                         AND h.changed_at >= ? AND h.changed_at < ?)`,
    )
    .all(from, to) as (Omit<PnlOrder, "costConfirmed"> & {
    costConfirmed: number;
  })[];

  const expenses = sqlite
    .prepare(
      `SELECT amount_vnd AS amountVnd, category, order_id AS orderId
         FROM expenses WHERE spent_at >= ? AND spent_at < ?`,
    )
    .all(from, to) as PnlExpense[];

  // Cọc giữ được từ đơn chuyển sang khách bom trong tháng.
  const bom = sqlite
    .prepare(
      `SELECT COALESCE(SUM(p.amount_vnd), 0) AS total
         FROM payments p
        WHERE p.order_id IN (
              SELECT h.order_id FROM order_status_history h
               WHERE h.to_status = 'khach_bom'
                 AND h.changed_at >= ? AND h.changed_at < ?)`,
    )
    .get(from, to) as { total: number };

  return {
    orders: orders.map((o) => ({ ...o, costConfirmed: o.costConfirmed === 1 })),
    expenses,
    bomDepositsVnd: bom.total,
  };
}
```

- [ ] **Bước 2: Dòng tiền tháng**

```ts
export function getCashFlow(year: number, month: number) {
  const from = Math.floor(Date.UTC(year, month - 1, 1) / 1000);
  const to = Math.floor(Date.UTC(year, month, 1) / 1000);

  const inflow = sqlite
    .prepare(
      `SELECT method, COALESCE(SUM(amount_vnd), 0) AS total
         FROM payments WHERE paid_at >= ? AND paid_at < ? GROUP BY method`,
    )
    .all(from, to) as { method: PaymentMethod; total: number }[];

  const topups = sqlite
    .prepare(
      `SELECT COALESCE(SUM(vnd_paid), 0) AS total FROM cny_ledger
        WHERE kind = 'nap' AND created_at >= ? AND created_at < ?`,
    )
    .get(from, to) as { total: number };

  const spend = sqlite
    .prepare(
      `SELECT method, COALESCE(SUM(amount_vnd), 0) AS total
         FROM expenses WHERE spent_at >= ? AND spent_at < ? GROUP BY method`,
    )
    .all(from, to) as { method: PaymentMethod; total: number }[];

  const sum = (rows: { total: number }[]) =>
    rows.reduce((s, r) => s + r.total, 0);

  return {
    inflow,
    inflowTotal: sum(inflow),
    topupsVnd: topups.total,
    spend,
    spendTotal: sum(spend),
    netVnd: sum(inflow) - topups.total - sum(spend),
  };
}
```

- [ ] **Bước 3: Cơ cấu tài sản**

```ts
export function getAssetSnapshot() {
  const wallet = getWallet();
  const stock = sqlite
    .prepare(
      "SELECT COALESCE(SUM(quantity * avg_cost), 0) AS total FROM inventory",
    )
    .get() as { total: number };
  const receivable = sqlite
    .prepare(
      `SELECT COALESCE(SUM(amount_due), 0) AS total FROM orders
        WHERE status NOT IN ('hoan_tat','huy','khach_bom')`,
    )
    .get() as { total: number };
  // Cọc của đơn CHƯA giao — tiền này nằm trong tài khoản nhưng chưa phải của mình.
  const heldDeposits = sqlite
    .prepare(
      `SELECT COALESCE(SUM(p.amount_vnd), 0) AS total FROM payments p
         JOIN orders o ON o.id = p.order_id
        WHERE o.status NOT IN ('da_giao_khach','hoan_tat','huy','khach_bom')`,
    )
    .get() as { total: number };

  return {
    walletCny: wallet.balance,
    walletVnd: walletValueVnd(wallet),
    stockVnd: stock.total,
    receivableVnd: receivable.total,
    heldDepositsVnd: heldDeposits.total,
  };
}
```

- [ ] **Bước 4: Trang `/reports`**

Bộ chọn tháng ở đầu (mặc định tháng hiện tại), ba `<section className="card">`:

1. **Dòng tiền tháng** — tiền vào / tiền ra (nạp ¥ + chi phí) / ròng, tách chuyển khoản và tiền mặt. Ghi chú: *"Ngân hàng cho bạn số dư; bảng này cho bạn thành phần của biến động."*
2. **Lãi/lỗ tháng** — hai khối **Chắc chắn** và **Đang ước tính** cạnh nhau, mỗi khối đủ các dòng của spec mục 6.2; dưới là chi phí theo kỳ (gộp theo nhóm) và lãi ròng. Khối ước tính có nhãn cảnh báo *"dựa trên giá ¥ chưa xác nhận"*. `allocatedPerOrderVnd === null` thì hiện *"không có đơn nào để phân bổ"* thay vì số.
3. **Tiền của mình đang nằm ở đâu** — bảng cộng/trừ theo spec mục 6.3, mở đầu bằng dòng ghi chú *"(Số dư ngân hàng — bạn tự xem ở app ngân hàng)"*.

- [ ] **Bước 5: Điều hướng + preview**

Thêm `/reports` vào `nav-config.ts`. Qua preview: chọn tháng có đơn hoàn tất, đối chiếu tay lãi gộp của một đơn với số trên màn; chọn tháng trống và xác nhận không vỡ, không chia cho 0. Chụp màn hình mobile + desktop.

- [ ] **Bước 6: Commit**

```bash
git add src/app/reports src/db/queries.ts src/app/_components/nav-config.ts src/app/globals.css
git commit -m "$(cat <<'EOF'
v3B-7: màn Báo cáo — dòng tiền, lãi/lỗ, cơ cấu tài sản

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Khối Thu tiền ở đơn + thẻ Tổng quan + QA cuối

**Files:**
- Modify: `src/app/orders/[id]/page.tsx`
- Create: `src/app/orders/[id]/payments-block.tsx`
- Modify: `src/app/page.tsx`
- Modify: `CLAUDE.md`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `listPaymentsForOrder`, `suggestFinalPayment`, `addPaymentAction`, `deletePaymentAction` (Task 3); `getWallet`, `walletValueVnd` (Task 2, 4); `getPnlData` + `computePnl` (Task 5, 7).
- Produces: không có (task cuối).

- [ ] **Bước 1: Khối Thu tiền ở chi tiết đơn**

`payments-block.tsx` — bảng các lần trả (ngày, loại, số tiền, hình thức, nút Xoá), chân bảng **Đã thu** và **Còn phải thu**. Form thêm khoản: số tiền (điền sẵn `suggestFinalPayment`), ngày (mặc định hôm nay, sửa được), `<select>` loại và hình thức.

Còn phải thu âm → cảnh báo *"Đã thu vượt {formatVnd(-due)} — cần hoàn lại khách"*.

- [ ] **Bước 2: Đề xuất thu nốt khi chuyển Hoàn tất**

Ở màn chi tiết đơn, khi trạng thái hiện tại là `da_giao_khach` và còn phải thu > 0, nút chuyển sang **Hoàn tất** đi kèm ô tick *"Ghi luôn khoản thu nốt {formatVnd(due)} hôm nay"* (mặc định bật). Tick thì `changeStatusAction` gọi thêm `addPayment` với `kind: 'thu_not'`.

- [ ] **Bước 3: Cảnh báo chưa có giá vốn khi mua hàng TQ**

Ở màn chi tiết đơn, nếu `status === "da_mua_tq"` và đơn không có dòng `cny_ledger` nào, hiện dải: *"Đơn chưa có giá vốn nên ví ¥ chưa bị trừ. Nhập giá ¥ ở bảng trên để ghi điều chỉnh."*

- [ ] **Bước 4: Hai thẻ ở Tổng quan**

Trong `src/app/page.tsx`, thêm hai `<section className="card">`:

- **Ví ¥** — `còn {balance}¥ ≈ {formatVnd(walletVnd)}`, giá vốn bq, link tới `/finance`. Số dư âm thì tô màu cảnh báo.
- **Lãi tháng này** — `computePnl(getPnlData(nay.getFullYear(), nay.getMonth() + 1)).netProfitVnd`, link tới `/reports`. Có đơn ở khối ước tính thì thêm chú thích *"gồm {n} đơn còn ước tính"*.

- [ ] **Bước 5: QA cuối**

```bash
npm test && npx tsc --noEmit && npm run db:backup
```

Kỳ vọng: toàn bộ test xanh, gồm cả `money`, `order-status`, `inventory` (MVP) và `line-pricing`, `order-gaps` (v3-A).

- [ ] **Bước 6: Kiểm bất biến trên DB thật**

```bash
node -e "
const {DatabaseSync}=require('node:sqlite');
const d=new DatabaseSync('data/app.sqlite');
const a=d.prepare('SELECT COUNT(*) c FROM orders o WHERE o.deposit <> (SELECT COALESCE(SUM(p.amount_vnd),0) FROM payments p WHERE p.order_id=o.id)').get();
console.log(a.c===0?'✓ deposit = Σ payments':'✗ '+a.c+' đơn lệch');
const b=d.prepare('SELECT COUNT(*) c FROM orders o WHERE o.quoted_total_vnd <> (SELECT COALESCE(SUM(i.margin_vnd),0)+CAST(ROUND(o.goods_total_cny*o.exchange_rate) AS INTEGER) FROM order_items i WHERE i.order_id=o.id)').get();
console.log(b.c===0?'✓ bất biến Total của v3-A còn nguyên':'✗ '+b.c+' đơn lệch Total');
"
```

Kỳ vọng: cả hai `✓`.

- [ ] **Bước 7: Cập nhật `CLAUDE.md` và đẩy lên remote**

Đổi trạng thái thành *v3 xong (A + B)*, thêm tài liệu vào mục Tài liệu, và thêm gotchas:

> **Ví ¥ (v3-B):** số dư và giá vốn bq **không lưu trong DB** — chạy lại `cny_ledger` bằng `src/lib/cny-wallet.ts`. Đừng thêm cột `balance`. Dòng `chi` giữ `rate_snapshot` đã chốt cứng; sửa giá ¥ sau khi mua thì **ghi dòng `dieu_chinh`**, không sửa dòng cũ.
> **`orders.deposit` là số dẫn xuất** = Σ `payments`. Mọi thay đổi thu tiền phải đi qua `syncOrderDeposit`, đừng UPDATE thẳng cột này.
> **Báo cáo lãi tính theo ngày HOÀN TẤT**, đọc từ `order_status_history` chứ không từ `orders.status_changed_at`.

```bash
git add CLAUDE.md && git commit -m "$(cat <<'EOF'
docs: cập nhật CLAUDE.md cho v3-B

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)" && git push
```

---

## Đối chiếu kế hoạch với spec

| Mục spec | Task |
|---|---|
| 2.1 Không chép số dư ngân hàng | 7 (báo cáo dòng tiền + cơ cấu tài sản) |
| 2.2 Sổ chuyển động, không lưu số dư | 1 (bảng), 2 (`replayLedger`) |
| 2.3 Chốt cứng giá vốn lúc mua | 4 (`rate_snapshot`) |
| 2.4 Kỳ ghi nhận = tháng Hoàn tất | 7 (`getPnlData` đọc `order_status_history`) |
| 3 Ba bảng mới | 1 |
| 3 `deposit` thành số dẫn xuất | 3 |
| 4.1 `cny-wallet.ts` | 2 |
| 4.2 `pnl.ts` | 5 |
| 4.3 `payments.ts` | 3 |
| 5 Trừ ví khi mua, ghi `dieu_chinh` | 4 |
| 6.1 Dòng tiền tháng | 7 |
| 6.2 Lãi/lỗ tháng | 5 (tính), 7 (hiển thị) |
| 6.3 Tiền nằm ở đâu | 7 |
| 7 Xử lý lỗi | 2 (số dư âm, nạp khi âm), 4 (chặn nạp rỗng, không cho sửa `chi`), 6 (chặn chi phí âm), 8 (cảnh báo thu vượt, chưa có giá vốn) |
| 8 Màn hình | 6, 7, 8 |
| 9 Test | 2, 3, 5 + hồi quy ở mọi task |
