"use client";

import { useState } from "react";
import { Sheet } from "@/app/_components/sheet";
import { cancelStockInAction } from "@/app/(app)/inventory/actions";

/**
 * Huỷ phiếu nhập kho nhập sai — Admin trở lên. Ẩn nút chỉ là giao diện;
 * server tự kiểm bằng requireAdmin() trong cancelStockInAction.
 */
export function CancelStockIn({
  orderId,
  summary,
}: {
  orderId: number;
  /** Ví dụ: "Tabi classic · 39 · đen × 4 · 272¥" */
  summary: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <section className="card">
        <h2 className="card-title">Nhập sai?</h2>
        <p className="muted small">
          Huỷ phiếu nhập sẽ rút đúng số hàng này khỏi kho và hoàn ¥ về ví. Đơn
          chuyển sang <strong>Hủy</strong>, lịch sử vẫn giữ. Sau đó nhập lại cho
          đúng. Hàng đã bán bớt thì không huỷ được.
        </p>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => setOpen(true)}
        >
          Huỷ phiếu nhập #{orderId}
        </button>
      </section>

      <Sheet
        open={open}
        title={`Huỷ phiếu nhập #${orderId}`}
        onClose={() => setOpen(false)}
        footer={
          <div className="sheet-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setOpen(false)}
            >
              Thôi
            </button>
            <form action={cancelStockInAction}>
              <input type="hidden" name="orderId" value={orderId} />
              <button type="submit" className="btn btn-danger">
                Huỷ phiếu nhập
              </button>
            </form>
          </div>
        }
      >
        <p>{summary}</p>
        <p className="muted">Rút khỏi kho và hoàn ¥ về ví. Không hoàn tác được.</p>
      </Sheet>
    </>
  );
}
