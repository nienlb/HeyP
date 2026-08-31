import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { AppShell } from "../_components/app-shell";
import { listPackages } from "@/db/queries";
import { knownCarriers } from "@/lib/tracking";
import { formatDateTime } from "@/lib/format";
import { CreatePackageForm } from "./create-package-form";
import { runSweepAction, updatePackageStatusAction } from "./actions";

export default async function TrackingPage() {
  const [session, pkgs] = await Promise.all([requireAuth(), listPackages()]);
  const carriers = knownCarriers();
  const needAttention = pkgs.filter((p) => p.needsManualCheck);

  return (
    <AppShell
      username={session.username}
      title="Tracking"
      action={
        <form action={runSweepAction}>
          <button className="btn btn-ghost btn-sm" type="submit">
            Chạy tra tự động ngay
          </button>
        </form>
      }
    >
        {carriers.length === 0 && (
          <div className="warn-flag">
            Chưa cấu hình đơn vị vận chuyển nào để tra tự động — kiện chế độ “Tự
            động” sẽ bị gắn cờ “tra tay”. Cập nhật trạng thái bằng tay vẫn đầy đủ.
          </div>
        )}

        <CreatePackageForm carriers={carriers} />

        {needAttention.length > 0 && (
          <section className="attention">
            <h2>⚠️ Cần tra tay ({needAttention.length})</h2>
          </section>
        )}

        {pkgs.length === 0 ? (
          <div className="card empty">
            <p>Chưa có kiện nào. Thêm kiện ở trên khi hàng bắt đầu đi.</p>
          </div>
        ) : (
          <div className="order-list">
            {pkgs.map((p) => (
              <div
                key={p.id}
                className={`card pkg-item${p.needsManualCheck ? " pkg-flag" : ""}`}
              >
                <div className="pkg-head">
                  <span className="pkg-code">{p.trackingCode}</span>
                  {p.carrier && <span className="badge badge-type">{p.carrier}</span>}
                  <span className={`badge ${p.mode === "auto" ? "badge-status" : "status-huy"}`}>
                    {p.mode === "auto" ? "Tự động" : "Tra tay"}
                  </span>
                  {p.needsManualCheck && (
                    <span className="badge status-su_co">⚠️ Tra tay</span>
                  )}
                  {p.weightKg != null && (
                    <span className="muted">{p.weightKg} kg</span>
                  )}
                </div>
                <div className="pkg-meta">
                  <span>
                    Trạng thái:{" "}
                    <strong>{p.trackingStatus ?? "— chưa có —"}</strong>
                  </span>
                  {p.lastCheckedAt && (
                    <span className="muted">
                      {" "}
                      · tra lúc {formatDateTime(p.lastCheckedAt)}
                    </span>
                  )}
                </div>
                <div className="pkg-orders-line">
                  Đơn:{" "}
                  {p.orderIds.length === 0 ? (
                    <span className="muted">chưa gắn</span>
                  ) : (
                    p.orderIds.map((oid) => (
                      <Link key={oid} href={`/orders/${oid}`} className="pkg-order-link">
                        #{oid}
                      </Link>
                    ))
                  )}
                </div>
                <form action={updatePackageStatusAction} className="pkg-update">
                  <input type="hidden" name="packageId" value={p.id} />
                  <input
                    name="status"
                    placeholder="Cập nhật trạng thái bằng tay…"
                    defaultValue=""
                  />
                  <button type="submit" className="btn btn-sm">
                    Lưu
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
    </AppShell>
  );
}
