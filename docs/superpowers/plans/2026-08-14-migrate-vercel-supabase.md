# Chuyển HeyP sang Vercel + Supabase — Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuyển HeyP từ self-host (node:sqlite + filesystem cục bộ + job `setInterval`) sang chạy trên Vercel + Supabase free tier, giữ nguyên 100% nghiệp vụ tiền/trạng thái/tồn kho.

**Architecture:** Thay lớp DB bằng Postgres (Supabase) qua `postgres-js` + Drizzle, đi qua Supavisor pooler ở transaction mode. Toàn bộ SQL thô hiện có được giữ gần như nguyên văn nhờ một lớp helper `Exec` (tự đổi `?` → `$n`, bọc transaction), nên rủi ro sai công thức tiền là thấp nhất. Ảnh chuyển sang Supabase Storage nhưng **giữ nguyên URL `/api/photo/[id]`** để frontend không phải sửa. Job nền `setInterval` bị xoá, thay bằng GitHub Actions gọi `POST /api/cron/track` (cũng đóng luôn vai trò giữ Supabase khỏi tự pause sau 7 ngày).

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Drizzle ORM `postgres-js` driver, `postgres` (postgres-js), `@supabase/supabase-js` (chỉ dùng cho Storage), Supabase Postgres, Vercel Hobby, GitHub Actions.

## Global Constraints

- **Node 26.** `package.json` có `"type": "module"`.
- **KHÔNG dùng `better-sqlite3`** — không build được trên Node 26.
- **`node:sqlite` chỉ còn được dùng trong duy nhất 1 file:** `scripts/migrate-to-postgres.ts` (script chuyển dữ liệu 1 lần). Mọi code runtime khác không được import `node:sqlite`.
- **KHÔNG xoá `data/app.sqlite`** — đang chứa dữ liệu thật của Niên. Đây là nguồn dữ liệu để migrate và là bản lùi nếu migration thất bại.
- **Test bắt buộc xanh sau MỖI task:** `npm test` và `npx tsc --noEmit`. 14 test hiện có là module thuần (không import `@/`), chúng KHÔNG được sửa trong plan này — chúng là lưới an toàn chứng minh công thức tiền/trạng thái không đổi. Nếu một task làm đỏ test, task đó sai, không phải test sai.
- **Test module thuần import bằng đuôi `.ts` tường minh** (vd `../src/lib/money.ts`); module dùng cho test không được import file có alias `@/`.
- **UI tiếng Việt.** Đơn vị tiền VND (₫), tệ (¥).
- **Commit tiếng Việt**, kết thúc bằng `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Luật tiền bất biến (v3-A):** `quoted_total_vnd` là Total đã chốt với khách, **bất biến** và **không gồm ship**. Sửa ¥ thì lời được rải lại, Total giữ nguyên. Khoá bởi `tests/line-pricing.test.ts`.
- **`orders.deposit` là số dẫn xuất** = Σ `payments`, mọi thay đổi đi qua `syncOrderDeposit`.
- **Ví ¥ append-only:** không sửa dòng `chi` cũ, chỉ ghi dòng `dieu_chinh`.
- **Báo cáo lãi tính theo ngày HOÀN TẤT**, đọc từ `order_status_history`.
- Sau khi xong plan này, **cập nhật `CLAUDE.md`** (Task 19) — nhiều gotcha trong đó sẽ sai.

## Quyết định kiến trúc đã chốt (đọc trước khi code)

Ba quyết định dưới đây được chọn để **giảm rủi ro sai nghiệp vụ**, không phải để "idiomatic Postgres". Đừng tự ý đổi.

1. **Thời gian vẫn là epoch-seconds (`bigint`), KHÔNG dùng `timestamptz`.** Toàn bộ code đang so sánh epoch số nguyên (`monthRange`, `getPnlData`, `getCashFlow`, `addExpense`, `addPayment`). Đổi sang `timestamptz` sẽ phải viết lại tầng báo cáo tiền — đúng chỗ CLAUDE.md nói "sai là mất tiền thật". Drizzle vẫn trả `Date` cho app code nhờ `customType`, nên tầng UI không đổi. `unixepoch()` → `EXTRACT(EPOCH FROM now())::bigint`.
2. **Số thực dùng `double precision`, KHÔNG dùng `numeric`.** `numeric` khiến postgres-js trả về **string** → phép cộng trong JS thành nối chuỗi, lỗi âm thầm. `double precision` là cùng IEEE-754 với SQLite `REAL` → hành vi giống hệt hôm nay. (Các khoản VND vẫn là số nguyên như cũ.)
3. **Boolean thành `boolean` thật.** SQLite đang giả lập 0/1. Đây là thay đổi *có* rủi ro vì code so sánh `=== 1` và SQL viết `= 1`; Task 3 liệt kê **toàn bộ** vị trí phải sửa, không được bỏ sót.

**Lợi ích miễn phí:** đổi driver sửa luôn bug đã ghi trong CLAUDE.md — `sqlite-proxy` `.get()` trả `{rows:[]}` thay vì `undefined` làm mọi trang chi tiết trả 500 thay vì 404. Task 13 verify việc này.

## File Structure

**Tạo mới:**
- `src/db/raw.ts` — lớp `Exec`: chạy SQL thô (tự đổi `?`→`$n`), và `withTx()` bọc transaction. Đây là file then chốt giúp giữ nguyên văn 41 câu SQL thô.
- `src/lib/storage.ts` — client Supabase Storage (upload/download/xoá ảnh). Chỉ file này biết về Supabase SDK.
- `scripts/migrate-to-postgres.ts` — chuyển dữ liệu SQLite → Postgres 1 lần (file duy nhất còn được import `node:sqlite`).
- `scripts/migrate-uploads-to-storage.ts` — đẩy 10 file trong `uploads/` lên Storage.
- `.github/workflows/tracking-sweep.yml` — cron 4h gọi `/api/cron/track`.
- `.github/workflows/db-backup.yml` — `pg_dump` hằng ngày, lưu artifact.

**Sửa:**
- `src/db/schema.ts` — viết lại toàn bộ sang `pg-core`.
- `src/db/index.ts` — viết lại: `postgres-js` + Drizzle, bỏ `node:sqlite`.
- `src/db/queries.ts` — 41 câu SQL thô đổi sang `raw`/`withTx`; mọi hàm đồng bộ thành `async`.
- `src/lib/config.ts` — bỏ `databasePath`/`uploadsPath`/`backup*`, thêm `databaseUrl`/`supabase*`.
- `src/app/api/upload/route.ts`, `src/app/api/photo/[id]/route.ts` — dùng Storage.
- 20 file caller — thêm `await` (82 call site).
- `src/app/backup/page.tsx`, `src/app/backup/actions.ts` — đổi nội dung sang mô tả cơ chế backup mới.
- `drizzle.config.ts`, `.env.example`, `package.json`, `CLAUDE.md`.

**Xoá:**
- `src/instrumentation.ts`, `src/instrumentation-node.ts` — không còn job nền trong tiến trình.
- `src/lib/backup.ts`, `scripts/backup.ts`, `scripts/restore.ts` — `VACUUM INTO` không tồn tại ở Postgres.
- `drizzle/0000_init.sql` … `0004_v3b_tai_chinh.sql` — thay bằng migration Postgres mới. **Chỉ xoá ở Task 4, sau khi migration mới đã chạy được.**
- `scripts/migrate.ts` (migration runner SQLite) — thay bằng `drizzle-kit migrate`.

---

### Task 1: Nhánh làm việc + bản lùi an toàn + dựng Supabase

Task này không sửa code. Nó tạo điểm lùi và dựng hạ tầng. Làm sai thứ tự ở đây là mất dữ liệu thật.

**Files:**
- Modify: `.env` (không commit — đã gitignored)

**Interfaces:**
- Produces: 2 connection string Postgres (`DATABASE_URL` pooler, `DIRECT_URL` direct), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, bucket `photos` — mọi task sau đều cần.

- [ ] **Step 1: Kiểm tra cây làm việc sạch và tạo nhánh**

```bash
git status
git checkout -b feat/vercel-supabase
```

Nếu `git status` có thay đổi chưa commit: `git stash -u` trước, đừng đi tiếp.

- [ ] **Step 2: Tạo bản lùi dữ liệu thật, để NGOÀI repo**

```bash
npm run db:backup
cp -R backups "$HOME/heyp-backup-truoc-migrate-$(date +%Y%m%d)"
```

Kiểm tra thư mục vừa copy có `app.sqlite` và thư mục `uploads`. Đây là bản lùi duy nhất nếu migration hỏng — `data/app.sqlite` vẫn giữ nguyên trong repo, không được xoá.

- [ ] **Step 3: Dựng project Supabase (thủ công trên dashboard)**

1. Tạo project free tier, region gần VN nhất (`Southeast Asia (Singapore)`).
2. Lưu mật khẩu database do Supabase sinh ra.
3. Trên trang project, bấm nút **Connect** (ở đầu trang) → hộp thoại hiện ra các kiểu chuỗi kết nối. Lấy 2 chuỗi:
   - **Transaction pooler** (port `6543`) → dùng cho `DATABASE_URL` (runtime app).
   - **Session pooler** (port `5432`) → dùng cho `DIRECT_URL` (migration, `pg_dump`). **Không lấy "Direct connection"** (host dạng `db.xxx.supabase.co`) — trên free tier nó chỉ chạy qua IPv6, còn máy bạn và GitHub Actions gần như chắc chắn chỉ có IPv4, sẽ không kết nối được. Session pooler cũng ở cổng `5432` nhưng đi qua Supavisor nên hỗ trợ IPv4, và vẫn đủ tính năng cho migration/pg_dump (không giới hạn như Transaction pooler).
   - Cả hai chuỗi đều có placeholder `[YOUR-PASSWORD]` — thay bằng mật khẩu đã lưu ở bước 2.
4. Vào **Storage** (sidebar trái) → **New bucket**, tên `photos`, **để chế độ Private** (ảnh chốt đơn của khách, không được public).
5. Lấy service-role key: bấm biểu tượng bánh răng (**Project Settings**, cuối sidebar trái) → **API Keys**. Supabase đang chuyển sang cặp key mới (`sb_publishable_...` / `sb_secret_...`) thay cho `anon`/`service_role` cũ — cả hai loại đều dùng được, chọn 1 trong 2:
   - Cách cũ (đơn giản hơn nếu vẫn còn hiển thị): tab **Legacy API Keys** → copy `service_role`.
   - Cách mới: tab **API Keys** → mục **Secret keys** → copy giá trị `sb_secret_...` (nếu chưa có, bấm **Create new API Keys** trước).
   Project URL lấy ở đầu trang **API Keys**, hoặc trong hộp thoại **Connect**.

- [ ] **Step 4: Ghi biến môi trường vào `.env`**

Thêm vào `.env` (giữ lại `APP_ACCOUNTS`, `SESSION_SECRET`, `GEMINI_API_KEY`, `STALE_ORDER_DAYS` đang có):

```bash
# Runtime: Supavisor transaction pooler (port 6543) — BẮT BUỘC cho serverless.
DATABASE_URL=postgresql://postgres.xxxx:MATKHAU@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
# Migration: direct connection (port 5432) — transaction mode không chạy được migration.
DIRECT_URL=postgresql://postgres.xxxx:MATKHAU@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres

SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_STORAGE_BUCKET=photos

CRON_SECRET=<openssl rand -hex 32>
```

`SESSION_SECRET` hiện có thể vẫn là giá trị mặc định không an toàn — sinh lại ngay: `openssl rand -hex 32`.

- [ ] **Step 5: Xác nhận kết nối được tới Postgres**

```bash
psql "$DIRECT_URL" -c "select version();"
```

Expected: in ra `PostgreSQL 15.x` (hoặc mới hơn). Nếu lỗi xác thực → sai mật khẩu trong connection string. Nếu không có `psql`: `brew install libpq`.

- [ ] **Step 6: Commit**

Chỉ commit `.env.example` nếu đã sửa; `.env` gitignored nên không có gì để commit ở task này. Bỏ qua commit và đi tiếp nếu `git status` sạch.

---

### Task 2: Cài dependency + viết lại `config.ts`

**Files:**
- Modify: `package.json`
- Modify: `src/lib/config.ts:25-38`
- Modify: `.env.example`
- Modify: `drizzle.config.ts`

**Interfaces:**
- Produces: `config.databaseUrl`, `config.supabaseUrl`, `config.supabaseServiceRoleKey`, `config.storageBucket` — Task 5 và Task 14 dùng. `config.accounts`, `config.sessionSecret`, `config.staleOrderDays`, `config.geminiApiKey`, `config.geminiModel` giữ nguyên tên và kiểu.

- [ ] **Step 1: Cài dependency**

```bash
npm install postgres @supabase/supabase-js
```

`postgres` là postgres-js — driver Supabase khuyến nghị cho serverless. Không cài `pg`. `drizzle-orm` và `drizzle-kit` đã có sẵn, đủ dùng cho dialect postgresql.

- [ ] **Step 2: Viết lại `config.ts`**

Thay nguyên khối `export const config` (dòng 25-38) bằng:

```ts
export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  accounts: parseAccounts(process.env.APP_ACCOUNTS),
  sessionSecret: process.env.SESSION_SECRET ?? "insecure-dev-secret-doi-di",
  staleOrderDays: Number(process.env.STALE_ORDER_DAYS ?? "7"),
  // Phase 5 — đọc ảnh chốt đơn Zalo bằng Gemini (Google AI Studio).
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-flash-latest",
  // Ảnh nằm trên Supabase Storage, không còn thư mục cục bộ.
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  storageBucket: process.env.SUPABASE_STORAGE_BUCKET ?? "photos",
} as const;
```

`databasePath`, `uploadsPath`, `backupPath`, `backupKeep`, `backupMinHours` bị xoá. Hàm `parseAccounts` và `findAccount` giữ nguyên không sửa.

- [ ] **Step 3: Sửa `drizzle.config.ts`**

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  // Migration phải đi đường direct (5432) — transaction pooler không chạy được
  // migration nhiều câu lệnh trong một transaction.
  dbCredentials: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
});
```

- [ ] **Step 4: Cập nhật `.env.example`**

Xoá các khối `DATABASE_PATH`, `UPLOADS_PATH`, `TRACKING_SWEEP_MINUTES`, `BACKUP_PATH`, `BACKUP_KEEP`, `BACKUP_MIN_HOURS`. Thêm:

```bash
# === Postgres (Supabase) ===
# Runtime dùng transaction pooler (port 6543) — bắt buộc cho serverless/Vercel.
DATABASE_URL=postgresql://postgres.xxxx:MATKHAU@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
# Migration dùng direct connection (port 5432).
DIRECT_URL=postgresql://postgres.xxxx:MATKHAU@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres

# === Supabase Storage (ảnh) ===
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=photos

# Bí mật cho GitHub Actions gọi POST /api/cron/track?secret=...
CRON_SECRET=
```

- [ ] **Step 5: Chạy test — phải vẫn xanh**

```bash
npm test
```

Expected: PASS toàn bộ 14 file test. `tsc` sẽ còn đỏ ở bước này (`src/db/index.ts` vẫn dùng `config.databasePath`) — đó là bình thường, Task 5 sửa. Đừng chạy `tsc` ở task này.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/config.ts drizzle.config.ts .env.example
git commit -m "chuyển hosting: cài driver Postgres + đổi config sang Supabase

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Viết lại `schema.ts` sang Postgres

**Files:**
- Modify: `src/db/schema.ts` (viết lại toàn bộ)

**Interfaces:**
- Consumes: `config` (không trực tiếp), các hằng enum từ `@/lib/order-status`, `@/lib/photos`, `@/lib/expenses` — giữ nguyên đường import.
- Produces: các bảng `customers`, `orders`, `orderItems`, `packages`, `orderPackages`, `inventory`, `photos`, `orderStatusHistory`, `settings`, `cnyLedger`, `expenses`, `payments` — **giữ nguyên tên export và tên property** để `queries.ts` không phải đổi tên. Các cột `createdAt`/`uploadedAt`/`changedAt`/`spentAt`/`paidAt`/`statusChangedAt`/`lastCheckedAt`/`lastImportedAt` vẫn trả về `Date` cho app code. Export thêm `LINE_STATUSES`, `SHIP_STATUSES`, `PACKAGE_MODES`, `INVENTORY_SOURCES` như cũ.

- [ ] **Step 1: Viết lại toàn bộ `src/db/schema.ts`**

