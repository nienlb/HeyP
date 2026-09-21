"use server";

import { revalidatePath } from "next/cache";
import { getSession, requireAdmin } from "@/lib/auth";
import { deletePhotoFile } from "@/lib/storage";
import {
  createProduct,
  deleteProduct,
  findProductsByName,
  getProduct,
  updateProduct,
  type ProductInput,
} from "@/db/products";
import { copyPhotosToProduct, copyProductPhotos } from "@/db/product-photos";
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
 * Guard "còn tồn > 0" nằm trong `deleteProduct`, TRONG transaction sau
 * `SELECT … FOR UPDATE` — kiểm ngoài transaction có kẽ hở: giữa lúc kiểm và
 * lúc xoá, người kia có thể vừa nhập kho cho đúng mẫu đó.
 */
export async function deleteProductAction(
  _prev: DeleteProductState,
  formData: FormData,
): Promise<DeleteProductState> {
  const session = await requireAdmin();
  const id = parseVnd(formData.get("id"));
  if (!id) return { error: "Thiếu mã sản phẩm." };

  const res = await deleteProduct(id);
  if (!res.ok) return { error: res.reason };

  // Dọn file ảnh trên Storage SAU khi mẫu đã xoá thành công (xem deleteProduct).
  // Xoá file hỏng thì KHÔNG được làm hỏng việc xoá mẫu: mẫu đã mất rồi, chỉ
  // còn file mồ côi — chấp nhận, nhưng ghi vào nhật ký để còn biết mà dọn.
  const orphaned: string[] = [];
  for (const file of res.photoFiles) {
    try {
      await deletePhotoFile(file);
    } catch {
      orphaned.push(file);
    }
  }

  await logActivity({
    actor: session.username,
    action: "product.delete",
    entityId: id,
    detail:
      res.photoFiles.length > 0
        ? { anh: res.photoFiles.length, fileLoi: orphaned }
        : undefined,
  });
  revalidatePath("/products");
  return { ok: true };
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
 *
 * Ảnh của món được CHÉP sang mẫu (v9-C), bản gốc vẫn ở lại với món. Trước
 * đây hàm này bỏ ảnh nên mẫu tạo từ đơn không bao giờ có ảnh.
 */
export async function quickSaveProductAction(input: {
  name: string;
  size: string;
  color: string;
  sellPriceVnd: number;
  unitPriceCny: number;
  productUrl: string | null;
  /** Ảnh đang gắn với món trên form (dòng photos mồ côi, chưa thuộc đơn). */
  photoIds: number[];
}): Promise<
  | { productId: number; photosCopied: number; photosTotal: number }
  | { error: string }
> {
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

  // Mẫu tạo trước, ảnh chép sau: chép hỏng một ảnh không làm mất cả mẫu.
  const photos = await copyPhotosToProduct(productId, input.photoIds ?? []);

  await logActivity({
    actor: session.username,
    action: "product.create",
    entityId: productId,
    detail: { ten: name, op: "quick_save", anh: photos.copied },
  });
  revalidatePath("/products");
  return {
    productId,
    photosCopied: photos.copied,
    photosTotal: photos.total,
  };
}
