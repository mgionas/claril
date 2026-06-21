CREATE TYPE "public"."notification_type" AS ENUM('mention', 'reply', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."thread_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TABLE "comment" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"body" text NOT NULL,
	"mentioned_user_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"edited_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "comment_thread" (
	"id" text PRIMARY KEY NOT NULL,
	"diagram_id" text NOT NULL,
	"element_id" text,
	"status" "thread_status" DEFAULT 'open' NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" "notification_type" NOT NULL,
	"diagram_id" text NOT NULL,
	"thread_id" text,
	"comment_id" text,
	"actor_id" text NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_thread_id_comment_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."comment_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_thread" ADD CONSTRAINT "comment_thread_diagram_id_diagram_id_fk" FOREIGN KEY ("diagram_id") REFERENCES "public"."diagram"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_thread" ADD CONSTRAINT "comment_thread_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_thread" ADD CONSTRAINT "comment_thread_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_diagram_id_diagram_id_fk" FOREIGN KEY ("diagram_id") REFERENCES "public"."diagram"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_thread_id_comment_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."comment_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_comment_id_comment_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comment_thread_idx" ON "comment" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "comment_thread_diagram_idx" ON "comment_thread" USING btree ("diagram_id","status");--> statement-breakpoint
CREATE INDEX "notification_user_idx" ON "notification" USING btree ("user_id","read_at","created_at");