```ts
/**
 * Schema CSDL (Drizzle + Postgres/Supabase) — 6 bảng chính theo spec mục 5,
 * cộng bảng nối Kiện↔Đơn (nhiều-nhiều) và bảng lịch sử trạng thái (timeline).
 *
 * Nguồn chân lý cho enum trạng thái & loại đơn: src/lib/order-status.ts
 * (dùng chung với module luật nghiệp vụ để không lệch nhau).
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  doublePrecision,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
} from "drizzle-orm/pg-core";
import { ORDER_STATUSES, ORDER_TYPES } from "@/lib/order-status";
import { PHOTO_LABELS } from "@/lib/photos";
import {
  EXPENSE_CATEGORIES,
  LEDGER_KINDS,
  PAYMENT_KINDS,
  PAYMENT_METHODS,
} from "@/lib/expenses";

export const LINE_STATUSES = ["normal", "supplier_defect", "returned"] as const;
export const SHIP_STATUSES = ["unknown", "free", "set"] as const;
export const PACKAGE_MODES = ["auto", "manual"] as const;
export const INVENTORY_SOURCES = [
  "active", // Nhập chủ động
  "supplier_defect", // Lỗi NCC
  "exchange_return", // Đổi trả
  "bom", // Hàng bom
] as const;

/**
 * Thời gian lưu bằng epoch-seconds (bigint), KHÔNG dùng timestamptz: tầng báo
 * cáo tiền đang so sánh epoch số nguyên trong SQL thô, đổi kiểu sẽ phải viết
 * lại toàn bộ chỗ đó. Lớp này giữ giao diện Date cho app code.
 */
const epochSeconds = customType<{ data: Date; driverData: string | number }>({
  dataType() {
    return "bigint";
  },
  fromDriver(value) {
    return new Date(Number(value) * 1000);
  },
  toDriver(value) {
    return Math.floor(value.getTime() / 1000);
  },
});

const NOW_EPOCH = sql`(EXTRACT(EPOCH FROM now())::bigint)`;

const createdAt = () => epochSeconds("created_at").notNull().default(NOW_EPOCH);

// 1) Khách hàng
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"),
  address: text("address"),
  note: text("note"),
  warningFlag: boolean("warning_flag").notNull().default(false),
  warningReason: text("warning_reason"),
  createdAt: createdAt(),
});

// 2) Đơn hàng
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").references(() => customers.id),
  orderType: text("order_type", { enum: ORDER_TYPES }).notNull(),
  status: text("status", { enum: ORDER_STATUSES })
    .notNull()
    .default("cho_bao_gia"),
  // Khối tiền — CNY & tỷ giá là số thực; các khoản VND là số nguyên đồng.
  exchangeRate: doublePrecision("exchange_rate").notNull().default(0),
  goodsTotalCny: doublePrecision("goods_total_cny").notNull().default(0),
  marginVnd: integer("margin_vnd").notNull().default(0),
  shippingFee: integer("shipping_fee").notNull().default(0),
  deposit: integer("deposit").notNull().default(0),
  amountDue: integer("amount_due").notNull().default(0),
  // Snapshot giá vốn khi bán từ kho (chỉ đơn ban_tu_kho) → tính lãi/lỗ.
  saleCost: integer("sale_cost"),
  note: text("note"),
  createdAt: createdAt(),
  statusChangedAt: epochSeconds("status_changed_at")
    .notNull()
    .default(NOW_EPOCH),
  quotedTotalVnd: integer("quoted_total_vnd").notNull().default(0),
  shipStatus: text("ship_status", { enum: SHIP_STATUSES })
    .notNull()
    .default("unknown"),
});

// 3) Sản phẩm trong đơn
export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  productUrl: text("product_url"),
  name: text("name").notNull(),
  attributes: text("attributes"),
  quantity: integer("quantity").notNull().default(1),
  unitPriceCny: doublePrecision("unit_price_cny").notNull().default(0),
  cnOrderCode: text("cn_order_code"),
  lineStatus: text("line_status", { enum: LINE_STATUSES })
    .notNull()
    .default("normal"),
  marginVnd: integer("margin_vnd").notNull().default(0),
  costConfirmed: boolean("cost_confirmed").notNull().default(false),
  createdAt: createdAt(),
});

// 4) Kiện vận chuyển
export const packages = pgTable("packages", {
  id: serial("id").primaryKey(),
  trackingCode: text("tracking_code").notNull(),
  carrier: text("carrier"),
  weightKg: doublePrecision("weight_kg"),
  trackingStatus: text("tracking_status"),
  lastCheckedAt: epochSeconds("last_checked_at"),
  mode: text("mode", { enum: PACKAGE_MODES }).notNull().default("manual"),
  needsManualCheck: boolean("needs_manual_check").notNull().default(false),
  createdAt: createdAt(),
});

// Bảng nối Kiện ↔ Đơn (nhiều-nhiều): 1 đơn nhiều kiện, 1 kiện gộp nhiều đơn.
export const orderPackages = pgTable(
  "order_packages",
  {
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    packageId: integer("package_id")
      .notNull()
      .references(() => packages.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.orderId, t.packageId] })],
);

// 5) Tồn kho
export const inventory = pgTable("inventory", {
  id: serial("id").primaryKey(),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull().default(0),
  avgCost: integer("avg_cost").notNull().default(0), // giá vốn bình quân (VND)
  source: text("source", { enum: INVENTORY_SOURCES }).notNull(),
  lastImportedAt: epochSeconds("last_imported_at"),
  createdAt: createdAt(),
});

// 6) Ảnh — DB chỉ lưu tên file, file nằm trên Supabase Storage
export const photos = pgTable("photos", {
  id: serial("id").primaryKey(),
  filePath: text("file_path").notNull(),
  label: text("label", { enum: PHOTO_LABELS }).notNull(),
  orderId: integer("order_id").references(() => orders.id, {
    onDelete: "cascade",
  }),
  orderItemId: integer("order_item_id").references(() => orderItems.id, {
    onDelete: "cascade",
  }),
  inventoryId: integer("inventory_id").references(() => inventory.id, {
    onDelete: "cascade",
  }),
  uploadedAt: epochSeconds("uploaded_at").notNull().default(NOW_EPOCH),
});

// Lịch sử chuyển trạng thái (timeline: ai đổi, lúc nào).
export const orderStatusHistory = pgTable("order_status_history", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  fromStatus: text("from_status", { enum: ORDER_STATUSES }),
  toStatus: text("to_status", { enum: ORDER_STATUSES }).notNull(),
  changedBy: text("changed_by"),
  changedAt: epochSeconds("changed_at").notNull().default(NOW_EPOCH),
  note: text("note"),
});

// 7) Tham số nghiệp vụ đổi được lúc chạy (tỷ giá bán, lời mặc định).
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// 8) Sổ ví ¥ — số dư và giá vốn bq KHÔNG lưu, tính lại từ sổ.
export const cnyLedger = pgTable("cny_ledger", {
  id: serial("id").primaryKey(),
  kind: text("kind", { enum: LEDGER_KINDS }).notNull(),
  cnyDelta: doublePrecision("cny_delta").notNull(),
  vndPaid: integer("vnd_paid"),
  rateSnapshot: integer("rate_snapshot"),
  orderId: integer("order_id").references(() => orders.id),
  note: text("note"),
  createdAt: createdAt(),
});

// 9) Chi phí VND. order_id NULL = chi phí theo kỳ.
export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  spentAt: epochSeconds("spent_at").notNull().default(NOW_EPOCH),
  category: text("category", { enum: EXPENSE_CATEGORIES }).notNull(),
  amountVnd: integer("amount_vnd").notNull(),
  orderId: integer("order_id").references(() => orders.id),
  method: text("method", { enum: PAYMENT_METHODS })
    .notNull()
    .default("chuyen_khoan"),
  note: text("note"),
});

// 10) Sổ thu tiền — orders.deposit là Σ của bảng này.
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  amountVnd: integer("amount_vnd").notNull(),
  paidAt: epochSeconds("paid_at").notNull().default(NOW_EPOCH),
  kind: text("kind", { enum: PAYMENT_KINDS }).notNull(),
  method: text("method", { enum: PAYMENT_METHODS })
    .notNull()
    .default("chuyen_khoan"),
  note: text("note"),
});
```

- [ ] **Step 2: Chạy test — phải vẫn xanh**

```bash
npm test
```

Expected: PASS. Test là module thuần không import schema, nên không bị ảnh hưởng. Nếu đỏ → đã vô tình sửa file khác.

- [ ] **Step 3: Commit**

```bash
git add src/db/schema.ts
git commit -m "chuyển hosting: viết lại schema sang Postgres (epoch bigint, boolean thật, double precision)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Sinh migration Postgres + áp lên Supabase

**Files:**
- Create: `drizzle/0000_init_postgres.sql` (do `drizzle-kit` sinh, tên có thể khác)
- Delete: `drizzle/0000_init.sql`, `drizzle/0001_sale_cost.sql`, `drizzle/0002_tracking.sql`, `drizzle/0003_v3a_line_pricing.sql`, `drizzle/0004_v3b_tai_chinh.sql`
- Delete: `scripts/migrate.ts`
- Modify: `package.json` (script `db:migrate`)

**Interfaces:**
- Consumes: `src/db/schema.ts` từ Task 3, `DIRECT_URL` từ Task 1.
- Produces: 12 bảng đã tồn tại thật trên Supabase — Task 18 (migrate dữ liệu) và Task 19 (deploy) phụ thuộc.

- [ ] **Step 1: Chuyển migration SQLite cũ ra khỏi đường đi**

`drizzle-kit` sẽ đọc mọi file trong `drizzle/` và bị lẫn với migration SQLite cũ. Chuyển chúng vào thư mục lưu trữ (giữ lại để tham chiếu, không xoá hẳn):

```bash
mkdir -p docs/legacy-sqlite-migrations
git mv drizzle/0000_init.sql drizzle/0001_sale_cost.sql drizzle/0002_tracking.sql drizzle/0003_v3a_line_pricing.sql drizzle/0004_v3b_tai_chinh.sql docs/legacy-sqlite-migrations/
git rm drizzle/meta/_journal.json 2>/dev/null || true
rm -rf drizzle/meta
```

- [ ] **Step 2: Sinh migration Postgres**

```bash
npx drizzle-kit generate
```

Expected: tạo file `drizzle/0000_*.sql` chứa 12 câu `CREATE TABLE` với `serial`, `boolean`, `double precision`, `bigint`.

Nếu lệnh lỗi vì thiếu `esbuild` (gotcha đã ghi trong CLAUDE.md): viết tay file `drizzle/0000_init_postgres.sql` bằng cách dịch schema ở Task 3 sang SQL — mỗi `serial` → `serial PRIMARY KEY`, mỗi `epochSeconds` → `bigint NOT NULL DEFAULT (EXTRACT(EPOCH FROM now())::bigint)`, mỗi `boolean` → `boolean NOT NULL DEFAULT false`, mỗi `doublePrecision` → `double precision`.

- [ ] **Step 3: Kiểm tra file migration bằng mắt trước khi áp**

Đọc file vừa sinh, xác nhận:
- Không còn `AUTOINCREMENT`, không còn `unixepoch()`, không còn `INTEGER PRIMARY KEY`.
- `warning_flag`, `cost_confirmed`, `needs_manual_check` là `boolean`.
- `exchange_rate`, `goods_total_cny`, `unit_price_cny`, `cny_delta`, `weight_kg` là `double precision`.
- Mọi cột thời gian là `bigint`.

- [ ] **Step 4: Thêm lại các index của bản SQLite cũ**

Migration sinh từ schema không có index (schema Drizzle không khai báo index). Đọc `docs/legacy-sqlite-migrations/*.sql`, lấy mọi câu `CREATE INDEX` và thêm vào cuối file migration Postgres, đổi cú pháp thành `CREATE INDEX IF NOT EXISTS`. Ví dụ dạng cần có:

```sql
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_photos_order_id ON photos(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_expenses_spent_at ON expenses(spent_at);
CREATE INDEX IF NOT EXISTS idx_cny_ledger_order_id ON cny_ledger(order_id);
CREATE INDEX IF NOT EXISTS idx_osh_order_id ON order_status_history(order_id);
```

Dùng đúng danh sách index có trong file legacy, không tự thêm bớt.

- [ ] **Step 5: Đổi script `db:migrate` sang drizzle-kit**

Trong `package.json`, thay dòng `db:migrate` và xoá `db:seed-demo` nếu `scripts/seed-demo.ts` còn dùng `node:sqlite` (kiểm tra; nếu có thì để lại việc sửa cho sau, chỉ cần script `db:migrate` đúng):

```json
"db:migrate": "DIRECT_URL=$DIRECT_URL npx drizzle-kit migrate",
```

Rồi xoá runner SQLite cũ:

```bash
git rm scripts/migrate.ts
```

- [ ] **Step 6: Áp migration lên Supabase**

```bash
set -a && . ./.env && set +a && npx drizzle-kit migrate
```

Expected: báo áp thành công. Xác nhận bằng:

```bash
psql "$DIRECT_URL" -c "\dt"
```

Expected: liệt kê 12 bảng (`customers`, `orders`, `order_items`, `packages`, `order_packages`, `inventory`, `photos`, `order_status_history`, `settings`, `cny_ledger`, `expenses`, `payments`) + bảng theo dõi migration của drizzle.

- [ ] **Step 7: Chạy test**

```bash
npm test
```

Expected: PASS (không liên quan, nhưng là cổng bắt buộc mỗi task).

- [ ] **Step 8: Commit**

```bash
git add -A drizzle docs/legacy-sqlite-migrations package.json
git commit -m "chuyển hosting: sinh và áp migration Postgres đầu tiên

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Viết lại `src/db/index.ts` + tạo lớp `Exec` trong `src/db/raw.ts`

Đây là task then chốt: `raw.ts` cho phép giữ **nguyên văn** 41 câu SQL thô ở Task 7-12 thay vì viết lại từng câu sang `$1,$2`.

**Files:**
- Modify: `src/db/index.ts` (viết lại toàn bộ)
- Create: `src/db/raw.ts`

**Interfaces:**
- Consumes: `config.databaseUrl` (Task 2), `src/db/schema.ts` (Task 3).
- Produces:
  - `db` — Drizzle instance (postgres-js). **`.get()` không còn tồn tại** trên driver này; dùng `.limit(1)` rồi lấy `[0]`.
  - `sqlClient` — postgres-js client thô.
  - `raw: Exec` — `raw.all<T>(sql, params?)`, `raw.get<T>(sql, params?)`, `raw.run(sql, params?)`; tất cả `async`. Nhận placeholder `?` như cũ.
  - `withTx<T>(fn: (x: Exec) => Promise<T>): Promise<T>` — bọc transaction, tự rollback khi throw.
  - `NOW_EPOCH_SQL: string` — chuỗi `"EXTRACT(EPOCH FROM now())::bigint"` để nối vào SQL thay `unixepoch()`.
  - Export `sqlite` bị **xoá** — Task 7-12 phải bỏ hết import nó.

- [ ] **Step 1: Viết lại `src/db/index.ts`**

```ts
import "server-only";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { config } from "@/lib/config";
import * as schema from "./schema";

if (!config.databaseUrl) {
  throw new Error("Thiếu DATABASE_URL — không kết nối được Postgres/Supabase");
}

/**
 * Supavisor transaction pooler (port 6543) không hỗ trợ prepared statement
 * → BẮT BUỘC prepare: false, nếu không sẽ lỗi ngẫu nhiên khi có tải.
 * max: 1 — mỗi function instance trên Vercel chỉ xử lý 1 request một lúc, pool
 * to hơn chỉ làm cạn connection của Postgres.
 */
export const sqlClient = postgres(config.databaseUrl, {
  prepare: false,
  max: 1,
  idle_timeout: 20,
});

export const db = drizzle(sqlClient, { schema });
```

- [ ] **Step 2: Tạo `src/db/raw.ts`**

```ts
import "server-only";
import type { Sql } from "postgres";
import { sqlClient } from "./index";

/** Thay unixepoch() của SQLite. Nối vào chuỗi SQL, không phải tham số. */
export const NOW_EPOCH_SQL = "EXTRACT(EPOCH FROM now())::bigint";

export type Exec = {
  all<T>(text: string, params?: unknown[]): Promise<T[]>;
  get<T>(text: string, params?: unknown[]): Promise<T | undefined>;
  run(text: string, params?: unknown[]): Promise<void>;
};

/**
 * SQL thô của dự án viết placeholder kiểu SQLite (`?`); Postgres cần `$1,$2`.
 * Đổi tại chỗ để giữ nguyên văn các câu SQL nghiệp vụ đã được kiểm chứng.
 * Điều kiện dùng được: không có dấu `?` nào nằm trong chuỗi literal của SQL.
 */
function toPgPlaceholders(text: string): string {
  let i = 0;
  return text.replace(/\?/g, () => `$${++i}`);
}

function makeExec(client: Sql): Exec {
  return {
    async all<T>(text: string, params: unknown[] = []): Promise<T[]> {
      const rows = await client.unsafe(
        toPgPlaceholders(text),
        params as never[],
      );
      return rows as unknown as T[];
    },
    async get<T>(text: string, params: unknown[] = []): Promise<T | undefined> {
      const rows = await client.unsafe(
        toPgPlaceholders(text),
        params as never[],
      );
      return (rows as unknown as T[])[0];
    },
    async run(text: string, params: unknown[] = []): Promise<void> {
      await client.unsafe(toPgPlaceholders(text), params as never[]);
    },
  };
}

