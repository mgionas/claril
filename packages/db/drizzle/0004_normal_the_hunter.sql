CREATE TYPE "public"."ai_usage_kind" AS ENUM('chat', 'advisor', 'docgen', 'plan', 'generate');--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text,
	"diagram_id" text,
	"kind" "ai_usage_kind" NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diagram_doc" (
	"diagram_id" text PRIMARY KEY NOT NULL,
	"markdown" text NOT NULL,
	"model" text,
	"generated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_diagram_id_diagram_id_fk" FOREIGN KEY ("diagram_id") REFERENCES "public"."diagram"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagram_doc" ADD CONSTRAINT "diagram_doc_diagram_id_diagram_id_fk" FOREIGN KEY ("diagram_id") REFERENCES "public"."diagram"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_org_idx" ON "ai_usage" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ai_usage_project_idx" ON "ai_usage" USING btree ("project_id");