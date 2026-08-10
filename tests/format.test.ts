import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuoteText } from "../src/lib/format.ts";

test("báo giá khớp mẫu chốt đơn HeyP (chưa có ship)", () => {
  // Total 510.000 = tiền hàng + phí dịch vụ, cọc 100.000 → còn lại 410.000 + ship.
  // Dựng: 100 tệ × 3600 = 360.000 tiền hàng + 150.000 phí dịch vụ = 510.000.
  const q = buildQuoteText({
    customerName: "Chị Lan",
    items: [{ name: "Aire tabi", attributes: "màu vàng - size 36", quantity: 1, unitPriceCny: 100 }],
    exchangeRate: 3600,
    serviceFee: 150000,
    shippingFee: 0,
    deposit: 100000,
  });

  assert.match(q, /^Dạ vâng HeyP chốt đơn cho quý khách:/);
  assert.match(q, /Aire tabi \(như hình\) - màu vàng - size 36/);
  assert.match(q, /=> Total: 510\.000/);
  assert.match(q, /📌 Đã cọc: 100\.000/);
  assert.match(q, /📌 Còn lại: 410\.000 \+ ship/);
  assert.match(q, /Hàng về tiệm sẽ nhắn quý khách trước khi ship nhé\./);
  assert.match(q, /Hàng order không huỷ, không đổi trả/);
});

test("báo giá khi đã có ship: gộp vào còn lại, bỏ chữ + ship", () => {
  const q = buildQuoteText({
    customerName: "Anh Tú",
    items: [{ name: "Giày", attributes: null, quantity: 2, unitPriceCny: 50 }],
    exchangeRate: 3600,
    serviceFee: 0,
    shippingFee: 50000,
    deposit: 100000,
  });
  // Total = 2×50×3600 = 360.000; còn lại = 360.000 − 100.000 + 50.000 = 310.000
  assert.match(q, /=> Total: 360\.000/);
  assert.match(q, /📌 Còn lại: 310\.000/);
  assert.doesNotMatch(q, /\+ ship/);
  assert.match(q, /Giày \(như hình\) × 2/);
});
