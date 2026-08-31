import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MIN_PASSWORD_LENGTH,
  hashPassword,
  validatePassword,
  verifyPassword,
} from "../src/lib/password.ts";

test("hash rồi verify lại đúng mật khẩu", () => {
  const stored = hashPassword("matkhau123");
  assert.equal(verifyPassword("matkhau123", stored), true);
});

test("sai mật khẩu thì verify trả false", () => {
  const stored = hashPassword("matkhau123");
  assert.equal(verifyPassword("matkhau124", stored), false);
});

test("hai lần hash cùng mật khẩu ra hai chuỗi khác nhau (salt ngẫu nhiên)", () => {
  assert.notEqual(hashPassword("matkhau123"), hashPassword("matkhau123"));
});

test("chuỗi lưu tự mô tả tham số scrypt", () => {
  const parts = hashPassword("matkhau123").split("$");
  assert.equal(parts.length, 6);
  assert.equal(parts[0], "scrypt");
  assert.equal(parts[1], "16384");
});

test("chuỗi lưu hỏng thì verify trả false, không throw", () => {
  assert.equal(verifyPassword("matkhau123", ""), false);
  assert.equal(verifyPassword("matkhau123", "khong-phai-hash"), false);
  assert.equal(verifyPassword("matkhau123", "scrypt$a$b$c$d$e"), false);
});

test("mật khẩu ngắn hơn ngưỡng bị chặn", () => {
  assert.equal(MIN_PASSWORD_LENGTH, 6);
  assert.equal(typeof validatePassword("12345"), "string");
  assert.equal(validatePassword("123456"), null);
});
