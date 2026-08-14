-- Migration 0000: khởi tạo 6 bảng chính + bảng nối kiện↔đơn + lịch sử trạng thái.
-- Khớp với src/db/schema.ts. Áp dụng bằng: npm run db:migrate

CREATE TABLE customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  note TEXT,
  warning_flag INTEGER NOT NULL DEFAULT 0,
  warning_reason TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  order_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'cho_bao_gia',
  exchange_rate REAL NOT NULL DEFAULT 0,
  goods_total_cny REAL NOT NULL DEFAULT 0,
  service_fee INTEGER NOT NULL DEFAULT 0,
  shipping_fee INTEGER NOT NULL DEFAULT 0,
  deposit INTEGER NOT NULL DEFAULT 0,
  amount_due INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  status_changed_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_url TEXT,
  name TEXT NOT NULL,
  attributes TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price_cny REAL NOT NULL DEFAULT 0,
  cn_order_code TEXT,
  line_status TEXT NOT NULL DEFAULT 'normal',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tracking_code TEXT NOT NULL,
  weight_kg REAL,
  tracking_status TEXT,
  last_checked_at INTEGER,
  mode TEXT NOT NULL DEFAULT 'manual',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE order_packages (
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  PRIMARY KEY (order_id, package_id)
);

CREATE TABLE inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  avg_cost INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL,
  last_imported_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  label TEXT NOT NULL,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id INTEGER REFERENCES order_items(id) ON DELETE CASCADE,
  inventory_id INTEGER REFERENCES inventory(id) ON DELETE CASCADE,
  uploaded_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE order_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by TEXT,
  changed_at INTEGER NOT NULL DEFAULT (unixepoch()),
  note TEXT
);

CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_photos_order ON photos(order_id);
CREATE INDEX idx_status_history_order ON order_status_history(order_id);