export const raw: Exec = makeExec(sqlClient);

/**
 * Bọc transaction. Throw bên trong → tự ROLLBACK; kết thúc êm → COMMIT.
 * Mọi truy vấn bên trong PHẢI dùng `x` được truyền vào, KHÔNG dùng `raw`
 * toàn cục — dùng sai thì câu đó chạy ngoài transaction và không rollback.
 */
export async function withTx<T>(fn: (x: Exec) => Promise<T>): Promise<T> {
  return sqlClient.begin(async (tx) =>
    fn(makeExec(tx as unknown as Sql)),
  ) as Promise<T>;
}
```

- [ ] **Step 3: Viết smoke test kết nối thật (script tạm, chưa commit)**

```bash
cat > /tmp/smoke-db.ts <<'EOF'
import { raw, withTx } from "./src/db/raw.ts";
import { sqlClient } from "./src/db/index.ts";

const one = await raw.get<{ n: number }>("SELECT 1 AS n WHERE 1 = ?", [1]);
console.log("placeholder ?→$1:", one);

await withTx(async (x) => {
  await x.run("INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", ["smoke", "1"]);
});
const s = await raw.get<{ value: string }>("SELECT value FROM settings WHERE key = ?", ["smoke"]);
console.log("transaction ghi được:", s);

try {
  await withTx(async (x) => {
    await x.run("UPDATE settings SET value = ? WHERE key = ?", ["2", "smoke"]);
    throw new Error("ep rollback");
  });
} catch {}
const after = await raw.get<{ value: string }>("SELECT value FROM settings WHERE key = ?", ["smoke"]);
console.log("rollback đúng (phải vẫn là 1):", after);

await raw.run("DELETE FROM settings WHERE key = ?", ["smoke"]);
await sqlClient.end();
EOF
set -a && . ./.env && set +a && node /tmp/smoke-db.ts
```

Expected:
```
placeholder ?→$1: { n: 1 }
transaction ghi được: { value: '1' }
rollback đúng (phải vẫn là 1): { value: '1' }
```

Nếu `rollback đúng` in ra `value: '2'` → `withTx` không rollback, phải sửa trước khi đi tiếp. Nếu lỗi `server-only`: chạy smoke test bằng cách tạm bỏ dòng `import "server-only"` — đừng commit việc bỏ đó.

- [ ] **Step 4: Chạy test**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rm /tmp/smoke-db.ts
git add src/db/index.ts src/db/raw.ts
git commit -m "chuyển hosting: kết nối Postgres qua pooler + lớp Exec cho SQL thô

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: `queries.ts` — nhóm settings, khách hàng, ảnh

Từ Task 6 đến Task 11 là chuyển `src/db/queries.ts`. Quy tắc chuyển **giống nhau ở mọi task**, đọc kỹ một lần rồi áp dụng:

| SQLite hiện tại | Postgres mới |
|---|---|
| `sqlite.prepare(Q).all(a, b)` | `await raw.all<T>(Q, [a, b])` |
| `sqlite.prepare(Q).get(a)` | `await raw.get<T>(Q, [a])` |
| `sqlite.prepare(Q).run(a)` | `await raw.run(Q, [a])` |
| `.run(...).lastInsertRowid` | thêm ` RETURNING id` vào SQL, dùng `raw.get<{id:number}>` |
| `unixepoch()` trong SQL | `${NOW_EPOCH_SQL}` (nối chuỗi, dùng template literal) |
| `INSERT OR IGNORE` | `INSERT ... ON CONFLICT DO NOTHING` |
| `GROUP_CONCAT(x)` | `string_agg(x::text, ',')` |
| `cot_boolean = 1` / `= 0` | `= true` / `= false` |
| `r.cot_boolean === 1` | `r.cot_boolean === true` |
| truyền `x ? 1 : 0` cho cột boolean | truyền `x` (boolean thật) |
| `sqlite.exec("BEGIN") … COMMIT/ROLLBACK` | `withTx(async (x) => { … })`, dùng `x.` thay `raw.` |
| `db.…​.get()` (Drizzle) | `db.…​.limit(1)` rồi lấy `[0]` |
| hàm đồng bộ | `async` + `Promise<…>` ở kiểu trả về |

**Files:**
- Modify: `src/db/queries.ts:1-16` (import), `:59-98` (settings + gợi ý ¥), `:102-108` (khách hàng), `:256-286` (chi tiết đơn), `:299-366` (ảnh), `:1041-1045` (nhãn ảnh)

**Interfaces:**
- Consumes: `raw`, `withTx`, `NOW_EPOCH_SQL` từ `src/db/raw.ts` (Task 5); `db` từ `src/db/index.ts`.
- Produces (đổi chữ ký — Task 13 phải thêm `await` ở mọi caller):
  - `getSettings(): Promise<AppSettings>`
  - `saveSettings(next: AppSettings): Promise<void>`
  - `suggestCnyFromHistory(productName: string): Promise<number | null>`
  - `addPhoto(input): Promise<number>`
  - `linkPhotoToOrder(photoId: number, orderId: number): Promise<void>`
  - `getPhoto(id: number): Promise<{ id: number; file_path: string } | undefined>`
  - `deletePhoto(id: number): Promise<{ filePath: string } | null>`
  - `updatePhotoLabel(photoId: number, label: PhotoLabel): Promise<void>`
  - `getCustomer`, `getOrderDetail`, `listPhotosForOrder`, `listPhotosForInventory` — vẫn `async` như cũ, chữ ký không đổi.

- [ ] **Step 1: Sửa import đầu file**

Dòng 3 hiện là `import { db, sqlite } from "./index";`. Đổi thành:

```ts
import { db } from "./index";
import { NOW_EPOCH_SQL, raw, withTx } from "./raw";
```

`withTx` và `NOW_EPOCH_SQL` chưa dùng ở task này — TypeScript sẽ cảnh báo unused. Chấp nhận tạm; Task 8 dùng tới. Nếu lint chặn, thêm chúng ở Task 8 thay vì Task 6.

- [ ] **Step 2: Chuyển `getSettings` + `saveSettings` (dòng 59-75)**

```ts
export async function getSettings(): Promise<AppSettings> {
  const rows = await raw.all<{ key: string; value: string }>(
    "SELECT key, value FROM settings",
  );
  return parseSettings(rows);
}

export async function saveSettings(next: AppSettings): Promise<void> {
  const Q = `INSERT INTO settings(key, value) VALUES(?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`;
  // Vẫn dựng chuỗi trong JS để giá trị lưu đúng dạng "4000" chứ không "4000.0".
  await raw.run(Q, [SETTING_KEYS.sellRate, String(next.sellRate)]);
  await raw.run(Q, [
    SETTING_KEYS.defaultMarginVnd,
    String(next.defaultMarginVnd),
  ]);
}
```

- [ ] **Step 3: Chuyển `suggestCnyFromHistory` (dòng 83-98) — chú ý boolean**

```ts
export async function suggestCnyFromHistory(
  productName: string,
): Promise<number | null> {
  const key = productName.trim().replace(/\s+/g, " ").toLowerCase();
  if (key === "") return null;
  const row = await raw.get<{ cny: number }>(
    `SELECT unit_price_cny AS cny
       FROM order_items
      WHERE cost_confirmed = true
        AND unit_price_cny > 0
        AND LOWER(TRIM(name)) = ?
      ORDER BY id DESC
      LIMIT 1`,
    [key],
  );
  return row ? row.cny : null;
}
```

`cost_confirmed = 1` → `= true`. Đây là một trong 10 vị trí boolean; bảng đối chiếu ở đầu Task 6 liệt kê đủ.

- [ ] **Step 4: Sửa 3 chỗ Drizzle `.get()` (dòng 107, 257, 264)**

`.get()` là API riêng của driver SQLite, không tồn tại trên postgres-js.

```ts
export async function getCustomer(id: number) {
  const rows = await db
    .select()
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1);
  return rows[0];
}
```

Trong `getOrderDetail`, dòng 257 và 260-265:

```ts
  const orderRows = await db
    .select()
    .from(orders)
    .where(eq(orders.id, id))
    .limit(1);
  const order = orderRows[0];
  if (!order) return null;
  const customerRows = order.customerId
    ? await db
        .select()
        .from(customers)
        .where(eq(customers.id, order.customerId))
        .limit(1)
    : [];
  const customer = customerRows[0] ?? null;
```

Phần còn lại của `getOrderDetail` (items, history, photos, payments, khối `return`) giữ nguyên.

- [ ] **Step 5: Chuyển nhóm ảnh (dòng 299-350, 1041-1045)**

```ts
export async function addPhoto(input: {
  filePath: string;
  label: PhotoLabel;
  orderId?: number | null;
  inventoryId?: number | null;
}): Promise<number> {
  const row = await raw.get<{ id: number }>(
    `INSERT INTO photos(file_path, label, order_id, inventory_id)
     VALUES(?, ?, ?, ?) RETURNING id`,
    [
      input.filePath,
      input.label,
      input.orderId ?? null,
      input.inventoryId ?? null,
    ],
  );
  return row!.id;
}

/** Gắn ảnh (đang chưa thuộc đơn nào) vào một đơn — dùng cho ảnh chốt đơn Zalo. */
export async function linkPhotoToOrder(
  photoId: number,
  orderId: number,
): Promise<void> {
  await raw.run(
    "UPDATE photos SET order_id = ? WHERE id = ? AND order_id IS NULL",
    [orderId, photoId],
  );
}

export async function getPhoto(
  id: number,
): Promise<{ id: number; file_path: string } | undefined> {
  return raw.get<{ id: number; file_path: string }>(
    "SELECT id, file_path FROM photos WHERE id = ?",
    [id],
  );
}
```

`deletePhoto` giữ nguyên phần chú thích doc hiện có, đổi thân hàm:

```ts
export async function deletePhoto(
  id: number,
): Promise<{ filePath: string } | null> {
  const photo = await raw.get<{ file_path: string }>(
    "SELECT file_path FROM photos WHERE id = ? AND order_id IS NULL",
    [id],
  );
  if (!photo) return null;
  await raw.run("DELETE FROM photos WHERE id = ?", [id]);
  return { filePath: photo.file_path };
}
```

Và `updatePhotoLabel` (dòng 1041):

```ts
/** Đổi nhãn ảnh (người dùng sửa lại khi AI phân loại sai). */
export async function updatePhotoLabel(
  photoId: number,
  label: PhotoLabel,
): Promise<void> {
  await raw.run("UPDATE photos SET label = ? WHERE id = ?", [label, photoId]);
}
```

`listPhotosForOrder` và `listPhotosForInventory` dùng Drizzle không có `.get()` → giữ nguyên.

- [ ] **Step 6: Chạy test**

```bash
npm test
```

Expected: PASS. `tsc` còn đỏ (các nhóm khác chưa chuyển, vẫn tham chiếu `sqlite`) — chưa chạy `tsc` ở task này.

- [ ] **Step 7: Commit**

```bash
git add src/db/queries.ts
git commit -m "chuyển hosting: queries settings/khách/ảnh sang Postgres

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: `queries.ts` — `createOrder` và `changeOrderStatus` (2 transaction lõi)

Đây là hai hàm nguy hiểm nhất: `createOrder` ghi 4 bảng, `changeOrderStatus` có side-effect tồn kho + ví ¥ + cờ khách.

**Files:**
- Modify: `src/db/queries.ts:140-252` (`createOrder`), `:538-603` (`_addStock`, `_recomputeOrderMoney`), `:724-823` (`changeOrderStatus`)

**Interfaces:**
- Consumes: `withTx`, `NOW_EPOCH_SQL`, `raw` (Task 5); `getSettings()` giờ là async (Task 6); `listLedger()` — **vẫn đồng bộ ở task này**, Task 9 mới chuyển. Ở Task 7 tạm `await` nó cũng không sai vì `await` trên giá trị thường vẫn hoạt động; viết `await listLedger()` ngay từ đầu để không phải sửa lại.
- Produces:
  - `createOrder(input: NewOrderInput): Promise<number>`
  - `changeOrderStatus(id, to, changedBy?, note?): Promise<ChangeStatusResult>`
  - `_addStock(x: Exec, name, source, qty, unitCost): Promise<void>` — **nhận `Exec` làm tham số đầu**, vì luôn được gọi bên trong transaction.
  - `_recomputeOrderMoney(x: Exec, orderId): Promise<void>` — cùng lý do.
  - `NewOrderInput`, `NewOrderItemInput`, `ChangeStatusResult` — kiểu không đổi.

- [ ] **Step 1: Chuyển 2 helper tồn kho để nhận `Exec`**

```ts
/** Cộng hàng vào kho, gộp theo (tên, nguồn) với giá vốn bình quân. */
async function _addStock(
  x: Exec,
  name: string,
  source: InventorySource,
  qty: number,
  unitCost: number,
): Promise<void> {
  const row = await x.get<{ id: number; quantity: number; avg_cost: number }>(
    "SELECT id, quantity, avg_cost FROM inventory WHERE product_name = ? AND source = ?",
    [name, source],
  );
  if (row) {
    const after = applyStockIn(
      { quantity: row.quantity, avgCost: row.avg_cost },
      qty,
      unitCost,
    );
    await x.run(
      `UPDATE inventory SET quantity = ?, avg_cost = ?,
              last_imported_at = ${NOW_EPOCH_SQL} WHERE id = ?`,
      [after.quantity, after.avgCost, row.id],
    );
  } else {
    await x.run(
      `INSERT INTO inventory(product_name, quantity, avg_cost, source, last_imported_at)
       VALUES (?, ?, ?, ?, ${NOW_EPOCH_SQL})`,
      [name, qty, unitCost, source],
    );
  }
}
```

Thêm `import type { Exec } from "./raw";` vào khối import (gộp vào dòng import `raw` đã thêm ở Task 6).

`_recomputeOrderMoney` (dòng 573-603) — giữ nguyên toàn bộ logic tính tiền, chỉ đổi cách chạy SQL:

```ts
/** Tính lại tiền đơn từ các dòng còn "normal" (loại bỏ dòng lỗi/đã trả). */
async function _recomputeOrderMoney(x: Exec, orderId: number): Promise<void> {
  const order = (await x.get<{
    exchange_rate: number;
    margin_vnd: number;
    shipping_fee: number;
    deposit: number;
  }>(
    "SELECT exchange_rate, margin_vnd, shipping_fee, deposit FROM orders WHERE id = ?",
    [orderId],
  ))!;
  const rows = await x.all<{ quantity: number; unit_price_cny: number }>(
    "SELECT quantity, unit_price_cny FROM order_items WHERE order_id = ? AND line_status = 'normal'",
    [orderId],
  );
  const goodsTotalCny = rows.reduce(
    (s, r) => s + r.quantity * r.unit_price_cny,
    0,
  );
  const money = computeOrderMoney({
    goodsTotalCny,
    exchangeRate: order.exchange_rate,
    serviceFee: order.margin_vnd,
    shippingFee: order.shipping_fee,
    deposit: order.deposit,
  });
  await x.run(
    "UPDATE orders SET goods_total_cny = ?, amount_due = ? WHERE id = ?",
    [goodsTotalCny, money.amountDue, orderId],
  );
}
```

- [ ] **Step 2: Chuyển `createOrder` (dòng 140-252)**

Phần tính toán đầu hàm (dòng 141-165) **không đổi một chữ**, chỉ thêm `await` cho `getSettings()`. Phần transaction viết lại:

