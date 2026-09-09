"use client";

import { useMemo, useState } from "react";
import { photoUrl } from "@/lib/photos";
import { formatVnd } from "@/lib/format";

export type ProductPick = {
  id: number;
  name: string;
  sizes: string[];
  colors: string[];
  defaultSellVnd: number;
  defaultUnitPriceCny: number;
  productUrl: string | null;
  photoIds: number[];
};

/**
 * Lưới ảnh + ô tìm. MỘT DOM cho cả hai kích cỡ màn: điện thoại 2 cột, từ
 * 900px là 4 cột — đổi bằng CSS chứ không render hai bản rồi ẩn một (luật
 * v8-A: hai bản là hai nguồn chân lý, sửa một quên một, không test nào bắt).
 */
export function ProductGrid({
  products,
  onPick,
  emptyText,
}: {
  products: ProductPick[];
  onPick: (p: ProductPick) => void;
  emptyText: string;
}) {
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    const key = q.trim().toLowerCase();
    if (key === "") return products;
    return products.filter((p) => p.name.toLowerCase().includes(key));
  }, [products, q]);

  return (
    <>
      <label className="field">
        <span>Tìm sản phẩm</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm theo tên…"
        />
      </label>

      {shown.length === 0 ? (
        <div className="card empty">
          <p>{q.trim() === "" ? emptyText : `Không có mẫu nào khớp “${q}”.`}</p>
        </div>
      ) : (
        <div className="product-grid">
          {shown.map((p) => (
            <button
              key={p.id}
              type="button"
              className="product-cell"
              onClick={() => onPick(p)}
            >
              {p.photoIds[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoUrl(p.photoIds[0], "thumb")}
                  alt=""
                  loading="lazy"
                />
              ) : (
                <span className="product-cell-noimg" aria-hidden="true" />
              )}
              <span className="product-cell-name">{p.name}</span>
              <span className="product-cell-price num">
                {p.defaultSellVnd > 0 ? formatVnd(p.defaultSellVnd) : "—"}
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
