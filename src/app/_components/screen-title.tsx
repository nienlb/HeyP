"use client";

import { usePathname } from "next/navigation";
import { screenMetaFor } from "@/lib/screen-meta";

/**
 * Tiêu đề lớn đầu vùng nội dung. Tách khỏi ScreenHeader vì nó nằm TRONG
 * <main> chứ không trong <header> — nhưng cùng nguồn dữ liệu, nên đổi tiêu
 * đề chỉ phải sửa src/lib/screen-meta.ts.
 */
export function ScreenTitle() {
  return <h1 className="screen-title">{screenMetaFor(usePathname()).title}</h1>;
}
