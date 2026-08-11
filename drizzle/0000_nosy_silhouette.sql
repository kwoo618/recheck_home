CREATE TABLE "ai_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature" text NOT NULL,
	"input_summary" text DEFAULT '' NOT NULL,
	"output_text" text DEFAULT '' NOT NULL,
	"filtered" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"address_detail" text DEFAULT '' NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"distance_from_school" integer,
	"deal_type" text NOT NULL,
	"price" integer DEFAULT 0 NOT NULL,
	"deposit" integer DEFAULT 0 NOT NULL,
	"mgmt_fee" integer DEFAULT 0 NOT NULL,
	"area" numeric(6, 2) DEFAULT '0' NOT NULL,
	"age" integer DEFAULT 0 NOT NULL,
	"heating" text DEFAULT '모름' NOT NULL,
	"floor" text DEFAULT '' NOT NULL,
	"link" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'prep' NOT NULL,
	"no_concern" boolean DEFAULT false NOT NULL,
	"safety_checks" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"contract_checks" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"after_checks" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"text" text NOT NULL,
	"source" text NOT NULL,
	"answer" text DEFAULT '' NOT NULL,
	"no_answer" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"finance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visit_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"rule_id" text DEFAULT 'custom' NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"result" text DEFAULT '' NOT NULL,
	"memo" text DEFAULT '' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_checks" ADD CONSTRAINT "visit_checks_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "properties_user_idx" ON "properties" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "properties_status_idx" ON "properties" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "questions_prop_idx" ON "questions" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "visit_checks_prop_idx" ON "visit_checks" USING btree ("property_id");