```ts
export async function createOrder(input: NewOrderInput): Promise<number> {
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
        (await getSettings()).defaultMarginVnd,
      );
  const marginTotal = margins.reduce((s, m) => s + m, 0);

  const money = computeOrderMoney({
    goodsTotalCny,
    exchangeRate: input.exchangeRate,
    serviceFee: marginTotal,
    shippingFee: input.shippingFee,
    deposit: input.deposit,
  });

  return withTx(async (x) => {
    let customerId = input.customerId ?? null;
    if (!customerId && input.newCustomer) {
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
    // Đơn ĐƯỢC PHÉP chưa có khách (tiền cọc đã về thật, thông tin tới sau).
    // Cờ `thieu_khach` của order-gaps lo phần nhắc bổ sung.

    const o = await x.get<{ id: number }>(
      `INSERT INTO orders
         (customer_id, order_type, status, exchange_rate, goods_total_cny,
          margin_vnd, shipping_fee, deposit, amount_due, note,
          quoted_total_vnd, ship_status)
       VALUES (?, ?, 'cho_bao_gia', ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        customerId,
        input.orderType,
        input.exchangeRate,
        goodsTotalCny,
        marginTotal,
        input.shippingFee,
        input.deposit,
        money.amountDue,
        input.note ?? null,
        Math.round(input.quotedTotalVnd),
        input.shipStatus,
      ],
    );
    const orderId = o!.id;

    for (const [i, it] of input.items.entries()) {
      await x.run(
        `INSERT INTO order_items
           (order_id, product_url, name, attributes, quantity, unit_price_cny,
            margin_vnd, cost_confirmed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
    }

    await x.run(
      `INSERT INTO order_status_history
         (order_id, from_status, to_status, changed_by, note)
       VALUES (?, NULL, 'cho_bao_gia', ?, 'Tạo đơn')`,
      [orderId, input.changedBy ?? null],
    );

    // Cọc đọc từ ảnh Zalo → một dòng thu tiền, không ghi thẳng vào
    // orders.deposit nữa (deposit là số dẫn xuất — spec v3-B mục 3).
    if (input.deposit > 0) {
      await x.run(
        `INSERT INTO payments (order_id, amount_vnd, paid_at, kind, method, note)
         VALUES (?, ?, ${NOW_EPOCH_SQL}, 'coc', 'chuyen_khoan', NULL)`,
        [orderId, Math.round(input.deposit)],
      );
    }

    return orderId;
  });
}
```

Hai điểm dễ sai: `it.costConfirmed ? 1 : 0` → `it.costConfirmed ?? false` (boolean thật), và vòng `forEach` đổi thành `for…of` vì `forEach` không chờ `await`.

- [ ] **Step 3: Chuyển `changeOrderStatus` (dòng 724-823)**

Phần đọc đơn + kiểm tra `transition()` giữ nguyên logic, chỉ đổi cách chạy SQL. Phần transaction:

```ts
export async function changeOrderStatus(
  id: number,
  to: OrderStatus,
  changedBy?: string | null,
  note?: string | null,
): Promise<ChangeStatusResult> {
  const order = await raw.get<{
    order_type: OrderType;
    status: OrderStatus;
    exchange_rate: number;
    goods_total_cny: number;
    shipping_fee: number;
    deposit: number;
    customer_id: number;
  }>(
    `SELECT order_type, status, exchange_rate, goods_total_cny,
            shipping_fee, deposit, customer_id
       FROM orders WHERE id = ?`,
    [id],
  );
  if (!order) return { ok: false, reason: "Không tìm thấy đơn" };

  const result = transition(order.order_type, order.status, to);
  if (!result.ok) return { ok: false, reason: result.reason };

  return withTx(async (x) => {
    await x.run(
      `UPDATE orders SET status = ?, status_changed_at = ${NOW_EPOCH_SQL}
        WHERE id = ?`,
      [to, id],
    );
    await x.run(
      `INSERT INTO order_status_history
         (order_id, from_status, to_status, changed_by, note)
       VALUES (?, ?, ?, ?, ?)`,
      [id, order.status, to, changedBy ?? null, note ?? null],
    );

    const normalItems = await x.all<OrderItemRow>(
      "SELECT id, name, quantity, unit_price_cny, line_status FROM order_items WHERE order_id = ? AND line_status = 'normal'",
      [id],
    );

    // Đơn Nhập kho về tới kho VN → cộng tồn (nguồn Nhập chủ động).
    if (to === "ve_kho_vn" && order.order_type === "nhap_kho") {
      for (const it of normalItems) {
        await _addStock(
          x,
          it.name,
          "active",
          it.quantity,
          unitGoodsCostVnd(it.unit_price_cny, order.exchange_rate),
        );
      }
    }

    // Khách bom → toàn bộ hàng vào kho (nguồn Hàng bom) + gắn cờ khách.
    if (to === "khach_bom") {
      const goodsVnd = Math.round(order.goods_total_cny * order.exchange_rate);
      const basis = bomCostBasis(goodsVnd, order.shipping_fee, order.deposit);
      const totalQty = normalItems.reduce((s, it) => s + it.quantity, 0);
      const perUnit = totalQty > 0 ? Math.round(basis / totalQty) : basis;
      for (const it of normalItems) {
        await _addStock(x, it.name, "bom", it.quantity, perUnit);
      }
      await x.run(
        `UPDATE customers
           SET warning_flag = true,
               warning_reason = COALESCE(warning_reason, ?)
         WHERE id = ?`,
        [`Từng bom hàng (đơn #${id})`, order.customer_id],
      );
    }

    // Đã mua hàng TQ → trừ ví ¥ và CHỐT CỨNG giá vốn tại thời điểm này.
    // Nạp ¥ đợt sau rẻ hơn không được làm đổi lãi/lỗ của đơn đã mua rồi.
    // goods_total_cny = 0 (chưa nhập giá ¥) → không ghi dòng chi vô nghĩa.
    if (to === "da_mua_tq" && order.goods_total_cny > 0) {
      const rate = Math.round(currentRate(await listLedger()));
      await x.run(
        `INSERT INTO cny_ledger (kind, cny_delta, rate_snapshot, order_id, note)
         VALUES ('chi', ?, ?, ?, ?)`,
        [-order.goods_total_cny, rate, id, `Mua hàng đơn #${id}`],
      );
    }

    return { ok: true } as ChangeStatusResult;
  });
}
```

`warning_flag = 1` → `= true`.

- [ ] **Step 4: Chạy test**

```bash
npm test
```

Expected: PASS — đặc biệt `tests/order-status.test.ts` và `tests/inventory.test.ts` phải xanh (chúng test module thuần `order-status.ts`/`inventory.ts`, chứng minh luật nghiệp vụ không bị đụng).

- [ ] **Step 5: Commit**

```bash
git add src/db/queries.ts
git commit -m "chuyển hosting: createOrder + changeOrderStatus sang transaction Postgres

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: `queries.ts` — nhóm bóc lớp giá theo dòng (v3-A)

**Files:**
- Modify: `src/db/queries.ts:833-841` (`readOrderMoneyRow`), `:847-872` (`recomputeOrderMoneyRow`), `:878-959` (`updateLineCost`), `:962-1010` (`updateLineMargin`), `:1013-1038` (`setShipFee`)

**Interfaces:**
- Consumes: `Exec`, `withTx`, `raw`; `getSettings()` async (Task 6); `listLedger()` — viết `await listLedger()`.
- Produces:
  - `readOrderMoneyRow(x: Exec, orderId): Promise<OrderMoneyRow>`
  - `recomputeOrderMoneyRow(x: Exec, orderId, order: OrderMoneyRow): Promise<void>` — **export, thêm tham số `x` ở đầu**
  - `updateLineCost(orderId, itemId, unitPriceCny): Promise<LineActionResult>`
  - `updateLineMargin(orderId, itemId, marginVnd): Promise<LineActionResult>`
  - `setShipFee(orderId, shipStatus, shippingFee): Promise<LineActionResult>`

- [ ] **Step 1: Chuyển 2 helper**

```ts
async function readOrderMoneyRow(
  x: Exec,
  orderId: number,
): Promise<OrderMoneyRow> {
  const row = await x.get<OrderMoneyRow>(
    "SELECT exchange_rate, shipping_fee, deposit FROM orders WHERE id = ?",
    [orderId],
  );
  if (!row) throw new Error("Không tìm thấy đơn");
  return row;
}

/**
 * Đồng bộ khối tiền cấp đơn từ các dòng. Gọi BÊN TRONG transaction đang mở.
 * goods_total_cny và margin_vnd ở cấp đơn là số DẪN XUẤT từ order_items.
 */
export async function recomputeOrderMoneyRow(
  x: Exec,
  orderId: number,
  order: OrderMoneyRow,
): Promise<void> {
  const agg = (await x.get<{ cny: number; margin: number }>(
    `SELECT COALESCE(SUM(quantity * unit_price_cny), 0) AS cny,
            COALESCE(SUM(margin_vnd), 0) AS margin
       FROM order_items WHERE order_id = ?`,
    [orderId],
  ))!;

  const money = computeOrderMoney({
    goodsTotalCny: agg.cny,
    exchangeRate: order.exchange_rate,
    serviceFee: agg.margin,
    shippingFee: order.shipping_fee,
    deposit: order.deposit,
  });

  await x.run(
    "UPDATE orders SET goods_total_cny = ?, margin_vnd = ?, amount_due = ? WHERE id = ?",
    [agg.cny, agg.margin, money.amountDue, orderId],
  );
}
```

Lưu ý: `COALESCE(SUM(...), 0)` trong Postgres trả về `numeric` cho `SUM` của `double precision`? Không — `SUM(double precision)` trả `double precision`, ra JS là number. Nhưng `SUM(margin_vnd)` với `margin_vnd integer` trả **`bigint`**, postgres-js đưa về **string**. Phải ép kiểu trong SQL:

```sql
COALESCE(SUM(margin_vnd), 0)::int AS margin
```

Áp dụng nguyên tắc này cho **mọi** `SUM()` trên cột `integer` ở các task sau: thêm `::int` (hoặc `::bigint` rồi `Number()`). Bỏ sót chỗ nào sẽ ra lỗi cộng chuỗi âm thầm — đúng loại bug làm sai tiền.

Bản đúng của câu trên:

```ts
    `SELECT COALESCE(SUM(quantity * unit_price_cny), 0) AS cny,
            COALESCE(SUM(margin_vnd), 0)::int AS margin
       FROM order_items WHERE order_id = ?`,
```

- [ ] **Step 2: Chuyển `updateLineCost`**

```ts
export async function updateLineCost(
  orderId: number,
  itemId: number,
  unitPriceCny: number,
): Promise<LineActionResult> {
  if (!(unitPriceCny >= 0))
    return { ok: false, reason: "Giá tệ không được âm" };

  const defaultMargin = (await getSettings()).defaultMarginVnd;
  const ledger = await listLedger();

  try {
    return await withTx(async (x) => {
      const order = await readOrderMoneyRow(x, orderId);
      const quoted = (await x.get<{ total: number }>(
        "SELECT quoted_total_vnd AS total FROM orders WHERE id = ?",
        [orderId],
      ))!;

      await x.run(
        "UPDATE order_items SET unit_price_cny = ?, cost_confirmed = true WHERE id = ? AND order_id = ?",
        [unitPriceCny, itemId, orderId],
      );

      // Giá vốn đổi → lời phải rải lại để Σ giá bán vẫn đúng bằng Total.
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
        order.exchange_rate,
        defaultMargin,
      );
      for (const [i, r] of rows.entries()) {
        await x.run("UPDATE order_items SET margin_vnd = ? WHERE id = ?", [
          margins[i],
          r.id,
        ]);
      }

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

      await recomputeOrderMoneyRow(x, orderId, order);
      return { ok: true } as LineActionResult;
    });
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}
```

Hai điểm quan trọng: `cost_confirmed = 1` → `= true`; và `getSettings()`/`listLedger()` được gọi **trước** `withTx` — chúng dùng `raw` toàn cục nên gọi bên trong transaction sẽ chạy trên connection khác, không thấy dữ liệu đang ghi dở. Quy tắc: mọi truy vấn cần nằm trong transaction phải dùng `x`; mọi hàm dùng `raw` phải gọi trước khi vào `withTx`.

- [ ] **Step 3: Chuyển `updateLineMargin`**

```ts
/** Kéo lời của một dòng; các dòng khác bù lại để Total giữ nguyên. */
export async function updateLineMargin(
  orderId: number,
  itemId: number,
  marginVnd: number,
): Promise<LineActionResult> {
  try {
    return await withTx(async (x) => {
      const order = await readOrderMoneyRow(x, orderId);
      const quoted = (await x.get<{ total: number }>(
        "SELECT quoted_total_vnd AS total FROM orders WHERE id = ?",
        [orderId],
      ))!;

      const rows = await x.all<{
        id: number;
        quantity: number;
        unit_price_cny: number;
      }>(
        "SELECT id, quantity, unit_price_cny FROM order_items WHERE order_id = ? ORDER BY id",
        [orderId],
      );
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
        quoted.total,
        order.exchange_rate,
      );

      for (const [i, r] of rows.entries()) {
        await x.run("UPDATE order_items SET margin_vnd = ? WHERE id = ?", [
          margins[i],
          r.id,
        ]);
      }

      await recomputeOrderMoneyRow(x, orderId, order);
      return { ok: true } as LineActionResult;
    });
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}
```

- [ ] **Step 4: Chuyển `setShipFee`**

```ts
/** Nhập phí ship khi hàng về VN (hoặc đánh dấu freeship). */
export async function setShipFee(
  orderId: number,
  shipStatus: ShipStatus,
  shippingFee: number,
): Promise<LineActionResult> {
  if (!(shippingFee >= 0))
    return { ok: false, reason: "Phí ship không được âm" };
  const fee = shipStatus === "set" ? Math.round(shippingFee) : 0;

  try {
    return await withTx(async (x) => {
      const order = await readOrderMoneyRow(x, orderId);
      await x.run(
        "UPDATE orders SET ship_status = ?, shipping_fee = ? WHERE id = ?",
        [shipStatus, fee, orderId],
      );

      await recomputeOrderMoneyRow(x, orderId, { ...order, shipping_fee: fee });
      return { ok: true } as LineActionResult;
    });
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}
```

- [ ] **Step 5: Chạy test**

```bash
npm test
```

Expected: PASS. `tests/line-pricing.test.ts` là cổng quan trọng nhất ở task này — nó khoá luật "sửa ¥ thì Total giữ nguyên".

- [ ] **Step 6: Commit**

```bash
git add src/db/queries.ts
git commit -m "chuyển hosting: bóc lớp giá theo dòng sang Postgres

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: `queries.ts` — ví ¥, chi phí, thu tiền

**Files:**
- Modify: `src/db/queries.ts:607-667` (ví ¥), `:671-716` (chi phí), `:1049-1146` (thu tiền)

**Interfaces:**
- Produces:
  - `listLedger(): Promise<LedgerRow[]>` (giữ nguyên hình dáng row)
  - `getWallet(): Promise<…>`
  - `addTopup(input): Promise<LineActionResult>`
  - `deleteLedgerEntry(id): Promise<LineActionResult>`
  - `addExpense(input: AddExpenseInput): Promise<LineActionResult>`
  - `deleteExpense(id): Promise<LineActionResult>`
  - `suggestFinalPayment(orderId): Promise<number>`
  - `addPayment(input: AddPaymentInput): Promise<LineActionResult>`
  - `deletePayment(id, orderId): Promise<LineActionResult>`
  - `syncOrderDeposit(x: Exec, orderId): Promise<void>` — thêm tham số `x`
  - `listPaymentsForOrder` — Drizzle, không đổi

- [ ] **Step 1: Chuyển nhóm ví ¥**

```ts
export async function listLedger() {
  return raw.all<{
    id: number;
    kind: LedgerKind;
    cnyDelta: number;
    vndPaid: number | null;
    rateSnapshot: number | null;
    orderId: number | null;
    note: string | null;
    createdAt: number;
  }>(
    `SELECT id, kind, cny_delta AS "cnyDelta", vnd_paid AS "vndPaid",
            rate_snapshot AS "rateSnapshot", order_id AS "orderId", note,
            created_at AS "createdAt"
       FROM cny_ledger ORDER BY created_at, id`,
  );
}

export async function getWallet() {
  const state = replayLedger(await listLedger());
  return { ...state, valueVnd: walletValueVnd(state) };
}
```

**Bắt buộc:** Postgres hạ chữ thường mọi identifier không có nháy kép → alias `AS cnyDelta` sẽ thành `cnydelta` và `replayLedger` đọc `undefined`. Mọi alias camelCase trong SQL thô phải bọc `"…"`. Đây là lỗi âm thầm nguy hiểm nhất của cả lần chuyển này; kiểm tra lại từng câu SQL có alias camelCase ở Task 9, 11, 12.

`created_at` là `bigint` → postgres-js trả **string**. `replayLedger` chỉ sắp xếp/cộng `cnyDelta` nên không vỡ, nhưng để an toàn ép kiểu trong SQL: `created_at::bigint AS "createdAt"` vẫn ra string. Dùng `EXTRACT(EPOCH FROM to_timestamp(created_at))::int` là vòng vo — thay bằng ép ở SQL: `created_at::int AS "createdAt"`. An toàn tới 2038, đủ dùng.

```ts
export async function addTopup(input: {
  cny: number;
  vndPaid: number;
  note?: string | null;
}): Promise<LineActionResult> {
  if (!(input.cny > 0)) return { ok: false, reason: "Số tệ phải lớn hơn 0" };
  if (!(input.vndPaid > 0))
    return { ok: false, reason: "Số tiền trả phải lớn hơn 0" };

  await raw.run(
    `INSERT INTO cny_ledger (kind, cny_delta, vnd_paid, note)
     VALUES ('nap', ?, ?, ?)`,
    [input.cny, Math.round(input.vndPaid), input.note ?? null],
  );
  return { ok: true };
}

/**
 * Chỉ cho xoá dòng 'nap' — dòng 'chi' sinh tự động từ trạng thái đơn.
 * Sửa = xoá rồi nạp lại: số dư chạy lại từ sổ nên kết quả giống hệt.
 */
