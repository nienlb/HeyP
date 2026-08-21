"use client";

import { formatVnd } from "@/lib/format";
import type { ShipStatus } from "@/lib/order-gaps";

/**
 * Khối "Tính tiền" — tỷ giá, Total đã chốt, ship, cọc, và bảng xem trước tiền
 * còn phải thu. Không giữ state riêng, cha truyền giá trị + số đã tính xuống.
 */
export function MoneyBlock({
  exchangeRate,
  onExchangeRateChange,
  quotedTotal,
  onQuotedTotalChange,
  totalVnd,
  marginVnd,
  shippingFee,
  onShippingFeeChange,
  shipStatus,
  deposit,
  onDepositChange,
  money,
}: {
  exchangeRate: string;
  onExchangeRateChange: (v: string) => void;
  quotedTotal: string;
  onQuotedTotalChange: (v: string) => void;
  totalVnd: number;
  marginVnd: number;
  shippingFee: string;
  onShippingFeeChange: (v: string) => void;
  shipStatus: ShipStatus;
  deposit: string;
  onDepositChange: (v: string) => void;
  money: { goodsTotalVnd: number; subtotalVnd: number; amountDue: number };
}) {
  return (
    <section className="card">
      <h2 className="card-title">Tính tiền</h2>
      <div className="field">
        <label>Total đã chốt (₫)</label>
        <input
          inputMode="numeric"
          value={quotedTotal}
          onChange={(e) => onQuotedTotalChange(e.target.value)}
          placeholder={String(totalVnd)}
        />
        <span className="muted small">
          Lời:{" "}
          <strong className={marginVnd < 0 ? "profit-negative" : ""}>
            {formatVnd(marginVnd)}
          </strong>
        </span>
      </div>

      <details className="more-fields">
        <summary>Tỷ giá, phí ship, tiền cọc</summary>
        <div className="field">
          <label>Tỷ giá (VND / tệ) *</label>
          <input
            name="exchangeRate"
            inputMode="numeric"
            value={exchangeRate}
            onChange={(e) => onExchangeRateChange(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Phí ship (₫)</label>
          <input
            name="shippingFee"
            inputMode="numeric"
            value={shippingFee}
            onChange={(e) => onShippingFeeChange(e.target.value)}
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
        <div className="field">
          <label>Đã cọc (₫)</label>
          <input
            name="deposit"
            inputMode="numeric"
            value={deposit}
            onChange={(e) => onDepositChange(e.target.value)}
          />
        </div>
      </details>

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
  );
}
