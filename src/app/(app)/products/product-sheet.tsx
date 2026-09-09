"use client";

import { useActionState, useEffect, useState } from "react";
import { Sheet } from "@/app/_components/sheet";
import { ItemPhotos, type ItemPhoto } from "@/app/_components/item-photos";
import { groupVnd } from "@/lib/parse-number";
import {
  deleteProductAction,
  saveProductAction,
  type DeleteProductState,
  type SaveProductState,
} from "./actions";
import type { ProductPick } from "./product-grid";

/** Ô nhập kiểu chip: gõ rồi Enter thành một chip, chạm chip để bỏ. */
function ChipInput({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const v = draft.trim().replace(/\s+/g, " ");
    if (v === "") return;
    // So không phân biệt hoa thường, giống parseList — nếu không thì "Đen" và
    // "đen" cùng tồn tại rồi lưới chip hiện hai cái y hệt nhau.
    if (!value.some((x) => x.toLowerCase() === v.toLowerCase()))
      onChange([...value, v]);
    setDraft("");
  }

  return (
    <div className="field">
      <span>{label}</span>
      <div className="chip-row">
        {value.map((v) => (
          <button
            key={v}
            type="button"
            className="chip chip-on"
            onClick={() => onChange(value.filter((x) => x !== v))}
            aria-label={`Bỏ ${v}`}
          >
            {v} ✕
          </button>
        ))}
      </div>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            // Chặn Enter nổi lên form cha — nếu không thì gõ một chip xong là
            // submit cả Sheet.
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder={placeholder}
        enterKeyHint="done"
      />
    </div>
  );
}

export function ProductSheet({
  open,
  onClose,
  initial,
  canDelete,
}: {
  open: boolean;
  onClose: () => void;
  /** null = thêm mới. */
  initial: ProductPick | null;
  /** Admin trở lên. Ẩn nút thôi — server vẫn tự kiểm bằng requireAdmin(). */
  canDelete: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    SaveProductState,
    FormData
  >(saveProductAction, {});
  const [delState, delAction, delPending] = useActionState<
    DeleteProductState,
    FormData
  >(deleteProductAction, {});

  const [name, setName] = useState("");
  const [sizes, setSizes] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [sellVnd, setSellVnd] = useState("");
  const [cny, setCny] = useState("");
  const [url, setUrl] = useState("");
  const [photos, setPhotos] = useState<ItemPhoto[]>([]);

  // Mở lại phải nạp đúng mẫu đang sửa — không có dòng này thì lần mở thứ hai
  // vẫn hiện dữ liệu của lần trước.
  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setSizes(initial?.sizes ?? []);
    setColors(initial?.colors ?? []);
    setSellVnd(initial ? groupVnd(String(initial.defaultSellVnd)) : "");
    setCny(initial ? String(initial.defaultUnitPriceCny) : "");
    setUrl(initial?.productUrl ?? "");
    setPhotos((initial?.photoIds ?? []).map((id) => ({ id })));
  }, [open, initial]);

  // Lưu hoặc xoá xong thì đóng.
  useEffect(() => {
    if (state.ok || delState.ok) onClose();
  }, [state.ok, delState.ok, onClose]);

  return (
    <Sheet
      open={open}
      title={initial ? "Sửa sản phẩm" : "Thêm sản phẩm"}
      onClose={onClose}
    >
      <form action={formAction}>
        {initial && <input type="hidden" name="id" value={initial.id} />}
        <input type="hidden" name="sizes" value={sizes.join(",")} />
        <input type="hidden" name="colors" value={colors.join(",")} />
        <input
          type="hidden"
          name="photoIds"
          value={photos.map((p) => p.id).join(",")}
        />

        <label className="field">
          <span>Tên sản phẩm *</span>
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VD: Aire tabi"
            autoFocus
            enterKeyHint="next"
          />
        </label>

        <ChipInput
          label="Các size có"
          placeholder="Gõ 36 rồi Enter"
          value={sizes}
          onChange={setSizes}
        />
        <ChipInput
          label="Các màu có"
          placeholder="Gõ đen rồi Enter"
          value={colors}
          onChange={setColors}
        />

        <label className="field">
          <span>Giá phải thu (₫) — cho 1 cái</span>
          <input
            name="defaultSellVnd"
            inputMode="numeric"
            value={sellVnd}
            onChange={(e) => setSellVnd(e.target.value)}
            onFocus={(e) => setSellVnd(e.target.value.replace(/[.,\s]/g, ""))}
            onBlur={(e) => setSellVnd(groupVnd(e.target.value))}
            placeholder="VD: 510.000"
            enterKeyHint="next"
          />
        </label>

        <label className="field">
          <span>Giá vốn ¥ — cho 1 cái</span>
          <input
            name="defaultUnitPriceCny"
            inputMode="decimal"
            value={cny}
            onChange={(e) => setCny(e.target.value)}
            placeholder="VD: 207.5"
            enterKeyHint="next"
          />
        </label>

        <label className="field">
          <span>Link sản phẩm</span>
          <input
            name="productUrl"
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            enterKeyHint="done"
          />
        </label>

        <ItemPhotos value={photos} onChange={setPhotos} label="Ảnh mẫu" />

        {state.error && <div className="error">{state.error}</div>}

        {state.duplicates && state.duplicates.length > 0 && (
          <div className="notice">
            <p>Đã có mẫu tên “{name}” trong danh mục. Vẫn muốn thêm mẫu mới?</p>
            <button
              type="submit"
              name="confirmDuplicate"
              value="1"
              className="btn btn-outline"
              disabled={pending}
            >
              Vẫn thêm
            </button>
          </div>
        )}

        <div className="sheet-actions">
          <button
            type="submit"
            className="btn"
            disabled={pending || name.trim() === ""}
          >
            {pending ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </form>

      {/* Form xoá NẰM NGOÀI form lưu — HTML không cho lồng <form> trong
          <form>, lồng vào là vỡ hydration ngay (đã xảy ra thật ở
          PaymentsBlock). */}
      {initial && canDelete && (
        <form action={delAction}>
          <input type="hidden" name="id" value={initial.id} />
          <div className="sheet-actions">
            <button
              type="submit"
              className="btn btn-ghost"
              disabled={delPending}
            >
              {delPending ? "Đang xoá…" : "Xoá mẫu"}
            </button>
          </div>
          {delState.error && <div className="error">{delState.error}</div>}
        </form>
      )}
    </Sheet>
  );
}
