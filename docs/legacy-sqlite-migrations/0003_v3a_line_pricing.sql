-- Migration 0003 (v3-A): bóc lớp giá theo từng món.
--   orders:      + quoted_total_vnd, + ship_status, service_fee → margin_vnd,
--                customer_id nới lỏng NOT NULL (đơn tạo từ ảnh có thể chưa có khách)
--   order_items: + margin_vnd (lời của món), + cost_confirmed (¥ do người xác nhận?)
--   settings:    bảng khoá-giá trị cho tham số nghiệp vụ đổi được lúc chạy
--
-- LƯU Ý: scripts/migrate.ts tắt PRAGMA foreign_keys trong lúc chạy và soát lại
-- bằng foreign_key_check sau khi xong. Không đổi thứ tự các lệnh dưới đây.

-- 1) Đổi tên cột: service_fee giờ mang nghĩa TỔNG lời của đơn.
ALTER TABLE orders RENAME COLUMN service_fee TO margin_vnd;

-- 2) Hai cột mới ở cấp đơn.
ALTER TABLE orders ADD COLUMN quoted_total_vnd INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN ship_status TEXT NOT NULL DEFAULT 'unknown';

-- 3) Backfill: Total đã chốt = tiền hàng + lời (KHÔNG gồm ship).
UPDATE orders
   SET quoted_total_vnd = CAST(ROUND(goods_total_cny * exchange_rate) AS INTEGER)
                          + margin_vnd;

UPDATE orders SET ship_status = 'set' WHERE shipping_fee > 0;

-- 4) Dựng lại orders để nới customer_id. Giữ nguyên tên cột & thứ tự cũ.
CREATE TABLE orders_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER REFERENCES customers(id),
  order_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'cho_bao_gia',
  exchange_rate REAL NOT NULL DEFAULT 0,
  goods_total_cny REAL NOT NULL DEFAULT 0,
  margin_vnd INTEGER NOT NULL DEFAULT 0,
  shipping_fee INTEGER NOT NULL DEFAULT 0,
  deposit INTEGER NOT NULL DEFAULT 0,
  amount_due INTEGER NOT NULL DEFAULT 0,
  sale_cost INTEGER,
  note TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  status_changed_at INTEGER NOT NULL DEFAULT (unixepoch()),
  quoted_total_vnd INTEGER NOT NULL DEFAULT 0,
  ship_status TEXT NOT NULL DEFAULT 'unknown'
);

INSERT INTO orders_new
  (id, customer_id, order_type, status, exchange_rate, goods_total_cny,
   margin_vnd, shipping_fee, deposit, amount_due, sale_cost, note,
   created_at, status_changed_at, quoted_total_vnd, ship_status)
SELECT
   id, customer_id, order_type, status, exchange_rate, goods_total_cny,
   margin_vnd, shipping_fee, deposit, amount_due, sale_cost, note,
   created_at, status_changed_at, quoted_total_vnd, ship_status
FROM orders;

DROP TABLE orders;
ALTER TABLE orders_new RENAME TO orders;

-- 4b) DROP TABLE xoá luôn index của bảng cũ → phải dựng lại.
--     (0000_init.sql tạo idx_orders_status và idx_orders_customer.)
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_customer ON orders(customer_id);

-- 5) Hai cột mới ở cấp dòng sản phẩm.
ALTER TABLE order_items ADD COLUMN margin_vnd INTEGER NOT NULL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN cost_confirmed INTEGER NOT NULL DEFAULT 0;

-- 6) Backfill dòng: dòng ĐẦU TIÊN của mỗi đơn nhận trọn phần lời cũ,
--    các dòng còn lại 0 → bất biến "Σ giá bán món = Total" vẫn đúng ngay
--    sau migration. Chủ shop rải lại theo món sau nếu muốn.
UPDATE order_items
   SET margin_vnd = (SELECT o.margin_vnd FROM orders o WHERE o.id = order_items.order_id)
 WHERE id IN (SELECT MIN(id) FROM order_items GROUP BY order_id);

-- 7) Dòng cũ: giá ¥ đã nhập tay từ trước, không phải máy đoán.
UPDATE order_items SET cost_confirmed = 1;

-- 8) Tham số nghiệp vụ đổi được lúc chạy (không phải .env — đổi không cần khởi động lại).
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO settings(key, value) VALUES ('sell_rate', '4000');
INSERT INTO settings(key, value) VALUES ('default_margin_vnd', '170000');
