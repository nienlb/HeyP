"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  clearGroup,
  filtersToParams,
  isGroupActive,
  type FilterGroup,
  type OrderFilters,
} from "@/lib/order-filters";
import { FilterFields, GROUP_TITLES } from "./filter-fields";

/**
 * Nút ▾ đầu cột kiểu Excel. Bảng nổi dùng position: fixed vì ô tiêu đề
 * (.dt-c) có overflow: hidden — absolute sẽ bị cắt mất.
 */
export function ColumnFilter({
  group,
  filters,
  baseQuery,
}: {
  group: FilterGroup;
  filters: OrderFilters;
  baseQuery: string;
}) {
  const router = useRouter();
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [draft, setDraft] = useState(filters);
  const active = isGroupActive(filters, group);

  useEffect(() => {
    if (!pos) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !btn.current?.contains(t)) setPos(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPos(null);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pos]);

  function toggle() {
    if (pos) return setPos(null);
    const r = btn.current!.getBoundingClientRect();
    // Không để bảng nổi (rộng 280px) tràn mép phải cửa sổ.
    setPos({
      top: r.bottom + 4,
      left: Math.min(r.left, window.innerWidth - 296),
    });
    setDraft(filters);
  }

  function go(f: OrderFilters) {
    setPos(null);
    router.push(
      `/orders?${filtersToParams(f, new URLSearchParams(baseQuery))}`,
    );
  }

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`col-flt${active ? " col-flt-on" : ""}`}
        aria-label={`Lọc theo ${GROUP_TITLES[group]}`}
        onClick={toggle}
      >
        ▾
      </button>
      {pos && (
        <div
          ref={panel}
          className="col-flt-panel"
          style={{ top: pos.top, left: pos.left }}
        >
          <FilterFields group={group} value={draft} onChange={setDraft} />
          <div className="sheet-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => go(clearGroup(filters, group))}
            >
              Xoá lọc
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => go(draft)}
            >
              Áp dụng
            </button>
          </div>
        </div>
      )}
    </>
  );
}
