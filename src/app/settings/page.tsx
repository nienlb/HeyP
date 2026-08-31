import { requireAuth } from "@/lib/auth";
import { AppShell } from "../_components/app-shell";
import { getSettings } from "@/db/queries";
import { saveSettingsAction } from "./actions";

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
    <AppShell username={session.username} title="Cài đặt">
      {ok && <div className="ok-banner">✓ Đã lưu.</div>}

      <section className="card" style={{ maxWidth: 520 }}>
        <h2 className="card-title">Công thức giá</h2>

        <form action={saveSettingsAction} className="stack-form">
          <label>
            <span>Tỷ giá bán (₫ cho 1¥)</span>
            <input
              type="text"
              name="sellRate"
              inputMode="numeric"
              defaultValue={s.sellRate.toLocaleString("vi-VN")}
            />
          </label>

          <label>
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
    </AppShell>
  );
}
