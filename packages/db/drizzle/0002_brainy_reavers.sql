CREATE TABLE "asset" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"asset_type_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_link" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"from_asset_id" text NOT NULL,
	"to_asset_id" text NOT NULL,
	"relation_type" text DEFAULT 'relates-to' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_type" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"color" text,
	"description" text,
	"builtin" text DEFAULT 'false' NOT NULL,
	"field_schema" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "element_asset_binding" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"diagram_id" text NOT NULL,
	"element_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_asset_type_id_asset_type_id_fk" FOREIGN KEY ("asset_type_id") REFERENCES "public"."asset_type"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_link" ADD CONSTRAINT "asset_link_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_link" ADD CONSTRAINT "asset_link_from_asset_id_asset_id_fk" FOREIGN KEY ("from_asset_id") REFERENCES "public"."asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_link" ADD CONSTRAINT "asset_link_to_asset_id_asset_id_fk" FOREIGN KEY ("to_asset_id") REFERENCES "public"."asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_type" ADD CONSTRAINT "asset_type_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "element_asset_binding" ADD CONSTRAINT "element_asset_binding_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "element_asset_binding" ADD CONSTRAINT "element_asset_binding_diagram_id_diagram_id_fk" FOREIGN KEY ("diagram_id") REFERENCES "public"."diagram"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "element_asset_binding" ADD CONSTRAINT "element_asset_binding_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_org_idx" ON "asset" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "asset_type_idx" ON "asset" USING btree ("asset_type_id");--> statement-breakpoint
CREATE INDEX "asset_link_org_idx" ON "asset_link" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "asset_link_from_idx" ON "asset_link" USING btree ("from_asset_id");--> statement-breakpoint
CREATE INDEX "asset_link_to_idx" ON "asset_link" USING btree ("to_asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_link_unique" ON "asset_link" USING btree ("from_asset_id","to_asset_id","relation_type");--> statement-breakpoint
CREATE INDEX "asset_type_org_idx" ON "asset_type" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_type_org_name_unique" ON "asset_type" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "element_binding_org_idx" ON "element_asset_binding" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "element_binding_diagram_idx" ON "element_asset_binding" USING btree ("diagram_id");--> statement-breakpoint
CREATE INDEX "element_binding_asset_idx" ON "element_asset_binding" USING btree ("asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "element_binding_unique" ON "element_asset_binding" USING btree ("diagram_id","element_id");