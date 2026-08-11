# HeyP v2 — Kế hoạch triển khai (reskin + sidebar + mobile)

> **Cho người thực thi:** Implement theo từng task; bước dùng checkbox `- [ ]` để theo dõi. Đây là **reskin** — KHÔNG sửa logic nghiệp vụ. Spec: `docs/2026-08-11-heyp-v2-ui-redesign-design.md`.

**Goal:** Làm lại giao diện HeyP theo hướng "Boutique atelier" (giấy ấm + navy + camel + serif), đổi điều hướng sang sidebar (desktop) ↔ bottom tab + FAB (mobile), thêm màn Tổng quan — giữ nguyên toàn bộ nghiệp vụ.

**Architecture:** CSS thuần + design-token (đã dựng ở V2-0). Một `AppShell` bọc mọi trang có đăng nhập, render `Sidebar` (desktop) + `MobileNav` (mobile) + `<main>`. Điều hướng khai báo một chỗ; trạng thái active qua `usePathname` trong component client nhỏ. Không thêm dependency.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, CSS thuần (`globals.css`), icon SVG nội tuyến (`_components/icons.tsx`).

## Global Constraints

- **UI tiếng Việt.** Serif tiêu đề PHẢI hỗ trợ tiếng Việt (dùng `var(--font-display)` = Georgia…; KHÔNG dùng "Iowan Old Style").
- **KHÔNG sửa logic** `src/lib/*` nghiệp vụ, `src/db/*` (chỉ được THÊM hàm CHỈ-ĐỌC cho Tổng quan), server actions. **38/38 unit test phải xanh, `tsc` sạch** sau mỗi task.
- **Không thêm dependency.** Màu lấy từ token (`var(--…)`), không hard-code hex trong component.
- **Breakpoint duy nhất `768px`**: `≥768px` sidebar; `<768px` bottom tab. Vùng chạm ≥44px.
- **Palette (đã ở `:root`):** `--brand #0E5A87`, `--brand-deep #0A3D5C`, `--accent #B07A4B` (camel, cực tiết chế), `--bg #F6F3EC` (giấy), `--surface #fff`, `--danger/#warning/#success` giữ ngữ nghĩa.
- **Quy trình mỗi task:** sửa code → `npx tsc --noEmit` sạch → `npm test` 38/38 → chụp màn hình **desktop + 375px** xác nhận → **commit + push**.

**Trạng thái:** V2-0 (token + component nền + `icons.tsx` + hướng boutique) **ĐÃ XONG** (commit `eb13390`). Kế hoạch dưới đây là V2-1 → V2-4.

---

## Phase V2-1 — AppShell: Sidebar + Mobile nav

### Task 1.1 — Nav config + component active-link

**Files:**
- Create: `src/app/_components/nav-config.ts`
- Create: `src/app/_components/nav-links.tsx` (client)

**Interfaces:**
- Produces: `NAV_ITEMS: { href: string; label: string; icon: IconName }[]`, `MORE_ITEMS: {...}[]` (Tracking, Sao lưu), `NavLinks({ variant }: { variant: "sidebar" | "tab" })` (client, tự lấy `usePathname`).

- [ ] **Step 1:** Tạo `nav-config.ts`:

```ts
import type { IconName } from "./icons";
export type NavItem = { href: string; label: string; icon: IconName };
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Tổng quan", icon: "dashboard" },
  { href: "/orders", label: "Đơn hàng", icon: "orders" },
  { href: "/customers", label: "Khách hàng", icon: "customers" },
  { href: "/inventory", label: "Tồn kho", icon: "inventory" },
];
// Sidebar hiện thêm các mục này; mobile gom vào sheet "Thêm".
export const MORE_ITEMS: NavItem[] = [
  { href: "/tracking", label: "Tracking", icon: "tracking" },
  { href: "/backup", label: "Sao lưu", icon: "backup" },
];
```

- [ ] **Step 2:** Tạo `nav-links.tsx` (client) — dùng cho cả sidebar & bottom tab:

```tsx
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
```

- [ ] **Step 3:** `npx tsc --noEmit` sạch. (Chưa render — chưa commit riêng; gộp vào Task 1.2.)

### Task 1.2 — Sidebar (desktop)

**Files:**
- Create: `src/app/_components/sidebar.tsx`
- Modify: `src/app/globals.css` (thêm khối `.sidebar*`, `.sidebar-link*`)

