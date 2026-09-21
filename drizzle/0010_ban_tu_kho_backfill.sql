-- v9-C. Đơn bán kho tạo trước v9-C có quoted_total_vnd = 0 và
-- cost_confirmed = false, nên báo cáo lãi ghi doanh thu 0 và xếp chúng vào
-- khối "ước tính". Với ban_tu_kho, goods_total_cny chính là tổng giá bán VND
-- (exchange_rate = 1), nên dùng lại được.
UPDATE "orders"
   SET "quoted_total_vnd" = ROUND("goods_total_cny")::int
 WHERE "order_type" = 'ban_tu_kho' AND "quoted_total_vnd" = 0;--> statement-breakpoint

UPDATE "order_items"
   SET "cost_confirmed" = true
 WHERE "cost_confirmed" = false
   AND "order_id" IN (SELECT "id" FROM "orders" WHERE "order_type" = 'ban_tu_kho');
