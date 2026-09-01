import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isConnectionError,
  isRetryableRead,
  runWithRetry,
} from "../src/lib/db-retry.ts";

/** Hàm giả: hỏng `failTimes` lần đầu bằng `code`, sau đó trả "ok". */
function flaky(failTimes: number, code: string) {
  let calls = 0;
  const run = async () => {
    calls++;
    if (calls <= failTimes) throw Object.assign(new Error(code), { code });
    return "ok";
  };
  return { run, calls: () => calls };
}

test("nhận ra lỗi đứt connection", () => {
  // Đúng lỗi quan sát được trong log sau khi transaction_timeout giết phiên.
  assert.equal(isConnectionError({ code: "CONNECTION_CLOSED" }), true);
  assert.equal(isConnectionError({ code: "CONNECTION_ENDED" }), true);
  assert.equal(isConnectionError({ code: "ECONNRESET" }), true);
});

test("KHÔNG coi lỗi SQL thường là lỗi connection", () => {
  // 23505 = trùng khoá, 42601 = sai cú pháp, 57014 = statement timeout.
  // Chạy lại mấy thứ này chỉ tốn thêm một vòng rồi hỏng y như cũ.
  assert.equal(isConnectionError({ code: "23505" }), false);
  assert.equal(isConnectionError({ code: "42601" }), false);
  assert.equal(isConnectionError({ code: "57014" }), false);
  assert.equal(isConnectionError(new Error("bất kỳ")), false);
  assert.equal(isConnectionError(null), false);
  assert.equal(isConnectionError("CONNECTION_CLOSED"), false);
});

test("KHÔNG retry lúc không mở nổi connection", () => {
  // Chạy lại chỉ nhân đôi thời gian chờ một thứ gần như chắc chắn hỏng tiếp.
  assert.equal(isConnectionError({ code: "CONNECTION_CONNECT_TIMEOUT" }), false);
});

test("câu chỉ đọc thì chạy lại được", () => {
  assert.equal(isRetryableRead("SELECT 1 AS ok"), true);
  assert.equal(isRetryableRead("select id, username from users where id = ?"), true);
  assert.equal(
    isRetryableRead("WITH t AS (SELECT id FROM orders) SELECT * FROM t"),
    true,
  );
  assert.equal(isRetryableRead("\n\n  SELECT * FROM orders\n"), true);
  assert.equal(isRetryableRead("-- chú thích\nSELECT 1"), true);
  assert.equal(isRetryableRead("/* chú thích */ SELECT 1"), true);
});

test("BẤT BIẾN SỐNG CÒN: câu GHI không bao giờ được chạy lại", () => {
  // Chạy lại một câu ghi là ghi hai lần. Đây là chỗ mất tiền thật, không phải
  // chuyện hiệu năng.
  assert.equal(isRetryableRead("INSERT INTO photos(file_path) VALUES(?)"), false);
  assert.equal(isRetryableRead("UPDATE orders SET deposit = ? WHERE id = ?"), false);
  assert.equal(isRetryableRead("DELETE FROM orders WHERE id = ?"), false);
  assert.equal(isRetryableRead("TRUNCATE orders"), false);
});

test("BẤT BIẾN: raw.get chạy INSERT ... RETURNING vẫn bị chặn", () => {
  // Câu thật trong src/db/queries.ts. Nó đi qua raw.get — nghe như đọc, nhưng
  // chạy lại là tạo hai dòng ảnh cho một lần tải lên. Đây là lý do việc quyết
  // định phải xét CÂU SQL chứ không xét tên hàm gọi nó.
  const sql = `INSERT INTO photos(file_path, label, order_id, inventory_id)
       VALUES(?, ?, ?, ?) RETURNING id`;
  assert.equal(isRetryableRead(sql), false);
});

test("BẤT BIẾN: CTE có lệnh ghi vẫn bị chặn dù mở đầu bằng WITH", () => {
  // Postgres cho phép WITH ... AS (INSERT ...) — câu này GHI thật sự dù nhìn
  // như bắt đầu bằng một câu đọc.
  const sql =
    "WITH moved AS (DELETE FROM inbox RETURNING *) INSERT INTO archive SELECT * FROM moved";
  assert.equal(isRetryableRead(sql), false);
});

test("SELECT ... FOR UPDATE bị từ chối — thà chặt còn hơn lỏng", () => {
  // Không mất gì: câu này chỉ dùng trong transaction, mà transaction thì
  // không bao giờ retry.
  assert.equal(
    isRetryableRead("SELECT id FROM orders WHERE id = ? FOR UPDATE"),
    false,
  );
});

test("SELECT đứt dây → chạy lại và thành công", () => {
  const f = flaky(1, "CONNECTION_CLOSED");
  return runWithRetry(f.run, "SELECT 1", true).then((r) => {
    assert.equal(r, "ok");
    assert.equal(f.calls(), 2, "phải gọi đúng 2 lần");
  });
});

test("BẤT BIẾN: INSERT đứt dây thì KHÔNG chạy lại", async () => {
  // Nếu test này đỏ, mỗi lần connection đứt là một dòng dữ liệu bị ghi hai lần.
  const f = flaky(1, "CONNECTION_CLOSED");
  await assert.rejects(() =>
    runWithRetry(f.run, "INSERT INTO photos(file_path) VALUES(?)", true),
  );
  assert.equal(f.calls(), 1, "câu ghi chỉ được chạy đúng 1 lần");
});

test("BẤT BIẾN: trong transaction thì KHÔNG chạy lại, kể cả câu đọc", async () => {
  // Chạy lại giữa transaction là chạy trên connection khác, ngoài transaction
  // đang mở — câu đó sẽ không rollback theo.
  const f = flaky(1, "CONNECTION_CLOSED");
  await assert.rejects(() => runWithRetry(f.run, "SELECT 1", false));
  assert.equal(f.calls(), 1);
});

test("lỗi SQL thường thì không chạy lại", async () => {
  const f = flaky(1, "23505");
  await assert.rejects(() => runWithRetry(f.run, "SELECT 1", true));
  assert.equal(f.calls(), 1);
});

test("đứt dây hai lần liên tiếp → chịu thua, KHÔNG lặp vô hạn", async () => {
  const f = flaky(99, "CONNECTION_CLOSED");
  await assert.rejects(() => runWithRetry(f.run, "SELECT 1", true));
  assert.equal(f.calls(), 2, "đúng một lần thử lại, không hơn");
});

test("chạy trơn thì gọi đúng một lần", async () => {
  const f = flaky(0, "CONNECTION_CLOSED");
  assert.equal(await runWithRetry(f.run, "SELECT 1", true), "ok");
  assert.equal(f.calls(), 1);
});
