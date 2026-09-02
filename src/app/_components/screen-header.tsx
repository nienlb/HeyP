"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";
import { screenMetaFor } from "@/lib/screen-meta";

/**
 * Header dính đỉnh. Từ v8-B nó KHÔNG nhận prop: nó sống trong
 * `src/app/(app)/layout.tsx` để không bị tháo-dựng lại mỗi lần chuyển màn,
 * mà layout thì không nhận được prop từ page.
 *
 * Đọc `usePathname()` — đúng khuôn NavLinks đã dùng. Hệ quả tốt: tiêu đề và
 * nút quay lại đổi NGAY lúc bấm, trước khi server trả gì.
 *
 * `backHref` là đường dẫn TƯỜNG MINH, không dùng history.back(): ở chế độ
 * standalone (đã cài ra màn hình chính) người dùng có thể mở thẳng một URL
 * sâu và không có gì để lùi về.
 */
export function ScreenHeader() {
  const { title, backHref } = screenMetaFor(usePathname());
  return (
    <header className="screen-header">
      {backHref ? (
        <Link href={backHref} className="sh-back" aria-label="Quay lại">
          <Icon name="chevron-left" size={24} />
        </Link>
      ) : (
        <span className="sh-back-spacer" />
      )}
      <span className="sh-title">{title}</span>
      {/*
        Ô hành động bên phải CỐ Ý để trống. Nút "Chọn" (/orders), "Nhập nhanh
        từ ảnh" (/orders/new) và "+" (/inventory) là `.header-action-float` —
        position: fixed neo vào TOẠ ĐỘ của ô này chứ không nằm trong nó, nên
        chúng vẫn chạy dù header đã lên layout. Ô này giữ chỗ để tiêu đề vẫn
        nằm chính giữa.
      */}
      <span className="sh-action" />
    </header>
  );
}
