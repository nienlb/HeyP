ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "product_id" integer;--> statement-breakpoint
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "size" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "color" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "stock_key" text DEFAULT '' NOT NULL;--> statement-breakpoint

ALTER TABLE "inventory"
	ADD CONSTRAINT "inventory_product_id_products_id_fk"
	FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL;--> statement-breakpoint

-- Backfill: giữ ĐÚNG cách gom hiện tại. Nhánh `n:` của stockKey() trong
-- src/lib/inventory.ts phải sinh ra y hệt chuỗi này, nếu không dòng tồn cũ sẽ
-- không được tìm thấy và _addStock đẻ ra dòng trùng.
UPDATE "inventory"
   SET "stock_key" = 'n:' || lower(regexp_replace(trim("product_name"), '\s+', ' ', 'g'))
 WHERE "stock_key" = '';--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "inventory_stock_key_idx" ON "inventory" USING btree ("stock_key","source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_product_idx" ON "inventory" USING btree ("product_id");
