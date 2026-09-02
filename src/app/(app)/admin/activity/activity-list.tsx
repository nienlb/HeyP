"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/app/_components/data-table";
import type { SortDir } from "@/lib/table-sort";

export type ActivityItem = {
  id: number;
  actor: string;
  actionText: string;
  entity: string;
  entityId: number | null;
  snapshotHref: string | null;
  detailText: string;
  createdAt: Date;
  timeText: string;
};

const COLUMNS: Column<ActivityItem>[] = [
  {
    key: "luc",
    header: "Thời gian",
    width: "150px",
    sortBy: (r) => r.createdAt.getTime(),
    cell: (r) => r.timeText,
  },
  {
    key: "nguoi",
    header: "Người",
    width: "110px",
    mobile: true,
    sortBy: (r) => r.actor,
    cell: (r) => (
      <>
        <span className="dt-name">{r.actor}</span>
        {/* Chỉ hiện trên điện thoại — desktop có cột riêng cho từng mẩu. */}
        <span className="dt-sub">
          {r.timeText} · {r.actionText}
          {r.entityId !== null ? ` #${r.entityId}` : ""}
        </span>
      </>
    ),
  },
  {
    key: "hanh_dong",
    header: "Hành động",
    width: "minmax(0, 1fr)",
    sortBy: (r) => r.actionText,
    cell: (r) => r.actionText,
  },
  {
    key: "doi_tuong",
    header: "Đối tượng",
    width: "130px",
    cell: (r) =>
      r.entityId === null ? (
        r.entity
      ) : r.snapshotHref ? (
        <Link href={r.snapshotHref}>
          {r.entity} #{r.entityId}
        </Link>
      ) : (
        `${r.entity} #${r.entityId}`
      ),
  },
  {
    key: "chi_tiet",
    header: "Chi tiết",
    width: "minmax(0, 1.5fr)",
    cell: (r) => <span className="small">{r.detailText}</span>,
  },
];

export function ActivityList({
  items,
  sort,
  dir,
  sortBase,
}: {
  items: ActivityItem[];
  sort?: string;
  dir: SortDir;
  /**
   * Chuỗi query đã có sẵn (actor/entity), KHÔNG gồm sort và dir. Phải là
   * chuỗi chứ không phải hàm: component này là "use client", React không
   * tuần tự hoá được prop kiểu hàm qua ranh giới server→client.
   */
  sortBase: string;
}) {
  const sortHref = (key: string, nextDir: SortDir) => {
    const p = new URLSearchParams(sortBase);
    p.set("sort", key);
    p.set("dir", nextDir);
    return `/admin/activity?${p.toString()}`;
  };

  return (
    <DataTable
      columns={COLUMNS}
      rows={items}
      rowKey={(r) => r.id}
      sort={sort}
      dir={dir}
      sortHref={sortHref}
    />
  );
}
