"use client";

import { useState } from "react";
import { Sheet } from "@/app/_components/sheet";
import { ItemPhotos, type ItemPhoto } from "@/app/_components/item-photos";
import { cnyFromSellPrice } from "@/lib/line-pricing";
import { groupVnd, parseVnd } from "@/lib/parse-number";
import { addItemAction, deletePhotoAction, updateItemAction } from "@/app/orders/actions";

/** Món đang sửa. `sellVnd` là số suy ngược (sellPerUnitVnd), không có trong DB. */
export type EditableItem = {
  id: number;
  name: string;
  attributes: string;
  productUrl: string;
  quantity: number;
  sellVnd: number;
  unitPriceCny: number;
  costConfirmed: boolean;
};

export function ItemSheetButton({
  orderId,
  sellRate,
  defaultMarginVnd,
  initial,
  label,
}: {
  orderId: number;
  sellRate: number;
  defaultMarginVnd: number;
  /** Có = chế độ SỬA; không có = chế độ THÊM. */
  initial?: EditableItem;
  /** Chữ trên nút mở sheet. */
  label: string;
}) {
  const editing = initial !== undefined;
  const [open, setOpen] = useState(false);
  const [sell, setSell] = useState(
    initial ? groupVnd(String(initial.sellVnd)) : "",
  );
  const [cny, setCny] = useState(initial ? String(initial.unitPriceCny) : "");
  const [confirmed, setConfirmed] = useState(initial?.costConfirmed ?? false);
  const [photos, setPhotos] = useState<ItemPhoto[]>([]);

  function onSellChange(v: string) {
    setSell(v);
    if (confirmed) return;
    const next = cnyFromSellPrice(parseVnd(v), sellRate, defaultMarginVnd);
    setCny(next > 0 ? String(next) : "");
  }

  /**
   * Đóng mà KHÔNG lưu thì xoá ảnh vừa tải lên, nếu không chúng nằm lại trong
   * DB (order_id NULL) và trên Storage. Ảnh đã gắn đơn thì an toàn:
   * deletePhoto chỉ xoá dòng có order_id IS NULL.
   */
  function close() {
    for (const p of photos) {
      deletePhotoAction(p.id).catch(() => {
        // Xoá hỏng thì job dọn ảnh mồ côi lo nốt.
      });
    }
    setOpen(false);
    setPhotos([]);
    // Chế độ sửa: trả ô về đúng giá trị của món, không xoá trắng.
    setSell(initial ? groupVnd(String(initial.sellVnd)) : "");
    setCny(initial ? String(initial.unitPriceCny) : "");
    setConfirmed(initial?.costConfirmed ?? false);
  }

  return (
    <>
      <button
        type="button"
        className={editing ? "btn btn-sm btn-ghost" : "btn btn-outline"}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>

      <Sheet
        open={open}
        title={editing ? "Sửa món" : "Thêm món vào đơn"}
        onClose={close}
      >
        <p className="muted small">
          {editing
            ? "Đổi số lượng hoặc giá phải thu sẽ làm tổng chốt của đơn đổi theo. Sửa mỗi tên hay size thì tiền giữ nguyên."
            : "Thêm món làm tăng tổng chốt của đơn thêm đúng giá bán của món mới. Lời các món cũ giữ nguyên."}
        </p>

        <form action={editing ? updateItemAction : addItemAction}>
          <input type="hidden" name="orderId" value={orderId} />
          {editing && <input type="hidden" name="itemId" value={initial.id} />}
          <input type="hidden" name="unitPriceCny" value={cny} />
          <input
            type="hidden"
            name="costConfirmed"
            value={confirmed ? "true" : "false"}
          />
          {!editing && (
            <input
              type="hidden"
              name="photoIds"
              value={photos.map((p) => p.id).join(",")}
            />
          )}

          <label className="field">
            <span>Tên hàng *</span>
            <input
              name="name"
              required
              autoFocus
              defaultValue={initial?.name ?? ""}
              enterKeyHint="next"
            />
          </label>

          <label className="field">
            <span>Size / màu</span>
            <input
              name="attributes"
              defaultValue={initial?.attributes ?? ""}
              enterKeyHint="next"
            />
          </label>

          <label className="field">
            <span>Số lượng *</span>
            <input
              name="quantity"
              inputMode="numeric"
              defaultValue={String(initial?.quantity ?? 1)}
              required
              enterKeyHint="next"
            />
          </label>

          <label className="field">
            <span>Giá phải thu (₫) — cho 1 cái *</span>
            <input
              name="sellVnd"
              inputMode="numeric"
              value={sell}
              onChange={(e) => onSellChange(e.target.value)}
              required
              enterKeyHint="next"
            />
          </label>

          {/* Ảnh chỉ có ở chế độ THÊM: sửa món mà đính thêm ảnh cần đường gắn
              riêng, để dành khi thật sự cần. Ảnh của món sửa được ở tab Ảnh. */}
          {!editing && <ItemPhotos value={photos} onChange={setPhotos} />}

          <details className="more-fields">
            <summary>Giá vốn &amp; link</summary>
            <label className="field">
              <span>
                Đơn giá ¥{" "}
                {!confirmed && cny !== "" && (
                  <em className="muted small">(máy tính)</em>
                )}
              </span>
              <input
                inputMode="decimal"
                value={cny}
                onChange={(e) => {
                  setCny(e.target.value);
                  setConfirmed(true);
                }}
                className={confirmed ? undefined : "cny-suggested"}
              />
            </label>
            <label className="field">
              <span>Link sản phẩm</span>
              <input
                name="productUrl"
                type="url"
                inputMode="url"
                defaultValue={initial?.productUrl ?? ""}
              />
            </label>
          </details>

          <button type="submit" className="btn" style={{ width: "100%" }}>
            {editing ? "Lưu món" : "Thêm món"}
          </button>
        </form>
      </Sheet>
    </>
  );
}
