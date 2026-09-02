import { requireAuth } from "@/lib/auth";
import { getSettings } from "@/db/queries";
import { formatDateTime } from "@/lib/format";

export default async function BackupPage() {
  const [session, settings] = await Promise.all([requireAuth(), getSettings()]);

  return (
    <>
      <div className="card">
        <p>
          Supabase gói miễn phí <strong>không có sao lưu tự động</strong> và
          không có PITR. Bản sao duy nhất là bản gần nhất bạn tự tải.
        </p>
        <p className="muted">
          Lần sao lưu gần nhất:{" "}
          {settings.lastBackupAt
            ? formatDateTime(settings.lastBackupAt)
            : "chưa bao giờ"}
        </p>
        <a href="/api/backup" className="btn" download>
          Tải bản sao lưu
        </a>
      </div>

      <div className="card">
        <p>
          <strong>Ảnh không nằm trong file này.</strong> Ảnh ở Supabase Storage
          (bucket <code>photos</code>) — tải từ dashboard Supabase khi cần.
        </p>
      </div>

      <div className="card">
        <p>
          <strong>Khôi phục</strong> chạy trên máy tính, sau khi đã tải file về.
          Lệnh này <strong>ghi đè toàn bộ dữ liệu hiện tại</strong>:
        </p>
        <p className="muted">
          <code>
            node --experimental-strip-types scripts/restore-from-json.ts
            duong-dan-file.json --toi-chac-chan
          </code>
        </p>
      </div>
    </>
  );
}
