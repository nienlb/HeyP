"use client";

import { useRef, useState, useEffect } from "react";
import { deletePhotoAction } from "@/app/(app)/orders/actions";
import { photoUrl } from "@/lib/photos";
import {
  IMAGE_KINDS,
  IMAGE_KIND_LABELS,
  type ImageKind,
  type ZaloExtract,
} from "@/lib/zalo-extract";
import { mergeMoneyFields } from "@/lib/zalo-merge";
import { Sheet } from "@/app/_components/sheet";
import type { DroppedPhoto, PendingPhoto } from "./types";

/**
 * Nhập nhanh từ ảnh — đọc ảnh chốt đơn bằng AI (Gemini). Nguồn ảnh không
 * nhất thiết là Zalo (có thể Messenger, tin nhắn, ảnh chụp ghi chép tay);
 * tên file/biến nội bộ giữ "zalo" vì đó vẫn là nguồn phổ biến nhất và đổi
 * chỉ tạo nhiễu diff. Ảnh mới thả nằm ở `pendingPhotos` — CHƯA gửi lên
 * server, chỉ gửi khi bấm "Đọc ảnh". Xem ghi chú dài ở src/lib/zalo-merge.ts
 * vì sao không còn gộp nhiều ảnh vào một lần gọi.
 *
 * Toàn bộ state ở đây (ảnh, trạng thái đang đọc, lỗi, thông báo, id ảnh chốt
 * đơn) chỉ phục vụ chính khối này — form cha không bao giờ đọc lại. Kết quả
 * đọc được báo ra ngoài qua `onExtract`, cha tự áp vào state tiền/khách/sản
 * phẩm của mình để giữ một nguồn chân lý duy nhất.
 *
 * Sheet này nằm NGOÀI DOM của <form> (như CustomerSheet/ItemSheet), nên
 * hidden input `zaloPhotoId` dùng `form="new-order-form"` để vẫn được gửi
 * kèm khi submit — giống cách nút Lưu đơn trong StickyBar đã làm.
 */
