import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HeyP — Quản lý đơn order hộ",
  description: "Hệ thống quản lý đơn order hộ Trung Quốc",
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
