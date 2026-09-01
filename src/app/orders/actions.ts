"use server";

import { basename } from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { deletePhotoFile } from "@/lib/storage";
import {
  changeOrderStatus,
  createOrder,
  deletePhoto,
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
import { parseDecimal, parseVnd } from "@/lib/parse-number";

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

  const exchangeRate = parseVnd(formData.get("exchangeRate"));
  const shippingFee = parseVnd(formData.get("shippingFee"));
  const deposit = parseVnd(formData.get("deposit"));
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
    customerId = parseVnd(formData.get("customerId")) || null;
  }

  // Sản phẩm.
  let items: NewOrderItemInput[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("items") ?? "[]"));
    if (Array.isArray(parsed)) {
      items = parsed
        .filter((it) => String(it.name ?? "").trim() !== "")
        .map((it) => ({
          name: String(it.name ?? "").trim(),
          productUrl: String(it.productUrl ?? "").trim() || null,
          attributes: String(it.attributes ?? "").trim() || null,
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
    }
  } catch {
    return { error: "Dữ liệu sản phẩm không hợp lệ." };
  }

  if (items.length === 0)
    return { error: "Cần ít nhất 1 dòng sản phẩm có tên." };

  for (const it of items) {
    const errs = validateLineItem(it);
    if (errs.length > 0)
      return {
        error: `Sản phẩm "${it.name}": ${errs.map((e) => e.message).join("; ")}.`,
      };
  }

  // Total đã chốt với khách (không gồm ship). Form gửi thẳng nếu có; form cũ
  // chỉ có ô "lời" nên suy ra: Σ(¥ × tỷ giá) + lời.
  const quotedRaw = formData.get("quotedTotalVnd");
  const quotedTotalVnd =
    quotedRaw !== null
      ? parseVnd(quotedRaw)
      : Math.round(sumLineItemsCny(items) * exchangeRate) +
        parseVnd(formData.get("serviceFee"));

  // Ảnh cấp đơn từ màn nhập nhanh: TẤT CẢ ảnh đã thả, không chỉ ảnh chốt đơn.
  const orderPhotoIds = String(formData.get("zaloPhotoIds") ?? "")
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);

  const moneyErrors = validateOrderMoney({
    goodsTotalCny: 0,
    exchangeRate,
    serviceFee: 0,
    shippingFee,
    deposit,
  });
  if (moneyErrors.length > 0)
    return { error: moneyErrors.map((e) => e.message).join("; ") };

  let created: { orderId: number; itemIds: number[] };
  try {
    created = await createOrder({
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
      orderPhotoIds,
      changedBy: session.username,
    });
  } catch (err) {
    return { error: `Không tạo được đơn: ${(err as Error).message}` };
  }
  const orderId = created.orderId;

  // Mọi ảnh (cấp đơn lẫn cấp món) đã được gắn BÊN TRONG transaction của
  // createOrder — xem NewOrderInput.orderPhotoIds và NewOrderItemInput.photoIds.

  revalidatePath("/orders");
  redirect(`/orders/${orderId}`);
}

export type ChangeStatusResultUi = { ok: true } | { ok: false; reason: string };

/**
 * Không redirect nữa: trả kết quả về client để OrderJourney dùng
 * useOptimistic — bấm là UI đổi ngay, lỗi thì tự bật lại và báo.
 * revalidatePath vẫn gọi để dữ liệu server đồng bộ ở lần render sau.
 */
export async function changeStatusAction(
  orderId: number,
  to: OrderStatus,
): Promise<ChangeStatusResultUi> {
  const session = await getSession();
  if (!session) return { ok: false, reason: "Phiên đăng nhập đã hết hạn." };

  if (!orderId || !(ORDER_STATUSES as readonly string[]).includes(to)) {
    return { ok: false, reason: "Yêu cầu không hợp lệ" };
  }

  const result = await changeOrderStatus(orderId, to, session.username);
  if (!result.ok) return { ok: false, reason: result.reason };

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  return { ok: true };
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
      ? await markLineDefect(orderId, itemId)
      : kind === "return"
        ? await returnLine(orderId, itemId)
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
  const result = await updateLineCost(
    orderId,
    itemId,
    parseDecimal(formData.get("unitPriceCny")),
  );

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
  const result = await updateLineMargin(
    orderId,
    itemId,
    parseVnd(formData.get("marginVnd")),
  );

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

  const result = await setShipFee(
    orderId,
    shipStatus,
    parseVnd(formData.get("shippingFee")),
  );

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
  return Promise.all(names.map((n) => suggestCnyFromHistory(n)));
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

  const result = await addPayment({
    orderId,
    amountVnd: parseVnd(formData.get("amountVnd")),
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
  const result = await deletePayment(paymentId, orderId);

  if (!result.ok)
    redirect(`/orders/${orderId}?err=${encodeURIComponent(result.reason)}`);
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  redirect(`/orders/${orderId}`);
}

/**
 * Xoá một ảnh đã thả lên nhưng chưa gắn đơn nào — dùng khi thả nhầm ở màn
 * tạo đơn từ Zalo (trước khi bấm Lưu đơn). Gọi trực tiếp từ client, không
 * qua <form>, vì đơn chưa tồn tại nên không có orderId để redirect về.
 */
export async function deletePhotoAction(
  photoId: number,
): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session) return { ok: false };

  const removed = await deletePhoto(photoId);
  if (!removed) return { ok: false };

  try {
    await deletePhotoFile(basename(removed.filePath));
  } catch {
    // File đã mất/không tồn tại trên Storage — DB đã sạch là đủ, không chặn.
  }

  return { ok: true };
}

