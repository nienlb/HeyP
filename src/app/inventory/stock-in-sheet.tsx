"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/app/_components/sheet";
import { stockInAction, type StockInState } from "./actions";

export function StockInSheet({ defaultRate }: { defaultRate: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<StockInState, FormData>(
    stockInAction,
    {},
  );

  // Lưu xong (không lỗi, không còn chạy) thì đóng sheet và nạp lại tồn kho.
  useEffect(() => {
    if (!pending && !state.error && open) {
      setOpen(false);
      router.refresh();
    }
    // Chỉ phản ứng khi lượt gửi vừa kết thúc.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  return (
    <>
      <button
        type="button"
        className="header-action-float"
        onClick={() => setOpen(true)}
        aria-label="Nhập kho"
      >
        +
      </button>

      <Sheet open={open} title="Nhập kho" onClose={() => setOpen(false)}>
        <form action={formAction} id="stock-in-form">
          {state.error && <div className="error">{state.error}</div>}

          <label className="field">
            <span>Tên hàng *</span>
            <input name="productName" autoFocus required enterKeyHint="next" />
          </label>

          <label className="field">
            <span>Số lượng *</span>
            <input
              name="quantity"
              inputMode="numeric"
              defaultValue="1"
              enterKeyHint="next"
            />
          </label>

          <label className="field">
            <span>Đơn giá (¥) *</span>
            <input name="unitPriceCny" inputMode="decimal" enterKeyHint="done" />
          </label>

          <details className="more-fields">
            <summary>
              Tỷ giá (mặc định {defaultRate.toLocaleString("vi-VN")})
            </summary>
            <label className="field">
              <span>Tỷ giá (₫/¥)</span>
              <input
                name="exchangeRate"
                inputMode="numeric"
                defaultValue={String(defaultRate)}
              />
            </label>
          </details>

          <p className="muted small">
            Nhập kho sẽ trừ số ¥ tương ứng khỏi ví ¥.
          </p>

          <button type="submit" className="btn" disabled={pending}>
            {pending ? "Đang nhập…" : "Nhập kho"}
          </button>
        </form>
      </Sheet>
    </>
  );
}
