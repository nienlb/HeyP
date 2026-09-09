"use client";

import { useState } from "react";
import { ProductGrid, type ProductPick } from "./product-grid";
import { ProductSheet } from "./product-sheet";

export function ProductsScreen({
  products,
  canDelete,
}: {
  products: ProductPick[];
  canDelete: boolean;
}) {
  const [editing, setEditing] = useState<ProductPick | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Nút thêm ở header, KHÔNG ở ô [+] giữa tabbar — ô đó luôn là tạo đơn. */}
      <button
        type="button"
        className="header-action-float"
        onClick={() => {
          setEditing(null);
          setOpen(true);
        }}
        aria-label="Thêm sản phẩm"
      >
        +
      </button>

      <ProductGrid
        products={products}
        emptyText="Chưa có mẫu nào. Bấm + ở góc trên để thêm, hoặc bấm “Lưu vào danh mục” khi tạo đơn."
        onPick={(p) => {
          setEditing(p);
          setOpen(true);
        }}
      />

      <ProductSheet
        open={open}
        onClose={() => setOpen(false)}
        initial={editing}
        canDelete={canDelete}
      />
    </>
  );
}
