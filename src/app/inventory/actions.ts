"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { sellFromStock } from "@/db/queries";

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

  const result = sellFromStock({
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
