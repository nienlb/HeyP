CREATE TABLE "deletion_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity" text NOT NULL,
	"entity_id" integer NOT NULL,
	"deleted_by" text NOT NULL,
	"deleted_at" bigint DEFAULT (EXTRACT(EPOCH FROM now())::bigint) NOT NULL,
	"snapshot" text NOT NULL
);
