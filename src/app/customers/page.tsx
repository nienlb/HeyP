import { requireAuth } from "@/lib/auth";
import { AppShell } from "../_components/app-shell";
import { ListRow } from "../_components/list-row";
import { listCustomersWithTotals } from "@/db/queries";
import { formatVnd } from "@/lib/format";

export default async function CustomersPage() {
  const [session, customers] = await Promise.all([
    requireAuth(),
    listCustomersWithTotals(),
  ]);

  return (
    <AppShell username={session.username} title="Khách hàng">
      {customers.length === 0 ? (
        <div className="card empty">
          <p>Chưa có khách nào. Khách sẽ được tạo khi lên đơn.</p>
        </div>
      ) : (
        customers.map((c) => (
          <ListRow
            key={c.id}
            href={`/orders?q=${encodeURIComponent(c.name)}`}
            title={
              <>
                {c.warningFlag && (
                  <span
                    className="warn-dot"
                    title={c.warningReason ?? "Khách có cờ cảnh báo"}
                  />
                )}
                {c.name}
              </>
            }
            meta={`${c.phone ?? "—"} · ${c.orderCount} đơn`}
            amount={
              c.outstanding > 0 ? formatVnd(c.outstanding) : undefined
            }
          />
        ))
      )}
    </AppShell>
  );
}
