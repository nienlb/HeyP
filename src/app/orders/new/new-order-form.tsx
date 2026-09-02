"use client";

import { useActionState, useMemo, useState } from "react";
import {
  createOrderAction,
  deletePhotoAction,
  suggestCnyAction,
  type CreateOrderState,
} from "@/app/orders/actions";
import { computeOrderMoney, sumLineItemsCny } from "@/lib/money";
import { formatVnd } from "@/lib/format";
import {
  allocateMargins,
  marginFromSellPrice,
  suggestCnyFromTotal,
} from "@/lib/line-pricing";
import type { ShipStatus } from "@/lib/order-gaps";
import {
  ORDER_TYPES,
  ORDER_TYPE_LABELS,
  type OrderType,
} from "@/lib/order-status";
import { itemAttributes, type ZaloExtract } from "@/lib/zalo-extract";
import { mergeItems, mergeMoneyFields } from "@/lib/zalo-merge";
import { StickyBar } from "@/app/_components/sticky-bar";
import { Icon } from "@/app/_components/icons";
import { CustomerSheet, type CustomerPick } from "./customer-sheet";
import { ItemSheet } from "./item-sheet";
import { QuickImportSheet } from "./quick-import-sheet";
import { photoUrl } from "@/lib/photos";
import { groupVnd, parseDecimal, parseVnd } from "@/lib/parse-number";
import { emptyItem, type CustomerOption, type ItemRow } from "./types";