export async function deleteLedgerEntry(id: number): Promise<LineActionResult> {
  const row = await raw.get<{ kind: LedgerKind }>(
    "SELECT kind FROM cny_ledger WHERE id = ?",
    [id],
  );
  if (!row) return { ok: false, reason: "Không tìm thấy dòng sổ" };
  if (row.kind !== "nap")
    return {
      ok: false,
      reason:
        "Chỉ xoá được đợt nạp. Dòng mua hàng sửa bằng cách ghi điều chỉnh.",
    };
  await raw.run("DELETE FROM cny_ledger WHERE id = ?", [id]);
  return { ok: true };
}
```

- [ ] **Step 2: Chuyển nhóm chi phí**

```ts
export async function addExpense(
  input: AddExpenseInput,
): Promise<LineActionResult> {
  if (!(input.amountVnd > 0))
    return { ok: false, reason: "Số tiền phải lớn hơn 0" };
  if (input.orderId != null) {
    const exists = await raw.get("SELECT 1 AS x FROM orders WHERE id = ?", [
      input.orderId,
    ]);
    if (!exists) return { ok: false, reason: "Đơn không tồn tại" };
  }
  await raw.run(
    `INSERT INTO expenses (spent_at, category, amount_vnd, order_id, method, note)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      Math.floor(input.spentAt.getTime() / 1000),
      input.category,
      Math.round(input.amountVnd),
      input.orderId ?? null,
      input.method,
      input.note ?? null,
    ],
  );
  return { ok: true };
}

export async function deleteExpense(id: number): Promise<LineActionResult> {
  await raw.run("DELETE FROM expenses WHERE id = ?", [id]);
  return { ok: true };
}
```

`listExpenses` dùng Drizzle → không đổi.

- [ ] **Step 3: Chuyển nhóm thu tiền**

```ts
/** Số tiền đề xuất cho khoản "thu nốt": đúng bằng phần còn phải thu. */
export async function suggestFinalPayment(orderId: number): Promise<number> {
  const row = await raw.get<{ total: number; ship: number; paid: number }>(
    `SELECT o.quoted_total_vnd AS total, o.shipping_fee AS ship,
            COALESCE((SELECT SUM(p.amount_vnd) FROM payments p
                       WHERE p.order_id = o.id), 0)::int AS paid
       FROM orders o WHERE o.id = ?`,
    [orderId],
  );
  if (!row) return 0;
  return row.total + row.ship - row.paid;
}

export async function addPayment(
  input: AddPaymentInput,
): Promise<LineActionResult> {
  // Hoàn trả lưu số ÂM; các khoản thu phải dương.
  const amount =
    input.kind === "hoan_tra"
      ? -Math.abs(Math.round(input.amountVnd))
      : Math.round(input.amountVnd);
  if (amount === 0) return { ok: false, reason: "Số tiền phải khác 0" };

  try {
    return await withTx(async (x) => {
      await x.run(
        `INSERT INTO payments (order_id, amount_vnd, paid_at, kind, method, note)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          input.orderId,
          amount,
          Math.floor(input.paidAt.getTime() / 1000),
          input.kind,
          input.method,
          input.note ?? null,
        ],
      );
      await syncOrderDeposit(x, input.orderId);
      return { ok: true } as LineActionResult;
    });
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

export async function deletePayment(
  id: number,
  orderId: number,
): Promise<LineActionResult> {
  try {
    return await withTx(async (x) => {
      await x.run("DELETE FROM payments WHERE id = ? AND order_id = ?", [
        id,
        orderId,
      ]);
      await syncOrderDeposit(x, orderId);
      return { ok: true } as LineActionResult;
    });
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

/**
 * Đồng bộ orders.deposit từ sổ thu tiền rồi tính lại khối tiền của đơn.
 * Gọi BÊN TRONG transaction đang mở.
 */
async function syncOrderDeposit(x: Exec, orderId: number): Promise<void> {
  const row = (await x.get<{ paid: number }>(
    `SELECT COALESCE(SUM(amount_vnd), 0)::int AS paid FROM payments WHERE order_id = ?`,
    [orderId],
  ))!;

  await x.run("UPDATE orders SET deposit = ? WHERE id = ?", [
    row.paid,
    orderId,
  ]);

  const order = await readOrderMoneyRow(x, orderId);
  await recomputeOrderMoneyRow(x, orderId, order);
}
```

Chú ý `::int` ở cả hai chỗ `SUM(amount_vnd)` — thiếu là `row.paid` thành string, `orders.deposit` ghi sai và `amount_due` sai theo.

- [ ] **Step 4: Chạy test**

```bash
npm test
```

Expected: PASS, đặc biệt `tests/payments.test.ts` và `tests/cny-wallet.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/db/queries.ts
git commit -m "chuyển hosting: ví ¥, chi phí, thu tiền sang Postgres

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: `queries.ts` — kiện vận chuyển, tồn kho, 3 luồng ngoại lệ

**Files:**
- Modify: `src/db/queries.ts:382-525` (packages + tracking sweep), `:1153-1206` (3 luồng ngoại lệ), `:1338-1451` (tồn kho + `sellFromStock`)

**Interfaces:**
- Produces:
  - `listPackages(): Promise<PackageRow[]>`
  - `getPackagesForOrder(orderId): Promise<PackageRow[]>`
  - `createPackage(input: CreatePackageInput): Promise<PackageResult>`
  - `updatePackageStatusManual(id, status): Promise<void>`
  - `runTrackingSweep(): Promise<SweepResult>` — đã async, giữ chữ ký
  - `markLineDefect(orderId, itemId): Promise<LineActionResult>`
  - `returnLine(orderId, itemId): Promise<LineActionResult>`
  - `getInventoryItem(id): Promise<…| undefined>`
  - `sellFromStock(input: SellFromStockInput): Promise<SellResult>`

- [ ] **Step 1: Chuyển `listPackages` — `GROUP_CONCAT` và boolean**

```ts
export async function listPackages(): Promise<PackageRow[]> {
  const rows = await raw.all<{
    id: number;
    tracking_code: string;
    carrier: string | null;
    weight_kg: number | null;
    tracking_status: string | null;
    last_checked_at: number | null;
    mode: "auto" | "manual";
    needs_manual_check: boolean;
    order_ids: string | null;
  }>(
    `SELECT p.id, p.tracking_code, p.carrier, p.weight_kg, p.tracking_status,
            p.last_checked_at::int AS last_checked_at, p.mode, p.needs_manual_check,
            string_agg(op.order_id::text, ',') AS order_ids
       FROM packages p
       LEFT JOIN order_packages op ON op.package_id = p.id
      GROUP BY p.id
      ORDER BY p.needs_manual_check DESC, p.created_at DESC`,
  );
  return rows.map((r) => ({
    id: r.id,
    trackingCode: r.tracking_code,
    carrier: r.carrier,
    weightKg: r.weight_kg,
    trackingStatus: r.tracking_status,
    lastCheckedAt: r.last_checked_at,
    mode: r.mode,
    needsManualCheck: r.needs_manual_check === true,
    orderIds: r.order_ids ? r.order_ids.split(",").map((s) => Number(s)) : [],
  }));
}

export async function getPackagesForOrder(
  orderId: number,
): Promise<PackageRow[]> {
  const all = await listPackages();
  return all.filter((p) => p.orderIds.includes(orderId));
}
```

Ba thay đổi: `GROUP_CONCAT` → `string_agg(…::text, ',')`; `needs_manual_check === 1` → `=== true`; `last_checked_at` ép `::int` để không ra string. `GROUP BY p.id` hợp lệ ở Postgres vì `p.id` là khoá chính (functional dependency).

- [ ] **Step 2: Chuyển `createPackage` + `updatePackageStatusManual`**

```ts
export async function createPackage(
  input: CreatePackageInput,
): Promise<PackageResult> {
  const code = input.trackingCode.trim();
  if (!code) return { ok: false, reason: "Thiếu mã vận đơn" };

  return withTx(async (x) => {
    const p = await x.get<{ id: number }>(
      `INSERT INTO packages(tracking_code, carrier, weight_kg, mode)
       VALUES (?, ?, ?, ?) RETURNING id`,
      [code, input.carrier ?? null, input.weightKg ?? null, input.mode],
    );
    const id = p!.id;
    for (const orderId of input.orderIds) {
      const exists = await x.get("SELECT 1 AS x FROM orders WHERE id = ?", [
        orderId,
      ]);
      if (exists) {
        await x.run(
          `INSERT INTO order_packages(order_id, package_id) VALUES (?, ?)
           ON CONFLICT DO NOTHING`,
          [orderId, id],
        );
      }
    }
    return { ok: true, id } as PackageResult;
  });
}

/** Cập nhật trạng thái kiện bằng tay (xoá cờ tra tay). */
export async function updatePackageStatusManual(
  id: number,
  status: string,
): Promise<void> {
  await raw.run(
    `UPDATE packages
        SET tracking_status = ?, last_checked_at = ${NOW_EPOCH_SQL},
            needs_manual_check = false
      WHERE id = ?`,
    [status.trim(), id],
  );
}
```

`INSERT OR IGNORE` → `ON CONFLICT DO NOTHING`. `SELECT 1 FROM` → `SELECT 1 AS x FROM` để có tên cột.

- [ ] **Step 3: Chuyển `runTrackingSweep`**

Bỏ pattern "prepare một lần rồi chạy nhiều lần" (không còn ý nghĩa với postgres-js), giữ nguyên logic đếm:

```ts
export async function runTrackingSweep(): Promise<SweepResult> {
  const pkgs = await raw.all<{
    id: number;
    tracking_code: string;
    carrier: string | null;
  }>("SELECT id, tracking_code, carrier FROM packages WHERE mode = 'auto'");

  const FLAG = `UPDATE packages SET needs_manual_check = true, last_checked_at = ${NOW_EPOCH_SQL} WHERE id = ?`;
  const SAVE = `UPDATE packages SET tracking_status = ?, last_checked_at = ${NOW_EPOCH_SQL}, needs_manual_check = false WHERE id = ?`;

  let checked = 0;
  let updated = 0;
  let flagged = 0;
  for (const p of pkgs) {
    checked++;
    const adapter = getAdapter(p.carrier);
    if (!adapter) {
      await raw.run(FLAG, [p.id]);
      flagged++;
      continue;
    }
    try {
      const r = await adapter.lookup(p.tracking_code);
      if (r.ok) {
        await raw.run(SAVE, [r.status, p.id]);
        updated++;
      } else {
        await raw.run(FLAG, [p.id]);
        flagged++;
      }
    } catch {
      await raw.run(FLAG, [p.id]);
      flagged++;
    }
  }
  return { checked, updated, flagged };
}
```

- [ ] **Step 4: Chuyển 3 luồng ngoại lệ**

```ts
/** Đánh dấu 1 dòng "lỗi NCC": tách khỏi đơn, nhập kho nhãn Lỗi NCC. */
export async function markLineDefect(
  orderId: number,
  itemId: number,
): Promise<LineActionResult> {
  return _returnLineToStock(orderId, itemId, "supplier_defect");
}

/** Khách đổi/trả 1 dòng: tách khỏi đơn (hoàn/trừ tiền), nhập kho nhãn Đổi trả. */
export async function returnLine(
  orderId: number,
  itemId: number,
): Promise<LineActionResult> {
  return _returnLineToStock(orderId, itemId, "exchange_return");
}

async function _returnLineToStock(
  orderId: number,
  itemId: number,
  source: Extract<InventorySource, "supplier_defect" | "exchange_return">,
): Promise<LineActionResult> {
  const item = await raw.get<OrderItemRow>(
    "SELECT id, name, quantity, unit_price_cny, line_status FROM order_items WHERE id = ? AND order_id = ?",
    [itemId, orderId],
  );
  if (!item) return { ok: false, reason: "Không tìm thấy dòng sản phẩm" };
  if (item.line_status !== "normal")
    return { ok: false, reason: "Dòng này đã được tách trước đó" };

  const order = await raw.get<{ exchange_rate: number }>(
    "SELECT exchange_rate FROM orders WHERE id = ?",
    [orderId],
  );
  if (!order) return { ok: false, reason: "Không tìm thấy đơn" };

  return withTx(async (x) => {
    const newStatus =
      source === "supplier_defect" ? "supplier_defect" : "returned";
    await x.run("UPDATE order_items SET line_status = ? WHERE id = ?", [
      newStatus,
      itemId,
    ]);
    await _addStock(
      x,
      item.name,
      source,
      item.quantity,
      unitGoodsCostVnd(item.unit_price_cny, order.exchange_rate),
    );
    await _recomputeOrderMoney(x, orderId);
    return { ok: true } as LineActionResult;
  });
}
```

- [ ] **Step 5: Chuyển tồn kho + `sellFromStock`**

```ts
export async function getInventoryItem(id: number) {
  return raw.get<{
    id: number;
    product_name: string;
    quantity: number;
    avg_cost: number;
    source: string;
  }>(
    "SELECT id, product_name, quantity, avg_cost, source FROM inventory WHERE id = ?",
    [id],
  );
}
```

`sellFromStock` — phần kiểm tra đầu hàm giữ nguyên logic, chỉ thêm `await`:

```ts
/** Bán từ kho: trừ tồn, tạo đơn ban_tu_kho (đã giao khách), snapshot giá vốn. */
export async function sellFromStock(
  input: SellFromStockInput,
): Promise<SellResult> {
  const inv = await getInventoryItem(input.inventoryId);
  if (!inv) return { ok: false, reason: "Không tìm thấy hàng trong kho" };
  if (input.quantity <= 0) return { ok: false, reason: "Số lượng phải > 0" };
  if (input.quantity > inv.quantity)
    return {
      ok: false,
      reason: `Không đủ tồn: còn ${inv.quantity}, muốn bán ${input.quantity}`,
    };

  const saleCost = input.quantity * inv.avg_cost;
  const amountDue = Math.round(input.salePriceVnd) - Math.round(input.deposit);
  const unitPrice = Math.round(input.salePriceVnd / input.quantity);

  return withTx(async (x) => {
    // Khách: có sẵn / mới / khách lẻ.
    let customerId = input.customerId ?? null;
    if (!customerId && input.newCustomer?.name) {
      const c = await x.get<{ id: number }>(
        "INSERT INTO customers(name, phone) VALUES(?, ?) RETURNING id",
        [input.newCustomer.name, input.newCustomer.phone ?? null],
      );
      customerId = c!.id;
    }
    if (!customerId) {
      const walkin = await x.get<{ id: number }>(
        "SELECT id FROM customers WHERE name = 'Khách lẻ'",
      );
      if (walkin) {
        customerId = walkin.id;
      } else {
        const created = await x.get<{ id: number }>(
          "INSERT INTO customers(name) VALUES('Khách lẻ') RETURNING id",
        );
        customerId = created!.id;
      }
    }

    const after = applyStockOut(
      { quantity: inv.quantity, avgCost: inv.avg_cost },
      input.quantity,
    );
    await x.run("UPDATE inventory SET quantity = ? WHERE id = ?", [
      after.quantity,
      inv.id,
    ]);

    const o = await x.get<{ id: number }>(
      `INSERT INTO orders
         (customer_id, order_type, status, exchange_rate, goods_total_cny,
          margin_vnd, shipping_fee, deposit, amount_due, sale_cost, status_changed_at)
       VALUES (?, 'ban_tu_kho', 'da_giao_khach', 1, ?, 0, 0, ?, ?, ?, ${NOW_EPOCH_SQL})
       RETURNING id`,
      [customerId, input.salePriceVnd, input.deposit, amountDue, saleCost],
    );
    const orderId = o!.id;

    await x.run(
      `INSERT INTO order_items(order_id, name, quantity, unit_price_cny)
       VALUES (?, ?, ?, ?)`,
      [orderId, inv.product_name, input.quantity, unitPrice],
    );
    await x.run(
      `INSERT INTO order_status_history(order_id, to_status, changed_by, note)
       VALUES (?, 'da_giao_khach', ?, 'Bán từ kho')`,
      [orderId, input.changedBy ?? null],
    );

    return { ok: true, orderId } as SellResult;
  });
}
```

`listInventory` dùng Drizzle → không đổi.

- [ ] **Step 6: Chạy test**

```bash
npm test
```

Expected: PASS, đặc biệt `tests/inventory.test.ts` và `tests/tracking.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/db/queries.ts
git commit -m "chuyển hosting: kiện vận chuyển, tồn kho, luồng ngoại lệ sang Postgres

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: `queries.ts` — danh sách đơn/khách và 3 báo cáo tài chính

Task cuối của `queries.ts`. Sau task này file không còn tham chiếu `sqlite`.

**Files:**
- Modify: `src/db/queries.ts:1297-1327` (`listCustomersWithTotals`), `:1454-1507` (`listOrdersWithGaps`), `:1521-1645` (3 báo cáo)

**Interfaces:**
- Produces:
  - `listCustomersWithTotals(): Promise<CustomerListRow[]>`
  - `listOrdersWithGaps(): Promise<(OrderListRow & { gaps: GapCode[] })[]>` — đã async
  - `getPnlData(year, month): Promise<{ orders: PnlOrder[]; expenses: PnlExpense[]; bomDepositsVnd: number }>`
  - `getCashFlow(year, month): Promise<…>`
  - `getAssetSnapshot(): Promise<…>`
  - `listOrders`, `countOrdersByStatus` — đã async, dùng Drizzle, **không đổi**

- [ ] **Step 1: Chuyển `listCustomersWithTotals`**

```ts
export async function listCustomersWithTotals(): Promise<CustomerListRow[]> {
  const rows = await raw.all<{
    id: number;
    name: string;
    phone: string | null;
    warning_flag: boolean;
    warning_reason: string | null;
    outstanding: number;
    order_count: number;
  }>(
    `SELECT c.id, c.name, c.phone, c.warning_flag, c.warning_reason,
            COALESCE(SUM(CASE WHEN o.status NOT IN ('hoan_tat','huy','khach_bom')
                              THEN o.amount_due ELSE 0 END), 0)::int AS outstanding,
            COUNT(o.id)::int AS order_count
       FROM customers c
       LEFT JOIN orders o ON o.customer_id = c.id
      GROUP BY c.id
      ORDER BY outstanding DESC, c.name`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    warningFlag: r.warning_flag === true,
    warningReason: r.warning_reason,
    outstanding: r.outstanding,
    orderCount: r.order_count,
  }));
}
```

`SUM(...)::int`, `COUNT(...)::int`, `warning_flag === 1` → `=== true`.

- [ ] **Step 2: Chuyển `listOrdersWithGaps` — boolean trong subquery**

Chỉ đổi câu SQL `meta` và thêm `await`; toàn bộ phần `map`/`orderGaps` giữ nguyên:

```ts
  const meta = await raw.all<{
    id: number;
    orderType: OrderType;
    status: OrderStatus;
    customerId: number | null;
    shipStatus: ShipStatus;
    phone: string | null;
    address: string | null;
    unconfirmed: number;
    productPhotos: number;
  }>(
    `SELECT o.id                                         AS id,
            o.order_type                                 AS "orderType",
            o.status                                     AS status,
            o.customer_id                                AS "customerId",
            o.ship_status                                AS "shipStatus",
            c.phone                                      AS phone,
            c.address                                    AS address,
            (SELECT COUNT(*)::int FROM order_items i
              WHERE i.order_id = o.id AND i.cost_confirmed = false) AS unconfirmed,
            (SELECT COUNT(*)::int FROM photos p
              WHERE p.order_id = o.id AND p.label = 'product')      AS "productPhotos"
       FROM orders o LEFT JOIN customers c ON c.id = o.customer_id`,
  );
