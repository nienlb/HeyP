# HeyP v9-A — Danh mục sản phẩm: kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép tái dùng sản phẩm đã bán khi tạo đơn — danh mục có ảnh, dãy size và dãy màu — và sửa luôn việc tồn kho không phân biệt size/màu.

**Architecture:** Một bảng `products` mới làm sổ tay tra nhanh. `order_items` và `inventory` nhận thêm `product_id` + `size` + `color`, giữ nguyên cột cũ (`attributes`, `product_name`) nên dữ liệu đang có không đổi một dòng. Tồn kho gom theo một cột chuỗi `stock_key` sinh bởi hàm thuần, tránh khoá ghép chứa NULL. Chia hai chặng: chặng 1 không chạm bảng `inventory`.

**Tech Stack:** Next.js 15 App Router · React 19 · TypeScript · Postgres (Supabase) qua Drizzle + SQL thô (`src/db/raw.ts`) · CSS thuần · test bằng `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-09-heyp-v9a-danh-muc-san-pham-design.md`

## Global Constraints

Áp cho **mọi** task dưới đây. Đây là luật của dự án, không phải gợi ý.

- **SQL thô viết placeholder `?`** — lớp `Exec` tự đổi sang `$1,$2`. Trong `withTx` **PHẢI** dùng `x` được truyền vào, KHÔNG dùng `raw` toàn cục.
- **Alias camelCase trong SQL thô phải bọc nháy kép**: `AS "productId"`, không phải `AS productId`. Postgres hạ chữ thường alias không nháy kép → JS đọc `undefined`, không lỗi cú pháp.
- **`SUM()`/`COUNT()` trên cột `integer` phải ép `::int`** — nếu không, postgres-js trả `bigint`→string và JS `+` nối chuỗi.
- **Cột `bigint` đọc bằng SQL thô trả về CHUỖI** — phải `Number(r.createdAt)` trước khi dựng `Date`.
- **Thời gian lưu epoch-seconds `bigint`**, dùng hằng `NOW_EPOCH_SQL` trong SQL thô.
- **Boolean là `boolean` thật** — SQL so `= true`, JS so `=== true`.
- **Đọc số người dùng gõ PHẢI qua `src/lib/parse-number.ts`**: `parseVnd` cho VND (dấu chấm = ngăn nghìn), `parseDecimal` cho ¥ và tỷ giá (dấu chấm = thập phân). Không viết `num()` riêng.
- **Mọi ô nhập phải `font-size: var(--fs-3)` (16px)** — dưới ngưỡng này Safari iOS tự phóng to trang.
- **Mọi chỗ hiển thị ảnh ≤140px phải dùng `photoUrl(id, "thumb")`** — bản chính nặng gấp ~10 lần.
- **Kiểm quyền qua `atLeast()` / `requireRole()` / `requireAdmin()`**, KHÔNG so `role === "..."`. Ẩn nút không phải là chặn quyền — server action vẫn phải tự kiểm.
- **`logActivity` gọi SAU khi nghiệp vụ thành công, NGOÀI transaction, và nuốt lỗi.**
- **Migration viết tay PHẢI có mục trong `drizzle/meta/_journal.json`** — thiếu thì `npm run db:migrate` báo thành công mà bỏ qua file.
- **Test import module bằng đuôi `.ts` tường minh** (`../src/lib/product-catalog.ts`). Module dùng cho test không được import file có alias `@/`.
- **Trước mỗi commit:** `npm test` và `npx tsc --noEmit` phải xanh.
- Commit bằng tiếng Việt, kết thúc bằng `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Cấu trúc file

**Chặng 1 — tạo mới**

| File | Trách nhiệm |
| --- | --- |
| `src/lib/product-catalog.ts` | Module thuần: dãy size/màu, hiển thị biến thể, tách chuỗi `attributes` cũ |
| `tests/product-catalog.test.ts` | Test khoá cho module trên |
| `drizzle/0008_products.sql` | Bảng `products`, cột mới của `order_items` và `photos` |
| `src/db/products.ts` | Truy vấn CRUD danh mục + guard xoá |
| `src/app/(app)/products/actions.ts` | Server action thêm/sửa/xoá sản phẩm |
| `src/app/(app)/products/page.tsx` | Màn danh mục |
| `src/app/(app)/products/product-grid.tsx` | Lưới ảnh + ô tìm (client) |
| `src/app/(app)/products/product-sheet.tsx` | Sheet thêm/sửa sản phẩm (client) |
| `src/app/(app)/orders/new/product-picker-sheet.tsx` | Sheet chọn sản phẩm hai bước (client) |

**Chặng 1 — sửa**

`src/db/schema.ts` · `src/db/queries.ts` · `src/lib/activity-codes.ts` · `src/lib/screen-meta.ts` · `src/app/_components/nav-config.ts` · `src/app/_components/item-photos.tsx` · `src/app/(app)/orders/new/types.ts` · `item-sheet.tsx` · `new-order-form.tsx` · `src/app/(app)/orders/actions.ts` · `src/lib/storage.ts` · `tests/activity-coverage.test.ts` · `src/styles/screens.css`

**Chặng 2**

`src/lib/inventory.ts` (thêm `stockKey`) · `tests/inventory.test.ts` · `drizzle/0009_inventory_variants.sql` · `src/db/queries.ts` (`_addStock` + 3 nơi gọi) · `src/app/(app)/inventory/*`

---

## CHẶNG 1 — Danh mục và tạo đơn

Chặng này **không chạm bảng `inventory`** một dòng nào.

### Task 1: Module thuần `product-catalog.ts`

**Files:**
- Create: `src/lib/product-catalog.ts`
- Test: `tests/product-catalog.test.ts`

**Interfaces:**
- Consumes: không có (task đầu tiên, không phụ thuộc gì)
- Produces:
  - `parseList(s: string): string[]`
  - `formatList(items: string[]): string`
  - `displayVariant(v: { size?: string | null; color?: string | null; attributes?: string | null }): string`
  - `splitLegacyAttributes(attributes: string): { size: string; color: string }`

- [ ] **Step 1: Viết test trước**

Tạo `tests/product-catalog.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseList,
  formatList,
  displayVariant,
  splitLegacyAttributes,
} from "../src/lib/product-catalog.ts";

test("parseList: cắt khoảng trắng, bỏ phần tử rỗng", () => {
  assert.deepEqual(parseList(" 35 , 36 ,, 37 "), ["35", "36", "37"]);
  assert.deepEqual(parseList(""), []);
  assert.deepEqual(parseList("   "), []);
});

test("parseList: gộp khoảng trắng thừa bên trong", () => {
  assert.deepEqual(parseList("xanh   lá, đen"), ["xanh lá", "đen"]);
});

test("parseList: bỏ trùng không phân biệt hoa thường, giữ bản gõ đầu", () => {
  assert.deepEqual(parseList("Đen, đen, ĐEN, trắng"), ["Đen", "trắng"]);
});

test("formatList nối lại bằng dấu phẩy", () => {
  assert.equal(formatList(["35", "36"]), "35,36");
  assert.equal(formatList([]), "");
});

test("BẤT BIẾN: parseList(formatList(parseList(s))) == parseList(s)", () => {
  for (const s of [
    "35,36,37",
    " đen , Trắng ,, vàng ",
    "Đen, đen",
    "",
    "xanh   lá",
  ]) {
    const once = parseList(s);
    assert.deepEqual(parseList(formatList(once)), once, `hỏng với: ${s}`);
  }
});

test("formatList KHÔNG khứ hồi được phần tử chứa dấu phẩy — đã biết và chấp nhận", () => {
  // Dấu phẩy là ký tự ngăn cách, không có escape. Ô nhập là chip nên người
  // dùng không gõ được dấu phẩy vào một chip; ghi lại đây để ai đọc sau khỏi
  // tưởng là bug.
  assert.deepEqual(parseList(formatList(["a,b"])), ["a", "b"]);
});

test("displayVariant: có size và màu", () => {
  assert.equal(
    displayVariant({ size: "42", color: "trắng", attributes: "cũ" }),
    "42 · trắng",
  );
});

test("displayVariant: chỉ có size", () => {
  assert.equal(displayVariant({ size: "42", color: "", attributes: "cũ" }), "42");
});

test("displayVariant: chỉ có màu", () => {
  assert.equal(displayVariant({ size: "", color: "đen", attributes: "cũ" }), "đen");
});

test("displayVariant: cả hai trống thì rơi về attributes cũ", () => {
  assert.equal(
    displayVariant({ size: "", color: "", attributes: "42 - trắng" }),
    "42 - trắng",
  );
  assert.equal(displayVariant({ attributes: "39 đen" }), "39 đen");
});

test("displayVariant: tất cả trống thì chuỗi rỗng", () => {
  assert.equal(displayVariant({}), "");
  assert.equal(displayVariant({ size: null, color: null, attributes: null }), "");
});

test("splitLegacyAttributes: dạng '42 - trắng'", () => {
  assert.deepEqual(splitLegacyAttributes("42 - trắng"), {
    size: "42",
    color: "trắng",
  });
});

test("splitLegacyAttributes: dạng có nhãn 'màu vàng - size 36'", () => {
  assert.deepEqual(splitLegacyAttributes("màu vàng - size 36"), {
    size: "36",
    color: "vàng",
  });
});

test("splitLegacyAttributes: dạng '39 đen' không có dấu ngăn", () => {
  assert.deepEqual(splitLegacyAttributes("39 đen"), {
    size: "39",
    color: "đen",
  });
});

test("splitLegacyAttributes: chỉ có màu", () => {
  assert.deepEqual(splitLegacyAttributes("Đen"), { size: "", color: "Đen" });
});

test("splitLegacyAttributes: size lẻ 37.5", () => {
  assert.deepEqual(splitLegacyAttributes("37.5 - hồng"), {
    size: "37.5",
    color: "hồng",
  });
});

test("splitLegacyAttributes: chuỗi rỗng", () => {
  assert.deepEqual(splitLegacyAttributes(""), { size: "", color: "" });
  assert.deepEqual(splitLegacyAttributes("   "), { size: "", color: "" });
});
```

- [ ] **Step 2: Chạy test cho chắc là ĐỎ**

```bash
npm test
```

Kỳ vọng: FAIL — `Cannot find module '../src/lib/product-catalog.ts'`.

- [ ] **Step 3: Viết module**

Tạo `src/lib/product-catalog.ts`:

```ts
/**
 * Danh mục sản phẩm (v9-A). Module THUẦN — không import gì có alias `@/`,
 * không đụng DB, để test chạy bằng `node --test` không cần dựng Next.
 *
 * Dãy size và dãy màu lưu thành CHUỖI PHÂN CÁCH PHẨY chứ không phải mảng
 * Postgres: lớp Exec (src/db/raw.ts) đang đổi placeholder `?` sang `$n` và
 * chưa từng chạm kiểu mảng — thêm kiểu mới ở đó là rủi ro không cần thiết.
 */

