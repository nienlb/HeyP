-- Migration 0004 (v3-B): ví ¥, chi phí, sổ thu tiền.
--   cny_ledger: MỌI biến động ¥. Số dư & giá vốn bình quân KHÔNG lưu —
--               tính lại bằng cách chạy lại sổ (src/lib/cny-wallet.ts).
--   expenses:   chi phí VND. order_id NULL = chi phí theo kỳ.
--   payments:   sổ thu tiền. orders.deposit trở thành số DẪN XUẤT = Σ payments.

CREATE TABLE cny_ledger (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kind          TEXT NOT NULL,              -- 'nap' | 'chi' | 'dieu_chinh'
  cny_delta     REAL NOT NULL,              -- +120 khi nạp, −60 khi mua hàng
  vnd_paid      INTEGER,                    -- chỉ 'nap': thực trả bao nhiêu VND
  rate_snapshot INTEGER,                    -- chỉ 'chi'/'dieu_chinh': giá vốn đã chốt
  order_id      INTEGER REFERENCES orders(id),
  note          TEXT,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_cny_ledger_order ON cny_ledger(order_id);

CREATE TABLE expenses (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  spent_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  category   TEXT NOT NULL,
  amount_vnd INTEGER NOT NULL,
  order_id   INTEGER REFERENCES orders(id),
  method     TEXT NOT NULL DEFAULT 'chuyen_khoan',
  note       TEXT
);
CREATE INDEX idx_expenses_spent_at ON expenses(spent_at);
CREATE INDEX idx_expenses_order ON expenses(order_id);

CREATE TABLE payments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount_vnd INTEGER NOT NULL,              -- khoản 'hoan_tra' mang dấu ÂM
  paid_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  kind       TEXT NOT NULL,                 -- 'coc' | 'thu_not' | 'hoan_tra'
  method     TEXT NOT NULL DEFAULT 'chuyen_khoan',
  note       TEXT
);
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_paid_at ON payments(paid_at);

-- Backfill: cọc đang lưu ở orders.deposit thành một dòng thu tiền,
-- ngày lấy theo ngày tạo đơn. Sau bước này deposit là số DẪN XUẤT.
INSERT INTO payments (order_id, amount_vnd, paid_at, kind, method, note)
SELECT id, deposit, created_at, 'coc', 'chuyen_khoan', 'Chuyển từ dữ liệu cũ'
  FROM orders WHERE deposit > 0;
