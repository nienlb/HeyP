"use client";

import { useState } from "react";
import { Sheet } from "../../_components/sheet";
import { ItemPhotos, type ItemPhoto } from "../../_components/item-photos";
import { cnyFromSellPrice } from "@/lib/line-pricing";
import { parseVnd } from "@/lib/parse-number";
import { addItemAction, deletePhotoAction } from "../actions";

export function AddItemButton({
  orderId,
  sellRate,
  defaultMarginVnd,
}: {
  orderId: number;
  sellRate: number;
  defaultMarginVnd: number;
}) {
  const [open, setOpen] = useState(false);
  const [sell, setSell] = useState("");
  const [cny, setCny] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [photos, setPhotos] = useState<ItemPhoto[]>([]);

  function onSellChange(v: string) {
    setSell(v);
    if (confirmed) return;
    const next = cnyFromSellPrice(parseVnd(v), sellRate, defaultMarginVnd);
    setCny(next > 0 ? String(next) : "");
  }

  /**
   * Đóng mà KHÔNG lưu thì phải xoá ảnh đã tải lên, nếu không chúng nằm lại
   * trong DB (order_id NULL) và trên Storage — không màn nào hiện ra để dọn.
   */
  function close() {
    for (const p of photos) {
      deletePhotoAction(p.id).catch(() => {
        // Xoá hỏng thì job dọn ảnh mồ côi lo nốt.
      });
    }
    setOpen(false);
    setSell("");
    setCny("");
    setConfirmed(false);
    setPhotos([]);
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-outline"
        onClick={() => setOpen(true)}
      >
        + Thêm món
      </button>

      <Sheet open={open} title="Thêm món vào đơn" onClose={close}>
        <p className="muted small">
          Thêm món làm <strong>tăng</strong> tổng chốt của đơn thêm đúng giá
          bán của món mới. Lời các món cũ giữ nguyên.
        </p>

        <form action={addItemAction}>
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="unitPriceCny" value={cny} />
          <input
            type="hidden"
            name="costConfirmed"
            value={confirmed ? "true" : "false"}
          />
          <input
            type="hidden"
            name="photoIds"
            value={photos.map((p) => p.id).join(",")}
          />

          <label className="field">
            <span>Tên hàng *</span>
            <input name="name" required autoFocus enterKeyHint="next" />
          </label>

          <label className="field">
            <span>Size / màu</span>
            <input name="attributes" enterKeyHint="next" />
          </label>

          <label className="field">
            <span>Số lượng *</span>
            <input
              name="quantity"
              inputMode="numeric"
              defaultValue="1"
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

          <ItemPhotos value={photos} onChange={setPhotos} />

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
              <input name="productUrl" type="url" inputMode="url" />
            </label>
          </details>

          <button type="submit" className="btn" style={{ width: "100%" }}>
            Thêm món
          </button>
        </form>
      </Sheet>
    </>
  );
}
