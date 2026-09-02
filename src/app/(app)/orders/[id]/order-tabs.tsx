import Link from "next/link";

export type TabCode = "tom_tat" | "mon" | "tien" | "anh";

const TABS: { code: TabCode; label: string }[] = [
  { code: "tom_tat", label: "Tóm tắt" },
  { code: "mon", label: "Món" },
  { code: "tien", label: "Tiền" },
  { code: "anh", label: "Ảnh" },
];

export function OrderTabs({
  orderId,
  active,
}: {
  orderId: number;
  active: TabCode;
}) {
  return (
    <nav className="tabs">
      {TABS.map((t) => (
        <Link
          key={t.code}
          href={`/orders/${orderId}?tab=${t.code}`}
          className={`tab${active === t.code ? " tab-on" : ""}`}
          aria-current={active === t.code ? "page" : undefined}
          scroll={false}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
