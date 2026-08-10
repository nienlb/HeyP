"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PHOTO_LABELS, PHOTO_LABEL_LABELS, type PhotoLabel } from "@/lib/photos";

export function PhotoUpload({
  orderId,
  inventoryId,
  defaultLabel = "product",
}: {
  orderId?: number;
  inventoryId?: number;
  defaultLabel?: PhotoLabel;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState<PhotoLabel>(defaultLabel);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("label", label);
    if (orderId) fd.set("orderId", String(orderId));
    if (inventoryId) fd.set("inventoryId", String(inventoryId));
    for (const f of list) fd.append("files", f);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Tải ảnh thất bại");
      } else {
        router.refresh();
      }
    } catch {
      setError("Lỗi mạng khi tải ảnh");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="photo-upload">
      <div className="upload-row">
        <select
          value={label}
          onChange={(e) => setLabel(e.target.value as PhotoLabel)}
          aria-label="Nhãn loại ảnh"
        >
          {PHOTO_LABELS.map((l) => (
            <option key={l} value={l}>
              {PHOTO_LABEL_LABELS[l]}
            </option>
          ))}
        </select>
      </div>
      <div
        className={`dropzone${dragOver ? " over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          upload(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
      >
        {busy
          ? "Đang tải ảnh…"
          : "Kéo-thả ảnh vào đây, hoặc bấm để chọn ảnh"}
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
