DROP INDEX "chat_message_diagram_idx";--> statement-breakpoint
ALTER TABLE "chat_message" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_message_diagram_user_idx" ON "chat_message" USING btree ("diagram_id","user_id");