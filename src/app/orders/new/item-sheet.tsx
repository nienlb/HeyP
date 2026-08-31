"use client";

import { useEffect, useState } from "react";
import { Sheet } from "../../_components/sheet";
import { emptyItem, type ItemRow } from "./types";

export function ItemSheet({
  open,
  onClose,
  initial,
  onSave,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  initial: ItemRow | null;
  onSave: (item: ItemRow, addAnother: boolean) => void;
  onDelete?: () => void;
}) {
  const [row, setRow] = useState<ItemRow>(initial ?? { ...emptyItem });

  // Mở lại sheet phải nạp đúng món đang sửa — không có dòng này thì lần mở
  // thứ hai vẫn hiện dữ liệu của lần trước.
  useEffect(() => {
    if (open) setRow(initial ?? { ...emptyItem });
  }, [open, initial]);

  const set = (patch: Partial<ItemRow>) => setRow((r) => ({ ...r, ...patch }));
  const valid = row.name.trim() !== "" && Number(row.quantity) > 0;

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
      {/* Thứ tự theo cách đọc đơn thật: tên → số lượng → giá → chi tiết. */}
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
        <span>Số lượng *</span>
        <input
          inputMode="numeric"
          value={row.quantity}
          onChange={(e) => set({ quantity: e.target.value })}
          enterKeyHint="next"
        />
      </label>

      <label className="field">
        <span>Đơn giá (¥)</span>
        <input
          inputMode="decimal"
          value={row.unitPriceCny}
          onChange={(e) =>
            // Gõ tay = xác nhận giá vốn, không còn là gợi ý của máy.
            set({ unitPriceCny: e.target.value, costConfirmed: true })
          }
          className={row.costConfirmed ? undefined : "cny-suggested"}
          placeholder="Chưa biết thì để trống"
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
        <span>Link sản phẩm</span>
        <input
          type="url"
          inputMode="url"
          value={row.productUrl}
          onChange={(e) => set({ productUrl: e.target.value })}
          enterKeyHint="done"
        />
      </label>
    </Sheet>
  );
}
