"use client";

import { useState } from "react";
import Link from "next/link";
import { logoutAction } from "../actions";
import { NavLinks } from "./nav-links";
import { NAV_ITEMS, MORE_ITEMS } from "./nav-config";
import { Icon } from "./icons";

export function MobileNav({
  username,
  logoUrl,
}: {
  username: string;
  logoUrl: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <header className="mobile-top">
        <Link href="/" className="mobile-brand">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="HeyP" className="mobile-logo-img" />
          ) : (
            "HeyP"
          )}
        </Link>
      </header>

      <nav className="tabbar">
        <NavLinks items={NAV_ITEMS} variant="tab" />
        <button
          className="tab-link"
          type="button"
          onClick={() => setOpen(true)}
        >
          <Icon name="menu" size={22} /> <span>Thêm</span>
        </button>
      </nav>

      <Link href="/orders/new" className="fab" aria-label="Tạo đơn">
        <Icon name="plus" size={26} />
      </Link>

      {open && (
        <div className="sheet-overlay" onClick={() => setOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-user">{username}</div>
            {MORE_ITEMS.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className="sheet-item"
                onClick={() => setOpen(false)}
              >
                <Icon name={it.icon} size={20} /> {it.label}
              </Link>
            ))}
            <form action={logoutAction}>
              <button className="sheet-item" type="submit">
                <Icon name="logout" size={20} /> Đăng xuất
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
