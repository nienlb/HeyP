import { test } from "node:test";
import assert from "node:assert/strict";
import { screenMetaFor, KNOWN_PATHS } from "../src/lib/screen-meta.ts";
import { navItemsFor } from "../src/app/_components/nav-config.ts";

test("màn gốc", () => {
  assert.deepEqual(screenMetaFor("/"), { title: "Tổng quan" });
});

test("màn có nút quay lại", () => {
  assert.deepEqual(screenMetaFor("/orders/new"), {
    title: "Đơn mới",
    backHref: "/orders",
  });
});

test("chi tiết đơn suy tiêu đề từ id", () => {
  assert.deepEqual(screenMetaFor("/orders/13"), {
    title: "#13",
    backHref: "/orders",
  });
});

test("id nhiều chữ số vẫn đúng", () => {
  assert.equal(screenMetaFor("/orders/1042").title, "#1042");
});

test("/orders/new KHÔNG bị luật id nuốt mất", () => {
  // "new" không phải số — nếu regex viết lỏng thì màn tạo đơn sẽ ra "#new".
  assert.equal(screenMetaFor("/orders/new").title, "Đơn mới");
});

test("bỏ query string", () => {
  assert.equal(screenMetaFor("/orders?f=chu_y&sort=con_thu").title, "Đơn hàng");
  assert.equal(screenMetaFor("/orders/13?tab=tien").title, "#13");
});

test("bỏ dấu / thừa ở cuối", () => {
  assert.equal(screenMetaFor("/customers/").title, "Khách hàng");
});

test("đường dẫn lạ trả tên app, không ném lỗi", () => {
  assert.deepEqual(screenMetaFor("/khong-co-mau-nay"), { title: "HeyP" });
  assert.deepEqual(screenMetaFor("/orders/abc/def"), { title: "HeyP" });
});

test("KHOÁ PHỦ SÓNG: mọi mục trong nav-config đều có tiêu đề", () => {
  // Từ v8-B, `title` không còn là prop bắt buộc mà tsc bắt được. Test này là
  // lưới thay thế: thêm màn vào nav mà quên khai báo tiêu đề thì đỏ ở đây.
  const nav = navItemsFor("admin");
  for (const item of [...nav.main, ...nav.more]) {
    assert.notEqual(
      screenMetaFor(item.href).title,
      "HeyP",
      `Thiếu tiêu đề cho ${item.href} trong src/lib/screen-meta.ts`,
    );
  }
});

test("KNOWN_PATHS không có mục trùng", () => {
  assert.equal(new Set(KNOWN_PATHS).size, KNOWN_PATHS.length);
});
