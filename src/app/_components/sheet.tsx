"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

/**
 * Bottom sheet — nơi diễn ra mọi thao tác phụ của app.
 *
 * Trên mobile trượt lên từ đáy; từ 900px trở lên CSS biến nó thành modal
 * giữa màn hình (cùng component, khác vị trí — xem layout.css).
 *
 * Đóng được bằng ba cách: chạm nền, vuốt xuống quá 100px, hoặc Esc.
 */
export function Sheet({
  open,
  title,
  onClose,
  footer,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const [dragY, setDragY] = useState(0);
  const startY = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Khoá cuộn nền: không có dòng này thì vuốt trong sheet sẽ kéo cả trang.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  // Mở lại phải về đúng chỗ — nếu không sheet giữ nguyên độ lệch của lần
  // vuốt dở dang trước đó và trông như bị tụt.
  useEffect(() => {
    if (open) setDragY(0);
  }, [open]);

  if (!open) return null;

  function down(e: PointerEvent<HTMLDivElement>) {
    startY.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    if (startY.current === null) return;
    setDragY(Math.max(0, e.clientY - startY.current));
  }
  function up() {
    if (startY.current === null) return;
    startY.current = null;
    if (dragY > 100) onClose();
    else setDragY(0);
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={
          dragY
            ? { transform: `translateY(${dragY}px)`, transition: "none" }
            : undefined
        }
      >
        <div
          className="sheet-grab"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        >
          <span className="sheet-grab-bar" />
        </div>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button
            type="button"
            className="sheet-close"
            onClick={onClose}
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}
