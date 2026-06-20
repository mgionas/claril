CREATE TABLE "ai_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider" text NOT NULL,
	"encrypted_key" text,
	"base_url" text,
	"default_model" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_org_default" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_connection" ADD CONSTRAINT "ai_connection_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_org_default" ADD CONSTRAINT "ai_org_default_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_connection_org_idx" ON "ai_connection" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_connection_org_provider_unique" ON "ai_connection" USING btree ("organization_id","provider");--> statement-breakpoint
-- ----------------------------------------------------------------------------
-- BACKFILL (idempotent): seed the new multi-provider tables from the existing
-- single-row-per-org `ai_provider_config`. Safe to re-run; safe to roll back
-- (the down direction just drops the two new tables). Copies each org's current
-- provider config into `ai_connection` and points `ai_org_default` at it.
-- The encrypted key, base_url and model are carried over verbatim (already
-- AES-256-GCM encrypted; no re-encryption needed). Model falls back to the
-- provider name only as a last resort if a legacy row has a null model — the
-- follow-up wiring normalizes nulls to DEFAULT_MODELS[provider].
-- ----------------------------------------------------------------------------
INSERT INTO "ai_connection" (
	"id", "organization_id", "provider", "encrypted_key", "base_url", "default_model", "created_at", "updated_at"
)
SELECT
	gen_random_uuid()::text,
	c."organization_id",
	c."provider",
	c."encrypted_key",
	c."base_url",
	c."model",
	now(),
	c."updated_at"
FROM "ai_provider_config" c
ON CONFLICT ("organization_id", "provider") DO NOTHING;--> statement-breakpoint
INSERT INTO "ai_org_default" ("organization_id", "provider", "model", "updated_at")
SELECT
	c."organization_id",
	c."provider",
	COALESCE(c."model", c."provider"),
	c."updated_at"
FROM "ai_provider_config" c
ON CONFLICT ("organization_id") DO NOTHING;