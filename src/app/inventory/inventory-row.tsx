"use client";

import { useState } from "react";
import { ListRow } from "../_components/list-row";
import { Sheet } from "../_components/sheet";
import { PhotoUpload } from "../_components/photo-upload";
import { PhotoGallery } from "../_components/photo-gallery";
import { formatVnd } from "@/lib/format";
import type { PhotoLabel } from "@/lib/photos";
import { SellForm } from "./sell-form";

export function InventoryRow({
  id,
  productName,
  quantity,
  avgCost,
  photos,
}: {
  id: number;
  productName: string;
  quantity: number;
  avgCost: number;
  photos: { id: number; label: PhotoLabel }[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <ListRow
        onClick={() => setOpen(true)}
        title={productName}
        meta={`Còn ${quantity}`}
        amount={`${formatVnd(avgCost)}/cái`}
      />

      <Sheet open={open} title={productName} onClose={() => setOpen(false)}>
        <SellForm inventoryId={id} quantity={quantity} avgCost={avgCost} />
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
