CREATE TYPE "public"."catalog_source" AS ENUM('SHOPIFY', 'WOOCOMMERCE', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."draft_action" AS ENUM('ACCEPTED', 'MODIFIED', 'DISMISSED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('OWNER', 'ADMIN', 'MEMBER', 'VIEWER', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."org_tier" AS ENUM('FREE', 'PRO', 'BUSINESS', 'ENTERPRISE', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED', 'CANCELED');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('INSTAGRAM', 'INSTAGRAM_PAGE', 'FACEBOOK', 'META', 'TIKTOK', 'YOUTUBE', 'PINTEREST', 'GOOGLE_BUSINESS', 'LINKEDIN', 'BLUESKY', 'THREADS', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."post_status" AS ENUM('DRAFT', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."post_type" AS ENUM('FEED', 'REEL', 'STORY', 'CAROUSEL', 'PIN', 'VIDEO', 'ARTICLE', 'THREAD');--> statement-breakpoint
CREATE TYPE "public"."seb_chat_role" AS ENUM('USER', 'ASSISTANT', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."seb_experiment_status" AS ENUM('PLANNED', 'RUNNING', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."seb_recommendation_category" AS ENUM('CONTENT_STRATEGY', 'CAPTION', 'CREATIVE', 'VIDEO', 'TIMING', 'HASHTAG', 'PLATFORM', 'COMPETITOR', 'BRAND');--> statement-breakpoint
CREATE TYPE "public"."seb_recommendation_priority" AS ENUM('LOW', 'MEDIUM', 'HIGH');--> statement-breakpoint
CREATE TYPE "public"."seb_recommendation_status" AS ENUM('NEW', 'IN_PROGRESS', 'DONE', 'DISMISSED');--> statement-breakpoint
CREATE TYPE "public"."seb_report_status" AS ENUM('GENERATING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."seb_report_trigger" AS ENUM('PROACTIVE', 'MANUAL', 'CHAT');--> statement-breakpoint
CREATE TYPE "public"."shop_sync_status" AS ENUM('PENDING', 'SYNCING', 'SYNCED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."stock_media_source" AS ENUM('PIXABAY', 'PEXELS', 'UNSPLASH');--> statement-breakpoint
CREATE TABLE "daily_analytics_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"platform" "platform" NOT NULL,
	"date" timestamp NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	"shares" integer DEFAULT 0 NOT NULL,
	"saves" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"reach" integer DEFAULT 0 NOT NULL,
	"video_views" integer DEFAULT 0 NOT NULL,
	"followers" integer DEFAULT 0 NOT NULL,
	"followers_change" integer DEFAULT 0 NOT NULL,
	"engagement_rate" integer DEFAULT 0 NOT NULL,
	"posts_published" integer DEFAULT 0 NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_analytics" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"social_account_id" text NOT NULL,
	"date" timestamp NOT NULL,
	"followers" integer DEFAULT 0 NOT NULL,
	"followers_change" integer DEFAULT 0 NOT NULL,
	"following" integer DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"reach" integer DEFAULT 0 NOT NULL,
	"engagement_rate" integer DEFAULT 0 NOT NULL,
	"profile_views" integer DEFAULT 0 NOT NULL,
	"website_clicks" integer DEFAULT 0 NOT NULL,
	"email_clicks" integer DEFAULT 0 NOT NULL,
	"platform_metrics" jsonb,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_analytics" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text,
	"impressions" integer DEFAULT 0 NOT NULL,
	"reach" integer DEFAULT 0 NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	"shares" integer DEFAULT 0 NOT NULL,
	"saves" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"video_views" integer,
	"video_watch_time" integer,
	"avg_watch_percentage" integer,
	"engagement_rate" integer DEFAULT 0 NOT NULL,
	"platform_metrics" jsonb,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "post_analytics_post_id_unique" UNIQUE("post_id")
);
--> statement-breakpoint
CREATE TABLE "scheduled_report" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"schedule" text NOT NULL,
	"recipients" text[] NOT NULL,
	"config" jsonb NOT NULL,
	"last_run_at" timestamp,
	"next_run_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"delivery_format" text DEFAULT 'pdf' NOT NULL,
	"share_token" text,
	"last_report_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "scheduled_report_share_token_unique" UNIQUE("share_token")
);
--> statement-breakpoint
CREATE TABLE "utm_template" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"source" text NOT NULL,
	"medium" text NOT NULL,
	"campaign" text,
	"content" text,
	"term" text,
	"usage_count" integer DEFAULT 0 NOT NULL,
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
	"tier" "org_tier" DEFAULT 'FREE' NOT NULL,
	"max_members" integer DEFAULT 5 NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"accent_color" text DEFAULT '#D4A574' NOT NULL,
	"accent_color_alt" text DEFAULT '#E8B4B8' NOT NULL,
	"dark_mode" boolean DEFAULT false NOT NULL,
	"ai_drafts_enabled" boolean DEFAULT true NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"stripe_price_id" text,
	"subscription_status" text,
	"current_period_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug"),
	CONSTRAINT "organization_stripe_customer_id_unique" UNIQUE("stripe_customer_id")
);
--> statement-breakpoint
CREATE TABLE "organization_role" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"role" text NOT NULL,
	"permission" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp
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
	"impersonated_by" text,
	"active_organization_id" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "team" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"organization_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "team_member" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp NOT NULL
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
CREATE TABLE "competitor" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"platform" "platform" NOT NULL,
	"username" text NOT NULL,
	"display_name" text,
	"avatar" text,
	"followers" integer DEFAULT 0 NOT NULL,
	"follower_growth" integer DEFAULT 0 NOT NULL,
	"avg_engagement" integer DEFAULT 0 NOT NULL,
	"posts_per_week" integer DEFAULT 0 NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"engagement_history" text,
	"share_of_voice" integer DEFAULT 0 NOT NULL,
	"benchmark_score" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitor_post" (
	"id" text PRIMARY KEY NOT NULL,
	"competitor_id" text NOT NULL,
	"platform_id" text,
	"posted_at" timestamp NOT NULL,
	"caption" text,
	"media_type" text,
	"engagement" integer DEFAULT 0 NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" text PRIMARY KEY NOT NULL,
	"catalog_id" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" integer NOT NULL,
	"currency" text DEFAULT 'IDR' NOT NULL,
	"image_url" text,
	"product_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	"instagram_product_id" text,
	"facebook_product_id" text,
	"pinterest_product_id" text,
	"tiktok_product_id" text,
	"youtube_product_id" text
);
--> statement-breakpoint
CREATE TABLE "product_catalog" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"source" "catalog_source" NOT NULL,
	"external_id" text,
	"synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_catalog_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "product_tag" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"product_id" text,
	"platform_product_id" text NOT NULL,
	"product_name" text NOT NULL,
	"product_price" integer,
	"product_currency" text,
	"product_image_url" text,
	"media_index" integer DEFAULT 0 NOT NULL,
	"position_x" integer,
	"position_y" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"platform" "platform" NOT NULL,
	"catalog_id" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sync_status" "shop_sync_status" DEFAULT 'PENDING' NOT NULL,
	"last_sync_at" timestamp,
	"last_sync_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_voice" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"samples" text[],
	"tone_profile" jsonb,
	"guidelines" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "brand_voice_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "calendar_note" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"created_by_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"date" timestamp NOT NULL,
	"color" text DEFAULT '#D4A574' NOT NULL,
	"is_private" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "caption_template" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"caption" text NOT NULL,
	"hashtags" text[],
	"category" text,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"thumbnail_url" text,
	"media_ids" text[],
	"platforms" "platform"[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_pillar" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text DEFAULT '#D4A574' NOT NULL,
	"icon" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_timing_pattern" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"platform" "platform" NOT NULL,
	"content_signature" text NOT NULL,
	"best_day" integer NOT NULL,
	"best_hour" integer NOT NULL,
	"avg_engagement" integer DEFAULT 0 NOT NULL,
	"sample_size" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "draft_interaction" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"post_id" text,
	"action" text NOT NULL,
	"platform" "platform" NOT NULL,
	"post_type" "post_type" DEFAULT 'FEED' NOT NULL,
	"suggested_day" integer NOT NULL,
	"suggested_hour" integer NOT NULL,
	"final_day" integer,
	"final_hour" integer,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engagement_prediction" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"platform" "platform" NOT NULL,
	"post_type" "post_type" DEFAULT 'FEED' NOT NULL,
	"day" integer NOT NULL,
	"hour" integer NOT NULL,
	"predicted_score" integer DEFAULT 0 NOT NULL,
	"confidence" integer DEFAULT 0 NOT NULL,
	"sample_size" integer DEFAULT 0 NOT NULL,
	"last_updated" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hashtag" (
	"id" text PRIMARY KEY NOT NULL,
	"tag" text NOT NULL,
	"is_banned" boolean DEFAULT false NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "hashtag_tag_unique" UNIQUE("tag")
);
--> statement-breakpoint
CREATE TABLE "hashtag_collection" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"hashtags" text[],
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hashtag_timing_pattern" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"platform" "platform" NOT NULL,
	"hashtag" text NOT NULL,
	"best_day" integer NOT NULL,
	"best_hour" integer NOT NULL,
	"avg_engagement" integer DEFAULT 0 NOT NULL,
	"sample_size" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text,
	"user_name" text,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"resource_name" text NOT NULL,
	"details" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"trigger" text NOT NULL,
	"platform" "platform" NOT NULL,
	"message" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"triggered" integer DEFAULT 0 NOT NULL,
	"delivered" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"social_account_id" text NOT NULL,
	"post_id" text,
	"platform_post_id" text NOT NULL,
	"platform_comment_id" text NOT NULL,
	"author_id" text NOT NULL,
	"author_username" text NOT NULL,
	"author_avatar" text,
	"text" text NOT NULL,
	"sentiment" text,
	"is_replied" boolean DEFAULT false NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"assigned_to_id" text,
	"label_ids" text[],
	"parent_id" text,
	"like_count" integer DEFAULT 0 NOT NULL,
	"reply_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "direct_message" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"social_account_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"platform_message_id" text NOT NULL,
	"direction" text NOT NULL,
	"sender_id" text NOT NULL,
	"sender_username" text NOT NULL,
	"sender_avatar" text,
	"text" text,
	"media_url" text,
	"media_type" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"assigned_to_id" text,
	"label_ids" text[],
	"created_at" timestamp NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_label" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#6B7280' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mention" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"social_account_id" text NOT NULL,
	"type" text NOT NULL,
	"platform_post_id" text NOT NULL,
	"author_id" text NOT NULL,
	"author_username" text NOT NULL,
	"author_avatar" text,
	"text" text,
	"media_url" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"assigned_to_id" text,
	"label_ids" text[],
	"created_at" timestamp NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"social_account_id" text NOT NULL,
	"platform_review_id" text NOT NULL,
	"author_name" text NOT NULL,
	"author_avatar" text,
	"rating" integer NOT NULL,
	"text" text,
	"reply_text" text,
	"is_replied" boolean DEFAULT false NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"platform" "platform" NOT NULL,
	"review_url" text,
	"created_at" timestamp NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_response" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"content" text NOT NULL,
	"shortcut" text,
	"category" text,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audience_activity" (
	"id" text PRIMARY KEY NOT NULL,
	"social_account_id" text NOT NULL,
	"platform" "platform" NOT NULL,
	"activity_grid" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "audience_activity_social_account_id_unique" UNIQUE("social_account_id")
);
--> statement-breakpoint
CREATE TABLE "pinterest_board_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"social_account_id" text NOT NULL,
	"boards" jsonb NOT NULL,
	"cached_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "pinterest_board_cache_social_account_id_unique" UNIQUE("social_account_id")
);
--> statement-breakpoint
CREATE TABLE "social_account" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"platform" "platform" NOT NULL,
	"platform_id" text NOT NULL,
	"name" text NOT NULL,
	"username" text,
	"custom_platform_name" text,
	"avatar" text,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"token_expiry" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_refresh_at" timestamp,
	"last_refresh_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"caption" text NOT NULL,
	"status" "post_status" DEFAULT 'DRAFT' NOT NULL,
	"scheduled_at" timestamp,
	"published_at" timestamp,
	"auto_publish" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"first_comment" text,
	"is_ai_generated" boolean DEFAULT false NOT NULL,
	"virality_score" integer,
	"brand_voice_score" integer,
	"is_external" boolean DEFAULT false NOT NULL,
	"external_id" text,
	"external_url" text,
	"external_thumbnail_url" text,
	"synced_at" timestamp,
	"platform" "platform",
	"social_account_id" text,
	"post_type" "post_type" DEFAULT 'FEED' NOT NULL,
	"platform_post_id" text,
	"call_to_action" text,
	"pin_title" varchar(100),
	"pin_link" text,
	"board_id" text,
	"video_title" varchar(100),
	"youtube_category" text,
	"youtube_playlist" text,
	"video_tags" text[],
	"create_first_like" boolean DEFAULT false NOT NULL,
	"embeddable" boolean DEFAULT true NOT NULL,
	"notify_subscribers" boolean DEFAULT true NOT NULL,
	"made_for_kids" boolean DEFAULT false NOT NULL,
	"youtube_privacy" text,
	"youtube_comments_enabled" boolean DEFAULT true NOT NULL,
	"linkedin_visibility" text,
	"threads_topic_tag" text,
	"threads_quote_post_id" text,
	"tiktok_privacy_level" text,
	"tiktok_content_disclosure" boolean DEFAULT false NOT NULL,
	"tiktok_brand_organic" boolean DEFAULT false NOT NULL,
	"tiktok_brand_content" boolean DEFAULT false NOT NULL,
	"tiktok_is_aigc" boolean DEFAULT false NOT NULL,
	"tiktok_comments" boolean DEFAULT true NOT NULL,
	"tiktok_duets" boolean DEFAULT true NOT NULL,
	"tiktok_stitches" boolean DEFAULT true NOT NULL,
	"instagram_share_to_feed" boolean DEFAULT true NOT NULL,
	"instagram_comments" boolean DEFAULT true NOT NULL,
	"is_trial_reel" boolean DEFAULT false NOT NULL,
	"alt_text" text,
	"location" text,
	"custom_media_ids" text[],
	"linked_group_id" text,
	"notify_device_ids" text[],
	"pillar_id" text
);
--> statement-breakpoint
CREATE TABLE "post_hashtag" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"hashtag_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_media" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"media_id" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"custom_thumbnail_url" text
);
--> statement-breakpoint
CREATE TABLE "post_product" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"product_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publish_error" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"platform" "platform" NOT NULL,
	"error_code" text NOT NULL,
	"error_raw" text NOT NULL,
	"error_human" text NOT NULL,
	"suggestion" text,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audio_track" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"duration" integer NOT NULL,
	"waveform_data" text,
	"is_featured" boolean DEFAULT false NOT NULL,
	"category" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"folder_id" text,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"duration" integer,
	"url" text NOT NULL,
	"thumbnail_url" text,
	"transcoded_url" text,
	"transcode_status" text,
	"alt_text" text,
	"tags" text[],
	"ai_tags" text[],
	"content_hash" text,
	"source_media_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_folder" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#6B7280' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_media_import" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"source" "stock_media_source" NOT NULL,
	"source_id" text NOT NULL,
	"source_url" text NOT NULL,
	"source_thumb_url" text,
	"imported_to_media_id" text,
	"imported_by_id" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seb_brand_knowledge" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"website_url" text,
	"audience" text,
	"positioning" text,
	"products" text,
	"offers" text,
	"voice_rules" text,
	"banned_topics" text,
	"learned_insights" jsonb,
	"pending_insights" jsonb,
	"website_scan_summary" jsonb,
	"website_scanned_at" timestamp,
	"updated_by_seb_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "seb_brand_knowledge_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "seb_chat_message" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"role" "seb_chat_role" NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seb_chat_session" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text DEFAULT 'Seb chat' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seb_experiment" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"report_id" text,
	"title" text NOT NULL,
	"hypothesis" text NOT NULL,
	"platform" "platform",
	"metric" text NOT NULL,
	"status" "seb_experiment_status" DEFAULT 'PLANNED' NOT NULL,
	"start_at" timestamp,
	"end_at" timestamp,
	"baseline" jsonb,
	"result" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seb_media_analysis" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"media_id" text NOT NULL,
	"media_hash" text,
	"model" text,
	"frame_count" integer DEFAULT 0 NOT NULL,
	"ocr_text" text,
	"transcript" text,
	"scene_summary" text,
	"analysis" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seb_platform_knowledge" (
	"id" text PRIMARY KEY NOT NULL,
	"platform" "platform" NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"source_url" text,
	"effective_at" timestamp,
	"expires_at" timestamp,
	"confidence" integer DEFAULT 80 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seb_recommendation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"social_account_id" text,
	"report_id" text,
	"platform" "platform",
	"category" "seb_recommendation_category" NOT NULL,
	"priority" "seb_recommendation_priority" DEFAULT 'MEDIUM' NOT NULL,
	"status" "seb_recommendation_status" DEFAULT 'NEW' NOT NULL,
	"title" text NOT NULL,
	"advice" text NOT NULL,
	"rationale" text,
	"evidence" jsonb,
	"citations" jsonb,
	"impact_baseline" jsonb,
	"impact_result" jsonb,
	"impact_checked_at" timestamp,
	"confidence" integer DEFAULT 0 NOT NULL,
	"due_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seb_report" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"trigger" "seb_report_trigger" DEFAULT 'PROACTIVE' NOT NULL,
	"status" "seb_report_status" DEFAULT 'COMPLETED' NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"overall_score" integer,
	"score_breakdown" jsonb,
	"confidence" integer DEFAULT 0 NOT NULL,
	"model" text,
	"input_hash" text,
	"data_start_date" timestamp,
	"data_end_date" timestamp,
	"generated_by_id" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"actor_id" text NOT NULL,
	"target_id" text,
	"target_type" text,
	"metadata" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "global_ai_settings" (
	"id" text PRIMARY KEY DEFAULT 'global_ai_settings' NOT NULL,
	"api_key" text,
	"selected_model" text,
	"model_name" text,
	"is_configured" boolean DEFAULT false NOT NULL,
	"seb_enabled" boolean DEFAULT true NOT NULL,
	"seb_proactive_enabled" boolean DEFAULT true NOT NULL,
	"seb_model" text,
	"seb_model_name" text,
	"seb_system_prompt" text,
	"seb_temperature" integer DEFAULT 55 NOT NULL,
	"seb_refresh_cadence" text DEFAULT 'daily' NOT NULL,
	"seb_max_video_frames" integer DEFAULT 20 NOT NULL,
	"seb_max_reports_per_day" integer DEFAULT 3 NOT NULL,
	"seb_max_chats_per_day" integer DEFAULT 30 NOT NULL,
	"seb_max_videos_per_report" integer DEFAULT 10 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "global_integration_settings" (
	"id" text PRIMARY KEY DEFAULT 'global_integration_settings' NOT NULL,
	"stripe_secret_key" text,
	"stripe_publishable_key" text,
	"stripe_webhook_secret" text,
	"stripe_pro_price_id" text,
	"stripe_business_price_id" text,
	"stripe_enterprise_price_id" text,
	"stripe_trial_days" integer DEFAULT 0 NOT NULL,
	"stripe_configured" boolean DEFAULT false NOT NULL,
	"sumopod_api_key" text,
	"sumopod_api_secret" text,
	"sumopod_webhook_secret" text,
	"sumopod_webhook_token" text,
	"sumopod_base" text DEFAULT 'https://api-pay-sandbox.sumopod.com',
	"sumopod_configured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "global_platform_credential" (
	"id" text PRIMARY KEY NOT NULL,
	"platform" "platform" NOT NULL,
	"client_id" text NOT NULL,
	"client_secret" text NOT NULL,
	"webhook_verify_token" text,
	"is_configured" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "global_platform_credential_platform_unique" UNIQUE("platform")
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"type" text NOT NULL,
	"link" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_device" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"label" text NOT NULL,
	"push_subscription_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_device_push_subscription_id_unique" UNIQUE("push_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"post_published" boolean DEFAULT true NOT NULL,
	"post_failed" boolean DEFAULT true NOT NULL,
	"post_ready_to_publish" boolean DEFAULT true NOT NULL,
	"token_expiring" boolean DEFAULT true NOT NULL,
	"weekly_digest" boolean DEFAULT false NOT NULL,
	"new_comment" boolean DEFAULT true NOT NULL,
	"new_dm" boolean DEFAULT true NOT NULL,
	"new_mention" boolean DEFAULT true NOT NULL,
	"new_review" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_config" (
	"tier" text PRIMARY KEY NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"color" text DEFAULT '#6B7280' NOT NULL,
	"price_monthly" integer DEFAULT 0 NOT NULL,
	"pricing_label" text DEFAULT '$0' NOT NULL,
	"pricing_period" text DEFAULT '/mo' NOT NULL,
	"popular" boolean DEFAULT false NOT NULL,
	"cta_text" text DEFAULT 'Get Started' NOT NULL,
	"social_accounts" integer DEFAULT 3 NOT NULL,
	"team_members" integer DEFAULT 2 NOT NULL,
	"scheduled_posts_per_month" integer DEFAULT 30 NOT NULL,
	"ai_generations_per_month" integer DEFAULT 10 NOT NULL,
	"competitor_tracking" integer DEFAULT 0 NOT NULL,
	"analytics_export" boolean DEFAULT false NOT NULL,
	"custom_branding" boolean DEFAULT false NOT NULL,
	"priority_support" boolean DEFAULT false NOT NULL,
	"feature_bullets" text[] DEFAULT '{"Fast setup"}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"id" text PRIMARY KEY DEFAULT 'platform_settings' NOT NULL,
	"registration_enabled" boolean DEFAULT true NOT NULL,
	"maintenance_mode" boolean DEFAULT false NOT NULL,
	"maintenance_message" text,
	"max_organizations_per_user" integer DEFAULT 5 NOT NULL,
	"max_members_per_organization" integer DEFAULT 20 NOT NULL,
	"rate_limit_requests_per_minute" integer DEFAULT 100 NOT NULL,
	"tiktok_discovery_token" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processed_webhook_event" (
	"event_id" text PRIMARY KEY NOT NULL,
	"processed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_listening_item" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"monitor_id" text NOT NULL,
	"social_account_id" text,
	"platform" "platform" NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"external_url" text,
	"author_name" text,
	"author_avatar" text,
	"content" text NOT NULL,
	"media_url" text,
	"sentiment" text DEFAULT 'neutral' NOT NULL,
	"matched_keywords" text[],
	"is_read" boolean DEFAULT false NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_listening_monitor" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"keywords" text[] NOT NULL,
	"excluded_terms" text[] DEFAULT '{}' NOT NULL,
	"platforms" "platform"[] DEFAULT '{}' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_listening_source" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"source_type" text DEFAULT 'auto' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"crawl_depth" integer DEFAULT 0 NOT NULL,
	"last_crawled_at" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "synced_draft" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text,
	"caption" text NOT NULL,
	"media_ids" text[],
	"platform_account_ids" text[],
	"scheduled_at" text,
	"content_hash" text NOT NULL,
	"last_client_saved_at" timestamp,
	"last_saved_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vapid_key_pair" (
	"id" text PRIMARY KEY DEFAULT 'vapid_keys' NOT NULL,
	"public_key" text NOT NULL,
	"private_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'IDR' NOT NULL,
	"description" text,
	"customer_name" text,
	"customer_email" text,
	"customer_phone" text,
	"invoice_number" text NOT NULL,
	"metadata" jsonb,
	"status" "payment_status" DEFAULT 'PENDING' NOT NULL,
	"error_message" text,
	"sumopod_payment_id" text,
	"checkout_url" text,
	"payment_link_url" text,
	"payment_code" text,
	"payment_code_type" text,
	"payment_channel_used" text,
	"fee" integer,
	"net_amount" integer,
	"expires_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"plan_name" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'IDR' NOT NULL,
	"interval" text DEFAULT 'month' NOT NULL,
	"interval_count" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"current_period_start" timestamp NOT NULL,
	"current_period_end" timestamp NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"canceled_at" timestamp,
	"trial_start" timestamp,
	"trial_end" timestamp,
	"sumopod_payment_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_analytics_snapshot" ADD CONSTRAINT "daily_analytics_snapshot_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_analytics" ADD CONSTRAINT "platform_analytics_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_analytics" ADD CONSTRAINT "platform_analytics_social_account_id_social_account_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_analytics" ADD CONSTRAINT "post_analytics_post_id_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_report" ADD CONSTRAINT "scheduled_report_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utm_template" ADD CONSTRAINT "utm_template_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_role" ADD CONSTRAINT "organization_role_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor" ADD CONSTRAINT "competitor_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_post" ADD CONSTRAINT "competitor_post_competitor_id_competitor_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_catalog_id_product_catalog_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."product_catalog"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_catalog" ADD CONSTRAINT "product_catalog_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_tag" ADD CONSTRAINT "product_tag_post_id_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_tag" ADD CONSTRAINT "product_tag_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_connection" ADD CONSTRAINT "shop_connection_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_voice" ADD CONSTRAINT "brand_voice_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_note" ADD CONSTRAINT "calendar_note_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caption_template" ADD CONSTRAINT "caption_template_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_pillar" ADD CONSTRAINT "content_pillar_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_timing_pattern" ADD CONSTRAINT "content_timing_pattern_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_interaction" ADD CONSTRAINT "draft_interaction_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_prediction" ADD CONSTRAINT "engagement_prediction_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hashtag_collection" ADD CONSTRAINT "hashtag_collection_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hashtag_timing_pattern" ADD CONSTRAINT "hashtag_timing_pattern_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation" ADD CONSTRAINT "automation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_social_account_id_social_account_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_post_id_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."post"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_message" ADD CONSTRAINT "direct_message_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_message" ADD CONSTRAINT "direct_message_social_account_id_social_account_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_label" ADD CONSTRAINT "inbox_label_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mention" ADD CONSTRAINT "mention_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mention" ADD CONSTRAINT "mention_social_account_id_social_account_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_social_account_id_social_account_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_response" ADD CONSTRAINT "saved_response_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience_activity" ADD CONSTRAINT "audience_activity_social_account_id_social_account_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pinterest_board_cache" ADD CONSTRAINT "pinterest_board_cache_social_account_id_social_account_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_account" ADD CONSTRAINT "social_account_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_social_account_id_social_account_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_hashtag" ADD CONSTRAINT "post_hashtag_post_id_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_post_id_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_product" ADD CONSTRAINT "post_product_post_id_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_error" ADD CONSTRAINT "publish_error_post_id_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_track" ADD CONSTRAINT "audio_track_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_folder_id_media_folder_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."media_folder"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_folder" ADD CONSTRAINT "media_folder_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_media_import" ADD CONSTRAINT "stock_media_import_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_media_import" ADD CONSTRAINT "stock_media_import_imported_to_media_id_media_id_fk" FOREIGN KEY ("imported_to_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seb_brand_knowledge" ADD CONSTRAINT "seb_brand_knowledge_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seb_chat_message" ADD CONSTRAINT "seb_chat_message_session_id_seb_chat_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."seb_chat_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seb_chat_session" ADD CONSTRAINT "seb_chat_session_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seb_experiment" ADD CONSTRAINT "seb_experiment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seb_experiment" ADD CONSTRAINT "seb_experiment_report_id_seb_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."seb_report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seb_media_analysis" ADD CONSTRAINT "seb_media_analysis_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seb_media_analysis" ADD CONSTRAINT "seb_media_analysis_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seb_recommendation" ADD CONSTRAINT "seb_recommendation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seb_recommendation" ADD CONSTRAINT "seb_recommendation_social_account_id_social_account_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seb_recommendation" ADD CONSTRAINT "seb_recommendation_report_id_seb_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."seb_report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seb_report" ADD CONSTRAINT "seb_report_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_device" ADD CONSTRAINT "notification_device_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_listening_item" ADD CONSTRAINT "social_listening_item_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_listening_item" ADD CONSTRAINT "social_listening_item_monitor_id_social_listening_monitor_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "public"."social_listening_monitor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_listening_monitor" ADD CONSTRAINT "social_listening_monitor_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_listening_source" ADD CONSTRAINT "social_listening_source_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synced_draft" ADD CONSTRAINT "synced_draft_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_snapshot_org_platform_date_unique" ON "daily_analytics_snapshot" USING btree ("organization_id","platform","date");--> statement-breakpoint
CREATE INDEX "daily_snapshot_org_date_idx" ON "daily_analytics_snapshot" USING btree ("organization_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_analytics_account_date_unique" ON "platform_analytics" USING btree ("social_account_id","date");--> statement-breakpoint
CREATE INDEX "platform_analytics_org_date_idx" ON "platform_analytics" USING btree ("organization_id","date");--> statement-breakpoint
CREATE INDEX "platform_analytics_account_date_idx" ON "platform_analytics" USING btree ("social_account_id","date");--> statement-breakpoint
CREATE INDEX "post_analytics_post_idx" ON "post_analytics" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "scheduled_report_org_idx" ON "scheduled_report" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "scheduled_report_next_run_idx" ON "scheduled_report" USING btree ("next_run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "utm_template_org_name_unique" ON "utm_template" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "utm_template_org_idx" ON "utm_template" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invitation_organizationId_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "member_organizationId_idx" ON "member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_userId_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "orgRole_organizationId_idx" ON "organization_role" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "orgRole_role_idx" ON "organization_role" USING btree ("role");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "teamMember_teamId_idx" ON "team_member" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "teamMember_userId_idx" ON "team_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "twoFactor_secret_idx" ON "two_factor" USING btree ("secret");--> statement-breakpoint
CREATE INDEX "twoFactor_userId_idx" ON "two_factor" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "competitor_org_platform_username_unique" ON "competitor" USING btree ("organization_id","platform","username");--> statement-breakpoint
CREATE INDEX "competitor_org_idx" ON "competitor" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "competitor_post_platform_unique" ON "competitor_post" USING btree ("competitor_id","platform_id");--> statement-breakpoint
CREATE INDEX "competitor_post_competitor_idx" ON "competitor_post" USING btree ("competitor_id");--> statement-breakpoint
CREATE INDEX "competitor_post_posted_idx" ON "competitor_post" USING btree ("posted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "product_catalog_external_unique" ON "product" USING btree ("catalog_id","external_id");--> statement-breakpoint
CREATE INDEX "product_tag_post_idx" ON "product_tag" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "product_tag_product_idx" ON "product_tag" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_connection_org_platform_unique" ON "shop_connection" USING btree ("organization_id","platform");--> statement-breakpoint
CREATE INDEX "shop_connection_org_idx" ON "shop_connection" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "calendar_note_org_date_idx" ON "calendar_note" USING btree ("organization_id","date");--> statement-breakpoint
CREATE INDEX "calendar_note_creator_idx" ON "calendar_note" USING btree ("created_by_id");--> statement-breakpoint
CREATE UNIQUE INDEX "caption_template_org_name_unique" ON "caption_template" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "caption_template_org_idx" ON "caption_template" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_pillar_org_name_unique" ON "content_pillar" USING btree ("organization_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "content_timing_pattern_unique" ON "content_timing_pattern" USING btree ("organization_id","platform","content_signature");--> statement-breakpoint
CREATE INDEX "content_timing_pattern_org_idx" ON "content_timing_pattern" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "draft_interaction_org_idx" ON "draft_interaction" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "draft_interaction_action_idx" ON "draft_interaction" USING btree ("action");--> statement-breakpoint
CREATE INDEX "draft_interaction_platform_type_idx" ON "draft_interaction" USING btree ("platform","post_type");--> statement-breakpoint
CREATE UNIQUE INDEX "engagement_prediction_unique" ON "engagement_prediction" USING btree ("organization_id","platform","post_type","day","hour");--> statement-breakpoint
CREATE INDEX "engagement_prediction_org_idx" ON "engagement_prediction" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hashtag_collection_org_name_unique" ON "hashtag_collection" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "hashtag_collection_org_idx" ON "hashtag_collection" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hashtag_timing_pattern_unique" ON "hashtag_timing_pattern" USING btree ("organization_id","platform","hashtag");--> statement-breakpoint
CREATE INDEX "hashtag_timing_pattern_org_idx" ON "hashtag_timing_pattern" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "activity_org_created_idx" ON "activity" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "automation_org_idx" ON "automation" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "comment_social_platform_unique" ON "comment" USING btree ("social_account_id","platform_comment_id");--> statement-breakpoint
CREATE INDEX "comment_org_created_idx" ON "comment" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "comment_org_read_created_idx" ON "comment" USING btree ("organization_id","is_read","created_at");--> statement-breakpoint
CREATE INDEX "comment_social_idx" ON "comment" USING btree ("social_account_id");--> statement-breakpoint
CREATE INDEX "comment_post_idx" ON "comment" USING btree ("post_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dm_social_platform_message_unique" ON "direct_message" USING btree ("social_account_id","platform_message_id");--> statement-breakpoint
CREATE INDEX "dm_org_created_idx" ON "direct_message" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "dm_social_conversation_idx" ON "direct_message" USING btree ("social_account_id","conversation_id");--> statement-breakpoint
CREATE INDEX "dm_conversation_idx" ON "direct_message" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_label_org_name_unique" ON "inbox_label" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "inbox_label_org_idx" ON "inbox_label" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mention_social_post_type_unique" ON "mention" USING btree ("social_account_id","platform_post_id","type");--> statement-breakpoint
CREATE INDEX "mention_org_read_idx" ON "mention" USING btree ("organization_id","is_read");--> statement-breakpoint
CREATE INDEX "mention_org_read_created_idx" ON "mention" USING btree ("organization_id","is_read","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "review_social_platform_unique" ON "review" USING btree ("social_account_id","platform_review_id");--> statement-breakpoint
CREATE INDEX "review_org_created_idx" ON "review" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "review_social_idx" ON "review" USING btree ("social_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_response_org_name_unique" ON "saved_response" USING btree ("organization_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_response_org_shortcut_unique" ON "saved_response" USING btree ("organization_id","shortcut");--> statement-breakpoint
CREATE INDEX "saved_response_org_idx" ON "saved_response" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "pinterest_board_cache_expiry_idx" ON "pinterest_board_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "social_account_org_platform_idx" ON "social_account" USING btree ("organization_id","platform","platform_id");--> statement-breakpoint
CREATE INDEX "social_account_org_idx" ON "social_account" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "social_account_platform_idx" ON "social_account" USING btree ("platform");--> statement-breakpoint
CREATE UNIQUE INDEX "post_org_external_unique" ON "post" USING btree ("organization_id","external_id");--> statement-breakpoint
CREATE INDEX "post_org_status_idx" ON "post" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "post_org_scheduled_idx" ON "post" USING btree ("organization_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "post_org_published_idx" ON "post" USING btree ("organization_id","published_at");--> statement-breakpoint
CREATE INDEX "post_org_status_scheduled_idx" ON "post" USING btree ("organization_id","status","scheduled_at");--> statement-breakpoint
CREATE INDEX "post_linked_group_idx" ON "post" USING btree ("linked_group_id");--> statement-breakpoint
CREATE INDEX "post_social_account_idx" ON "post" USING btree ("social_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "post_hashtag_unique" ON "post_hashtag" USING btree ("post_id","hashtag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "post_media_unique" ON "post_media" USING btree ("post_id","media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "post_product_unique" ON "post_product" USING btree ("post_id","product_id");--> statement-breakpoint
CREATE INDEX "publish_error_post_idx" ON "publish_error" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "audio_track_org_idx" ON "audio_track" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "audio_track_featured_idx" ON "audio_track" USING btree ("is_featured");--> statement-breakpoint
CREATE INDEX "media_org_created_idx" ON "media" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "media_org_hash_idx" ON "media" USING btree ("organization_id","content_hash");--> statement-breakpoint
CREATE INDEX "media_source_idx" ON "media" USING btree ("source_media_id");--> statement-breakpoint
CREATE INDEX "media_folder_idx" ON "media" USING btree ("folder_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_folder_org_name_unique" ON "media_folder" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "media_folder_org_idx" ON "media_folder" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_media_import_org_source_unique" ON "stock_media_import" USING btree ("organization_id","source","source_id");--> statement-breakpoint
CREATE INDEX "stock_media_import_org_idx" ON "stock_media_import" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "seb_chat_message_session_created_idx" ON "seb_chat_message" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "seb_chat_session_org_updated_idx" ON "seb_chat_session" USING btree ("organization_id","updated_at");--> statement-breakpoint
CREATE INDEX "seb_chat_session_user_idx" ON "seb_chat_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "seb_experiment_org_status_idx" ON "seb_experiment" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "seb_experiment_report_idx" ON "seb_experiment" USING btree ("report_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seb_media_analysis_media_hash_unique" ON "seb_media_analysis" USING btree ("media_id","media_hash");--> statement-breakpoint
CREATE INDEX "seb_media_analysis_org_idx" ON "seb_media_analysis" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "seb_platform_knowledge_platform_active_idx" ON "seb_platform_knowledge" USING btree ("platform","is_active");--> statement-breakpoint
CREATE INDEX "seb_recommendation_org_status_idx" ON "seb_recommendation" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "seb_recommendation_org_account_status_idx" ON "seb_recommendation" USING btree ("organization_id","social_account_id","status");--> statement-breakpoint
CREATE INDEX "seb_recommendation_org_platform_idx" ON "seb_recommendation" USING btree ("organization_id","platform");--> statement-breakpoint
CREATE INDEX "seb_recommendation_report_idx" ON "seb_recommendation" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "seb_report_org_created_idx" ON "seb_report" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "seb_report_org_status_idx" ON "seb_report" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_log_target_idx" ON "audit_log" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "audit_log_action_idx" ON "audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "global_platform_credential_platform_idx" ON "global_platform_credential" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "notification_org_read_idx" ON "notification" USING btree ("organization_id","is_read");--> statement-breakpoint
CREATE INDEX "notification_user_read_idx" ON "notification" USING btree ("user_id","is_read");--> statement-breakpoint
CREATE INDEX "notification_created_idx" ON "notification" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notification_device_org_label_unique_idx" ON "notification_device" USING btree ("organization_id","label");--> statement-breakpoint
CREATE INDEX "notification_device_org_idx" ON "notification_device" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "notification_settings_org_user_unique_idx" ON "notification_settings" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "notification_settings_user_idx" ON "notification_settings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "plan_config_tier_idx" ON "plan_config" USING btree ("tier");--> statement-breakpoint
CREATE INDEX "processed_webhook_processed_at_idx" ON "processed_webhook_event" USING btree ("processed_at");--> statement-breakpoint
CREATE INDEX "push_subscription_user_endpoint_unique_idx" ON "push_subscription" USING btree ("user_id","endpoint");--> statement-breakpoint
CREATE INDEX "push_subscription_org_idx" ON "push_subscription" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_listening_item_unique" ON "social_listening_item" USING btree ("monitor_id","source_type","source_id");--> statement-breakpoint
CREATE INDEX "social_listening_item_org_occurred_idx" ON "social_listening_item" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE INDEX "social_listening_item_org_sentiment_idx" ON "social_listening_item" USING btree ("organization_id","sentiment");--> statement-breakpoint
CREATE INDEX "social_listening_item_monitor_occurred_idx" ON "social_listening_item" USING btree ("monitor_id","occurred_at");--> statement-breakpoint
CREATE INDEX "social_listening_monitor_org_active_idx" ON "social_listening_monitor" USING btree ("organization_id","is_active");--> statement-breakpoint
CREATE INDEX "social_listening_source_org_active_idx" ON "social_listening_source" USING btree ("organization_id","is_active");--> statement-breakpoint
CREATE INDEX "synced_draft_org_updated_idx" ON "synced_draft" USING btree ("organization_id","updated_at");--> statement-breakpoint
CREATE INDEX "synced_draft_user_updated_idx" ON "synced_draft" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "payment_org_idx" ON "payment" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "payment_status_idx" ON "payment" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payment_sumopod_id_idx" ON "payment" USING btree ("sumopod_payment_id");--> statement-breakpoint
CREATE INDEX "subscription_org_idx" ON "subscription" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "subscription_status_idx" ON "subscription" USING btree ("status");