"use client";

import { useActionState, useMemo, useState } from "react";
import { createOrderAction, type CreateOrderState } from "../actions";
import { computeOrderMoney, sumLineItemsCny } from "@/lib/money";
import { buildQuoteText, formatVnd } from "@/lib/format";
import { ORDER_TYPES, ORDER_TYPE_LABELS } from "@/lib/order-status";
import { CopyButton } from "../../_components/copy-button";

type ItemRow = {
  name: string;
  productUrl: string;
  attributes: string;
  quantity: string;
  unitPriceCny: string;
};

const emptyItem: ItemRow = {
  name: "",
  productUrl: "",
  attributes: "",
  quantity: "1",
  unitPriceCny: "",
};

export function NewOrderForm({
  customers,
  defaultExchangeRate,
}: {
  customers: { id: number; name: string }[];
  defaultExchangeRate: number;
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
  const [serviceFee, setServiceFee] = useState("");
  const [shippingFee, setShippingFee] = useState("");
  const [deposit, setDeposit] = useState("");
  const [items, setItems] = useState<ItemRow[]>([{ ...emptyItem }]);
  const [customerId, setCustomerId] = useState<string>(
    customers[0] ? String(customers[0].id) : "",
  );
  const [newCustomerName, setNewCustomerName] = useState("");

  const num = (s: string) => Number(String(s).replace(/[,\s]/g, "")) || 0;

  const parsedItems = useMemo(
    () =>
      items.map((it) => ({
        name: it.name.trim(),
        productUrl: it.productUrl.trim(),
        attributes: it.attributes.trim(),
        quantity: num(it.quantity),
        unitPriceCny: num(it.unitPriceCny),
      })),
    [items],
  );

  const validItems = parsedItems.filter((it) => it.name !== "");
  const goodsTotalCny = sumLineItemsCny(validItems);
  const money = computeOrderMoney({
    goodsTotalCny,
    exchangeRate: num(exchangeRate),
    serviceFee: num(serviceFee),
    shippingFee: num(shippingFee),
    deposit: num(deposit),
  });

  const customerName =
    customerMode === "new"
      ? newCustomerName
      : (customers.find((c) => String(c.id) === customerId)?.name ?? "");

  const quote = buildQuoteText({
    customerName,
    items: validItems,
    exchangeRate: num(exchangeRate),
    serviceFee: num(serviceFee),
    shippingFee: num(shippingFee),
    deposit: num(deposit),
  });

  const canSubmit =
    validItems.length > 0 &&
    validItems.every((it) => it.quantity > 0 && it.unitPriceCny > 0) &&
    num(exchangeRate) > 0 &&
    (customerMode === "new" ? newCustomerName.trim() !== "" : customerId !== "");

  function updateItem(i: number, patch: Partial<ItemRow>) {
    setItems((prev) =>
      prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)),
    );
  }
  function addItem() {
    setItems((prev) => [...prev, { ...emptyItem }]);
  }
  function removeItem(i: number) {
    setItems((prev) =>
      prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i),
    );
  }

  return (
    <form action={formAction} className="order-form">
      {state.error && <div className="error">{state.error}</div>}

      {/* Hidden: dữ liệu sản phẩm dạng JSON để server đọc */}
      <input type="hidden" name="items" value={JSON.stringify(parsedItems)} />
      <input type="hidden" name="customerMode" value={customerMode} />

      <div className="two-col">
        <section className="card">
          <h2 className="card-title">Khách hàng</h2>
          <div className="seg">
            <button
              type="button"
              className={customerMode === "existing" ? "seg-on" : ""}
              onClick={() => setCustomerMode("existing")}
              disabled={customers.length === 0}
            >
              Khách có sẵn
            </button>
            <button
              type="button"
              className={customerMode === "new" ? "seg-on" : ""}
              onClick={() => setCustomerMode("new")}
            >
              Khách mới
            </button>
          </div>

          {customerMode === "existing" ? (
            <div className="field">
              <label>Chọn khách</label>
              <select
                name="customerId"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div className="field">
                <label>Tên khách *</label>
                <input
                  name="newCustomerName"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  placeholder="VD: Chị Lan"
                />
              </div>
              <div className="field">
                <label>SĐT / Zalo</label>
                <input name="newCustomerPhone" placeholder="09..." />
              </div>
              <div className="field">
                <label>Địa chỉ giao</label>
                <input name="newCustomerAddress" />
              </div>
            </>
          )}

          <div className="field">
            <label>Loại đơn</label>
            <select
              name="orderType"
              value={orderType}
              onChange={(e) => setOrderType(e.target.value)}
            >
              {ORDER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ORDER_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">Tính tiền</h2>
          <div className="field">
            <label>Tỷ giá (VND / tệ) *</label>
            <input
              name="exchangeRate"
              inputMode="numeric"
              value={exchangeRate}
              onChange={(e) => setExchangeRate(e.target.value)}
            />
          </div>
          <div className="grid-2">
            <div className="field">
              <label>Phí dịch vụ (₫)</label>
              <input
                name="serviceFee"
                inputMode="numeric"
                value={serviceFee}
                onChange={(e) => setServiceFee(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Phí ship (₫)</label>
              <input
                name="shippingFee"
                inputMode="numeric"
                value={shippingFee}
                onChange={(e) => setShippingFee(e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label>Đã cọc (₫)</label>
            <input
              name="deposit"
              inputMode="numeric"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
            />
          </div>

          <div className="money-preview">
            <div className="kv">
              <span>Tiền hàng</span>
              <span>{formatVnd(money.goodsTotalVnd)}</span>
            </div>
            <div className="kv">
              <span>Tạm tính</span>
              <span>{formatVnd(money.subtotalVnd)}</span>
            </div>
            <div className="kv kv-total">
              <span>Còn phải thu</span>
              <strong>{formatVnd(money.amountDue)}</strong>
            </div>
          </div>
        </section>
      </div>

      <section className="card">
        <h2 className="card-title">Sản phẩm</h2>
        <div className="items">
          {items.map((it, i) => (
            <div key={i} className="item-row">
              <input
                placeholder="Tên hàng *"
                value={it.name}
                onChange={(e) => updateItem(i, { name: e.target.value })}
                className="it-name"
              />
              <input
                placeholder="Link"
                value={it.productUrl}
                onChange={(e) => updateItem(i, { productUrl: e.target.value })}
                className="it-url"
              />
              <input
                placeholder="Size/màu"
                value={it.attributes}
                onChange={(e) => updateItem(i, { attributes: e.target.value })}
                className="it-attr"
              />
              <input
                placeholder="SL"
                inputMode="numeric"
                value={it.quantity}
                onChange={(e) => updateItem(i, { quantity: e.target.value })}
                className="it-qty"
              />
              <input
                placeholder="Giá tệ"
                inputMode="decimal"
                value={it.unitPriceCny}
                onChange={(e) => updateItem(i, { unitPriceCny: e.target.value })}
                className="it-price"
              />
              <button
                type="button"
                className="it-del"
                onClick={() => removeItem(i)}
                aria-label="Xoá dòng"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={addItem}>
          + Thêm dòng
        </button>
      </section>

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
        <button
          type="submit"
          className="btn"
          disabled={!canSubmit || pending}
        >
          {pending ? "Đang lưu…" : "Lưu đơn"}
        </button>
      </div>
    </form>
  );
}
