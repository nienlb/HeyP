CREATE TABLE "cny_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"cny_delta" double precision NOT NULL,
	"vnd_paid" integer,
	"rate_snapshot" integer,
	"order_id" integer,
	"note" text,
	"created_at" bigint DEFAULT (EXTRACT(EPOCH FROM now())::bigint) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"address" text,
	"note" text,
	"warning_flag" boolean DEFAULT false NOT NULL,
	"warning_reason" text,
	"created_at" bigint DEFAULT (EXTRACT(EPOCH FROM now())::bigint) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"spent_at" bigint DEFAULT (EXTRACT(EPOCH FROM now())::bigint) NOT NULL,
	"category" text NOT NULL,
	"amount_vnd" integer NOT NULL,
	"order_id" integer,
	"method" text DEFAULT 'chuyen_khoan' NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_name" text NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"avg_cost" integer DEFAULT 0 NOT NULL,
	"source" text NOT NULL,
	"last_imported_at" bigint,
	"created_at" bigint DEFAULT (EXTRACT(EPOCH FROM now())::bigint) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"product_url" text,
	"name" text NOT NULL,
	"attributes" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_cny" double precision DEFAULT 0 NOT NULL,
	"cn_order_code" text,
	"line_status" text DEFAULT 'normal' NOT NULL,
	"margin_vnd" integer DEFAULT 0 NOT NULL,
	"cost_confirmed" boolean DEFAULT false NOT NULL,
	"created_at" bigint DEFAULT (EXTRACT(EPOCH FROM now())::bigint) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_packages" (
	"order_id" integer NOT NULL,
	"package_id" integer NOT NULL,
	CONSTRAINT "order_packages_order_id_package_id_pk" PRIMARY KEY("order_id","package_id")
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"changed_by" text,
	"changed_at" bigint DEFAULT (EXTRACT(EPOCH FROM now())::bigint) NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer,
	"order_type" text NOT NULL,
	"status" text DEFAULT 'cho_bao_gia' NOT NULL,
	"exchange_rate" double precision DEFAULT 0 NOT NULL,
	"goods_total_cny" double precision DEFAULT 0 NOT NULL,
	"margin_vnd" integer DEFAULT 0 NOT NULL,
	"shipping_fee" integer DEFAULT 0 NOT NULL,
	"deposit" integer DEFAULT 0 NOT NULL,
	"amount_due" integer DEFAULT 0 NOT NULL,
	"sale_cost" integer,
	"note" text,
	"created_at" bigint DEFAULT (EXTRACT(EPOCH FROM now())::bigint) NOT NULL,
	"status_changed_at" bigint DEFAULT (EXTRACT(EPOCH FROM now())::bigint) NOT NULL,
	"quoted_total_vnd" integer DEFAULT 0 NOT NULL,
	"ship_status" text DEFAULT 'unknown' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" serial PRIMARY KEY NOT NULL,
	"tracking_code" text NOT NULL,
	"carrier" text,
	"weight_kg" double precision,
	"tracking_status" text,
	"last_checked_at" bigint,
	"mode" text DEFAULT 'manual' NOT NULL,
	"needs_manual_check" boolean DEFAULT false NOT NULL,
	"created_at" bigint DEFAULT (EXTRACT(EPOCH FROM now())::bigint) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"amount_vnd" integer NOT NULL,
	"paid_at" bigint DEFAULT (EXTRACT(EPOCH FROM now())::bigint) NOT NULL,
	"kind" text NOT NULL,
	"method" text DEFAULT 'chuyen_khoan' NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"file_path" text NOT NULL,
	"label" text NOT NULL,
	"order_id" integer,
	"order_item_id" integer,
	"inventory_id" integer,
	"uploaded_at" bigint DEFAULT (EXTRACT(EPOCH FROM now())::bigint) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cny_ledger" ADD CONSTRAINT "cny_ledger_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_packages" ADD CONSTRAINT "order_packages_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_packages" ADD CONSTRAINT "order_packages_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_inventory_id_inventory_id_fk" FOREIGN KEY ("inventory_id") REFERENCES "public"."inventory"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inventory_name_source" ON "inventory" ("product_name","source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_status" ON "orders" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_customer" ON "orders" ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_order_items_order" ON "order_items" ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_photos_order" ON "photos" ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_status_history_order" ON "order_status_history" ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cny_ledger_order" ON "cny_ledger" ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_expenses_spent_at" ON "expenses" ("spent_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_expenses_order" ON "expenses" ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_order" ON "payments" ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_paid_at" ON "payments" ("paid_at");