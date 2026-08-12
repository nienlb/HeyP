import { test } from "node:test";
import assert from "node:assert/strict";
import {
  orderGaps,
  type GapOrder,
  type GapItem,
  type GapPhoto,
} from "../src/lib/order-gaps.ts";

/** Đơn đầy đủ thông tin — không thiếu gì. */
const full: GapOrder = {
  orderType: "order_ho",
  status: "khach_chot",
  customerId: 1,
  customerPhone: "0901234567",
  customerAddress: "12 Lê Lợi, Q1",
  shipStatus: "set",
};
const okItems: GapItem[] = [{ costConfirmed: true }];
const okPhotos: GapPhoto[] = [{ label: "product" }];

test("đơn đầy đủ → không cờ nào", () => {
  assert.deepEqual(orderGaps(full, okItems, okPhotos), []);
});

test("chưa gắn khách → thiếu khách", () => {
  const gaps = orderGaps({ ...full, customerId: null }, okItems, okPhotos);
  assert.deepEqual(gaps, ["thieu_khach"]);
});

test("có khách nhưng thiếu SĐT → vẫn thiếu khách", () => {
  const gaps = orderGaps({ ...full, customerPhone: null }, okItems, okPhotos);
  assert.deepEqual(gaps, ["thieu_khach"]);
});

test("có khách nhưng thiếu địa chỉ → vẫn thiếu khách", () => {
  const gaps = orderGaps({ ...full, customerAddress: "  " }, okItems, okPhotos);
  assert.deepEqual(gaps, ["thieu_khach"]);
});

test("còn dòng chưa xác nhận ¥ → thiếu giá vốn", () => {
  const gaps = orderGaps(
    full,
    [{ costConfirmed: true }, { costConfirmed: false }],
    okPhotos,
  );
  assert.deepEqual(gaps, ["thieu_gia_von"]);
});

test("đơn bán từ kho: giá vốn nằm ở sale_cost, KHÔNG bật cờ thiếu giá vốn", () => {
  const gaps = orderGaps(
    { ...full, orderType: "ban_tu_kho" },
    [{ costConfirmed: false }],
    okPhotos,
  );
  assert.deepEqual(gaps, []);
});

test("chưa có ảnh nhãn product → thiếu ảnh SP", () => {
  const gaps = orderGaps(full, okItems, [{ label: "zalo_confirm" }]);
  assert.deepEqual(gaps, ["thieu_anh_sp"]);
});

test("ship chưa biết nhưng hàng chưa về VN → CHƯA nhắc", () => {
  const gaps = orderGaps(
    { ...full, shipStatus: "unknown", status: "dang_van_chuyen_vn" },
    okItems,
    okPhotos,
  );
  assert.deepEqual(gaps, []);
});

test("ship chưa biết và hàng đã về kho VN → nhắc", () => {
  const gaps = orderGaps(
    { ...full, shipStatus: "unknown", status: "ve_kho_vn" },
    okItems,
    okPhotos,
  );
  assert.deepEqual(gaps, ["thieu_ship"]);
});

test("freeship không phải là thiếu", () => {
  const gaps = orderGaps(
    { ...full, shipStatus: "free", status: "ve_kho_vn" },
    okItems,
    okPhotos,
  );
  assert.deepEqual(gaps, []);
});

test("đơn đã huỷ → không nhắc gì, khỏi làm phiền", () => {
  const gaps = orderGaps(
    {
      ...full,
      status: "huy",
      customerId: null,
      customerPhone: null,
      customerAddress: null,
      shipStatus: "unknown",
    },
    [{ costConfirmed: false }],
    [],
  );
  assert.deepEqual(gaps, []);
});

test("đơn sự cố (nhánh, không nằm trên trục chính) → không nhắc ship", () => {
  const gaps = orderGaps(
    { ...full, status: "su_co", shipStatus: "unknown" },
    okItems,
    okPhotos,
  );
  assert.deepEqual(gaps, []);
});

test("nhiều thiếu cùng lúc → trả theo đúng thứ tự khai báo", () => {
  const gaps = orderGaps(
    {
      ...full,
      status: "ve_kho_vn",
      customerId: null,
      shipStatus: "unknown",
    },
    [{ costConfirmed: false }],
    [],
  );
  assert.deepEqual(gaps, [
    "thieu_khach",
    "thieu_gia_von",
    "thieu_anh_sp",
    "thieu_ship",
  ]);
});

test("đơn chưa có dòng nào → không bật cờ thiếu giá vốn", () => {
  const gaps = orderGaps(full, [], okPhotos);
  assert.deepEqual(gaps, []);
});
