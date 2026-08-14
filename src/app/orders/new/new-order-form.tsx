"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import {
  createOrderAction,
  deletePhotoAction,
  suggestCnyAction,
  type CreateOrderState,
} from "../actions";
import { computeOrderMoney, sumLineItemsCny } from "@/lib/money";
import { buildQuoteText, formatVnd } from "@/lib/format";
import { ORDER_TYPES, ORDER_TYPE_LABELS } from "@/lib/order-status";
import { suggestCnyFromTotal } from "@/lib/line-pricing";
import type { ShipStatus } from "@/lib/order-gaps";
import {
  IMAGE_KINDS,
  IMAGE_KIND_LABELS,
  itemAttributes,
  type ImageKind,
  type ZaloExtract,
} from "@/lib/zalo-extract";
import { mergeItems, mergeMoneyFields } from "@/lib/zalo-merge";
import { CopyButton } from "../../_components/copy-button";

type ItemRow = {
  name: string;
  productUrl: string;
  attributes: string;
  quantity: string;
  unitPriceCny: string;
  /** false = giá ¥ do máy gợi ý, chưa ai xác nhận. */
  costConfirmed: boolean;
};

const emptyItem: ItemRow = {
  name: "",
  productUrl: "",
  attributes: "",
  quantity: "1",
  unitPriceCny: "",
  costConfirmed: true,
};

/** Ảnh ĐÃ ĐỌC XONG (đã lưu server, có id thật), kèm loại AI phân ra (sửa được). */
type DroppedPhoto = { id: number; kind: ImageKind; name: string };

/** Ảnh mới thả/chọn, CHƯA gửi lên server — chỉ nằm trong hàng chờ của trình duyệt. */
type PendingPhoto = { file: File; url: string };

