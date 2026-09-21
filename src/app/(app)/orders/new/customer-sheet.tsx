"use client";

import { useMemo, useState } from "react";
import { Sheet } from "@/app/_components/sheet";
import { matchesCustomer, phoneNeedle } from "@/lib/phone";
import type { CustomerOption } from "./types";

export type CustomerPick =
  | { mode: "existing"; id: number; name: string }
  | { mode: "new"; name: string; phone?: string };

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
    () => customers.filter((c) => matchesCustomer(c, q)),
    [customers, q],
  );

  // Gõ dãy số → đang tìm theo SĐT. Không ai khớp thì mời tạo khách mới với
  // số đó; tên để trống và form sẽ bắt nhập.
  const phone = phoneNeedle(q);
  // Trùng tên KHÔNG chặn tạo mới — hai "Lan" khác SĐT là hai người. Chỉ nói
  // rõ là đang có người trùng tên.
  const sameName = customers.filter(
    (c) => c.name.toLowerCase() === needle,
  ).length;
  const canCreate =
    needle.length > 0 && (phone === null || matches.length === 0);

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
        placeholder="Gõ tên hoặc SĐT…"
        enterKeyHint="done"
      />

      <div className="sheet-list">
        {canCreate &&
          (phone !== null ? (
            <button
              type="button"
              className="sheet-item sheet-item-create"
              onClick={() => pick({ mode: "new", name: "", phone: q.trim() })}
            >
              + Tạo khách mới với SĐT {q.trim()}
            </button>
          ) : (
            <button
              type="button"
              className="sheet-item sheet-item-create"
              onClick={() => pick({ mode: "new", name: q.trim() })}
            >
              + Tạo khách mới «{q.trim()}»
              {sameName > 0 && ` (đã có ${sameName} người trùng tên)`}
            </button>
          ))}
        {matches.map((c) => (
          <button
            key={c.id}
            type="button"
            className="sheet-item cust-item"
            onClick={() => pick({ mode: "existing", id: c.id, name: c.name })}
          >
            {c.warningFlag && (
              <span className="warn-dot" title="Khách có cờ cảnh báo" />
            )}
            <span className="cust-text">
              <span>{c.name}</span>
              <span className={c.phone ? "cust-phone" : "cust-phone muted"}>
                {c.phone ?? "chưa có SĐT"}
              </span>
            </span>
          </button>
        ))}
        {matches.length === 0 && !canCreate && (
          <p className="muted">
            Chưa có khách nào. Gõ tên hoặc SĐT để tạo mới.
          </p>
        )}
      </div>
    </Sheet>
  );
}
