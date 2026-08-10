import Link from "next/link";
import { logoutAction } from "../actions";

export function AppHeader({ username }: { username: string }) {
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link href="/orders" className="brand">
          HeyP
        </Link>
        <nav className="nav">
          <Link href="/orders">Đơn hàng</Link>
          <Link href="/customers">Khách hàng</Link>
          <Link href="/inventory">Tồn kho</Link>
          <Link href="/tracking">Tracking</Link>
          <Link href="/orders/new" className="btn btn-sm">
            + Tạo đơn
          </Link>
        </nav>
        <div className="spacer" />
        <span className="user">{username}</span>
        <form action={logoutAction}>
          <button className="btn btn-ghost btn-sm" type="submit">
            Đăng xuất
          </button>
        </form>
      </div>
    </header>
  );
}
