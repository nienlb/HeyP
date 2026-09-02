import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { Icon } from "@/app/_components/icons";
import { getSettings } from "@/db/queries";
import { saveSettingsAction } from "./actions";
import { PasswordForm } from "./password-form";
import { atLeast } from "@/lib/roles";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  const [session, { ok }, s] = await Promise.all([
    requireAuth(),
    searchParams,
    getSettings(),
  ]);

  return (
    <>
      {ok && <div className="ok-banner">✓ Đã lưu.</div>}

      {atLeast(session.role, "owner") && (
        <section className="card" style={{ maxWidth: 520 }}>
          <h2 className="card-title">Công thức giá</h2>

          <form action={saveSettingsAction}>
            <label className="field">
              <span>Tỷ giá bán (₫ cho 1¥)</span>
              <input
                type="text"
                name="sellRate"
                inputMode="numeric"
                defaultValue={s.sellRate.toLocaleString("vi-VN")}
              />
            </label>

            <label className="field">
              <span>Lời mặc định mỗi món (₫)</span>
              <input
                type="text"
                name="defaultMarginVnd"
                inputMode="numeric"
                defaultValue={s.defaultMarginVnd.toLocaleString("vi-VN")}
              />
            </label>

            <button type="submit" className="btn">
              Lưu
            </button>
          </form>

          <p className="muted small" style={{ marginBottom: 0 }}>
            Hai số này chỉ dùng để <strong>điền trước</strong> khi tạo đơn mới.
            Đơn đã tạo giữ nguyên tỷ giá của nó — đổi ở đây không làm thay đổi
            đơn cũ.
          </p>
        </section>
      )}

      <PasswordForm />

      <section className="card">
        <h2 className="card-title">Khác</h2>
        <div className="sheet-menu">
          <Link href="/backup" className="sheet-item">
            <Icon name="backup" size={20} /> Sao lưu
          </Link>
          {atLeast(session.role, "admin") && (
            <>
              <Link href="/admin/users" className="sheet-item">
                <Icon name="users" size={20} /> Thành viên
              </Link>
              <Link href="/admin/deletions" className="sheet-item">
                <Icon name="trash" size={20} /> Nhật ký xoá
              </Link>
            </>
          )}
        </div>
      </section>
    </>
  );
}
