"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ListRow } from "../_components/list-row";
import { StickyBar } from "../_components/sticky-bar";
import { BULK_LIMIT, planBulkAdvance, type BulkOrder } from "@/lib/bulk-status";
import { bulkAdvanceAction } from "./actions";
import { BulkSheet } from "./bulk-sheet";

/** Dữ liệu đã tính sẵn ở server — component này không truy vấn gì thêm. */
export type OrderRowItem = BulkOrder & {
  href: string;
  customerName: string;
  metaText: string;
  amountText: string;
  hasGap: boolean;
  gapTitle: string;
};

export function OrdersList({ rows }: { rows: OrderRowItem[] }) {
  const router = useRouter();
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const plan = useMemo(
    () => planBulkAdvance(rows.filter((r) => picked.has(r.id))),
    [rows, picked],
  );

  function toggle(id: number) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      // Trần BULK_LIMIT áp ngay ở client để người dùng biết trước, server
      // vẫn cắt lại lần nữa.
      else if (next.size < BULK_LIMIT) next.add(id);
      return next;
    });
  }

  function stopSelecting() {
    setSelecting(false);
    setPicked(new Set());
  }

  async function confirm() {
    setPending(true);
    const result = await bulkAdvanceAction([...picked]);
    setPending(false);
    setConfirmOpen(false);
    stopSelecting();
    setNotice(
      result.failed.length === 0
        ? `Đã chuyển ${result.ok} đơn.`
        : `Đã chuyển ${result.ok}/${result.ok + result.failed.length} đơn — #${result.failed[0].id}: ${result.failed[0].reason}`,
    );
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        className="header-action-float"
        onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
      >
        {selecting ? "Xong" : "Chọn"}
      </button>

      {notice && <div className="ok-banner">{notice}</div>}

      {rows.map((r) => (
        <ListRow
          key={r.id}
          href={selecting ? undefined : r.href}
          onClick={selecting ? () => toggle(r.id) : undefined}
          title={
            <>
              {selecting && (
                <span
                  className={`pick-box${picked.has(r.id) ? " on" : ""}`}
                  aria-hidden="true"
                >
                  {picked.has(r.id) ? "✓" : ""}
                </span>
              )}
              {r.customerName}
              {r.hasGap && <span className="gap-dot" title={r.gapTitle} />}
            </>
          }
          meta={r.metaText}
          amount={r.amountText}
          trailing={<span className="lr-id">#{r.id}</span>}
        />
      ))}

      {selecting && (
        <StickyBar>
          <span className="sb-money">
            <strong>Đã chọn {picked.size}</strong>
          </span>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() =>
              setPicked(new Set(rows.slice(0, BULK_LIMIT).map((r) => r.id)))
            }
          >
            Chọn tất cả
          </button>
          <button
            type="button"
            className="btn"
            disabled={picked.size === 0}
            onClick={() => setConfirmOpen(true)}
          >
            Chuyển bước tiếp →
          </button>
        </StickyBar>
      )}

      <BulkSheet
        open={confirmOpen}
        plan={plan}
        pending={pending}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirm}
      />
    </>
  );
}
