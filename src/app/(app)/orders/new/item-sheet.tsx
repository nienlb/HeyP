"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/app/_components/sheet";
import { cnyFromSellPrice } from "@/lib/line-pricing";
import { parseDecimal, parseVnd } from "@/lib/parse-number";
import { splitLegacyAttributes } from "@/lib/product-catalog";
import { quickSaveProductAction } from "@/app/(app)/products/actions";
import { emptyItem, type ItemPhoto, type ItemRow } from "./types";
import { ItemPhotos } from "@/app/_components/item-photos";

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
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  // Mở lại sheet phải nạp đúng món đang sửa — không có dòng này thì lần mở
  // thứ hai vẫn hiện dữ liệu của lần trước.
  useEffect(() => {
    if (open) {
      setRow(initial ?? { ...emptyItem });
      setSavedMsg(null);
    }
  }, [open, initial]);

  const set = (patch: Partial<ItemRow>) => setRow((r) => ({ ...r, ...patch }));

  const sell = parseVnd(row.sellPriceVnd);
  const valid = row.name.trim() !== "" && Number(row.quantity) > 0 && sell > 0;

  /**
   * Gõ giá thu → suy ngược ¥ và đánh dấu là số máy đoán. Không ghi đè nếu
   * người dùng đã tự gõ ¥ (costConfirmed = true) — giá vốn thật luôn thắng
   * số suy đoán.
   */
  function setSell(v: string) {
    const nextSell = parseVnd(v);
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

      {/* v9-A: một ô chữ tự do tách thành hai. Món đến từ danh mục có chip
          gợi ý; món gõ tay thì hai ô trống, vẫn gõ tự do như cũ. */}
      <label className="field">
        <span>Size</span>
        {row.sizeOptions.length > 0 && (
          <div className="chip-row">
            {row.sizeOptions.map((s) => (
              <button
                key={s}
                type="button"
                className={`chip${row.size === s ? " chip-on" : ""}`}
                onClick={() => set({ size: row.size === s ? "" : s })}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <input
          value={row.size}
          onChange={(e) => set({ size: e.target.value })}
          placeholder="VD: 42"
          enterKeyHint="next"
        />
      </label>

      <label className="field">
        <span>Màu</span>
        {row.colorOptions.length > 0 && (
          <div className="chip-row">
            {row.colorOptions.map((c) => (
              <button
                key={c}
                type="button"
                className={`chip${row.color === c ? " chip-on" : ""}`}
                onClick={() => set({ color: row.color === c ? "" : c })}
              >
                {c}
              </button>
            ))}
          </div>
        )}
        <input
          value={row.color}
          onChange={(e) => set({ color: e.target.value })}
          placeholder="VD: trắng"
          enterKeyHint="next"
        />
      </label>

      {/* Món cũ có chữ trong `attributes` mà chưa có size/màu: GỢI Ý tách,
          chờ bấm xác nhận. Không tự ghi — máy đoán sai thì người sửa, chứ
          máy không lặng lẽ đổi dữ liệu thật. */}
      {row.attributes.trim() !== "" && row.size === "" && row.color === "" && (
        <div className="notice">
          <p>Món này đang ghi “{row.attributes}”. Tách thành size và màu?</p>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => set(splitLegacyAttributes(row.attributes))}
          >
            Tách thử
          </button>
        </div>
      )}

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

      {/* Đường "ghim": món chủ lực lên danh mục bằng một lần chạm; hàng lẻ
          không làm bẩn gì vì phải bấm mới lưu. */}
      {row.productId === null && (
        <div className="field">
          <button
            type="button"
            className="btn btn-outline"
            disabled={saving || !valid}
            onClick={async () => {
              setSaving(true);
              setSavedMsg(null);
              const res = await quickSaveProductAction({
                name: row.name.trim(),
                size: row.size,
                color: row.color,
                sellPriceVnd: parseVnd(row.sellPriceVnd),
                unitPriceCny: parseDecimal(row.unitPriceCny),
                productUrl: row.productUrl.trim() || null,
              });
              setSaving(false);
              if ("error" in res) setSavedMsg(res.error);
              else {
                set({ productId: res.productId });
                setSavedMsg("Đã lưu vào danh mục.");
              }
            }}
          >
            {saving ? "Đang lưu…" : "★ Lưu vào danh mục"}
          </button>
          {savedMsg && <div className="muted small">{savedMsg}</div>}
        </div>
      )}

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
