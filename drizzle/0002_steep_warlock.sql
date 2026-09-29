CREATE TABLE "discrepancies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"field_key" text NOT NULL,
	"doc_a" text NOT NULL,
	"doc_b" text NOT NULL,
	"value_a" text,
	"value_b" text,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"field_key" text NOT NULL,
	"value" text,
	"bbox" jsonb,
	"confidence" double precision,
	"edited_by_user" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"ocr_source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_logs" ADD COLUMN "touchpoint" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "mgmt_fee_mode" text;--> statement-breakpoint
ALTER TABLE "discrepancies" ADD CONSTRAINT "discrepancies_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_fields" ADD CONSTRAINT "document_fields_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discrepancies_prop_idx" ON "discrepancies" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "document_fields_doc_idx" ON "document_fields" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "documents_prop_idx" ON "documents" USING btree ("property_id");