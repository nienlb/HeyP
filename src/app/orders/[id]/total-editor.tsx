"use client";

import { useState } from "react";
import { Sheet } from "@/app/_components/sheet";
import { groupVnd } from "@/lib/parse-number";
import { setQuotedTotalAction } from "@/app/orders/actions";

export function TotalEditor({
  orderId,
  quotedTotalVnd,
  canEdit,
}: {
  orderId: number;
  quotedTotalVnd: number;
  /** false khi đơn đã chốt sổ (Hoàn tất / Hủy / Khách bom). */
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!canEdit) {
    return (
      <p className="muted small" style={{ marginBottom: 0 }}>
        Đơn đã chốt sổ — không sửa được tổng chốt.
      </p>
    );
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        onClick={() => setOpen(true)}
      >
        Sửa tổng chốt
      </button>

      <Sheet
        open={open}
        title="Sửa tổng chốt"
        onClose={() => setOpen(false)}
      >
        <p className="muted small">
          Dùng khi khách thương lượng lại giá. Giá vốn ¥ giữ nguyên, phần lời
          của các món được rải lại để khớp con số mới — ví ¥ không bị đụng tới.
        </p>
        <form action={setQuotedTotalAction}>
          <input type="hidden" name="orderId" value={orderId} />
          <label className="field">
            <span>Tổng chốt với khách (₫)</span>
            <input
              name="quotedTotalVnd"
              inputMode="numeric"
              defaultValue={groupVnd(String(quotedTotalVnd))}
              required
              autoFocus
            />
          </label>
          <button type="submit" className="btn" style={{ width: "100%" }}>
            Lưu tổng chốt
          </button>
        </form>
      </Sheet>
    </>
  );
}
