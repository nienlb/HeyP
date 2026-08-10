import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyStockIn,
  applyStockOut,
  bomCostBasis,
  saleProfit,
  unitGoodsCostVnd,
  weightedAvgCost,
} from "../src/lib/inventory.ts";

test("giá vốn bình quân gia quyền", () => {
  // 5 cái @100k, nhập thêm 5 cái @200k → bình quân 150k
  assert.equal(weightedAvgCost(5, 100000, 5, 200000), 150000);
  // nhập vào kho trống → bằng giá nhập
  assert.equal(weightedAvgCost(0, 0, 10, 120000), 120000);
  // làm tròn
  assert.equal(weightedAvgCost(3, 100000, 1, 90000), 97500);
});

test("giá vốn 1 đơn vị từ đơn (tệ × tỷ giá)", () => {
  assert.equal(unitGoodsCostVnd(100, 3600), 360000);
  assert.equal(unitGoodsCostVnd(99.5, 3605), Math.round(99.5 * 3605));
});

test("nhập kho: cộng số lượng + cập nhật giá vốn", () => {
  const after = applyStockIn({ quantity: 5, avgCost: 100000 }, 5, 200000);
  assert.deepEqual(after, { quantity: 10, avgCost: 150000 });
});

test("xuất kho: giảm số lượng, giá vốn giữ nguyên", () => {
  const after = applyStockOut({ quantity: 10, avgCost: 150000 }, 3);
  assert.deepEqual(after, { quantity: 7, avgCost: 150000 });
});

test("xuất kho quá tồn → ném lỗi", () => {
  assert.throws(() => applyStockOut({ quantity: 2, avgCost: 100000 }, 3));
});

test("bán từ kho: lãi khi giá bán > giá vốn", () => {
  // bán 2 cái, giá vốn 150k/cái, khách trả 500k → vốn 300k, lãi 200k
  const r = saleProfit(2, 150000, 500000);
  assert.equal(r.cost, 300000);
  assert.equal(r.revenue, 500000);
  assert.equal(r.profit, 200000);
});

test("bán từ kho: lỗ khi giá bán < giá vốn (bán tháo hàng lỗi)", () => {
  const r = saleProfit(1, 300000, 200000);
  assert.equal(r.profit, -100000);
});

// ----- 3 luồng ngoại lệ: kiểm tra giá vốn đưa vào kho -----

test("luồng hàng lỗi NCC: giá vốn = tiền hàng thực của dòng", () => {
  // 1 cái lỗi, đơn giá 100 tệ, tỷ giá 3600 → giá vốn 360k vào kho nhãn Lỗi NCC
  const unitCost = unitGoodsCostVnd(100, 3600);
  const after = applyStockIn({ quantity: 0, avgCost: 0 }, 1, unitCost);
  assert.deepEqual(after, { quantity: 1, avgCost: 360000 });
});

test("luồng đổi trả: nhập lại kho theo giá vốn hàng", () => {
  const unitCost = unitGoodsCostVnd(50, 3600); // 180k
  const after = applyStockIn({ quantity: 2, avgCost: 180000 }, 1, unitCost);
  assert.equal(after.quantity, 3);
  assert.equal(after.avgCost, 180000);
});

test("luồng khách bom: giá vốn lô = tiền hàng + ship − cọc", () => {
  // tiền hàng 720k + ship 120k − cọc 300k = 540k cho cả lô
  const basis = bomCostBasis(720000, 120000, 300000);
  assert.equal(basis, 540000);
  // đưa vào kho: 2 cái → giá vốn mỗi cái = 270k
  const perUnit = Math.round(basis / 2);
  const after = applyStockIn({ quantity: 0, avgCost: 0 }, 2, perUnit);
  assert.equal(after.quantity, 2);
  assert.equal(after.avgCost, 270000);
});
