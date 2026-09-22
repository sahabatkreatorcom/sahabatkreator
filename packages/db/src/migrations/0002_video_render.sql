CREATE TABLE "video_job" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"base_video_media_id" text NOT NULL,
	"voiceover_media_id" text,
	"bgm_audio_track_id" text,
	"settings" jsonb NOT NULL,
	"output_media_id" text,
	"srt_storage_key" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"error_message" text,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "video_job" ADD CONSTRAINT "video_job_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_job" ADD CONSTRAINT "video_job_base_video_media_id_media_id_fk" FOREIGN KEY ("base_video_media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_job" ADD CONSTRAINT "video_job_voiceover_media_id_media_id_fk" FOREIGN KEY ("voiceover_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_job" ADD CONSTRAINT "video_job_bgm_audio_track_id_audio_track_id_fk" FOREIGN KEY ("bgm_audio_track_id") REFERENCES "public"."audio_track"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_job" ADD CONSTRAINT "video_job_output_media_id_media_id_fk" FOREIGN KEY ("output_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "video_job_organizationId_idx" ON "video_job" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "video_job_status_idx" ON "video_job" USING btree ("status");--> statement-breakpoint
CREATE INDEX "video_job_baseVideoMediaId_idx" ON "video_job" USING btree ("base_video_media_id");--> statement-breakpoint
CREATE INDEX "video_job_outputMediaId_idx" ON "video_job" USING btree ("output_media_id");