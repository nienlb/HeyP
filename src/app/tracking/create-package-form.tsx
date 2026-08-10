"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  createPackageAction,
  type CreatePackageState,
} from "./actions";

export function CreatePackageForm({
  carriers,
}: {
  carriers: { carrier: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState<
    CreatePackageState,
    FormData
  >(createPackageAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={formAction} className="card pkg-form">
      <h2 className="card-title">Thêm kiện</h2>
      {state.error && <div className="error">{state.error}</div>}
      <div className="pkg-grid">
        <div className="field">
          <label>Mã vận đơn *</label>
          <input name="trackingCode" placeholder="VD: SF123456789" required />
        </div>
        <div className="field">
          <label>Đơn vị vận chuyển</label>
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
        </div>
        <div className="field">
          <label>Cân nặng (kg)</label>
          <input name="weightKg" inputMode="decimal" placeholder="0.0" />
        </div>
        <div className="field">
          <label>Chế độ tra</label>
          <select name="mode" defaultValue="manual">
            <option value="manual">Tra tay</option>
            <option value="auto">Tự động (khi có adapter)</option>
          </select>
        </div>
        <div className="field pkg-orders">
          <label>Mã đơn liên quan (cách nhau dấu phẩy)</label>
          <input name="orderIds" placeholder="VD: 1, 2" />
        </div>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Đang lưu…" : "Thêm kiện"}
        </button>
      </div>
    </form>
  );
}
