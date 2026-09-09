CREATE TABLE IF NOT EXISTS "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sizes" text DEFAULT '' NOT NULL,
	"colors" text DEFAULT '' NOT NULL,
	"default_sell_vnd" integer DEFAULT 0 NOT NULL,
	"default_unit_price_cny" double precision DEFAULT 0 NOT NULL,
	"product_url" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" bigint DEFAULT (EXTRACT(EPOCH FROM now())::bigint) NOT NULL,
	"updated_at" bigint DEFAULT (EXTRACT(EPOCH FROM now())::bigint) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "product_id" integer;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "size" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "color" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN IF NOT EXISTS "product_id" integer;--> statement-breakpoint

-- SET NULL, KHÔNG CASCADE: xoá một mẫu khỏi danh mục không được phép phá đơn cũ.
ALTER TABLE "order_items"
	ADD CONSTRAINT "order_items_product_id_products_id_fk"
	FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL;--> statement-breakpoint

-- CASCADE ở đây thì ĐÚNG: ảnh của danh mục chết theo danh mục. Ảnh đã gắn đơn
-- là DÒNG photos KHÁC (đã chép sang) nên không bị ảnh hưởng.
ALTER TABLE "photos"
	ADD CONSTRAINT "photos_product_id_products_id_fk"
	FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "order_items_product_idx" ON "order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "photos_product_idx" ON "photos" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_active_idx" ON "products" USING btree ("active");
