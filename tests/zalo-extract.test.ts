import { test } from "node:test";
import assert from "node:assert/strict";
import { itemAttributes, normalizeBatch } from "../src/lib/zalo-extract.ts";

test("ghép thuộc tính màu + size", () => {
  assert.equal(
    itemAttributes({ name: "Slingback", color: "be", size: "36", quantity: 1 }),
    "màu be - size 36",
  );
});

test("thiếu màu hoặc size thì bỏ phần đó", () => {
  assert.equal(
    itemAttributes({ name: "X", color: null, size: "39", quantity: 1 }),
    "size 39",
  );
  assert.equal(
    itemAttributes({ name: "X", color: "đen", size: null, quantity: 1 }),
    "màu đen",
  );
  assert.equal(
    itemAttributes({ name: "X", color: null, size: null, quantity: 1 }),
    "",
  );
});

/* ---------- Đọc nhiều ảnh trong một lần (v3-A) ---------- */

test("phân loại ảnh: giữ đúng thứ tự và loại", () => {
  const r = normalizeBatch(
    {
      images: [
        { index: 0, kind: "chot_don" },
        { index: 1, kind: "san_pham" },
      ],
      order: { items: [], shipFree: false, shipUnknown: true },
    },
    2,
  );
  assert.equal(r.images.length, 2);
  assert.equal(r.images[0].kind, "chot_don");
  assert.equal(r.images[1].kind, "san_pham");
});

test("thiếu ảnh trong phản hồi → bù bằng 'san_pham' (chỉ lưu, không đọc)", () => {
  const r = normalizeBatch(
    { images: [{ index: 0, kind: "chot_don" }], order: { items: [] } },
    3,
  );
  assert.equal(r.images.length, 3);
  assert.equal(r.images[1].kind, "san_pham");
  assert.equal(r.images[2].kind, "san_pham");
});

test("loại ảnh lạ → coi là ảnh sản phẩm, không bịa dữ liệu", () => {
  const r = normalizeBatch(
    { images: [{ index: 0, kind: "hoa_don" }], order: { items: [] } },
    1,
  );
  assert.equal(r.images[0].kind, "san_pham");
});

test("phản hồi rác → trả cấu trúc rỗng an toàn, không ném lỗi", () => {
  const r = normalizeBatch(null, 2);
  assert.equal(r.images.length, 2);
  assert.deepEqual(r.order.items, []);
  assert.equal(r.order.totalVnd, null);
});

test("index ngoài khoảng bị bỏ qua", () => {
  const r = normalizeBatch(
    { images: [{ index: 9, kind: "chot_don" }], order: { items: [] } },
    1,
  );
  assert.equal(r.images[0].kind, "san_pham");
});

test("dữ liệu đơn được chuẩn hoá: số lượng thiếu thành 1, chuỗi rỗng thành null", () => {
  const r = normalizeBatch(
    {
      images: [{ index: 0, kind: "chot_don" }],
      order: {
        items: [{ name: " Aire tabi ", color: "", size: "36" }],
        totalVnd: 410000,
        customerName: "null",
      },
    },
    1,
  );
  assert.equal(r.order.items[0].name, "Aire tabi");
  assert.equal(r.order.items[0].quantity, 1);
  assert.equal(r.order.items[0].color, null);
  assert.equal(r.order.items[0].size, "36");
  assert.equal(r.order.totalVnd, 410000);
  assert.equal(r.order.customerName, null, "chuỗi 'null' không phải tên khách");
});
