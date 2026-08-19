CREATE TABLE "pending_oauth_session" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"platform" "platform" NOT NULL,
	"access_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pending_oauth_session" ADD CONSTRAINT "pending_oauth_session_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pending_oauth_session_org_idx" ON "pending_oauth_session" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "pending_oauth_session_expiry_idx" ON "pending_oauth_session" USING btree ("expires_at");