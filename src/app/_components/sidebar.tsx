import Link from "next/link";
import { logoutAction } from "../actions";
import { NavLinks } from "./nav-links";
import { NAV_ITEMS, MORE_ITEMS } from "./nav-config";
import { Icon } from "./icons";

export function Sidebar({ username }: { username: string }) {
  return (
    <aside className="sidebar">
      <Link href="/" className="sidebar-brand">
        HeyP
      </Link>
      <Link href="/orders/new" className="btn sidebar-cta">
        <Icon name="plus" size={18} /> Tạo đơn
      </Link>
      <nav className="sidebar-nav">
        <NavLinks items={NAV_ITEMS} variant="sidebar" />
        <div className="sidebar-sep" />
        <NavLinks items={MORE_ITEMS} variant="sidebar" />
      </nav>
      <div className="sidebar-foot">
        <span className="sidebar-user">{username}</span>
        <form action={logoutAction}>
          <button className="sidebar-link" type="submit">
            <Icon name="logout" size={18} /> <span>Đăng xuất</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
