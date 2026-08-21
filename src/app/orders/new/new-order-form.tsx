"use client";

import { useActionState, useMemo, useState } from "react";
import {
  createOrderAction,
  suggestCnyAction,
  type CreateOrderState,
} from "../actions";
import { computeOrderMoney, sumLineItemsCny } from "@/lib/money";
import { buildQuoteText } from "@/lib/format";
import { suggestCnyFromTotal } from "@/lib/line-pricing";
import type { ShipStatus } from "@/lib/order-gaps";
import { itemAttributes, type ZaloExtract } from "@/lib/zalo-extract";
import { mergeItems, mergeMoneyFields } from "@/lib/zalo-merge";
import { CopyButton } from "../../_components/copy-button";
import { ZaloDropzone } from "./zalo-dropzone";
import { CustomerBlock } from "./customer-block";
import { MoneyBlock } from "./money-block";
import { ItemsBlock } from "./items-block";
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

  const [customerMode, setCustomerMode] = useState<"existing" | "new">(
    customers.length > 0 ? "existing" : "new",
  );
  const [orderType, setOrderType] = useState<string>("order_ho");
  const [exchangeRate, setExchangeRate] = useState(String(defaultExchangeRate));
  const [quotedTotal, setQuotedTotal] = useState("");
  const [shipStatus, setShipStatus] = useState<ShipStatus>("unknown");
  const [shippingFee, setShippingFee] = useState("");
  const [deposit, setDeposit] = useState("");
  const [items, setItems] = useState<ItemRow[]>([{ ...emptyItem }]);
  const [customerId, setCustomerId] = useState<string>(
    customers[0] ? String(customers[0].id) : "",
  );
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerAddress, setNewCustomerAddress] = useState("");

  const num = (s: string) => Number(String(s).replace(/[,\s]/g, "")) || 0;

  /** Áp một patch (từ mergeMoneyFields) vào state form — chỉ set trường có mặt. */
  function applyMoneyPatch(patch: ReturnType<typeof mergeMoneyFields>["patch"]) {
    if (patch.customerMode) setCustomerMode(patch.customerMode);
    if (patch.newCustomerName !== undefined)
      setNewCustomerName(patch.newCustomerName);
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
   * Cầu nối cho ZaloDropzone: một ảnh đọc xong thì áp patch tiền/khách vào
   * state form và gộp sản phẩm đọc được, rồi trả về Total mới nhất để
   * ZaloDropzone theo dõi xuyên suốt vòng lặp nhiều ảnh của nó.
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

  const selectedCustomer = customers.find((c) => String(c.id) === customerId);
  const customerName =
    customerMode === "new" ? newCustomerName : (selectedCustomer?.name ?? "");

  const quote = buildQuoteText({
    customerName,
    items: validItems,
    exchangeRate: num(exchangeRate),
    serviceFee: marginVnd,
    shippingFee: num(shippingFee),
    deposit: num(deposit),
  });

  // KHÔNG bắt buộc có khách: đơn từ ảnh Zalo thường chưa có thông tin khách.
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

  return (
    <form action={formAction} className="order-form">
      {state.error && <div className="error">{state.error}</div>}

      <input type="hidden" name="items" value={JSON.stringify(parsedItems)} />
      <input type="hidden" name="customerMode" value={customerMode} />
      <input type="hidden" name="quotedTotalVnd" value={totalVnd} />
      <input type="hidden" name="shipStatus" value={shipStatus} />

      <ZaloDropzone quotedTotal={quotedTotal} onExtract={onExtract} />

      <div className="two-col">
        <CustomerBlock
          mode={customerMode}
          onModeChange={setCustomerMode}
          customerId={customerId}
          onCustomerIdChange={setCustomerId}
          name={newCustomerName}
          onNameChange={setNewCustomerName}
          phone={newCustomerPhone}
          onPhoneChange={setNewCustomerPhone}
          address={newCustomerAddress}
          onAddressChange={setNewCustomerAddress}
          customers={customers}
          orderType={orderType}
          onOrderTypeChange={setOrderType}
        />

        <MoneyBlock
          exchangeRate={exchangeRate}
          onExchangeRateChange={setExchangeRate}
          quotedTotal={quotedTotal}
          onQuotedTotalChange={setQuotedTotal}
          totalVnd={totalVnd}
          marginVnd={marginVnd}
          shippingFee={shippingFee}
          onShippingFeeChange={handleShippingFeeChange}
          shipStatus={shipStatus}
          deposit={deposit}
          onDepositChange={setDeposit}
          money={money}
        />
      </div>

      <ItemsBlock items={items} onChange={setItems} />

      <section className="card">
        <h2 className="card-title">Ghi chú</h2>
        <textarea name="note" rows={2} placeholder="Ghi chú nội bộ (nếu có)" />
      </section>

      <div className="form-actions">
        <CopyButton
          text={quote}
          label="Copy báo giá gửi Zalo"
          className="btn btn-ghost"
        />
        <button type="submit" className="btn" disabled={!canSubmit || pending}>
          {pending ? "Đang lưu…" : "Lưu đơn"}
        </button>
      </div>
    </form>
  );
}
