"use server";

import { revalidatePath } from "next/cache";
import { getSession, requireAdmin } from "@/lib/auth";
import {
  copyProductPhotos,
  createProduct,
  findProductsByName,
  getProduct,
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
 * Chữ ký hợp với `useActionState` ngay từ chặng 1 để chặng 2 chỉ phải đổi
 * THÂN hàm, không đổi kiểu — đổi kiểu giữa chừng thì mọi nơi gọi phải sửa theo.
 *
 * CHẶNG 1 CỐ Ý CHƯA GỌI `deleteProduct`: hàm đó truy vấn `inventory.product_id`,
 * cột chỉ có từ chặng 2. Tạm ẩn mẫu thay vì xoá cứng.
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

/** Tạm ẩn thay cho xoá cứng ở chặng 1. Chặng 2 thay bằng deleteProduct(). */
async function deactivateProduct(id: number): Promise<void> {
  const { raw } = await import("@/db/raw");
  await raw.run("UPDATE products SET active = false WHERE id = ?", [id]);
}

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
 * Ảnh của món KHÔNG bị lấy đi: mẫu mới được chép ảnh riêng khi dùng lại.
 * Ở đây chỉ lưu chữ và giá.
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
