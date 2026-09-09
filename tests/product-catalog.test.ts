import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseList,
  formatList,
  displayVariant,
  splitLegacyAttributes,
} from "../src/lib/product-catalog.ts";

test("parseList: cắt khoảng trắng, bỏ phần tử rỗng", () => {
  assert.deepEqual(parseList(" 35 , 36 ,, 37 "), ["35", "36", "37"]);
  assert.deepEqual(parseList(""), []);
  assert.deepEqual(parseList("   "), []);
});

test("parseList: gộp khoảng trắng thừa bên trong", () => {
  assert.deepEqual(parseList("xanh   lá, đen"), ["xanh lá", "đen"]);
});

test("parseList: bỏ trùng không phân biệt hoa thường, giữ bản gõ đầu", () => {
  assert.deepEqual(parseList("Đen, đen, ĐEN, trắng"), ["Đen", "trắng"]);
});

test("formatList nối lại bằng dấu phẩy", () => {
  assert.equal(formatList(["35", "36"]), "35,36");
  assert.equal(formatList([]), "");
});

test("BẤT BIẾN: parseList(formatList(parseList(s))) == parseList(s)", () => {
  for (const s of [
    "35,36,37",
    " đen , Trắng ,, vàng ",
    "Đen, đen",
    "",
    "xanh   lá",
  ]) {
    const once = parseList(s);
    assert.deepEqual(parseList(formatList(once)), once, `hỏng với: ${s}`);
  }
});

test("formatList KHÔNG khứ hồi được phần tử chứa dấu phẩy — đã biết và chấp nhận", () => {
  // Dấu phẩy là ký tự ngăn cách, không có escape. Ô nhập là chip nên người
  // dùng không gõ được dấu phẩy vào một chip; ghi lại đây để ai đọc sau khỏi
  // tưởng là bug.
  assert.deepEqual(parseList(formatList(["a,b"])), ["a", "b"]);
});

test("displayVariant: có size và màu", () => {
  assert.equal(
    displayVariant({ size: "42", color: "trắng", attributes: "cũ" }),
    "42 · trắng",
  );
});

test("displayVariant: chỉ có size", () => {
  assert.equal(displayVariant({ size: "42", color: "", attributes: "cũ" }), "42");
});

test("displayVariant: chỉ có màu", () => {
  assert.equal(displayVariant({ size: "", color: "đen", attributes: "cũ" }), "đen");
});

test("displayVariant: cả hai trống thì rơi về attributes cũ", () => {
  assert.equal(
    displayVariant({ size: "", color: "", attributes: "42 - trắng" }),
    "42 - trắng",
  );
  assert.equal(displayVariant({ attributes: "39 đen" }), "39 đen");
});

test("displayVariant: tất cả trống thì chuỗi rỗng", () => {
  assert.equal(displayVariant({}), "");
  assert.equal(displayVariant({ size: null, color: null, attributes: null }), "");
});

test("splitLegacyAttributes: dạng '42 - trắng'", () => {
  assert.deepEqual(splitLegacyAttributes("42 - trắng"), {
    size: "42",
    color: "trắng",
  });
});

test("splitLegacyAttributes: dạng có nhãn 'màu vàng - size 36'", () => {
  assert.deepEqual(splitLegacyAttributes("màu vàng - size 36"), {
    size: "36",
    color: "vàng",
  });
});

test("splitLegacyAttributes: dạng '39 đen' không có dấu ngăn", () => {
  assert.deepEqual(splitLegacyAttributes("39 đen"), {
    size: "39",
    color: "đen",
  });
});

test("splitLegacyAttributes: chỉ có màu", () => {
  assert.deepEqual(splitLegacyAttributes("Đen"), { size: "", color: "Đen" });
});

test("splitLegacyAttributes: size lẻ 37.5", () => {
  assert.deepEqual(splitLegacyAttributes("37.5 - hồng"), {
    size: "37.5",
    color: "hồng",
  });
});

test("splitLegacyAttributes: chuỗi rỗng", () => {
  assert.deepEqual(splitLegacyAttributes(""), { size: "", color: "" });
  assert.deepEqual(splitLegacyAttributes("   "), { size: "", color: "" });
});
