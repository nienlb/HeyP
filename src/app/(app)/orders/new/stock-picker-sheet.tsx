"use client";

import { useMemo, useState } from "react";
import { Sheet } from "@/app/_components/sheet";
import { photoUrl } from "@/lib/photos";
import { displayVariant } from "@/lib/product-catalog";
import { INVENTORY_SOURCE_LABELS, type InventorySource } from "@/lib/inventory";
import type { StockOption } from "./types";

/** Chọn một dòng hàng đang có trong kho để bán (đơn "Bán từ kho"). */
export function StockPickerSheet({
  open,
  onClose,
  stock,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  stock: StockOption[];
  onPick: (s: StockOption) => void;
}) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const rows = useMemo(
    () =>
      needle
        ? stock.filter((s) =>
            `${s.name} ${s.size} ${s.color}`.toLowerCase().includes(needle),
          )
        : stock,
    [stock, needle],
  );

  return (
    <Sheet open={open} title="Chọn hàng trong kho" onClose={onClose}>
      <input
        className="sheet-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Tìm tên, size, màu…"
        enterKeyHint="done"
      />
      <div className="sheet-list">
        {rows.map((s) => (
          <button
            key={s.id}
            type="button"
            className="sheet-item stock-item"
            onClick={() => {
              onPick(s);
              setQ("");
              onClose();
            }}
          >
            {s.photoId ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl(s.photoId, "thumb")}
                alt=""
                className="ic-thumb"
                loading="lazy"
              />
            ) : (
              <span className="ic-thumb stock-nophoto" aria-hidden="true" />
            )}
            <span className="cust-text">
              <span>{s.name}</span>
              <span className="cust-phone">
                {[
                  displayVariant(s),
                  s.source !== "active"
                    ? INVENTORY_SOURCE_LABELS[s.source as InventorySource]
                    : "",
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </span>
            </span>
            <span className="stock-left num">còn {s.quantity}</span>
          </button>
        ))}
        {rows.length === 0 && (
          <p className="muted">
            {stock.length === 0
              ? "Kho đang trống."
              : `Không có hàng khớp «${q}».`}
          </p>
        )}
      </div>
    </Sheet>
  );
}
