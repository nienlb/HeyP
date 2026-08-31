CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'nhan_vien' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" bigint DEFAULT (EXTRACT(EPOCH FROM now())::bigint) NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
