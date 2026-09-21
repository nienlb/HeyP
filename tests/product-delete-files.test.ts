import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Khoá hai điều dễ vỡ của việc dọn file ảnh khi xoá mẫu (v9-C).
 * Khớp chuỗi trên mã nguồn — dự án không có DB test, và không thể dựng Storage
 * thật trong test đơn vị.
 */
const products = readFileSync("src/db/products.ts", "utf8");
const actions = readFileSync("src/app/(app)/products/actions.ts", "utf8");

function thanDeleteProduct(): string {
  const mo = products.indexOf("export async function deleteProduct");
  assert.ok(mo >= 0, "không thấy deleteProduct");
  const ketThuc = products.indexOf("\nexport ", mo + 10);
  return products.slice(mo, ketThuc === -1 ? undefined : ketThuc);
}

test("deleteProduct gom tên file ảnh TRƯỚC khi xoá mẫu", () => {
  // photos.product_id là ON DELETE CASCADE: xoá mẫu xong thì không còn dòng
  // ảnh nào để biết file nào cần dọn, file nằm lại trên Storage vĩnh viễn.
  const than = thanDeleteProduct();
  const chon = than.indexOf("FROM photos WHERE product_id");
  const xoa = than.indexOf("DELETE FROM products");
  assert.ok(chon >= 0, "deleteProduct không truy vấn ảnh của mẫu");
  assert.ok(xoa >= 0);
  assert.ok(chon < xoa, "phải lấy danh sách file trước khi DELETE");
  assert.match(than, /photoFiles/);
});

test("src/db/products.ts không import storage (kéo Supabase client vào mọi trang)", () => {
  assert.doesNotMatch(products, /from\s+["']@\/lib\/storage["']/);
});

test("deleteProductAction xoá file SAU khi mẫu đã xoá thành công", () => {
  const mo = actions.indexOf("export async function deleteProductAction");
  assert.ok(mo >= 0);
  const than = actions.slice(mo);
  const xoaMau = than.indexOf("await deleteProduct(");
  const chan = than.indexOf("if (!res.ok)");
  const xoaFile = than.indexOf("deletePhotoFile(");
  assert.ok(xoaMau >= 0 && chan >= 0 && xoaFile >= 0);
  // file không rollback được: chỉ xoá khi đã qua nhánh thất bại của mẫu
  assert.ok(xoaMau < chan && chan < xoaFile);
});

test("xoá file hỏng không làm hỏng việc xoá mẫu", () => {
  const mo = actions.indexOf("export async function deleteProductAction");
  const than = actions.slice(mo);
  const xoaFile = than.indexOf("deletePhotoFile(");
  const truoc = than.lastIndexOf("try", xoaFile);
  const sau = than.indexOf("catch", xoaFile);
  assert.ok(truoc >= 0 && sau > xoaFile, "deletePhotoFile phải nằm trong try/catch");
});
