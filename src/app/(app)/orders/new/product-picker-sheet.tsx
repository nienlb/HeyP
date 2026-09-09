"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/app/_components/sheet";
import {
  ProductGrid,
  type ProductPick,
} from "@/app/(app)/products/product-grid";
import { pickProductAction } from "@/app/(app)/products/actions";
import { groupVnd, parseVnd } from "@/lib/parse-number";
import { emptyItem, type ItemRow } from "./types";

/**
 * Chọn một mẫu từ danh mục, hai bước trong CÙNG một Sheet:
 *   1. Lưới ảnh + ô tìm — giày dép nhận ra bằng MẮT nhanh hơn đọc tên.
 *   2. Chip size + chip màu + số lượng + giá thu, rồi Xong.
 *
 * Mỗi lần chọn sinh ĐÚNG MỘT dòng món. Khách lấy nhiều size cùng mẫu là cảnh
 * hiếm — chọn lại lần nữa, đổi lại thì bước 2 đơn giản hơn hẳn.
 */
export function ProductPickerSheet({
  open,
  onClose,
  products,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  products: ProductPick[];
  onAdd: (item: ItemRow) => void;
}) {
  const [picked, setPicked] = useState<ProductPick | null>(null);
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [qty, setQty] = useState("1");
  const [sell, setSell] = useState("");
  const [photoIds, setPhotoIds] = useState<number[]>([]);
  const [copying, setCopying] = useState(false);

  // Mở lại phải về bước 1 — không có dòng này thì lần mở sau vẫn đứng ở mẫu
  // đã chọn lần trước.
  useEffect(() => {
    if (!open) return;
    setPicked(null);
    setSize("");
    setColor("");
    setQty("1");
    setSell("");
    setPhotoIds([]);
  }, [open]);

  async function choose(p: ProductPick) {
    setPicked(p);
    setSize(p.sizes.length === 1 ? p.sizes[0] : "");
    setColor(p.colors.length === 1 ? p.colors[0] : "");
    setSell(p.defaultSellVnd > 0 ? groupVnd(String(p.defaultSellVnd)) : "");
    if (p.photoIds.length === 0) return;
    // Chép ảnh ngay lúc chọn: chúng thành ảnh mồ côi có ân hạn 24h, rồi
    // createOrder gắn vào món TRONG transaction.
    setCopying(true);
    try {
      setPhotoIds(await pickProductAction(p.id));
    } catch {
      // Chép ảnh hỏng thì vẫn thêm được món, chỉ là không có ảnh.
      setPhotoIds([]);
    } finally {
      setCopying(false);
    }
  }

  function done() {
    if (!picked) return;
    if (parseVnd(sell) <= 0) return;
    onAdd({
      ...emptyItem,
      name: picked.name,
      productUrl: picked.productUrl ?? "",
      productId: picked.id,
      size,
      color,
      sizeOptions: picked.sizes,
      colorOptions: picked.colors,
      quantity: qty,
      sellPriceVnd: sell,
      unitPriceCny:
        picked.defaultUnitPriceCny > 0
          ? String(picked.defaultUnitPriceCny)
          : "",
      // Giá ¥ lấy từ danh mục là giá NGƯỜI DÙNG đã chốt, không phải số máy
      // suy ngược — nên đánh dấu đã xác nhận.
      costConfirmed: picked.defaultUnitPriceCny > 0,
      photos: photoIds.map((id) => ({ id })),
    });
    onClose();
  }

  const valid = picked !== null && parseVnd(sell) > 0 && Number(qty) > 0;

  return (
    <Sheet
      open={open}
      title={picked ? picked.name : "Chọn từ danh mục"}
      onClose={onClose}
      footer={
        picked ? (
          <div className="sheet-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setPicked(null)}
            >
              Chọn mẫu khác
            </button>
            <button
              type="button"
              className="btn"
              disabled={!valid || copying}
              onClick={done}
            >
              {copying ? "Đang chép ảnh…" : "Xong"}
            </button>
          </div>
        ) : undefined
      }
    >
      {picked === null ? (
        <ProductGrid
          products={products}
          emptyText="Danh mục còn trống. Thêm mẫu ở màn Sản phẩm, hoặc bấm “Lưu vào danh mục” sau khi gõ một món."
          onPick={choose}
        />
      ) : (
        <>
          <label className="field">
            <span>Size</span>
            <div className="chip-row">
              {picked.sizes.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`chip${size === s ? " chip-on" : ""}`}
                  onClick={() => setSize(size === s ? "" : s)}
                >
                  {s}
                </button>
              ))}
            </div>
            <input
              value={size}
              onChange={(e) => setSize(e.target.value)}
              placeholder="Hoặc gõ size khác"
            />
          </label>

          <label className="field">
            <span>Màu</span>
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
            <input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="Hoặc gõ màu khác"
            />
          </label>

          <label className="field">
            <span>Số lượng *</span>
            <input
              inputMode="numeric"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </label>

          <label className="field">
            <span>Giá phải thu (₫) — cho 1 cái *</span>
            <input
              inputMode="numeric"
              value={sell}
              onChange={(e) => setSell(e.target.value)}
              onFocus={(e) => setSell(e.target.value.replace(/[.,\s]/g, ""))}
              onBlur={(e) => setSell(groupVnd(e.target.value))}
            />
          </label>
        </>
      )}
    </Sheet>
  );
}