// ---------- Xoá đơn (v6) ----------

import { deleteOrderCascade } from "@/db/deletion";

/**
 * Xoá cứng một đơn. CHỈ admin. Đơn đã có dấu vết tiền/kho bị tầng dưới chặn
 * và trả lý do cụ thể — hiện lại trên chính màn chi tiết đơn.
 */
export async function deleteOrderAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/");

  const orderId = Number(formData.get("orderId"));
  if (!Number.isInteger(orderId) || orderId <= 0) redirect("/orders");

  const result = await deleteOrderCascade(orderId, session.username);
  if (!result.ok) {
    redirect(`/orders/${orderId}?tab=anh&err=${encodeURIComponent(result.reason)}`);
  }

  revalidatePath("/orders");
  redirect("/orders");
}

// ---------- Chuyển bước hàng loạt (v6) ----------

import { raw } from "@/db/raw";
import { planBulkAdvance, BULK_LIMIT } from "@/lib/bulk-status";

export type BulkResult = { ok: number; failed: { id: number; reason: string }[] };

/**
 * Chuyển bước tiếp theo cho nhiều đơn.
 *
 * Chạy TUẦN TỰ, không Promise.all: side-effect ví ¥ là đọc-rồi-ghi (tính lại
 * số dư từ cny_ledger rồi ghi dòng mới), chạy song song sẽ đua nhau. Pool
 * cũng chỉ có max: 5.
 *
 * Mỗi đơn đi qua đúng changeOrderStatus — KHÔNG UPDATE thẳng orders.status —
 * để giữ nguyên side-effect ví/kho, dòng lịch sử, và autoCompleteIfPaid.
 */
export async function bulkAdvanceAction(ids: number[]): Promise<BulkResult> {
  const session = await getSession();
  if (!session)
    return { ok: 0, failed: [{ id: 0, reason: "Phiên đăng nhập đã hết hạn." }] };

  const clean = ids
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, BULK_LIMIT);

  const failed: { id: number; reason: string }[] = [];
  let ok = 0;

  for (const id of clean) {
    // Đọc lại trạng thái ngay trước khi chuyển: kế hoạch dựng ở client có thể
    // đã cũ nếu người kia vừa đổi đơn.
    const row = await raw.get<{ orderType: OrderType; status: OrderStatus }>(
      `SELECT order_type AS "orderType", status FROM orders WHERE id = ?`,
      [id],
    );
    if (!row) {
      failed.push({ id, reason: "Không tìm thấy đơn" });
      continue;
    }
    const plan = planBulkAdvance([
      { id, orderType: row.orderType, status: row.status, goodsTotalCny: 0 },
    ]);
    const to = plan.groups[0]?.to;
    if (!to) {
      failed.push({
        id,
        reason: plan.skipped[0]?.reason ?? "Không có bước tiếp theo",
      });
      continue;
    }

    const result = await changeOrderStatus(id, to, session.username);
    if (result.ok) ok += 1;
    else failed.push({ id, reason: result.reason });
  }

  revalidatePath("/orders");
  return { ok, failed };
}

// ---------- Thêm / xoá món trong đơn đã tạo (v6) ----------

import { addOrderItem, removeOrderItem } from "@/db/queries";

export async function addItemAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const orderId = Number(formData.get("orderId"));
  if (!Number.isInteger(orderId) || orderId <= 0) redirect("/orders");

  const result = await addOrderItem(orderId, {
    name: String(formData.get("name") ?? ""),
    attributes: String(formData.get("attributes") ?? "").trim() || null,
    productUrl: String(formData.get("productUrl") ?? "").trim() || null,
    quantity: parseVnd(formData.get("quantity")),
    sellVnd: parseVnd(formData.get("sellVnd")),
    unitPriceCny: parseDecimal(formData.get("unitPriceCny")),
    costConfirmed: String(formData.get("costConfirmed")) === "true",
    photoIds: String(formData.get("photoIds") ?? "")
      .split(",")
      .map((v) => Number(v.trim()))
      .filter((n) => Number.isInteger(n) && n > 0),
  });

  if (!result.ok) {
    redirect(`/orders/${orderId}?tab=mon&err=${encodeURIComponent(result.reason)}`);
  }
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  redirect(`/orders/${orderId}?tab=mon`);
}

