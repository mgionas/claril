CREATE TABLE "personal_project" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_ai_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"encrypted_key" text,
	"base_url" text,
	"default_model" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_ai_default" (
	"user_id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "diagram" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "diagram" ADD COLUMN "personal_project_id" text;--> statement-breakpoint
ALTER TABLE "personal_project" ADD CONSTRAINT "personal_project_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_ai_connection" ADD CONSTRAINT "user_ai_connection_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_ai_default" ADD CONSTRAINT "user_ai_default_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "personal_project_owner_idx" ON "personal_project" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "user_ai_connection_user_idx" ON "user_ai_connection" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_ai_connection_user_provider_unique" ON "user_ai_connection" USING btree ("user_id","provider");--> statement-breakpoint
ALTER TABLE "diagram" ADD CONSTRAINT "diagram_personal_project_id_personal_project_id_fk" FOREIGN KEY ("personal_project_id") REFERENCES "public"."personal_project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "diagram_personal_project_idx" ON "diagram" USING btree ("personal_project_id");--> statement-breakpoint
ALTER TABLE "diagram" ADD CONSTRAINT "diagram_parent_xor" CHECK (("diagram"."project_id" IS NULL) <> ("diagram"."personal_project_id" IS NULL));