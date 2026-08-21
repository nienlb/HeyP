"use client";

import { ORDER_TYPES, ORDER_TYPE_LABELS } from "@/lib/order-status";
import type { CustomerOption } from "./types";

/**
 * Khối "Khách hàng" — chọn khách có sẵn / khách mới, và loại đơn. Không giữ
 * state riêng, cha truyền giá trị xuống và nhận callback lên để giữ một
 * nguồn chân lý duy nhất ở form.
 */
export function CustomerBlock({
  mode,
  onModeChange,
  customerId,
  onCustomerIdChange,
  name,
  onNameChange,
  phone,
  onPhoneChange,
  address,
  onAddressChange,
  customers,
  orderType,
  onOrderTypeChange,
}: {
  mode: "existing" | "new";
  onModeChange: (mode: "existing" | "new") => void;
  customerId: string;
  onCustomerIdChange: (id: string) => void;
  name: string;
  onNameChange: (name: string) => void;
  phone: string;
  onPhoneChange: (phone: string) => void;
  address: string;
  onAddressChange: (address: string) => void;
  customers: CustomerOption[];
  orderType: string;
  onOrderTypeChange: (type: string) => void;
}) {
  const selectedCustomer = customers.find((c) => String(c.id) === customerId);

  return (
    <section className="card">
      <h2 className="card-title">Khách hàng</h2>
      <div className="seg">
        <button
          type="button"
          className={mode === "existing" ? "seg-on" : ""}
          onClick={() => onModeChange("existing")}
          disabled={customers.length === 0}
        >
          Khách có sẵn
        </button>
        <button
          type="button"
          className={mode === "new" ? "seg-on" : ""}
          onClick={() => onModeChange("new")}
        >
          Khách mới
        </button>
      </div>

      {mode === "existing" ? (
        <div className="field">
          <label>Chọn khách</label>
          <select
            name="customerId"
            value={customerId}
            onChange={(e) => onCustomerIdChange(e.target.value)}
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.warningFlag ? "⚠️ " : ""}
                {c.name}
              </option>
            ))}
          </select>
          {selectedCustomer?.warningFlag && (
            <div className="warn-flag" style={{ marginTop: 8 }}>
              ⚠️ Khách có cờ cảnh báo
              {selectedCustomer.warningReason
                ? `: ${selectedCustomer.warningReason}`
                : ""}
              . Cân nhắc yêu cầu cọc cao hơn.
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="field">
            <label>Tên khách *</label>
            <input
              name="newCustomerName"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="VD: Chị Lan"
            />
          </div>
          <details className="more-fields">
            <summary>Thêm chi tiết khách</summary>
            <div className="field">
              <label>SĐT / Zalo</label>
              <input
                name="newCustomerPhone"
                value={phone}
                onChange={(e) => onPhoneChange(e.target.value)}
                placeholder="09..."
              />
            </div>
            <div className="field">
              <label>Địa chỉ giao</label>
              <input
                name="newCustomerAddress"
                value={address}
                onChange={(e) => onAddressChange(e.target.value)}
              />
            </div>
          </details>
        </>
      )}

      <details className="more-fields">
        <summary>Loại đơn (mặc định: Order hộ)</summary>
        <div className="field">
          <label>Loại đơn</label>
          <select
            name="orderType"
            value={orderType}
            onChange={(e) => onOrderTypeChange(e.target.value)}
          >
            {ORDER_TYPES.map((t) => (
              <option key={t} value={t}>
                {ORDER_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
      </details>
    </section>
  );
}
