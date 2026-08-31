import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { AppShell } from "../_components/app-shell";
import { ChipBar, Chip } from "../_components/chip";
import { ListRow } from "../_components/list-row";
import { listOrdersWithGaps, type OrderListRow } from "@/db/queries";
import { formatVnd } from "@/lib/format";
import { GAP_CODES, GAP_LABELS, type GapCode } from "@/lib/order-gaps";
import { STATUS_LABELS } from "@/lib/order-status";

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
  searchParams: Promise<{ q?: string; gap?: string; f?: string }>;
}) {
  const [session, { q, gap, f: rawF }, all] = await Promise.all([
    requireAuth(),
    searchParams,
    listOrdersWithGaps(),
  ]);

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
    // Chuỗi rỗng cũng phải ghi để phân biệt "chọn Tất cả" với "chưa chọn gì".
    p.set("f", code);
    return `/orders?${p.toString()}`;
  };

  return (
    <AppShell username={session.username} title="Đơn hàng">
      <form className="search" action="/orders" method="get">
        <input
          type="search"
          name="q"
          placeholder="Tìm tên khách / mã đơn…"
          defaultValue={q ?? ""}
          enterKeyHint="search"
        />
      </form>

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
        rows.map((o) => (
          <ListRow
            key={o.id}
            href={`/orders/${o.id}`}
            title={
              <>
                {o.customerName}
                {o.gaps.length > 0 && (
                  <span
                    className="gap-dot"
                    title={o.gaps.map((g) => GAP_LABELS[g]).join(" · ")}
                  />
                )}
              </>
            }
            meta={
              <>
                {STATUS_LABELS[o.status]} ·{" "}
                {o.status === "su_co"
                  ? "⚠️ Sự cố"
                  : o.isStale
                    ? `⏳ ${o.ageDays} ngày`
                    : `${o.ageDays}n`}
              </>
            }
            amount={formatVnd(o.amountDue)}
            trailing={<span className="lr-id">#{o.id}</span>}
          />
        ))
      )}
    </AppShell>
  );
}