export function NewOrderForm({
  customers,
  defaultExchangeRate,
  defaultMarginVnd,
}: {
  customers: {
    id: number;
    name: string;
    warningFlag: boolean;
    warningReason: string | null;
  }[];
  defaultExchangeRate: number;
  defaultMarginVnd: number;
}) {
  const [state, formAction, pending] = useActionState<
    CreateOrderState,
    FormData
  >(createOrderAction, {});

  const [customerMode, setCustomerMode] = useState<"existing" | "new">(
    customers.length > 0 ? "existing" : "new",
  );
  const [orderType, setOrderType] = useState<string>("order_ho");
  const [exchangeRate, setExchangeRate] = useState(String(defaultExchangeRate));
  const [quotedTotal, setQuotedTotal] = useState("");
  const [shipStatus, setShipStatus] = useState<ShipStatus>("unknown");
  const [photos, setPhotos] = useState<DroppedPhoto[]>([]);
  const [shippingFee, setShippingFee] = useState("");
  const [deposit, setDeposit] = useState("");
  const [items, setItems] = useState<ItemRow[]>([{ ...emptyItem }]);
  const [customerId, setCustomerId] = useState<string>(
    customers[0] ? String(customers[0].id) : "",
  );
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerAddress, setNewCustomerAddress] = useState("");

  // Đọc ảnh chốt đơn Zalo (Gemini). Ảnh mới thả nằm ở `pendingPhotos` — CHƯA
  // gửi lên server, chỉ gửi khi bấm "Đọc ảnh". Xem ghi chú dài ở
  // src/lib/zalo-merge.ts vì sao không còn gộp nhiều ảnh vào một lần gọi.
  const zaloInputRef = useRef<HTMLInputElement>(null);
  const [zaloPhotoId, setZaloPhotoId] = useState("");
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [zaloBusy, setZaloBusy] = useState(false);
  const [zaloError, setZaloError] = useState<string | null>(null);
  const [zaloInfo, setZaloInfo] = useState<string | null>(null);
  const [zaloDragOver, setZaloDragOver] = useState(false);

  const num = (s: string) => Number(String(s).replace(/[,\s]/g, "")) || 0;

  /** Áp một patch (từ mergeMoneyFields) vào state form — chỉ set trường có mặt. */
  function applyMoneyPatch(patch: ReturnType<typeof mergeMoneyFields>["patch"]) {
    if (patch.customerMode) setCustomerMode(patch.customerMode);
    if (patch.newCustomerName !== undefined)
      setNewCustomerName(patch.newCustomerName);
    if (patch.newCustomerPhone !== undefined)
      setNewCustomerPhone(patch.newCustomerPhone);
    if (patch.newCustomerAddress !== undefined)
      setNewCustomerAddress(patch.newCustomerAddress);
    if (patch.quotedTotal !== undefined) setQuotedTotal(patch.quotedTotal);
    if (patch.deposit !== undefined) setDeposit(patch.deposit);
    if (patch.shipStatus !== undefined) setShipStatus(patch.shipStatus);
    if (patch.shippingFee !== undefined) setShippingFee(patch.shippingFee);
  }

  /**
   * Gợi ý giá ¥ cho sản phẩm đọc được rồi gộp vào danh sách hiện có.
   *
   * `currentTotalStr` truyền tay (KHÔNG đọc state `quotedTotal` qua closure):
   * hàm này chạy trong vòng lặp `readPendingFiles`, và React không cập nhật
   * lại closure của một async function đang chạy dở dù đã `setQuotedTotal`
   * ở ảnh trước — dùng biến cục bộ theo dõi xuyên suốt vòng lặp mới đúng.
   */
  async function applyItemsFromExtract(
    order: ZaloExtract,
    currentTotalStr: string,
  ) {
    let fromHistory: (number | null)[] = order.items.map(() => null);
    try {
      fromHistory = await suggestCnyAction(order.items.map((it) => it.name));
    } catch {
      // Tra lịch sử hỏng thì vẫn còn cách suy ngược — không chặn.
    }
    const totalForFallback = order.totalVnd ?? num(currentTotalStr);
    const fallbackCny = suggestCnyFromTotal(
      totalForFallback,
      order.items.length,
      defaultExchangeRate,
      defaultMarginVnd,
    );

    const newRows: ItemRow[] = order.items.map((it, i) => {
      const cny = fromHistory[i] ?? fallbackCny;
      return {
        name: it.name,
        productUrl: "",
        attributes: itemAttributes(it),
        quantity: String(it.quantity || 1),
        unitPriceCny: cny > 0 ? String(cny) : "",
        costConfirmed: false,
      };
    });
    setItems((prev) => mergeItems(prev, newRows));
  }

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
      // Xoá server lỗi thì ảnh vẫn đã biến mất khỏi form — không chặn người dùng,
      // ảnh mồ côi (chưa gắn đơn) không gây hại gì thêm.
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
          const { patch, found } = mergeMoneyFields(order);
          applyMoneyPatch(patch);
          if (patch.quotedTotal !== undefined) currentTotal = patch.quotedTotal;
          if (order.items.length > 0) {
            await applyItemsFromExtract(order, currentTotal);
          }
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

  const parsedItems = useMemo(
    () =>
      items.map((it) => ({
        name: it.name.trim(),
        productUrl: it.productUrl.trim(),
        attributes: it.attributes.trim(),
        quantity: num(it.quantity),
        unitPriceCny: num(it.unitPriceCny),
        costConfirmed: it.costConfirmed,
      })),
    [items],
  );

  const validItems = parsedItems.filter((it) => it.name !== "");
  const goodsTotalCny = sumLineItemsCny(validItems);
  const goodsVnd = Math.round(goodsTotalCny * num(exchangeRate));

  // Total là dữ kiện. Chưa nhập thì suy từ giá vốn + lời mặc định mỗi món.
  const totalVnd =
    quotedTotal.trim() !== ""
      ? num(quotedTotal)
      : goodsVnd + defaultMarginVnd * Math.max(validItems.length, 1);

  // Lời = phần dư. Có thể âm — đơn lỗ là chuyện có thật.
  const marginVnd = totalVnd - goodsVnd;

  const money = computeOrderMoney({
    goodsTotalCny,
    exchangeRate: num(exchangeRate),
    serviceFee: marginVnd,
    shippingFee: num(shippingFee),
    deposit: num(deposit),
  });

  const selectedCustomer = customers.find((c) => String(c.id) === customerId);
  const customerName =
    customerMode === "new" ? newCustomerName : (selectedCustomer?.name ?? "");

  const quote = buildQuoteText({
    customerName,
    items: validItems,
    exchangeRate: num(exchangeRate),
    serviceFee: marginVnd,
    shippingFee: num(shippingFee),
    deposit: num(deposit),
  });

  const quoteImages = photos.filter((p) => p.kind === "chot_don");

  // KHÔNG bắt buộc có khách: đơn từ ảnh Zalo thường chưa có thông tin khách.
  // Giá ¥ cũng không bắt buộc — chưa biết thì toàn bộ Total nằm ở lời,
  // đơn mang cờ "thiếu giá vốn" để nhắc bổ sung sau.
  const canSubmit =
    validItems.length > 0 &&
    validItems.every((it) => it.quantity > 0) &&
    num(exchangeRate) > 0 &&
    totalVnd > 0;

  function updateItem(i: number, patch: Partial<ItemRow>) {
    setItems((prev) =>
      prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)),
    );
  }
  function addItem() {
    setItems((prev) => [...prev, { ...emptyItem }]);
  }
  function removeItem(i: number) {
    setItems((prev) =>
      prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i),
    );
  }

  return (
    <form action={formAction} className="order-form">
      {state.error && <div className="error">{state.error}</div>}

      <input type="hidden" name="items" value={JSON.stringify(parsedItems)} />
      <input type="hidden" name="customerMode" value={customerMode} />
      <input type="hidden" name="zaloPhotoId" value={zaloPhotoId} />
      <input type="hidden" name="quotedTotalVnd" value={totalVnd} />
      <input type="hidden" name="shipStatus" value={shipStatus} />

      {/* Đọc ảnh chốt đơn Zalo bằng AI */}
      <section className="card zalo-reader">
        <h2 className="card-title">🤖 Đọc ảnh chốt đơn Zalo</h2>
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
          Kéo-thả ảnh vào đây, hoặc bấm để chọn (chọn được nhiều ảnh)
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
                <img src={`/api/photo/${ph.id}`} alt="" />
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
      </section>

      <div className="two-col">
        <section className="card">
          <h2 className="card-title">Khách hàng</h2>
          <div className="seg">
            <button
              type="button"
              className={customerMode === "existing" ? "seg-on" : ""}
              onClick={() => setCustomerMode("existing")}
              disabled={customers.length === 0}
            >
              Khách có sẵn
            </button>
            <button
              type="button"
              className={customerMode === "new" ? "seg-on" : ""}
              onClick={() => setCustomerMode("new")}
            >
              Khách mới
            </button>
          </div>

          {customerMode === "existing" ? (
            <div className="field">
              <label>Chọn khách</label>
              <select
                name="customerId"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.warningFlag ? "⚠️ " : ""}
                    {c.name}
                  </option>
                ))}
              </select>
              {selectedCustomer?.warningFlag && (
                <div className="warn-flag" style={{ marginTop: 8 }}>
                  ⚠️ Khách có cờ cảnh báo
                  {selectedCustomer.warningReason
                    ? `: ${selectedCustomer.warningReason}`
                    : ""}
                  . Cân nhắc yêu cầu cọc cao hơn.
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="field">
                <label>Tên khách *</label>
                <input
                  name="newCustomerName"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  placeholder="VD: Chị Lan"
                />
              </div>
              <div className="field">
                <label>SĐT / Zalo</label>
                <input
                  name="newCustomerPhone"
                  value={newCustomerPhone}
                  onChange={(e) => setNewCustomerPhone(e.target.value)}
                  placeholder="09..."
                />
              </div>
              <div className="field">
                <label>Địa chỉ giao</label>
                <input
                  name="newCustomerAddress"
                  value={newCustomerAddress}
                  onChange={(e) => setNewCustomerAddress(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="field">
            <label>Loại đơn</label>
            <select
              name="orderType"
              value={orderType}
              onChange={(e) => setOrderType(e.target.value)}
            >
              {ORDER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ORDER_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">Tính tiền</h2>
          <div className="field">
            <label>Tỷ giá (VND / tệ) *</label>
            <input
              name="exchangeRate"
              inputMode="numeric"
              value={exchangeRate}
              onChange={(e) => setExchangeRate(e.target.value)}
            />
          </div>
          <div className="grid-2">
            <div className="field">
              <label>Total đã chốt (₫)</label>
              <input
                inputMode="numeric"
                value={quotedTotal}
                onChange={(e) => setQuotedTotal(e.target.value)}
                placeholder={String(totalVnd)}
              />
              <span className="muted small">
                Lời:{" "}
                <strong className={marginVnd < 0 ? "profit-negative" : ""}>
                  {formatVnd(marginVnd)}
                </strong>
              </span>
            </div>
            <div className="field">
              <label>Phí ship (₫)</label>
              <input
                name="shippingFee"
                inputMode="numeric"
                value={shippingFee}
                onChange={(e) => {
                  setShippingFee(e.target.value);
                  // Gõ số vào = đã biết ship; xoá trắng = quay lại "chưa biết".
                  setShipStatus(e.target.value.trim() === "" ? "unknown" : "set");
                }}
                placeholder="tính sau khi hàng về"
              />
              <span className="muted small">
                {shipStatus === "unknown"
                  ? "Chưa biết — sẽ nhắc khi hàng về kho VN"
                  : shipStatus === "free"
                    ? "Freeship"
                    : "Đã nhập"}
              </span>
            </div>
          </div>
          <div className="field">
            <label>Đã cọc (₫)</label>
            <input
              name="deposit"
              inputMode="numeric"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
            />
          </div>

          <div className="money-preview">
            <div className="kv">
              <span>Tiền hàng</span>
              <span>{formatVnd(money.goodsTotalVnd)}</span>
            </div>
            <div className="kv">
              <span>Tạm tính</span>
              <span>{formatVnd(money.subtotalVnd)}</span>
            </div>
            <div className="kv kv-total">
              <span>Còn phải thu</span>
              <strong>{formatVnd(money.amountDue)}</strong>
            </div>
          </div>
        </section>
      </div>

      <section className="card">
        <h2 className="card-title">Sản phẩm</h2>
        <div className="items">
          {items.map((it, i) => (
            <div key={i} className="item-row">
              <input
                placeholder="Tên hàng *"
                value={it.name}
                onChange={(e) => updateItem(i, { name: e.target.value })}
                className="it-name"
              />
              <input
                placeholder="Link"
                value={it.productUrl}
                onChange={(e) => updateItem(i, { productUrl: e.target.value })}
                className="it-url"
              />
              <input
                placeholder="Size/màu"
                value={it.attributes}
                onChange={(e) => updateItem(i, { attributes: e.target.value })}
                className="it-attr"
              />
              <input
                placeholder="SL"
                inputMode="numeric"
                value={it.quantity}
                onChange={(e) => updateItem(i, { quantity: e.target.value })}
                className="it-qty"
              />
              <input
                placeholder="Đơn giá"
                inputMode="decimal"
                value={it.unitPriceCny}
                onChange={(e) =>
                  updateItem(i, {
                    unitPriceCny: e.target.value,
                    // Sửa số = xác nhận giá vốn, không còn là gợi ý của máy.
                    costConfirmed: true,
                  })
                }
                title={it.costConfirmed ? undefined : "Giá gợi ý — sửa để xác nhận"}
                className={`it-price${it.costConfirmed ? "" : " cny-suggested"}`}
              />
              <button
                type="button"
                className="it-del"
                onClick={() => removeItem(i)}
                aria-label="Xoá dòng"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={addItem}>
          + Thêm dòng
        </button>
      </section>

      <section className="card">
        <h2 className="card-title">Ghi chú</h2>
        <textarea name="note" rows={2} placeholder="Ghi chú nội bộ (nếu có)" />
      </section>

      <div className="form-actions">
        <CopyButton
          text={quote}
          label="Copy báo giá gửi Zalo"
          className="btn btn-ghost"
        />
        <button type="submit" className="btn" disabled={!canSubmit || pending}>
          {pending ? "Đang lưu…" : "Lưu đơn"}
        </button>
      </div>
    </form>
  );
}
