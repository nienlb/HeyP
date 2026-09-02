import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { AppShell } from "@/app/_components/app-shell";
import { ChipBar, Chip } from "@/app/_components/chip";
import { listOrdersWithGaps, type OrderListRow } from "@/db/queries";
import { formatVnd } from "@/lib/format";
import { GAP_CODES, GAP_LABELS, type GapCode } from "@/lib/order-gaps";
import { STATUS_LABELS } from "@/lib/order-status";
import { ageBadge } from "@/lib/order-badge";
import type { SortDir } from "@/lib/table-sort";
import { OrdersList } from "./orders-list";

type RowWithGaps = OrderListRow & { gaps: GapCode[] };

const FILTERS = [
  { code: "chu_y", label: "Cần chú ý" },
  { code: "", label: "Tất cả" },
  { code: "dang_ve", label: "Đang về" },
  { code: "da_giao", label: "Đã giao" },
  { code: "chua_thu", label: "Chưa thu đủ" },
] as const;

function matchesFilter(r: RowWithGaps, code: string): boolean {
  switch (code) {
    case "chu_y":
      return r.needsAttention;
    case "dang_ve":
      return r.status === "da_mua_tq";
    case "da_giao":
      return r.status === "da_giao_khach";
    case "chua_thu":
      // Đơn nhập kho không có khách — amountDue của nó không phải nợ của ai.
      return r.amountDue > 0 && r.status !== "huy" && r.orderType !== "nhap_kho";
    default:
      return true;
  }
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    gap?: string;
    f?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const [session, { q, gap, f: rawF, sort, dir: rawDir }, all] =
    await Promise.all([requireAuth(), searchParams, listOrdersWithGaps()]);

  const dir: SortDir = rawDir === "asc" ? "asc" : "desc";

  // Lọc tìm kiếm giữ nguyên hành vi cũ của listOrders(q).
  const needle = q?.trim().toLowerCase();
  const searched = needle
    ? all.filter(
        (r) =>
          r.customerName.toLowerCase().includes(needle) ||
          String(r.id).includes(needle) ||
          `#${r.id}`.includes(needle),
      )
    : all;

  const activeGap = (GAP_CODES as readonly string[]).includes(gap ?? "")
    ? (gap as GapCode)
    : null;
  const gapFiltered = activeGap
    ? searched.filter((r) => r.gaps.includes(activeGap))
    : searched;

  const attentionCount = gapFiltered.filter((r) => r.needsAttention).length;
  // Mặc định mở ở "Cần chú ý" khi có đơn cần chú ý; không thì "Tất cả".
  const f =
    typeof rawF === "string" ? rawF : attentionCount > 0 ? "chu_y" : "";

  const rows = gapFiltered.filter((r) => matchesFilter(r, f)).sort((a, b) => {
    // Sự cố lên trước, rồi tới đơn đứng lâu nhất.
    if (a.status === "su_co" && b.status !== "su_co") return -1;
    if (b.status === "su_co" && a.status !== "su_co") return 1;
    return b.ageDays - a.ageDays;
  });

  const qs = (code: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (activeGap) p.set("gap", activeGap);
    if (sort) p.set("sort", sort);
    if (rawDir) p.set("dir", rawDir);
    // Chuỗi rỗng cũng phải ghi để phân biệt "chọn Tất cả" với "chưa chọn gì".
    p.set("f", code);
    return `/orders?${p.toString()}`;
  };

  // Chuỗi nền cho link sắp xếp. Gửi đi dưới dạng CHUỖI, không phải hàm —
  // OrdersList là client component, hàm không qua được ranh giới đó.
  const sortBase = (() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (activeGap) p.set("gap", activeGap);
    p.set("f", f);
    return p.toString();
  })();

  return (
    <AppShell username={session.username} title="Đơn hàng">
      <div className="list-toolbar">
        <form className="search" action="/orders" method="get">
          <input
            type="search"
            name="q"
            placeholder="Tìm tên khách / mã đơn…"
            defaultValue={q ?? ""}
            enterKeyHint="search"
          />
        </form>
      </div>

      <ChipBar>
        {FILTERS.map((it) => (
          <Chip
            key={it.code}
            href={qs(it.code)}
            label={it.label}
            active={f === it.code}
            count={it.code === "chu_y" ? attentionCount : undefined}
          />
        ))}
      </ChipBar>

      {activeGap && (
        <div className="filter-bar">
          <span className="gap-chip">Đang lọc: {GAP_LABELS[activeGap]}</span>
          <Link href="/orders" className="btn btn-sm btn-outline">
            Bỏ lọc
          </Link>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="card empty">
          {q ? (
            <p>Không tìm thấy đơn khớp «{q}».</p>
          ) : (
            <p>Không có đơn nào ở mục này.</p>
          )}
        </div>
      ) : (
        <OrdersList
          sort={sort}
          dir={dir}
          sortBase={sortBase}
          rows={rows.map((o) => ({
            id: o.id,
            orderType: o.orderType,
            status: o.status,
            goodsTotalCny: o.goodsTotalCny,
            href: `/orders/${o.id}`,
            customerName: o.customerName,
            statusText: STATUS_LABELS[o.status],
            ageBadgeText: ageBadge(o),
            itemCount: o.itemCount,
            deposit: o.deposit,
            depositText: o.deposit > 0 ? formatVnd(o.deposit) : "—",
            amountDue: o.amountDue,
            amountText: formatVnd(o.amountDue),
            hasGap: o.gaps.length > 0,
            gapTitle: o.gaps.map((g) => GAP_LABELS[g]).join(" · "),
          }))}
        />
      )}
    </AppShell>
  );
}
