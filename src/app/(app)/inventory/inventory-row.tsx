"use client";

import { useState } from "react";
import Link from "next/link";
import { ListRow } from "@/app/_components/list-row";
import { Sheet } from "@/app/_components/sheet";
import { PhotoUpload } from "@/app/_components/photo-upload";
import { PhotoGallery } from "@/app/_components/photo-gallery";
import { formatDateTime, formatVnd } from "@/lib/format";
import { displayVariant } from "@/lib/product-catalog";
import type { PhotoLabel } from "@/lib/photos";
import { SellForm } from "./sell-form";

export function InventoryRow({
  id,
  productName,
  quantity,
  avgCost,
  photos,
  size,
  color,
  hasProduct,
  stockIns,
}: {
  id: number;
  productName: string;
  quantity: number;
  avgCost: number;
  photos: { id: number; label: PhotoLabel }[];
  size: string;
  color: string;
  hasProduct: boolean;
  /** Các phiếu nhập còn hiệu lực đã cộng vào dòng này — để tìm phiếu nhập sai. */
  stockIns: { orderId: number; quantity: number; createdAt: number }[]; // epoch giây
}) {
  const [open, setOpen] = useState(false);
  // ListRow chỉ nhận title/meta/amount — không có chỗ chèn markup riêng cho
  // tên, nên biến thể ghép vào title và nhãn "chưa gắn" vào meta.
  const variant = displayVariant({ size, color });
  const label = variant === "" ? productName : `${productName} · ${variant}`;

  return (
    <>
      <ListRow
        onClick={() => setOpen(true)}
        title={label}
        meta={
          hasProduct
            ? `Còn ${quantity}`
            : `Còn ${quantity} · chưa gắn danh mục`
        }
        amount={`${formatVnd(avgCost)}/cái`}
      />

      <Sheet open={open} title={label} onClose={() => setOpen(false)}>
        <SellForm inventoryId={id} quantity={quantity} avgCost={avgCost} />
        {stockIns.length > 0 && (
          <div>
            <h3 className="sec-label">Các lần nhập</h3>
            <ul className="stock-in-list">
              {stockIns.map((s) => (
                <li key={s.orderId}>
                  <Link href={`/orders/${s.orderId}`}>
                    Phiếu #{s.orderId} · {s.quantity} cái ·{" "}
                    {formatDateTime(s.createdAt)}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="muted small">
              Nhập sai thì mở phiếu, Admin bấm “Huỷ phiếu nhập”.
            </p>
          </div>
        )}
        <div style={{ marginTop: 16 }}>
          <PhotoUpload inventoryId={id} defaultLabel="listing" />
          <div style={{ marginTop: 12 }}>
            <PhotoGallery photos={photos} copy />
          </div>
        </div>
      </Sheet>
    </>
  );
}
