-- Pool quota per-user + kredit render (Modal)
-- Limit plan tidak lagi dihitung per-org, tapi diagregasi ke seluruh org yang
-- dimiliki (role=owner) user — tier = langganan aktif tertinggi di pool.
-- render_usage mirror ai_usage: konsumsi dicatat per-org aktif, cek limit SUM pool.
CREATE TABLE "render_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"period" text NOT NULL,
	"credits_used" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plan" ADD COLUMN "render_credits_per_month" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "render_usage" ADD CONSTRAINT "render_usage_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "render_usage_org_period_uidx" ON "render_usage" USING btree ("organization_id","period");
