"use client";

import { useMemo, useState } from "react";
import { Sheet } from "../../_components/sheet";
import type { CustomerOption } from "./types";

export type CustomerPick =
  | { mode: "existing"; id: number; name: string }
  | { mode: "new"; name: string };

export function CustomerSheet({
  open,
  onClose,
  customers,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  customers: CustomerOption[];
  onPick: (pick: CustomerPick) => void;
}) {
  const [q, setQ] = useState("");

  const needle = q.trim().toLowerCase();
  const matches = useMemo(
    () =>
      needle
        ? customers.filter((c) => c.name.toLowerCase().includes(needle))
        : customers,
    [customers, needle],
  );

  // Chỉ mời tạo mới khi đã gõ gì đó và không có khách nào TRÙNG KHÍT tên.
  // Trùng một phần vẫn mời tạo — "Lan" và "Lan Anh" là hai người.
  const exact = customers.some((c) => c.name.toLowerCase() === needle);
  const canCreate = needle.length > 0 && !exact;

  function pick(p: CustomerPick) {
    onPick(p);
    setQ("");
    onClose();
  }

  return (
    <Sheet open={open} title="Chọn khách" onClose={onClose}>
      <input
        className="sheet-search"
        type="search"
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Gõ tên khách…"
        enterKeyHint="done"
      />

      <div className="sheet-list">
        {canCreate && (
          <button
            type="button"
            className="sheet-item sheet-item-create"
            onClick={() => pick({ mode: "new", name: q.trim() })}
          >
            + Tạo khách mới «{q.trim()}»
          </button>
        )}
        {matches.map((c) => (
          <button
            key={c.id}
            type="button"
            className="sheet-item"
            onClick={() => pick({ mode: "existing", id: c.id, name: c.name })}
          >
            {c.warningFlag && <span className="warn-dot" title="Khách có cờ cảnh báo" />}
            {c.name}
          </button>
        ))}
        {matches.length === 0 && !canCreate && (
          <p className="muted">Chưa có khách nào. Gõ tên để tạo mới.</p>
        )}
      </div>
    </Sheet>
  );
}
