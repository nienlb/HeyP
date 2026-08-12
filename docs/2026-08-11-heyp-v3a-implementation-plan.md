# Kế hoạch thực thi HeyP v3-A — Bóc lớp giá & luồng nhập đơn

> **Cho người/agent thực thi:** dùng skill `subagent-driven-development` (khuyến nghị) hoặc `executing-plans` để làm từng task một. Các bước dùng cú pháp checkbox (`- [ ]`) để đánh dấu tiến độ.

**Mục tiêu:** Ghi lại giá ¥ và lời của **từng món** trong đơn, tách bạch số máy đoán khỏi số người xác nhận, và cho phép tạo đơn từ ảnh Zalo ngay cả khi thiếu thông tin.

**Kiến trúc:** Giữ nguyên công thức tiền cấp đơn (`¥ × tỷ_giá + phí`) để không đụng vào `money.ts` đang chạy ổn; hạ chi tiết xuống `order_items` bằng hai cột mới (`margin_vnd`, `cost_confirmed`). Logic rải/khớp lời và logic cờ thiếu nằm ở hai module **thuần**, không đụng DB, phủ test đầy đủ. UI đọc kết quả từ hai module đó.

**Tech stack:** Next.js 15 App Router, React 19, TypeScript, `node:sqlite` + Drizzle (`sqlite-proxy`), CSS thuần, test bằng `node:test`.

**Spec:** `docs/2026-08-11-heyp-v3a-gia-va-nhap-don-design.md`

## Ràng buộc toàn cục

Mọi task đều phải tuân, không nhắc lại trong từng task:

- **Dùng `node:sqlite`, KHÔNG dùng `better-sqlite3`.** Không thêm lại dependency này.
- **ĐỌC bằng Drizzle** (`db` trong `src/db/index.ts`); **GHI có transaction bằng `sqlite`** (DatabaseSync) thô — sqlite-proxy async không hỗ trợ transaction.
- **`node:sqlite` bind số JS thành REAL** → dựng chuỗi trong JS rồi truyền tham số, **không** nối `|| số ||` trong SQL.
- **Migration viết tay SQL** trong `drizzle/*.sql`, áp bằng `npm run db:migrate`. **KHÔNG** dùng `drizzle-kit migrate/push`.
- **Test import module bằng đuôi `.ts` tường minh** (vd `../src/lib/money.ts`). Module thuần dùng cho test **không được** import file có alias `@/`.
- **UI tiếng Việt.** Tiền VND (₫), tệ (¥).
- **KHÔNG `rm data/app.sqlite`** — DB có dữ liệu thật.
- **Commit tiếng Việt**, kết thúc bằng `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Trước mỗi lần chạy migration trên DB thật: `npm run db:backup`.
- Mặc định nghiệp vụ: `sell_rate = 4000`, `default_margin_vnd = 170000`.
- `quoted_total_vnd` **không gồm ship**.

## Bản đồ file

| File | Trách nhiệm |
|---|---|
| `scripts/migrate.ts` *(sửa)* | Tắt FK trong lúc migrate, kiểm tra lại sau — cho phép dựng lại bảng |
| `drizzle/0003_v3a_line_pricing.sql` *(mới)* | Cột mới, nới `customer_id`, bảng `settings`, backfill |
| `src/db/schema.ts` *(sửa)* | Khai báo cột & bảng mới |
| `src/lib/line-pricing.ts` *(mới)* | Rải lời, khớp Total, suy ngược ¥ — **thuần** |
| `src/lib/order-gaps.ts` *(mới)* | Tính cờ thiếu — **thuần** |
| `src/lib/settings.ts` *(mới)* | Khoá + mặc định + parse cấu hình nghiệp vụ — **thuần** |
| `src/lib/zalo-extract.ts` *(sửa)* | Thêm phân loại ảnh vào prompt/schema |
| `src/lib/gemini.ts` *(sửa)* | Gọi nhiều ảnh trong một request |
| `src/db/queries.ts` *(sửa)* | `createOrder` mở rộng, đọc/ghi settings, gợi ý ¥ theo lịch sử, cập nhật giá vốn |
| `src/app/orders/new/*` *(sửa)* | Màn thả ảnh + xác nhận nhãn |
| `src/app/orders/[id]/*` *(sửa)* | Bảng bóc lớp giá theo món |
| `src/app/settings/*` *(mới)* | Màn Cài đặt tỷ giá bán & lời mặc định |
| `src/app/page.tsx` *(sửa)* | Thẻ "Cần bổ sung" |

---

## Task 1: Nền CSDL — migration, schema, module settings

**Files:**
- Modify: `scripts/migrate.ts`
- Create: `drizzle/0003_v3a_line_pricing.sql`
- Modify: `src/db/schema.ts`
- Create: `src/lib/settings.ts`
- Test: `tests/settings.test.ts`

**Interfaces:**
- Consumes: không có (task đầu).
- Produces: cột `orders.quoted_total_vnd`, `orders.ship_status`, `orders.margin_vnd` (đổi tên từ `service_fee`), `orders.customer_id` nullable; `order_items.margin_vnd`, `order_items.cost_confirmed`; bảng `settings(key, value)`. Từ `src/lib/settings.ts`: `SETTING_DEFAULTS`, `type AppSettings = { sellRate: number; defaultMarginVnd: number }`, `parseSettings(rows: { key: string; value: string }[]): AppSettings`.

### Vì sao phải sửa `migrate.ts` trước

Nới `customer_id` từ `NOT NULL` sang nullable **bắt buộc dựng lại bảng** — SQLite không có `ALTER COLUMN`. Quy trình dựng lại phải `DROP TABLE orders`, mà `orders` đang được `order_items`, `order_packages`, `photos`, `order_status_history` tham chiếu bằng khoá ngoại. Với `PRAGMA foreign_keys = ON`, lệnh DROP đó sẽ báo vi phạm khoá ngoại.

Không thể tắt FK bên trong migration vì **`PRAGMA foreign_keys` là lệnh không có tác dụng khi đang ở trong transaction**, mà `migrate.ts` bọc mỗi file trong `BEGIN`. Nên phải tắt ở tầng script.

- [ ] **Bước 1: Sửa `scripts/migrate.ts` — tắt FK khi migrate, kiểm lại sau**

Thay dòng `db.exec("PRAGMA foreign_keys = ON;");` (ngay sau `new DatabaseSync(dbPath)`) bằng:

```ts
// Tắt khoá ngoại trong lúc migrate: quy trình dựng lại bảng của SQLite
// (CREATE new → COPY → DROP old → RENAME) cần điều này. PRAGMA không có
// tác dụng bên trong transaction nên phải đặt ở đây, ngoài mọi BEGIN.
db.exec("PRAGMA foreign_keys = OFF;");
```

Rồi ngay **trước** hai dòng `console.log` cuối file, chèn:

```ts
// Migrate xong: bật lại và soát toàn bộ khoá ngoại. Dựng lại bảng sai sẽ
// để lại con mồ côi — thà hỏng ầm ĩ ở đây còn hơn âm thầm trong dữ liệu thật.
const violations = db.prepare("PRAGMA foreign_key_check").all();
if (violations.length > 0) {
  console.error("✗ Vi phạm khoá ngoại sau khi migrate:", violations);
  process.exit(1);
}
db.exec("PRAGMA foreign_keys = ON;");
```

- [ ] **Bước 2: Viết migration `drizzle/0003_v3a_line_pricing.sql`**

```sql
-- Migration 0003 (v3-A): bóc lớp giá theo từng món.
--   orders:      + quoted_total_vnd, + ship_status, service_fee → margin_vnd,
--                customer_id nới lỏng NOT NULL (đơn tạo từ ảnh có thể chưa có khách)
--   order_items: + margin_vnd (lời của món), + cost_confirmed (¥ do người xác nhận?)
--   settings:    bảng khoá-giá trị cho tham số nghiệp vụ đổi được lúc chạy
--
-- LƯU Ý: scripts/migrate.ts tắt PRAGMA foreign_keys trong lúc chạy và soát lại
-- bằng foreign_key_check sau khi xong. Không đổi thứ tự các lệnh dưới đây.

-- 1) Đổi tên cột: service_fee giờ mang nghĩa TỔNG lời của đơn.
ALTER TABLE orders RENAME COLUMN service_fee TO margin_vnd;

-- 2) Hai cột mới ở cấp đơn.
ALTER TABLE orders ADD COLUMN quoted_total_vnd INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN ship_status TEXT NOT NULL DEFAULT 'unknown';

-- 3) Backfill: Total đã chốt = tiền hàng + lời (KHÔNG gồm ship).
UPDATE orders
   SET quoted_total_vnd = CAST(ROUND(goods_total_cny * exchange_rate) AS INTEGER)
                          + margin_vnd;

UPDATE orders SET ship_status = 'set' WHERE shipping_fee > 0;

-- 4) Dựng lại orders để nới customer_id. Giữ nguyên tên cột & thứ tự cũ.
CREATE TABLE orders_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER REFERENCES customers(id),
  order_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'cho_bao_gia',
  exchange_rate REAL NOT NULL DEFAULT 0,
  goods_total_cny REAL NOT NULL DEFAULT 0,
  margin_vnd INTEGER NOT NULL DEFAULT 0,
  shipping_fee INTEGER NOT NULL DEFAULT 0,
  deposit INTEGER NOT NULL DEFAULT 0,
  amount_due INTEGER NOT NULL DEFAULT 0,
  sale_cost INTEGER,
  note TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  status_changed_at INTEGER NOT NULL DEFAULT (unixepoch()),
  quoted_total_vnd INTEGER NOT NULL DEFAULT 0,
  ship_status TEXT NOT NULL DEFAULT 'unknown'
);

INSERT INTO orders_new
  (id, customer_id, order_type, status, exchange_rate, goods_total_cny,
   margin_vnd, shipping_fee, deposit, amount_due, sale_cost, note,
   created_at, status_changed_at, quoted_total_vnd, ship_status)
SELECT
   id, customer_id, order_type, status, exchange_rate, goods_total_cny,
   margin_vnd, shipping_fee, deposit, amount_due, sale_cost, note,
   created_at, status_changed_at, quoted_total_vnd, ship_status
FROM orders;

DROP TABLE orders;
ALTER TABLE orders_new RENAME TO orders;

-- 4b) DROP TABLE xoá luôn index của bảng cũ → phải dựng lại.
--     (0000_init.sql tạo idx_orders_status và idx_orders_customer.)
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_customer ON orders(customer_id);

-- 5) Hai cột mới ở cấp dòng sản phẩm.
ALTER TABLE order_items ADD COLUMN margin_vnd INTEGER NOT NULL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN cost_confirmed INTEGER NOT NULL DEFAULT 0;

-- 6) Backfill dòng: dòng ĐẦU TIÊN của mỗi đơn nhận trọn phần lời cũ,
--    các dòng còn lại 0 → bất biến "Σ giá bán món = Total" vẫn đúng ngay
--    sau migration. Chủ shop rải lại theo món sau nếu muốn.
UPDATE order_items
   SET margin_vnd = (SELECT o.margin_vnd FROM orders o WHERE o.id = order_items.order_id)
 WHERE id IN (SELECT MIN(id) FROM order_items GROUP BY order_id);

-- 7) Dòng cũ: giá ¥ đã nhập tay từ trước, không phải máy đoán.
UPDATE order_items SET cost_confirmed = 1;

-- 8) Tham số nghiệp vụ đổi được lúc chạy (không phải .env — đổi không cần khởi động lại).
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO settings(key, value) VALUES ('sell_rate', '4000');
INSERT INTO settings(key, value) VALUES ('default_margin_vnd', '170000');
```

- [ ] **Bước 3: Chạy thử migration trên BẢN SAO của DB thật**

DB đang chạy `journal_mode=wal`, nên **`cp` trần không dùng được**: nó chỉ chép file chính, bỏ lại `-wal`/`-shm`, và bản sao có thể thiếu đúng những commit gần nhất. Dùng `VACUUM INTO` để có snapshot nhất quán — cùng cách `src/lib/backup.ts` đang dùng.

```bash
node -e "const{DatabaseSync}=require('node:sqlite');new DatabaseSync('data/app.sqlite').exec(\"VACUUM INTO '/tmp/heyp-test.sqlite'\")" && DATABASE_PATH=/tmp/heyp-test.sqlite npm run db:migrate
```

Kỳ vọng: in `✓ đã áp dụng 0003_v3a_line_pricing.sql`, **không** có dòng vi phạm khoá ngoại.

- [ ] **Bước 4: Đối chiếu tiền trước/sau — số phải y hệt**

```bash
node -e "
const {DatabaseSync}=require('node:sqlite');
const a=new DatabaseSync('data/app.sqlite'), b=new DatabaseSync('/tmp/heyp-test.sqlite');
const q=d=>d.prepare('SELECT id, amount_due, deposit, shipping_fee FROM orders ORDER BY id').all();
const x=JSON.stringify(q(a)), y=JSON.stringify(q(b));
console.log(x===y?'✓ khối tiền không đổi':'✗ LỆCH — dừng lại, không migrate DB thật');
const t=b.prepare('SELECT COUNT(*) c FROM orders o WHERE o.quoted_total_vnd <> (SELECT COALESCE(SUM(i.margin_vnd),0)+CAST(ROUND(o.goods_total_cny*o.exchange_rate) AS INTEGER) FROM order_items i WHERE i.order_id=o.id)').get();
console.log(t.c===0?'✓ bất biến Σ giá bán = Total đúng cho mọi đơn':'✗ '+t.c+' đơn lệch bất biến');
"
```

Kỳ vọng: cả hai dòng đều `✓`. Nếu lệch, **dừng** — sửa migration rồi làm lại từ Bước 3 (xoá `/tmp/heyp-test.sqlite` trước).

- [ ] **Bước 5: Cập nhật `src/db/schema.ts`**

Trong `orders`: đổi `customerId` thành nullable (bỏ `.notNull()`), đổi `serviceFee` thành `marginVnd`, thêm hai cột. Thêm hằng `SHIP_STATUSES` cạnh `LINE_STATUSES`:

```ts
export const SHIP_STATUSES = ["unknown", "free", "set"] as const;
```

```ts
  customerId: integer("customer_id").references(() => customers.id),
  // ...
  marginVnd: integer("margin_vnd").notNull().default(0),
  shippingFee: integer("shipping_fee").notNull().default(0),
  deposit: integer("deposit").notNull().default(0),
  amountDue: integer("amount_due").notNull().default(0),
  quotedTotalVnd: integer("quoted_total_vnd").notNull().default(0),
  shipStatus: text("ship_status", { enum: SHIP_STATUSES })
    .notNull()
    .default("unknown"),
```

Trong `orderItems`, thêm sau `lineStatus`:

```ts
  marginVnd: integer("margin_vnd").notNull().default(0),
  costConfirmed: integer("cost_confirmed", { mode: "boolean" })
    .notNull()
    .default(false),
```

Thêm bảng mới ở cuối file:

```ts
// 7) Tham số nghiệp vụ đổi được lúc chạy (tỷ giá bán, lời mặc định).
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
```

- [ ] **Bước 6: Viết test thất bại cho `settings.ts`**

Tạo `tests/settings.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { SETTING_DEFAULTS, parseSettings } from "../src/lib/settings.ts";

test("không có bản ghi nào → dùng mặc định", () => {
  const s = parseSettings([]);
  assert.equal(s.sellRate, 4000);
  assert.equal(s.defaultMarginVnd, 170000);
});

test("đọc được giá trị từ DB", () => {
  const s = parseSettings([
    { key: "sell_rate", value: "4100" },
    { key: "default_margin_vnd", value: "200000" },
  ]);
  assert.equal(s.sellRate, 4100);
  assert.equal(s.defaultMarginVnd, 200000);
});

test("giá trị rác → rơi về mặc định, không làm vỡ app", () => {
  const s = parseSettings([
    { key: "sell_rate", value: "abc" },
    { key: "default_margin_vnd", value: "" },
  ]);
  assert.equal(s.sellRate, SETTING_DEFAULTS.sellRate);
  assert.equal(s.defaultMarginVnd, SETTING_DEFAULTS.defaultMarginVnd);
});

test("tỷ giá bán 0 hoặc âm là vô nghĩa → mặc định", () => {
  assert.equal(parseSettings([{ key: "sell_rate", value: "0" }]).sellRate, 4000);
  assert.equal(parseSettings([{ key: "sell_rate", value: "-5" }]).sellRate, 4000);
});
```

- [ ] **Bước 7: Chạy test, xác nhận nó hỏng**

```bash
npm test -- --test-name-pattern="mặc định"
```

Kỳ vọng: FAIL — `Cannot find module '../src/lib/settings.ts'`.

- [ ] **Bước 8: Viết `src/lib/settings.ts`**

```ts
/**
 * Tham số nghiệp vụ đổi được lúc chạy (bảng `settings`), khác với cấu hình
 * hạ tầng ở src/lib/config.ts (đọc từ .env, đổi phải khởi động lại).
 *
 * Module thuần — không đụng DB, để unit test dễ.
 */

