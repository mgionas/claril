CREATE TABLE "diagram_knowledge" (
	"diagram_id" text PRIMARY KEY NOT NULL,
	"summary" text NOT NULL,
	"graph_hash" text NOT NULL,
	"model" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "diagram_knowledge" ADD CONSTRAINT "diagram_knowledge_diagram_id_diagram_id_fk" FOREIGN KEY ("diagram_id") REFERENCES "public"."diagram"("id") ON DELETE cascade ON UPDATE no action;