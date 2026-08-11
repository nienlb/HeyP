import { requireAuth } from "@/lib/auth";
import { AppHeader } from "../_components/app-header";
import { listBackups } from "@/lib/backup";
import { config } from "@/lib/config";
import { formatDateTime } from "@/lib/format";
import { backupNowAction } from "./actions";

export default async function BackupPage() {
  const session = await requireAuth();
  const backups = listBackups();

  return (
    <>
      <AppHeader username={session.username} />
      <main className="container">
        <div className="page-head">
          <h1>Sao lưu</h1>
          <form action={backupNowAction}>
            <button className="btn btn-sm" type="submit">
              Sao lưu ngay
            </button>
          </form>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <p style={{ margin: 0, lineHeight: 1.7 }}>
            Hệ thống <strong>tự động sao lưu mỗi ngày</strong> (file dữ liệu +
            thư mục ảnh) khi app đang chạy, giữ <strong>{config.backupKeep}</strong>{" "}
            bản gần nhất. Mỗi bản là một ảnh chụp nhất quán của toàn bộ dữ liệu.
          </p>
          <p className="muted" style={{ marginBottom: 0 }}>
            Khôi phục khi cần (ghi đè dữ liệu hiện tại) chạy trong terminal:{" "}
            <code>npm run db:restore -- --list</code> để xem, rồi{" "}
            <code>npm run db:restore</code> để phục hồi bản mới nhất.
          </p>
        </div>

        <section className="status-group">
          <h2>
            Các bản sao lưu <span className="count">{backups.length}</span>
          </h2>
          {backups.length === 0 ? (
            <div className="card empty">
              <p>Chưa có bản sao lưu nào. Bấm “Sao lưu ngay” để tạo bản đầu.</p>
            </div>
          ) : (
            <div className="order-list">
              {backups.map((b) => (
                <div key={b.name} className="card pkg-item">
                  <div className="pkg-head">
                    <span className="pkg-code">{b.name}</span>
                    <span className="muted">{formatDateTime(b.at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
