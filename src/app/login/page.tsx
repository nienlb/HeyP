import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getLogoUrl } from "@/lib/logo";
import { loginAction } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // Đã đăng nhập rồi thì về thẳng trang chính.
  if (await getSession()) redirect("/");

  const { error } = await searchParams;
  const logoUrl = getLogoUrl();

  return (
    <div className="login-page">
      <div className="card login-card">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="HeyP" className="login-logo-img" />
        ) : (
          <h1 className="login-brand">HeyP</h1>
        )}
        <p className="login-tagline">HeyP chào bạn</p>

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
