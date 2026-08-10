"use client";

import { useActionState, useState } from "react";
import { sellFromStockAction, type SellState } from "./actions";
import { formatVnd } from "@/lib/format";

export function SellForm({
  inventoryId,
  quantity: stock,
  avgCost,
}: {
  inventoryId: number;
  quantity: number;
  avgCost: number;
}) {
  const [state, formAction, pending] = useActionState<SellState, FormData>(
    sellFromStockAction,
    {},
  );
  const [qty, setQty] = useState("1");
  const [salePrice, setSalePrice] = useState("");
  const [deposit, setDeposit] = useState("");

  const num = (s: string) => Number(String(s).replace(/[,\s]/g, "")) || 0;
  const cost = num(qty) * avgCost;
  const profit = num(salePrice) - cost;

  return (
    <form action={formAction} className="sell-form">
      <input type="hidden" name="inventoryId" value={inventoryId} />
      {state.error && <div className="error">{state.error}</div>}
      <div className="sell-grid">
        <label>
          SL bán
          <input
            name="quantity"
            inputMode="numeric"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </label>
        <label>
          Giá bán (₫)
          <input
            name="salePrice"
            inputMode="numeric"
            value={salePrice}
            onChange={(e) => setSalePrice(e.target.value)}
          />
        </label>
        <label>
          Đã cọc (₫)
          <input
            name="deposit"
            inputMode="numeric"
            value={deposit}
            onChange={(e) => setDeposit(e.target.value)}
          />
        </label>
        <label>
          Khách (tuỳ chọn)
          <input name="customerName" placeholder="Khách lẻ" />
        </label>
      </div>
      <div className="sell-foot">
        <span className="sell-profit">
          Giá vốn {formatVnd(cost)} ·{" "}
          {profit >= 0 ? (
            <strong className="pos">Lãi {formatVnd(profit)}</strong>
          ) : (
            <strong className="neg">Lỗ {formatVnd(-profit)}</strong>
          )}
        </span>
        <button
          type="submit"
          className="btn btn-sm"
          disabled={pending || num(qty) <= 0 || num(qty) > stock || num(salePrice) <= 0}
        >
          {pending ? "Đang bán…" : "Bán"}
        </button>
      </div>
    </form>
  );
}