export function QuickImportSheet({
  open,
  onClose,
  quotedTotal,
  onExtract,
}: {
  open: boolean;
  onClose: () => void;
  quotedTotal: string;
  onExtract: (
    order: ZaloExtract,
    currentTotalStr: string,
  ) => Promise<string>;
}) {
  const zaloInputRef = useRef<HTMLInputElement>(null);
  const [zaloPhotoId, setZaloPhotoId] = useState("");
  const [photos, setPhotos] = useState<DroppedPhoto[]>([]);
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [zaloBusy, setZaloBusy] = useState(false);
  const [zaloError, setZaloError] = useState<string | null>(null);
  const [zaloInfo, setZaloInfo] = useState<string | null>(null);
  const [zaloDragOver, setZaloDragOver] = useState(false);

  /**
   * Nghe sự kiện dán ảnh (Ctrl+V) — chỉ khi sheet đang mở, và chỉ xử lý khi
   * focus không ở trong input/textarea/contenteditable. Gắn listener toàn
   * cục kể cả lúc sheet đóng sẽ cướp thao tác dán ở ô nhập khác của form.
   */
  useEffect(() => {
    if (!open) return;
    function handlePaste(e: ClipboardEvent) {
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        (activeElement instanceof HTMLElement && activeElement.isContentEditable)
      ) {
        return;
      }

      const files = e.clipboardData?.files;
      if (!files || files.length === 0) return;

      const imageFiles = [...files].filter((f) => f.type.startsWith("image/"));
      if (imageFiles.length > 0) {
        e.preventDefault();
        addPending(imageFiles);
      }
    }

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [open]);

  /** Thêm ảnh mới thả/chọn vào hàng chờ — CHƯA gửi đi đâu, chỉ xem trước. */
  function addPending(fileList: FileList | File[]) {
    const files = [...fileList].filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    setZaloError(null);
    setPendingPhotos((prev) => [
      ...prev,
      ...files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    ]);
  }

  /** Bỏ một ảnh khỏi hàng chờ trước khi đọc — thả nhầm thì gỡ, không tốn gì cả. */
  function removePending(url: string) {
    setPendingPhotos((prev) => {
      const target = prev.find((p) => p.url === url);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((p) => p.url !== url);
    });
  }

  /** Xoá một ảnh ĐÃ đọc/lưu — thả/đọc nhầm vẫn gỡ được, xoá cả trên server. */
  async function removePhoto(id: number) {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    if (String(id) === zaloPhotoId) {
      setZaloPhotoId((prevIdStr) => {
        const remaining = photos.filter(
          (p) => p.id !== id && p.kind === "chot_don",
        );
        return remaining[0] ? String(remaining[0].id) : "";
      });
    }
    try {
      await deletePhotoAction(id);
    } catch {
      // Xoá server lỗi thì ảnh vẫn đã biến mất khỏi form — không chặn người
      // dùng. Ảnh còn sót lại trên server sẽ được job dọn ảnh mồ côi
      // (/api/cron/track) xoá sau 24h.
    }
  }

  function setPhotoKind(id: number, kind: ImageKind) {
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, kind } : p)));
  }

  /**
   * Đọc TỪNG ảnh trong hàng chờ — TUẦN TỰ, mỗi ảnh một lần gọi Gemini riêng.
   * Đây là nút bấm tường minh (không tự chạy khi thả ảnh) — bấm lại được bao
   * nhiêu lần cũng được, kể cả sau khi đã đọc xong một đợt trước đó.
   */
  async function readPendingFiles() {
    if (zaloBusy) return; // chặn bấm chồng trong lúc đang chạy
    const queue = pendingPhotos;
    if (queue.length === 0) return;

    setZaloBusy(true);
    setZaloError(null);
    setZaloInfo(null);

    const foundAll: string[] = [];
    const errors: string[] = [];
    // Không đọc lại state `quotedTotal` qua closure giữa các vòng lặp — React
    // không cập nhật closure của async function đang chạy dở dù cha đã áp patch
    // ở ảnh trước. `onExtract` trả về total mới nhất sau khi áp patch, dùng biến
    // cục bộ này theo dõi xuyên suốt vòng lặp mới đúng.
    let currentTotal = quotedTotal;
    let confirmDonId: string | null = zaloPhotoId || null;

    for (let i = 0; i < queue.length; i++) {
      const { file, url } = queue[i];
      setZaloInfo(`🤖 Đang đọc ảnh ${i + 1}/${queue.length}: ${file.name}…`);

      const fd = new FormData();
      fd.append("files", file);

      try {
        const res = await fetch("/api/read-zalo", { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));

        if (Array.isArray(data.photos) && data.photos.length > 0) {
          const saved = data.photos[0] as DroppedPhoto;
          setPhotos((prev) => [...prev, saved]);
          // Ảnh chốt đơn ĐẦU TIÊN đọc được mới gắn làm bằng chứng của đơn —
          // ảnh sản phẩm/thông tin khách đọc sau không được ghi đè lên đây.
          if (saved.kind === "chot_don" && !confirmDonId) {
            confirmDonId = String(saved.id);
            setZaloPhotoId(confirmDonId);
          }
        }

        if (!res.ok || !data.ok) {
          errors.push(`${file.name}: ${data.error ?? "đọc thất bại"}`);
        } else {
          const order = data.data.order as ZaloExtract;
          // Chỉ dùng để hiển thị "đã đọc được gì" — việc áp patch thật sự
          // (tiền/khách/sản phẩm) nằm ở `onExtract` phía cha.
          const { found } = mergeMoneyFields(order);
          currentTotal = await onExtract(order, currentTotal);
          foundAll.push(...found);
        }
      } catch {
        errors.push(`${file.name}: lỗi mạng`);
      } finally {
        URL.revokeObjectURL(url);
        setPendingPhotos((prev) => prev.filter((p) => p.url !== url));
      }
    }

    setZaloBusy(false);
    if (errors.length > 0) {
      setZaloError(`${errors.join(" · ")} — bạn kiểm tra/nhập tay giúp nhé.`);
    }
    setZaloInfo(
      foundAll.length > 0
        ? `Đã đọc: ${foundAll.join(" · ")}`
        : errors.length === 0
          ? "Không đọc được thông tin nào từ ảnh vừa rồi — kiểm tra lại bằng mắt hoặc nhập tay."
          : null,
    );
    if (zaloInputRef.current) zaloInputRef.current.value = "";
  }

  const quoteImages = photos.filter((p) => p.kind === "chot_don");

  return (
    <Sheet open={open} title="Nhập nhanh từ ảnh" onClose={onClose}>
      {/* Nằm ngoài DOM của <form> — liên kết bằng thuộc tính form. */}
      {/* TẤT CẢ ảnh đã thả, không chỉ ảnh chốt đơn: người dùng được mời "thả
          tất cả ảnh đang có", nên mọi ảnh ở đây đều thuộc về đơn sắp tạo. Gửi
          thiếu thì ảnh còn lại thành mồ côi và bị job dọn xoá sau 24h — mất
          dữ liệu thật, không chỉ là rác. */}
      <input
        type="hidden"
        name="zaloPhotoIds"
        value={photos.map((p) => p.id).join(",")}
        form="new-order-form"
      />

      <p className="muted" style={{ margin: "0 0 10px" }}>
        Thả <strong>tất cả ảnh đang có</strong> — ảnh chốt đơn, ảnh thông tin
        khách, ảnh sản phẩm. Thả xong xem lại, gỡ ảnh nào thả nhầm, rồi bấm{" "}
        <strong>Đọc ảnh</strong> khi sẵn sàng — thiếu gì bổ sung sau cũng được.
      </p>
      <div
        className={`dropzone${zaloDragOver ? " over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setZaloDragOver(true);
        }}
        onDragLeave={() => setZaloDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setZaloDragOver(false);
          if (e.dataTransfer.files.length) addPending(e.dataTransfer.files);
        }}
        onClick={() => zaloInputRef.current?.click()}
        role="button"
        tabIndex={0}
      >
        Kéo-thả ảnh vào đây, dán bằng Ctrl+V, hoặc bấm để chọn (chọn được nhiều ảnh)
      </div>
      <input
        ref={zaloInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) addPending(e.target.files);
          e.target.value = "";
        }}
      />

      {pendingPhotos.length > 0 && (
        <>
          <div className="photo-kinds" style={{ marginTop: 12 }}>
            {pendingPhotos.map((p) => (
              <div key={p.url} className="photo-kind photo-kind-pending">
                <img src={p.url} alt="" />
                <span className="photo-pending-name" title={p.file.name}>
                  {p.file.name}
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={() => removePending(p.url)}
                  disabled={zaloBusy}
                >
                  Xoá
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn"
            style={{ marginTop: 12 }}
            onClick={readPendingFiles}
            disabled={zaloBusy}
          >
            {zaloBusy
              ? "🤖 Đang đọc…"
              : photos.length > 0
                ? `Đọc lại (${pendingPhotos.length} ảnh)`
                : `Đọc ${pendingPhotos.length} ảnh`}
          </button>
        </>
      )}

      {zaloError && (
        <div className="error" style={{ marginTop: 10 }}>
          {zaloError}
        </div>
      )}
      {zaloInfo && (
        <div className="zalo-info" style={{ marginTop: 10 }}>
          {zaloBusy ? zaloInfo : `✓ ${zaloInfo} — kiểm tra lại bên dưới nhé.`}
        </div>
      )}

      {quoteImages.length > 1 && (
        <div className="warn-flag" style={{ marginTop: 10 }}>
          ⚠️ Phát hiện {quoteImages.length} ảnh chốt đơn. Nếu đây là các đơn
          riêng, hãy tạo đơn này trước rồi thả ảnh còn lại vào đơn mới.
        </div>
      )}

      {photos.length > 0 && (
        <div className="photo-kinds" style={{ marginTop: 12 }}>
          {photos.map((ph) => (
            <div key={ph.id} className="photo-kind">
              <img src={photoUrl(ph.id, "thumb")} alt="" loading="lazy" />
              <select
                value={ph.kind}
                onChange={(e) => setPhotoKind(ph.id, e.target.value as ImageKind)}
              >
                {IMAGE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {IMAGE_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => removePhoto(ph.id)}
              >
                Xoá
              </button>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