export async function removeItemAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const orderId = Number(formData.get("orderId"));
  const itemId = Number(formData.get("itemId"));
  if (!Number.isInteger(orderId) || !Number.isInteger(itemId)) redirect("/orders");

  const result = await removeOrderItem(orderId, itemId);
  if (!result.ok) {
    redirect(`/orders/${orderId}?tab=mon&err=${encodeURIComponent(result.reason)}`);
  }
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  redirect(`/orders/${orderId}?tab=mon`);
}

// ---------- Sửa khách hàng của đơn (v7) ----------

import { setOrderCustomer, updateCustomerInfo } from "@/db/queries";

/** Gắn/đổi khách cho đơn. Chọn khách có sẵn hoặc tạo khách mới theo tên. */
export async function setOrderCustomerAction(
  formData: FormData,
): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const orderId = parseVnd(formData.get("orderId"));
  if (!Number.isInteger(orderId) || orderId <= 0) redirect("/orders");

  const customerId = parseVnd(formData.get("customerId")) || null;
  const newName = String(formData.get("newCustomerName") ?? "").trim();

  const result = await setOrderCustomer(orderId, {
    customerId,
    newCustomer: newName ? { name: newName } : null,
  });
  if (!result.ok) {
    redirect(`/orders/${orderId}?err=${encodeURIComponent(result.reason)}`);
  }
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/customers");
  redirect(`/orders/${orderId}`);
}

/** Sửa tên/SĐT/địa chỉ khách — đổi cho MỌI đơn của khách đó. */
export async function updateCustomerAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const orderId = parseVnd(formData.get("orderId"));
  const customerId = parseVnd(formData.get("customerId"));
  if (!Number.isInteger(customerId) || customerId <= 0) redirect("/orders");

  const result = await updateCustomerInfo(customerId, {
    name: String(formData.get("name") ?? ""),
    phone: String(formData.get("phone") ?? "").trim() || null,
    address: String(formData.get("address") ?? "").trim() || null,
  });
  if (!result.ok) {
    redirect(`/orders/${orderId}?err=${encodeURIComponent(result.reason)}`);
  }
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/customers");
  redirect(`/orders/${orderId}`);
}

// ---------- Sửa ghi chú và tỷ giá (v7) ----------

import { updateOrderMeta } from "@/db/queries";

export async function updateOrderMetaAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const orderId = parseVnd(formData.get("orderId"));
  if (!Number.isInteger(orderId) || orderId <= 0) redirect("/orders");

  const rateRaw = formData.get("exchangeRate");
  const result = await updateOrderMeta(orderId, {
    note: String(formData.get("note") ?? "").trim() || null,
    // Ô tỷ giá chỉ có mặt khi đơn còn sửa được — không có thì đừng đụng tới.
    exchangeRate: rateRaw === null ? undefined : parseVnd(rateRaw),
  });

  if (!result.ok) {
    redirect(`/orders/${orderId}?err=${encodeURIComponent(result.reason)}`);
  }
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  redirect(`/orders/${orderId}`);
}

// ---------- Sửa chi tiết món (v7) ----------

import { updateOrderItemFields } from "@/db/queries";

export async function updateItemAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const orderId = parseVnd(formData.get("orderId"));
  const itemId = parseVnd(formData.get("itemId"));
  if (!Number.isInteger(orderId) || !Number.isInteger(itemId))
    redirect("/orders");

  const result = await updateOrderItemFields(orderId, itemId, {
    name: String(formData.get("name") ?? ""),
    attributes: String(formData.get("attributes") ?? "").trim() || null,
    productUrl: String(formData.get("productUrl") ?? "").trim() || null,
    quantity: parseVnd(formData.get("quantity")),
    sellVnd: parseVnd(formData.get("sellVnd")),
    unitPriceCny: parseDecimal(formData.get("unitPriceCny")),
    costConfirmed: String(formData.get("costConfirmed")) === "true",
  });

  if (!result.ok) {
    redirect(`/orders/${orderId}?tab=mon&err=${encodeURIComponent(result.reason)}`);
  }
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  redirect(`/orders/${orderId}?tab=mon`);
}

// ---------- Sửa Tổng chốt (v7) ----------

import { setQuotedTotal } from "@/db/queries";

export async function setQuotedTotalAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const orderId = parseVnd(formData.get("orderId"));
  if (!Number.isInteger(orderId) || orderId <= 0) redirect("/orders");

  const result = await setQuotedTotal(
    orderId,
    parseVnd(formData.get("quotedTotalVnd")),
  );
  if (!result.ok) {
    redirect(`/orders/${orderId}?tab=tien&err=${encodeURIComponent(result.reason)}`);
  }
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  redirect(`/orders/${orderId}?tab=tien`);
}
