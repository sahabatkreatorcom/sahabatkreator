CREATE TABLE "developer_app" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"allowed_redirect_uris" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN "developer_app_id" text;--> statement-breakpoint
ALTER TABLE "oauth_state" ADD COLUMN "developer_app_id" text;--> statement-breakpoint
ALTER TABLE "oauth_state" ADD COLUMN "redirect_uri" text;--> statement-breakpoint
ALTER TABLE "developer_app" ADD CONSTRAINT "developer_app_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "developer_app_organizationId_idx" ON "developer_app" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_developer_app_id_developer_app_id_fk" FOREIGN KEY ("developer_app_id") REFERENCES "public"."developer_app"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_state" ADD CONSTRAINT "oauth_state_developer_app_id_developer_app_id_fk" FOREIGN KEY ("developer_app_id") REFERENCES "public"."developer_app"("id") ON DELETE cascade ON UPDATE no action;