**Interfaces:**
- Consumes: `NAV_ITEMS`, `MORE_ITEMS`, `NavLinks`, `logoutAction` (`src/app/actions.ts`), `Icon`.
- Produces: `Sidebar({ username }: { username: string })`.

- [ ] **Step 1:** Tạo `sidebar.tsx`:

```tsx
import Link from "next/link";
import { logoutAction } from "../actions";
import { NavLinks } from "./nav-links";
import { NAV_ITEMS, MORE_ITEMS } from "./nav-config";
import { Icon } from "./icons";

export function Sidebar({ username }: { username: string }) {
  return (
    <aside className="sidebar">
      <Link href="/" className="sidebar-brand">HeyP</Link>
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
```

- [ ] **Step 2:** Thêm CSS (dùng token; sidebar nền `--brand-deep`, chữ trắng; mục active có **sợi chỉ camel** trái + nền trắng-mờ). Ẩn khi `<768px`:

```css
.sidebar { position: fixed; inset: 0 auto 0 0; width: 240px; background: var(--brand-deep);
  color: #fff; display: flex; flex-direction: column; padding: 18px 14px; gap: 14px; }
.sidebar-brand { font-family: var(--font-display); font-style: italic; font-weight: 700;
  font-size: 26px; color: #fff; text-decoration: none; padding: 4px 8px; }
.sidebar-cta { background: #fff; color: var(--brand); justify-content: flex-start; }
.sidebar-cta:hover { background: #fff; }
.sidebar-nav { display: flex; flex-direction: column; gap: 2px; }
.sidebar-link { display: flex; align-items: center; gap: 10px; padding: 10px 12px;
  border-radius: var(--radius-sm); color: rgba(255,255,255,.82); text-decoration: none;
  font-size: 14px; font-weight: 600; border: none; background: none; cursor: pointer;
  width: 100%; border-left: 3px solid transparent; }
.sidebar-link:hover { background: rgba(255,255,255,.08); color: #fff; }
.sidebar-link.active { background: rgba(255,255,255,.14); color: #fff;
  border-left-color: var(--accent); }
.sidebar-sep { height: 1px; background: rgba(255,255,255,.12); margin: 8px 4px; }
.sidebar-foot { margin-top: auto; display: flex; flex-direction: column; gap: 6px; }
.sidebar-user { font-size: 13px; color: rgba(255,255,255,.7); padding: 0 12px; }
@media (max-width: 767px) { .sidebar { display: none; } }
```

- [ ] **Step 3:** `npx tsc --noEmit` sạch. (Render kiểm ở Task 1.4 khi gắn vào trang.)

### Task 1.3 — MobileNav (top bar + bottom tab + FAB + sheet "Thêm")

**Files:**
- Create: `src/app/_components/mobile-nav.tsx` (client — cần state cho sheet)
- Modify: `src/app/globals.css` (khối `.mobile-*`, `.tab-*`, `.fab`, `.sheet*`)

**Interfaces:**
- Consumes: `NAV_ITEMS`, `NavLinks`, `MORE_ITEMS`, `Icon`, `logoutAction`.
- Produces: `MobileNav({ username })`.

- [ ] **Step 1:** Tạo `mobile-nav.tsx`: top bar (wordmark "HeyP"), bottom tab (4 mục NAV_ITEMS + nút "Thêm" mở sheet), FAB "+" link `/orders/new`, sheet chứa MORE_ITEMS + Đăng xuất. Dùng `useState` cho sheet; nút Thêm là `<button>` (không phải Link). Ẩn toàn bộ khi `≥768px`.

```tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { logoutAction } from "../actions";
import { NavLinks } from "./nav-links";
import { NAV_ITEMS, MORE_ITEMS } from "./nav-config";
import { Icon } from "./icons";

export function MobileNav({ username }: { username: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <header className="mobile-top">
        <Link href="/" className="mobile-brand">HeyP</Link>
      </header>
      <nav className="tabbar">
        <NavLinks items={NAV_ITEMS} variant="tab" />
        <button className="tab-link" type="button" onClick={() => setOpen(true)}>
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
              <Link key={it.href} href={it.href} className="sheet-item"
                onClick={() => setOpen(false)}>
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
```

- [ ] **Step 2:** CSS: `.mobile-top`/`.tabbar`/`.fab`/`.sheet*` hiện khi `<768px`, ẩn khi `≥768px`. Bottom tab fixed đáy, 5 ô đều nhau, mục active navy; FAB navy tròn phải-dưới trên tabbar; sheet trượt từ dưới.

