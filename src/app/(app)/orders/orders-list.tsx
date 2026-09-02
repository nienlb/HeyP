"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable, type Column } from "@/app/_components/data-table";
import { StickyBar } from "@/app/_components/sticky-bar";
import { BULK_LIMIT, planBulkAdvance, type BulkOrder } from "@/lib/bulk-status";
import type { SortDir } from "@/lib/table-sort";
import { bulkAdvanceAction } from "./actions";
import { BulkSheet } from "./bulk-sheet";

/** Dữ liệu đã tính sẵn ở server — component này không truy vấn gì thêm. */
export type OrderRowItem = BulkOrder & {
  href: string;
  customerName: string;
  statusText: string;
  /** null = đơn bình thường, không hiện badge. */
  ageBadgeText: string | null;
  itemCount: number;
  deposit: number;
  depositText: string;
  amountDue: number;
  amountText: string;
  hasGap: boolean;
  gapTitle: string;
};

export function OrdersList({
  rows,
  sort,
  dir,
  sortBase,
}: {
  rows: OrderRowItem[];
  sort?: string;
  dir: SortDir;
  /**
   * Chuỗi query đã có sẵn (q/gap/f), KHÔNG gồm sort và dir.
   *
   * Phải là chuỗi chứ không phải hàm: component này là "use client", mà
   * React không cho truyền hàm từ server component sang client component
   * (không tuần tự hoá được). Vì vậy server gửi phần nền, client tự ghép.
   */
  sortBase: string;
}) {
  const sortHref = (key: string, nextDir: SortDir) => {
    const p = new URLSearchParams(sortBase);
    p.set("sort", key);
    p.set("dir", nextDir);
    return `/orders?${p.toString()}`;
  };

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

  // COLUMNS nằm TRONG component vì ô "Khách hàng" phải đọc `selecting`
  // và `picked` của chế độ chọn hàng loạt.
  const COLUMNS: Column<OrderRowItem>[] = [
    {
      key: "id",
      header: "#",
      width: "56px",
      cell: (r) => <span className="lr-id">{r.id}</span>,
    },
    {
      key: "khach",
      header: "Khách hàng",
      width: "minmax(0, 2fr)",
      mobile: true,
      sortBy: (r) => r.customerName,
      cell: (r) => (
        <>
          <span className="dt-name">
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
          </span>
          {/* Chỉ hiện trên điện thoại — desktop có cột riêng cho từng mẩu.
              Mã đơn phải nằm ở đây: trước v8-A nó là `trailing` của ListRow
              nên vẫn thấy được trên điện thoại, bỏ đi là mất thông tin. */}
          <span className="dt-sub">
            #{r.id} · {r.statusText}
            {r.ageBadgeText ? ` · ${r.ageBadgeText}` : ""} · {r.itemCount} món
          </span>
        </>
      ),
    },
    {
      key: "trang_thai",
      header: "Trạng thái",
      width: "160px",
      sortBy: (r) => r.statusText,
      cell: (r) => (
        <>
          {r.statusText}
          {r.ageBadgeText && <span className="dt-badge">{r.ageBadgeText}</span>}
        </>
      ),
    },
    {
      key: "mon",
      header: "Món",
      width: "64px",
      align: "right",
      sortBy: (r) => r.itemCount,
      cell: (r) => r.itemCount,
    },
    {
      key: "da_thu",
      header: "Đã thu",
      width: "120px",
      align: "right",
      sortBy: (r) => r.deposit,
      cell: (r) => r.depositText,
    },
    {
      key: "con_thu",
      header: "Còn thu",
      width: "130px",
      align: "right",
      mobile: true,
      sortBy: (r) => r.amountDue,
      cell: (r) => r.amountText,
    },
  ];

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

      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => (selecting ? undefined : r.href)}
        rowOnClick={selecting ? (r) => toggle(r.id) : undefined}
        sort={sort}
        dir={dir}
        sortHref={sortHref}
      />

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
