-- Carousel render (RFC docs/rfc-carousel-render.md)
-- Layer visual /ai/carousel: outline teks → slide gambar via Modal (Pillow).
-- Style & format tidak jadi tipe enum — mereka di dalam settings jsonb.
CREATE TYPE "public"."carousel_job_status" AS ENUM('queued', 'sourcing', 'rendering', 'uploading', 'done', 'failed', 'canceled');--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "credit" text;--> statement-breakpoint
CREATE TABLE "carousel_job" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"created_by_user_id" text,
	"topic" text NOT NULL,
	"caption" text,
	"settings" jsonb NOT NULL,
	"target_platform" "platform" DEFAULT 'instagram' NOT NULL,
	"status" "carousel_job_status" DEFAULT 'queued' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "carousel_job_slide" (
	"id" text PRIMARY KEY NOT NULL,
	"carousel_job_id" text NOT NULL,
	"urutan" integer NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"background_media_id" text,
	"output_media_id" text,
	"stock_credit" text,
	"layout" jsonb
);--> statement-breakpoint
ALTER TABLE "carousel_job" ADD CONSTRAINT "carousel_job_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carousel_job_slide" ADD CONSTRAINT "carousel_job_slide_carousel_job_id_carousel_job_id_fk" FOREIGN KEY ("carousel_job_id") REFERENCES "public"."carousel_job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carousel_job_slide" ADD CONSTRAINT "carousel_job_slide_background_media_id_media_id_fk" FOREIGN KEY ("background_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carousel_job_slide" ADD CONSTRAINT "carousel_job_slide_output_media_id_media_id_fk" FOREIGN KEY ("output_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "carousel_job_organizationId_idx" ON "carousel_job" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "carousel_job_slide_carouselJobId_idx" ON "carousel_job_slide" USING btree ("carousel_job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "carousel_job_slide_job_urutan_udx" ON "carousel_job_slide" USING btree ("carousel_job_id","urutan");
