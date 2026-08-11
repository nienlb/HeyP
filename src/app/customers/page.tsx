import { requireAuth } from "@/lib/auth";
import { AppShell } from "../_components/app-shell";
import { listCustomersWithTotals } from "@/db/queries";
import { formatVnd } from "@/lib/format";

export default async function CustomersPage() {
  const session = await requireAuth();
  const customers = listCustomersWithTotals();

  return (
    <AppShell username={session.username}>
        <div className="page-head">
          <h1>Khách hàng</h1>
        </div>

        {customers.length === 0 ? (
          <div className="card empty">
            <p>Chưa có khách nào. Khách sẽ được tạo khi lên đơn.</p>
          </div>
        ) : (
          <div className="table-scroll card">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Khách</th>
                  <th>SĐT / Zalo</th>
                  <th className="num">Số đơn</th>
                  <th className="num">Còn phải thu</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.name}</strong>
                      {c.warningFlag && (
                        <span
                          className="flag"
                          title={c.warningReason ?? "Khách có cờ cảnh báo"}
                        >
                          {" "}
                          ⚠️
                        </span>
                      )}
                      {c.warningFlag && c.warningReason && (
                        <div className="flag-reason">{c.warningReason}</div>
                      )}
                    </td>
                    <td>{c.phone ?? "—"}</td>
                    <td className="num">{c.orderCount}</td>
                    <td className="num">
                      {c.outstanding > 0 ? (
                        <strong>{formatVnd(c.outstanding)}</strong>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </AppShell>
  );
}
