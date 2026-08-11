"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";
import type { NavItem } from "./nav-config";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function NavLinks({
  items,
  variant,
}: {
  items: NavItem[];
  variant: "sidebar" | "tab";
}) {
  const pathname = usePathname();
  return (
    <>
      {items.map((it) => {
        const active = isActive(pathname, it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`${variant}-link${active ? " active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <Icon name={it.icon} size={variant === "tab" ? 22 : 20} />
            <span>{it.label}</span>
          </Link>
        );
      })}
    </>
  );
}
