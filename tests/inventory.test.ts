import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyStockIn,
  applyStockOut,
  bomCostBasis,
  planStockSale,
  stockKey,
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

// ---------- stockKey (v9-A) ----------

test("stockKey: mẫu trong danh mục dùng nhánh p:", () => {
  assert.equal(
    stockKey({ productId: 7, size: "38", color: "đen" }),
    "p:7|38|đen",
  );
});

test("stockKey: cùng mẫu cùng size cùng màu luôn ra cùng khoá", () => {
  const a = stockKey({ productId: 7, size: "38", color: "Đen" });
  const b = stockKey({ productId: 7, size: " 38 ", color: "đen" });
  assert.equal(a, b);
});

test("stockKey: khác size ra khoá khác — đây là điểm chính của v9-A", () => {
  assert.notEqual(
    stockKey({ productId: 7, size: "38", color: "đen" }),
    stockKey({ productId: 7, size: "42", color: "đen" }),
  );
});

test("stockKey: khác màu ra khoá khác", () => {
  assert.notEqual(
    stockKey({ productId: 7, size: "38", color: "đen" }),
    stockKey({ productId: 7, size: "38", color: "trắng" }),
  );
});

test("stockKey: size/màu trống vẫn hợp lệ", () => {
  assert.equal(stockKey({ productId: 7 }), "p:7||");
});

test("stockKey: chưa gắn danh mục thì dùng nhánh n: theo tên", () => {
  assert.equal(stockKey({ name: "Giày ABC" }), "n:giày abc");
});

test("stockKey: nhánh n: bỏ qua khoảng trắng thừa và hoa thường", () => {
  assert.equal(
    stockKey({ name: "  Giày   ABC " }),
    stockKey({ name: "giày abc" }),
  );
});

test("stockKey: productId = 0 hoặc null đều rơi về nhánh n:", () => {
  assert.equal(stockKey({ productId: null, name: "Dép" }), "n:dép");
  assert.equal(stockKey({ productId: 0, name: "Dép" }), "n:dép");
});

test("stockKey: nhánh n: KHÔNG tách theo size — giữ đúng cách gom cũ", () => {
  // Dòng tồn cũ không biết size. Nếu nhánh n: cũng tách size thì migration
  // backfill sẽ sinh khoá khác với khoá lúc chạy, và tồn kho nhân đôi.
  assert.equal(
    stockKey({ name: "Giày ABC", size: "38" }),
    stockKey({ name: "Giày ABC", size: "42" }),
  );
});

const STOCK = [
  { id: 1, name: "Dép A 38", quantity: 3, avgCost: 150_000 },
  { id: 2, name: "Giày B 42", quantity: 1, avgCost: 400_000 },
];

test("planStockSale: đủ hàng — tổng tiền, giá vốn, số tồn sau", () => {
  const p = planStockSale(
    [
      { inventoryId: 1, quantity: 2, sellPriceVnd: 250_000 },
      { inventoryId: 2, quantity: 1, sellPriceVnd: 650_000 },
    ],
    STOCK,
  );
  assert.equal(p.ok, true);
  if (!p.ok) return;
  assert.equal(p.totalVnd, 1_150_000);
  assert.equal(p.saleCost, 700_000);
  assert.deepEqual(p.lines.map((l) => l.lineCost), [300_000, 400_000]);
  assert.deepEqual(p.deductions, [
    { inventoryId: 1, after: 1 },
    { inventoryId: 2, after: 0 },
  ]);
});

test("planStockSale: thiếu một dòng thì từ chối CẢ đơn và nói rõ", () => {
  const p = planStockSale(
    [
      { inventoryId: 1, quantity: 1, sellPriceVnd: 250_000 },
      { inventoryId: 2, quantity: 2, sellPriceVnd: 650_000 },
    ],
    STOCK,
  );
  assert.deepEqual(p, { ok: false, reason: "Giày B 42: còn 1, muốn bán 2" });
});

test("planStockSale: cùng một dòng tồn chọn hai lần thì CỘNG số lượng trước khi kiểm", () => {
  const p = planStockSale(
    [
      { inventoryId: 1, quantity: 2, sellPriceVnd: 250_000 },
      { inventoryId: 1, quantity: 2, sellPriceVnd: 240_000 },
    ],
    STOCK,
  );
  assert.deepEqual(p, { ok: false, reason: "Dép A 38: còn 3, muốn bán 4" });
});

test("planStockSale: cùng dòng tồn hai lần mà vẫn đủ thì trừ MỘT lần với số gộp", () => {
  const p = planStockSale(
    [
      { inventoryId: 1, quantity: 1, sellPriceVnd: 250_000 },
      { inventoryId: 1, quantity: 2, sellPriceVnd: 240_000 },
    ],
    STOCK,
  );
  assert.equal(p.ok, true);
  if (!p.ok) return;
  assert.deepEqual(p.deductions, [{ inventoryId: 1, after: 0 }]);
  assert.equal(p.totalVnd, 250_000 + 2 * 240_000);
});

test("planStockSale: dòng tồn không tồn tại, số lượng hoặc giá không hợp lệ", () => {
  assert.equal(planStockSale([{ inventoryId: 9, quantity: 1, sellPriceVnd: 1 }], STOCK).ok, false);
  assert.equal(planStockSale([{ inventoryId: 1, quantity: 0, sellPriceVnd: 1 }], STOCK).ok, false);
  assert.equal(planStockSale([{ inventoryId: 1, quantity: 1.5, sellPriceVnd: 1 }], STOCK).ok, false);
  assert.equal(planStockSale([{ inventoryId: 1, quantity: 1, sellPriceVnd: 0 }], STOCK).ok, false);
  assert.equal(planStockSale([], STOCK).ok, false);
});