export const SETTING_KEYS = {
  sellRate: "sell_rate",
  defaultMarginVnd: "default_margin_vnd",
} as const;

/** Công thức của chủ shop: giá tệ × 4000 + 170.000 tiền lời. */
export const SETTING_DEFAULTS = {
  sellRate: 4000,
  defaultMarginVnd: 170000,
} as const;

export type AppSettings = {
  /** Tỷ giá BÁN (VND/¥) — không phải tỷ giá vốn thật. */
  sellRate: number;
  /** Lời mặc định cho mỗi món khi điền trước (VND). */
  defaultMarginVnd: number;
};

export type SettingRow = { key: string; value: string };

function positiveOr(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function nonNegativeOr(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && raw?.trim() !== "" ? n : fallback;
}

export function parseSettings(rows: SettingRow[]): AppSettings {
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    sellRate: positiveOr(
      map.get(SETTING_KEYS.sellRate),
      SETTING_DEFAULTS.sellRate,
    ),
    defaultMarginVnd: nonNegativeOr(
      map.get(SETTING_KEYS.defaultMarginVnd),
      SETTING_DEFAULTS.defaultMarginVnd,
    ),
  };
}
```

- [ ] **Bước 9: Chạy test + typecheck**

```bash
npm test && npx tsc --noEmit
```

Kỳ vọng: `tests/settings.test.ts` PASS; **toàn bộ test cũ vẫn xanh**; tsc có thể báo lỗi ở chỗ code còn dùng `order.serviceFee` — sửa các chỗ đó thành `order.marginVnd` (grep `serviceFee` trong `src/`) rồi chạy lại.

- [ ] **Bước 10: Migrate DB thật rồi commit**

```bash
npm run db:backup && npm run db:migrate && npm test
```

```bash
git add scripts/migrate.ts drizzle/0003_v3a_line_pricing.sql src/db/schema.ts src/lib/settings.ts tests/settings.test.ts src/
git commit -m "$(cat <<'EOF'
v3A-1: nền CSDL — cột lời/giá vốn theo món, nới customer_id, bảng settings

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `line-pricing.ts` — rải và khớp lời

**Files:**
- Create: `src/lib/line-pricing.ts`
- Test: `tests/line-pricing.test.ts`

**Interfaces:**
- Consumes: không có (module thuần độc lập).
- Produces:
  - `type PricingLine = { quantity: number; unitPriceCny: number; marginVnd: number }`
  - `lineCostVnd(line: PricingLine, sellRate: number): number`
  - `lineSellVnd(line: PricingLine, sellRate: number): number`
  - `allocateMargins(quotedTotal: number, lines: PricingLine[], sellRate: number, defaultMargin: number): number[]`
  - `redistribute(lines: PricingLine[], changedIndex: number, newMargin: number, quotedTotal: number, sellRate: number): number[]`
  - `suggestCnyFromTotal(quotedTotal: number, lineCount: number, sellRate: number, defaultMargin: number): number`
  - `quotedTotalFromLines(lines: PricingLine[], sellRate: number): number`
  - `orderProfit(lines: PricingLine[]): number`

- [ ] **Bước 1: Viết test thất bại**

