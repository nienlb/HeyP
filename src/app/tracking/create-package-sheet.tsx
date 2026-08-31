"use client";

import { useActionState, useEffect, useState } from "react";
import { Sheet } from "../_components/sheet";
import { createPackageAction, type CreatePackageState } from "./actions";

export function CreatePackageSheet({
  carriers,
}: {
  carriers: { carrier: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<
    CreatePackageState,
    FormData
  >(createPackageAction, {});

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state.ok]);

  return (
    <>
      <button
        type="button"
        className="picker"
        onClick={() => setOpen(true)}
      >
        + Thêm kiện
      </button>

      <Sheet
        open={open}
        title="Thêm kiện"
        onClose={() => setOpen(false)}
        footer={
          <button
            type="submit"
            form="create-package-form"
            className="btn"
            disabled={pending}
          >
            {pending ? "Đang lưu…" : "Thêm kiện"}
          </button>
        }
      >
        <form action={formAction} id="create-package-form">
          {state.error && <div className="error">{state.error}</div>}
          <label className="field">
            <span>Mã vận đơn *</span>
            <input name="trackingCode" placeholder="VD: SF123456789" required />
          </label>
          <label className="field">
            <span>Đơn vị vận chuyển</span>
            {carriers.length > 0 ? (
              <select name="carrier" defaultValue="">
                <option value="">— chọn —</option>
                {carriers.map((c) => (
                  <option key={c.carrier} value={c.carrier}>
                    {c.label}
                  </option>
                ))}
              </select>
            ) : (
              <input name="carrier" placeholder="Tên đơn vị (nếu có)" />
            )}
          </label>
          <label className="field">
            <span>Cân nặng (kg)</span>
            <input name="weightKg" inputMode="decimal" placeholder="0.0" />
          </label>
          <label className="field">
            <span>Chế độ tra</span>
            <select name="mode" defaultValue="manual">
              <option value="manual">Tra tay</option>
              <option value="auto">Tự động (khi có adapter)</option>
            </select>
          </label>
          <label className="field">
            <span>Mã đơn liên quan (cách nhau dấu phẩy)</span>
            <input name="orderIds" placeholder="VD: 1, 2" />
          </label>
        </form>
      </Sheet>
    </>
  );
}
