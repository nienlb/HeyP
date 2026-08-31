"use client";

import { useActionState, useMemo, useState } from "react";
import {
  createOrderAction,
  suggestCnyAction,
  type CreateOrderState,
} from "../actions";
import { computeOrderMoney, sumLineItemsCny } from "@/lib/money";
import { formatVnd } from "@/lib/format";
import { suggestCnyFromTotal } from "@/lib/line-pricing";
import type { ShipStatus } from "@/lib/order-gaps";
import {
  ORDER_TYPES,
  ORDER_TYPE_LABELS,
  type OrderType,
} from "@/lib/order-status";
import { itemAttributes, type ZaloExtract } from "@/lib/zalo-extract";
import { mergeItems, mergeMoneyFields } from "@/lib/zalo-merge";
import { StickyBar } from "../../_components/sticky-bar";
import { CustomerSheet, type CustomerPick } from "./customer-sheet";
import { ItemSheet } from "./item-sheet";
import { emptyItem, type CustomerOption, type ItemRow } from "./types";

export function NewOrderForm({
  customers,
  defaultExchangeRate,
  defaultMarginVnd,
}: {
  customers: CustomerOption[];
  defaultExchangeRate: number;
  defaultMarginVnd: number;
}) {
  const [state, formAction, pending] = useActionState<
    CreateOrderState,
    FormData
  >(createOrderAction, {});

  const [orderType, setOrderType] = useState<OrderType>("order_ho");
  const [exchangeRate, setExchangeRate] = useState(String(defaultExchangeRate));
  const [quotedTotal, setQuotedTotal] = useState("");
  const [shipStatus, setShipStatus] = useState<ShipStatus>("unknown");
  const [shippingFee, setShippingFee] = useState("");
  const [deposit, setDeposit] = useState("");
  const [items, setItems] = useState<ItemRow[]>([]);

  const [picked, setPicked] = useState<CustomerPick | null>(
    customers[0]
      ? { mode: "existing", id: customers[0].id, name: customers[0].name }
      : null,
  );
  const [customerSheet, setCustomerSheet] = useState(false);
  // SĐT/địa chỉ vẫn là state riêng, nằm ở khối gập trong màn chính.
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerAddress, setNewCustomerAddress] = useState("");

  const [itemSheet, setItemSheet] = useState<
    { open: false } | { open: true; index: number | null }
  >({ open: false });

  const num = (s: string) => Number(String(s).replace(/[.,\s]/g, "")) || 0;

  /** 4520000 → "4.520.000". Chuỗi rỗng giữ nguyên rỗng. */
  function groupDigits(s: string): string {
    if (s.trim() === "") return s;
    const n = Number(String(s).replace(/[.,\s]/g, ""));
    return Number.isFinite(n) ? n.toLocaleString("vi-VN") : s;
  }

  /** Áp một patch (từ mergeMoneyFields) vào state form — chỉ set trường có mặt. */
  function applyMoneyPatch(patch: ReturnType<typeof mergeMoneyFields>["patch"]) {
    if (patch.newCustomerName !== undefined && patch.newCustomerName !== "")
      setPicked({ mode: "new", name: patch.newCustomerName });
    if (patch.newCustomerPhone !== undefined)
      setNewCustomerPhone(patch.newCustomerPhone);
    if (patch.newCustomerAddress !== undefined)
      setNewCustomerAddress(patch.newCustomerAddress);
    if (patch.quotedTotal !== undefined) setQuotedTotal(patch.quotedTotal);
    if (patch.deposit !== undefined) setDeposit(patch.deposit);
    if (patch.shipStatus !== undefined) setShipStatus(patch.shipStatus);
    if (patch.shippingFee !== undefined) setShippingFee(patch.shippingFee);
  }

  /**
   * Gợi ý giá ¥ cho sản phẩm đọc được rồi gộp vào danh sách hiện có.
   *
   * `currentTotalStr` truyền tay (KHÔNG đọc state `quotedTotal` qua closure):
   * hàm này chạy trong vòng lặp đọc ảnh của ZaloDropzone, và React không cập
   * nhật lại closure của một async function đang chạy dở dù đã setQuotedTotal
   * ở ảnh trước — dùng biến cục bộ theo dõi xuyên suốt vòng lặp mới đúng.
   */
  async function applyItemsFromExtract(
    order: ZaloExtract,
    currentTotalStr: string,
  ) {
    let fromHistory: (number | null)[] = order.items.map(() => null);
    try {
      fromHistory = await suggestCnyAction(order.items.map((it) => it.name));
    } catch {
      // Tra lịch sử hỏng thì vẫn còn cách suy ngược — không chặn.
    }
    const totalForFallback = order.totalVnd ?? num(currentTotalStr);
    const fallbackCny = suggestCnyFromTotal(
      totalForFallback,
      order.items.length,
      defaultExchangeRate,
      defaultMarginVnd,
    );

    const newRows: ItemRow[] = order.items.map((it, i) => {
      const cny = fromHistory[i] ?? fallbackCny;
      return {
        name: it.name,
        productUrl: "",
        attributes: itemAttributes(it),
        quantity: String(it.quantity || 1),
        unitPriceCny: cny > 0 ? String(cny) : "",
        costConfirmed: false,
      };
    });
    setItems((prev) => mergeItems(prev, newRows));
  }

  /**
   * Cầu nối cho QuickImportSheet: một ảnh đọc xong thì áp patch tiền/khách
   * vào state form và gộp sản phẩm đọc được, rồi trả về Total mới nhất để
   * theo dõi xuyên suốt vòng lặp nhiều ảnh của nó.
   */
  async function onExtract(
    order: ZaloExtract,
    currentTotalStr: string,
  ): Promise<string> {
    const { patch } = mergeMoneyFields(order);
    applyMoneyPatch(patch);
    const currentTotal =
      patch.quotedTotal !== undefined ? patch.quotedTotal : currentTotalStr;
    if (order.items.length > 0) {
      await applyItemsFromExtract(order, currentTotal);
    }
    return currentTotal;
  }

  const parsedItems = useMemo(
    () =>
      items.map((it) => ({
        name: it.name.trim(),
        productUrl: it.productUrl.trim(),
        attributes: it.attributes.trim(),
        quantity: num(it.quantity),
        unitPriceCny: num(it.unitPriceCny),
        costConfirmed: it.costConfirmed,
      })),
    [items],
  );

  const validItems = parsedItems.filter((it) => it.name !== "");
  const goodsTotalCny = sumLineItemsCny(validItems);
  const goodsVnd = Math.round(goodsTotalCny * num(exchangeRate));

  // Total là dữ kiện. Chưa nhập thì suy từ giá vốn + lời mặc định mỗi món.
  const totalVnd =
    quotedTotal.trim() !== ""
      ? num(quotedTotal)
      : goodsVnd + defaultMarginVnd * Math.max(validItems.length, 1);

  // Lời = phần dư. Có thể âm — đơn lỗ là chuyện có thật.
  const marginVnd = totalVnd - goodsVnd;

  const money = computeOrderMoney({
    goodsTotalCny,
    exchangeRate: num(exchangeRate),
    serviceFee: marginVnd,
    shippingFee: num(shippingFee),
    deposit: num(deposit),
  });

  // KHÔNG bắt buộc có khách: đơn từ ảnh chốt thường chưa có thông tin khách.
  // Giá ¥ cũng không bắt buộc — chưa biết thì toàn bộ Total nằm ở lời,
  // đơn mang cờ "thiếu giá vốn" để nhắc bổ sung sau.
  const canSubmit =
    validItems.length > 0 &&
    validItems.every((it) => it.quantity > 0) &&
    num(exchangeRate) > 0 &&
    totalVnd > 0;

  function handleShippingFeeChange(v: string) {
    setShippingFee(v);
    // Gõ số vào = đã biết ship; xoá trắng = quay lại "chưa biết".
    setShipStatus(v.trim() === "" ? "unknown" : "set");
  }

  function saveItem(row: ItemRow, addAnother: boolean) {
    setItems((prev) => {
      if (!itemSheet.open || itemSheet.index === null) return [...prev, row];
      return prev.map((it, i) => (i === itemSheet.index ? row : it));
    });
    // Thêm liên tiếp: giữ sheet ở chế độ "thêm mới" cho món kế tiếp.
    if (addAnother) setItemSheet({ open: true, index: null });
  }

  function deleteItem() {
    if (!itemSheet.open || itemSheet.index === null) return;
    const i = itemSheet.index;
    setItems((prev) => prev.filter((_, idx) => idx !== i));
    setItemSheet({ open: false });
  }

  return (
    <>
      <form action={formAction} className="order-form" id="new-order-form">
        {state.error && <div className="error">{state.error}</div>}

        <input type="hidden" name="items" value={JSON.stringify(parsedItems)} />
        <input type="hidden" name="quotedTotalVnd" value={totalVnd} />
        <input type="hidden" name="shipStatus" value={shipStatus} />
        <input type="hidden" name="customerMode" value={picked?.mode ?? "new"} />
        {picked?.mode === "existing" && (
          <input type="hidden" name="customerId" value={picked.id} />
        )}
        {picked?.mode === "new" && (
          <input type="hidden" name="newCustomerName" value={picked.name} />
        )}

        <h2 className="sec-label">Khách</h2>
        <button
          type="button"
          className="picker"
          onClick={() => setCustomerSheet(true)}
        >
          {picked ? picked.name : "+ Chọn khách"}
        </button>

        {picked?.mode === "new" && (
          <details className="more-fields">
            <summary>Thêm SĐT / địa chỉ</summary>
            <label className="field">
              <span>SĐT / Zalo</span>
              <input
                name="newCustomerPhone"
                type="tel"
                inputMode="tel"
                value={newCustomerPhone}
                onChange={(e) => setNewCustomerPhone(e.target.value)}
                placeholder="09..."
              />
            </label>
            <label className="field">
              <span>Địa chỉ giao</span>
              <input
                name="newCustomerAddress"
                value={newCustomerAddress}
                onChange={(e) => setNewCustomerAddress(e.target.value)}
              />
            </label>
          </details>
        )}

        <h2 className="sec-label">Món ({validItems.length})</h2>
        <div className="item-cards">
          {items.map((it, i) => (
            <button
              key={i}
              type="button"
              className="item-card"
              onClick={() => setItemSheet({ open: true, index: i })}
            >
              <span className="ic-name">{it.name || "(chưa đặt tên)"}</span>
              <span className="ic-meta">
                {it.attributes || "—"} · ×{it.quantity || 0}
              </span>
              <span className="ic-price num">
                {it.unitPriceCny ? `¥${it.unitPriceCny}` : "¥ —"}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="picker"
          onClick={() => setItemSheet({ open: true, index: null })}
        >
          + Thêm món
        </button>

        <h2 className="sec-label">Tiền</h2>
        <label className="field">
          <span>Tổng chốt khách (₫)</span>
          <input
            inputMode="numeric"
            value={quotedTotal}
            onChange={(e) => setQuotedTotal(e.target.value)}
            onFocus={(e) =>
              setQuotedTotal(e.target.value.replace(/[.,\s]/g, ""))
            }
            onBlur={(e) => setQuotedTotal(groupDigits(e.target.value))}
            placeholder={String(totalVnd)}
            enterKeyHint="next"
          />
        </label>
        <label className="field">
          <span>Cọc (₫)</span>
          <input
            name="deposit"
            inputMode="numeric"
            value={deposit}
            onChange={(e) => setDeposit(e.target.value)}
            onFocus={(e) => setDeposit(e.target.value.replace(/[.,\s]/g, ""))}
            onBlur={(e) => setDeposit(groupDigits(e.target.value))}
            enterKeyHint="done"
          />
        </label>

        <details className="more-fields">
          <summary>Tỷ giá · ship · loại đơn</summary>
          <label className="field">
            <span>Tỷ giá (₫/¥)</span>
            <input
              name="exchangeRate"
              inputMode="numeric"
              value={exchangeRate}
              onChange={(e) => setExchangeRate(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Phí ship (₫)</span>
            <input
              name="shippingFee"
              inputMode="numeric"
              value={shippingFee}
              onChange={(e) => handleShippingFeeChange(e.target.value)}
              onFocus={(e) =>
                handleShippingFeeChange(e.target.value.replace(/[.,\s]/g, ""))
              }
              onBlur={(e) => handleShippingFeeChange(groupDigits(e.target.value))}
              placeholder="Chưa biết thì để trống"
            />
          </label>
          <label className="field">
            <span>Loại đơn</span>
            <select
              name="orderType"
              value={orderType}
              onChange={(e) => setOrderType(e.target.value as OrderType)}
            >
              {ORDER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ORDER_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Ghi chú</span>
            <textarea name="note" rows={2} placeholder="Ghi chú nội bộ" />
          </label>
        </details>
      </form>

      <StickyBar>
        <span className="sb-money">
          <span className="sb-label">Tổng</span>
          <strong className="num">{formatVnd(totalVnd)}</strong>
          <span className="sb-label">
            Lời{" "}
            <span className={marginVnd < 0 ? "neg" : ""}>
              {formatVnd(marginVnd)}
            </span>
          </span>
        </span>
        <button
          type="submit"
          form="new-order-form"
          className="btn"
          disabled={!canSubmit || pending}
        >
          {pending ? "Đang lưu…" : "Lưu đơn"}
        </button>
      </StickyBar>

      <CustomerSheet
        open={customerSheet}
        onClose={() => setCustomerSheet(false)}
        customers={customers}
        onPick={setPicked}
      />

      <ItemSheet
        open={itemSheet.open}
        onClose={() => setItemSheet({ open: false })}
        initial={
          itemSheet.open && itemSheet.index !== null
            ? items[itemSheet.index]
            : null
        }
        onSave={saveItem}
        onDelete={
          itemSheet.open && itemSheet.index !== null ? deleteItem : undefined
        }
      />
    </>
  );
}
