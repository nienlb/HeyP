import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAIN_CHAIN,
  allowedNextStatuses,
  canTransition,
  isTerminal,
  transition,
  type OrderStatus,
} from "../src/lib/order-status.ts";

test("trục chính: tiến đúng 1 bước đều hợp lệ", () => {
  for (let i = 0; i < MAIN_CHAIN.length - 1; i++) {
    assert.ok(
      canTransition("order_ho", MAIN_CHAIN[i], MAIN_CHAIN[i + 1]),
      `${MAIN_CHAIN[i]} → ${MAIN_CHAIN[i + 1]} phải hợp lệ`,
    );
  }
});

test("trục chính: cấm nhảy cóc tiến", () => {
  assert.equal(canTransition("order_ho", "cho_bao_gia", "da_mua_tq"), false);
  assert.equal(canTransition("order_ho", "cho_bao_gia", "da_giao_khach"), false);
  assert.equal(canTransition("order_ho", "khach_chot", "hoan_tat"), false);
});

test("trục chính: cấm đi lùi", () => {
  assert.equal(canTransition("order_ho", "ve_kho_tq", "da_mua_tq"), false);
  assert.equal(canTransition("order_ho", "da_giao_khach", "khach_chot"), false);
});

test("trạng thái cuối không có bước ra", () => {
  assert.ok(isTerminal("hoan_tat"));
  assert.ok(isTerminal("huy"));
  assert.ok(isTerminal("khach_bom"));
  assert.deepEqual(allowedNextStatuses("order_ho", "hoan_tat"), []);
  assert.deepEqual(allowedNextStatuses("order_ho", "huy"), []);
  assert.deepEqual(allowedNextStatuses("order_ho", "khach_bom"), []);
});

test("Hủy: chỉ khi chưa mua hàng", () => {
  assert.ok(canTransition("order_ho", "cho_bao_gia", "huy"));
  assert.ok(canTransition("order_ho", "da_bao_gia", "huy"));
  assert.ok(canTransition("order_ho", "khach_chot", "huy"));
  // đã mua rồi thì không được Hủy
  assert.equal(canTransition("order_ho", "da_mua_tq", "huy"), false);
  assert.equal(canTransition("order_ho", "ve_kho_vn", "huy"), false);
});

test("Sự cố: ở các khâu đang lưu thông, không phải lúc chờ báo giá", () => {
  assert.ok(canTransition("order_ho", "da_mua_tq", "su_co"));
  assert.ok(canTransition("order_ho", "dang_van_chuyen_vn", "su_co"));
  assert.ok(canTransition("order_ho", "ve_kho_vn", "su_co"));
  assert.equal(canTransition("order_ho", "cho_bao_gia", "su_co"), false);
  assert.equal(canTransition("order_ho", "da_bao_gia", "su_co"), false);
});

test("Sự cố chưa phải trạng thái cuối: giải quyết xong quay lại hoặc rẽ nhánh", () => {
  assert.ok(!isTerminal("su_co"));
  assert.ok(canTransition("order_ho", "su_co", "ve_kho_tq"));
  assert.ok(canTransition("order_ho", "su_co", "huy"));
  assert.ok(canTransition("order_ho", "su_co", "khach_bom"));
});

test("Khách bom: chỉ ở khâu giao", () => {
  assert.ok(canTransition("order_ho", "ve_kho_vn", "khach_bom"));
  assert.ok(canTransition("order_ho", "da_giao_khach", "khach_bom"));
  assert.equal(canTransition("order_ho", "khach_chot", "khach_bom"), false);
  assert.equal(canTransition("order_ho", "da_mua_tq", "khach_bom"), false);
});

test("Đơn bán từ kho: nhảy thẳng tới Đã giao khách", () => {
  assert.ok(canTransition("ban_tu_kho", "cho_bao_gia", "da_giao_khach"));
  // đơn order hộ thì không được nhảy như vậy
  assert.equal(canTransition("order_ho", "cho_bao_gia", "da_giao_khach"), false);
  // sau khi giao thì hoàn tất bình thường
  assert.ok(canTransition("ban_tu_kho", "da_giao_khach", "hoan_tat"));
});

test("transition() trả lý do rõ khi sai luật", () => {
  const bad = transition("order_ho", "cho_bao_gia", "hoan_tat");
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.match(bad.reason, /Không được chuyển/);

  const same = transition("order_ho", "khach_chot", "khach_chot");
  assert.equal(same.ok, false);

  const good = transition("order_ho", "cho_bao_gia", "da_bao_gia");
  assert.equal(good.ok, true);
});

test("đi trọn vòng đời order hộ từ đầu tới hoàn tất", () => {
  let status: OrderStatus = MAIN_CHAIN[0];
  for (let i = 1; i < MAIN_CHAIN.length; i++) {
    const r = transition("order_ho", status, MAIN_CHAIN[i]);
    assert.equal(r.ok, true, `bước tới ${MAIN_CHAIN[i]} phải hợp lệ`);
    if (r.ok) status = r.to;
  }
  assert.equal(status, "hoan_tat");
});
