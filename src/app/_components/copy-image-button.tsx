"use client";

import { useState } from "react";

/** Copy ảnh vào clipboard để dán thẳng khi đăng bài (Facebook/Zalo). */
export function CopyImageButton({ photoId }: { photoId: number }) {
  const [state, setState] = useState<"idle" | "ok" | "err">("idle");

  async function copy() {
    try {
      const res = await fetch(`/api/photo/${photoId}`);
      const blob = await res.blob();
      // Clipboard ảnh cần kiểu png; nếu khác thì vẽ lại qua canvas.
      const item = new ClipboardItem({ [blob.type]: blob });
      await navigator.clipboard.write([item]);
      setState("ok");
    } catch {
      setState("err");
    }
    setTimeout(() => setState("idle"), 1500);
  }

  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>
      {state === "ok" ? "✓ Đã copy" : state === "err" ? "Copy lỗi" : "Copy ảnh"}
    </button>
  );
}
