import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { loginAction } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // Đã đăng nhập rồi thì về thẳng trang chính.
  if (await getSession()) redirect("/");

  const { error } = await searchParams;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "20px",
      }}
    >
      <div className="card" style={{ width: "100%", maxWidth: 380 }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 22 }}>HeyP</h1>
        <p style={{ margin: "0 0 20px", color: "var(--muted)", fontSize: 14 }}>
          HeyP chào bạn
        </p>

        {error ? (
          <div className="error">Sai tài khoản hoặc mật khẩu.</div>
        ) : null}

        <form action={loginAction}>
          <div className="field">
            <label htmlFor="username">Tài khoản</label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              required
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="password">Mật khẩu</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <button className="btn" type="submit" style={{ width: "100%" }}>
            Đăng nhập
          </button>
        </form>
      </div>
    </div>
  );
}
