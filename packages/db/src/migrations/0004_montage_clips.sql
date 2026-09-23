CREATE TABLE "video_job_clip" (
	"id" text PRIMARY KEY NOT NULL,
	"video_job_id" text NOT NULL,
	"order" integer NOT NULL,
	"media_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "video_job_clip" ADD CONSTRAINT "video_job_clip_video_job_id_video_job_id_fk" FOREIGN KEY ("video_job_id") REFERENCES "public"."video_job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_job_clip" ADD CONSTRAINT "video_job_clip_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "video_job_clip_videoJobId_idx" ON "video_job_clip" USING btree ("video_job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "video_job_clip_job_order_udx" ON "video_job_clip" USING btree ("video_job_id","order");