```css
.mobile-top, .tabbar, .fab { display: none; }
@media (max-width: 767px) {
  .mobile-top { display: flex; align-items: center; height: 52px; padding: 0 16px;
    background: var(--surface); border-bottom: 1px solid var(--border);
    position: sticky; top: 0; z-index: 20; }
  .mobile-brand { font-family: var(--font-display); font-style: italic; font-weight: 700;
    font-size: 20px; color: var(--brand); text-decoration: none; }
  .tabbar { display: flex; position: fixed; inset: auto 0 0 0; height: 60px;
    background: var(--surface); border-top: 1px solid var(--border); z-index: 20; }
  .tab-link { flex: 1; display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 2px; font-size: 11px; font-weight: 600;
    color: var(--muted); text-decoration: none; border: none; background: none;
    cursor: pointer; }
  .tab-link.active { color: var(--brand); }
  .fab { display: flex; align-items: center; justify-content: center; position: fixed;
    right: 16px; bottom: 72px; width: 52px; height: 52px; border-radius: 50%;
    background: var(--brand); color: #fff; box-shadow: var(--shadow-md); z-index: 20; }
  .sheet-overlay { position: fixed; inset: 0; background: rgba(16,32,43,.4);
    z-index: 30; display: flex; align-items: flex-end; }
  .sheet { width: 100%; background: var(--surface); border-radius: 16px 16px 0 0;
    padding: 12px; display: flex; flex-direction: column; gap: 4px; }
  .sheet-user { font-size: 13px; color: var(--muted); padding: 8px 12px; }
  .sheet-item { display: flex; align-items: center; gap: 10px; padding: 14px 12px;
    border-radius: var(--radius-sm); color: var(--text); text-decoration: none;
    font-size: 15px; font-weight: 600; border: none; background: none; width: 100%;
    cursor: pointer; }
  .sheet-item:hover { background: var(--surface-2); }
}
```

- [ ] **Step 3:** `npx tsc --noEmit` sạch.

### Task 1.4 — AppShell + gắn vào mọi trang, bỏ AppHeader

**Files:**
- Create: `src/app/_components/app-shell.tsx`
- Modify: `src/app/orders/page.tsx`, `orders/new/page.tsx`, `orders/[id]/page.tsx`, `customers/page.tsx`, `inventory/page.tsx`, `tracking/page.tsx`, `backup/page.tsx`
- Delete: `src/app/_components/app-header.tsx`
- Modify: `src/app/globals.css` (thêm `.app-main`; bỏ/để lại khối `.app-header*` — sẽ dọn)

**Interfaces:**
- Consumes: `Sidebar`, `MobileNav`.
- Produces: `AppShell({ username, children })` — render sidebar + mobile nav + `<main className="app-main container">{children}</main>`.

- [ ] **Step 1:** Tạo `app-shell.tsx`:

