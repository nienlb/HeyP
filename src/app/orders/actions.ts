"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  changeOrderStatus,
  createOrder,
  linkPhotoToOrder,
  addPayment,
  deletePayment,
  markLineDefect,
  returnLine,
  setShipFee,
  suggestCnyFromHistory,
  updateLineCost,
  updateLineMargin,
  type NewOrderItemInput,
} from "@/db/queries";
import {
  sumLineItemsCny,
  validateLineItem,
  validateOrderMoney,
} from "@/lib/money";
import {
  ORDER_TYPES,
  ORDER_STATUSES,
  type OrderStatus,
  type OrderType,
} from "@/lib/order-status";
import type { ShipStatus } from "@/lib/order-gaps";

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
  const shippingFee = num(formData.get("shippingFee"));
  const deposit = num(formData.get("deposit"));
  const note = String(formData.get("note") ?? "").trim() || null;

  const shipStatusRaw = String(formData.get("shipStatus") ?? "");
  const shipStatus: ShipStatus = (
    ["unknown", "free", "set"] as readonly string[]
  ).includes(shipStatusRaw)
    ? (shipStatusRaw as ShipStatus)
    : shippingFee > 0
      ? "set"
      : "unknown";

  // Khách hàng: chọn có sẵn hoặc tạo mới. ĐƯỢC PHÉP để trống —
  // đơn tạo từ ảnh Zalo thường chưa có thông tin khách, cờ "thiếu khách" sẽ nhắc.
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
          // Người gõ tay = đã xác nhận; số AI gợi ý thì form gửi false.
          costConfirmed: it.costConfirmed === true,
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

  // Total đã chốt với khách (không gồm ship). Form gửi thẳng nếu có; form cũ
  // chỉ có ô "lời" nên suy ra: Σ(¥ × tỷ giá) + lời.
  const quotedRaw = formData.get("quotedTotalVnd");
  const quotedTotalVnd =
    quotedRaw !== null
      ? num(quotedRaw)
      : Math.round(sumLineItemsCny(items) * exchangeRate) +
        num(formData.get("serviceFee"));

  const moneyErrors = validateOrderMoney({
    goodsTotalCny: 0,
    exchangeRate,
    serviceFee: 0,
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
      quotedTotalVnd,
      shippingFee,
      shipStatus,
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

/** Nhập/sửa giá ¥ của một dòng — Total giữ nguyên, lời rải lại. */
export async function updateLineCostAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const orderId = Number(formData.get("orderId"));
  const itemId = Number(formData.get("itemId"));
  const result = updateLineCost(orderId, itemId, num(formData.get("unitPriceCny")));

  if (!result.ok)
    redirect(`/orders/${orderId}?err=${encodeURIComponent(result.reason)}`);
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  redirect(`/orders/${orderId}`);
}

/** Kéo lời của một dòng — các dòng khác bù lại. */
export async function updateLineMarginAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const orderId = Number(formData.get("orderId"));
  const itemId = Number(formData.get("itemId"));
  const result = updateLineMargin(orderId, itemId, num(formData.get("marginVnd")));

  if (!result.ok)
    redirect(`/orders/${orderId}?err=${encodeURIComponent(result.reason)}`);
  revalidatePath(`/orders/${orderId}`);
  redirect(`/orders/${orderId}`);
}

/** Nhập phí ship khi hàng về VN, hoặc đánh dấu freeship. */
export async function setShipFeeAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const orderId = Number(formData.get("orderId"));
  const raw = String(formData.get("shipStatus") ?? "set");
  const shipStatus: ShipStatus = (
    ["unknown", "free", "set"] as readonly string[]
  ).includes(raw)
    ? (raw as ShipStatus)
    : "set";

  const result = setShipFee(orderId, shipStatus, num(formData.get("shippingFee")));

  if (!result.ok)
    redirect(`/orders/${orderId}?err=${encodeURIComponent(result.reason)}`);
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  redirect(`/orders/${orderId}`);
}

/**
 * Tra giá ¥ gợi ý cho danh sách tên món (đã từng order thì lấy lần gần nhất
 * đã xác nhận). Trả null cho món chưa từng bán — form sẽ suy ngược từ Total.
 */
export async function suggestCnyAction(
  names: string[],
): Promise<(number | null)[]> {
  const session = await getSession();
  if (!session) return names.map(() => null);
  return names.map((n) => suggestCnyFromHistory(n));
}

function parseDateInput(v: FormDataEntryValue | null): Date {
  const s = String(v ?? "").trim();
  if (s === "") return new Date();
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** Ghi một khoản khách đã trả (cọc / thu nốt / hoàn trả). */
export async function addPaymentAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const orderId = Number(formData.get("orderId"));
  const kindRaw = String(formData.get("kind") ?? "thu_not");
  const kind = (["coc", "thu_not", "hoan_tra"] as readonly string[]).includes(
    kindRaw,
  )
    ? (kindRaw as "coc" | "thu_not" | "hoan_tra")
    : "thu_not";
  const methodRaw = String(formData.get("method") ?? "chuyen_khoan");
  const method = (["chuyen_khoan", "tien_mat"] as readonly string[]).includes(
    methodRaw,
  )
    ? (methodRaw as "chuyen_khoan" | "tien_mat")
    : "chuyen_khoan";

  const result = addPayment({
    orderId,
    amountVnd: num(formData.get("amountVnd")),
    paidAt: parseDateInput(formData.get("paidAt")),
    kind,
    method,
    note: String(formData.get("note") ?? "").trim() || null,
  });

  if (!result.ok)
    redirect(`/orders/${orderId}?err=${encodeURIComponent(result.reason)}`);
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  redirect(`/orders/${orderId}`);
}

export async function deletePaymentAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const orderId = Number(formData.get("orderId"));
  const paymentId = Number(formData.get("paymentId"));
  const result = deletePayment(paymentId, orderId);

  if (!result.ok)
    redirect(`/orders/${orderId}?err=${encodeURIComponent(result.reason)}`);
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  redirect(`/orders/${orderId}`);
}
