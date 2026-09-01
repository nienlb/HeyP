import { test } from "node:test";
import assert from "node:assert/strict";
import { contentTypeFromName, photoUrl, thumbFileName } from "../src/lib/photos.ts";

test("tên bản nhỏ chèn hậu tố trước đuôi file", () => {
  assert.equal(thumbFileName("abc.webp"), "abc_t.webp");
  assert.equal(thumbFileName("1788240000-a1b2c3.jpg"), "1788240000-a1b2c3_t.jpg");
});

test("giữ nguyên đuôi để content-type vẫn suy ra đúng", () => {
  const t = thumbFileName("anh.webp");
  assert.equal(contentTypeFromName(t), "image/webp");
});

test("file không có đuôi thì nối vào cuối", () => {
  assert.equal(thumbFileName("khongduoi"), "khongduoi_t");
});

test("dấu chấm ở đầu không bị coi là đuôi file", () => {
  assert.equal(thumbFileName(".gitkeep"), ".gitkeep_t");
});

test("nhiều dấu chấm thì chỉ tách ở dấu cuối cùng", () => {
  assert.equal(thumbFileName("anh.chup.man.hinh.webp"), "anh.chup.man.hinh_t.webp");
});

test("photoUrl sinh đúng đường dẫn cho từng bản", () => {
  assert.equal(photoUrl(12), "/api/photo/12");
  assert.equal(photoUrl(12, "full"), "/api/photo/12");
  assert.equal(photoUrl(12, "thumb"), "/api/photo/12?size=thumb");
  assert.equal(photoUrl(12, "download"), "/api/photo/12?download");
});
