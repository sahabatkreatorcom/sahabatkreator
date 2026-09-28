-- Auto-clip (RFC docs/rfc-auto-clip.md)
-- Long-form → N kandidat klip via AI (OpenRouter), user pilih, fan-out ke
-- video_job mode single. Job analisis = 1 video_job; kandidat di tabel anak.
-- T3 (platform scraping) DITAHAN TOTAL — url_source_tier cuma t1/t2 (RFC §2).
CREATE TYPE "public"."video_job_mode" AS ENUM('single', 'montage', 'auto_clip');--> statement-breakpoint
CREATE TYPE "public"."video_job_segment_status" AS ENUM('pending', 'selected', 'rendering', 'rendered', 'skipped');--> statement-breakpoint
ALTER TABLE "video_job" ADD COLUMN "mode" "video_job_mode" DEFAULT 'single' NOT NULL;--> statement-breakpoint
ALTER TABLE "video_job" ADD COLUMN "url_source" text;--> statement-breakpoint
ALTER TABLE "video_job" ADD COLUMN "url_source_tier" text;--> statement-breakpoint
ALTER TABLE "video_job" ADD COLUMN "clip_settings" jsonb;--> statement-breakpoint
CREATE TABLE "video_job_segment" (
	"id" text PRIMARY KEY NOT NULL,
	"video_job_id" text NOT NULL,
	"order" integer NOT NULL,
	"start_sec" double precision NOT NULL,
	"end_sec" double precision NOT NULL,
	"title" text NOT NULL,
	"viral_score" integer NOT NULL,
	"hook_text" text,
	"keep_segments" jsonb,
	"explicit_range" boolean,
	"status" "video_job_segment_status" DEFAULT 'pending' NOT NULL,
	"render_video_job_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "video_job_segment" ADD CONSTRAINT "video_job_segment_video_job_id_video_job_id_fk" FOREIGN KEY ("video_job_id") REFERENCES "public"."video_job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_job_segment" ADD CONSTRAINT "video_job_segment_render_video_job_id_video_job_id_fk" FOREIGN KEY ("render_video_job_id") REFERENCES "public"."video_job"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "video_job_segment_videoJobId_idx" ON "video_job_segment" USING btree ("video_job_id");--> statement-breakpoint
CREATE INDEX "video_job_segment_status_idx" ON "video_job_segment" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "video_job_segment_job_order_udx" ON "video_job_segment" USING btree ("video_job_id","order");
