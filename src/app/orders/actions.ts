"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  changeOrderStatus,
  createOrder,
  linkPhotoToOrder,
  markLineDefect,
  returnLine,
  type NewOrderItemInput,
} from "@/db/queries";
import { validateLineItem, validateOrderMoney } from "@/lib/money";
import {
  ORDER_TYPES,
  ORDER_STATUSES,
  type OrderStatus,
  type OrderType,
} from "@/lib/order-status";

function num(v: FormDataEntryValue | null): number {
  const n = Number(String(v ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export type CreateOrderState = { error?: string };

export async function createOrderAction(
  _prev: CreateOrderState,
  formData: FormData,
): Promise<CreateOrderState> {
  const session = await getSession();
  if (!session) return { error: "Phiên đăng nhập đã hết hạn." };

  const orderTypeRaw = String(formData.get("orderType") ?? "order_ho");
  const orderType = (ORDER_TYPES as readonly string[]).includes(orderTypeRaw)
    ? (orderTypeRaw as OrderType)
    : "order_ho";

  const exchangeRate = num(formData.get("exchangeRate"));
  const serviceFee = num(formData.get("serviceFee"));
  const shippingFee = num(formData.get("shippingFee"));
  const deposit = num(formData.get("deposit"));
  const note = String(formData.get("note") ?? "").trim() || null;

  // Khách hàng: chọn có sẵn hoặc tạo mới.
  const customerMode = String(formData.get("customerMode") ?? "existing");
  let customerId: number | null = null;
  let newCustomer: { name: string; phone?: string; address?: string } | null =
    null;
  if (customerMode === "new") {
    const name = String(formData.get("newCustomerName") ?? "").trim();
    if (!name) return { error: "Chưa nhập tên khách mới." };
    newCustomer = {
      name,
      phone: String(formData.get("newCustomerPhone") ?? "").trim() || undefined,
      address:
        String(formData.get("newCustomerAddress") ?? "").trim() || undefined,
    };
  } else {
    customerId = num(formData.get("customerId")) || null;
    if (!customerId) return { error: "Chưa chọn khách hàng." };
  }

  // Sản phẩm.
  let items: NewOrderItemInput[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("items") ?? "[]"));
    if (Array.isArray(parsed)) {
      items = parsed
        .map((it) => ({
          name: String(it.name ?? "").trim(),
          productUrl: String(it.productUrl ?? "").trim() || null,
          attributes: String(it.attributes ?? "").trim() || null,
          quantity: Number(it.quantity) || 0,
          unitPriceCny: Number(it.unitPriceCny) || 0,
        }))
        .filter((it) => it.name !== "");
    }
  } catch {
    return { error: "Dữ liệu sản phẩm không hợp lệ." };
  }

  if (items.length === 0)
    return { error: "Cần ít nhất 1 dòng sản phẩm có tên." };

  for (const it of items) {
    if (validateLineItem(it).length > 0)
      return {
        error: `Sản phẩm "${it.name}": số lượng và đơn giá phải lớn hơn 0.`,
      };
  }

  const moneyErrors = validateOrderMoney({
    goodsTotalCny: 0,
    exchangeRate,
    serviceFee,
    shippingFee,
    deposit,
  });
  if (moneyErrors.length > 0)
    return { error: moneyErrors.map((e) => e.message).join("; ") };

  let orderId: number;
  try {
    orderId = createOrder({
      customerId,
      newCustomer,
      orderType,
      exchangeRate,
      serviceFee,
      shippingFee,
      deposit,
      note,
      items,
      changedBy: session.username,
    });
  } catch (err) {
    return { error: `Không tạo được đơn: ${(err as Error).message}` };
  }

  // Gắn ảnh chốt đơn Zalo (nếu tạo đơn từ ảnh) vào đơn vừa tạo.
  const zaloPhotoId = Number(formData.get("zaloPhotoId"));
  if (zaloPhotoId > 0) {
    try {
      linkPhotoToOrder(zaloPhotoId, orderId);
    } catch {
      // không chặn tạo đơn nếu gắn ảnh lỗi
    }
  }

  revalidatePath("/orders");
  redirect(`/orders/${orderId}`);
}

export async function changeStatusAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const orderId = Number(formData.get("orderId"));
  const toRaw = String(formData.get("to") ?? "");
  if (!orderId || !(ORDER_STATUSES as readonly string[]).includes(toRaw)) {
    redirect(`/orders/${orderId}?err=${encodeURIComponent("Yêu cầu không hợp lệ")}`);
  }

  const result = changeOrderStatus(
    orderId,
    toRaw as OrderStatus,
    session.username,
  );

  if (!result.ok) {
    redirect(`/orders/${orderId}?err=${encodeURIComponent(result.reason)}`);
  }

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  redirect(`/orders/${orderId}`);
}

/** Ngoại lệ theo dòng: đánh lỗi NCC / đổi trả → tách khỏi đơn + nhập kho. */
export async function lineExceptionAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const orderId = Number(formData.get("orderId"));
  const itemId = Number(formData.get("itemId"));
  const kind = String(formData.get("kind") ?? "");
  if (!orderId || !itemId) redirect(`/orders/${orderId}`);

  const result =
    kind === "defect"
      ? markLineDefect(orderId, itemId)
      : kind === "return"
        ? returnLine(orderId, itemId)
        : ({ ok: false, reason: "Loại thao tác không hợp lệ" } as const);

  if (!result.ok) {
    redirect(`/orders/${orderId}?err=${encodeURIComponent(result.reason)}`);
  }

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/inventory");
  redirect(`/orders/${orderId}`);
}