/** Cắt chuỗi thành danh sách: bỏ khoảng trắng thừa, bỏ rỗng, bỏ trùng. */
export function parseList(s: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of (s ?? "").split(",")) {
    const v = raw.trim().replace(/\s+/g, " ");
    if (v === "") continue;
    // Trùng xét KHÔNG phân biệt hoa thường ("Đen" và "đen" là một), nhưng giữ
    // đúng cách gõ lần đầu để hiển thị theo ý người nhập.
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/**
 * Nối danh sách để ghi xuống DB. Đi qua parseList để chuẩn hoá luôn — nhờ vậy
 * bất biến `parseList(formatList(parseList(s))) === parseList(s)` luôn đúng.
 *
 * Phần tử chứa dấu phẩy sẽ bị tách làm đôi: dấu phẩy là ký tự ngăn cách và
 * không có escape. Ô nhập là chip nên người dùng không gõ được dấu phẩy vào
 * một chip — chấp nhận có chủ đích, có test ghi lại.
 */
export function formatList(items: string[]): string {
  return parseList(items.join(",")).join(",");
}

/**
 * Chuỗi biến thể để hiển thị.
 *
 * Ưu tiên hai cột mới; cả hai trống thì rơi về `attributes` cũ. Nhờ vậy đơn
 * tạo trước v9-A hiện y hệt như trước, không cần backfill và không mất chữ
 * người dùng đã gõ.
 */
export function displayVariant(v: {
  size?: string | null;
  color?: string | null;
  attributes?: string | null;
}): string {
  const size = (v.size ?? "").trim();
  const color = (v.color ?? "").trim();
  if (size !== "" || color !== "")
    return [size, color].filter((s) => s !== "").join(" · ");
  return (v.attributes ?? "").trim();
}

/**
 * Đoán size/màu từ chuỗi `attributes` cũ, để form GỢI Ý khi mở sửa món cũ.
 *
 * CHỈ dùng để gợi ý — nơi gọi phải chờ người dùng bấm xác nhận rồi mới ghi.
 * Máy đoán sai thì người sửa; máy không được lặng lẽ đổi dữ liệu thật.
 */
export function splitLegacyAttributes(attributes: string): {
  size: string;
  color: string;
} {
  const raw = (attributes ?? "").trim();
  if (raw === "") return { size: "", color: "" };

  let size = "";
  let color = "";
  const parts = raw.split(/\s*[-–·|]\s*/).filter((p) => p !== "");

  for (const part of parts) {
    const labelledSize = /^size\s*[:.]?\s*(.+)$/i.exec(part);
    if (labelledSize) {
      if (size === "") size = labelledSize[1].trim();
      continue;
    }
    const labelledColor = /^m[àa]u\s*[:.]?\s*(.+)$/i.exec(part);
    if (labelledColor) {
      if (color === "") color = labelledColor[1].trim();
      continue;
    }
    // "39 đen" — số dẫn đầu là size, phần còn lại là màu.
    const both = /^(\d{2}(?:[.,]5)?)\s+(.+)$/.exec(part);
    if (both) {
      if (size === "") size = both[1].replace(",", ".");
      if (color === "") color = both[2].trim();
      continue;
    }
    if (/^\d{2}(?:[.,]5)?$/.test(part)) {
      if (size === "") size = part.replace(",", ".");
      continue;
    }
    if (color === "") color = part;
  }

  return { size, color };
}
```

- [ ] **Step 4: Chạy test cho chắc là XANH**

```bash
npm test
```

Kỳ vọng: PASS toàn bộ 17 test mới; các test cũ không đỏ.

- [ ] **Step 5: Typecheck và commit**

```bash
npx tsc --noEmit
git add src/lib/product-catalog.ts tests/product-catalog.test.ts
git commit -m "$(cat <<'EOF'
danh mục: module thuần cho dãy size/màu và hiển thị biến thể

parseList/formatList giữ bất biến khứ hồi, splitLegacyAttributes chỉ để
GỢI Ý khi mở sửa món cũ chứ không tự ghi đè attributes.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Migration 0008 và schema

**Files:**
- Create: `drizzle/0008_products.sql`
- Modify: `drizzle/meta/_journal.json` (thêm mục idx 8)
- Modify: `src/db/schema.ts` (thêm bảng `products`; thêm cột cho `orderItems` và `photos`)

**Interfaces:**
- Consumes: không có
- Produces: bảng `products`; `order_items.product_id/size/color`; `photos.product_id`. Task 4 trở đi đọc/ghi các cột này.

- [ ] **Step 1: Viết file migration**

Tạo `drizzle/0008_products.sql`:

```sql
CREATE TABLE IF NOT EXISTS "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sizes" text DEFAULT '' NOT NULL,
	"colors" text DEFAULT '' NOT NULL,
	"default_sell_vnd" integer DEFAULT 0 NOT NULL,
	"default_unit_price_cny" double precision DEFAULT 0 NOT NULL,
	"product_url" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" bigint DEFAULT (EXTRACT(EPOCH FROM now())::bigint) NOT NULL,
	"updated_at" bigint DEFAULT (EXTRACT(EPOCH FROM now())::bigint) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "product_id" integer;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "size" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "color" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN IF NOT EXISTS "product_id" integer;--> statement-breakpoint

-- SET NULL, KHÔNG CASCADE: xoá một mẫu khỏi danh mục không được phép phá đơn cũ.
ALTER TABLE "order_items"
	ADD CONSTRAINT "order_items_product_id_products_id_fk"
	FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL;--> statement-breakpoint

-- CASCADE ở đây thì ĐÚNG: ảnh của danh mục chết theo danh mục. Ảnh đã gắn đơn
-- là DÒNG photos KHÁC (đã chép sang) nên không bị ảnh hưởng.
ALTER TABLE "photos"
	ADD CONSTRAINT "photos_product_id_products_id_fk"
	FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "order_items_product_idx" ON "order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "photos_product_idx" ON "photos" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_active_idx" ON "products" USING btree ("active");
```

- [ ] **Step 2: Thêm mục vào journal — KHÔNG ĐƯỢC QUÊN**

Trong `drizzle/meta/_journal.json`, thêm vào cuối mảng `entries` (ngay sau mục `0007_activity_log`, nhớ dấu phẩy sau mục cũ):

```json
    {
      "idx": 8,
      "version": "7",
      "when": 1788912000000,
      "tag": "0008_products",
      "breakpoints": true
    }
```

Thiếu mục này thì `npm run db:migrate` in "migrations applied successfully" mà **bỏ qua file**, DB y nguyên. Đã dính thật khi làm v8-C.

- [ ] **Step 3: Thêm bảng `products` vào schema**

Trong `src/db/schema.ts`, chèn ngay **trước** dòng `// 3) Sản phẩm trong đơn`:

```ts
// 2b) Danh mục sản phẩm (v9-A) — sổ tay tra nhanh lúc tạo đơn.
// `sizes`/`colors` là chuỗi phân cách phẩy, đọc/ghi qua src/lib/product-catalog.ts.
export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    sizes: text("sizes").notNull().default(""),
    colors: text("colors").notNull().default(""),
    defaultSellVnd: integer("default_sell_vnd").notNull().default(0),
    defaultUnitPriceCny: doublePrecision("default_unit_price_cny")
      .notNull()
      .default(0),
    productUrl: text("product_url"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: epochSeconds("updated_at").notNull().default(NOW_EPOCH),
  },
  (t) => [index("products_active_idx").on(t.active)],
);
```

- [ ] **Step 4: Thêm cột mới vào `orderItems` và `photos`**

Trong `src/db/schema.ts`, bên trong `orderItems`, thêm ngay sau dòng `attributes: text("attributes"),`:

```ts
  // v9-A. `attributes` GIỮ NGUYÊN bên trên — không backfill, không xoá: đơn cũ
  // vẫn phải đọc được đúng chữ người dùng đã gõ. Xem displayVariant().
  productId: integer("product_id").references(() => products.id, {
    onDelete: "set null",
  }),
  size: text("size").notNull().default(""),
  color: text("color").notNull().default(""),
```

Và trong `photos`, thêm sau `inventoryId`:

```ts
  productId: integer("product_id").references(() => products.id, {
    onDelete: "cascade",
  }),
```

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Kỳ vọng: PASS. Nếu báo `products` dùng trước khi khai báo, kiểm lại rằng khối `products` đứng **trên** `orderItems` trong file.

- [ ] **Step 6: Áp migration lên DB**

```bash
npm run db:migrate
```

Kỳ vọng: log có nhắc `0008_products`. Nếu chỉ in "migrations applied successfully" mà không nhắc tên file → journal sai, quay lại Step 2.

- [ ] **Step 7: Commit**

```bash
git add drizzle/0008_products.sql drizzle/meta/_journal.json src/db/schema.ts
git commit -m "$(cat <<'EOF'
danh mục: bảng products và cột biến thể cho order_items, photos

order_items/inventory dùng ON DELETE SET NULL để xoá một mẫu khỏi danh mục
không phá đơn cũ; photos.product_id thì CASCADE vì ảnh đã gắn đơn là dòng
photos khác.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Vá job dọn ảnh mồ côi (rủi ro #1 của spec)

Làm **trước** khi có bất kỳ ảnh danh mục nào tồn tại. Job cron 4h hiện xoá ảnh có `order_id`/`order_item_id`/`inventory_id` đều NULL và cũ hơn 24h — ảnh danh mục chỉ mang `product_id` nên **24h sau bị xoá sạch, không báo lỗi gì**.

**Files:**
- Modify: `src/db/queries.ts` (`listOrphanPhotos` ~dòng 2467, `deletePhoto` ~dòng 531, `addPhoto` ~dòng 495)

**Interfaces:**
- Consumes: `photos.product_id` (Task 2)
- Produces: `addPhoto` nhận thêm `productId?: number | null`. Task 6 và Task 7 dùng.

- [ ] **Step 1: Thêm điều kiện `product_id IS NULL` vào `listOrphanPhotos`**

Trong `src/db/queries.ts`, sửa câu SQL của `listOrphanPhotos`:

```ts
  return raw.all<{ id: number; filePath: string }>(
    `SELECT id, file_path AS "filePath" FROM photos
      WHERE order_id IS NULL
        AND order_item_id IS NULL
        AND inventory_id IS NULL
        AND product_id IS NULL
        AND uploaded_at < ${NOW_EPOCH_SQL} - ?`,
    [Math.round(olderThanHours * 3600)],
  );
```

Và bổ sung vào khối chú thích của hàm, ngay trước `export async function listOrphanPhotos`:

```ts
 * TỪ v9-A: `product_id IS NULL` là điều kiện BẮT BUỘC. Ảnh của danh mục sản
 * phẩm không thuộc đơn nào, không thuộc món nào, không thuộc kho nào — thiếu
 * dòng đó thì job này xoá sạch ảnh danh mục sau đúng 24h, âm thầm, không lỗi.
```

- [ ] **Step 2: Cho `deletePhoto` chấp nhận ảnh danh mục**

`deletePhoto` hiện chặn bằng `AND order_id IS NULL` để không cho xoá ảnh đã thuộc đơn. Ảnh danh mục cũng có `order_id IS NULL` nên vẫn đi lọt — đúng ý. Không đổi câu SQL; chỉ bổ sung chú thích ngay trên hàm để lần sau không ai siết nhầm:

```ts
/**
 * Xoá một ảnh CHƯA thuộc đơn nào. Điều kiện `order_id IS NULL` là hàng rào:
 * ảnh đã gắn đơn chỉ được xoá qua luồng xoá đơn.
 *
 * v9-A: ảnh danh mục sản phẩm (`product_id` có giá trị, `order_id` NULL) CỐ Ý
 * đi lọt qua đây — đó là đường người dùng gỡ ảnh khỏi một mẫu.
 */
```

- [ ] **Step 3: Cho `addPhoto` nhận `productId`**

```ts
export async function addPhoto(input: {
  filePath: string;
  label: PhotoLabel;
  orderId?: number | null;
  inventoryId?: number | null;
  productId?: number | null;
}): Promise<number> {
  const row = await raw.get<{ id: number }>(
    `INSERT INTO photos(file_path, label, order_id, inventory_id, product_id)
     VALUES(?, ?, ?, ?, ?) RETURNING id`,
    [
      input.filePath,
      input.label,
      input.orderId ?? null,
      input.inventoryId ?? null,
      input.productId ?? null,
    ],
  );
  return row!.id;
}
```

- [ ] **Step 4: Typecheck và test**

```bash
npx tsc --noEmit && npm test
```

Kỳ vọng: cả hai PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/queries.ts
git commit -m "$(cat <<'EOF'
danh mục: job dọn ảnh mồ côi phải bỏ qua ảnh danh mục

Thiếu điều kiện product_id IS NULL thì cron 4h xoá sạch ảnh danh mục sau
24h, âm thầm và không báo lỗi. Vá trước khi có ảnh danh mục nào tồn tại.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Truy vấn danh mục `src/db/products.ts`

**Files:**
- Create: `src/db/products.ts`

**Interfaces:**
- Consumes: bảng `products` (Task 2); `parseList`/`formatList` (Task 1)
- Produces:
  - `type ProductRow = { id: number; name: string; sizes: string[]; colors: string[]; defaultSellVnd: number; defaultUnitPriceCny: number; productUrl: string | null; active: boolean; photoIds: number[] }`
  - `type ProductInput = { name: string; sizes: string[]; colors: string[]; defaultSellVnd: number; defaultUnitPriceCny: number; productUrl: string | null; photoIds: number[] }`
  - `listProducts(opts?: { includeInactive?: boolean }): Promise<ProductRow[]>`
  - `getProduct(id: number): Promise<ProductRow | null>`
  - `findProductsByName(name: string): Promise<{ id: number; name: string }[]>`
  - `createProduct(input: ProductInput): Promise<number>`
  - `updateProduct(id: number, input: ProductInput): Promise<void>`
  - `deleteProduct(id: number): Promise<{ ok: true } | { ok: false; reason: string }>`
  - `suggestFromCatalog(name: string): Promise<{ productId: number; unitPriceCny: number } | null>`

- [ ] **Step 1: Viết module**

Tạo `src/db/products.ts`:

```ts
import "server-only";
import { NOW_EPOCH_SQL, raw, withTx } from "./raw";
import { formatList, parseList } from "@/lib/product-catalog";

export type ProductRow = {
  id: number;
  name: string;
  sizes: string[];
  colors: string[];
  defaultSellVnd: number;
  defaultUnitPriceCny: number;
  productUrl: string | null;
  active: boolean;
  /** Ảnh của mẫu, ảnh đầu là ảnh đại diện trong lưới chọn. */
  photoIds: number[];
};

export type ProductInput = {
  name: string;
  sizes: string[];
  colors: string[];
  defaultSellVnd: number;
  defaultUnitPriceCny: number;
  productUrl: string | null;
  /** Ảnh đã tải lên (dòng photos mồ côi), sẽ được gắn product_id ở đây. */
  photoIds: number[];
};

type DbProduct = {
  id: number;
  name: string;
  sizes: string;
  colors: string;
  defaultSellVnd: number;
  defaultUnitPriceCny: number;
  productUrl: string | null;
  active: boolean;
};

/** Ảnh của nhiều mẫu trong MỘT câu — tránh N+1 khi lưới có vài chục mẫu. */
async function photosByProduct(ids: number[]): Promise<Map<number, number[]>> {
  const map = new Map<number, number[]>();
  if (ids.length === 0) return map;
  const holes = ids.map(() => "?").join(", ");
  const rows = await raw.all<{ id: number; productId: number }>(
    `SELECT id, product_id AS "productId" FROM photos
      WHERE product_id IN (${holes})
      ORDER BY id`,
    ids,
  );
  for (const r of rows) {
    const list = map.get(r.productId) ?? [];
    list.push(r.id);
    map.set(r.productId, list);
  }
  return map;
}

function toRow(p: DbProduct, photoIds: number[]): ProductRow {
  return {
    id: p.id,
    name: p.name,
    sizes: parseList(p.sizes),
    colors: parseList(p.colors),
    defaultSellVnd: p.defaultSellVnd,
    defaultUnitPriceCny: p.defaultUnitPriceCny,
    productUrl: p.productUrl,
    active: p.active === true,
    photoIds,
  };
}

const SELECT_COLS = `id, name, sizes, colors,
       default_sell_vnd AS "defaultSellVnd",
       default_unit_price_cny AS "defaultUnitPriceCny",
       product_url AS "productUrl", active`;

export async function listProducts(
  opts: { includeInactive?: boolean } = {},
): Promise<ProductRow[]> {
  const where = opts.includeInactive ? "" : "WHERE active = true";
  const rows = await raw.all<DbProduct>(
    `SELECT ${SELECT_COLS} FROM products ${where} ORDER BY name`,
  );
  const photos = await photosByProduct(rows.map((r) => r.id));
  return rows.map((r) => toRow(r, photos.get(r.id) ?? []));
}

export async function getProduct(id: number): Promise<ProductRow | null> {
  const row = await raw.get<DbProduct>(
    `SELECT ${SELECT_COLS} FROM products WHERE id = ?`,
    [id],
  );
  if (!row) return null;
  const photos = await photosByProduct([id]);
  return toRow(row, photos.get(id) ?? []);
}

/** Mẫu trùng tên — dùng để CẢNH BÁO lúc lưu, không phải để chặn. */
export async function findProductsByName(
  name: string,
): Promise<{ id: number; name: string }[]> {
  const key = name.trim().replace(/\s+/g, " ").toLowerCase();
  if (key === "") return [];
  return raw.all<{ id: number; name: string }>(
    `SELECT id, name FROM products
      WHERE LOWER(TRIM(name)) = ? ORDER BY id`,
    [key],
  );
}

export async function createProduct(input: ProductInput): Promise<number> {
  return withTx(async (x) => {
    const row = await x.get<{ id: number }>(
      `INSERT INTO products
         (name, sizes, colors, default_sell_vnd, default_unit_price_cny,
          product_url, active)
       VALUES (?, ?, ?, ?, ?, ?, true)
       RETURNING id`,
      [
        input.name.trim(),
        formatList(input.sizes),
        formatList(input.colors),
        Math.round(input.defaultSellVnd),
        input.defaultUnitPriceCny,
        input.productUrl,
      ],
    );
    const id = row!.id;
    // Gắn ảnh TRONG cùng transaction: gắn sau thì lỗi tạm của DB làm mất liên
    // kết mà không ai biết, rồi job dọn mồ côi xoá mất ảnh. Đã xảy ra thật
    // với đơn #1 ngày 01/09.
    await attachPhotos(x, id, input.photoIds);
    return id;
  });
}

export async function updateProduct(
  id: number,
  input: ProductInput,
): Promise<void> {
  await withTx(async (x) => {
    await x.run(
      `UPDATE products
          SET name = ?, sizes = ?, colors = ?, default_sell_vnd = ?,
              default_unit_price_cny = ?, product_url = ?,
              updated_at = ${NOW_EPOCH_SQL}
        WHERE id = ?`,
      [
        input.name.trim(),
        formatList(input.sizes),
        formatList(input.colors),
        Math.round(input.defaultSellVnd),
        input.defaultUnitPriceCny,
        input.productUrl,
        id,
      ],
    );
    await attachPhotos(x, id, input.photoIds);
  });
}

/** Chỉ nhận ảnh CHƯA thuộc đâu — cùng tinh thần với linkPhotoToOrder. */
async function attachPhotos(
  x: { run: (t: string, p?: unknown[]) => Promise<void> },
  productId: number,
  photoIds: number[],
): Promise<void> {
  for (const photoId of photoIds) {
    await x.run(
      `UPDATE photos SET product_id = ?
        WHERE id = ? AND order_id IS NULL AND order_item_id IS NULL
          AND inventory_id IS NULL`,
      [productId, photoId],
    );
  }
}

/**
 * Xoá một mẫu khỏi danh mục.
 *
 * CHẶN khi còn dòng tồn kho quantity > 0: dòng tồn mang `stock_key` dạng
 * `p:<id>|…` trỏ vào một mẫu đã chết sẽ gom sai về sau. Đơn cũ thì không lo —
 * `order_items.product_id` là ON DELETE SET NULL.
 *
 * Kiểm nằm TRONG transaction, SAU `SELECT … FOR UPDATE`: kiểm ngoài
 * transaction có kẽ hở — giữa lúc kiểm và lúc xoá, người kia có thể vừa nhập
 * kho cho đúng mẫu đó.
 */
export async function deleteProduct(
  id: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  return withTx(async (x) => {
    const p = await x.get<{ id: number }>(
      "SELECT id FROM products WHERE id = ? FOR UPDATE",
      [id],
    );
    if (!p) return { ok: false as const, reason: "Không tìm thấy sản phẩm." };

    // ::int bắt buộc — không có nó postgres-js trả bigint→chuỗi và phép so
    // sánh số bên dưới sai âm thầm.
    const stock = await x.get<{ n: number }>(
      `SELECT COALESCE(SUM(quantity), 0)::int AS n
         FROM inventory WHERE product_id = ?`,
      [id],
    );
    if ((stock?.n ?? 0) > 0)
      return {
        ok: false as const,
        reason: `Còn ${stock!.n} món trong kho gắn với mẫu này — bán hết hoặc bỏ chọn "còn dùng" thay vì xoá.`,
      };

    await x.run("DELETE FROM products WHERE id = ?", [id]);
    return { ok: true as const };
  });
}

/**
 * Gợi ý giá ¥ theo tên, TRA DANH MỤC TRƯỚC rồi mới tới lịch sử đơn.
 * Nơi gọi: suggestCnyFromHistory trong src/db/queries.ts.
 */
export async function suggestFromCatalog(
  name: string,
): Promise<{ productId: number; unitPriceCny: number } | null> {
  const key = name.trim().replace(/\s+/g, " ").toLowerCase();
  if (key === "") return null;
  const row = await raw.get<{ productId: number; unitPriceCny: number }>(
    `SELECT id AS "productId",
            default_unit_price_cny AS "unitPriceCny"
       FROM products
      WHERE active = true
        AND default_unit_price_cny > 0
        AND LOWER(TRIM(name)) = ?
      ORDER BY id DESC
      LIMIT 1`,
    [key],
  );
  return row ?? null;
}
```

> **Lưu ý cho người thi công:** `deleteProduct` truy vấn bảng `inventory` với cột `product_id` — cột đó chỉ tồn tại từ **Task 10** (chặng 2). Ở chặng 1, câu này sẽ lỗi khi chạy thật. Vì vậy Task 5 (server action xoá) tạm thời **chưa** gọi `deleteProduct`; Task 12 sẽ bật nó lên. Xem Step 3 của Task 5.

- [ ] **Step 2: Nối gợi ý danh mục vào `suggestCnyFromHistory`**

Trong `src/db/queries.ts`, sửa `suggestCnyFromHistory` (~dòng 146):

```ts
export async function suggestCnyFromHistory(
  productName: string,
): Promise<number | null> {
  const key = productName.trim().replace(/\s+/g, " ").toLowerCase();
  if (key === "") return null;

  // v9-A: DANH MỤC TRƯỚC — một mẫu đã được ghim có giá do người dùng chốt,
  // đáng tin hơn giá của một dòng đơn ngẫu nhiên trong lịch sử.
  const fromCatalog = await suggestFromCatalog(productName);
  if (fromCatalog) return fromCatalog.unitPriceCny;

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

Thêm import ở đầu `src/db/queries.ts`:

```ts
import { suggestFromCatalog } from "./products";
```

- [ ] **Step 3: Typecheck và test**

```bash
npx tsc --noEmit && npm test
```

Kỳ vọng: cả hai PASS.

- [ ] **Step 4: Commit**

```bash
git add src/db/products.ts src/db/queries.ts
git commit -m "$(cat <<'EOF'
danh mục: truy vấn CRUD và gợi ý giá ưu tiên danh mục

deleteProduct kiểm tồn kho TRONG transaction sau SELECT FOR UPDATE — kiểm
ngoài có kẽ hở giữa lúc kiểm và lúc xoá.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Mã nhật ký và server action

**Files:**
- Modify: `src/lib/activity-codes.ts`
- Create: `src/app/(app)/products/actions.ts`
- Modify: `tests/activity-coverage.test.ts`
- Modify: `tests/activity-codes.test.ts` (nếu test đó liệt kê entity — kiểm trước khi sửa)

**Interfaces:**
- Consumes: `createProduct`/`updateProduct`/`deleteProduct`/`findProductsByName` (Task 4)
- Produces: `saveProductAction(prev, formData)`, `deleteProductAction(prev, formData)`, type `SaveProductState`, type `DeleteProductState`. Task 6 dùng cả bốn.

- [ ] **Step 1: Thêm entity và nhãn hành động**

Trong `src/lib/activity-codes.ts`, thêm `"product"` vào `ACTIVITY_ENTITIES` (đặt sau `"inventory"`):

```ts
export const ACTIVITY_ENTITIES = [
  "order",
  "customer",
  "payment",
  "expense",
  "cny",
  "inventory",
  "product",
  "user",
  "settings",
  "backup",
  "session",
] as const;
```

Và thêm ba nhãn vào `ACTION_LABELS`, ngay sau dòng `"inventory.sell"`:

```ts
  "product.create": "Thêm sản phẩm",
  "product.update": "Sửa sản phẩm",
  "product.delete": "Xoá sản phẩm",
```

- [ ] **Step 2: Chạy test hiện có để chắc chưa vỡ gì**

```bash
npm test
```

Kỳ vọng: PASS. Nếu `tests/activity-codes.test.ts` đỏ vì đếm số entity, cập nhật con số trong test đó cho khớp.

- [ ] **Step 3: Viết server action**

Tạo `src/app/(app)/products/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getSession, requireAdmin } from "@/lib/auth";
import {
  createProduct,
  findProductsByName,
  updateProduct,
  type ProductInput,
} from "@/db/products";
import { parseList } from "@/lib/product-catalog";
import { parseDecimal, parseVnd } from "@/lib/parse-number";
import { logActivity } from "@/db/activity";

export type DeleteProductState = { error?: string; ok?: boolean };

export type SaveProductState = {
  error?: string;
  /** Mẫu trùng tên — CẢNH BÁO, không chặn. Form hiện ra rồi hỏi lại. */
  duplicates?: { id: number; name: string }[];
  ok?: boolean;
};

function readInput(formData: FormData): ProductInput {
  return {
    name: String(formData.get("name") ?? "").trim(),
    sizes: parseList(String(formData.get("sizes") ?? "")),
    colors: parseList(String(formData.get("colors") ?? "")),
    // parseVnd cho VND (dấu chấm = ngăn nghìn), parseDecimal cho ¥ (dấu chấm
    // = thập phân). Dùng nhầm là sai giá ~10 lần — xem src/lib/parse-number.ts.
    defaultSellVnd: parseVnd(formData.get("defaultSellVnd")),
    defaultUnitPriceCny: parseDecimal(formData.get("defaultUnitPriceCny")),
    productUrl: String(formData.get("productUrl") ?? "").trim() || null,
    photoIds: String(formData.get("photoIds") ?? "")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0),
  };
}

