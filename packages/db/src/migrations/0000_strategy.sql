CREATE TYPE "public"."blog_post_status" AS ENUM('draft', 'review', 'scheduled', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."engagement_status" AS ENUM('unread', 'read', 'replied', 'archived');--> statement-breakpoint
CREATE TYPE "public"."engagement_type" AS ENUM('comment', 'mention', 'dm', 'review');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('image', 'video', 'audio');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'completed', 'failed', 'expired', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."plan_tier" AS ENUM('free', 'pro', 'business', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('instagram', 'instagram_standalone', 'facebook', 'threads', 'tiktok', 'youtube', 'pinterest', 'linkedin', 'bluesky', 'google_business', 'manual');--> statement-breakpoint
CREATE TYPE "public"."post_status" AS ENUM('draft', 'scheduled', 'publishing', 'published', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('inactive', 'pending', 'active', 'failed', 'expired', 'canceled');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"user_id" text,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"metadata" jsonb,
	"ip_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text,
	"title" text NOT NULL,
	"body" text,
	"type" text DEFAULT 'system' NOT NULL,
	"link_url" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"registration_enabled" boolean DEFAULT true NOT NULL,
	"maintenance_mode" boolean DEFAULT false NOT NULL,
	"maintenance_message" text,
	"ai_api_key_enc" text,
	"ai_model" text,
	"support_email" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"period" text NOT NULL,
	"credits_used" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_log" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text,
	"action" text NOT NULL,
	"platform" text,
	"model" text,
	"credits" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_analytics" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"social_account_id" text NOT NULL,
	"platform" "platform" NOT NULL,
	"date" date NOT NULL,
	"followers" integer,
	"following" integer,
	"posts" integer,
	"impressions" bigint,
	"reach" bigint,
	"profile_views" integer,
	"engagement_count" integer,
	"website_clicks" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_analytics" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"post_id" text NOT NULL,
	"social_account_id" text NOT NULL,
	"platform" "platform" NOT NULL,
	"date" date NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	"shares" integer DEFAULT 0 NOT NULL,
	"saves" integer DEFAULT 0 NOT NULL,
	"views" bigint DEFAULT 0 NOT NULL,
	"impressions" bigint DEFAULT 0 NOT NULL,
	"reach" bigint DEFAULT 0 NOT NULL,
	"website_clicks" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL,
	"verified" boolean DEFAULT true,
	"failed_verification_count" integer DEFAULT 0,
	"locked_until" timestamp
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"two_factor_enabled" boolean DEFAULT false,
	"role" text,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"subscription_id" text,
	"plan_id" text,
	"order_id" text NOT NULL,
	"provider_payment_id" text,
	"amount" bigint NOT NULL,
	"fee" bigint,
	"net_amount" bigint,
	"currency" text DEFAULT 'IDR' NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"payment_method" text,
	"payment_link_url" text,
	"payment_code" text,
	"expires_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan" (
	"id" text PRIMARY KEY NOT NULL,
	"tier" "plan_tier" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_idr" integer DEFAULT 0 NOT NULL,
	"billing_interval_months" integer DEFAULT 1 NOT NULL,
	"max_social_accounts" integer DEFAULT 1 NOT NULL,
	"max_scheduled_posts_per_month" integer DEFAULT 10 NOT NULL,
	"max_team_members" integer DEFAULT 1 NOT NULL,
	"max_media_storage_mb" integer DEFAULT 500 NOT NULL,
	"ai_credits_per_month" integer DEFAULT 0 NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processed_webhook_event" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"provider_payment_id" text NOT NULL,
	"payload" jsonb,
	"processed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"plan_id" text,
	"tier" "plan_tier" DEFAULT 'free' NOT NULL,
	"status" "subscription_status" DEFAULT 'inactive' NOT NULL,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"trial_ends_at" timestamp,
	"canceled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_log" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb,
	"result" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_note" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"date" timestamp NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "caption_template" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"content" text NOT NULL,
	"hashtags" text[] DEFAULT '{}' NOT NULL,
	"category" text,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_pillar" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"type" "media_type" NOT NULL,
	"storage_key" text NOT NULL,
	"url" text NOT NULL,
	"thumbnail_url" text,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"duration_seconds" integer,
	"content_hash" text,
	"alt_text" text,
	"folder_id" text,
	"uploaded_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_folder" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"post_group_id" text NOT NULL,
	"social_account_id" text NOT NULL,
	"platform" "platform" NOT NULL,
	"status" "post_status" DEFAULT 'draft' NOT NULL,
	"content" text,
	"platform_post_id" text,
	"platform_post_url" text,
	"published_at" timestamp,
	"error_code" text,
	"error_message" text,
	"platform_settings" jsonb,
	"hashtags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"first_comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_group" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"scheduled_at" timestamp,
	"timezone" text DEFAULT 'Asia/Jakarta' NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_media" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"media_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engagement_item" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"social_account_id" text NOT NULL,
	"type" "engagement_type" NOT NULL,
	"status" "engagement_status" DEFAULT 'unread' NOT NULL,
	"platform_item_id" text,
	"parent_id" text,
	"author_name" text,
	"author_username" text,
	"author_avatar_url" text,
	"content" text,
	"rating" integer,
	"media_url" text,
	"reply_content" text,
	"replied_at" timestamp,
	"platform_reply_id" text,
	"assigned_member_id" text,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sentiment" text,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_response" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"created_at" timestamp NOT NULL,
	"metadata" text,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "oauth_state" (
	"id" text PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"platform" "platform" NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_credential" (
	"id" text PRIMARY KEY NOT NULL,
	"platform" "platform" NOT NULL,
	"client_id" text NOT NULL,
	"client_secret_enc" text NOT NULL,
	"redirect_uri" text,
	"extra_config_enc" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_health" (
	"id" text PRIMARY KEY NOT NULL,
	"platform" "platform" NOT NULL,
	"status" text DEFAULT 'unknown' NOT NULL,
	"message" text,
	"checked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_account" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"platform" "platform" NOT NULL,
	"platform_account_id" text NOT NULL,
	"username" text NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"access_token_enc" text,
	"refresh_token_enc" text,
	"token_expires_at" timestamp,
	"scopes" jsonb,
	"is_connected" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp,
	"last_error" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_category" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_post" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"content_html" text DEFAULT '' NOT NULL,
	"excerpt" text,
	"cover_image_url" text,
	"cover_image_alt" text,
	"category_id" text,
	"author_id" text,
	"status" "blog_post_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp,
	"meta_title" text,
	"meta_description" text,
	"og_image_url" text,
	"canonical_url" text,
	"reading_time_minutes" integer DEFAULT 1 NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_post_tag" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"tag" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_submission" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"message" text NOT NULL,
	"ip_address" text,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_subscriber" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"is_verified" boolean DEFAULT false NOT NULL,
	"verify_token" text,
	"unsubscribed_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_voice" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"description" text,
	"tones" text[] DEFAULT '{}' NOT NULL,
	"vocabulary" text[] DEFAULT '{}' NOT NULL,
	"avoid" text[] DEFAULT '{}' NOT NULL,
	"guidelines" text,
	"samples" text[] DEFAULT '{}' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hashtag_collection" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"hashtags" text[] DEFAULT '{}' NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_log" ADD CONSTRAINT "ai_usage_log_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_log" ADD CONSTRAINT "ai_usage_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_analytics" ADD CONSTRAINT "account_analytics_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_analytics" ADD CONSTRAINT "account_analytics_social_account_id_social_account_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_analytics" ADD CONSTRAINT "post_analytics_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_analytics" ADD CONSTRAINT "post_analytics_post_id_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_analytics" ADD CONSTRAINT "post_analytics_social_account_id_social_account_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_subscription_id_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscription"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_note" ADD CONSTRAINT "calendar_note_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caption_template" ADD CONSTRAINT "caption_template_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caption_template" ADD CONSTRAINT "caption_template_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_pillar" ADD CONSTRAINT "content_pillar_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_folder" ADD CONSTRAINT "media_folder_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_post_group_id_post_group_id_fk" FOREIGN KEY ("post_group_id") REFERENCES "public"."post_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_social_account_id_social_account_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_group" ADD CONSTRAINT "post_group_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_post_id_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_item" ADD CONSTRAINT "engagement_item_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_item" ADD CONSTRAINT "engagement_item_social_account_id_social_account_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_response" ADD CONSTRAINT "saved_response_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_state" ADD CONSTRAINT "oauth_state_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_account" ADD CONSTRAINT "social_account_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post" ADD CONSTRAINT "blog_post_category_id_blog_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."blog_category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post" ADD CONSTRAINT "blog_post_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post_tag" ADD CONSTRAINT "blog_post_tag_post_id_blog_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."blog_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_voice" ADD CONSTRAINT "brand_voice_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hashtag_collection" ADD CONSTRAINT "hashtag_collection_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_organizationId_idx" ON "audit_log" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "audit_log_userId_idx" ON "audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_log_action_idx" ON "audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "notification_userId_idx" ON "notification" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_user_read_idx" ON "notification" USING btree ("user_id","is_read");--> statement-breakpoint
CREATE INDEX "notification_createdAt_idx" ON "notification" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_usage_org_period_uidx" ON "ai_usage" USING btree ("organization_id","period");--> statement-breakpoint
CREATE INDEX "ai_usage_log_organizationId_idx" ON "ai_usage_log" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ai_usage_log_createdAt_idx" ON "ai_usage_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "account_analytics_account_date_uidx" ON "account_analytics" USING btree ("social_account_id","date");--> statement-breakpoint
CREATE INDEX "account_analytics_organizationId_idx" ON "account_analytics" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "account_analytics_date_idx" ON "account_analytics" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "post_analytics_post_date_uidx" ON "post_analytics" USING btree ("post_id","date");--> statement-breakpoint
CREATE INDEX "post_analytics_organizationId_idx" ON "post_analytics" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "post_analytics_date_idx" ON "post_analytics" USING btree ("date");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "twoFactor_secret_idx" ON "two_factor" USING btree ("secret");--> statement-breakpoint
CREATE INDEX "twoFactor_userId_idx" ON "two_factor" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_orderId_uidx" ON "payment" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payment_organizationId_idx" ON "payment" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "payment_status_idx" ON "payment" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_tier_interval_uidx" ON "plan" USING btree ("tier","billing_interval_months");--> statement-breakpoint
CREATE UNIQUE INDEX "processed_webhook_event_uidx" ON "processed_webhook_event" USING btree ("event_type","provider_payment_id");--> statement-breakpoint
CREATE INDEX "subscription_organizationId_idx" ON "subscription" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_organization_uidx" ON "subscription" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "webhook_log_createdAt_idx" ON "webhook_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "calendar_note_organizationId_date_idx" ON "calendar_note" USING btree ("organization_id","date");--> statement-breakpoint
CREATE INDEX "caption_template_organization_idx" ON "caption_template" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "content_pillar_organization_idx" ON "content_pillar" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "media_organizationId_idx" ON "media" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "media_contentHash_idx" ON "media" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "media_folderId_idx" ON "media" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "media_folder_organizationId_idx" ON "media_folder" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "post_organizationId_idx" ON "post" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "post_postGroupId_idx" ON "post" USING btree ("post_group_id");--> statement-breakpoint
CREATE INDEX "post_socialAccountId_idx" ON "post" USING btree ("social_account_id");--> statement-breakpoint
CREATE INDEX "post_status_idx" ON "post" USING btree ("status");--> statement-breakpoint
CREATE INDEX "post_publishedAt_idx" ON "post" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "post_group_organizationId_idx" ON "post_group" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "post_group_scheduledAt_idx" ON "post_group" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "post_media_postId_idx" ON "post_media" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "engagement_item_organizationId_idx" ON "engagement_item" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "engagement_item_socialAccountId_idx" ON "engagement_item" USING btree ("social_account_id");--> statement-breakpoint
CREATE INDEX "engagement_item_type_status_idx" ON "engagement_item" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX "engagement_item_occurredAt_idx" ON "engagement_item" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "engagement_item_parentId_idx" ON "engagement_item" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "saved_response_organizationId_idx" ON "saved_response" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_organizationId_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "member_organizationId_idx" ON "member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_userId_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_slug_uidx" ON "organization" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_state_state_uidx" ON "oauth_state" USING btree ("state");--> statement-breakpoint
CREATE INDEX "oauth_state_expiresAt_idx" ON "oauth_state" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_credential_platform_uidx" ON "platform_credential" USING btree ("platform");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_health_platform_uidx" ON "platform_health" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "platform_health_checkedAt_idx" ON "platform_health" USING btree ("checked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "social_account_platform_account_uidx" ON "social_account" USING btree ("platform","platform_account_id");--> statement-breakpoint
CREATE INDEX "social_account_organizationId_idx" ON "social_account" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "blog_category_slug_uidx" ON "blog_category" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "blog_post_slug_uidx" ON "blog_post" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "blog_post_status_publishedAt_idx" ON "blog_post" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "blog_post_categoryId_idx" ON "blog_post" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "blog_post_tag_uidx" ON "blog_post_tag" USING btree ("post_id","tag");--> statement-breakpoint
CREATE INDEX "blog_post_tag_tag_idx" ON "blog_post_tag" USING btree ("tag");--> statement-breakpoint
CREATE INDEX "contact_submission_status_idx" ON "contact_submission" USING btree ("status");--> statement-breakpoint
CREATE INDEX "contact_submission_createdAt_idx" ON "contact_submission" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_subscriber_email_uidx" ON "newsletter_subscriber" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_voice_organization_uidx" ON "brand_voice" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "hashtag_collection_organization_idx" ON "hashtag_collection" USING btree ("organization_id");