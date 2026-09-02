import { requireAuth } from "@/lib/auth";
import { AppShell } from "@/app/_components/app-shell";
import { ChipBar, Chip } from "@/app/_components/chip";
import { listCustomerStats, listOrderYears } from "@/db/queries";
import { formatVnd } from "@/lib/format";
import type { SortDir } from "@/lib/table-sort";
import { CustomersList, type CustomerItem } from "./customers-list";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{
    err?: string;
    year?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const [session, { err, year: rawYear, sort, dir: rawDir }, years] =
    await Promise.all([requireAuth(), searchParams, listOrderYears()]);

  // Thiếu hoặc rỗng = tất cả các năm. Năm lạ (gõ tay vào URL) cũng về tất cả.
  const parsed = Number(rawYear);
  const year =
    rawYear && Number.isInteger(parsed) && years.includes(parsed)
      ? parsed
      : null;
  const dir: SortDir = rawDir === "asc" ? "asc" : "desc";

  const customers = await listCustomerStats(year);

  const items: CustomerItem[] = customers.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    phoneText: c.phone ?? "—",
    orderCount: c.orderCount,
    itemCount: c.itemCount,
    paidVnd: c.paidVnd,
    paidText: c.paidVnd > 0 ? formatVnd(c.paidVnd) : "—",
    outstandingVnd: c.outstandingVnd,
    outstandingText: c.outstandingVnd > 0 ? formatVnd(c.outstandingVnd) : "—",
    warningFlag: c.warningFlag,
    warningReason: c.warningReason,
  }));

  const chipHref = (y: number | null) => {
    const p = new URLSearchParams();
    if (y !== null) p.set("year", String(y));
    if (sort) p.set("sort", sort);
    if (rawDir) p.set("dir", rawDir);
    const qs = p.toString();
    return qs ? `/customers?${qs}` : "/customers";
  };

  // Chuỗi nền cho link sắp xếp — gửi dạng CHUỖI, không phải hàm:
  // CustomersList là client component, hàm không qua được ranh giới đó.
  const sortBase = year === null ? "" : `year=${year}`;

  return (
    <AppShell username={session.username} title="Khách hàng">
      {err && <div className="error">{err}</div>}

      <ChipBar>
        <Chip href={chipHref(null)} label="Tất cả" active={year === null} />
        {years.map((y) => (
          <Chip
            key={y}
            href={chipHref(y)}
            label={String(y)}
            active={year === y}
          />
        ))}
      </ChipBar>

      {items.length === 0 ? (
        <div className="card empty">
          <p>
            {year === null
              ? "Chưa có khách nào. Khách sẽ được tạo khi lên đơn."
              : `Không có khách nào đặt đơn trong năm ${year}.`}
          </p>
        </div>
      ) : (
        <CustomersList
          customers={items}
          canDelete={session.role === "admin"}
          sort={sort}
          dir={dir}
          sortBase={sortBase}
        />
      )}
    </AppShell>
  );
}
