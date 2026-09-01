"use client";

import { useEffect, useState } from "react";
import { Sheet } from "../../_components/sheet";
import { cnyFromSellPrice } from "@/lib/line-pricing";
import { emptyItem, type ItemPhoto, type ItemRow } from "./types";
import { ItemPhotos } from "./item-photos";

export function ItemSheet({
  open,
  onClose,
  initial,
  onSave,
  onDelete,
  sellRate,
  defaultMarginVnd,
}: {
  open: boolean;
  onClose: () => void;
  initial: ItemRow | null;
  onSave: (item: ItemRow, addAnother: boolean) => void;
  onDelete?: () => void;
  sellRate: number;
  defaultMarginVnd: number;
}) {
  const [row, setRow] = useState<ItemRow>(initial ?? { ...emptyItem });

  // Mở lại sheet phải nạp đúng món đang sửa — không có dòng này thì lần mở
  // thứ hai vẫn hiện dữ liệu của lần trước.
  useEffect(() => {
    if (open) setRow(initial ?? { ...emptyItem });
  }, [open, initial]);

  const set = (patch: Partial<ItemRow>) => setRow((r) => ({ ...r, ...patch }));
  const num = (s: string) => Number(String(s).replace(/[.,\s]/g, "")) || 0;

  const sell = num(row.sellPriceVnd);
  const valid = row.name.trim() !== "" && Number(row.quantity) > 0 && sell > 0;

  /**
   * Gõ giá thu → suy ngược ¥ và đánh dấu là số máy đoán. Không ghi đè nếu
   * người dùng đã tự gõ ¥ (costConfirmed = true) — giá vốn thật luôn thắng
   * số suy đoán.
   */
  function setSell(v: string) {
    const nextSell = num(v);
    if (row.costConfirmed && row.unitPriceCny.trim() !== "") {
      set({ sellPriceVnd: v });
      return;
    }
    const cny = cnyFromSellPrice(nextSell, sellRate, defaultMarginVnd);
    set({
      sellPriceVnd: v,
      unitPriceCny: cny > 0 ? String(cny) : "",
      costConfirmed: false,
    });
  }

  function save(addAnother: boolean) {
    if (!valid) return;
    onSave(row, addAnother);
    if (addAnother) setRow({ ...emptyItem });
    else onClose();
  }

  return (
    <Sheet
      open={open}
      title={initial ? "Sửa món" : "Thêm món"}
      onClose={onClose}
      footer={
        <div className="sheet-actions">
          {onDelete && (
            <button type="button" className="btn btn-ghost" onClick={onDelete}>
              Xoá món
            </button>
          )}
          {!initial && (
            <button
              type="button"
              className="btn btn-outline"
              disabled={!valid}
              onClick={() => save(true)}
            >
              Lưu &amp; thêm nữa
            </button>
          )}
          <button
            type="button"
            className="btn"
            disabled={!valid}
            onClick={() => save(false)}
          >
            Xong
          </button>
        </div>
      }
    >
      {/* Thứ tự theo cách chốt đơn thật: tên → size/màu → SL → giá THU → ảnh.
          Giá vốn ¥ tụt xuống khối gập: người chốt đơn không biết số đó. */}
      <label className="field">
        <span>Tên hàng *</span>
        <input
          autoFocus
          value={row.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="VD: Giày Nike AF1"
          enterKeyHint="next"
        />
      </label>

      <label className="field">
        <span>Size / màu</span>
        <input
          value={row.attributes}
          onChange={(e) => set({ attributes: e.target.value })}
          placeholder="VD: 42 · trắng"
          enterKeyHint="next"
        />
      </label>

      <label className="field">
        <span>Số lượng *</span>
        <input
          inputMode="numeric"
          value={row.quantity}
          onChange={(e) => set({ quantity: e.target.value })}
          enterKeyHint="next"
        />
      </label>

      <label className="field">
        <span>Giá phải thu (₫) — cho 1 cái *</span>
        <input
          inputMode="numeric"
          value={row.sellPriceVnd}
          onChange={(e) => setSell(e.target.value)}
          placeholder="VD: 1.000.000"
          enterKeyHint="next"
        />
      </label>

      <ItemPhotos
        value={row.photos}
        onChange={(photos: ItemPhoto[]) => set({ photos })}
      />

      <details className="more-fields">
        <summary>Giá vốn &amp; link</summary>
        <label className="field">
          <span>
            Đơn giá ¥{" "}
            {!row.costConfirmed && row.unitPriceCny !== "" && (
              <em className="muted small">(máy tính)</em>
            )}
          </span>
          <input
            inputMode="decimal"
            value={row.unitPriceCny}
            onChange={(e) =>
              // Gõ tay = xác nhận giá vốn, không còn là số máy đoán.
              set({ unitPriceCny: e.target.value, costConfirmed: true })
            }
            className={row.costConfirmed ? undefined : "cny-suggested"}
            placeholder="Chưa biết thì để trống"
            enterKeyHint="next"
          />
        </label>

        <label className="field">
          <span>Link sản phẩm</span>
          <input
            type="url"
            inputMode="url"
            value={row.productUrl}
            onChange={(e) => set({ productUrl: e.target.value })}
            enterKeyHint="done"
          />
        </label>
      </details>
    </Sheet>
  );
}