export function NewOrderForm({
  customers,
  defaultExchangeRate,
  defaultMarginVnd,
}: {
  customers: CustomerOption[];
  defaultExchangeRate: number;
  defaultMarginVnd: number;
}) {
  const [state, formAction, pending] = useActionState<
    CreateOrderState,
    FormData
  >(createOrderAction, {});

  const [orderType, setOrderType] = useState<OrderType>("order_ho");
  const [exchangeRate, setExchangeRate] = useState(String(defaultExchangeRate));
  // Total giờ là Σ các dòng. Ô này chỉ để GHI ĐÈ khi khách trả số tròn.
  const [totalOverride, setTotalOverride] = useState("");
  const [shipStatus, setShipStatus] = useState<ShipStatus>("unknown");
  const [shippingFee, setShippingFee] = useState("");
  const [deposit, setDeposit] = useState("");
  const [items, setItems] = useState<ItemRow[]>([]);

  const [picked, setPicked] = useState<CustomerPick | null>(
    customers[0]
      ? { mode: "existing", id: customers[0].id, name: customers[0].name }
      : null,
  );
  const [customerSheet, setCustomerSheet] = useState(false);
  // SĐT/địa chỉ vẫn là state riêng, nằm ở khối gập trong màn chính.
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerAddress, setNewCustomerAddress] = useState("");

  const [itemSheet, setItemSheet] = useState<
    { open: false } | { open: true; index: number | null }
  >({ open: false });
  const [importOpen, setImportOpen] = useState(false);

  /** Áp một patch (từ mergeMoneyFields) vào state form — chỉ set trường có mặt. */
  function applyMoneyPatch(patch: ReturnType<typeof mergeMoneyFields>["patch"]) {
    if (patch.newCustomerName !== undefined && patch.newCustomerName !== "")
      setPicked({ mode: "new", name: patch.newCustomerName });
    if (patch.newCustomerPhone !== undefined)
      setNewCustomerPhone(patch.newCustomerPhone);
    if (patch.newCustomerAddress !== undefined)
      setNewCustomerAddress(patch.newCustomerAddress);
    if (patch.quotedTotal !== undefined) setTotalOverride(patch.quotedTotal);
    if (patch.deposit !== undefined) setDeposit(patch.deposit);
    if (patch.shipStatus !== undefined) setShipStatus(patch.shipStatus);
    if (patch.shippingFee !== undefined) setShippingFee(patch.shippingFee);
  }

  /**
   * Gợi ý giá ¥ cho sản phẩm đọc được rồi gộp vào danh sách hiện có.
   *
   * `currentTotalStr` truyền tay (KHÔNG đọc state `totalOverride` qua
   * closure): hàm này chạy trong vòng lặp đọc ảnh của ZaloDropzone, và React
   * không cập nhật lại closure của một async function đang chạy dở dù đã
   * setTotalOverride ở ảnh trước — dùng biến cục bộ theo dõi xuyên suốt vòng
   * lặp mới đúng.
   *
   * Ảnh chốt đơn cho biết TỔNG, không cho biết giá từng món — chia đều Total
   * cho các món để có giá thu khởi điểm, người dùng chỉnh lại nếu lệch.
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
    const totalForFallback = order.totalVnd ?? parseVnd(currentTotalStr);
    const perLineSell =
      order.items.length > 0
        ? Math.round(totalForFallback / order.items.length)
        : 0;
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
        sellPriceVnd: perLineSell > 0 ? String(perLineSell) : "",
        unitPriceCny: cny > 0 ? String(cny) : "",
        costConfirmed: false,
        photos: [],
      };
    });
    setItems((prev) => mergeItems(prev, newRows));
  }

  /**
   * Cầu nối cho QuickImportSheet: một ảnh đọc xong thì áp patch tiền/khách
   * vào state form và gộp sản phẩm đọc được, rồi trả về Total mới nhất để
   * theo dõi xuyên suốt vòng lặp nhiều ảnh của nó.
   */
  async function onExtract(
    order: ZaloExtract,
    currentTotalStr: string,
  ): Promise<string> {
    const { patch } = mergeMoneyFields(order);
    applyMoneyPatch(patch);
    const currentTotal =
      patch.quotedTotal !== undefined ? patch.quotedTotal : currentTotalStr;
    if (order.items.length > 0) {
      await applyItemsFromExtract(order, currentTotal);
    }
    return currentTotal;
  }

  const parsedItems = useMemo(
    () =>
      items.map((it) => {
        const quantity = parseVnd(it.quantity);
        const unitPriceCny = parseDecimal(it.unitPriceCny);
        const sell = parseVnd(it.sellPriceVnd);
        const line = { quantity, unitPriceCny, marginVnd: 0 };
        return {
          name: it.name.trim(),
          productUrl: it.productUrl.trim(),
          attributes: it.attributes.trim(),
          quantity,
          unitPriceCny,
          costConfirmed: it.costConfirmed,
          sellVnd: sell,
          // Lời là PHẦN DƯ của dòng — phần lẻ do làm tròn ¥ rơi vào đây, nhờ
          // vậy Σ giá bán khớp đúng Total.
          marginVnd: marginFromSellPrice(sell, line, parseVnd(exchangeRate)),
          photoIds: it.photos.map((p) => p.id),
        };
      }),
    [items, exchangeRate],
  );

  const validItems = parsedItems.filter((it) => it.name !== "");
  const goodsTotalCny = sumLineItemsCny(validItems);
  const goodsVnd = Math.round(goodsTotalCny * parseVnd(exchangeRate));

  /** Σ giá bán các dòng — Total mặc định của đơn từ v6. */
  const linesTotal = validItems.reduce(
    (s, it) => s + it.sellVnd * it.quantity,
    0,
  );
  const overrideVnd = parseVnd(totalOverride);
  const totalVnd = totalOverride.trim() !== "" ? overrideVnd : linesTotal;

  /**
   * Ghi đè Total → lời từng dòng phải rải lại để Σ giá bán vẫn đúng bằng
   * Total. Tính ngay ở client rồi gửi lời đã rải đi (createOrder đi nhánh
   * hasMargins, không tự rải nữa).
   */
  const sentItems = useMemo(() => {
    if (totalOverride.trim() === "" || validItems.length === 0)
      return parsedItems;
    const margins = allocateMargins(
      overrideVnd,
      validItems.map((it) => ({
        quantity: it.quantity,
        unitPriceCny: it.unitPriceCny,
        marginVnd: it.marginVnd,
      })),
      parseVnd(exchangeRate),
      defaultMarginVnd,
    );
    let k = 0;
    return parsedItems.map((it) =>
      it.name === "" ? it : { ...it, marginVnd: margins[k++] },
    );
  }, [
    parsedItems,
    validItems,
    totalOverride,
    overrideVnd,
    exchangeRate,
    defaultMarginVnd,
  ]);

  const marginVnd = totalVnd - goodsVnd;

  // Tách ra biến vì cột phải (v8-A) cũng cần hiện cọc — OrderMoneyResult
  // KHÔNG có trường deposit, nó chỉ trả goodsTotalVnd/subtotalVnd/amountDue.
  const depositVnd = parseVnd(deposit);

  const money = computeOrderMoney({
    goodsTotalCny,
    exchangeRate: parseVnd(exchangeRate),
    serviceFee: marginVnd,
    shippingFee: parseVnd(shippingFee),
    deposit: depositVnd,
  });

  // KHÔNG bắt buộc có khách: đơn từ ảnh chốt thường chưa có thông tin khách.
  // Giá phải thu MỚI là ô bắt buộc từ v6 — ¥ suy ngược, không bắt gõ tay.
  const canSubmit =
    validItems.length > 0 &&
    validItems.every((it) => it.quantity > 0 && it.sellVnd > 0) &&
    parseVnd(exchangeRate) > 0 &&
    totalVnd > 0;

  function handleShippingFeeChange(v: string) {
    setShippingFee(v);
    // Gõ số vào = đã biết ship; xoá trắng = quay lại "chưa biết".
    setShipStatus(v.trim() === "" ? "unknown" : "set");
  }

  function saveItem(row: ItemRow, addAnother: boolean) {
    setItems((prev) => {
      if (!itemSheet.open || itemSheet.index === null) return [...prev, row];
      return prev.map((it, i) => (i === itemSheet.index ? row : it));
    });
    // Thêm liên tiếp: giữ sheet ở chế độ "thêm mới" cho món kế tiếp.
    if (addAnother) setItemSheet({ open: true, index: null });
  }

  function deleteItem() {
    if (!itemSheet.open || itemSheet.index === null) return;
    const i = itemSheet.index;

    // Ảnh của món phải xoá theo, nếu không chúng nằm lại trong DB
    // (order_id NULL) và trên Storage vĩnh viễn — không màn nào hiện ra nên
    // không ai biết mà dọn.
    for (const p of items[i]?.photos ?? []) {
      deletePhotoAction(p.id).catch(() => {
        // Xoá hỏng thì job dọn ảnh mồ côi (api/cron/track) lo nốt.
      });
    }

    setItems((prev) => prev.filter((_, idx) => idx !== i));
    setItemSheet({ open: false });
  }

  return (
    <>
      {/* Nút này thuộc về header nhưng state của nó nằm trong form (Client
          Component), còn header do AppShell (Server Component) dựng — neo
          bằng position: fixed vào đúng ô hành động thay vì kéo state lên. */}
      <button
        type="button"
        className="header-action-float"
        onClick={() => setImportOpen(true)}
        aria-label="Nhập nhanh từ ảnh"
      >
        <Icon name="image" size={22} />
      </button>

      <div className="with-rail">
        <form action={formAction} className="order-form" id="new-order-form">
          {state.error && <div className="error">{state.error}</div>}

          <input
            type="hidden"
            name="items"
            value={JSON.stringify(sentItems)}
          />
          <input type="hidden" name="quotedTotalVnd" value={totalVnd} />
          <input type="hidden" name="shipStatus" value={shipStatus} />
          <input type="hidden" name="customerMode" value={picked?.mode ?? "new"} />
          {picked?.mode === "existing" && (
            <input type="hidden" name="customerId" value={picked.id} />
          )}
          {picked?.mode === "new" && (
            <input type="hidden" name="newCustomerName" value={picked.name} />
          )}

          <h2 className="sec-label">Khách</h2>
          <button
            type="button"
            className="picker"
            onClick={() => setCustomerSheet(true)}
          >
            {picked ? picked.name : "+ Chọn khách"}
          </button>

          {picked?.mode === "new" && (
            <details className="more-fields">
              <summary>Thêm SĐT / địa chỉ</summary>
              <label className="field">
                <span>SĐT / Zalo</span>
                <input
                  name="newCustomerPhone"
                  type="tel"
                  inputMode="tel"
                  value={newCustomerPhone}
                  onChange={(e) => setNewCustomerPhone(e.target.value)}
                  placeholder="09..."
                />
              </label>
              <label className="field">
                <span>Địa chỉ giao</span>
                <input
                  name="newCustomerAddress"
                  value={newCustomerAddress}
                  onChange={(e) => setNewCustomerAddress(e.target.value)}
                />
              </label>
            </details>
          )}

          <h2 className="sec-label">Món ({validItems.length})</h2>
          <div className="item-cards">
            {items.map((it, i) => (
              <button
                key={i}
                type="button"
                className="item-card"
                onClick={() => setItemSheet({ open: true, index: i })}
              >
                {it.photos[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoUrl(it.photos[0].id, "thumb")}
                    alt=""
                    className="ic-thumb"
                    loading="lazy"
                  />
                )}
                <span className="ic-name">{it.name || "(chưa đặt tên)"}</span>
                <span className="ic-meta">
                  {it.attributes || "—"} · ×{it.quantity || 0}
                </span>
                <span className="ic-price num">
                  {it.sellPriceVnd ? `${groupVnd(it.sellPriceVnd)}₫` : "—"}
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="picker"
            onClick={() => setItemSheet({ open: true, index: null })}
          >
            + Thêm món
          </button>

          <h2 className="sec-label">Tiền</h2>
          <label className="field">
            <span>Cọc (₫)</span>
            <input
              name="deposit"
              inputMode="numeric"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              onFocus={(e) => setDeposit(e.target.value.replace(/[.,\s]/g, ""))}
              onBlur={(e) => setDeposit(groupVnd(e.target.value))}
              enterKeyHint="done"
            />
          </label>

          <details className="more-fields">
            <summary>Tỷ giá · ship · loại đơn</summary>
            <label className="field">
              <span>Chốt số khác với tổng món (₫)</span>
              <input
                inputMode="numeric"
                value={totalOverride}
                onChange={(e) => setTotalOverride(e.target.value)}
                onFocus={(e) =>
                  setTotalOverride(e.target.value.replace(/[.,\s]/g, ""))
                }
                onBlur={(e) => setTotalOverride(groupVnd(e.target.value))}
                placeholder={`Bỏ trống = ${linesTotal.toLocaleString("vi-VN")}`}
              />
            </label>
            <label className="field">
              <span>Tỷ giá (₫/¥)</span>
              <input
                name="exchangeRate"
                inputMode="numeric"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Phí ship (₫)</span>
              <input
                name="shippingFee"
                inputMode="numeric"
                value={shippingFee}
                onChange={(e) => handleShippingFeeChange(e.target.value)}
                onFocus={(e) =>
                  handleShippingFeeChange(e.target.value.replace(/[.,\s]/g, ""))
                }
                onBlur={(e) => handleShippingFeeChange(groupVnd(e.target.value))}
                placeholder="Chưa biết thì để trống"
              />
            </label>
            <label className="field">
              <span>Loại đơn</span>
              <select
                name="orderType"
                value={orderType}
                onChange={(e) => setOrderType(e.target.value as OrderType)}
              >
                {ORDER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ORDER_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Ghi chú</span>
              <textarea name="note" rows={2} placeholder="Ghi chú nội bộ" />
            </label>
          </details>
        </form>

        {/* Khối tiền viết MỘT lần, CSS quyết định nó đứng đâu: dưới 900px
            vẫn là .sticky-bar dính đáy như trước v8-A, từ 900px thành thẻ
            trong cột phải (luật .with-rail .sticky-bar trong layout.css). */}
        <div className="rail">
          <StickyBar>
            {/* Bốn dòng này chỉ hiện từ 900px — điện thoại vẫn chỉ thấy dòng
                Tổng như cũ, thanh dính đáy không cao thêm. */}
            <div className="rail-detail">
              <div className="kv">
                <span>Tiền hàng</span>
                <span className="num">
                  {goodsTotalCny.toLocaleString("vi-VN")}¥
                </span>
              </div>
              <div className="kv">
                <span>Giá vốn quy đổi</span>
                <span className="num">{formatVnd(goodsVnd)}</span>
              </div>
              <div className="kv">
                <span>Lời</span>
                <span className={`num${marginVnd < 0 ? " neg" : ""}`}>
                  {formatVnd(marginVnd)}
                </span>
              </div>
              <div className="kv">
                <span>Cọc</span>
                <span className="num">{formatVnd(depositVnd)}</span>
              </div>
            </div>

            <span className="sb-money">
              <span className="sb-label">Tổng</span>
              <strong className="num">{formatVnd(totalVnd)}</strong>
              <span className="sb-label">
                Lời{" "}
                <span className={marginVnd < 0 ? "neg" : ""}>
                  {formatVnd(marginVnd)}
                </span>
              </span>
            </span>
            <button
              type="submit"
              form="new-order-form"
              className="btn"
              disabled={!canSubmit || pending}
            >
              {pending ? "Đang lưu…" : "Lưu đơn"}
            </button>
          </StickyBar>
        </div>
      </div>

      <CustomerSheet
        open={customerSheet}
        onClose={() => setCustomerSheet(false)}
        customers={customers}
        onPick={setPicked}
      />

      <ItemSheet
        open={itemSheet.open}
        onClose={() => setItemSheet({ open: false })}
        initial={
          itemSheet.open && itemSheet.index !== null
            ? items[itemSheet.index]
            : null
        }
        onSave={saveItem}
        onDelete={
          itemSheet.open && itemSheet.index !== null ? deleteItem : undefined
        }
        sellRate={parseVnd(exchangeRate)}
        defaultMarginVnd={defaultMarginVnd}
      />

      <QuickImportSheet
        open={importOpen}
        onClose={() => setImportOpen(false)}
        quotedTotal={totalOverride}
        onExtract={onExtract}
      />
    </>
  );
}