```tsx
import type { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";

export function AppShell({
  username,
  children,
}: {
  username: string;
  children: ReactNode;
}) {
  return (
    <div className="app-shell">
      <Sidebar username={username} />
      <MobileNav username={username} />
      <main className="app-main container">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2:** CSS: chừa chỗ cho sidebar (desktop) và tabbar (mobile):

```css
.app-main { padding-top: 24px; }
@media (min-width: 768px) { .app-main { margin-left: 240px; } }
@media (max-width: 767px) { .app-main { padding-bottom: 84px; } }
```

- [ ] **Step 3:** Ở MỖI trang: thay `<AppHeader username={session.username} />` + `<main className="container">…</main>` bằng `<AppShell username={session.username}>…</AppShell>`. Bỏ import `AppHeader`, thêm import `AppShell`. Ví dụ `orders/page.tsx`:

```tsx
// - import { AppHeader } from "../_components/app-header";
import { AppShell } from "../_components/app-shell";
// …
return (
  <AppShell username={session.username}>
    <div className="page-head"> … </div>
    { /* nội dung trang giữ nguyên */ }
  </AppShell>
);
```

- [ ] **Step 4:** Xoá `app-header.tsx`. Grep `app-header` để chắc không còn import: `grep -rn "app-header" src/`.

- [ ] **Step 5:** Verify: `npx tsc --noEmit` sạch, `npm test` 38/38. Preview: chụp **desktop** (thấy sidebar navy sâu, mục active có chỉ camel, "+ Tạo đơn" trắng) và **375px** (top bar + bottom tab + FAB; bấm "Thêm" ra sheet). Chuyển vài màn kiểm active đúng.

- [ ] **Step 6:** Commit + push: `V2-1: AppShell — sidebar navy + bottom tab/FAB/sheet, bỏ top nav`.

---

## Phase V2-2 — Màn Tổng quan

### Task 2.1 — Hàm đếm đơn theo trạng thái (chỉ đọc)

**Files:**
- Modify: `src/db/queries.ts` (thêm hàm mới, KHÔNG sửa hàm cũ)

**Interfaces:**
- Produces: `countOrdersByStatus(): { status: OrderStatus; count: number }[]` (đọc từ `listOrders()` đã có, group theo status, giữ thứ tự `MAIN_CHAIN` rồi `BRANCH_STATUSES`).

- [ ] **Step 1:** Thêm vào `queries.ts` (tận dụng `listOrders` sẵn có, không truy vấn mới):

```ts
import { MAIN_CHAIN, BRANCH_STATUSES } from "@/lib/order-status";
export async function countOrdersByStatus() {
  const rows = await listOrders();
  const order = [...MAIN_CHAIN, ...BRANCH_STATUSES];
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  return order
    .map((status) => ({ status, count: counts.get(status) ?? 0 }))
    .filter((x) => x.count > 0);
}
```

- [ ] **Step 2:** `npx tsc --noEmit` sạch. (Commit gộp Task 2.2.)

### Task 2.2 — Trang Tổng quan (`/`)

**Files:**
- Modify: `src/app/page.tsx` (thay redirect bằng dashboard)
- Modify: `src/app/globals.css` (khối `.dash-*`)

**Interfaces:**
- Consumes: `requireAuth`, `AppShell`, `listOrders`, `listCustomersWithTotals`, `countOrdersByStatus`, `STATUS_LABELS`, `formatVnd`.

- [ ] **Step 1:** Viết `page.tsx` mới (server component). 4 thẻ: **Cần chú ý** (từ `listOrders().filter(needsAttention)`, list ngắn ≤5, link `/orders/[id]`); **Đơn theo trạng thái** (`countOrdersByStatus()` → chip); **Công nợ** (`listCustomersWithTotals()` → tổng `outstanding` + top 5); **Tác vụ nhanh** (link `/orders/new`). Lưới `.dash-grid` 2 cột desktop / 1 cột mobile; "Cần chú ý" `grid-column: 1/-1`.

- [ ] **Step 2:** CSS `.dash-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; } @media (max-width:767px){ .dash-grid{ grid-template-columns: 1fr; } }` + chip trạng thái, số lớn.

- [ ] **Step 3:** Verify: mở `/` vào thẳng Tổng quan; đối chiếu số liệu với dữ liệu thật (đơn #1 quá hạn, #2 sự cố → "Cần chú ý"; công nợ = tổng amount_due đơn chưa xong). `tsc` + `npm test`. Chụp desktop + 375px.

- [ ] **Step 4:** Commit + push: `V2-2: màn Tổng quan (4 thẻ) làm trang chủ`.

---

## Phase V2-3 — Reskin màn + bảng→thẻ trên mobile

### Task 3.1 — Bảng → thẻ xếp dọc trên mobile

**Files:**
- Modify: `src/app/orders/[id]/page.tsx` (bảng sản phẩm — thêm `data-label` cho mỗi `<td>`)
- Modify: `src/app/customers/page.tsx` (bảng khách — thêm `data-label`)
- Modify: `src/app/globals.css` (media `<768px` biến `.tbl` thành thẻ)

**Interfaces:** không đổi API.

- [ ] **Step 1:** Thêm `data-label="Tên hàng"` … vào từng `<td>` của bảng sản phẩm (chi tiết đơn) và bảng khách hàng, khớp header cột.

- [ ] **Step 2:** CSS:

```css
@media (max-width: 767px) {
  .tbl thead { display: none; }
  .tbl, .tbl tbody, .tbl tr, .tbl td { display: block; width: 100%; }
  .tbl tr { border: 1px solid var(--border); border-radius: var(--radius-sm);
    margin-bottom: 10px; padding: 6px 12px; background: var(--surface); }
  .tbl td { border: none; display: flex; justify-content: space-between; gap: 12px;
    padding: 6px 0; text-align: right; }
  .tbl td::before { content: attr(data-label); color: var(--muted); font-weight: 600;
    text-align: left; }
  .tbl td.num { text-align: right; }
}
```

- [ ] **Step 3:** Verify 375px: bảng sản phẩm + bảng khách thành thẻ nhãn:giá-trị, không cuộn ngang. Desktop vẫn là bảng. `tsc` + `npm test`.

- [ ] **Step 4:** Commit + push: `V2-3a: bảng → thẻ xếp dọc trên mobile`.

### Task 3.2 — Tinh chỉnh diện mạo các màn

**Files:** Modify (CSS chủ yếu, đã cascade từ token): `src/app/globals.css`; chỉnh nhỏ trong `orders/page.tsx` (order-row), `orders/new/new-order-form.tsx` (khu Zalo giữ chức năng, đổi viền camel-nhạt nếu muốn), `tracking/page.tsx`, `inventory/page.tsx`.

- [ ] **Step 1:** Rà từng màn ở desktop + 375px, chỉnh: khoảng cách, vùng chạm ≥44px, `.zalo-reader` đổi sang viền `--accent-tint`/`--brand-tint` cho hợp tông (bỏ tím cũ), `.dropzone.over` đã navy. Không đổi cấu trúc/logic.

- [ ] **Step 2:** Verify toàn bộ luồng vẫn chạy (tạo đơn, chuyển trạng thái, đọc ảnh Zalo, bán từ kho) — thao tác thử 1 vòng; `npm test` 38/38.

- [ ] **Step 3:** Commit + push: `V2-3b: đồng bộ diện mạo các màn theo tông boutique`.

---

## Phase V2-4 — Đăng nhập + logo + QA cuối

### Task 4.1 — Reskin trang đăng nhập

**Files:** Modify `src/app/login/page.tsx`, `globals.css`.

- [ ] **Step 1:** Nền giấy ấm, thẻ trắng giữa màn, wordmark "HeyP" serif nghiêng trên cùng, nút Đăng nhập navy. Giữ nguyên `loginAction` và cấu trúc form (chỉ đổi class/markup trình bày). Giữ dòng phụ "HeyP chào bạn" hiện có.
- [ ] **Step 2:** Verify đăng xuất→đăng nhập lại chạy; chụp desktop + 375px. Commit + push: `V2-4a: reskin đăng nhập`.

### Task 4.2 — Logo

**Files:** Create `public/` (Niên bỏ `logo.png`); Modify `sidebar.tsx`, `mobile-nav.tsx`, `login/page.tsx`.

**Interfaces:** dùng `next/image` hoặc `<img src="/logo.png">` với fallback wordmark.

- [ ] **Step 1:** Nếu `public/logo.png` tồn tại → hiện ảnh logo (kèm alt "HeyP"); nếu không → giữ wordmark serif "HeyP" (đang có). Cách an toàn: luôn render wordmark, và CHỈ thêm `<img>` khi Niên xác nhận đã bỏ file (tránh 404). Ghi chú trong PR.
- [ ] **Step 2:** Verify logo hiện ở sidebar + top bar mobile + login. Commit + push: `V2-4b: logo vào sidebar/topbar/login`.

### Task 4.3 — QA cuối

- [ ] **Step 1:** Đối chiếu **spec mục 8** (tiêu chí nghiệm thu): palette navy+giấy ấm; đỏ chỉ ở ngữ nghĩa; sidebar desktop; bottom tab+FAB+sheet mobile; Tổng quan đúng số; bảng→thẻ; không cuộn ngang; mọi luồng chạy.
- [ ] **Step 2:** `npx tsc --noEmit` sạch, `npm test` 38/38. Chụp desktop + 375px các màn chính.
- [ ] **Step 3:** Cập nhật `CLAUDE.md` (đổi trạng thái v2), commit + push: `V2-4c: QA cuối + cập nhật tài liệu`.

---

## Self-review (đã rà theo spec)

- **Phủ spec:** mục 2 (token) → V2-0 xong; mục 3 (bố cục) → V2-1; mục 4 (Tổng quan) → V2-2; mục 5 (component) + bảng→thẻ → V2-3; mục 6 (logo) → V2-4.2; mục 7 (login) → V2-4.1; mục 8 (nghiệm thu) → V2-4.3.
- **Không placeholder:** các đoạn code/CSS then chốt đã viết đầy đủ; phần cascade từ token thì nêu rõ chỉ tinh chỉnh.
- **Nhất quán tên:** `AppShell`/`Sidebar`/`MobileNav`/`NavLinks`/`countOrdersByStatus` dùng thống nhất giữa các task.

## Việc Niên cần chuẩn bị

- **File logo** `public/logo.png` (Task 4.2) — chưa có thì giữ wordmark serif, thêm sau.