Tạo `tests/line-pricing.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allocateMargins,
  lineCostVnd,
  lineSellVnd,
  orderProfit,
  quotedTotalFromLines,
  redistribute,
  suggestCnyFromTotal,
  type PricingLine,
} from "../src/lib/line-pricing.ts";

const line = (unitPriceCny: number, quantity = 1, marginVnd = 0): PricingLine => ({
  quantity,
  unitPriceCny,
  marginVnd,
});

test("giá vốn và giá bán của một dòng", () => {
  const l = line(60, 1, 170000);
  assert.equal(lineCostVnd(l, 4000), 240000);
  assert.equal(lineSellVnd(l, 4000), 410000);
});

test("đơn 1 món: lời là phần dư, bị Total ghim cứng", () => {
  // Total 410.000, 60¥ × 4000 = 240.000 → lời 170.000
  const m = allocateMargins(410000, [line(60)], 4000, 170000);
  assert.deepEqual(m, [170000]);
});

test("đơn 1 món: defaultMargin bị bỏ qua, Total luôn thắng", () => {
  const m = allocateMargins(410000, [line(60)], 4000, 999999);
  assert.deepEqual(m, [170000]);
});

test("đơn 2 món khớp đúng mức mặc định", () => {
  // Total 820.000; 62¥+58¥ = 480.000 giá vốn → còn 340.000 = 170k × 2
  const m = allocateMargins(820000, [line(62), line(58)], 4000, 170000);
  assert.deepEqual(m, [170000, 170000]);
});

test("đơn 2 món lệch: phần thiếu chia theo tỷ trọng giá vốn", () => {
  // 70¥ + 58¥ = 512.000 giá vốn → lời còn 308.000, thiếu 32.000 so với 340.000
  const lines = [line(70), line(58)];
  const m = allocateMargins(820000, lines, 4000, 170000);
  assert.equal(m[0] + m[1], 308000);
  // giá vốn 280.000 vs 232.000 → dòng đắt hơn gánh phần hụt nhiều hơn
  assert.ok(m[0] < m[1], "dòng giá vốn cao hơn phải bị trừ lời nhiều hơn");
});

test("BẤT BIẾN: Σ giá bán món luôn đúng bằng Total, không lệch 1₫", () => {
  const cases: [number, PricingLine[]][] = [
    [410000, [line(60)]],
    [820000, [line(70), line(58)]],
    [999999, [line(33.33), line(11.11), line(7.77)]],
    [1234567, [line(1.01, 3), line(99.99, 2), line(0.5, 7)]],
    [500000, [line(0), line(0)]], // chưa nhập ¥
  ];
  for (const [total, lines] of cases) {
    const margins = allocateMargins(total, lines, 4000, 170000);
    const withMargins = lines.map((l, i) => ({ ...l, marginVnd: margins[i] }));
    assert.equal(
      quotedTotalFromLines(withMargins, 4000),
      total,
      `lệch ở Total ${total}`,
    );
  }
});

test("chưa nhập ¥ → toàn bộ Total nằm ở lời, chia đều", () => {
  const m = allocateMargins(500000, [line(0), line(0)], 4000, 170000);
  assert.deepEqual(m, [250000, 250000]);
});

test("¥ cao hơn Total → lời âm, không chặn", () => {
  // 200¥ × 4000 = 800.000 > Total 410.000
  const m = allocateMargins(410000, [line(200)], 4000, 170000);
  assert.deepEqual(m, [-390000]);
  assert.equal(orderProfit([line(200, 1, m[0])]), -390000);
});

test("kéo lời một dòng thì các dòng khác bù lại, Total giữ nguyên", () => {
  const lines = [line(62, 1, 170000), line(58, 1, 170000)];
  const m = redistribute(lines, 0, 120000, 820000, 4000);
  assert.equal(m[0], 120000);
  assert.equal(m[0] + m[1], 340000, "tổng lời không đổi");
  const withMargins = lines.map((l, i) => ({ ...l, marginVnd: m[i] }));
  assert.equal(quotedTotalFromLines(withMargins, 4000), 820000);
});

test("đơn 1 dòng: không kéo được, lời luôn là phần dư", () => {
  const m = redistribute([line(60, 1, 170000)], 0, 50000, 410000, 4000);
  assert.deepEqual(m, [170000], "Total ghim cứng, giá trị kéo bị bỏ qua");
});

test("suy ngược ¥ gợi ý từ Total", () => {
  assert.equal(suggestCnyFromTotal(410000, 1, 4000, 170000), 60);
  assert.equal(suggestCnyFromTotal(820000, 2, 4000, 170000), 60);
});

test("suy ngược ra số âm → kẹp về 0, không gợi ý bậy", () => {
  assert.equal(suggestCnyFromTotal(100000, 1, 4000, 170000), 0);
});

test("suy ngược làm tròn 2 chữ số thập phân", () => {
  // (500.000 − 170.000) / 4000 = 82,5
  assert.equal(suggestCnyFromTotal(500000, 1, 4000, 170000), 82.5);
});

test("đơn bán từ kho: tỷ giá 1, giá vốn tính thẳng bằng VND", () => {
  const l = line(300000, 1, 0);
  assert.equal(lineCostVnd(l, 1), 300000);
  assert.equal(lineSellVnd(l, 1), 300000);
});

test("số lượng > 1 nhân đúng", () => {
  assert.equal(lineCostVnd(line(60, 3), 4000), 720000);
});

test("danh sách rỗng không làm vỡ", () => {
  assert.deepEqual(allocateMargins(410000, [], 4000, 170000), []);
  assert.equal(orderProfit([]), 0);
});
```

- [ ] **Bước 2: Chạy test, xác nhận nó hỏng**

```bash
npm test -- --test-name-pattern="giá vốn và giá bán"
```

Kỳ vọng: FAIL — `Cannot find module '../src/lib/line-pricing.ts'`.

- [ ] **Bước 3: Viết `src/lib/line-pricing.ts`**

```ts
/**
 * Bóc lớp giá ở cấp dòng sản phẩm (spec v3-A mục 3.3).
 *
 *   giá bán món = ¥ × số lượng × tỷ_giá_bán  +  lời_món
 *
 * Hai luật bất biến, được khoá bởi unit test:
 *   1. Total là DỮ KIỆN (khách đã đồng ý trên Zalo), không bao giờ tự đổi.
 *   2. Σ giá bán các món = Total, không lệch dù 1₫.
 *
 * Hệ quả của (1)+(2): lời là PHẦN DƯ, không phải số khai báo. Mức lời mặc định
 * (170.000) chỉ dùng để gợi ý cách chia phần dư đó giữa các món.
 *
 * Module thuần, không phụ thuộc DB.
 */

export type PricingLine = {
  quantity: number;
  /** Giá ¥ mỗi đơn vị. Đơn `ban_tu_kho` dùng tỷ giá 1 nên đây là VND. */
  unitPriceCny: number;
  /** Lời của món (VND). */
  marginVnd: number;
};

/** Giá vốn hàng của một dòng, quy ra VND (làm tròn về đồng). */
export function lineCostVnd(line: PricingLine, sellRate: number): number {
  return Math.round(line.quantity * line.unitPriceCny * sellRate);
}

/** Giá bán của một dòng = giá vốn + lời. */
export function lineSellVnd(line: PricingLine, sellRate: number): number {
  return lineCostVnd(line, sellRate) + Math.round(line.marginVnd);
}

/** Tổng giá bán các dòng — phải luôn bằng Total đã chốt. */
export function quotedTotalFromLines(
  lines: PricingLine[],
  sellRate: number,
): number {
  return lines.reduce((sum, l) => sum + lineSellVnd(l, sellRate), 0);
}

/** Tổng lời của đơn. Có thể âm — đơn lỗ là chuyện có thật. */
export function orderProfit(lines: PricingLine[]): number {
  return lines.reduce((sum, l) => sum + Math.round(l.marginVnd), 0);
}

/**
 * Chia `pool` cho các dòng theo tỷ trọng `weights`.
 * Phần lẻ do làm tròn dồn vào phần tử cuối → tổng trả về đúng bằng `pool`.
 */
function splitByWeight(pool: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  if (n === 1) return [pool];

  const weightSum = weights.reduce((s, w) => s + w, 0);
  // Giá vốn toàn 0 (chưa nhập ¥) → không có tỷ trọng, chia đều.
  const safe = weightSum > 0 ? weights : weights.map(() => 1);
  const safeSum = safe.reduce((s, w) => s + w, 0);

  const out: number[] = [];
  let assigned = 0;
  for (let i = 0; i < n - 1; i++) {
    const share = Math.round((pool * safe[i]) / safeSum);
    out.push(share);
    assigned += share;
  }
  out.push(pool - assigned);
  return out;
}

/**
 * Rải lời cho các dòng sao cho Σ giá bán = quotedTotal.
 * Mỗi dòng nhận `defaultMargin` trước, phần chênh còn lại chia theo tỷ trọng
 * giá vốn — dòng đắt tiền hơn gánh phần chênh nhiều hơn.
 */
export function allocateMargins(
  quotedTotal: number,
  lines: PricingLine[],
  sellRate: number,
  defaultMargin: number,
): number[] {
  const n = lines.length;
  if (n === 0) return [];

  const costs = lines.map((l) => lineCostVnd(l, sellRate));
  const pool = Math.round(quotedTotal) - costs.reduce((s, c) => s + c, 0);

  // Một dòng: Total ghim cứng, defaultMargin không có chỗ để can thiệp.
  if (n === 1) return [pool];

  const residual = pool - Math.round(defaultMargin) * n;
  return splitByWeight(residual, costs).map((s) => Math.round(defaultMargin) + s);
}

/**
 * Người dùng kéo lời của dòng `changedIndex` thành `newMargin`.
 * Các dòng còn lại bù qua bù lại theo tỷ trọng giá vốn để Total giữ nguyên.
 */
export function redistribute(
  lines: PricingLine[],
  changedIndex: number,
  newMargin: number,
  quotedTotal: number,
  sellRate: number,
): number[] {
  const n = lines.length;
  if (n === 0) return [];

  const costs = lines.map((l) => lineCostVnd(l, sellRate));
  const pool = Math.round(quotedTotal) - costs.reduce((s, c) => s + c, 0);

  // Một dòng: không có ai để bù, lời luôn là phần dư.
  if (n === 1) return [pool];

  const pinned = Math.round(newMargin);
  const otherIdx = lines.map((_, i) => i).filter((i) => i !== changedIndex);
  const shares = splitByWeight(
    pool - pinned,
    otherIdx.map((i) => costs[i]),
  );

  const out = new Array<number>(n);
  out[changedIndex] = pinned;
  otherIdx.forEach((idx, k) => {
    out[idx] = shares[k];
  });
  return out;
}

/**
 * Gợi ý giá ¥ mỗi món khi chưa có lịch sử: suy ngược từ Total, giả định mỗi
 * món lời `defaultMargin`, rồi chia đều cho các món.
 *
 * Số này CHẮC CHẮN sai lệch khi đơn nhiều món giá khác nhau — nó chỉ là điểm
 * xuất phát để người dùng kéo, hơn là bắt họ đối diện ô trống. Vì vậy dòng
 * dùng số này phải giữ cost_confirmed = false.
 */
export function suggestCnyFromTotal(
  quotedTotal: number,
  lineCount: number,
  sellRate: number,
  defaultMargin: number,
): number {
  if (lineCount <= 0 || !(sellRate > 0)) return 0;
  const cost = Math.round(quotedTotal) - Math.round(defaultMargin) * lineCount;
  const perLineCny = cost / sellRate / lineCount;
  if (!(perLineCny > 0)) return 0;
  return Math.round(perLineCny * 100) / 100;
}
```

