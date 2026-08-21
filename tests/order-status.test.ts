import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAIN_CHAIN,
  RETIRED_STATUSES,
  allowedNextStatuses,
  canTransition,
  initialStatus,
  isTerminal,
  isTerminalFor,
  journeyTrack,
  transition,
  type OrderStatus,
} from "../src/lib/order-status.ts";

test("trục order_ho đúng 4 bước", () => {
  assert.deepEqual(journeyTrack("order_ho"), [
    "khach_chot",
    "da_mua_tq",
    "da_giao_khach",
    "hoan_tat",
  ]);
});

test("mỗi loại đơn có trục riêng, bắt đầu ở bước đầu của trục đó", () => {
  assert.equal(initialStatus("order_ho"), "khach_chot");
  assert.equal(initialStatus("nhap_kho"), "da_mua_tq");
  assert.equal(initialStatus("ban_tu_kho"), "da_giao_khach");
  assert.deepEqual(journeyTrack("nhap_kho"), ["da_mua_tq", "ve_kho_vn"]);
  assert.deepEqual(journeyTrack("ban_tu_kho"), ["da_giao_khach", "hoan_tat"]);
});

test("tiến đúng 1 bước trên trục là hợp lệ", () => {
  for (let i = 0; i < MAIN_CHAIN.length - 1; i++) {
    assert.ok(
      canTransition("order_ho", MAIN_CHAIN[i], MAIN_CHAIN[i + 1]),
      `${MAIN_CHAIN[i]} → ${MAIN_CHAIN[i + 1]} phải hợp lệ`,
    );
  }
  assert.ok(canTransition("nhap_kho", "da_mua_tq", "ve_kho_vn"));
  assert.ok(canTransition("ban_tu_kho", "da_giao_khach", "hoan_tat"));
});

test("cấm nhảy cóc", () => {
  assert.equal(canTransition("order_ho", "khach_chot", "da_giao_khach"), false);
  assert.equal(canTransition("order_ho", "khach_chot", "hoan_tat"), false);
  assert.equal(canTransition("order_ho", "da_mua_tq", "hoan_tat"), false);
});

test("cấm đi lùi", () => {
  assert.equal(canTransition("order_ho", "da_mua_tq", "khach_chot"), false);
  assert.equal(canTransition("order_ho", "da_giao_khach", "da_mua_tq"), false);
});

test("trạng thái cuối không có bước ra", () => {
  assert.ok(isTerminal("hoan_tat"));
  assert.ok(isTerminal("huy"));
  assert.ok(isTerminal("khach_bom"));
  assert.deepEqual(allowedNextStatuses("order_ho", "hoan_tat"), []);
  assert.deepEqual(allowedNextStatuses("order_ho", "huy"), []);
  assert.deepEqual(allowedNextStatuses("order_ho", "khach_bom"), []);
});

test("ve_kho_vn là điểm kết của nhap_kho, không phải của order_ho", () => {
  assert.ok(isTerminalFor("nhap_kho", "ve_kho_vn"));
  assert.deepEqual(allowedNextStatuses("nhap_kho", "ve_kho_vn"), []);
  // isTerminal (không theo loại đơn) chỉ nói về 3 mã cuối toàn cục
  assert.equal(isTerminal("ve_kho_vn"), false);
});

test("Huỷ: chỉ từ khach_chot, tức chỉ khi chưa mua hàng", () => {
  assert.ok(canTransition("order_ho", "khach_chot", "huy"));
  assert.equal(canTransition("order_ho", "da_mua_tq", "huy"), false);
  assert.equal(canTransition("order_ho", "da_giao_khach", "huy"), false);
});

test("nhap_kho không huỷ được vì không đi qua khach_chot", () => {
  assert.equal(canTransition("nhap_kho", "da_mua_tq", "huy"), false);
  assert.ok(canTransition("nhap_kho", "da_mua_tq", "su_co"));
});

test("Sự cố: từ khâu đang lưu thông và khâu đã giao", () => {
  assert.ok(canTransition("order_ho", "da_mua_tq", "su_co"));
  assert.ok(canTransition("order_ho", "da_giao_khach", "su_co"));
  assert.equal(canTransition("order_ho", "khach_chot", "su_co"), false);
});

test("Sự cố chưa phải cuối: quay lại trục hoặc rẽ nhánh", () => {
  assert.ok(!isTerminal("su_co"));
  assert.ok(canTransition("order_ho", "su_co", "da_mua_tq"));
  assert.ok(canTransition("order_ho", "su_co", "da_giao_khach"));
  assert.ok(canTransition("order_ho", "su_co", "huy"));
  assert.ok(canTransition("order_ho", "su_co", "khach_bom"));
});

test("Sự cố của nhap_kho chỉ quay lại được khâu có trên trục của nó", () => {
  const next = allowedNextStatuses("nhap_kho", "su_co");
  assert.ok(next.includes("da_mua_tq"));
  assert.equal(next.includes("da_giao_khach"), false);
});

test("Khách bom: chỉ từ khâu đã giao", () => {
  assert.ok(canTransition("order_ho", "da_giao_khach", "khach_bom"));
  assert.equal(canTransition("order_ho", "da_mua_tq", "khach_bom"), false);
  assert.equal(canTransition("order_ho", "khach_chot", "khach_bom"), false);
});

test("mã về hưu vẫn là OrderStatus hợp lệ nhưng không nằm trên trục nào", () => {
  for (const s of RETIRED_STATUSES) {
    assert.deepEqual(
      allowedNextStatuses("order_ho", s as OrderStatus),
      [],
      `${s} đã về hưu, không được có bước tiếp`,
    );
  }
});

test("transition trả lý do rõ ràng khi bị chặn", () => {
  const r = transition("order_ho", "khach_chot", "hoan_tat");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /Không được chuyển/);
});

test("đi hết trục order_ho từ đầu tới cuối", () => {
  let status: OrderStatus = MAIN_CHAIN[0];
  for (let i = 1; i < MAIN_CHAIN.length; i++) {
    const r = transition("order_ho", status, MAIN_CHAIN[i]);
    assert.equal(r.ok, true, `bước tới ${MAIN_CHAIN[i]} phải hợp lệ`);
    status = MAIN_CHAIN[i];
  }
  assert.ok(isTerminal(status));
});
