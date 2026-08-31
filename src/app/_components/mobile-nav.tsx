"use client";

import { useState } from "react";
import Link from "next/link";
import { logoutAction } from "../actions";
import { NavLinks } from "./nav-links";
import type { NavItem } from "./nav-config";
import { Icon } from "./icons";
import { Sheet } from "./sheet";

export function MobileNav({
  username,
  nav,
}: {
  username: string;
  nav: { main: NavItem[]; more: NavItem[] };
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <nav className="tabbar">
        <NavLinks items={nav.main.slice(0, 2)} variant="tab" />

        {/* Ô giữa LUÔN là tạo đơn — không đổi nghĩa theo màn đang mở.
            Nút nhập kho là nút riêng ở header màn Kho. */}
        <Link href="/orders/new" className="tab-new" aria-label="Tạo đơn">
          <Icon name="plus" size={26} />
        </Link>

        <NavLinks items={nav.main.slice(2)} variant="tab" />
        <button className="tab-link" type="button" onClick={() => setOpen(true)}>
          <Icon name="menu" size={22} />
          <span>Thêm</span>
        </button>
      </nav>

      <Sheet open={open} title={username} onClose={() => setOpen(false)}>
        <div className="sheet-menu">
          {nav.more.map((it) => (
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
      </Sheet>
    </>
  );
}