- [ ] **Bước 4: Chạy test, xác nhận xanh**

```bash
npm test && npx tsc --noEmit
```

Kỳ vọng: toàn bộ `tests/line-pricing.test.ts` PASS, test cũ vẫn xanh.

- [ ] **Bước 5: Commit**

```bash
git add src/lib/line-pricing.ts tests/line-pricing.test.ts
git commit -m "$(cat <<'EOF'
v3A-2: line-pricing — rải lời theo món, khớp Total tuyệt đối

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `order-gaps.ts` — cờ "cần bổ sung"

**Files:**
- Create: `src/lib/order-gaps.ts`
- Test: `tests/order-gaps.test.ts`

**Interfaces:**
- Consumes: `OrderStatus`, `OrderType`, `MAIN_CHAIN` từ `src/lib/order-status.ts`; `PhotoLabel` từ `src/lib/photos.ts`; `SHIP_STATUSES` — khai báo lại tại chỗ ở dạng type để module giữ tính thuần (`src/db/schema.ts` dùng alias `@/` nên test không import được).
- Produces:
  - `type GapCode = "thieu_khach" | "thieu_gia_von" | "thieu_anh_sp" | "thieu_ship"`
  - `GAP_CODES`, `GAP_LABELS: Record<GapCode, string>`
  - `type ShipStatus = "unknown" | "free" | "set"`
  - `type GapOrder`, `type GapItem`, `type GapPhoto`
  - `orderGaps(order: GapOrder, items: GapItem[], photos: GapPhoto[]): GapCode[]`

- [ ] **Bước 1: Viết test thất bại**

Tạo `tests/order-gaps.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  orderGaps,
  type GapOrder,
  type GapItem,
  type GapPhoto,
} from "../src/lib/order-gaps.ts";

/** Đơn đầy đủ thông tin — không thiếu gì. */
const full: GapOrder = {
  orderType: "order_ho",
  status: "khach_chot",
  customerId: 1,
  customerPhone: "0901234567",
  customerAddress: "12 Lê Lợi, Q1",
  shipStatus: "set",
};
const okItems: GapItem[] = [{ costConfirmed: true }];
const okPhotos: GapPhoto[] = [{ label: "product" }];

test("đơn đầy đủ → không cờ nào", () => {
  assert.deepEqual(orderGaps(full, okItems, okPhotos), []);
});

test("chưa gắn khách → thiếu khách", () => {
  const gaps = orderGaps({ ...full, customerId: null }, okItems, okPhotos);
  assert.deepEqual(gaps, ["thieu_khach"]);
});

test("có khách nhưng thiếu SĐT → vẫn thiếu khách", () => {
  const gaps = orderGaps({ ...full, customerPhone: null }, okItems, okPhotos);
  assert.deepEqual(gaps, ["thieu_khach"]);
});

test("có khách nhưng thiếu địa chỉ → vẫn thiếu khách", () => {
  const gaps = orderGaps({ ...full, customerAddress: "  " }, okItems, okPhotos);
  assert.deepEqual(gaps, ["thieu_khach"]);
});

test("còn dòng chưa xác nhận ¥ → thiếu giá vốn", () => {
  const gaps = orderGaps(
    full,
    [{ costConfirmed: true }, { costConfirmed: false }],
    okPhotos,
  );
  assert.deepEqual(gaps, ["thieu_gia_von"]);
});

test("đơn bán từ kho: giá vốn nằm ở sale_cost, KHÔNG bật cờ thiếu giá vốn", () => {
  const gaps = orderGaps(
    { ...full, orderType: "ban_tu_kho" },
    [{ costConfirmed: false }],
    okPhotos,
  );
  assert.deepEqual(gaps, []);
});

test("chưa có ảnh nhãn product → thiếu ảnh SP", () => {
  const gaps = orderGaps(full, okItems, [{ label: "zalo_confirm" }]);
  assert.deepEqual(gaps, ["thieu_anh_sp"]);
});

test("ship chưa biết nhưng hàng chưa về VN → CHƯA nhắc", () => {
  const gaps = orderGaps(
    { ...full, shipStatus: "unknown", status: "dang_van_chuyen_vn" },
    okItems,
    okPhotos,
  );
  assert.deepEqual(gaps, []);
});

test("ship chưa biết và hàng đã về kho VN → nhắc", () => {
  const gaps = orderGaps(
    { ...full, shipStatus: "unknown", status: "ve_kho_vn" },
    okItems,
    okPhotos,
  );
  assert.deepEqual(gaps, ["thieu_ship"]);
});

test("freeship không phải là thiếu", () => {
  const gaps = orderGaps(
    { ...full, shipStatus: "free", status: "ve_kho_vn" },
    okItems,
    okPhotos,
  );
  assert.deepEqual(gaps, []);
});

test("đơn đã huỷ → không nhắc gì, khỏi làm phiền", () => {
  const gaps = orderGaps(
    {
      ...full,
      status: "huy",
      customerId: null,
      customerPhone: null,
      customerAddress: null,
      shipStatus: "unknown",
    },
    [{ costConfirmed: false }],
    [],
  );
  assert.deepEqual(gaps, []);
});

test("đơn sự cố (nhánh, không nằm trên trục chính) → không nhắc ship", () => {
  const gaps = orderGaps(
    { ...full, status: "su_co", shipStatus: "unknown" },
    okItems,
    okPhotos,
  );
  assert.deepEqual(gaps, []);
});

test("nhiều thiếu cùng lúc → trả theo đúng thứ tự khai báo", () => {
  const gaps = orderGaps(
    {
      ...full,
      status: "ve_kho_vn",
      customerId: null,
      shipStatus: "unknown",
    },
    [{ costConfirmed: false }],
    [],
  );
  assert.deepEqual(gaps, [
    "thieu_khach",
    "thieu_gia_von",
    "thieu_anh_sp",
    "thieu_ship",
  ]);
});

test("đơn chưa có dòng nào → không bật cờ thiếu giá vốn", () => {
  const gaps = orderGaps(full, [], okPhotos);
  assert.deepEqual(gaps, []);
});
```

- [ ] **Bước 2: Chạy test, xác nhận nó hỏng**

```bash
npm test -- --test-name-pattern="đơn đầy đủ"
```

Kỳ vọng: FAIL — `Cannot find module '../src/lib/order-gaps.ts'`.

- [ ] **Bước 3: Viết `src/lib/order-gaps.ts`**

```ts
/**
 * Cờ "cần bổ sung" của đơn (spec v3-A mục 5.2).
 *
 * Cờ KHÔNG lưu trong DB — tính lại mỗi lần đọc, nên không bao giờ lệch với
 * thực tế. Cờ chỉ NHẮC, không chặn: đơn vẫn chạy trạng thái bình thường.
 *
 * Module thuần, không phụ thuộc DB.
 */
import { MAIN_CHAIN, type OrderStatus, type OrderType } from "./order-status";
import type { PhotoLabel } from "./photos";

export const GAP_CODES = [
  "thieu_khach",
  "thieu_gia_von",
  "thieu_anh_sp",
  "thieu_ship",
] as const;
export type GapCode = (typeof GAP_CODES)[number];

export const GAP_LABELS: Record<GapCode, string> = {
  thieu_khach: "Thiếu thông tin khách",
  thieu_gia_von: "Thiếu giá vốn (¥)",
  thieu_anh_sp: "Thiếu ảnh sản phẩm",
  thieu_ship: "Chưa nhập phí ship",
};

export type ShipStatus = "unknown" | "free" | "set";

export type GapOrder = {
  orderType: OrderType;
  status: OrderStatus;
  customerId: number | null;
  customerPhone: string | null;
  customerAddress: string | null;
  shipStatus: ShipStatus;
};
export type GapItem = { costConfirmed: boolean };
export type GapPhoto = { label: PhotoLabel };

/** Từ khâu này trở đi mới nhắc nhập phí ship (trước đó chưa biết là bình thường). */
const SHIP_REMINDER_FROM: OrderStatus = "ve_kho_vn";

function blank(s: string | null): boolean {
  return s === null || s.trim() === "";
}

export function orderGaps(
  order: GapOrder,
  items: GapItem[],
  photos: GapPhoto[],
): GapCode[] {
  // Đơn đã huỷ thì không còn gì để đòi bổ sung.
  if (order.status === "huy") return [];

  const gaps: GapCode[] = [];

  if (
    order.customerId === null ||
    blank(order.customerPhone) ||
    blank(order.customerAddress)
  ) {
    gaps.push("thieu_khach");
  }

  // Hàng bán từ kho có giá vốn ở orders.sale_cost, không tính bằng ¥.
  if (
    order.orderType !== "ban_tu_kho" &&
    items.some((it) => !it.costConfirmed)
  ) {
    gaps.push("thieu_gia_von");
  }

  if (!photos.some((p) => p.label === "product")) {
    gaps.push("thieu_anh_sp");
  }

  // Chỉ nhắc ship khi đơn đã đi tới khâu về VN. Trạng thái nhánh
  // (su_co / khach_bom) không nằm trên trục chính → indexOf = -1 → không nhắc.
  const at = MAIN_CHAIN.indexOf(order.status as (typeof MAIN_CHAIN)[number]);
  const remindFrom = MAIN_CHAIN.indexOf(SHIP_REMINDER_FROM);
  if (order.shipStatus === "unknown" && at >= remindFrom) {
    gaps.push("thieu_ship");
  }

  return gaps;
}
```

- [ ] **Bước 4: Chạy test, xác nhận xanh**

```bash
npm test && npx tsc --noEmit
```

- [ ] **Bước 5: Commit**

```bash
git add src/lib/order-gaps.ts tests/order-gaps.test.ts
git commit -m "$(cat <<'EOF'
v3A-3: order-gaps — cờ cần bổ sung, tính thuần không lưu DB

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: AI phân loại ảnh

**Files:**
- Modify: `src/lib/zalo-extract.ts`
- Modify: `src/lib/gemini.ts`
- Modify: `src/app/api/read-zalo/route.ts`
- Test: `tests/zalo-extract.test.ts`

**Interfaces:**
- Consumes: `ZaloExtract`, `ZALO_EXTRACT_PROMPT`, `ZALO_RESPONSE_SCHEMA` (đã có).
- Produces:
  - `type ImageKind = "chot_don" | "thong_tin_khach" | "san_pham"`
  - `type ClassifiedImage = { index: number; kind: ImageKind }`
  - `type ZaloBatchExtract = { images: ClassifiedImage[]; order: ZaloExtract }`
  - `ZALO_BATCH_PROMPT`, `ZALO_BATCH_SCHEMA`
  - `normalizeBatch(raw: unknown, imageCount: number): ZaloBatchExtract`
  - Từ `gemini.ts`: `readZaloBatch(images: { base64: string; mimeType: string }[]): Promise<{ ok: true; data: ZaloBatchExtract } | { ok: false; error: string }>`

