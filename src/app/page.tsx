import { requireAuth } from "@/lib/auth";
import { logoutAction } from "./actions";

export default async function HomePage() {
  const session = await requireAuth();

  return (
    <div className="container">
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>HeyP</h1>
          <p style={{ margin: "2px 0 0", color: "var(--muted)", fontSize: 14 }}>
            Xin chào, <strong>{session.username}</strong>
          </p>
        </div>
        <form action={logoutAction}>
          <button className="btn btn-ghost" type="submit">
            Đăng xuất
          </button>
        </form>
      </header>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Khung hệ thống đã sẵn sàng</h2>
        <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>
          Đây là Phase 0 — mới dựng xong khung repo, đăng nhập và kết nối CSDL.
          Các màn nghiệp vụ (tạo đơn, danh sách đơn, khách hàng, tồn kho…) sẽ được
          thêm dần từ Phase 1 trở đi theo implementation plan.
        </p>
      </div>
    </div>
  );
}
