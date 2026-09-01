import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  signSessionToken,
  verifySessionToken,
} from "../src/lib/session-token.ts";

const SECRET = "khoa-bi-mat-de-test-123";

/**
 * Bản cài đặt CŨ (node:crypto) — chép nguyên văn từ src/lib/auth.ts trước khi
 * chuyển sang Web Crypto. Giữ ở đây để khoá một điều duy nhất nhưng sống còn:
 * cookie đang nằm trên máy người dùng (30 ngày) phải tiếp tục dùng được sau
 * khi deploy. Đổi định dạng mà không hay là đá cả hai người dùng ra ngoài.
 */
function oldMakeToken(userId: number, secret: string): string {
  const payload = `${Buffer.from(String(userId)).toString("base64url")}.${Date.now()}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

test("token do bản node:crypto cũ ký vẫn kiểm được bằng Web Crypto", async () => {
  const parsed = await verifySessionToken(oldMakeToken(7, SECRET), SECRET);
  assert.deepEqual(parsed, { userId: 7 });
});

test("token mới ký lại đúng định dạng cũ, byte-for-byte", async () => {
  const token = await signSessionToken(42, SECRET);
  const [idB64, ts, sig] = token.split(".");
  const expected = createHmac("sha256", SECRET)
    .update(`${idB64}.${ts}`)
    .digest("hex");
  assert.equal(sig, expected);
  assert.deepEqual(await verifySessionToken(token, SECRET), { userId: 42 });
});

test("sai khoá thì không kiểm qua", async () => {
  const token = await signSessionToken(1, SECRET);
  assert.equal(await verifySessionToken(token, "khoa-khac"), null);
});

test("sửa userId mà giữ chữ ký cũ thì trượt", async () => {
  const token = await signSessionToken(1, SECRET);
  const [, ts, sig] = token.split(".");
  const gia = `${Buffer.from("999").toString("base64url")}.${ts}.${sig}`;
  assert.equal(await verifySessionToken(gia, SECRET), null);
});

test("cookie định dạng cũ hơn (mang username) bị coi là không hợp lệ", async () => {
  // v5 trở về trước ký username thay userId. Chữ ký vẫn đúng, nhưng payload
  // không ra số → phải trả null để người dùng đăng nhập lại một lần.
  const payload = `${Buffer.from("niên").toString("base64url")}.${Date.now()}`;
  const sig = createHmac("sha256", SECRET).update(payload).digest("hex");
  assert.equal(await verifySessionToken(`${payload}.${sig}`, SECRET), null);
});

test("token rác không làm ném lỗi", async () => {
  for (const bad of [
    undefined,
    "",
    "a.b",
    "a.b.c.d",
    "a.b.khong-phai-hex",
    "a.b.abc", // hex lẻ ký tự
  ]) {
    assert.equal(await verifySessionToken(bad, SECRET), null);
  }
});
