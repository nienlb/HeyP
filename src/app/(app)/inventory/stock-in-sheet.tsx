"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/app/_components/sheet";
import {
  ProductGrid,
  type ProductPick,
} from "@/app/(app)/products/product-grid";
import { stockInAction, type StockInState } from "./actions";

export function StockInSheet({
  defaultRate,
  products,
}: {
  defaultRate: number;
  products: ProductPick[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<StockInState, FormData>(
    stockInAction,
    {},
  );

  const [picked, setPicked] = useState<ProductPick | null>(null);
  const [name, setName] = useState("");
  const [cny, setCny] = useState("");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");

  // Lưu xong (không lỗi, không còn chạy) thì đóng sheet và nạp lại tồn kho.
  useEffect(() => {
    if (!pending && !state.error && open) {
      setOpen(false);
      router.refresh();
    }
    // Chỉ phản ứng khi lượt gửi vừa kết thúc.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  // Mở lại phải sạch — không có dòng này thì lần mở sau vẫn giữ mẫu lần trước.
  useEffect(() => {
    if (!open) return;
    setPicked(null);
    setName("");
    setCny("");
    setSize("");
    setColor("");
  }, [open]);

  function choose(p: ProductPick) {
    setPicked(p);
    setName(p.name);
    setCny(p.defaultUnitPriceCny > 0 ? String(p.defaultUnitPriceCny) : "");
    setSize(p.sizes.length === 1 ? p.sizes[0] : "");
    setColor(p.colors.length === 1 ? p.colors[0] : "");
  }

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
        {/* Bước chọn mẫu nằm NGOÀI <form>: bấm một nút trong form là submit. */}
        {products.length > 0 && picked === null && (
          <>
            <ProductGrid
              products={products}
              emptyText="Danh mục còn trống."
              onPick={choose}
            />
            <p className="muted small">Hoặc gõ tay bên dưới.</p>
          </>
        )}

        <form action={formAction} id="stock-in-form">
          {state.error && <div className="error">{state.error}</div>}

          <input type="hidden" name="productId" value={picked?.id ?? ""} />

          <label className="field">
            <span>Tên hàng *</span>
            <input
              name="productName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              enterKeyHint="next"
            />
          </label>

          {/* Chip chỉ hiện khi mẫu có sẵn dãy; gõ tay thì vẫn là ô trống. */}
          <label className="field">
            <span>Size</span>
            {picked && picked.sizes.length > 0 && (
              <div className="chip-row">
                {picked.sizes.map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    className={`chip${size === sz ? " chip-on" : ""}`}
                    onClick={() => setSize(size === sz ? "" : sz)}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            )}
            <input
              name="size"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              placeholder="VD: 40"
              enterKeyHint="next"
            />
          </label>

          <label className="field">
            <span>Màu</span>
            {picked && picked.colors.length > 0 && (
              <div className="chip-row">
                {picked.colors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`chip${color === c ? " chip-on" : ""}`}
                    onClick={() => setColor(color === c ? "" : c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
            <input
              name="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="VD: đen"
              enterKeyHint="next"
            />
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
            <input
              name="unitPriceCny"
              inputMode="decimal"
              value={cny}
              onChange={(e) => setCny(e.target.value)}
              enterKeyHint="done"
            />
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
