import { requireAuth } from "@/lib/auth";
import { listPackages } from "@/db/queries";
import { knownCarriers } from "@/lib/tracking";
import { CreatePackageSheet } from "./create-package-sheet";
import { PackageRow } from "./package-row";
import { runSweepAction } from "./actions";

export default async function TrackingPage() {
  const [, pkgs] = await Promise.all([requireAuth(), listPackages()]);
  const carriers = knownCarriers();
  const needAttention = pkgs.filter((p) => p.needsManualCheck);

  return (
    <>
        {/* Trước v8-B nút này nằm ở ô hành động của header. Header giờ ở
            (app)/layout.tsx nên trang không chèn vào được — đưa xuống thân
            trang, đổi btn-ghost → btn-outline để đứng giữa nội dung vẫn thấy. */}
        <div style={{ marginBottom: "var(--sp-4)" }}>
          <form action={runSweepAction}>
            <button className="btn btn-outline btn-sm" type="submit">
              Chạy tra tự động ngay
            </button>
          </form>
        </div>

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
    </>
  );
}