```

Alias camelCase (`orderType`, `customerId`, `shipStatus`, `productPhotos`) **phải** có nháy kép, `cost_confirmed = 0` → `= false`, `COUNT(*)` → `COUNT(*)::int`.

- [ ] **Step 3: Chuyển `getPnlData`**

```ts
export async function getPnlData(
  year: number,
  month: number,
): Promise<{
  orders: PnlOrder[];
  expenses: PnlExpense[];
  bomDepositsVnd: number;
}> {
  const [from, to] = monthRange(year, month);

  const rows = await raw.all<
    Omit<PnlOrder, "costConfirmed"> & { costConfirmedRaw: boolean }
  >(
    `SELECT o.id                     AS id,
            o.order_type             AS "orderType",
            o.quoted_total_vnd       AS "quotedTotalVnd",
            o.shipping_fee           AS "shippingFee",
            o.goods_total_cny        AS "goodsTotalCny",
            o.exchange_rate          AS "sellRate",
            o.sale_cost              AS "saleCost",
            (SELECT l.rate_snapshot FROM cny_ledger l
              WHERE l.order_id = o.id AND l.kind = 'chi'
              ORDER BY l.id LIMIT 1)                        AS "costRate",
            (SELECT COALESCE(SUM(i.margin_vnd), 0)::int FROM order_items i
              WHERE i.order_id = o.id)                      AS "marginVnd",
            (SELECT COUNT(*) = 0 FROM order_items i
              WHERE i.order_id = o.id AND i.cost_confirmed = false) AS "costConfirmedRaw"
       FROM orders o
      WHERE EXISTS (SELECT 1 FROM order_status_history h
                     WHERE h.order_id = o.id AND h.to_status = 'hoan_tat'
                       AND h.changed_at >= ? AND h.changed_at < ?)`,
    [from, to],
  );

  const orders: PnlOrder[] = rows.map((r) => ({
    ...r,
    costConfirmed: r.costConfirmedRaw === true,
  }));

  const expenseRows = await raw.all<PnlExpense>(
    `SELECT amount_vnd AS "amountVnd", category, order_id AS "orderId"
       FROM expenses WHERE spent_at >= ? AND spent_at < ?`,
    [from, to],
  );

  // Cọc giữ được từ đơn chuyển sang khách bom trong tháng.
  const bom = (await raw.get<{ total: number }>(
    `SELECT COALESCE(SUM(p.amount_vnd), 0)::int AS total
       FROM payments p
      WHERE p.order_id IN (
            SELECT h.order_id FROM order_status_history h
             WHERE h.to_status = 'khach_bom'
               AND h.changed_at >= ? AND h.changed_at < ?)`,
    [from, to],
  ))!;

  return { orders, expenses: expenseRows, bomDepositsVnd: bom.total };
}
```

`(SELECT COUNT(*) = 0 …)` ở Postgres trả về `boolean` thật (SQLite trả 0/1) → `costConfirmedRaw` đổi kiểu thành `boolean` và so `=== true`. `monthRange` **không đổi** (vẫn epoch giây).

- [ ] **Step 4: Chuyển `getCashFlow`**

```ts
export async function getCashFlow(year: number, month: number) {
  const [from, to] = monthRange(year, month);

  const inflow = await raw.all<{ method: PaymentMethod; total: number }>(
    `SELECT method, COALESCE(SUM(amount_vnd), 0)::int AS total
       FROM payments WHERE paid_at >= ? AND paid_at < ? GROUP BY method`,
    [from, to],
  );

  const topups = (await raw.get<{ total: number }>(
    `SELECT COALESCE(SUM(vnd_paid), 0)::int AS total FROM cny_ledger
      WHERE kind = 'nap' AND created_at >= ? AND created_at < ?`,
    [from, to],
  ))!;

  const spend = await raw.all<{ method: PaymentMethod; total: number }>(
    `SELECT method, COALESCE(SUM(amount_vnd), 0)::int AS total
       FROM expenses WHERE spent_at >= ? AND spent_at < ? GROUP BY method`,
    [from, to],
  );

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

- [ ] **Step 5: Chuyển `getAssetSnapshot`**

```ts
export async function getAssetSnapshot() {
  const wallet = await getWallet();
  const stock = (await raw.get<{ total: number }>(
    "SELECT COALESCE(SUM(quantity * avg_cost), 0)::bigint::int AS total FROM inventory",
  ))!;
  const receivable = (await raw.get<{ total: number }>(
    `SELECT COALESCE(SUM(amount_due), 0)::int AS total FROM orders
      WHERE status NOT IN ('hoan_tat','huy','khach_bom')`,
  ))!;
  // Cọc của đơn CHƯA giao — tiền này nằm trong tài khoản nhưng chưa phải của mình.
  const heldDeposits = (await raw.get<{ total: number }>(
    `SELECT COALESCE(SUM(p.amount_vnd), 0)::int AS total FROM payments p
       JOIN orders o ON o.id = p.order_id
      WHERE o.status NOT IN ('da_giao_khach','hoan_tat','huy','khach_bom')`,
  ))!;

  return {
    walletCny: wallet.balance,
    walletVnd: wallet.valueVnd,
    stockVnd: stock.total,
    receivableVnd: receivable.total,
    heldDepositsVnd: heldDeposits.total,
  };
}
```

- [ ] **Step 6: Xác nhận không còn dấu vết SQLite trong `queries.ts`**

```bash
grep -n "sqlite\|unixepoch\|GROUP_CONCAT\|INSERT OR IGNORE\|lastInsertRowid" src/db/queries.ts
```

Expected: **không có kết quả**. Còn dòng nào là còn sót, phải sửa trước khi commit.

Kiểm tra thêm: mọi alias camelCase đều có nháy kép, và mọi `SUM`/`COUNT` trên cột integer đều có `::int`:

```bash
grep -n "AS [a-z]*[A-Z]" src/db/queries.ts
grep -nE "SUM\(|COUNT\(" src/db/queries.ts
```

Kết quả của lệnh thứ nhất phải rỗng (alias camelCase không nháy kép là bug). Lệnh thứ hai: đọc từng dòng, xác nhận có `::int` (trừ `SUM(quantity * unit_price_cny)` là double precision nên không cần).

- [ ] **Step 7: Chạy test**

```bash
npm test
```

Expected: PASS, đặc biệt `tests/pnl.test.ts`.

- [ ] **Step 8: Commit**

```bash
git add src/db/queries.ts
git commit -m "chuyển hosting: danh sách và 3 báo cáo tài chính sang Postgres

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: Thêm `await` ở 82 call site — đưa `tsc` về xanh

Task này là task đầu tiên `npx tsc --noEmit` phải xanh hoàn toàn. TypeScript chính là công cụ tìm việc: mỗi hàm vừa thành `async` sẽ báo lỗi ở đúng nơi thiếu `await`.

**Files (20 file, theo kết quả `grep -rl "from \"@/db"` ):**
- Modify: `src/app/api/read-zalo/route.ts`, `src/app/api/upload/route.ts`, `src/app/api/photo/[id]/route.ts`, `src/app/api/cron/track/route.ts`
- Modify: `src/app/page.tsx`, `src/app/customers/page.tsx`, `src/app/orders/page.tsx`, `src/app/orders/new/page.tsx`, `src/app/orders/[id]/page.tsx`, `src/app/inventory/page.tsx`, `src/app/finance/page.tsx`, `src/app/reports/page.tsx`, `src/app/settings/page.tsx`, `src/app/tracking/page.tsx`
- Modify: `src/app/orders/actions.ts`, `src/app/inventory/actions.ts`, `src/app/finance/actions.ts`, `src/app/settings/actions.ts`, `src/app/tracking/actions.ts`
- Modify: `src/instrumentation-node.ts` (sẽ bị xoá ở Task 15 — chỉ cần sửa tối thiểu cho `tsc` xanh, hoặc xoá luôn ở task này nếu tiện)

**Interfaces:**
- Consumes: mọi chữ ký `Promise<…>` mới từ Task 6-11.
- Produces: `npx tsc --noEmit` sạch — cổng cho Task 13 trở đi.

- [ ] **Step 1: Chạy typecheck để lấy danh sách việc**

```bash
npx tsc --noEmit
```

Expected: nhiều lỗi. Hai dạng chính:
- `Property 'x' does not exist on type 'Promise<…>'` → thiếu `await`.
- `Type 'Promise<number>' is not assignable to type 'number'` → thiếu `await`.

Lưu output ra file để theo dõi tiến độ:

```bash
npx tsc --noEmit 2>&1 | tee /tmp/tsc-errors.txt
wc -l /tmp/tsc-errors.txt
```

- [ ] **Step 2: Sửa từng file, thêm `await`**

Quy tắc: thêm `await` trước mỗi lời gọi hàm vừa thành async. Server component và server action đã là `async` nên không cần đổi gì thêm. Ví dụ điển hình trong `src/app/settings/page.tsx`:

```ts
// trước
const settings = getSettings();
// sau
const settings = await getSettings();
```

Và trong một server action:

```ts
// trước
const result = changeOrderStatus(orderId, to, session.username);
if (!result.ok) return { error: result.reason };
// sau
const result = await changeOrderStatus(orderId, to, session.username);
if (!result.ok) return { error: result.reason };
```

Nếu gặp hàm **không** phải `async` mà cần gọi hàm async (ví dụ một helper đồng bộ trong component): đổi helper đó thành `async` và `await` ở nơi gọi nó, đừng dùng `.then()`.

Lặp `npx tsc --noEmit` sau mỗi 2-3 file để thấy số lỗi giảm dần.

- [ ] **Step 3: Sửa `src/app/api/upload/route.ts` và `photo/[id]/route.ts` phần gọi DB**

Ở task này **chỉ** thêm `await` cho `addPhoto`/`getPhoto`; phần filesystem vẫn giữ nguyên (Task 13-14 mới chuyển sang Storage):

```ts
    ids.push(
      await addPhoto({ filePath: fname, label, orderId, inventoryId }),
    );
```

```ts
  const photo = await getPhoto(Number(id));
```

- [ ] **Step 4: Typecheck phải sạch**

```bash
npx tsc --noEmit
```

Expected: **không có output** (0 lỗi). Nếu còn lỗi liên quan `src/lib/backup.ts` hoặc `src/instrumentation-node.ts` (do `config.databasePath`/`config.uploadsPath`/`config.backupPath` đã bị xoá ở Task 2): xoá luôn các file đó ngay bây giờ theo hướng dẫn Task 15 Step 1-2, rồi chạy lại.

- [ ] **Step 5: Chạy test**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A src
git commit -m "chuyển hosting: thêm await ở mọi caller sau khi tầng DB thành async

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 13: Supabase Storage — module `storage.ts` + route upload

**Files:**
- Create: `src/lib/storage.ts`
- Modify: `src/app/api/upload/route.ts`

**Interfaces:**
- Consumes: `config.supabaseUrl`, `config.supabaseServiceRoleKey`, `config.storageBucket` (Task 2).
- Produces:
  - `uploadPhotoFile(fileName: string, body: Buffer, contentType: string): Promise<void>`
  - `downloadPhotoFile(fileName: string): Promise<Buffer | null>` — Task 14 dùng
  - `deletePhotoFile(fileName: string): Promise<void>` — Task 14 dùng

- [ ] **Step 1: Tạo `src/lib/storage.ts`**

```ts
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { config } from "./config";

/**
 * Ảnh nằm trên Supabase Storage ở bucket private. Dùng service_role key nên
 * module này CHỈ được import từ code chạy trên server — key này bỏ qua mọi
 * luật RLS, lộ ra client là mất toàn quyền dữ liệu.
 */
const client = createClient(
  config.supabaseUrl,
  config.supabaseServiceRoleKey,
  { auth: { persistSession: false } },
);

const bucket = () => client.storage.from(config.storageBucket);

export async function uploadPhotoFile(
  fileName: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const { error } = await bucket().upload(fileName, body, {
    contentType,
    upsert: false,
  });
  if (error) throw new Error(`Không lưu được ảnh: ${error.message}`);
}

export async function downloadPhotoFile(
  fileName: string,
): Promise<Buffer | null> {
  const { data, error } = await bucket().download(fileName);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

export async function deletePhotoFile(fileName: string): Promise<void> {
  await bucket().remove([fileName]);
}
```

- [ ] **Step 2: Viết lại route upload**

```ts
import { randomBytes } from "node:crypto";
import { getSession } from "@/lib/auth";
import { addPhoto } from "@/db/queries";
import { PHOTO_LABELS, type PhotoLabel } from "@/lib/photos";
import { downsizeImage } from "@/lib/image";
import { uploadPhotoFile } from "@/lib/storage";

// sharp là native module → bắt buộc Node runtime, không chạy được trên edge.
export const runtime = "nodejs";
// Resize nhiều ảnh + đẩy lên Storage có thể vượt 10s mặc định của Hobby.
export const maxDuration = 60;

const MAX_BYTES = 15 * 1024 * 1024; // 15MB

export async function POST(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response("Chưa đăng nhập", { status: 401 });

  const form = await req.formData();
  const labelRaw = String(form.get("label") ?? "product");
  const label: PhotoLabel = (PHOTO_LABELS as readonly string[]).includes(
    labelRaw,
  )
    ? (labelRaw as PhotoLabel)
    : "product";
  const orderId = Number(form.get("orderId")) || null;
  const inventoryId = Number(form.get("inventoryId")) || null;
  const files = form
    .getAll("files")
    .filter((f): f is File => f instanceof File);

  if (files.length === 0)
    return Response.json({ ok: false, error: "Không có ảnh" }, { status: 400 });

  const ids: number[] = [];
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    if (file.size > MAX_BYTES)
      return Response.json(
        { ok: false, error: "Ảnh quá lớn (giới hạn 15MB)" },
        { status: 400 },
      );
    const buf = Buffer.from(await file.arrayBuffer());
    const downsized = await downsizeImage(buf, file.type);
    const fname = `${Date.now()}-${randomBytes(6).toString("hex")}.${downsized.ext}`;
    await uploadPhotoFile(
      fname,
      downsized.buffer,
      downsized.ext === "gif" ? "image/gif" : "image/jpeg",
    );
    ids.push(await addPhoto({ filePath: fname, label, orderId, inventoryId }));
  }

  if (ids.length === 0)
    return Response.json(
      { ok: false, error: "Không có ảnh hợp lệ" },
      { status: 400 },
    );
  return Response.json({ ok: true, ids });
}
```

Nếu `downsizeImage` trả về `ext` khác `"gif"`/`"jpg"`, mở `src/lib/image.ts` đọc kiểu trả về thật và dùng đúng content type tương ứng — đừng đoán.

- [ ] **Step 3: Thêm `runtime` + `maxDuration` cho route đọc ảnh Zalo**

`src/app/api/read-zalo/route.ts` gọi Gemini đọc ảnh — thường mất 5-20 giây, vượt **timeout mặc định 10s** của Vercel Hobby. Thiếu bước này thì tính năng đọc ảnh Zalo sẽ lỗi ngẫu nhiên trên production dù chạy tốt ở local. Thêm sau khối import:

```ts
export const runtime = "nodejs";
export const maxDuration = 60;
```

60s là trần tối đa của Hobby. Nếu Gemini vẫn timeout ở mức đó, giảm số ảnh gửi mỗi lượt chứ không tăng được nữa.

- [ ] **Step 4: Typecheck + test**

```bash
npx tsc --noEmit && npm test
```

Expected: cả hai sạch/PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage.ts src/app/api/upload/route.ts src/app/api/read-zalo/route.ts
git commit -m "chuyển hosting: upload ảnh lên Supabase Storage

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 14: Route đọc ảnh + xoá file ảnh qua Storage

**Files:**
- Modify: `src/app/api/photo/[id]/route.ts`
- Modify: nơi gọi `deletePhoto` (tìm bằng grep — thường ở `src/app/orders/actions.ts`)

**Interfaces:**
- Consumes: `downloadPhotoFile`, `deletePhotoFile` (Task 13); `getPhoto`, `deletePhoto` async (Task 6).
- Produces: URL `/api/photo/[id]` giữ **nguyên hợp đồng cũ** (trả bytes ảnh, hỗ trợ `?download`) → không file frontend nào phải sửa.

- [ ] **Step 1: Viết lại route đọc ảnh**

```ts
import { basename } from "node:path";
import { getSession } from "@/lib/auth";
import { getPhoto } from "@/db/queries";
import { contentTypeFromName } from "@/lib/photos";
import { downloadPhotoFile } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response("Chưa đăng nhập", { status: 401 });

  const { id } = await ctx.params;
  const photo = await getPhoto(Number(id));
  if (!photo) return new Response("Không tìm thấy ảnh", { status: 404 });

  // Chống path traversal: chỉ dùng tên file cơ sở.
  const buf = await downloadPhotoFile(basename(photo.file_path));
  if (!buf) return new Response("File ảnh không tồn tại", { status: 404 });

  const headers = new Headers({
    "Content-Type": contentTypeFromName(photo.file_path),
    "Cache-Control": "private, max-age=3600",
  });
  if (new URL(req.url).searchParams.has("download")) {
    headers.set(
      "Content-Disposition",
      `attachment; filename="${photo.file_path}"`,
    );
  }
  return new Response(new Uint8Array(buf), { headers });
}
```

Ảnh vẫn đi qua route đã xác thực chứ không dùng signed URL công khai — giữ đúng mức bảo mật hiện tại (bucket private, chỉ người đăng nhập xem được).

- [ ] **Step 2: Sửa nơi xoá ảnh để xoá cả file trên Storage**

```bash
grep -rn "deletePhoto" src --include="*.ts" --include="*.tsx"
```

Tại mỗi nơi gọi `deletePhoto` (hàm này chỉ xoá bản ghi DB và trả `filePath`), đổi phần xoá file cục bộ thành:

```ts
const removed = await deletePhoto(photoId);
if (removed) await deletePhotoFile(basename(removed.filePath));
```

Thêm `import { basename } from "node:path";` và `import { deletePhotoFile } from "@/lib/storage";` vào file đó. Nếu file đó đang dùng `unlink`/`rm` của `node:fs` cho ảnh, xoá import đó đi.

- [ ] **Step 3: Xác nhận không còn code nào đọc/ghi thư mục uploads**

```bash
grep -rn "uploadsPath\|uploads/" src --include="*.ts" --include="*.tsx"
```

Expected: không còn kết quả nào trỏ tới filesystem cục bộ.

- [ ] **Step 4: Typecheck + test**

```bash
npx tsc --noEmit && npm test
```

Expected: sạch/PASS.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "chuyển hosting: đọc và xoá ảnh qua Supabase Storage

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 15: Xoá job nền + cơ chế backup cũ, đổi trang Sao lưu

**Files:**
- Delete: `src/instrumentation.ts`, `src/instrumentation-node.ts`, `src/lib/backup.ts`, `scripts/backup.ts`, `scripts/restore.ts`
- Modify: `src/app/backup/page.tsx`, `src/app/backup/actions.ts`
- Modify: `package.json` (xoá script `db:backup`, `db:restore`)
- Modify: `src/app/api/cron/track/route.ts` (thêm `runtime`)

**Interfaces:**
- Produces: không còn tiến trình nền nào; `POST /api/cron/track` là điểm vào duy nhất cho job tracking (Task 16 gọi nó).

- [ ] **Step 1: Xoá job nền và backup cũ**

```bash
git rm src/instrumentation.ts src/instrumentation-node.ts src/lib/backup.ts scripts/backup.ts scripts/restore.ts
```

Lý do xoá `instrumentation`: `setInterval` cần tiến trình Node sống liên tục. Trên Vercel, function instance bị đóng sau khi trả response nên interval không bao giờ chạy đủ chu kỳ — giữ lại chỉ tạo cảm giác an toàn giả.

- [ ] **Step 2: Xoá script backup khỏi `package.json`**

Xoá 2 dòng `"db:backup"` và `"db:restore"`. Kiểm tra `"db:seed-demo"`: nếu `scripts/seed-demo.ts` còn import `node:sqlite` thì xoá cả script và file đó (`git rm scripts/seed-demo.ts`) — dữ liệu demo không còn ý nghĩa khi đã có dữ liệu thật trên Supabase.

- [ ] **Step 3: Viết lại `src/app/backup/actions.ts`**

Nút "Sao lưu ngay" không còn tương ứng với gì cả (Supabase free không có API backup gọi được từ app). Xoá action:

```bash
git rm src/app/backup/actions.ts
```

- [ ] **Step 4: Viết lại `src/app/backup/page.tsx`**

```tsx
import { requireAuth } from "@/lib/auth";
import { AppShell } from "../_components/app-shell";

