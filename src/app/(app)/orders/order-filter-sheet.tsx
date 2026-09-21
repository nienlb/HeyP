"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/app/_components/sheet";
import {
  EMPTY_FILTERS,
  activeGroupCount,
  filtersToParams,
  type OrderFilters,
} from "@/lib/order-filters";
import { FilterFields, GROUP_TITLES } from "./filter-fields";

export function OrderFilterButton({
  filters,
  baseQuery,
}: {
  filters: OrderFilters;
  baseQuery: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Bản nháp: chỉnh thoải mái trong Sheet, bấm Áp dụng mới đổi URL.
  const [draft, setDraft] = useState(filters);
  const n = activeGroupCount(filters);

  function go(f: OrderFilters) {
    setOpen(false);
    router.push(
      `/orders?${filtersToParams(f, new URLSearchParams(baseQuery))}`,
    );
  }

  return (
    <>
      <button
        type="button"
        className={`btn btn-outline flt-btn${n > 0 ? " flt-on" : ""}`}
        onClick={() => {
          setDraft(filters);
          setOpen(true);
        }}
      >
        Lọc{n > 0 ? ` (${n})` : ""}
      </button>
      <Sheet
        open={open}
        title="Lọc đơn"
        onClose={() => setOpen(false)}
        footer={
          <div className="sheet-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => go(EMPTY_FILTERS)}
            >
              Xoá lọc
            </button>
            <button type="button" className="btn" onClick={() => go(draft)}>
              Áp dụng
            </button>
          </div>
        }
      >
        {(["date", "status", "type", "due"] as const).map((g) => (
          <section key={g}>
            <h2 className="sec-label">{GROUP_TITLES[g]}</h2>
            <FilterFields group={g} value={draft} onChange={setDraft} />
          </section>
        ))}
      </Sheet>
    </>
  );
}