- [ ] **Bước 1: Viết test thất bại cho `normalizeBatch`**

Thêm vào cuối `tests/zalo-extract.test.ts`:

```ts
import { normalizeBatch } from "../src/lib/zalo-extract.ts";

test("phân loại ảnh: giữ đúng thứ tự và loại", () => {
  const r = normalizeBatch(
    {
      images: [
        { index: 0, kind: "chot_don" },
        { index: 1, kind: "san_pham" },
      ],
      order: { items: [], shipFree: false, shipUnknown: true },
    },
    2,
  );
  assert.equal(r.images.length, 2);
  assert.equal(r.images[0].kind, "chot_don");
  assert.equal(r.images[1].kind, "san_pham");
});

test("thiếu ảnh trong phản hồi → bù bằng 'san_pham' (chỉ lưu, không đọc)", () => {
  const r = normalizeBatch(
    { images: [{ index: 0, kind: "chot_don" }], order: { items: [] } },
    3,
  );
  assert.equal(r.images.length, 3);
  assert.equal(r.images[1].kind, "san_pham");
  assert.equal(r.images[2].kind, "san_pham");
});

test("loại ảnh lạ → coi là ảnh sản phẩm, không bịa dữ liệu", () => {
  const r = normalizeBatch(
    { images: [{ index: 0, kind: "hoa_don" }], order: { items: [] } },
    1,
  );
  assert.equal(r.images[0].kind, "san_pham");
});

test("phản hồi rác → trả cấu trúc rỗng an toàn, không ném lỗi", () => {
  const r = normalizeBatch(null, 2);
  assert.equal(r.images.length, 2);
  assert.deepEqual(r.order.items, []);
  assert.equal(r.order.totalVnd, null);
});

test("index ngoài khoảng bị bỏ qua", () => {
  const r = normalizeBatch(
    { images: [{ index: 9, kind: "chot_don" }], order: { items: [] } },
    1,
  );
  assert.equal(r.images[0].kind, "san_pham");
});
```

- [ ] **Bước 2: Chạy test, xác nhận nó hỏng**

```bash
npm test -- --test-name-pattern="phân loại ảnh"
```

Kỳ vọng: FAIL — `normalizeBatch` không tồn tại.

- [ ] **Bước 3: Thêm phần batch vào `src/lib/zalo-extract.ts`**

Thêm vào cuối file (giữ nguyên toàn bộ phần hiện có — luồng một ảnh vẫn dùng được):

```ts
/* ---------- Đọc NHIỀU ảnh trong một lần (v3-A) ---------- */

export const IMAGE_KINDS = ["chot_don", "thong_tin_khach", "san_pham"] as const;
export type ImageKind = (typeof IMAGE_KINDS)[number];

export const IMAGE_KIND_LABELS: Record<ImageKind, string> = {
  chot_don: "Ảnh chốt đơn",
  thong_tin_khach: "Ảnh thông tin khách",
  san_pham: "Ảnh sản phẩm",
};

export type ClassifiedImage = { index: number; kind: ImageKind };
export type ZaloBatchExtract = {
  images: ClassifiedImage[];
  order: ZaloExtract;
};

export const ZALO_BATCH_PROMPT = `${ZALO_EXTRACT_PROMPT}

Lần này bạn nhận NHIỀU ảnh cùng lúc, đánh số từ 0 theo thứ tự gửi. Với MỖI ảnh, xác định loại:
- "chot_don": ảnh chụp tin nhắn chốt đơn (có "Tên sp:", "Total", "Đã cọc"). Áp dụng mọi quy tắc ở trên để trích dữ liệu đơn.
- "thong_tin_khach": ảnh chứa tên / số điện thoại / địa chỉ giao hàng của khách. Có thể là ảnh chụp màn hình Zalo HOẶC ảnh chụp giấy/sổ bằng điện thoại (chữ viết tay cũng tính). Lấy customerName, customerPhone, customerAddress từ đây.
- "san_pham": ảnh chụp sản phẩm (giày, dép, túi...). KHÔNG trích gì từ ảnh loại này.

Trả về mảng "images" có ĐÚNG một phần tử cho mỗi ảnh nhận được, kèm index. Gộp toàn bộ dữ liệu đơn đọc được từ mọi ảnh vào một đối tượng "order" duy nhất.
Nếu không chắc ảnh thuộc loại nào → chọn "san_pham" (chỉ lưu, không đọc). Thà bỏ sót còn hơn đọc bừa.`;

export const ZALO_BATCH_SCHEMA = {
  type: "OBJECT",
  properties: {
    images: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          index: { type: "INTEGER" },
          kind: { type: "STRING", enum: [...IMAGE_KINDS] },
        },
        required: ["index", "kind"],
      },
    },
    order: ZALO_RESPONSE_SCHEMA,
  },
  required: ["images", "order"],
} as const;

const EMPTY_EXTRACT: ZaloExtract = {
  items: [],
  totalVnd: null,
  depositVnd: null,
  shipVnd: null,
  shipFree: false,
  shipUnknown: false,
  customerName: null,
  customerPhone: null,
  customerAddress: null,
  notes: null,
};

function toNumOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function toStrOrNull(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s === "" || s.toLowerCase() === "null" ? null : s;
}

/**
 * Chuẩn hoá phản hồi batch của Gemini về cấu trúc chắc chắn dùng được.
 * Nguyên tắc: ảnh nào không rõ loại thì coi là "san_pham" — chỉ lưu, không đọc.
 * Thà bỏ sót còn hơn bịa dữ liệu vào đơn có tiền thật.
 */
export function normalizeBatch(
  raw: unknown,
  imageCount: number,
): ZaloBatchExtract {
  const obj = (raw ?? {}) as Record<string, unknown>;

  const kinds = new Array<ImageKind>(imageCount).fill("san_pham");
  const rawImages = Array.isArray(obj.images) ? obj.images : [];
  for (const entry of rawImages) {
    const e = (entry ?? {}) as Record<string, unknown>;
    const idx = Number(e.index);
    const kind = String(e.kind ?? "");
    if (!Number.isInteger(idx) || idx < 0 || idx >= imageCount) continue;
    if ((IMAGE_KINDS as readonly string[]).includes(kind)) {
      kinds[idx] = kind as ImageKind;
    }
  }

  const o = (obj.order ?? {}) as Record<string, unknown>;
  const rawItems = Array.isArray(o.items) ? o.items : [];
  const order: ZaloExtract = {
    ...EMPTY_EXTRACT,
    items: rawItems.map((it) => {
      const i = (it ?? {}) as Record<string, unknown>;
      const qty = Number(i.quantity);
      return {
        name: String(i.name ?? "").trim(),
        color: toStrOrNull(i.color),
        size: toStrOrNull(i.size),
        quantity: qty > 0 ? qty : 1,
      };
    }),
    totalVnd: toNumOrNull(o.totalVnd),
    depositVnd: toNumOrNull(o.depositVnd),
    shipVnd: toNumOrNull(o.shipVnd),
    shipFree: Boolean(o.shipFree),
    shipUnknown: Boolean(o.shipUnknown),
    customerName: toStrOrNull(o.customerName),
    customerPhone: toStrOrNull(o.customerPhone),
    customerAddress: toStrOrNull(o.customerAddress),
    notes: toStrOrNull(o.notes),
  };

  return {
    images: kinds.map((kind, index) => ({ index, kind })),
    order,
  };
}
```

- [ ] **Bước 4: Chạy test, xác nhận xanh**

```bash
npm test -- --test-name-pattern="phân loại ảnh|thiếu ảnh|loại ảnh lạ|phản hồi rác|index ngoài"
```

Kỳ vọng: 5 test mới PASS, test `zalo-extract` cũ vẫn xanh.

- [ ] **Bước 5: Thêm `readZaloBatch` vào `src/lib/gemini.ts`**

Sửa dòng import ở đầu file thành:

```ts
import {
  ZALO_BATCH_PROMPT,
  ZALO_BATCH_SCHEMA,
  ZALO_EXTRACT_PROMPT,
  ZALO_RESPONSE_SCHEMA,
  normalizeBatch,
  type ZaloBatchExtract,
  type ZaloExtract,
} from "./zalo-extract";
```

Thêm vào cuối file (giữ nguyên `readZaloImage`):

```ts
export type BatchResult =
  | { ok: true; data: ZaloBatchExtract }
  | { ok: false; error: string };

/**
 * Gửi CẢ NHÓM ảnh trong một request: Gemini vừa phân loại từng ảnh vừa gộp
 * dữ liệu đơn. Một lần gọi cho cả nhóm — rẻ và nhanh hơn gọi từng ảnh.
 */
export async function readZaloBatch(
  images: { base64: string; mimeType: string }[],
): Promise<BatchResult> {
  if (!config.geminiApiKey) {
    return {
      ok: false,
      error: "Chưa cấu hình GEMINI_API_KEY — nhập tay bình thường.",
    };
  }
  if (images.length === 0) return { ok: false, error: "Chưa có ảnh nào" };

  const url = `${ENDPOINT}/${config.geminiModel}:generateContent`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": config.geminiApiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: ZALO_BATCH_PROMPT },
              ...images.flatMap((img, i) => [
                { text: `Ảnh số ${i}:` },
                { inlineData: { mimeType: img.mimeType, data: img.base64 } },
              ]),
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: ZALO_BATCH_SCHEMA,
          temperature: 0,
        },
      }),
    });
  } catch (err) {
    return {
      ok: false,
      error: `Không gọi được Gemini: ${(err as Error).message}`,
    };
  }

  if (!res.ok) return { ok: false, error: `Gemini trả lỗi ${res.status}` };

  let text: string | undefined;
  try {
    const json = await res.json();
    text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  } catch {
    return { ok: false, error: "Không đọc được phản hồi Gemini" };
  }
  if (!text) return { ok: false, error: "Gemini không trả dữ liệu" };

  try {
    return { ok: true, data: normalizeBatch(JSON.parse(text), images.length) };
  } catch {
    return { ok: false, error: "Dữ liệu Gemini không đúng định dạng" };
  }
}
```

- [ ] **Bước 6: Cho route nhận nhiều ảnh**