export default async function BackupPage() {
  const session = await requireAuth();

  return (
    <AppShell username={session.username}>
      <div className="page-head">
        <h1>Sao lưu</h1>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ margin: 0, lineHeight: 1.7 }}>
          Dữ liệu nằm trên <strong>Supabase</strong>. Gói miễn phí{" "}
          <strong>không có sao lưu tự động</strong>, nên hệ thống tự chạy{" "}
          <code>pg_dump</code> mỗi ngày bằng GitHub Actions và giữ bản dump
          trong phần Artifacts của lần chạy đó.
        </p>
        <p className="muted" style={{ marginBottom: 0 }}>
          Xem và tải bản sao lưu: mở repo trên GitHub → tab{" "}
          <strong>Actions</strong> → workflow <strong>db-backup</strong> → chọn
          lần chạy → tải Artifact. Ảnh nằm ở Supabase Storage (bucket{" "}
          <code>photos</code>), tải xuống từ dashboard Supabase khi cần.
        </p>
      </div>

      <div className="card">
        <p style={{ margin: 0, lineHeight: 1.7 }}>
          <strong>Khôi phục</strong> (ghi đè dữ liệu hiện tại) chạy trong
          terminal, sau khi đã tải file dump về:
        </p>
        <p className="muted" style={{ marginBottom: 0 }}>
          <code>psql &quot;$DIRECT_URL&quot; -f duong-dan-file.sql</code>
        </p>
      </div>
    </AppShell>
  );
}
```

Nếu `AppShell` hoặc class CSS dùng tên khác, mở `src/app/_components/app-shell.tsx` và một trang khác (vd `src/app/settings/page.tsx`) để lấy đúng khuôn — đừng bịa tên class mới.

- [ ] **Step 5: Thêm `runtime` cho route cron**

Thêm vào đầu `src/app/api/cron/track/route.ts` (sau các import):

```ts
export const runtime = "nodejs";
export const maxDuration = 60;
```

- [ ] **Step 6: Typecheck + test**

```bash
npx tsc --noEmit && npm test
```

Expected: sạch/PASS. Nếu `tsc` báo thiếu `src/instrumentation.ts` — không sao, Next không bắt buộc có file này.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chuyển hosting: bỏ job nền setInterval và backup VACUUM INTO

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 16: GitHub Actions — cron tracking 4h + pg_dump hằng ngày

Vercel Hobby chỉ cho cron **1 lần/ngày** với sai số ±59 phút, không đáp ứng chu kỳ 4 tiếng của job tracking. GitHub Actions cron là miễn phí và chạy được 4 tiếng/lần. Nó cũng giải quyết luôn việc Supabase tự pause project sau 7 ngày không có request.

**Files:**
- Create: `.github/workflows/tracking-sweep.yml`
- Create: `.github/workflows/db-backup.yml`

**Interfaces:**
- Consumes: `POST /api/cron/track` với `?secret=` khớp `CRON_SECRET` (đã có sẵn trong code); `DIRECT_URL`.
- Produces: 2 workflow chạy tự động. Cần GitHub Secrets: `APP_URL`, `CRON_SECRET`, `DIRECT_URL`.

- [ ] **Step 1: Tạo workflow quét tracking**

```yaml
name: tracking-sweep

on:
  schedule:
    # Mỗi 4 tiếng — thay cho setInterval cũ (TRACKING_SWEEP_MINUTES=240).
    # Cũng giữ cho project Supabase khỏi tự pause sau 7 ngày không có request.
    - cron: "0 */4 * * *"
  workflow_dispatch:

jobs:
  sweep:
    runs-on: ubuntu-latest
    steps:
      - name: Gọi /api/cron/track
        run: |
          code=$(curl -sS -o /tmp/out.json -w '%{http_code}' -X POST \
            -H "x-cron-secret: ${{ secrets.CRON_SECRET }}" \
            "${{ secrets.APP_URL }}/api/cron/track")
          cat /tmp/out.json
          if [ "$code" != "200" ]; then
            echo "Quét tracking thất bại, HTTP $code"
            exit 1
          fi
```

Dùng header `x-cron-secret` chứ không phải `?secret=` để bí mật không nằm trong URL (URL bị ghi vào log).

- [ ] **Step 2: Tạo workflow sao lưu DB**

```yaml
name: db-backup

on:
  schedule:
    - cron: "0 18 * * *" # 01:00 giờ VN
  workflow_dispatch:

jobs:
  dump:
    runs-on: ubuntu-latest
    steps:
      - name: Cài postgresql-client
        run: |
          sudo apt-get update
          sudo apt-get install -y postgresql-client

      - name: pg_dump
        env:
          DIRECT_URL: ${{ secrets.DIRECT_URL }}
        run: |
          pg_dump --no-owner --no-privileges "$DIRECT_URL" \
            > "heyp-$(date -u +%Y%m%d-%H%M).sql"
          ls -lh heyp-*.sql

      - name: Lưu artifact
        uses: actions/upload-artifact@v4
        with:
          name: heyp-db-dump
          path: heyp-*.sql
          retention-days: 30
```

`retention-days: 30` khớp với `BACKUP_KEEP=30` của cơ chế cũ.

- [ ] **Step 3: Đặt GitHub Secrets (thủ công)**

Repo → Settings → Secrets and variables → Actions → New repository secret:
- `APP_URL` — URL production trên Vercel (vd `https://heyp.vercel.app`), **không** có dấu `/` ở cuối.
- `CRON_SECRET` — đúng giá trị trong `.env` và trong env của Vercel.
- `DIRECT_URL` — connection string port 5432.

`APP_URL` chưa có cho tới khi deploy xong (Task 19). Đặt 2 secret kia trước, thêm `APP_URL` sau khi deploy.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows
git commit -m "chuyển hosting: GitHub Actions quét tracking 4h + pg_dump hằng ngày

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 17: Chuyển dữ liệu thật từ SQLite sang Postgres

Task nguy hiểm nhất về dữ liệu. Bản lùi đã tạo ở Task 1; `data/app.sqlite` vẫn nguyên vẹn.

**Files:**
- Create: `scripts/migrate-to-postgres.ts`
- Create: `scripts/migrate-uploads-to-storage.ts`

**Interfaces:**
- Consumes: `data/app.sqlite` (đọc), `DIRECT_URL`, biến Supabase Storage.
- Produces: dữ liệu thật đã nằm trên Supabase, ID được giữ nguyên, sequence đã được đặt lại đúng.

- [ ] **Step 1: Viết script chuyển dữ liệu**

```ts
/**
 * Chuyển dữ liệu thật từ SQLite sang Postgres MỘT LẦN.
 * File DUY NHẤT còn được phép import node:sqlite.
 *
 * Giữ nguyên ID để không vỡ khoá ngoại, chèn theo thứ tự phụ thuộc,
 * rồi đặt lại sequence. Chạy trong 1 transaction — lỗi giữa đường thì
 * không để lại dữ liệu nửa vời.
 */
import { DatabaseSync } from "node:sqlite";
import postgres from "postgres";

const SQLITE_PATH = process.env.SQLITE_PATH ?? "./data/app.sqlite";
const url = process.env.DIRECT_URL;
if (!url) throw new Error("Thiếu DIRECT_URL");

// Thứ tự chèn = thứ tự phụ thuộc khoá ngoại.
const TABLES = [
  "customers",
  "orders",
  "order_items",
  "packages",
  "order_packages",
  "inventory",
  "photos",
  "order_status_history",
  "settings",
  "cny_ledger",
  "expenses",
  "payments",
] as const;

// Cột 0/1 của SQLite phải thành boolean thật của Postgres.
const BOOLEAN_COLUMNS: Record<string, string[]> = {
  customers: ["warning_flag"],
  order_items: ["cost_confirmed"],
  packages: ["needs_manual_check"],
};

const sqlite = new DatabaseSync(SQLITE_PATH, { readOnly: true });
const sql = postgres(url, { max: 1 });

let total = 0;
await sql.begin(async (tx) => {
  for (const table of TABLES) {
    const rows = sqlite.prepare(`SELECT * FROM ${table}`).all() as Record<
      string,
      unknown
    >[];
    if (rows.length === 0) {
      console.log(`${table}: 0 hàng, bỏ qua`);
      continue;
    }

    const boolCols = BOOLEAN_COLUMNS[table] ?? [];
    const converted = rows.map((r) => {
      const out: Record<string, unknown> = { ...r };
      for (const c of boolCols) {
        if (c in out) out[c] = out[c] === 1 || out[c] === true;
      }
      return out;
    });

    const columns = Object.keys(converted[0]);
    await tx`INSERT INTO ${tx(table)} ${tx(converted, ...columns)}`;
    console.log(`${table}: ${converted.length} hàng`);
    total += converted.length;
  }

  // Đặt lại sequence để INSERT sau này không đụng ID đã tồn tại.
  for (const table of TABLES) {
    if (table === "settings" || table === "order_packages") continue; // không có cột id serial
    await tx.unsafe(
      `SELECT setval(pg_get_serial_sequence('${table}', 'id'),
                     COALESCE((SELECT MAX(id) FROM ${table}), 1),
                     (SELECT MAX(id) IS NOT NULL FROM ${table}))`,
    );
  }
});

console.log(`Xong: ${total} hàng.`);
sqlite.close();
await sql.end();
```

- [ ] **Step 2: Chạy thử ở chế độ đọc, kiểm số hàng nguồn trước**

```bash
set -a && . ./.env && set +a
for t in customers orders order_items packages order_packages inventory photos order_status_history settings cny_ledger expenses payments; do
  printf "%-22s %s\n" "$t" "$(sqlite3 data/app.sqlite "SELECT COUNT(*) FROM $t;")"
done
```

Ghi lại các con số này — Step 4 sẽ đối chiếu. Nếu không có `sqlite3`: `brew install sqlite`.

- [ ] **Step 3: Chạy migration dữ liệu**

```bash
set -a && . ./.env && set +a && node scripts/migrate-to-postgres.ts
```

Expected: in ra số hàng từng bảng và `Xong: N hàng.` Nếu lỗi, transaction đã rollback — Postgres vẫn rỗng, sửa script rồi chạy lại. Nếu cần dọn tay để chạy lại:

```bash
psql "$DIRECT_URL" -c "TRUNCATE payments, expenses, cny_ledger, settings, order_status_history, photos, inventory, order_packages, packages, order_items, orders, customers RESTART IDENTITY CASCADE;"
```

- [ ] **Step 4: Đối chiếu số hàng hai bên**

