import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canDeleteCustomer,
  canDeleteOrder,
  type OrderDeleteFacts,
} from "../src/lib/deletion.ts";

const clean: OrderDeleteFacts = {
  status: "khach_chot",
  cnySpent: 0,
  paymentCount: 0,
  expenseCount: 0,
};

test("đơn sạch ở Khách chốt thì xoá được", () => {
  assert.deepEqual(canDeleteOrder(clean), { ok: true });
});

test("đơn đã trừ ví ¥ bị chặn, thông báo nói rõ số tệ", () => {
  const r = canDeleteOrder({ ...clean, status: "da_mua_tq", cnySpent: 320 });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.reason, /320/);
    assert.match(r.reason, /Hủy|Sự cố/);
  }
});

test("đơn đã có phiếu thu bị chặn", () => {
  const r = canDeleteOrder({ ...clean, paymentCount: 1 });
  assert.equal(r.ok, false);
});

test("đơn đã có chi phí gắn vào bị chặn", () => {
  const r = canDeleteOrder({ ...clean, expenseCount: 2 });
  assert.equal(r.ok, false);
});

test("ba trạng thái đã cộng tồn kho đều bị chặn", () => {
  for (const status of ["ve_kho_vn", "hoan_tat", "khach_bom"] as const) {
    const r = canDeleteOrder({ ...clean, status });
    assert.equal(r.ok, false, `phải chặn ${status}`);
  }
});

test("đơn đã mua nhưng chưa tiêu ¥ nào (đơn 0 tệ) vẫn xoá được", () => {
  assert.deepEqual(canDeleteOrder({ ...clean, status: "da_mua_tq" }), {
    ok: true,
  });
});

test("đơn đã huỷ và đơn sự cố còn sạch thì xoá được", () => {
  assert.deepEqual(canDeleteOrder({ ...clean, status: "huy" }), { ok: true });
  assert.deepEqual(canDeleteOrder({ ...clean, status: "su_co" }), { ok: true });
});

test("khách còn đơn thì không xoá được, thông báo nói rõ số đơn", () => {
  const r = canDeleteCustomer({ orderCount: 3 });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /3/);
  assert.deepEqual(canDeleteCustomer({ orderCount: 0 }), { ok: true });
});
