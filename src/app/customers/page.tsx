import { requireAuth } from "@/lib/auth";
import { AppShell } from "../_components/app-shell";
import { listCustomersWithTotals } from "@/db/queries";
import { formatVnd } from "@/lib/format";
import { CustomersList, type CustomerItem } from "./customers-list";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const [session, { err }, customers] = await Promise.all([
    requireAuth(),
    searchParams,
    listCustomersWithTotals(),
  ]);

  const items: CustomerItem[] = customers.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    orderCount: c.orderCount,
    outstandingText: c.outstanding > 0 ? formatVnd(c.outstanding) : null,
    warningFlag: c.warningFlag,
    warningReason: c.warningReason,
  }));

  return (
    <AppShell username={session.username} title="Khách hàng">
      {err && <div className="error">{err}</div>}
      {items.length === 0 ? (
        <div className="card empty">
          <p>Chưa có khách nào. Khách sẽ được tạo khi lên đơn.</p>
        </div>
      ) : (
        <CustomersList
          customers={items}
          canDelete={session.role === "admin"}
        />
      )}
    </AppShell>
  );
}
