import { requireAuth } from "@/lib/auth";
import { AppShell } from "@/app/_components/app-shell";
import { listPackages } from "@/db/queries";
import { knownCarriers } from "@/lib/tracking";
import { CreatePackageSheet } from "./create-package-sheet";
import { PackageRow } from "./package-row";
import { runSweepAction } from "./actions";

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

        <div style={{ marginBottom: 16 }}>
          <CreatePackageSheet carriers={carriers} />
        </div>

        {needAttention.length > 0 && (
          <p className="muted small">⚠️ {needAttention.length} kiện cần tra tay.</p>
        )}

        {pkgs.length === 0 ? (
          <div className="card empty">
            <p>Chưa có kiện nào. Thêm kiện ở trên khi hàng bắt đầu đi.</p>
          </div>
        ) : (
          pkgs.map((p) => <PackageRow key={p.id} pkg={p} />)
        )}
    </AppShell>
  );
}
