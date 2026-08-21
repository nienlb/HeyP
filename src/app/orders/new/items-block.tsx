"use client";

import type { ItemRow } from "./types";
import { emptyItem } from "./types";

/**
 * Danh sách dòng sản phẩm. Không giữ state riêng — cha truyền `items` xuống
 * và nhận `onChange` lên, để một nguồn chân lý duy nhất nằm ở form.
 */
export function ItemsBlock({
  items,
  onChange,
}: {
  items: ItemRow[];
  onChange: (items: ItemRow[]) => void;
}) {
  function updateItem(i: number, patch: Partial<ItemRow>) {
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function addItem() {
    onChange([...items, { ...emptyItem }]);
  }
  function removeItem(i: number) {
    if (items.length === 1) return;
    onChange(items.filter((_, idx) => idx !== i));
  }

  return (
    <section className="card">
      <h2 className="card-title">Sản phẩm</h2>
      <div className="items">
        {items.map((it, i) => (
          <div key={i} className="item-row">
            <input
              placeholder="Tên hàng *"
              value={it.name}
              onChange={(e) => updateItem(i, { name: e.target.value })}
              className="it-name"
            />
            <input
              placeholder="Link"
              value={it.productUrl}
              onChange={(e) => updateItem(i, { productUrl: e.target.value })}
              className="it-url"
            />
            <input
              placeholder="Size/màu"
              value={it.attributes}
              onChange={(e) => updateItem(i, { attributes: e.target.value })}
              className="it-attr"
            />
            <input
              placeholder="SL"
              inputMode="numeric"
              value={it.quantity}
              onChange={(e) => updateItem(i, { quantity: e.target.value })}
              className="it-qty"
            />
            <input
              placeholder="Đơn giá"
              inputMode="decimal"
              value={it.unitPriceCny}
              onChange={(e) =>
                updateItem(i, {
                  unitPriceCny: e.target.value,
                  // Sửa số = xác nhận giá vốn, không còn là gợi ý của máy.
                  costConfirmed: true,
                })
              }
              title={it.costConfirmed ? undefined : "Giá gợi ý — sửa để xác nhận"}
              className={`it-price${it.costConfirmed ? "" : " cny-suggested"}`}
            />
            <button
              type="button"
              className="it-del"
              onClick={() => removeItem(i)}
              aria-label="Xoá dòng"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={addItem}>
        + Thêm dòng
      </button>
    </section>
  );
}