```bash
for t in customers orders order_items packages order_packages inventory photos order_status_history settings cny_ledger expenses payments; do
  a=$(sqlite3 data/app.sqlite "SELECT COUNT(*) FROM $t;")
  b=$(psql "$DIRECT_URL" -tAc "SELECT COUNT(*) FROM $t;")
  printf "%-22s sqlite=%-6s pg=%-6s %s\n" "$t" "$a" "$b" "$([ "$a" = "$b" ] && echo OK || echo LECH)"
done
```

Expected: mọi dòng `OK`. Có dòng `LECH` → dừng lại, tìm nguyên nhân, đừng đi tiếp.

- [ ] **Step 5: Đối chiếu tiền — kiểm tra quan trọng nhất**

```bash
echo "--- SQLite ---"
sqlite3 data/app.sqlite "SELECT COUNT(*), SUM(quoted_total_vnd), SUM(amount_due), SUM(deposit), SUM(margin_vnd) FROM orders;"
echo "--- Postgres ---"
psql "$DIRECT_URL" -tAc "SELECT COUNT(*), SUM(quoted_total_vnd), SUM(amount_due), SUM(deposit), SUM(margin_vnd) FROM orders;"
```

Expected: 5 con số giống hệt nhau ở hai bên. Lệch bất kỳ đồng nào → dữ liệu tiền sai, phải tìm ra lý do trước khi tiếp tục.

Kiểm tra boolean đã chuyển đúng:

```bash
psql "$DIRECT_URL" -tAc "SELECT COUNT(*) FROM order_items WHERE cost_confirmed IS TRUE;"
sqlite3 data/app.sqlite "SELECT COUNT(*) FROM order_items WHERE cost_confirmed = 1;"
```

Expected: hai số bằng nhau.

- [ ] **Step 6: Viết và chạy script đẩy ảnh lên Storage**

```ts
/** Đẩy ảnh trong uploads/ lên Supabase Storage. Chạy một lần. */
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const dir = process.env.UPLOADS_DIR ?? "./uploads";
const bucketName = process.env.SUPABASE_STORAGE_BUCKET ?? "photos";
const client = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

const files = await readdir(dir);
let ok = 0;
for (const name of files) {
  const type = TYPES[extname(name).toLowerCase()];
  if (!type) {
    console.log(`bỏ qua (không phải ảnh): ${name}`);
    continue;
  }
  const body = await readFile(join(dir, name));
  const { error } = await client.storage
    .from(bucketName)
    .upload(name, body, { contentType: type, upsert: true });
  if (error) console.error(`LỖI ${name}: ${error.message}`);
  else {
    ok++;
    console.log(`đã đẩy: ${name}`);
  }
}
console.log(`Xong: ${ok}/${files.length} file.`);
```

```bash
set -a && . ./.env && set +a && node scripts/migrate-uploads-to-storage.ts
```

Expected: `Xong: 10/10 file.` (10 file là số hiện có trong `uploads/`).

- [ ] **Step 7: Đối chiếu ảnh — mọi `file_path` trong DB phải có file thật**

```bash
psql "$DIRECT_URL" -tAc "SELECT file_path FROM photos ORDER BY id;" > /tmp/db-photos.txt
wc -l /tmp/db-photos.txt
ls uploads/ | wc -l
```

Đối chiếu bằng mắt: mọi tên trong `/tmp/db-photos.txt` phải nằm trong danh sách `ls uploads/`. Thiếu file nào thì ảnh đó sẽ 404 sau khi deploy (không mất dữ liệu đơn, nhưng mất bằng chứng chốt đơn — cần biết trước).

- [ ] **Step 8: Test**

```bash
npm test && npx tsc --noEmit
```

Expected: PASS/sạch.

- [ ] **Step 9: Commit**

```bash
git add scripts/migrate-to-postgres.ts scripts/migrate-uploads-to-storage.ts
git commit -m "chuyển hosting: script chuyển dữ liệu thật và ảnh sang Supabase

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 18: Chạy thử toàn hệ thống trên máy, trỏ vào Supabase thật

Trước khi deploy, phải chứng minh app chạy đúng với dữ liệu thật trên Postgres. Không được bỏ qua task này — deploy rồi mới phát hiện sai công thức tiền là sửa trên dữ liệu sống.

**Files:** không sửa file nào (chỉ sửa nếu tìm ra bug).

**Interfaces:**
- Consumes: mọi thứ từ Task 2-17.

- [ ] **Step 1: Chạy dev server bằng công cụ preview của harness**

Dùng preview tool với cấu hình trong `.claude/launch.json` (KHÔNG chạy `npm run dev` bằng shell — quy ước dự án). Nếu `.claude/launch.json` chưa có, tạo:

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "heyp-dev", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 3000 }
  ]
}
```

- [ ] **Step 2: Kiểm tra từng màn hình, đối chiếu với số liệu thật**

Đăng nhập rồi mở lần lượt, sau mỗi màn đọc console + log server tìm lỗi:

1. `/` (Tổng quan) — thẻ trạng thái hiện đúng số đơn.
2. `/orders` — danh sách đơn, tên khách, số tiền, cờ "cần bổ sung".
3. `/orders/<id>` của một đơn thật — khối tiền (Total, cọc, còn phải thu), timeline trạng thái, ảnh **hiện được** (đây là phép thử Storage), sổ thu tiền.
4. `/customers` — công nợ từng khách.
5. `/inventory` — tồn kho, giá vốn bình quân.
6. `/finance` — ví ¥ (số dư, giá vốn bq), sổ chi phí.
7. `/reports` — cả 3 báo cáo, chọn tháng có dữ liệu thật.
8. `/tracking` — danh sách kiện.
9. `/settings` — tỷ giá bán, lời mặc định đọc đúng từ bảng `settings`.
10. `/backup` — trang mới hiển thị đúng.

Bất kỳ số tiền nào lệch so với bản SQLite là bug phải sửa, không phải "sai số làm tròn".

- [ ] **Step 3: Kiểm tra 404 đã hoạt động (bug cũ được sửa miễn phí)**

Mở `/orders/999999` (ID không tồn tại).

Expected: trang **404**, không phải lỗi 500. Đây là bug đã ghi trong CLAUDE.md do `sqlite-proxy` `.get()` trả `{rows:[]}`; đổi driver sửa được. Nếu vẫn 500 → chỗ nào đó còn dùng sai `.get()`.

- [ ] **Step 4: Chạy thử các luồng GHI (thao tác thật, kiểm lại số)**

Làm trên một đơn thật rồi hoàn tác được, hoặc tạo đơn nháp mới:

1. **Tạo đơn mới** ở `/orders/new` với 2 sản phẩm → kiểm `orders`, `order_items`, `order_status_history`, `payments` (nếu có cọc) đều có hàng mới, `amount_due` đúng.
2. **Sửa giá ¥ một dòng** → **Total phải KHÔNG đổi**, lời được rải lại giữa các dòng. Đây là luật khoá bởi `tests/line-pricing.test.ts`, giờ kiểm trên dữ liệu thật.
3. **Nhập phí ship** → `amount_due` tăng đúng bằng phí ship.
4. **Thêm một khoản thu tiền** → `orders.deposit` bằng đúng Σ `payments`, `amount_due` giảm tương ứng.
5. **Xoá khoản thu vừa thêm** → hai số trên trở về như trước.
6. **Đổi trạng thái đơn** tiến 1 bước → có hàng mới trong `order_status_history`.
7. **Thả 1 ảnh** ở màn tạo đơn → ảnh hiện được, tức là upload + download Storage đều chạy.
8. **Chuyển một đơn sang `da_mua_tq`** (nếu có đơn phù hợp) → sổ ví ¥ có dòng `chi` với `rate_snapshot`.

- [ ] **Step 5: Kiểm tra transaction rollback thật sự**

Ép một lỗi giữa transaction để chắc chắn không có dữ liệu nửa vời: tạm sửa `createOrder` thêm `throw new Error("test rollback")` ngay trước dòng `return orderId;`, thử tạo đơn, xác nhận **không** có hàng nào mới trong `orders`/`order_items`/`payments`:

```bash
psql "$DIRECT_URL" -tAc "SELECT MAX(id) FROM orders;"
```

Số này phải không đổi trước và sau lần thử. Sau đó **xoá dòng `throw` đi** và xác nhận đã xoá bằng `git diff`.

- [ ] **Step 6: Chụp màn hình làm bằng chứng**

Chụp `/orders/<id>` (khối tiền + ảnh hiện được) và `/reports`. Đính vào phần báo cáo cho người dùng.

- [ ] **Step 7: Test + typecheck**

```bash
npm test && npx tsc --noEmit
```

Expected: PASS/sạch.

- [ ] **Step 8: Commit (nếu có sửa bug ở task này)**

```bash
git add -A
git commit -m "chuyển hosting: sửa lỗi phát hiện khi chạy thử với dữ liệu thật

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

Nếu không sửa gì thì bỏ qua commit.

---

### Task 19: Deploy lên Vercel + cập nhật tài liệu

**Files:**
- Modify: `CLAUDE.md`
- Create: `docs/2026-08-14-huong-dan-van-hanh-vercel-supabase.md`

**Interfaces:**
- Consumes: mọi thứ từ Task 1-18.
- Produces: app chạy production trên Vercel; `CLAUDE.md` không còn gotcha sai.

- [ ] **Step 1: Đẩy nhánh lên GitHub**

```bash
git push -u origin feat/vercel-supabase
```

- [ ] **Step 2: Import project vào Vercel (thủ công)**

Lưu ý giới hạn Hobby: **không kết nối được repo thuộc GitHub organization** — repo phải thuộc tài khoản cá nhân.

1. vercel.com → Add New → Project → chọn repo.
2. Framework preset: Next.js (tự nhận). Không đổi build command.
3. Environment Variables — thêm **tất cả** (Production + Preview):
   - `DATABASE_URL` (pooler 6543)
   - `DIRECT_URL` (5432)
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`
   - `APP_ACCOUNTS`, `SESSION_SECRET` (chuỗi ngẫu nhiên thật, không dùng mặc định)
   - `STALE_ORDER_DAYS`, `GEMINI_API_KEY`, `GEMINI_MODEL`
   - `CRON_SECRET`
4. Deploy.

- [ ] **Step 3: Xác minh trên production**

Mở URL Vercel, đăng nhập, kiểm lại đúng danh sách 10 màn ở Task 18 Step 2. Đặc biệt:
- Ảnh ở `/orders/<id>` hiện được (Storage hoạt động từ môi trường Vercel).
- `/reports` ra số đúng.
- `/orders/999999` trả 404.

Nếu route upload lỗi timeout: kiểm `export const maxDuration = 60` đã có trong `src/app/api/upload/route.ts`.

- [ ] **Step 4: Bật GitHub Actions**

Thêm secret `APP_URL` = URL production vừa có (Task 16 Step 3 đã đặt `CRON_SECRET`, `DIRECT_URL`).

Chạy tay cả 2 workflow để kiểm chứng ngay, không đợi tới giờ cron: repo → Actions → chọn workflow → **Run workflow**.

Expected: `tracking-sweep` trả HTTP 200 và in JSON `{"ok":true,...}`; `db-backup` tạo được artifact `heyp-db-dump`. Tải artifact về, mở file `.sql`, xác nhận có `CREATE TABLE` và `COPY`/`INSERT` với dữ liệu thật.

- [ ] **Step 5: Cập nhật `CLAUDE.md`**

Sửa các chỗ giờ đã sai. Cụ thể:

- Phần **Stack**: đổi "SQLite qua `node:sqlite` + Drizzle (driver `sqlite-proxy`)" thành "Postgres (Supabase) + Drizzle (driver `postgres-js`)".
- **Xoá** các gotcha không còn đúng: "Dùng `node:sqlite`, KHÔNG dùng `better-sqlite3`" (đổi thành ghi chú lịch sử), "ĐỌC bằng Drizzle / GHI bằng DatabaseSync thô", "`node:sqlite` bind số JS thành REAL", "Migration viết tay SQL", "KHÔNG `rm data/app.sqlite`" (đổi: file này giờ là bản lùi lịch sử, DB thật ở Supabase), "DB chạy `journal_mode=wal` → dùng VACUUM INTO", "Driver `sqlite-proxy` có lỗi `.get()`" (đã sửa).
- **Thêm** các gotcha mới:
  - Runtime **bắt buộc** đi pooler port 6543 với `prepare: false`; migration đi direct 5432.
  - SQL thô viết placeholder `?` và chạy qua `raw`/`withTx` trong `src/db/raw.ts` (tự đổi sang `$n`); trong transaction **phải** dùng `x` được truyền vào, không dùng `raw` toàn cục.
  - Alias camelCase trong SQL thô **phải** bọc nháy kép, nếu không Postgres hạ chữ thường và app đọc `undefined`.
  - `SUM`/`COUNT` trên cột `integer` **phải** ép `::int`, nếu không postgres-js trả string → cộng chuỗi, sai tiền.
  - Thời gian lưu epoch-seconds `bigint` (không phải `timestamptz`) — có chủ đích, xem lý do trong plan này.
  - Số thực dùng `double precision` (không phải `numeric`) — `numeric` trả string.
  - Không có job nền trong tiến trình; tracking chạy bằng GitHub Actions gọi `POST /api/cron/track`.
  - Backup bằng `pg_dump` qua GitHub Actions; Supabase free **không** có backup tự động.
  - Supabase free **tự pause project sau 7 ngày** không có request; workflow tracking 4h giữ cho nó sống.
  - Vercel Hobby cron chỉ 1 lần/ngày → đừng dùng `vercel.json` crons cho job 4h.
  - Vercel Hobby là gói **non-commercial** theo ToS — rủi ro đã biết, cân nhắc Pro nếu muốn chắc chân.
- Phần **Lệnh hay dùng**: xoá `db:seed-demo`, `db:backup`, `db:restore` (nếu đã xoá); `db:migrate` giờ là `drizzle-kit migrate` và cần `DIRECT_URL`.
- Phần **Tài liệu**: thêm plan này và file vận hành ở Step 6.

- [ ] **Step 6: Viết tài liệu vận hành**

Tạo `docs/2026-08-14-huong-dan-van-hanh-vercel-supabase.md` gồm: sơ đồ nơi dữ liệu nằm (Postgres Supabase / Storage bucket `photos`); cách xem và tải backup từ GitHub Actions; câu lệnh khôi phục `psql "$DIRECT_URL" -f file.sql`; cách unpause project khi Supabase tạm dừng; các ngưỡng free tier cần theo dõi (DB 500MB, Storage 1GB, egress 5GB/tháng) và cách xem mức dùng hiện tại trên dashboard Supabase; nhắc rằng ToS Hobby là non-commercial.

- [ ] **Step 7: Test + typecheck lần cuối**

```bash
npm test && npx tsc --noEmit
```

Expected: PASS/sạch.

- [ ] **Step 8: Commit và mở PR**

```bash
git add CLAUDE.md docs/
git commit -m "chuyển hosting: cập nhật CLAUDE.md và tài liệu vận hành Vercel+Supabase

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git push
```

Mở PR về `main`, phần mô tả nêu: đã chuyển sang Postgres/Storage/cron ngoài, số hàng đối chiếu ở Task 17 khớp, ảnh và 3 báo cáo đã kiểm trên production, và 2 rủi ro còn lại (ToS Hobby non-commercial; Supabase free không có PITR nên mất tối đa 1 ngày dữ liệu nếu sự cố).

---

## Rủi ro còn lại sau khi xong plan (nói rõ với người dùng)

1. **ToS Vercel Hobby là non-commercial.** HeyP quản lý đơn hàng và tiền thật của shop → về câu chữ là dùng cho mục đích thương mại. Vercel có thể tạm ngưng deployment. Muốn chắc chân: Pro $20/tháng.
2. **Supabase free không có backup tự động/PITR.** Cơ chế `pg_dump` hằng ngày ở Task 16 giới hạn thiệt hại ở mức mất tối đa 1 ngày dữ liệu, không phải zero.
3. **Project tự pause sau 7 ngày không hoạt động.** Workflow tracking 4h ngăn việc này, nhưng nếu GitHub Actions bị tắt (repo không hoạt động quá 60 ngày sẽ bị GitHub tự vô hiệu hoá scheduled workflow) thì pause vẫn xảy ra.
4. **Trần dung lượng.** Hiện DB 76KB và ảnh 2.3MB — rất xa trần 500MB/1GB. Nhưng ảnh tăng theo số đơn; nên xem mức dùng mỗi vài tháng.
5. **Không còn `journal_mode=wal` an toàn cục bộ.** Mọi thao tác giờ đi qua mạng tới Singapore → chậm hơn self-host rõ rệt, đặc biệt các trang gọi nhiều truy vấn tuần tự (`/reports`, `/finance`). Nếu chậm không chấp nhận được, hướng xử lý là gộp truy vấn, không phải đổi lại hosting.
