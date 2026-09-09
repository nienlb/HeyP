import "server-only";
import { NOW_EPOCH_SQL, raw, withTx, type Exec } from "./raw";
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

/** Chỉ nhận ảnh CHƯA thuộc đâu — cùng tinh thần với linkPhotoToOrder. */
async function attachPhotos(
  x: Exec,
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
        reason: `Còn ${stock!.n} món trong kho gắn với mẫu này — bán hết trước, hoặc bỏ cờ "còn dùng" thay vì xoá.`,
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
