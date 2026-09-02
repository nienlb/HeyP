import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { NavLinks } from "./nav-links";
import type { NavItem } from "./nav-config";
import { Icon } from "./icons";

export function Sidebar({
  username,
  logoUrl,
  nav,
}: {
  username: string;
  logoUrl: string | null;
  nav: { main: NavItem[]; more: NavItem[] };
}) {
  return (
    <aside className="sidebar">
      <Link href="/" className="sidebar-brand">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="HeyP" className="sidebar-logo-img" />
        ) : (
          "HeyP"
        )}
      </Link>
      <Link href="/orders/new" className="btn sidebar-cta">
        <Icon name="plus" size={18} /> Tạo đơn
      </Link>
      <nav className="sidebar-nav">
        <NavLinks items={nav.main} variant="sidebar" />
        <div className="sidebar-sep" />
        <NavLinks items={nav.more} variant="sidebar" />
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