Trong `src/app/api/read-zalo/route.ts`, đọc **tất cả** field `files` thay vì một file, gọi `readZaloBatch`, trả JSON `{ ok, data }` hoặc `{ ok: false, error }`. Giữ nguyên đường dẫn route và mã lỗi hiện có để phần UI cũ không vỡ; khi chỉ có 1 file thì `readZaloBatch` vẫn cho kết quả đúng (`images` một phần tử).

```ts
const form = await req.formData();
const files = form.getAll("files").filter((f): f is File => f instanceof File);
if (files.length === 0) {
  return Response.json({ ok: false, error: "Chưa chọn ảnh nào" }, { status: 400 });
}
const images = await Promise.all(
  files.map(async (f) => ({
    base64: Buffer.from(await f.arrayBuffer()).toString("base64"),
    mimeType: f.type || "image/jpeg",
  })),
);
const result = await readZaloBatch(images);
return Response.json(result, { status: result.ok ? 200 : 502 });
```

- [ ] **Bước 7: Kiểm tra typecheck + test**

```bash
npm test && npx tsc --noEmit
```

- [ ] **Bước 8: Commit**

```bash
git add src/lib/zalo-extract.ts src/lib/gemini.ts src/app/api/read-zalo/route.ts tests/zalo-extract.test.ts
git commit -m "$(cat <<'EOF'
v3A-4: AI phân loại ảnh — đọc cả nhóm ảnh trong một lần gọi

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Tầng dữ liệu — tạo đơn thiếu tin, settings, gợi ý ¥

**Files:**
- Modify: `src/db/queries.ts`
- Modify: `src/app/orders/actions.ts`

**Interfaces:**
- Consumes: `allocateMargins`, `redistribute`, `lineCostVnd`, `quotedTotalFromLines` (Task 2); `orderGaps`, `type GapCode`, `type ShipStatus` (Task 3 — `ShipStatus` nằm ở `src/lib/order-gaps.ts` để module giữ tính thuần, `src/db/schema.ts` chỉ khai báo hằng `SHIP_STATUSES` cho Drizzle); `parseSettings`, `SETTING_KEYS`, `type AppSettings`, `getSettings` (Task 1 + Bước 1 của task này).
- Produces (từ `src/db/queries.ts`):
  - `getSettings(): AppSettings`
  - `saveSettings(next: AppSettings): void`
  - `suggestCnyFromHistory(productName: string): number | null`
  - `NewOrderInput` mở rộng: `quotedTotalVnd: number`, `shipStatus: ShipStatus`, và `items[].marginVnd`, `items[].costConfirmed`
  - `updateLineCost(orderId: number, itemId: number, unitPriceCny: number): LineActionResult`
  - `updateLineMargin(orderId: number, itemId: number, marginVnd: number): LineActionResult`
  - `setShipFee(orderId: number, shipStatus: ShipStatus, shippingFee: number): LineActionResult`
  - `listOrdersWithGaps(): Promise<(OrderListRow & { gaps: GapCode[] })[]>`

- [ ] **Bước 1: Đọc/ghi settings**

Thêm vào `src/db/queries.ts` (import `settings` từ `@/db/schema`, `parseSettings`/`SETTING_KEYS`/`type AppSettings` từ `@/lib/settings`):

```ts
// ---------- Tham số nghiệp vụ ----------

export function getSettings(): AppSettings {
  const rows = sqlite.prepare("SELECT key, value FROM settings").all() as {
    key: string;
    value: string;
  }[];
  return parseSettings(rows);
}

