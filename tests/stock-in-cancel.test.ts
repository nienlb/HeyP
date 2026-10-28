import { test } from "node:test";
import assert from "node:assert/strict";
import { applyStockIn } from "../src/lib/inventory.ts";
import { canCancelStockIn, reverseStockIn } from "../src/lib/stock-in-cancel.ts";

const ok = {
  orderType: "nhap_kho" as const,
  status: "ve_kho_vn" as const,
  exceptionLines: 0,
  cnyAdjustments: 0,
};

test("huỷ được phiếu nhập đã về kho, sạch", () => {
  assert.deepEqual(canCancelStockIn(ok), { ok: true });
});

test("không huỷ đơn khác loại hoặc khác trạng thái", () => {
  assert.equal(canCancelStockIn({ ...ok, orderType: "order_ho" }).ok, false);
  assert.equal(canCancelStockIn({ ...ok, status: "da_mua_tq" }).ok, false);
  assert.equal(canCancelStockIn({ ...ok, status: "huy" }).ok, false);
});

test("không huỷ khi đã tách món hoặc đã sửa ¥ sau khi nhập", () => {
  assert.equal(canCancelStockIn({ ...ok, exceptionLines: 1 }).ok, false);
  assert.equal(canCancelStockIn({ ...ok, cnyAdjustments: 1 }).ok, false);
});

test("rút đúng lần nhập thì trả về đúng trạng thái trước khi nhập", () => {
  const before = { quantity: 3, avgCost: 250_000 };
  const after = applyStockIn(before, 4, 272_000);
  const back = reverseStockIn(after, 4, 272_000);
  assert.ok(!("error" in back));
  assert.equal(back.quantity, before.quantity);
  // Bình quân đã làm tròn về đồng lúc nhập, nên rút ra lệch tối đa ±1 đồng.
  assert.ok(Math.abs(back.avgCost - before.avgCost) <= 1);
});

test("rút hết thì tồn 0, vốn 0", () => {
  assert.deepEqual(reverseStockIn({ quantity: 4, avgCost: 272_000 }, 4, 272_000), {
    quantity: 0,
    avgCost: 0,
  });
});

test("đã bán bớt, tồn ít hơn số nhập thì chặn", () => {
  const r = reverseStockIn({ quantity: 2, avgCost: 272_000 }, 4, 272_000);
  assert.ok("error" in r);
});

test("giá vốn không bao giờ âm", () => {
  // 2 đôi vốn 10k + 1 đôi vốn 100k → bq 40k; bán 1 → còn 2 @40k; rút đôi 100k.
  const r = reverseStockIn({ quantity: 2, avgCost: 40_000 }, 1, 100_000);
  assert.ok(!("error" in r));
  assert.equal(r.quantity, 1);
  assert.equal(r.avgCost, 0);
});
