-- Migration 0001: thêm cột snapshot giá vốn cho đơn "Bán từ kho"
-- để tính lãi/lỗ ngay cả khi giá vốn bình quân của kho thay đổi về sau.

ALTER TABLE orders ADD COLUMN sale_cost INTEGER;

CREATE INDEX idx_inventory_name_source ON inventory(product_name, source);
