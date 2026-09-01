import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BULK_LIMIT,
  planBulkAdvance,
  type BulkOrder,
} from "../src/lib/bulk-status.ts";

const o = (
  id: number,
  status: BulkOrder["status"],
  orderType: BulkOrder["orderType"] = "order_ho",
  goodsTotalCny = 0,
): BulkOrder => ({ id, status, orderType, goodsTotalCny });

test("gom các đơn cùng phép chuyển vào một nhóm", () => {
  const plan = planBulkAdvance([
    o(1, "da_mua_tq"),
    o(2, "da_mua_tq"),
    o(3, "da_mua_tq"),
  ]);
  assert.equal(plan.groups.length, 1);
  assert.equal(plan.groups[0].from, "da_mua_tq");
  assert.equal(plan.groups[0].to, "da_giao_khach");
  assert.deepEqual(plan.groups[0].ids, [1, 2, 3]);
  assert.equal(plan.total, 3);
});

test("trộn loại đơn: mỗi đơn tiến trên trục của riêng nó", () => {
  const plan = planBulkAdvance([
    o(1, "da_mua_tq", "order_ho"),
    o(2, "da_mua_tq", "nhap_kho"),
  ]);
  const tos = plan.groups.map((g) => g.to).sort();
  assert.deepEqual(tos, ["da_giao_khach", "ve_kho_vn"]);
});

test("cộng dồn ¥ của nhóm đi tới 'đã mua' — cảnh báo tiêu tiền thật", () => {
  const plan = planBulkAdvance([
    o(1, "khach_chot", "order_ho", 320),
    o(2, "khach_chot", "order_ho", 920),
  ]);
  assert.equal(plan.groups.length, 1);
  assert.equal(plan.groups[0].to, "da_mua_tq");
  assert.equal(plan.groups[0].cnyTotal, 1240);
});

test("nhóm không đi tới 'đã mua' thì cnyTotal = 0", () => {
  const plan = planBulkAdvance([o(1, "da_mua_tq", "order_ho", 500)]);
  assert.equal(plan.groups[0].cnyTotal, 0);
});

test("đơn ở bước cuối bị bỏ qua kèm lý do", () => {
  const plan = planBulkAdvance([o(1, "hoan_tat"), o(2, "da_mua_tq")]);
  assert.equal(plan.groups.length, 1);
  assert.equal(plan.skipped.length, 1);
  assert.equal(plan.skipped[0].id, 1);
  assert.match(plan.skipped[0].reason, /cuối|Hoàn tất/i);
});

test("đơn đang ở sự cố bị bỏ qua — có nhiều đường ra, máy không tự chọn", () => {
  const plan = planBulkAdvance([o(1, "su_co")]);
  assert.equal(plan.groups.length, 0);
  assert.equal(plan.skipped.length, 1);
});

test("danh sách rỗng ra kế hoạch rỗng", () => {
  assert.deepEqual(planBulkAdvance([]), { groups: [], skipped: [], total: 0 });
});

test("giới hạn mỗi lượt là 50 đơn", () => {
  assert.equal(BULK_LIMIT, 50);
});