export function saveSettings(next: AppSettings): void {
  const stmt = sqlite.prepare(
    `INSERT INTO settings(key, value) VALUES(?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  );
  // Dựng chuỗi trong JS: node:sqlite bind số JS thành REAL → "4000.0" trong DB.
  stmt.run(SETTING_KEYS.sellRate, String(next.sellRate));
  stmt.run(SETTING_KEYS.defaultMarginVnd, String(next.defaultMarginVnd));
}
```

- [ ] **Bước 2: Gợi ý ¥ theo lịch sử**

```ts
/**
 * Gợi ý giá ¥ cho món đã từng order: lấy lần gần nhất ĐÃ xác nhận giá vốn.
 * Khớp tên chính xác sau khi chuẩn hoá (bỏ khoảng trắng thừa, không phân biệt
 * hoa thường). KHÔNG đoán theo tên gần giống — gợi ý sai âm thầm còn tệ hơn
 * không gợi ý.
 */
export function suggestCnyFromHistory(productName: string): number | null {
  const key = productName.trim().replace(/\s+/g, " ").toLowerCase();
  if (key === "") return null;
  const row = sqlite
    .prepare(
      `SELECT unit_price_cny AS cny
         FROM order_items
        WHERE cost_confirmed = 1
          AND unit_price_cny > 0
          AND LOWER(TRIM(name)) = ?
        ORDER BY id DESC
        LIMIT 1`,
    )
    .get(key) as { cny: number } | undefined;
  return row ? row.cny : null;
}
```

- [ ] **Bước 3: Mở rộng `createOrder`**

Trong `NewOrderItemInput` thêm `marginVnd?: number` và `costConfirmed?: boolean`. Trong `NewOrderInput`: đổi `serviceFee` thành `quotedTotalVnd`, thêm `shipStatus: ShipStatus`.

Thay phần đầu hàm `createOrder` (từ `const goodsTotalCny` tới hết `const money = ...`) bằng:

```ts
  const goodsTotalCny = sumLineItemsCny(input.items);
  const pricingLines = input.items.map((it) => ({
    quantity: it.quantity,
    unitPriceCny: it.unitPriceCny,
    marginVnd: it.marginVnd ?? 0,
  }));
  // Lời chưa được rải (tạo đơn từ ảnh) → rải theo mức mặc định, khớp Total.
  const hasMargins = input.items.some((it) => it.marginVnd !== undefined);
  const margins = hasMargins
    ? pricingLines.map((l) => Math.round(l.marginVnd))
    : allocateMargins(
        input.quotedTotalVnd,
        pricingLines,
        input.exchangeRate,
        getSettings().defaultMarginVnd,
      );
  const marginTotal = margins.reduce((s, m) => s + m, 0);

  const money = computeOrderMoney({
    goodsTotalCny,
    exchangeRate: input.exchangeRate,
    serviceFee: marginTotal,
    shippingFee: input.shippingFee,
    deposit: input.deposit,
  });
```

Bỏ dòng `if (!customerId) throw new Error("Thiếu khách hàng cho đơn");` — đơn **được phép** chưa có khách; cờ `thieu_khach` lo phần nhắc.

Câu `INSERT INTO orders` đổi `service_fee` thành `margin_vnd` và thêm hai cột:

```ts
      `INSERT INTO orders
         (customer_id, order_type, status, exchange_rate, goods_total_cny,
          margin_vnd, shipping_fee, deposit, amount_due, note,
          quoted_total_vnd, ship_status)
       VALUES (?, ?, 'cho_bao_gia', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
```

với tham số cuối là `input.quotedTotalVnd` và `input.shipStatus`.

Vòng lặp `itemStmt` thêm hai cột:

```ts
    const itemStmt = sqlite.prepare(
      `INSERT INTO order_items
         (order_id, product_url, name, attributes, quantity, unit_price_cny,
          margin_vnd, cost_confirmed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    input.items.forEach((it, i) => {
      itemStmt.run(
        orderId,
        it.productUrl ?? null,
        it.name,
        it.attributes ?? null,
        it.quantity,
        it.unitPriceCny,
        margins[i],
        it.costConfirmed ? 1 : 0,
      );
    });
```

- [ ] **Bước 4: Sửa giá vốn / lời của một dòng**

```ts
/**
 * Nhập hoặc sửa giá ¥ của một dòng. Total giữ nguyên (khách đã đồng ý), lời
 * được rải lại cho toàn bộ dòng. Chạm vào ô này = xác nhận giá vốn.
 */
export function updateLineCost(
  orderId: number,
  itemId: number,
  unitPriceCny: number,
): LineActionResult {
  if (!(unitPriceCny >= 0))
    return { ok: false, reason: "Giá tệ không được âm" };

  sqlite.exec("BEGIN");
  try {
    const order = sqlite
      .prepare(
        "SELECT exchange_rate, quoted_total_vnd, shipping_fee, deposit FROM orders WHERE id = ?",
      )
      .get(orderId) as
      | {
          exchange_rate: number;
          quoted_total_vnd: number;
          shipping_fee: number;
          deposit: number;
        }
      | undefined;
    if (!order) throw new Error("Không tìm thấy đơn");

    sqlite
      .prepare(
        "UPDATE order_items SET unit_price_cny = ?, cost_confirmed = 1 WHERE id = ? AND order_id = ?",
      )
      .run(unitPriceCny, itemId, orderId);

    recomputeOrderMoneyRow(orderId, order);
    sqlite.exec("COMMIT");
    return { ok: true };
  } catch (err) {
    sqlite.exec("ROLLBACK");
    return { ok: false, reason: (err as Error).message };
  }
}

/** Kéo lời của một dòng; các dòng khác bù lại để Total giữ nguyên. */
export function updateLineMargin(
  orderId: number,
  itemId: number,
  marginVnd: number,
): LineActionResult {
  sqlite.exec("BEGIN");
  try {
    const order = sqlite
      .prepare(
        "SELECT exchange_rate, quoted_total_vnd, shipping_fee, deposit FROM orders WHERE id = ?",
      )
      .get(orderId) as
      | {
          exchange_rate: number;
          quoted_total_vnd: number;
          shipping_fee: number;
          deposit: number;
        }
      | undefined;
    if (!order) throw new Error("Không tìm thấy đơn");

    const rows = sqlite
      .prepare(
        "SELECT id, quantity, unit_price_cny FROM order_items WHERE order_id = ? ORDER BY id",
      )
      .all(orderId) as {
      id: number;
      quantity: number;
      unit_price_cny: number;
    }[];
    const idx = rows.findIndex((r) => r.id === itemId);
    if (idx === -1) throw new Error("Không tìm thấy dòng sản phẩm");

    const margins = redistribute(
      rows.map((r) => ({
        quantity: r.quantity,
        unitPriceCny: r.unit_price_cny,
        marginVnd: 0,
      })),
      idx,
      marginVnd,
      order.quoted_total_vnd,
      order.exchange_rate,
    );

    const stmt = sqlite.prepare("UPDATE order_items SET margin_vnd = ? WHERE id = ?");
    rows.forEach((r, i) => stmt.run(margins[i], r.id));

    recomputeOrderMoneyRow(orderId, order);
    sqlite.exec("COMMIT");
    return { ok: true };
  } catch (err) {
    sqlite.exec("ROLLBACK");
    return { ok: false, reason: (err as Error).message };
  }
}

/**
 * Đồng bộ khối tiền cấp đơn từ các dòng. Gọi BÊN TRONG transaction đang mở.
 * goods_total_cny và margin_vnd ở cấp đơn là số DẪN XUẤT từ order_items.
 */
function recomputeOrderMoneyRow(
  orderId: number,
  order: { exchange_rate: number; shipping_fee: number; deposit: number },
): void {
  const agg = sqlite
    .prepare(
      `SELECT COALESCE(SUM(quantity * unit_price_cny), 0) AS cny,
              COALESCE(SUM(margin_vnd), 0) AS margin
         FROM order_items WHERE order_id = ?`,
    )
    .get(orderId) as { cny: number; margin: number };

  const money = computeOrderMoney({
    goodsTotalCny: agg.cny,
    exchangeRate: order.exchange_rate,
    serviceFee: agg.margin,
    shippingFee: order.shipping_fee,
    deposit: order.deposit,
  });

  sqlite
    .prepare(
      "UPDATE orders SET goods_total_cny = ?, margin_vnd = ?, amount_due = ? WHERE id = ?",
    )
    .run(agg.cny, agg.margin, money.amountDue, orderId);
}

/** Nhập phí ship khi hàng về VN (hoặc đánh dấu freeship). */
export function setShipFee(
  orderId: number,
  shipStatus: ShipStatus,
  shippingFee: number,
): LineActionResult {
  if (!(shippingFee >= 0)) return { ok: false, reason: "Phí ship không được âm" };
  const fee = shipStatus === "set" ? Math.round(shippingFee) : 0;

  sqlite.exec("BEGIN");
  try {
    const order = sqlite
      .prepare("SELECT exchange_rate, deposit FROM orders WHERE id = ?")
      .get(orderId) as { exchange_rate: number; deposit: number } | undefined;
    if (!order) throw new Error("Không tìm thấy đơn");

    sqlite
      .prepare("UPDATE orders SET ship_status = ?, shipping_fee = ? WHERE id = ?")
      .run(shipStatus, fee, orderId);

    recomputeOrderMoneyRow(orderId, { ...order, shipping_fee: fee });
    sqlite.exec("COMMIT");
    return { ok: true };
  } catch (err) {
    sqlite.exec("ROLLBACK");
    return { ok: false, reason: (err as Error).message };
  }
}
```

- [ ] **Bước 5: Danh sách đơn kèm cờ thiếu**

```ts
export async function listOrdersWithGaps(): Promise<
  (OrderListRow & { gaps: GapCode[] })[]
> {
  const rows = await listOrders();
  const meta = sqlite
    .prepare(
      `SELECT o.id                                         AS id,
              o.order_type                                 AS orderType,
              o.status                                     AS status,
              o.customer_id                                AS customerId,
              o.ship_status                                AS shipStatus,
              c.phone                                      AS phone,
              c.address                                    AS address,
              (SELECT COUNT(*) FROM order_items i
                WHERE i.order_id = o.id AND i.cost_confirmed = 0) AS unconfirmed,
              (SELECT COUNT(*) FROM photos p
                WHERE p.order_id = o.id AND p.label = 'product')  AS productPhotos
         FROM orders o LEFT JOIN customers c ON c.id = o.customer_id`,
    )
    .all() as {
    id: number;
    orderType: OrderType;
    status: OrderStatus;
    customerId: number | null;
    shipStatus: ShipStatus;
    phone: string | null;
    address: string | null;
    unconfirmed: number;
    productPhotos: number;
  }[];

  const byId = new Map(meta.map((m) => [m.id, m]));
  return rows.map((r) => {
    const m = byId.get(r.id);
    if (!m) return { ...r, gaps: [] };
    return {
      ...r,
      gaps: orderGaps(
        {
          orderType: m.orderType,
          status: m.status,
          customerId: m.customerId,
          customerPhone: m.phone,
          customerAddress: m.address,
          shipStatus: m.shipStatus,
        },
        Array.from({ length: m.unconfirmed }, () => ({ costConfirmed: false })),
        Array.from({ length: m.productPhotos }, () => ({
          label: "product" as const,
        })),
      ),
    };
  });
}
```

- [ ] **Bước 6: Sửa `getOrderDetail` cho khách nullable**

Câu truy vấn `customers` hiện dùng `eq(customers.id, order.customerId)` sẽ vỡ khi `customerId` là `null`. Bọc lại:

```ts
  const customer = order.customerId
    ? await db.select().from(customers).where(eq(customers.id, order.customerId)).get()
    : null;
```

- [ ] **Bước 7: Cập nhật `createOrderAction`**

Trong `src/app/orders/actions.ts`: bỏ ràng buộc `if (!customerId) return { error: "Chưa chọn khách hàng." }` — cho phép để trống. Đọc thêm `quotedTotalVnd` và `shipStatus` từ form, truyền vào `createOrder` thay cho `serviceFee`. Bỏ `serviceFee` khỏi lời gọi `validateOrderMoney` (truyền `0`).

- [ ] **Bước 8: Typecheck + test**

```bash
npm test && npx tsc --noEmit
```

Kỳ vọng: toàn bộ xanh. Sửa mọi chỗ tsc còn báo `serviceFee`.

- [ ] **Bước 9: Commit**

```bash
git add src/db/queries.ts src/app/orders/actions.ts
git commit -m "$(cat <<'EOF'
v3A-5: tầng dữ liệu — đơn thiếu tin, settings, gợi ý ¥, sửa giá vốn/lời theo dòng

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Màn "Đơn mới từ Zalo" — thả ảnh & xác nhận nhãn

**Files:**
- Modify: `src/app/orders/new/new-order-form.tsx`
- Modify: `src/app/orders/new/page.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `POST /api/read-zalo` trả `{ ok: true, data: ZaloBatchExtract }` (Task 4); `createOrderAction` nhận thêm `quotedTotalVnd`, `shipStatus` (Task 5); `IMAGE_KIND_LABELS`, `IMAGE_KINDS` (Task 4).
- Produces: form gửi `items` JSON có `marginVnd` + `costConfirmed`, cùng `quotedTotalVnd` và `shipStatus`.

- [ ] **Bước 1: Vùng thả nhiều ảnh**

Đổi input ảnh Zalo hiện có thành `<input type="file" accept="image/*" multiple capture="environment" />` bọc trong nhãn kiểu vùng thả lớn (tối thiểu 140px cao, viền đứt) — chốt đơn chủ yếu trên điện thoại nên vùng chạm phải to. Gửi lên `/api/read-zalo` bằng `FormData` với **nhiều** field `files`.

- [ ] **Bước 2: Lưới xác nhận nhãn ảnh**

Sau khi API trả về, hiện mỗi ảnh dạng thẻ nhỏ kèm `<select>` loại ảnh, giá trị mặc định là `kind` AI đoán:

```tsx
{previews.map((p, i) => (
  <div key={i} className="img-card">
    <img src={p.url} alt="" />
    <select
      value={kinds[i]}
      onChange={(e) => setKind(i, e.target.value as ImageKind)}
    >
      {IMAGE_KINDS.map((k) => (
        <option key={k} value={k}>{IMAGE_KIND_LABELS[k]}</option>
      ))}
    </select>
  </div>
))}
```

- [ ] **Bước 3: Đổ dữ liệu đọc được vào form, đặt số tiền cạnh ảnh**

Điền `Total`, cọc, ship, tên khách/SĐT/địa chỉ, và các dòng sản phẩm. Hiện khối *"AI đọc được"* ngay **cạnh ảnh chốt đơn thu nhỏ** để đối chiếu bằng mắt: `Total: 410.000₫ · Cọc: 100.000₫ · Ship: chưa biết`.

Ánh xạ ship: `shipFree` → `shipStatus = "free"`; `shipVnd` có số → `"set"`; còn lại → `"unknown"`.

- [ ] **Bước 4: Điền trước giá ¥ và đánh dấu là gợi ý**

Với mỗi dòng sản phẩm, gọi server action tra `suggestCnyFromHistory(name)`. Có kết quả thì dùng; không thì dùng `suggestCnyFromTotal(total, soMon, sellRate, defaultMargin)`. Cả hai trường hợp đều đặt `costConfirmed = false`.

Ô ¥ chưa xác nhận hiển thị chữ nhạt kèm chữ *"gợi ý"*; người dùng sửa hoặc bấm **Xác nhận** thì chuyển `costConfirmed = true` và bỏ kiểu chữ nhạt.

```css
.cny-suggested { color: var(--muted); font-style: italic; }
.cny-suggested::after { content: " (gợi ý)"; font-size: 0.85em; }
```

- [ ] **Bước 5: Cảnh báo nhiều ảnh chốt đơn**

Nếu `data.images` có từ 2 ảnh `chot_don` trở lên, hiện dải cảnh báo: *"Phát hiện 2 ảnh chốt đơn — đây là 2 đơn riêng?"* kèm nút **Tách thành 2 đơn** (tạo đơn hiện tại rồi mở lại form trống với ảnh còn lại) và nút **Không, cùng một đơn**.

- [ ] **Bước 6: Bỏ ràng buộc bắt buộc chọn khách**

Cho phép gửi form khi chưa chọn khách. Dưới ô khách hiện chú thích: *"Để trống được — đơn sẽ mang cờ Thiếu thông tin khách."*

- [ ] **Bước 7: Kiểm chứng bằng preview**

```bash
# dùng công cụ preview của harness (.claude/launch.json), KHÔNG chạy npm run dev bằng shell
```

Mở `/orders/new`, thả 2–3 ảnh, kiểm: nhãn loại đổi được, số tiền hiện cạnh ảnh, ô ¥ có chữ "gợi ý", tạo được đơn khi bỏ trống khách. Chụp màn hình ở cả khổ mobile (375px) và desktop.

- [ ] **Bước 8: Commit**

```bash
git add src/app/orders/new src/app/globals.css
git commit -m "$(cat <<'EOF'
v3A-6: màn Đơn mới từ Zalo — thả nhiều ảnh, xác nhận nhãn, điền trước giá ¥

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Chi tiết đơn — bảng bóc lớp giá

**Files:**
- Modify: `src/app/orders/[id]/page.tsx`
- Create: `src/app/orders/[id]/line-pricing-table.tsx`
- Modify: `src/app/orders/actions.ts`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `updateLineCost`, `updateLineMargin`, `setShipFee`, `getSettings` (Task 5); `lineCostVnd`, `lineSellVnd`, `orderProfit` (Task 2); `orderGaps`, `GAP_LABELS` (Task 3).
- Produces: server action `updateLineCostAction`, `updateLineMarginAction`, `setShipFeeAction` trong `src/app/orders/actions.ts`.

- [ ] **Bước 1: Ba server action**

Thêm vào `src/app/orders/actions.ts`, theo đúng khuôn `lineExceptionAction` (kiểm phiên → gọi query → `revalidatePath` → `redirect` kèm `?err=` khi hỏng):

```ts
export async function updateLineCostAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");
  const orderId = Number(formData.get("orderId"));
  const itemId = Number(formData.get("itemId"));
  const result = updateLineCost(orderId, itemId, num(formData.get("unitPriceCny")));
  if (!result.ok) redirect(`/orders/${orderId}?err=${encodeURIComponent(result.reason)}`);
  revalidatePath(`/orders/${orderId}`);
  redirect(`/orders/${orderId}`);
}
```

Viết `updateLineMarginAction` và `setShipFeeAction` theo cùng khuôn (đọc `marginVnd` / `shipStatus` + `shippingFee`).

- [ ] **Bước 2: Bảng bóc lớp**

Tạo `src/app/orders/[id]/line-pricing-table.tsx` — component server, mỗi dòng là một `<form>` nhỏ:

| Cột | Nội dung |
|---|---|
| Sản phẩm | tên + thuộc tính |
| ¥ | ô nhập; chưa xác nhận thì thêm class `cny-suggested` |
| Giá vốn | `lineCostVnd` — chỉ đọc |
| Lời | ô nhập; đơn 1 dòng thì `readOnly` kèm `title="Total đã chốt ghim cứng lời của đơn một món"` |
| Giá bán | `lineSellVnd` — chỉ đọc |

Chân bảng: **Total đã chốt** (`quotedTotalVnd`) và **Tổng lời** (`orderProfit`). Lời âm thì thêm class `profit-negative` và hiện `⚠️ Đơn này đang lỗ {formatVnd(-profit)}`.

```css
.profit-negative { color: var(--danger); font-weight: 600; }
```

- [ ] **Bước 3: Khối ship**

Khi `shipStatus === "unknown"`: hiện form nhập phí ship + nút **Freeship**. Khi đã có: hiện số tiền kèm nút **Sửa**.

- [ ] **Bước 4: Dải cờ thiếu**

Đầu trang chi tiết, nếu `orderGaps(...)` không rỗng thì hiện dải chip màu cảnh báo, mỗi cờ một chip dùng `GAP_LABELS`, kèm câu *"Đơn vẫn chạy bình thường — các mục này chỉ để nhắc bổ sung."*

- [ ] **Bước 5: Khách rỗng không làm vỡ trang**

`getOrderDetail` giờ trả `customer: null` được. Chỗ nào đang đọc `customer.name` phải chuyển thành `customer?.name ?? "— chưa có khách —"` kèm nút **Gắn khách**.

- [ ] **Bước 6: Kiểm chứng bằng preview**

Mở một đơn nhiều món: sửa ¥ → giá bán đổi nhưng **Total giữ nguyên**; kéo lời một dòng → dòng kia bù lại; nhập ¥ thật cao → hiện cảnh báo lỗ. Chụp màn hình cả mobile lẫn desktop.

- [ ] **Bước 7: Kiểm tra bất biến trên DB thật sau khi thao tác**

```bash
node -e "
const {DatabaseSync}=require('node:sqlite');
const d=new DatabaseSync('data/app.sqlite');
const t=d.prepare('SELECT COUNT(*) c FROM orders o WHERE o.quoted_total_vnd <> (SELECT COALESCE(SUM(i.margin_vnd),0)+CAST(ROUND(o.goods_total_cny*o.exchange_rate) AS INTEGER) FROM order_items i WHERE i.order_id=o.id)').get();
console.log(t.c===0?'✓ bất biến còn nguyên':'✗ '+t.c+' đơn lệch Total');
"
```

Kỳ vọng: `✓`.

- [ ] **Bước 8: Commit**

```bash
git add "src/app/orders/[id]" src/app/orders/actions.ts src/app/globals.css
git commit -m "$(cat <<'EOF'
v3A-7: chi tiết đơn — bảng bóc lớp giá theo món, cảnh báo lỗ, khối ship

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Thẻ "Cần bổ sung" + màn Cài đặt

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/orders/page.tsx`
- Create: `src/app/settings/page.tsx`
- Create: `src/app/settings/actions.ts`
- Modify: `src/app/_components/nav-config.ts`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `listOrdersWithGaps`, `getSettings`, `saveSettings` (Task 5); `GAP_LABELS`, `GAP_CODES` (Task 3).
- Produces: route `/settings`; server action `saveSettingsAction(formData: FormData)`.

- [ ] **Bước 1: Thẻ "Cần bổ sung" ở Tổng quan**

Trong `src/app/page.tsx`, đổi `listOrders()` thành `listOrdersWithGaps()`, rồi thêm một `<section className="card">` sau thẻ *Cần chú ý*:

```tsx
const needInfo = orders.filter((o) => o.gaps.length > 0);
```

Thẻ hiện tổng số đơn thiếu, và bên dưới là số lượng theo từng loại thiếu (dùng `GAP_CODES` + `GAP_LABELS`), mỗi dòng dẫn tới `/orders?gap=<code>`. Không có đơn nào thiếu thì hiện *"Không đơn nào thiếu thông tin 👍"*.

- [ ] **Bước 2: Lọc theo cờ ở danh sách đơn**

`src/app/orders/page.tsx` đọc `searchParams.gap`; có giá trị hợp lệ trong `GAP_CODES` thì lọc còn các đơn mang cờ đó, và hiện chip *"Đang lọc: {GAP_LABELS[gap]}"* kèm nút bỏ lọc. Mỗi hàng đơn có cờ thì hiện một chấm nhỏ `title` liệt kê các cờ.

```css
.gap-dot { display:inline-block; width:8px; height:8px; border-radius:50%;
           background: var(--warn); margin-left:6px; }
```

- [ ] **Bước 3: Màn Cài đặt**

`src/app/settings/page.tsx` — bọc `<AppShell username={session.username}>`, form hai ô số: **Tỷ giá bán (₫/¥)** và **Lời mặc định mỗi món (₫)**, đổ giá trị từ `getSettings()`. Chú thích dưới form:

> Hai số này chỉ dùng để **điền trước** khi tạo đơn mới. Đơn đã tạo giữ nguyên tỷ giá của nó — đổi ở đây không làm thay đổi đơn cũ.

`src/app/settings/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { saveSettings } from "@/db/queries";
import { SETTING_DEFAULTS } from "@/lib/settings";

export async function saveSettingsAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const sellRate = Number(String(formData.get("sellRate") ?? "").replace(/[,\s.]/g, ""));
  const defaultMarginVnd = Number(
    String(formData.get("defaultMarginVnd") ?? "").replace(/[,\s.]/g, ""),
  );

  saveSettings({
    sellRate: sellRate > 0 ? sellRate : SETTING_DEFAULTS.sellRate,
    defaultMarginVnd:
      defaultMarginVnd >= 0 ? defaultMarginVnd : SETTING_DEFAULTS.defaultMarginVnd,
  });

  revalidatePath("/settings");
  redirect("/settings?ok=1");
}
```

- [ ] **Bước 4: Thêm mục điều hướng**

Thêm `/settings` vào `src/app/_components/nav-config.ts` (**một chỗ duy nhất** — sidebar và bottom-tab đều đọc từ đây). Dùng icon có sẵn trong `icons.tsx`; chưa có icon phù hợp thì thêm một cái mới ở đó.

- [ ] **Bước 5: Kiểm chứng bằng preview**

Mở `/` xem thẻ *Cần bổ sung* đếm đúng; bấm một loại thiếu → `/orders?gap=...` lọc đúng; đổi tỷ giá bán ở `/settings`, lưu, tạo đơn mới và xác nhận số điền trước dùng tỷ giá mới trong khi **đơn cũ không đổi**. Chụp màn hình mobile + desktop.

- [ ] **Bước 6: QA cuối**

```bash
npm test && npx tsc --noEmit && npm run db:backup
```

- [ ] **Bước 7: Commit**

```bash
git add src/app/page.tsx src/app/orders/page.tsx src/app/settings src/app/_components/nav-config.ts src/app/globals.css
git commit -m "$(cat <<'EOF'
v3A-8: thẻ Cần bổ sung ở Tổng quan, lọc theo cờ, màn Cài đặt

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Bước 8: Cập nhật CLAUDE.md và đẩy lên remote**

Trong `CLAUDE.md`: đổi trạng thái thành *v3-A xong*, thêm ghi chú vào mục gotchas:

> **Tiền v3-A:** `orders.service_fee` đã đổi tên thành `margin_vnd` và mang nghĩa **tổng lời** (= Σ `order_items.margin_vnd`). `quoted_total_vnd` là Total đã chốt với khách, **bất biến** và **không gồm ship**. Sửa ¥ thì lời được rải lại, Total giữ nguyên — luật này khoá bởi `tests/line-pricing.test.ts`.
> **Tham số nghiệp vụ** (tỷ giá bán, lời mặc định) nằm ở bảng `settings`, không phải `.env`.

```bash
git add CLAUDE.md && git commit -m "$(cat <<'EOF'
docs: cập nhật CLAUDE.md cho v3-A

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)" && git push
```

---

## Đối chiếu kế hoạch với spec

| Mục spec | Task |
|---|---|
| 3.1 Total bất biến, không gồm ship | 2 (test bất biến), 5 (`recomputeOrderMoneyRow`) |
| 3.2 Lời là phần dư | 2 (`allocateMargins`) |
| 3.3 Bóc lớp cấp dòng | 1 (cột), 2 (hàm), 7 (bảng) |
| 3.4 Phân biệt số đoán / số xác nhận | 1 (`cost_confirmed`), 6 (chữ nhạt), 7 (nút Xác nhận) |
| 4 Thay đổi CSDL | 1 |
| 5.1 `line-pricing.ts` | 2 |
| 5.2 `order-gaps.ts` | 3 |
| 5.3 Phân loại ảnh | 4 |
| 6 Luồng nhập 3 mảnh | 6 |
| 7 Điền trước & gợi ý | 5 (truy vấn lịch sử), 6 (UI) |
| 8 Hai chiều & `ban_tu_kho` | 2 (test tỷ giá 1), 3 (loại trừ cờ giá vốn) |
| 9 Xử lý lỗi | 4 (AI hỏng), 5 (kiểm tra đầu vào), 7 (cảnh báo lỗ) |
| 10 Hiển thị | 7, 8 |
| 11 Test | 1, 2, 3, 4 + hồi quy ở mọi task |
