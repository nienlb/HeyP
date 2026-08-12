import { test } from "node:test";
import assert from "node:assert/strict";
import { computePnl, type PnlOrder } from "../src/lib/pnl.ts";

/** Đơn 60¥, bán 410.000 (60×4000 + 170.000 lời), giá vốn thật 3.600₫/¥. */
const order = (over: Partial<PnlOrder> = {}): PnlOrder => ({
  id: 1,
  orderType: "order_ho",
  quotedTotalVnd: 410000,
  shippingFee: 0,
  goodsTotalCny: 60,
  sellRate: 4000,
  costRate: 3600,
  saleCost: null,
  costConfirmed: true,
  marginVnd: 170000,
  ...over,
});

test("tháng trống → mọi số bằng 0, không chia cho 0", () => {
  const r = computePnl({ orders: [], expenses: [], bomDepositsVnd: 0 });
  assert.equal(r.netProfitVnd, 0);
  assert.equal(r.allocatedPerOrderVnd, null);
});

test("một đơn: lời gộp tách thành lời định giá và lời chênh tỷ giá", () => {
  const r = computePnl({ orders: [order()], expenses: [], bomDepositsVnd: 0 });
  assert.equal(r.confirmed.revenueVnd, 410000);
  assert.equal(r.confirmed.goodsCostVnd, 216000); // 60 × 3600
  assert.equal(r.confirmed.grossProfitVnd, 194000);
  assert.equal(r.confirmed.pricingMarginVnd, 170000);
  assert.equal(r.confirmed.fxMarginVnd, 24000); // 60 × (4000 − 3600)
});

test("BẤT BIẾN: lời gộp = lời định giá + lời chênh tỷ giá", () => {
  // Bất biến chỉ đúng khi Total khớp v3-A: Total = ¥×tỷ_giá_bán + lời.
  // 88,5¥ × 4000 + 170.000 = 524.000.
  const r = computePnl({
    orders: [
      order(),
      order({
        id: 2,
        goodsTotalCny: 88.5,
        costRate: 3712,
        quotedTotalVnd: 524000,
      }),
    ],
    expenses: [],
    bomDepositsVnd: 0,
  });
  assert.equal(
    r.confirmed.grossProfitVnd,
    r.confirmed.pricingMarginVnd + r.confirmed.fxMarginVnd,
  );
});

test("đơn còn dòng chưa xác nhận ¥ nằm ở khối ƯỚC TÍNH, không trộn", () => {
  const r = computePnl({
    orders: [order(), order({ id: 2, costConfirmed: false })],
    expenses: [],
    bomDepositsVnd: 0,
  });
  assert.equal(r.confirmed.orderCount, 1);
  assert.equal(r.estimated.orderCount, 1);
  assert.equal(r.confirmed.revenueVnd, 410000);
  assert.equal(r.estimated.revenueVnd, 410000);
});

test("đơn bán từ kho lấy giá vốn ở sale_cost, không dính ví ¥", () => {
  const r = computePnl({
    orders: [
      order({
        orderType: "ban_tu_kho",
        quotedTotalVnd: 500000,
        goodsTotalCny: 500000,
        sellRate: 1,
        costRate: null,
        saleCost: 300000,
        marginVnd: 0,
      }),
    ],
    expenses: [],
    bomDepositsVnd: 0,
  });
  assert.equal(r.confirmed.goodsCostVnd, 300000);
  assert.equal(r.confirmed.grossProfitVnd, 200000);
  assert.equal(r.confirmed.fxMarginVnd, 0, "hàng tồn kho không có chênh tỷ giá");
});

test("chưa mua hàng (chưa có giá vốn chốt) → coi như không có chênh tỷ giá", () => {
  const r = computePnl({
    orders: [order({ costRate: null })],
    expenses: [],
    bomDepositsVnd: 0,
  });
  assert.equal(r.confirmed.goodsCostVnd, 240000); // dùng tỷ giá bán
  assert.equal(r.confirmed.fxMarginVnd, 0);
});

test("chi phí gắn đơn trừ vào khối của đơn đó", () => {
  const r = computePnl({
    orders: [order()],
    expenses: [{ amountVnd: 30000, category: "ship_tra_shipper", orderId: 1 }],
    bomDepositsVnd: 0,
  });
  assert.equal(r.confirmed.orderExpensesVnd, 30000);
  assert.equal(r.periodExpensesVnd, 0);
});

test("chi phí không gắn đơn là chi phí theo kỳ, chia bình quân", () => {
  const r = computePnl({
    orders: [order(), order({ id: 2 })],
    expenses: [{ amountVnd: 500000, category: "quang_cao", orderId: null }],
    bomDepositsVnd: 0,
  });
  assert.equal(r.periodExpensesVnd, 500000);
  assert.equal(r.allocatedPerOrderVnd, 250000);
});

test("có chi phí kỳ nhưng KHÔNG đơn nào → không chia cho 0", () => {
  const r = computePnl({
    orders: [],
    expenses: [{ amountVnd: 500000, category: "luong", orderId: null }],
    bomDepositsVnd: 0,
  });
  assert.equal(r.periodExpensesVnd, 500000);
  assert.equal(r.allocatedPerOrderVnd, null);
  assert.equal(r.netProfitVnd, -500000);
});

test("ship thu cộng vào, cọc đơn khách bom cộng vào", () => {
  const r = computePnl({
    orders: [order({ shippingFee: 30000 })],
    expenses: [],
    bomDepositsVnd: 100000,
  });
  assert.equal(r.confirmed.shipCollectedVnd, 30000);
  assert.equal(r.bomDepositsVnd, 100000);
  assert.equal(r.netProfitVnd, 194000 + 30000 + 100000);
});

test("lãi ròng gộp đủ mọi thành phần", () => {
  const r = computePnl({
    orders: [order(), order({ id: 2, costConfirmed: false })],
    expenses: [
      { amountVnd: 30000, category: "den_khach", orderId: 1 },
      { amountVnd: 200000, category: "bao_bi", orderId: null },
    ],
    bomDepositsVnd: 50000,
  });
  // (194.000 − 30.000) + 194.000 − 200.000 + 50.000
  assert.equal(r.netProfitVnd, 208000);
});

test("gộp chi phí kỳ theo nhóm để hiển thị", () => {
  const r = computePnl({
    orders: [order()],
    expenses: [
      { amountVnd: 100000, category: "bao_bi", orderId: null },
      { amountVnd: 50000, category: "bao_bi", orderId: null },
      { amountVnd: 300000, category: "quang_cao", orderId: null },
    ],
    bomDepositsVnd: 0,
  });
  const byCat = Object.fromEntries(
    r.periodExpenseByCategory.map((c) => [c.category, c.amountVnd]),
  );
  assert.equal(byCat.bao_bi, 150000);
  assert.equal(byCat.quang_cao, 300000);
});