export async function saveProductAction(
  _prev: SaveProductState,
  formData: FormData,
): Promise<SaveProductState> {
  const session = await getSession();
  if (!session) return { error: "Phiên đăng nhập đã hết hạn." };

  const idRaw = parseVnd(formData.get("id"));
  const id = idRaw > 0 ? idRaw : null;
  const input = readInput(formData);

  if (input.name === "") return { error: "Thiếu tên sản phẩm." };

  // Trùng tên: CẢNH BÁO chứ không chặn. Tên là chữ người gõ, và hai mẫu khác
  // nhau hoàn toàn có thể trùng tên thật. `confirmDuplicate` là cái gật đầu.
  const confirmed = String(formData.get("confirmDuplicate") ?? "") === "1";
  if (!confirmed) {
    const dups = (await findProductsByName(input.name)).filter(
      (d) => d.id !== id,
    );
    if (dups.length > 0) return { duplicates: dups };
  }

  if (id) {
    await updateProduct(id, input);
    await logActivity({
      actor: session.username,
      action: "product.update",
      entityId: id,
      detail: { ten: input.name },
    });
  } else {
    const newId = await createProduct(input);
    await logActivity({
      actor: session.username,
      action: "product.create",
      entityId: newId,
      detail: { ten: input.name },
    });
  }

  revalidatePath("/products");
  return { ok: true };
}

/**
 * Xoá một mẫu. Admin trở lên — `requireAdmin()` chứ không so `role === ...`.
 * Ẩn nút ở giao diện KHÔNG phải là chặn quyền; chặn thật nằm ở đây.
 *
 * Chữ ký hợp với `useActionState` ngay từ chặng 1 để Task 12 chỉ phải đổi
 * THÂN hàm, không đổi kiểu — đổi kiểu giữa chừng thì mọi nơi gọi phải sửa theo.
 *
 * CHẶNG 1 CỐ Ý CHƯA GỌI `deleteProduct`: hàm đó truy vấn `inventory.product_id`,
 * cột chỉ có từ chặng 2 (Task 11). Tạm ẩn mẫu thay vì xoá cứng; Task 12 bật
 * xoá thật lên.
 */
export async function deleteProductAction(
  _prev: DeleteProductState,
  formData: FormData,
): Promise<DeleteProductState> {
  const session = await requireAdmin();
  const id = parseVnd(formData.get("id"));
  if (!id) return { error: "Thiếu mã sản phẩm." };

  await deactivateProduct(id);
  await logActivity({
    actor: session.username,
    action: "product.delete",
    entityId: id,
    detail: { op: "deactivate" },
  });
  revalidatePath("/products");
  return { ok: true };
}

/** Tạm ẩn thay cho xoá cứng ở chặng 1. Task 12 thay bằng deleteProduct(). */
async function deactivateProduct(id: number): Promise<void> {
  const { raw } = await import("@/db/raw");
  await raw.run("UPDATE products SET active = false WHERE id = ?", [id]);
}
```

- [ ] **Step 4: Thêm hai action vào lưới an toàn nhật ký**

Trong `tests/activity-coverage.test.ts`, thêm một mục vào `PHAI_GHI` (đặt sau mục `inventory/actions.ts`):

```ts
  "src/app/(app)/products/actions.ts": [
    "saveProductAction",
    "deleteProductAction",
  ],
