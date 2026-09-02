import { requireAdmin } from "@/lib/auth";
import { listDeletionLog } from "@/db/deletion";
import { AppShell } from "@/app/_components/app-shell";
import { formatDateTime } from "@/lib/format";

const ENTITY_LABELS: Record<"order" | "customer", string> = {
  order: "Đơn",
  customer: "Khách",
};

export default async function DeletionsPage() {
  const [session, rows] = await Promise.all([
    requireAdmin(),
    listDeletionLog(),
  ]);

  return (
    <AppShell username={session.username} title="Nhật ký xoá" backHref="/">
      {rows.length === 0 ? (
        <div className="card empty">
          <p>Chưa có gì bị xoá.</p>
        </div>
      ) : (
        rows.map((r) => (
          <details key={r.id} className="card">
            <summary>
              {ENTITY_LABELS[r.entity]} #{r.entityId} · {r.deletedBy} ·{" "}
              {formatDateTime(r.deletedAt)}
            </summary>
            <div className="table-scroll">
              <pre className="small">
                {JSON.stringify(JSON.parse(r.snapshot), null, 2)}
              </pre>
            </div>
          </details>
        ))
      )}
    </AppShell>
  );
}
