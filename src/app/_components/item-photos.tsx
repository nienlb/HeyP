"use client";

import { useRef, useState } from "react";
import { deletePhotoAction } from "@/app/(app)/orders/actions";
import { photoUrl } from "@/lib/photos";

/**
 * Ảnh đã upload xong, gắn vào một dòng món. Chỉ giữ `id` — đường dẫn dẫn
 * xuất bằng `photoUrl(id, variant)` để mỗi chỗ hiển thị tự chọn bản chính
 * hay bản nhỏ, không lưu sẵn một URL cứng rồi dùng nhầm chỗ.
 */
export type ItemPhoto = { id: number };

/**
 * Chọn nhiều ảnh cho MỘT món. Upload ngay lúc chọn (label=product, chưa có
 * orderId) — ảnh được gắn vào dòng món sau khi đơn được tạo.
 *
 * Ảnh mồ côi khi bỏ đơn giữa chừng: chấp nhận, giống hành vi sẵn có của
 * luồng nhập nhanh từ ảnh.
 */
export function ItemPhotos({
  value,
  onChange,
}: {
  value: ItemPhoto[];
  onChange: (next: ItemPhoto[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("label", "product");
    for (const f of list) fd.append("files", f);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok !== true) {
        setError(data.error ?? "Tải ảnh thất bại");
      } else {
        const added: ItemPhoto[] = (data.ids as number[]).map((id) => ({ id }));
        onChange([...value, ...added]);
      }
    } catch {
      setError("Lỗi mạng khi tải ảnh");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(id: number) {
    // Gỡ khỏi form trước để người dùng thấy ngay; xoá trên server sau.
    onChange(value.filter((p) => p.id !== id));
    try {
      await deletePhotoAction(id);
    } catch {
      // Xoá server hỏng thì ảnh vẫn đã biến mất khỏi form — không chặn.
    }
  }

  return (
    <div className="field">
      <span>Ảnh sản phẩm</span>
      <div className="item-photos">
        {value.map((p) => (
          <span key={p.id} className="item-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl(p.id, "thumb")} alt="" loading="lazy" />
            <button
              type="button"
              className="item-photo-x"
              onClick={() => remove(p.id)}
              aria-label="Xoá ảnh"
            >
              ✕
            </button>
          </span>
        ))}
        <button
          type="button"
          className="item-photo-add"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          {busy ? "Đang tải…" : "+ Ảnh"}
        </button>
      </div>
      {error && <div className="error">{error}</div>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => e.target.files && upload(e.target.files)}
      />
    </div>
  );
}