```

- [ ] **Step 5: Chạy test**

```bash
npm test
```

Kỳ vọng: PASS. Test `activity-coverage` phải tìm thấy `logActivity(` trong cả hai hàm. Nếu đỏ với "Không tìm thấy hàm", kiểm rằng hàm khai báo đúng dạng `export async function <tên>`.

- [ ] **Step 6: Typecheck và commit**

```bash
npx tsc --noEmit
git add src/lib/activity-codes.ts "src/app/(app)/products/actions.ts" tests/activity-coverage.test.ts tests/activity-codes.test.ts
git commit -m "$(cat <<'EOF'
danh mục: server action thêm/sửa/ẩn sản phẩm kèm nhật ký

Trùng tên chỉ CẢNH BÁO chứ không chặn — tên là chữ người gõ, hai mẫu khác
nhau vẫn có thể trùng tên thật.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Màn `/products`

**Files:**
- Modify: `src/app/_components/nav-config.ts`
- Modify: `src/lib/screen-meta.ts`
- Modify: `src/app/_components/item-photos.tsx` (nhận `label` và không phụ thuộc action của orders)
- Create: `src/app/(app)/products/page.tsx`
- Create: `src/app/(app)/products/product-grid.tsx`
- Create: `src/app/(app)/products/product-sheet.tsx`
- Modify: `src/styles/screens.css`

**Interfaces:**
- Consumes: `listProducts`/`ProductRow` (Task 4); `saveProductAction`/`deleteProductAction`/`SaveProductState` (Task 5)
- Produces: `type ProductPick` xuất từ `product-grid.tsx`. Task 9 dùng lại lưới này.

- [ ] **Step 1: Thêm màn vào hai file điều hướng**

Trong `src/app/_components/nav-config.ts`, thêm vào mảng `MORE`, đặt **đầu tiên**:

```ts
const MORE: NavItem[] = [
  { href: "/products", label: "Sản phẩm", icon: "inventory" },
  { href: "/customers", label: "Khách hàng", icon: "customers" },
  { href: "/finance", label: "Tài chính", icon: "finance" },
  { href: "/reports", label: "Báo cáo", icon: "reports" },
  { href: "/settings", label: "Cài đặt", icon: "settings" },
];
```

Không thêm vào `MAIN`: tabbar mobile chỉ có 5 ô, ba ô đầu đã kín, và ô `[+]` giữa **luôn là tạo đơn** — luật cứng từ v5.

Trong `src/lib/screen-meta.ts`, thêm vào `EXACT` (sau dòng `/inventory`):

```ts
  "/products": { title: "Sản phẩm" },
```

- [ ] **Step 2: Chạy test khoá phủ sóng**

```bash
npm test
```

Kỳ vọng: PASS. Nếu quên Step 2 phần `screen-meta.ts`, test `KHOÁ PHỦ SÓNG: mọi mục trong nav-config đều có tiêu đề` sẽ đỏ — đó chính là lưới an toàn đang làm việc.

- [ ] **Step 3: Cho `ItemPhotos` dùng được cho cả sản phẩm**

`ItemPhotos` đang import `deletePhotoAction` từ `@/app/(app)/orders/actions`, dùng được luôn (action đó chỉ xoá dòng `order_id IS NULL`). Chỉ cần cho phép đổi tiêu đề khối. Sửa `src/app/_components/item-photos.tsx`:

```tsx
export function ItemPhotos({
  value,
  onChange,
  label = "Ảnh sản phẩm",
}: {
  value: ItemPhoto[];
  onChange: (next: ItemPhoto[]) => void;
  /** Tiêu đề khối. Mặc định hợp cho món trong đơn; màn danh mục đổi chữ. */
  label?: string;
}) {
```

và trong phần JSX, đổi `<span>Ảnh sản phẩm</span>` thành `<span>{label}</span>`.

Giữ nguyên chú thích đã có của component — luật "đóng sheet mà không lưu thì phải xoá ảnh đã tải lên" vẫn áp cho màn mới.

- [ ] **Step 4: Viết lưới sản phẩm**

Tạo `src/app/(app)/products/product-grid.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { photoUrl } from "@/lib/photos";
import { formatVnd } from "@/lib/format";

export type ProductPick = {
  id: number;
  name: string;
  sizes: string[];
  colors: string[];
  defaultSellVnd: number;
  defaultUnitPriceCny: number;
  productUrl: string | null;
  photoIds: number[];
};

/**
 * Lưới ảnh + ô tìm. MỘT DOM cho cả hai kích cỡ màn: điện thoại 2 cột, từ
 * 900px là 4 cột — đổi bằng CSS chứ không render hai bản rồi ẩn một (luật
 * v8-A: hai bản là hai nguồn chân lý, sửa một quên một, không test nào bắt).
 */
export function ProductGrid({
  products,
  onPick,
  emptyText,
}: {
  products: ProductPick[];
  onPick: (p: ProductPick) => void;
  emptyText: string;
}) {
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    const key = q.trim().toLowerCase();
    if (key === "") return products;
    return products.filter((p) => p.name.toLowerCase().includes(key));
  }, [products, q]);

  return (
    <>
      <label className="field">
        <span className="sr-only">Tìm sản phẩm</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm theo tên…"
          autoFocus
        />
      </label>

      {shown.length === 0 ? (
        <div className="card empty">
          <p>{q.trim() === "" ? emptyText : `Không có mẫu nào khớp “${q}”.`}</p>
        </div>
      ) : (
        <div className="product-grid">
          {shown.map((p) => (
            <button
              key={p.id}
              type="button"
              className="product-cell"
              onClick={() => onPick(p)}
            >
              {p.photoIds[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoUrl(p.photoIds[0], "thumb")}
                  alt=""
                  loading="lazy"
                />
              ) : (
                <span className="product-cell-noimg" aria-hidden="true" />
              )}
              <span className="product-cell-name">{p.name}</span>
              <span className="product-cell-price num">
                {p.defaultSellVnd > 0 ? formatVnd(p.defaultSellVnd) : "—"}
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 5: Viết Sheet thêm/sửa sản phẩm**

Tạo `src/app/(app)/products/product-sheet.tsx`:

```tsx
"use client";

import { useActionState, useEffect, useState } from "react";
import { Sheet } from "@/app/_components/sheet";
import { ItemPhotos, type ItemPhoto } from "@/app/_components/item-photos";
import { groupVnd } from "@/lib/parse-number";
import {
  deleteProductAction,
  saveProductAction,
  type DeleteProductState,
  type SaveProductState,
} from "./actions";
import type { ProductPick } from "./product-grid";

/** Ô nhập kiểu chip: gõ rồi Enter thành một chip, chạm chip để bỏ. */
function ChipInput({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const v = draft.trim().replace(/\s+/g, " ");
    if (v === "") return;
    // So không phân biệt hoa thường, giống parseList — nếu không thì "Đen" và
    // "đen" cùng tồn tại rồi lưới chip hiện hai cái y hệt nhau.
    if (!value.some((x) => x.toLowerCase() === v.toLowerCase()))
      onChange([...value, v]);
    setDraft("");
  }

  return (
    <div className="field">
      <span>{label}</span>
      <div className="chip-row">
        {value.map((v) => (
          <button
            key={v}
            type="button"
            className="chip chip-on"
            onClick={() => onChange(value.filter((x) => x !== v))}
            aria-label={`Bỏ ${v}`}
          >
            {v} ✕
          </button>
        ))}
      </div>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            // Chặn Enter nổi lên form cha — nếu không thì gõ một chip xong là
            // submit cả Sheet.
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder={placeholder}
        enterKeyHint="done"
      />
    </div>
  );
}

export function ProductSheet({
  open,
  onClose,
  initial,
  canDelete,
}: {
  open: boolean;
  onClose: () => void;
  /** null = thêm mới. */
  initial: ProductPick | null;
  /** Admin trở lên. Ẩn nút thôi — server vẫn tự kiểm bằng requireAdmin(). */
  canDelete: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    SaveProductState,
    FormData
  >(saveProductAction, {});
  const [delState, delAction, delPending] = useActionState<
    DeleteProductState,
    FormData
  >(deleteProductAction, {});

  const [name, setName] = useState("");
  const [sizes, setSizes] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [sellVnd, setSellVnd] = useState("");
  const [cny, setCny] = useState("");
  const [url, setUrl] = useState("");
  const [photos, setPhotos] = useState<ItemPhoto[]>([]);

  // Mở lại phải nạp đúng mẫu đang sửa — không có dòng này thì lần mở thứ hai
  // vẫn hiện dữ liệu của lần trước.
  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setSizes(initial?.sizes ?? []);
    setColors(initial?.colors ?? []);
    setSellVnd(initial ? groupVnd(String(initial.defaultSellVnd)) : "");
    setCny(initial ? String(initial.defaultUnitPriceCny) : "");
    setUrl(initial?.productUrl ?? "");
    setPhotos((initial?.photoIds ?? []).map((id) => ({ id })));
  }, [open, initial]);

  // Lưu hoặc xoá xong thì đóng.
  useEffect(() => {
    if (state.ok || delState.ok) onClose();
  }, [state.ok, delState.ok, onClose]);

  return (
    <Sheet
      open={open}
      title={initial ? "Sửa sản phẩm" : "Thêm sản phẩm"}
      onClose={onClose}
    >
      <form action={formAction}>
        {initial && <input type="hidden" name="id" value={initial.id} />}
        <input type="hidden" name="sizes" value={sizes.join(",")} />
        <input type="hidden" name="colors" value={colors.join(",")} />
        <input
          type="hidden"
          name="photoIds"
          value={photos.map((p) => p.id).join(",")}
        />

        <label className="field">
          <span>Tên sản phẩm *</span>
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VD: Aire tabi"
            autoFocus
            enterKeyHint="next"
          />
        </label>

        <ChipInput
          label="Các size có"
          placeholder="Gõ 36 rồi Enter"
          value={sizes}
          onChange={setSizes}
        />
        <ChipInput
          label="Các màu có"
          placeholder="Gõ đen rồi Enter"
          value={colors}
          onChange={setColors}
        />

        <label className="field">
          <span>Giá phải thu (₫) — cho 1 cái</span>
          <input
            name="defaultSellVnd"
            inputMode="numeric"
            value={sellVnd}
            onChange={(e) => setSellVnd(e.target.value)}
            onFocus={(e) => setSellVnd(e.target.value.replace(/[.,\s]/g, ""))}
            onBlur={(e) => setSellVnd(groupVnd(e.target.value))}
            placeholder="VD: 510.000"
            enterKeyHint="next"
          />
        </label>

        <label className="field">
          <span>Giá vốn ¥ — cho 1 cái</span>
          <input
            name="defaultUnitPriceCny"
            inputMode="decimal"
            value={cny}
            onChange={(e) => setCny(e.target.value)}
            placeholder="VD: 207.5"
            enterKeyHint="next"
          />
        </label>

        <label className="field">
          <span>Link sản phẩm</span>
          <input
            name="productUrl"
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            enterKeyHint="done"
          />
        </label>

        <ItemPhotos value={photos} onChange={setPhotos} label="Ảnh mẫu" />

        {state.error && <div className="error">{state.error}</div>}

        {state.duplicates && state.duplicates.length > 0 && (
          <div className="notice">
            <p>
              Đã có mẫu tên “{name}” trong danh mục. Vẫn muốn thêm mẫu mới?
            </p>
            <button
              type="submit"
              name="confirmDuplicate"
              value="1"
              className="btn btn-outline"
              disabled={pending}
            >
              Vẫn thêm
            </button>
          </div>
        )}

        <div className="sheet-actions">
          <button
            type="submit"
            className="btn"
            disabled={pending || name.trim() === ""}
          >
            {pending ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </form>

      {/* Form xoá NẰM NGOÀI form lưu — HTML không cho lồng <form> trong
          <form>, lồng vào là vỡ hydration ngay (đã xảy ra thật ở
          PaymentsBlock). */}
      {initial && canDelete && (
        <form action={delAction}>
          <input type="hidden" name="id" value={initial.id} />
          <div className="sheet-actions">
            <button type="submit" className="btn btn-ghost" disabled={delPending}>
              {delPending ? "Đang xoá…" : "Xoá mẫu"}
            </button>
          </div>
          {delState.error && <div className="error">{delState.error}</div>}
        </form>
      )}
    </Sheet>
  );
}
```

- [ ] **Step 6: Viết trang**

Tạo `src/app/(app)/products/page.tsx`:

```tsx
import { requireAuth } from "@/lib/auth";
import { atLeast } from "@/lib/roles";
import { listProducts } from "@/db/products";
import { ProductsScreen } from "./products-screen";

export default async function ProductsPage() {
  // Layout (app)/layout.tsx đã lo khung; trang chỉ render nội dung.
  const [session, products] = await Promise.all([requireAuth(), listProducts()]);
  return (
    <ProductsScreen
      canDelete={atLeast(session.role, "admin")}
      products={products.map((p) => ({
        id: p.id,
        name: p.name,
        sizes: p.sizes,
        colors: p.colors,
        defaultSellVnd: p.defaultSellVnd,
        defaultUnitPriceCny: p.defaultUnitPriceCny,
        productUrl: p.productUrl,
        photoIds: p.photoIds,
      }))}
    />
  );
}
```

Tạo `src/app/(app)/products/products-screen.tsx`:

```tsx
"use client";

import { useState } from "react";
import { ProductGrid, type ProductPick } from "./product-grid";
import { ProductSheet } from "./product-sheet";

export function ProductsScreen({
  products,
  canDelete,
}: {
  products: ProductPick[];
  canDelete: boolean;
}) {
  const [editing, setEditing] = useState<ProductPick | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Nút thêm ở header, KHÔNG ở ô [+] giữa tabbar — ô đó luôn là tạo đơn. */}
      <button
        type="button"
        className="header-action-float"
        onClick={() => {
          setEditing(null);
          setOpen(true);
        }}
        aria-label="Thêm sản phẩm"
      >
        +
      </button>

      <ProductGrid
        products={products}
        emptyText="Chưa có mẫu nào. Bấm + ở góc trên để thêm, hoặc bấm “Lưu vào danh mục” khi tạo đơn."
        onPick={(p) => {
          setEditing(p);
          setOpen(true);
        }}
      />

      <ProductSheet
        open={open}
        onClose={() => setOpen(false)}
        initial={editing}
        canDelete={canDelete}
      />
    </>
  );
}
```

- [ ] **Step 7: Thêm CSS cho lưới**

Thêm vào cuối `src/styles/screens.css`:

```css
/* ---------- Danh mục sản phẩm (v9-A) ---------- */

/* MỘT lưới cho cả hai kích cỡ màn — đổi số cột, không đổi DOM (luật v8-A). */
.product-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--sp-3);
  margin-bottom: var(--sp-4);
}

.product-cell {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  padding: var(--sp-2);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  text-align: left;
  cursor: pointer;
  /* Vùng chạm tối thiểu theo Apple HIG. */
  min-height: var(--tap);
}

