import { requireAuth } from "@/lib/auth";
import { AppShell } from "../_components/app-shell";

export default async function BackupPage() {
  const session = await requireAuth();

  return (
    <AppShell username={session.username} title="Sao lưu">
        <div className="card" style={{ marginBottom: 16 }}>
          <p style={{ margin: 0, lineHeight: 1.7 }}>
            Dữ liệu nằm trên <strong>Supabase</strong>. Gói miễn phí{" "}
            <strong>không có sao lưu tự động</strong>, nên hệ thống tự chạy{" "}
            <code>pg_dump</code> mỗi ngày bằng GitHub Actions và giữ bản dump
            trong phần Artifacts của lần chạy đó.
          </p>
          <p className="muted" style={{ marginBottom: 0 }}>
            Xem và tải bản sao lưu: mở repo trên GitHub → tab{" "}
            <strong>Actions</strong> → workflow <strong>db-backup</strong> → chọn
            lần chạy → tải Artifact. Ảnh nằm ở Supabase Storage (bucket{" "}
            <code>photos</code>), tải xuống từ dashboard Supabase khi cần.
          </p>
        </div>

        <div className="card">
          <p style={{ margin: 0, lineHeight: 1.7 }}>
            <strong>Khôi phục</strong> (ghi đè dữ liệu hiện tại) chạy trong
            terminal, sau khi đã tải file dump về:
          </p>
          <p className="muted" style={{ marginBottom: 0 }}>
            <code>psql &quot;$DIRECT_URL&quot; -f duong-dan-file.sql</code>
          </p>
        </div>
    </AppShell>
  );
}
