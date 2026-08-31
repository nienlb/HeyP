"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  changeOrderStatus,
  createOrder,
  getSettings,
  sellFromStock,
} from "@/db/queries";

function num(v: FormDataEntryValue | null): number {
  const n = Number(String(v ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export type SellState = { error?: string };

export async function sellFromStockAction(
  _prev: SellState,
  formData: FormData,
): Promise<SellState> {
  const session = await getSession();
  if (!session) return { error: "Phiên đăng nhập đã hết hạn." };

  const inventoryId = num(formData.get("inventoryId"));
  const quantity = num(formData.get("quantity"));
  const salePriceVnd = num(formData.get("salePrice"));
  const deposit = num(formData.get("deposit"));
  const newName = String(formData.get("customerName") ?? "").trim();

  if (!inventoryId) return { error: "Thiếu mã hàng." };
  if (quantity <= 0) return { error: "Số lượng bán phải lớn hơn 0." };
  if (salePriceVnd <= 0) return { error: "Giá bán phải lớn hơn 0." };

  const result = await sellFromStock({
    inventoryId,
    quantity,
    salePriceVnd,
    deposit,
    newCustomer: newName ? { name: newName } : null,
    changedBy: session.username,
  });

  if (!result.ok) return { error: result.reason };

  revalidatePath("/inventory");
  revalidatePath("/orders");
  redirect(`/orders/${result.orderId}`);
}

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
