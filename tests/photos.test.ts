import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PHOTO_LABELS,
  PHOTO_LABEL_LABELS,
  contentTypeFromName,
  extFromContentType,
} from "../src/lib/photos.ts";

test("mọi nhãn ảnh đều có nhãn tiếng Việt", () => {
  for (const l of PHOTO_LABELS) {
    assert.ok(PHOTO_LABEL_LABELS[l] && PHOTO_LABEL_LABELS[l].length > 0);
  }
});

test("suy content-type từ tên file", () => {
  assert.equal(contentTypeFromName("a.png"), "image/png");
  assert.equal(contentTypeFromName("IMG_1234.JPG"), "image/jpeg");
  assert.equal(contentTypeFromName("x.webp"), "image/webp");
  assert.equal(contentTypeFromName("noext"), "application/octet-stream");
});

test("suy đuôi file từ content-type", () => {
  assert.equal(extFromContentType("image/png"), "png");
  assert.equal(extFromContentType("image/webp"), "webp");
  assert.equal(extFromContentType("application/pdf"), null);
});
