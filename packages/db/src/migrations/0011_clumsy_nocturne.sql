ALTER TABLE "engagement_item" ADD COLUMN "liked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "social_account" ADD COLUMN "access_lost_at" timestamp;