.product-cell img,
.product-cell-noimg {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.product-cell-name {
  font-size: var(--fs-3);
  color: var(--text);
}

.product-cell-price {
  font-size: var(--fs-2);
  color: var(--muted);
  text-align: left;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  margin-bottom: var(--sp-2);
}

@media (min-width: 900px) {
  .product-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
```

- [ ] **Step 8: Kiểm bằng preview trình duyệt**

Mở preview theo `.claude/launch.json`, vào `/products`. Kiểm:
1. Menu **Thêm** có mục "Sản phẩm"; tiêu đề màn hiện "Sản phẩm".
2. Bấm `+` → Sheet mở; gõ tên, thêm vài chip size và màu, lưu → mẫu hiện trong lưới.
3. Bấm vào mẫu → Sheet mở đúng dữ liệu mẫu đó.
4. Lưu mẫu thứ hai **trùng tên** → hiện cảnh báo kèm nút "Vẫn thêm"; bấm nút đó thì mới lưu.
5. Thu cửa sổ xuống <900px và giãn lên >900px: lưới đổi từ 2 sang 4 cột.
6. Đăng nhập bằng tài khoản `member`: mở một mẫu → **không** thấy nút "Xoá mẫu". Đăng nhập bằng `admin` → thấy nút, bấm thì mẫu biến khỏi lưới.

Chạy trong console trình duyệt để chắc luật 16px không bị `legacy.css` đè:

```js
[...document.querySelectorAll("input,select,textarea")].map(el=>getComputedStyle(el).fontSize)
```

Kỳ vọng: mọi phần tử trả `"16px"`. Có phần tử nhỏ hơn → tăng độ đặc hiệu luật trong `screens.css`; đừng tin bằng mắt.

- [ ] **Step 9: Chụp màn hình, typecheck, test, commit**

```bash
npx tsc --noEmit && npm test
git add "src/app/(app)/products" src/app/_components/nav-config.ts src/app/_components/item-photos.tsx src/lib/screen-meta.ts src/styles/screens.css
git commit -m "$(cat <<'EOF'
danh mục: màn /products với lưới ảnh và Sheet thêm/sửa

Lưới dùng MỘT DOM đổi số cột bằng CSS thay vì render hai bản rồi ẩn một.
Nút thêm ở header vì ô [+] giữa tabbar luôn là tạo đơn.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Chép ảnh từ danh mục sang đơn

**Files:**
- Modify: `src/lib/storage.ts` (thêm `copyPhotoFile`)
- Modify: `src/db/products.ts` (thêm `copyProductPhotos`)

**Interfaces:**
- Consumes: `addPhoto` với `productId` (Task 3); `thumbFileName` (có sẵn)
- Produces: `copyProductPhotos(productId: number): Promise<number[]>` — trả về id các dòng `photos` MỚI, mồ côi, sẵn sàng để `createOrder` gắn. Task 9 dùng.

- [ ] **Step 1: Thêm hàm chép file vào storage**

Thêm vào cuối `src/lib/storage.ts`:

```ts
/**
 * Chép một ảnh sang tên file mới, CẢ bản chính lẫn bản nhỏ `_t`.
 *
 * Dùng `.copy()` của Supabase — chép thẳng trên server lưu trữ, không tải về
 * app rồi đẩy lên lại. Với ảnh vài trăm KB thì đó là khác biệt giữa vài chục
 * ms và vài giây, mà `maxDuration` của Hobby thì có hạn.
 *
 * Vì sao phải CHÉP chứ không dùng chung dòng photos: `photos` gắn khoá ngoại
 * ON DELETE CASCADE tới `order_items` — dùng chung thì xoá một đơn sẽ cướp
 * mất ảnh của danh mục.
 *
 * Bản nhỏ hỏng thì KHÔNG chặn: route ảnh tự lùi về bản chính khi thiếu. Mất
 * bản nhỏ chỉ tốn băng thông, mất bản chính mới là mất dữ liệu.
 */
export async function copyPhotoFile(
  fromFileName: string,
  toFileName: string,
): Promise<void> {
  const { error } = await bucket().copy(fromFileName, toFileName);
  if (error) throw new Error(`Không chép được ảnh: ${error.message}`);
  try {
    await bucket().copy(thumbFileName(fromFileName), thumbFileName(toFileName));
  } catch {
    // bỏ qua có chủ đích
  }
}
```

- [ ] **Step 2: Thêm `copyProductPhotos` vào `src/db/products.ts`**

Thêm import ở đầu file:

```ts
import { randomBytes } from "node:crypto";
import { copyPhotoFile } from "@/lib/storage";
```

Và thêm hàm ở cuối file:

```ts
/**
 * Chép toàn bộ ảnh của một mẫu thành các dòng `photos` MỚI, chưa gắn vào đâu.
 *
 * Trả về id các dòng mới để `createOrder` gắn chúng TRONG transaction tạo đơn
 * (NewOrderItemInput.photoIds). Đó là lý do chúng được để mồ côi ở đây: job
 * dọn ảnh mồ côi có ân hạn 24h nên không cướp ảnh của form đang mở.
 *
 * File hỏng ở giữa thì bỏ qua ảnh đó và chép tiếp — mất một ảnh trong đơn mới
 * thì khó chịu, nhưng chặn cả việc tạo đơn vì một ảnh thì tệ hơn.
 */
export async function copyProductPhotos(productId: number): Promise<number[]> {
  const rows = await raw.all<{ id: number; filePath: string }>(
    `SELECT id, file_path AS "filePath" FROM photos
      WHERE product_id = ? ORDER BY id`,
    [productId],
  );

  const newIds: number[] = [];
  for (const r of rows) {
    const dot = r.filePath.lastIndexOf(".");
    const ext = dot > 0 ? r.filePath.slice(dot) : "";
    const target = `${Date.now()}-${randomBytes(6).toString("hex")}${ext}`;
    try {
      await copyPhotoFile(r.filePath, target);
    } catch {
      continue;
    }
    const inserted = await raw.get<{ id: number }>(
      `INSERT INTO photos(file_path, label, order_id, inventory_id, product_id)
       VALUES(?, 'product', NULL, NULL, NULL) RETURNING id`,
      [target],
    );
    if (inserted) newIds.push(inserted.id);
  }
  return newIds;
}
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Kỳ vọng: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/storage.ts src/db/products.ts
git commit -m "$(cat <<'EOF'
danh mục: chép ảnh mẫu sang đơn bằng copy của Supabase Storage

Chép chứ không dùng chung dòng photos: photos gắn ON DELETE CASCADE tới
order_items nên dùng chung thì xoá một đơn sẽ cướp mất ảnh của danh mục.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Tách hai ô Size/Màu trong luồng tạo đơn

**Files:**
- Modify: `src/app/(app)/orders/new/types.ts`
- Modify: `src/app/(app)/orders/new/item-sheet.tsx`
- Modify: `src/app/(app)/orders/new/new-order-form.tsx` (chỗ hiển thị `it.attributes` trong thẻ món)
- Modify: `src/db/queries.ts` (`NewOrderItemInput` + câu INSERT `order_items`)
- Modify: `src/app/(app)/orders/actions.ts` (`createOrderAction` đọc size/color)

**Interfaces:**
- Consumes: `displayVariant` (Task 1); cột `order_items.size/color/product_id` (Task 2)
- Produces: `ItemRow` có thêm `size: string`, `color: string`, `productId: number | null`. Task 9 dựng `ItemRow` từ một `ProductPick`.

- [ ] **Step 1: Mở rộng `ItemRow`**

Trong `src/app/(app)/orders/new/types.ts`:

```ts
export type ItemRow = {
  name: string;
  productUrl: string;
  /** v9-A: giữ lại để đọc đơn cũ. Món tạo mới dùng size/color bên dưới. */
  attributes: string;
  size: string;
  color: string;
  /** Mẫu trong danh mục mà món này lấy ra, nếu có. */
  productId: number | null;
  /** Dãy size/màu của mẫu — chỉ để hiện chip gợi ý, không gửi lên server. */
  sizeOptions: string[];
  colorOptions: string[];
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
  size: "",
  color: "",
  productId: null,
  sizeOptions: [],
  colorOptions: [],
  quantity: "1",
  sellPriceVnd: "",
  unitPriceCny: "",
  costConfirmed: true,
  photos: [],
};
```

- [ ] **Step 2: Đổi ô Size/màu trong `ItemSheet`**

Trong `src/app/(app)/orders/new/item-sheet.tsx`, thêm import:

```ts
import { splitLegacyAttributes } from "@/lib/product-catalog";
```

Thay khối `<label className="field">` của `Size / màu` bằng:

```tsx
      {/* v9-A: một ô chữ tự do tách thành hai. Món đến từ danh mục có chip
          gợi ý; món gõ tay thì hai ô trống, vẫn gõ tự do như cũ. */}
      <label className="field">
        <span>Size</span>
        {row.sizeOptions.length > 0 && (
          <div className="chip-row">
            {row.sizeOptions.map((s) => (
              <button
                key={s}
                type="button"
                className={`chip${row.size === s ? " chip-on" : ""}`}
                onClick={() => set({ size: row.size === s ? "" : s })}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <input
          value={row.size}
          onChange={(e) => set({ size: e.target.value })}
          placeholder="VD: 42"
          enterKeyHint="next"
        />
      </label>

      <label className="field">
        <span>Màu</span>
        {row.colorOptions.length > 0 && (
          <div className="chip-row">
            {row.colorOptions.map((c) => (
              <button
                key={c}
                type="button"
                className={`chip${row.color === c ? " chip-on" : ""}`}
                onClick={() => set({ color: row.color === c ? "" : c })}
              >
                {c}
              </button>
            ))}
          </div>
        )}
        <input
          value={row.color}
          onChange={(e) => set({ color: e.target.value })}
          placeholder="VD: trắng"
          enterKeyHint="next"
        />
      </label>

      {/* Món cũ có chữ trong `attributes` mà chưa có size/màu: GỢI Ý tách,
          chờ bấm xác nhận. Không tự ghi — máy đoán sai thì người sửa, chứ
          máy không lặng lẽ đổi dữ liệu thật. */}
      {row.attributes.trim() !== "" &&
        row.size === "" &&
        row.color === "" && (
          <div className="notice">
            <p>Món này đang ghi “{row.attributes}”. Tách thành size và màu?</p>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => set(splitLegacyAttributes(row.attributes))}
            >
              Tách thử
            </button>
          </div>
        )}
```

- [ ] **Step 3: Thẻ món hiện biến thể mới**

Trong `src/app/(app)/orders/new/new-order-form.tsx`, thêm import:

```ts
import { displayVariant } from "@/lib/product-catalog";
```

và đổi dòng hiển thị trong thẻ món:

```tsx
                <span className="ic-meta">
                  {displayVariant(it) || "—"} · ×{it.quantity || 0}
                </span>
```

- [ ] **Step 4: Cho `createOrder` ghi ba cột mới**

Trong `src/db/queries.ts`, mở rộng `NewOrderItemInput`:

```ts
export type NewOrderItemInput = {
  name: string;
  productUrl?: string | null;
  attributes?: string | null;
  /** v9-A — mẫu trong danh mục, nếu món lấy ra từ đó. */
  productId?: number | null;
  size?: string | null;
  color?: string | null;
  quantity: number;
  unitPriceCny: number;
  /** Lời của món. Bỏ trống → app tự rải theo mức mặc định để khớp Total. */
  marginVnd?: number;
  /** Giá ¥ do người dùng xác nhận, hay chỉ là số máy gợi ý? */
  costConfirmed?: boolean;
  photoIds?: number[];
};
```

Và sửa câu INSERT trong `createOrder`:

```ts
      const row = await x.get<{ id: number }>(
        `INSERT INTO order_items
           (order_id, product_url, name, attributes, quantity, unit_price_cny,
            margin_vnd, cost_confirmed, product_id, size, color)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          it.productId ?? null,
          // Cột NOT NULL DEFAULT '' — truyền '' chứ không phải null.
          (it.size ?? "").trim(),
          (it.color ?? "").trim(),
        ],
      );
```

- [ ] **Step 5: Cho action đọc size/color từ form**

Form gửi món dưới dạng MỘT chuỗi JSON ở trường `items` — xem khối `// Sản phẩm.` trong `createOrderAction` (`src/app/(app)/orders/actions.ts`, ~dòng 86). Bổ sung ba trường vào hàm `.map()` ở đó, ngay sau dòng `attributes:`:

```ts
        .map((it) => ({
          name: String(it.name ?? "").trim(),
          productUrl: String(it.productUrl ?? "").trim() || null,
          attributes: String(it.attributes ?? "").trim() || null,
          // v9-A. size/color là cột NOT NULL DEFAULT '' — gửi chuỗi rỗng,
          // KHÔNG gửi null.
          productId: Number(it.productId) || null,
          size: String(it.size ?? "").trim(),
          color: String(it.color ?? "").trim(),
          quantity: Number(it.quantity) || 0,
          unitPriceCny: Number(it.unitPriceCny) || 0,
          // Người gõ tay = đã xác nhận; số máy suy ngược thì form gửi false.
          costConfirmed: it.costConfirmed === true,
          marginVnd: Number(it.marginVnd) || 0,
          photoIds: Array.isArray(it.photoIds)
            ? (it.photoIds as unknown[])
                .map((n) => Number(n))
                .filter((n) => Number.isInteger(n) && n > 0)
            : [],
        }));
```

`sizeOptions`/`colorOptions` **không** được gửi lên — chúng chỉ phục vụ chip trên máy khách và server không có chỗ dùng. Ở `new-order-form.tsx`, tìm chỗ dựng giá trị cho `<input type="hidden" name="items">` (nó đang `JSON.stringify` từ `items`) và lọc tường minh:

```ts
  const itemsPayload = JSON.stringify(
    items.map((it) => ({
      name: it.name,
      productUrl: it.productUrl,
      attributes: it.attributes,
      productId: it.productId,
      size: it.size,
      color: it.color,
      quantity: Number(it.quantity) || 0,
      unitPriceCny: parseDecimal(it.unitPriceCny),
      costConfirmed: it.costConfirmed,
      marginVnd: marginFromSellPrice(
        parseVnd(it.sellPriceVnd),
        Number(it.quantity) || 0,
        parseDecimal(it.unitPriceCny),
        parseVnd(exchangeRate),
      ),
      photoIds: it.photos.map((p) => p.id),
    })),
  );
```

> Nếu file đang dựng payload theo cách khác, **giữ nguyên cách tính `marginVnd` đang có** và chỉ thêm ba khoá `productId`, `size`, `color`. Luật tiền của v6 (form gửi lời đã tính sẵn, `createOrder` đi nhánh `hasMargins` và không tự rải) KHÔNG được đụng tới trong task này.

- [ ] **Step 6: Typecheck và test**

```bash
npx tsc --noEmit && npm test
```

Kỳ vọng: cả hai PASS. `tsc` sẽ chỉ ra mọi nơi dựng `ItemRow` còn thiếu trường mới (`quick-import-sheet.tsx`, chỗ `applyItemsFromExtract`) — thêm `size: "", color: "", productId: null, sizeOptions: [], colorOptions: []` vào các chỗ đó.

- [ ] **Step 7: Kiểm bằng preview**

Tạo một đơn mới với một món có Size `42` và Màu `trắng`. Kiểm:
1. Thẻ món hiện `42 · trắng · ×1`.
2. Mở chi tiết đơn vừa tạo → món hiện đúng biến thể.
3. Mở một đơn **cũ** (tạo trước v9-A) → biến thể vẫn hiện đúng chữ trong `attributes`, không mất.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/orders" src/db/queries.ts
git commit -m "$(cat <<'EOF'
danh mục: tách Size và Màu thành hai ô, giữ nguyên attributes cũ

Đơn cũ hiện y như trước nhờ displayVariant rơi về attributes. Món cũ được
GỢI Ý tách, chờ người bấm xác nhận chứ không tự ghi.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Sheet chọn sản phẩm và nút "Lưu vào danh mục"

**Files:**
- Create: `src/app/(app)/orders/new/product-picker-sheet.tsx`
- Modify: `src/app/(app)/orders/new/page.tsx` (nạp danh mục truyền xuống form)
- Modify: `src/app/(app)/orders/new/new-order-form.tsx` (nút mở Sheet)
- Modify: `src/app/(app)/orders/new/item-sheet.tsx` (nút "Lưu vào danh mục")
- Modify: `src/app/(app)/products/actions.ts` (thêm `pickProductAction`, `quickSaveProductAction`)
- Modify: `tests/activity-coverage.test.ts`

**Interfaces:**
- Consumes: `ProductGrid`/`ProductPick` (Task 6); `copyProductPhotos` (Task 7); `ItemRow` (Task 8)
- Produces: `ProductPickerSheet` — gọi `onAdd(item: ItemRow)` khi người dùng bấm Xong.

- [ ] **Step 1: Thêm hai action**

Trong `src/app/(app)/products/actions.ts`, thêm import:

```ts
import { copyProductPhotos, getProduct } from "@/db/products";
```

và hai hàm:

```ts
/**
 * Chép ảnh của một mẫu ra thành ảnh mồ côi cho món sắp thêm vào đơn.
 *
 * KHÔNG ghi nhật ký: đây chỉ là bước dựng nháp trên form, chưa có gì xảy ra
 * với dữ liệu nghiệp vụ. Nhật ký sẽ ghi ở `order.create` khi đơn được tạo.
 * Vì vậy hàm này CỐ Ý không nằm trong tests/activity-coverage.test.ts.
 */
export async function pickProductAction(productId: number): Promise<number[]> {
  const session = await getSession();
  if (!session) return [];
  const product = await getProduct(productId);
  if (!product) return [];
  return copyProductPhotos(productId);
}

/**
 * "Lưu vào danh mục" từ Sheet thêm món — ghim một món đang gõ thành mẫu.
 * Ảnh của món KHÔNG bị lấy đi: mẫu mới được chép ảnh riêng ở Task 7 khi dùng
 * lại. Ở đây chỉ lưu chữ và giá.
 */
export async function quickSaveProductAction(input: {
  name: string;
  size: string;
  color: string;
  sellPriceVnd: number;
  unitPriceCny: number;
  productUrl: string | null;
}): Promise<{ productId: number } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "Phiên đăng nhập đã hết hạn." };
  const name = input.name.trim();
  if (name === "") return { error: "Thiếu tên sản phẩm." };

  const productId = await createProduct({
    name,
    sizes: input.size.trim() === "" ? [] : [input.size.trim()],
    colors: input.color.trim() === "" ? [] : [input.color.trim()],
    defaultSellVnd: Math.round(input.sellPriceVnd),
    defaultUnitPriceCny: input.unitPriceCny,
    productUrl: input.productUrl,
    photoIds: [],
  });

  await logActivity({
    actor: session.username,
    action: "product.create",
    entityId: productId,
    detail: { ten: name, op: "quick_save" },
  });
  revalidatePath("/products");
  return { productId };
}
```

Thêm `"quickSaveProductAction"` vào mục `src/app/(app)/products/actions.ts` trong `tests/activity-coverage.test.ts`. **Không** thêm `pickProductAction` — nó cố ý không ghi nhật ký, thêm vào sẽ làm test đỏ sai.

- [ ] **Step 2: Viết Sheet chọn sản phẩm**

Tạo `src/app/(app)/orders/new/product-picker-sheet.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/app/_components/sheet";
import { ProductGrid, type ProductPick } from "@/app/(app)/products/product-grid";
import { pickProductAction } from "@/app/(app)/products/actions";
import { groupVnd, parseVnd } from "@/lib/parse-number";
import { emptyItem, type ItemRow } from "./types";

/**
 * Chọn một mẫu từ danh mục, hai bước trong CÙNG một Sheet:
 *   1. Lưới ảnh + ô tìm — giày dép nhận ra bằng MẮT nhanh hơn đọc tên.
 *   2. Chip size + chip màu + số lượng + giá thu, rồi Xong.
 *
 * Mỗi lần chọn sinh ĐÚNG MỘT dòng món. Khách lấy nhiều size cùng mẫu là cảnh
 * hiếm — chọn lại lần nữa, đổi lại thì bước 2 đơn giản hơn hẳn.
 */
export function ProductPickerSheet({
  open,
  onClose,
  products,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  products: ProductPick[];
  onAdd: (item: ItemRow) => void;
}) {
  const [picked, setPicked] = useState<ProductPick | null>(null);
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [qty, setQty] = useState("1");
  const [sell, setSell] = useState("");
  const [photoIds, setPhotoIds] = useState<number[]>([]);
  const [copying, setCopying] = useState(false);

  // Mở lại phải về bước 1 — không có dòng này thì lần mở sau vẫn đứng ở mẫu
  // đã chọn lần trước.
  useEffect(() => {
    if (!open) return;
    setPicked(null);
    setSize("");
    setColor("");
    setQty("1");
    setSell("");
    setPhotoIds([]);
  }, [open]);

  async function choose(p: ProductPick) {
    setPicked(p);
    setSize(p.sizes.length === 1 ? p.sizes[0] : "");
    setColor(p.colors.length === 1 ? p.colors[0] : "");
    setSell(p.defaultSellVnd > 0 ? groupVnd(String(p.defaultSellVnd)) : "");
    if (p.photoIds.length === 0) return;
    // Chép ảnh ngay lúc chọn: chúng thành ảnh mồ côi có ân hạn 24h, rồi
    // createOrder gắn vào món TRONG transaction.
    setCopying(true);
    try {
      setPhotoIds(await pickProductAction(p.id));
    } catch {
      // Chép ảnh hỏng thì vẫn thêm được món, chỉ là không có ảnh.
      setPhotoIds([]);
    } finally {
      setCopying(false);
    }
  }

  function done() {
    if (!picked) return;
    const sellVnd = parseVnd(sell);
    if (sellVnd <= 0) return;
    onAdd({
      ...emptyItem,
      name: picked.name,
      productUrl: picked.productUrl ?? "",
      productId: picked.id,
      size,
      color,
      sizeOptions: picked.sizes,
      colorOptions: picked.colors,
      quantity: qty,
      sellPriceVnd: sell,
      unitPriceCny:
        picked.defaultUnitPriceCny > 0 ? String(picked.defaultUnitPriceCny) : "",
      // Giá ¥ lấy từ danh mục là giá NGƯỜI DÙNG đã chốt, không phải số máy
      // suy ngược — nên đánh dấu đã xác nhận.
      costConfirmed: picked.defaultUnitPriceCny > 0,
      photos: photoIds.map((id) => ({ id })),
    });
    onClose();
  }

  const valid = picked !== null && parseVnd(sell) > 0 && Number(qty) > 0;

  return (
    <Sheet
      open={open}
      title={picked ? picked.name : "Chọn từ danh mục"}
      onClose={onClose}
      footer={
        picked ? (
          <div className="sheet-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setPicked(null)}
            >
              Chọn mẫu khác
            </button>
            <button
              type="button"
              className="btn"
              disabled={!valid || copying}
              onClick={done}
            >
              {copying ? "Đang chép ảnh…" : "Xong"}
            </button>
          </div>
        ) : undefined
      }
    >
      {picked === null ? (
        <ProductGrid
          products={products}
          emptyText="Danh mục còn trống. Thêm mẫu ở màn Sản phẩm, hoặc bấm “Lưu vào danh mục” sau khi gõ một món."
          onPick={choose}
        />
      ) : (
        <>
          <label className="field">
            <span>Size</span>
            <div className="chip-row">
              {picked.sizes.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`chip${size === s ? " chip-on" : ""}`}
                  onClick={() => setSize(size === s ? "" : s)}
                >
                  {s}
                </button>
              ))}
            </div>
            <input
              value={size}
              onChange={(e) => setSize(e.target.value)}
              placeholder="Hoặc gõ size khác"
            />
          </label>

          <label className="field">
            <span>Màu</span>
            <div className="chip-row">
              {picked.colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`chip${color === c ? " chip-on" : ""}`}
                  onClick={() => setColor(color === c ? "" : c)}
                >
                  {c}
                </button>
              ))}
            </div>
            <input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="Hoặc gõ màu khác"
            />
          </label>

          <label className="field">
            <span>Số lượng *</span>
            <input
              inputMode="numeric"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </label>

          <label className="field">
            <span>Giá phải thu (₫) — cho 1 cái *</span>
            <input
              inputMode="numeric"
              value={sell}
              onChange={(e) => setSell(e.target.value)}
              onFocus={(e) => setSell(e.target.value.replace(/[.,\s]/g, ""))}
              onBlur={(e) => setSell(groupVnd(e.target.value))}
            />
          </label>
        </>
      )}
    </Sheet>
  );
}
```

- [ ] **Step 3: Nạp danh mục ở trang tạo đơn**

Thay toàn bộ `src/app/(app)/orders/new/page.tsx`:

```tsx
import { requireAuth } from "@/lib/auth";
import { getSettings, listCustomers } from "@/db/queries";
import { listProducts } from "@/db/products";
import { NewOrderForm } from "./new-order-form";

export default async function NewOrderPage() {
  const [, customers, settings, products] = await Promise.all([
    requireAuth(),
    listCustomers(),
    getSettings(),
    listProducts(),
  ]);

  return (
    <>
        <NewOrderForm
          customers={customers.map((c) => ({
            id: c.id,
            name: c.name,
            warningFlag: c.warningFlag,
            warningReason: c.warningReason,
          }))}
          products={products.map((p) => ({
            id: p.id,
            name: p.name,
            sizes: p.sizes,
            colors: p.colors,
            defaultSellVnd: p.defaultSellVnd,
            defaultUnitPriceCny: p.defaultUnitPriceCny,
            productUrl: p.productUrl,
            photoIds: p.photoIds,
          }))}
          defaultExchangeRate={settings.sellRate}
          defaultMarginVnd={settings.defaultMarginVnd}
        />
    </>
  );
}
```

`listProducts()` chạy song song trong cùng `Promise.all` đang có — không thêm một vòng chờ nào. Trang này nằm DƯỚI ranh giới Suspense nên khung xương che được; đừng chuyển truy vấn này lên `(app)/layout.tsx`.

- [ ] **Step 4: Thêm nút mở Sheet vào form tạo đơn**

Trong `src/app/(app)/orders/new/new-order-form.tsx`:

```ts
import { ProductPickerSheet } from "./product-picker-sheet";
import type { ProductPick } from "@/app/(app)/products/product-grid";
```

Thêm `products: ProductPick[]` vào props của `NewOrderForm`, thêm state:

```ts
  const [pickerOpen, setPickerOpen] = useState(false);
```

Ngay **trên** nút `+ Thêm món`, chèn:

```tsx
          {products.length > 0 && (
            <button
              type="button"
              className="picker"
              onClick={() => setPickerOpen(true)}
            >
              ★ Chọn từ danh mục
            </button>
          )}
```

Và cạnh `<ItemSheet …>` đang có, thêm:

```tsx
      <ProductPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        products={products}
        onAdd={(item) => setItems((prev) => [...prev, item])}
      />
```

- [ ] **Step 5: Nút "Lưu vào danh mục" trong ItemSheet**

Trong `src/app/(app)/orders/new/item-sheet.tsx`, thêm import:

```ts
import { quickSaveProductAction } from "@/app/(app)/products/actions";
import { parseDecimal } from "@/lib/parse-number";
```

thêm state:

```ts
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
```

và chèn ngay trước `<details className="more-fields">`:

```tsx
      {/* Đường "ghim": món chủ lực lên danh mục bằng một lần chạm; hàng lẻ
          không làm bẩn gì vì phải bấm mới lưu. */}
      {row.productId === null && (
        <div className="field">
          <button
            type="button"
            className="btn btn-outline"
            disabled={saving || !valid}
            onClick={async () => {
              setSaving(true);
              setSavedMsg(null);
              const res = await quickSaveProductAction({
                name: row.name.trim(),
                size: row.size,
                color: row.color,
                sellPriceVnd: parseVnd(row.sellPriceVnd),
                unitPriceCny: parseDecimal(row.unitPriceCny),
                productUrl: row.productUrl.trim() || null,
              });
              setSaving(false);
              if ("error" in res) setSavedMsg(res.error);
              else {
                set({ productId: res.productId });
                setSavedMsg("Đã lưu vào danh mục.");
              }
            }}
          >
            {saving ? "Đang lưu…" : "★ Lưu vào danh mục"}
          </button>
          {savedMsg && <div className="muted small">{savedMsg}</div>}
        </div>
      )}
```

- [ ] **Step 6: Typecheck và test**

```bash
npx tsc --noEmit && npm test
```

Kỳ vọng: cả hai PASS.

- [ ] **Step 7: Kiểm bằng preview — nghiệm thu chặng 1**

1. Thêm một mẫu ở `/products` có 3 size, 2 màu, có ảnh, giá thu 510.000.
2. Vào `/orders/new` → bấm **★ Chọn từ danh mục** → lưới hiện mẫu kèm ảnh.
3. Chạm mẫu → bước 2 hiện chip size và chip màu; chọn `38` và `đen`; giá thu điền sẵn `510.000`.
4. Bấm **Xong** → thẻ món hiện `38 · đen · ×1` kèm ảnh.
5. Tạo đơn → mở chi tiết đơn: món có ảnh, có biến thể đúng.
6. **Kiểm ảnh không bị dùng chung:** vào `/products`, mẫu vẫn còn ảnh của nó.
7. Gõ tay một món mới, bấm **★ Lưu vào danh mục** → mẫu xuất hiện ở `/products`.
8. Mở `/admin/activity` → thấy dòng "Thêm sản phẩm".

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/orders/new" "src/app/(app)/products/actions.ts" tests/activity-coverage.test.ts
git commit -m "$(cat <<'EOF'
danh mục: Sheet chọn sản phẩm hai bước và nút lưu vào danh mục

Mỗi lần chọn sinh đúng một dòng món. Ảnh của mẫu được CHÉP sang đơn nên
mẫu giữ nguyên ảnh của nó.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

**Chặng 1 xong.** Đẩy lên và dùng thử vài ngày trước khi vào chặng 2 — chặng sau đụng giá vốn bình quân.

```bash
git push
```

---

## CHẶNG 2 — Tồn kho theo biến thể

Chặng này đụng `_addStock`, tức đụng tiền. Không gộp commit với việc khác.

### Task 10: Hàm thuần `stockKey()`

**Files:**
- Modify: `src/lib/inventory.ts`
- Modify: `tests/inventory.test.ts`

**Interfaces:**
- Consumes: không có
- Produces: `stockKey(input: { productId?: number | null; name?: string | null; size?: string | null; color?: string | null }): string`

- [ ] **Step 1: Viết test trước**

Thêm vào cuối `tests/inventory.test.ts`:

```ts
import { stockKey } from "../src/lib/inventory.ts";

test("stockKey: mẫu trong danh mục dùng nhánh p:", () => {
  assert.equal(
    stockKey({ productId: 7, size: "38", color: "đen" }),
    "p:7|38|đen",
  );
});

test("stockKey: cùng mẫu cùng size cùng màu luôn ra cùng khoá", () => {
  const a = stockKey({ productId: 7, size: "38", color: "Đen" });
  const b = stockKey({ productId: 7, size: " 38 ", color: "đen" });
  assert.equal(a, b);
});

test("stockKey: khác size ra khoá khác — đây là điểm chính của v9-A", () => {
  assert.notEqual(
    stockKey({ productId: 7, size: "38", color: "đen" }),
    stockKey({ productId: 7, size: "42", color: "đen" }),
  );
});

test("stockKey: khác màu ra khoá khác", () => {
  assert.notEqual(
    stockKey({ productId: 7, size: "38", color: "đen" }),
    stockKey({ productId: 7, size: "38", color: "trắng" }),
  );
});

test("stockKey: size/màu trống vẫn hợp lệ", () => {
  assert.equal(stockKey({ productId: 7 }), "p:7||");
});

test("stockKey: chưa gắn danh mục thì dùng nhánh n: theo tên", () => {
  assert.equal(stockKey({ name: "Giày ABC" }), "n:giày abc");
});

test("stockKey: nhánh n: bỏ qua khoảng trắng thừa và hoa thường", () => {
  assert.equal(
    stockKey({ name: "  Giày   ABC " }),
    stockKey({ name: "giày abc" }),
  );
});

test("stockKey: productId = 0 hoặc null đều rơi về nhánh n:", () => {
  assert.equal(stockKey({ productId: null, name: "Dép" }), "n:dép");
  assert.equal(stockKey({ productId: 0, name: "Dép" }), "n:dép");
});

test("stockKey: nhánh n: KHÔNG tách theo size — giữ đúng cách gom cũ", () => {
  // Dòng tồn cũ không biết size. Nếu nhánh n: cũng tách size thì migration
  // backfill sẽ sinh khoá khác với khoá lúc chạy, và tồn kho nhân đôi.
  assert.equal(
    stockKey({ name: "Giày ABC", size: "38" }),
    stockKey({ name: "Giày ABC", size: "42" }),
  );
});
```

- [ ] **Step 2: Chạy test cho chắc là ĐỎ**

```bash
npm test
```

Kỳ vọng: FAIL — `stockKey is not a function` hoặc lỗi import.

- [ ] **Step 3: Viết hàm**

Thêm vào cuối `src/lib/inventory.ts`:

```ts
/**
 * Khoá gom tồn kho (v9-A).
 *
 * VÌ SAO LÀ MỘT CỘT CHUỖI, không phải khoá ghép (product_id, size, color):
 * dòng tồn cũ có product_id = NULL, mà trong SQL `NULL = NULL` là SAI. Khoá
 * ghép buộc mọi chỗ tra phải viết `IS NOT DISTINCT FROM`; chỉ cần một chỗ
 * viết `=` là dòng cũ không bao giờ được tìm thấy, _addStock đẻ ra dòng mới
 * thay vì cộng dồn, và tồn kho nhân đôi âm thầm — không lỗi nào nổ.
 *
 * Nhánh `n:` CỐ Ý không tách theo size: nó phải khớp đúng cách gom trước
 * v9-A để migration backfill không làm số tồn nhúc nhích.
 */
export function stockKey(input: {
  productId?: number | null;
  name?: string | null;
  size?: string | null;
  color?: string | null;
}): string {
  const norm = (s: string | null | undefined) =>
    (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

  if (input.productId != null && input.productId > 0)
    return `p:${input.productId}|${norm(input.size)}|${norm(input.color)}`;

  return `n:${norm(input.name)}`;
}
```

- [ ] **Step 4: Chạy test cho chắc là XANH**

```bash
npm test
```

Kỳ vọng: PASS toàn bộ 9 test mới.

- [ ] **Step 5: Typecheck và commit**

```bash
npx tsc --noEmit
git add src/lib/inventory.ts tests/inventory.test.ts
git commit -m "$(cat <<'EOF'
tồn kho: hàm thuần stockKey gom theo mẫu + size + màu

Một cột chuỗi thay cho khoá ghép chứa NULL — khoá ghép buộc dùng
IS NOT DISTINCT FROM ở mọi chỗ tra, sai một chỗ là tồn kho nhân đôi.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Migration 0009 và backfill

**Files:**
- Create: `drizzle/0009_inventory_variants.sql`
- Modify: `drizzle/meta/_journal.json`
- Modify: `src/db/schema.ts` (`inventory`)

**Interfaces:**
- Consumes: bảng `products` (Task 2)
- Produces: `inventory.product_id/size/color/stock_key`, đã backfill. Task 12 dùng.

- [ ] **Step 1: Viết migration**

Tạo `drizzle/0009_inventory_variants.sql`:

```sql
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "product_id" integer;--> statement-breakpoint
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "size" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "color" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "stock_key" text DEFAULT '' NOT NULL;--> statement-breakpoint

ALTER TABLE "inventory"
	ADD CONSTRAINT "inventory_product_id_products_id_fk"
	FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL;--> statement-breakpoint

-- Backfill: giữ ĐÚNG cách gom hiện tại. Nhánh `n:` của stockKey() trong
-- src/lib/inventory.ts phải sinh ra y hệt chuỗi này, nếu không dòng tồn cũ sẽ
-- không được tìm thấy và _addStock đẻ ra dòng trùng.
UPDATE "inventory"
   SET "stock_key" = 'n:' || lower(regexp_replace(trim("product_name"), '\s+', ' ', 'g'))
 WHERE "stock_key" = '';--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "inventory_stock_key_idx" ON "inventory" USING btree ("stock_key","source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_product_idx" ON "inventory" USING btree ("product_id");
```

- [ ] **Step 2: Thêm mục journal**

Thêm vào cuối mảng `entries` của `drizzle/meta/_journal.json`:

```json
    {
      "idx": 9,
      "version": "7",
      "when": 1788912060000,
      "tag": "0009_inventory_variants",
      "breakpoints": true
    }
```

- [ ] **Step 3: Cập nhật schema**

Trong `src/db/schema.ts`, thêm vào `inventory` sau `source`:

```ts
  // v9-A. `product_name` GIỮ NGUYÊN bên trên: dòng tồn cũ không biết mẫu nào,
  // và tên vẫn là thứ hiển thị cho chúng.
  productId: integer("product_id").references(() => products.id, {
    onDelete: "set null",
  }),
  size: text("size").notNull().default(""),
  color: text("color").notNull().default(""),
  /** Khoá gom — sinh bởi stockKey() trong src/lib/inventory.ts. */
  stockKey: text("stock_key").notNull().default(""),
```

- [ ] **Step 4: Áp migration**

```bash
npm run db:migrate
```

Kỳ vọng: log nhắc `0009_inventory_variants`.

- [ ] **Step 5: Kiểm backfill khớp với hàm JS**

Chạy trên DB (qua Supabase SQL editor hoặc `psql` với `DIRECT_URL`):

```sql
SELECT id, product_name, stock_key FROM inventory ORDER BY id;
```

Với mỗi dòng, `stock_key` phải bằng đúng `stockKey({ name: product_name })` của hàm JS. Kiểm nhanh một dòng bằng node:

```bash
node --experimental-strip-types -e "import('./src/lib/inventory.ts').then(m=>console.log(m.stockKey({name:'  Giày   ABC '})))"
```

Kỳ vọng: in `n:giày abc`. Nếu SQL và JS ra khác nhau, sửa **regex trong migration** cho khớp hàm JS, rồi chạy lại `UPDATE`.

- [ ] **Step 6: Typecheck và commit**

```bash
npx tsc --noEmit && npm test
git add drizzle/0009_inventory_variants.sql drizzle/meta/_journal.json src/db/schema.ts
git commit -m "$(cat <<'EOF'
tồn kho: cột biến thể và stock_key, backfill giữ nguyên cách gom cũ

Backfill sinh khoá 'n:<tên chuẩn hoá>' đúng bằng nhánh n: của stockKey(),
nên số tồn đang có không nhúc nhích một đơn vị.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: `_addStock` gom theo `stock_key`

**Files:**
- Modify: `src/db/queries.ts` (`_addStock` ~dòng 722; ba nơi gọi ~951, ~968, ~1903; `OrderItemRow`; `listInventory`)
- Modify: `src/app/(app)/products/actions.ts` (bật `deleteProduct` thật)

**Interfaces:**
- Consumes: `stockKey` (Task 10); cột mới của `inventory` (Task 11)
- Produces: `_addStock(x, item, source, qty, unitCost)` với `item: { name: string; productId: number | null; size: string; color: string }`

- [ ] **Step 1: Đổi chữ ký và câu tra của `_addStock`**

Trong `src/db/queries.ts`, thay toàn bộ `_addStock`:

```ts
/**
 * Cộng hàng vào kho, gộp theo (stock_key, nguồn) với giá vốn bình quân.
 *
 * v9-A: khoá đổi từ `product_name` sang `stock_key` để phân biệt size/màu.
 * Công thức bình quân gia quyền (applyStockIn) KHÔNG đổi một chữ.
 */
async function _addStock(
  x: Exec,
  item: {
    name: string;
    productId: number | null;
    size: string;
    color: string;
  },
  source: InventorySource,
  qty: number,
  unitCost: number,
): Promise<void> {
  const key = stockKey({
    productId: item.productId,
    name: item.name,
    size: item.size,
    color: item.color,
  });

  const row = await x.get<{ id: number; quantity: number; avg_cost: number }>(
    "SELECT id, quantity, avg_cost FROM inventory WHERE stock_key = ? AND source = ?",
    [key, source],
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
      `INSERT INTO inventory
         (product_name, quantity, avg_cost, source, last_imported_at,
          product_id, size, color, stock_key)
       VALUES (?, ?, ?, ?, ${NOW_EPOCH_SQL}, ?, ?, ?, ?)`,
      [
        item.name,
        qty,
        unitCost,
        source,
        item.productId,
        item.size,
        item.color,
        key,
      ],
    );
  }
}
```

Thêm import ở đầu file (gộp vào dòng import sẵn có từ `@/lib/inventory`):

```ts
import { stockKey } from "@/lib/inventory";
```

- [ ] **Step 2: Cho `OrderItemRow` mang ba cột mới**

Trong `src/db/queries.ts`, sửa type `OrderItemRow` (~dòng 714):

```ts
type OrderItemRow = {
  id: number;
  name: string;
  quantity: number;
  unit_price_cny: number;
  line_status: string;
  product_id: number | null;
  size: string;
  color: string;
};
```

Và sửa câu SELECT trong `changeOrderStatus` (~dòng 943):

```ts
    const normalItems = await x.all<OrderItemRow>(
      `SELECT id, name, quantity, unit_price_cny, line_status,
              product_id, size, color
         FROM order_items
        WHERE order_id = ? AND line_status = 'normal'`,
      [id],
    );
```

- [ ] **Step 3: Sửa ba nơi gọi `_addStock`**

Nơi gọi 1 — đơn nhập kho về kho VN (~dòng 951):

```ts
        await _addStock(
          x,
          {
            name: it.name,
            productId: it.product_id,
            size: it.size,
            color: it.color,
          },
          "active",
          it.quantity,
          unitGoodsCostVnd(it.unit_price_cny, order.exchange_rate),
        );
```

Nơi gọi 2 — khách bom (~dòng 968):

```ts
        await _addStock(
          x,
          {
            name: it.name,
            productId: it.product_id,
            size: it.size,
            color: it.color,
          },
          "bom",
          it.quantity,
          perUnit,
        );
```

Nơi gọi 3 — tách dòng lỗi NCC / đổi trả (~dòng 1903). Trước đó phải bổ sung ba cột vào câu SELECT lấy `item` ở đầu hàm đó (tìm `SELECT` nào nạp `item.name`, `item.quantity`, `item.unit_price_cny` rồi thêm `product_id, size, color`), rồi:

```ts
    await _addStock(
      x,
      {
        name: item.name,
        productId: item.product_id,
        size: item.size,
        color: item.color,
      },
      source,
      item.quantity,
      unitGoodsCostVnd(item.unit_price_cny, order.exchange_rate),
    );
```

- [ ] **Step 4: Bật `deleteProduct` thật**

Trong `src/app/(app)/products/actions.ts`, thay THÂN `deleteProductAction` và **xoá** hàm `deactivateProduct`. Chữ ký giữ nguyên nên `ProductSheet` không phải sửa một dòng nào:

```ts
export async function deleteProductAction(
  _prev: DeleteProductState,
  formData: FormData,
): Promise<DeleteProductState> {
  const session = await requireAdmin();
  const id = parseVnd(formData.get("id"));
  if (!id) return { error: "Thiếu mã sản phẩm." };

  // Xoá CỨNG từ chặng 2. Guard "còn tồn > 0" nằm trong deleteProduct, TRONG
  // transaction sau SELECT … FOR UPDATE.
  const res = await deleteProduct(id);
  if (!res.ok) return { error: res.reason };

  await logActivity({
    actor: session.username,
    action: "product.delete",
    entityId: id,
  });
  revalidatePath("/products");
  return { ok: true };
}
```

và thêm `deleteProduct` vào dòng import từ `@/db/products`.

- [ ] **Step 5: PHÉP KIỂM BẮT BUỘC — chạy trên dữ liệu giả**

Dự án không có DB test, nên kiểm câu SQL bằng `VALUES` như đã làm cho `listCustomerStats`. Chạy trên Supabase SQL editor:

```sql
-- Hai lần nhập CÙNG mẫu KHÁC size phải ra HAI dòng tồn.
WITH thu AS (
  SELECT * FROM (VALUES
    ('p:7|38|đen', 'active', 1, 500000),
    ('p:7|42|đen', 'active', 1, 500000)
  ) AS t(stock_key, source, qty, cost)
)
SELECT count(*)::int AS so_dong FROM (
  SELECT stock_key, source FROM thu GROUP BY stock_key, source
) g;
-- Kỳ vọng: so_dong = 2
```

```sql
-- Hai lần nhập CÙNG mẫu CÙNG size CÙNG màu phải ra MỘT dòng, bình quân đúng.
WITH thu AS (
  SELECT * FROM (VALUES
    ('p:7|38|đen', 'active', 1, 500000),
    ('p:7|38|đen', 'active', 3, 300000)
  ) AS t(stock_key, source, qty, cost)
)
SELECT stock_key,
       sum(qty)::int AS tong_sl,
       round(sum(qty::numeric * cost) / sum(qty))::int AS binh_quan
  FROM thu GROUP BY stock_key, source;
-- Kỳ vọng: trả về ĐÚNG MỘT DÒNG, tong_sl = 4, binh_quan = 350000
--   (1×500000 + 3×300000) / 4 = 350000 — khớp weightedAvgCost().
--
-- ĐỪNG dùng count(*) để đếm số dòng tồn ở đây: sau GROUP BY, count(*) đếm số
-- dòng NHẬP trong một nhóm (= 2), không phải số nhóm. Số dòng tồn là số DÒNG
-- KẾT QUẢ mà câu này trả về.
```

Ghi kết quả hai phép kiểm này vào phần mô tả commit. Sửa `_addStock` lần sau thì chạy lại đúng hai câu này.

- [ ] **Step 6: Kiểm bằng preview trên dữ liệu thật**

1. Tạo đơn `nhap_kho` cho mẫu đã ghim, size `38` — đẩy tới `Về kho`.
2. Vào `/inventory`: có một dòng, số lượng 1.
3. Tạo đơn `nhap_kho` cùng mẫu, size `42` — đẩy tới `Về kho`.
4. Vào `/inventory`: phải có **HAI** dòng, mỗi dòng 1. (Trước v9-A đây là một dòng "2 đôi".)
5. Tạo đơn `nhap_kho` cùng mẫu, size `38` lần nữa → dòng size 38 lên 2, vẫn hai dòng.
6. Kiểm dòng tồn **cũ** (có từ trước) vẫn hiện đủ, số lượng không đổi.

- [ ] **Step 7: Typecheck, test, commit**

```bash
npx tsc --noEmit && npm test
git add src/db/queries.ts "src/app/(app)/products/actions.ts"
git commit -m "$(cat <<'EOF'
tồn kho: gom theo stock_key nên phân biệt được size và màu

_addStock đổi đúng một dòng WHERE; applyStockIn không đụng một chữ.
Phép kiểm VALUES: khác size ra 2 dòng; cùng size cùng màu ra 1 dòng,
bình quân (1×500000 + 3×300000)/4 = 350000 — khớp weightedAvgCost.
deleteProduct bật thật, chặn khi còn tồn > 0.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Màn Kho hiện biến thể, nhập kho chọn từ danh mục

**Files:**
- Modify: `src/db/queries.ts` (`listInventory` trả thêm cột mới)
- Modify: `src/app/(app)/inventory/page.tsx`
- Modify: `src/app/(app)/inventory/inventory-row.tsx`
- Modify: `src/app/(app)/inventory/stock-in-sheet.tsx`
- Modify: `src/app/(app)/inventory/actions.ts` (`stockInAction` nhận `productId`/`size`/`color`)

**Interfaces:**
- Consumes: `ProductGrid`/`ProductPick` (Task 6); `displayVariant` (Task 1); `_addStock` mới (Task 12)
- Produces: không có task nào sau đây

- [ ] **Step 1: `listInventory` trả cột mới**

Trong `src/db/queries.ts`, `listInventory` đang dùng Drizzle `db.select().from(inventory)` nên ba cột mới tự có sau khi schema cập nhật (Task 11). Không phải sửa gì — xác nhận bằng cách đọc lại hàm.

- [ ] **Step 2: Dòng tồn hiện `tên · size · màu`**

`InventoryRow` dựng dòng bằng `<ListRow title meta amount>` — không có markup tên riêng để chèn vào, nên biến thể đi vào `title` và nhãn "chưa gắn danh mục" đi vào `meta`.

Trong `src/app/(app)/inventory/inventory-row.tsx`, thêm import:

```tsx
import { displayVariant } from "@/lib/product-catalog";
```

Thêm ba prop vào chữ ký (cả phần type):

```tsx
export function InventoryRow({
  id,
  productName,
  quantity,
  avgCost,
  photos,
  size,
  color,
  hasProduct,
}: {
  id: number;
  productName: string;
  quantity: number;
  avgCost: number;
  photos: { id: number; label: PhotoLabel }[];
  size: string;
  color: string;
  hasProduct: boolean;
}) {
  const [open, setOpen] = useState(false);
  const variant = displayVariant({ size, color });
  const label = variant === "" ? productName : `${productName} · ${variant}`;
```

Rồi dùng `label` cho cả dòng lẫn tiêu đề Sheet:

```tsx
      <ListRow
        onClick={() => setOpen(true)}
        title={label}
        meta={hasProduct ? `Còn ${quantity}` : `Còn ${quantity} · chưa gắn danh mục`}
        amount={`${formatVnd(avgCost)}/cái`}
      />

      <Sheet open={open} title={label} onClose={() => setOpen(false)}>
```

Và trong `src/app/(app)/inventory/page.tsx`, truyền thêm ba prop vào `<InventoryRow …>`:

```tsx
                  size={it.size}
                  color={it.color}
                  hasProduct={it.productId !== null}
```

- [ ] **Step 3: Sheet nhập kho chọn từ danh mục**

Form hiện dùng ô KHÔNG kiểm soát (`name=` + `defaultValue`). Chọn từ danh mục thì phải điền sẵn được, nên tên và giá ¥ chuyển sang ô có kiểm soát. Thay toàn bộ `src/app/(app)/inventory/stock-in-sheet.tsx`:

```tsx
"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/app/_components/sheet";
import { ProductGrid, type ProductPick } from "@/app/(app)/products/product-grid";
import { stockInAction, type StockInState } from "./actions";

export function StockInSheet({
  defaultRate,
  products,
}: {
  defaultRate: number;
  products: ProductPick[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<StockInState, FormData>(
    stockInAction,
    {},
  );

  const [picked, setPicked] = useState<ProductPick | null>(null);
  const [name, setName] = useState("");
  const [cny, setCny] = useState("");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");

  // Lưu xong (không lỗi, không còn chạy) thì đóng sheet và nạp lại tồn kho.
  useEffect(() => {
    if (!pending && !state.error && open) {
      setOpen(false);
      router.refresh();
    }
    // Chỉ phản ứng khi lượt gửi vừa kết thúc.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  // Mở lại phải sạch — không có dòng này thì lần mở sau vẫn giữ mẫu lần trước.
  useEffect(() => {
    if (!open) return;
    setPicked(null);
    setName("");
    setCny("");
    setSize("");
    setColor("");
  }, [open]);

  function choose(p: ProductPick) {
    setPicked(p);
    setName(p.name);
    setCny(p.defaultUnitPriceCny > 0 ? String(p.defaultUnitPriceCny) : "");
    setSize(p.sizes.length === 1 ? p.sizes[0] : "");
    setColor(p.colors.length === 1 ? p.colors[0] : "");
  }

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
        {/* Bước chọn mẫu nằm NGOÀI <form>: bấm một nút trong form là submit. */}
        {products.length > 0 && picked === null && (
          <>
            <ProductGrid
              products={products}
              emptyText="Danh mục còn trống."
              onPick={choose}
            />
            <p className="muted small">Hoặc gõ tay bên dưới.</p>
          </>
        )}

        <form action={formAction} id="stock-in-form">
          {state.error && <div className="error">{state.error}</div>}

          <input type="hidden" name="productId" value={picked?.id ?? ""} />

          <label className="field">
            <span>Tên hàng *</span>
            <input
              name="productName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
              enterKeyHint="next"
            />
          </label>

          {/* Chip chỉ hiện khi mẫu có sẵn dãy; gõ tay thì vẫn là ô trống. */}
          <label className="field">
            <span>Size</span>
            {picked && picked.sizes.length > 0 && (
              <div className="chip-row">
                {picked.sizes.map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    className={`chip${size === sz ? " chip-on" : ""}`}
                    onClick={() => setSize(size === sz ? "" : sz)}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            )}
            <input
              name="size"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              placeholder="VD: 40"
              enterKeyHint="next"
            />
          </label>

          <label className="field">
            <span>Màu</span>
            {picked && picked.colors.length > 0 && (
              <div className="chip-row">
                {picked.colors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`chip${color === c ? " chip-on" : ""}`}
                    onClick={() => setColor(color === c ? "" : c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
            <input
              name="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="VD: đen"
              enterKeyHint="next"
            />
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
            <input
              name="unitPriceCny"
              inputMode="decimal"
              value={cny}
              onChange={(e) => setCny(e.target.value)}
              enterKeyHint="done"
            />
          </label>

          <details className="more-fields">
            <summary>
              Tỷ giá (mặc định {defaultRate.toLocaleString("vi-VN")})
            </summary>
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

Trong `src/app/(app)/inventory/page.tsx`, thêm `listProducts()` vào `Promise.all` đang có và truyền xuống:

```tsx
import { listProducts } from "@/db/products";
```

```tsx
  const [session, rows, settings, products] = await Promise.all([
    requireAuth(),
    listInventory(),
    getSettings(),
    listProducts(),
  ]);
```

```tsx
        <StockInSheet
          defaultRate={settings.sellRate}
          products={products.map((p) => ({
            id: p.id,
            name: p.name,
            sizes: p.sizes,
            colors: p.colors,
            defaultSellVnd: p.defaultSellVnd,
            defaultUnitPriceCny: p.defaultUnitPriceCny,
            productUrl: p.productUrl,
            photoIds: p.photoIds,
          }))}
        />
```

- [ ] **Step 4: `stockInAction` chuyển ba trường xuống `createOrder`**

Trong `src/app/(app)/inventory/actions.ts`:

```ts
  const productIdRaw = parseVnd(formData.get("productId"));
  const productId = productIdRaw > 0 ? productIdRaw : null;
  const size = String(formData.get("size") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim();
```

và trong lời gọi `createOrder`:

```ts
    items: [
      { name, quantity, unitPriceCny, marginVnd: 0, productId, size, color },
    ],
```

Bổ sung `size`/`color` vào `detail` của `logActivity`:

```ts
    detail: { ten: name, soLuong: quantity, size, mau: color },
```

- [ ] **Step 5: Kiểm bằng preview**

1. Vào `/inventory`, bấm `+` → lưới danh mục hiện ra; chọn một mẫu, chọn size `40`, nhập số lượng 2.
2. Sau khi lưu: dòng tồn hiện `<tên> · 40`.
3. Nhập tiếp cùng mẫu size `41` → dòng thứ hai riêng.
4. Dòng tồn cũ (từ trước v9-A) hiện nhãn "chưa gắn danh mục" và số lượng không đổi.
5. Thử xoá ở `/products` một mẫu còn tồn > 0 → bị chặn kèm lý do.
6. Đăng nhập bằng tài khoản `member` → nút Xoá ẩn; tạm bỏ điều kiện ẩn rồi bấm thật → server vẫn chặn. Không chỉ nhìn giao diện.

- [ ] **Step 6: Typecheck, test, commit, push**

```bash
npx tsc --noEmit && npm test
git add "src/app/(app)/inventory" src/db/queries.ts
git commit -m "$(cat <<'EOF'
tồn kho: màn Kho hiện size/màu, nhập kho chọn từ danh mục

Dòng tồn cũ mang nhãn "chưa gắn danh mục" để dọn dần, số lượng giữ nguyên.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
git push
```

---

## Nghiệm thu cuối

- [ ] `npm test` xanh, trong đó có `product-catalog`, `inventory` (stockKey), `activity-coverage`, `screen-meta`.
- [ ] `npx tsc --noEmit` sạch.
- [ ] Cửa đăng nhập vẫn trả 307 (vùng điều hướng có bị đụng ở Task 6):

```bash
curl -s -o /dev/null -w '%{http_code}\n' --max-redirs 0 https://hey-p.vercel.app/
```

Kỳ vọng: `307`. Ra `200` là hỏng cửa đăng nhập — xem gotcha `loading.tsx` trong CLAUDE.md.

- [ ] Ảnh danh mục còn nguyên sau hơn 24h (job dọn mồ côi đã được vá ở Task 3). Kiểm lại bằng cách mở `/products` một ngày sau khi lên production.
- [ ] Cập nhật CLAUDE.md: thêm v9-A vào dòng trạng thái, và thêm hai gotcha mới — (a) job dọn ảnh mồ côi phải có `product_id IS NULL`; (b) `stockKey` nhánh `n:` cố ý không tách size để khớp backfill.
