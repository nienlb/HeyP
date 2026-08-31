import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HeyP — Quản lý đơn order hộ",
  description: "Hệ thống quản lý đơn order hộ Trung Quốc",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "HeyP",
    statusBarStyle: "default",
  },
};

/**
 * `viewportFit: "cover"` là thứ làm env(safe-area-inset-*) có giá trị thật.
 * Thiếu nó thì mọi tính toán safe-area trong CSS đều ra 0 và tabbar nằm
 * dưới thanh home indicator của iPhone.
 *
 * KHÔNG đặt maximumScale/userScalable — chặn zoom là tước quyền phóng to
 * của người dùng. Chống zoom-khi-gõ đã xử lý bằng cỡ chữ 16px ở base.css.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0e5a87",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
