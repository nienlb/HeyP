"use client";

import { useState } from "react";
import { Sheet } from "../../_components/sheet";
import { CopyButton } from "../../_components/copy-button";
import {
  CustomerSheet,
  type CustomerPick,
} from "../new/customer-sheet";
import type { CustomerOption } from "../new/types";
import { setOrderCustomerAction, updateCustomerAction } from "../actions";

export type OrderCustomer = {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
};

export function CustomerBlock({
  orderId,
  customer,
  customers,
}: {
  orderId: number;
  customer: OrderCustomer | null;
  customers: CustomerOption[];
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  // Khách vừa chọn ở CustomerSheet, chờ bấm nút để gửi lên server.
  const [picked, setPicked] = useState<CustomerPick | null>(null);

  return (
    <>
      <section className="card">
        <h2 className="card-title">
          Khách hàng
          <button
            type="button"
            className="btn btn-sm btn-ghost card-title-action"
            onClick={() => (customer ? setEditOpen(true) : setPickOpen(true))}
          >
            {customer ? "Sửa" : "+ Chọn khách"}
          </button>
        </h2>
        <div className="kv">
          <span>Tên</span>
          {customer ? (
            <strong>{customer.name}</strong>
          ) : (
            <em className="muted">— chưa có khách —</em>
          )}
        </div>
        {customer?.phone && (
          <div className="kv">
            <span>SĐT/Zalo</span>
            <a href={`tel:${customer.phone.replace(/\s/g, "")}`}>
              {customer.phone}
            </a>
          </div>
        )}
        {customer?.address && (
          <div className="kv">
            <span>Địa chỉ</span>
            <span className="kv-copy">
              {customer.address}
              <CopyButton
                text={customer.address}
                label="Copy"
                className="btn btn-ghost btn-sm"
              />
            </span>
          </div>
        )}
      </section>

      {/* Sheet sửa thông tin khách hiện tại */}
      <Sheet
        open={editOpen}
        title={customer ? customer.name : ""}
        onClose={() => setEditOpen(false)}
      >
        {customer && (
          <>
            <p className="muted small">
              Sửa ở đây đổi cho <strong>mọi đơn</strong> của khách này — thông
              tin khách là dữ liệu dùng chung, không phải của riêng đơn.
            </p>
            <form action={updateCustomerAction}>
              <input type="hidden" name="orderId" value={orderId} />
              <input type="hidden" name="customerId" value={customer.id} />
              <label className="field">
                <span>Tên khách *</span>
                <input name="name" defaultValue={customer.name} required />
              </label>
              <label className="field">
                <span>SĐT / Zalo</span>
                <input
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  defaultValue={customer.phone ?? ""}
                  placeholder="09..."
                />
              </label>
              <label className="field">
                <span>Địa chỉ giao</span>
                <input name="address" defaultValue={customer.address ?? ""} />
              </label>
              <button type="submit" className="btn" style={{ width: "100%" }}>
                Lưu thông tin khách
              </button>
            </form>

            <button
              type="button"
              className="btn btn-outline"
              style={{ width: "100%", marginTop: 12 }}
              onClick={() => {
                setEditOpen(false);
                setPickOpen(true);
              }}
            >
              Đổi sang khách khác
            </button>
          </>
        )}
      </Sheet>

      {/* Sheet chọn khách — dùng lại đúng component của màn tạo đơn */}
      <CustomerSheet
        open={pickOpen}
        onClose={() => setPickOpen(false)}
        customers={customers}
        onPick={setPicked}
      />

      {/* Chọn xong thì hiện nút xác nhận: CustomerSheet chỉ trả lựa chọn về,
          không tự gửi form. */}
      <Sheet
        open={picked !== null}
        title="Gắn khách vào đơn"
        onClose={() => setPicked(null)}
      >
        {picked && (
          <form action={setOrderCustomerAction}>
            <input type="hidden" name="orderId" value={orderId} />
            {picked.mode === "existing" && (
              <input type="hidden" name="customerId" value={picked.id} />
            )}
            {picked.mode === "new" && (
              <input type="hidden" name="newCustomerName" value={picked.name} />
            )}
            <p>
              Gắn đơn #{orderId} cho khách <strong>{picked.name}</strong>
              {picked.mode === "new" && " (khách mới)"}.
            </p>
            <button type="submit" className="btn" style={{ width: "100%" }}>
              Xác nhận
            </button>
          </form>
        )}
      </Sheet>
    </>
  );
}
