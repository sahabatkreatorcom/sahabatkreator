import { pgEnum } from "drizzle-orm/pg-core";

export const platformEnum = pgEnum("platform", [
  "INSTAGRAM",
  "INSTAGRAM_PAGE",
  "FACEBOOK",
  "TIKTOK",
  "YOUTUBE",
  "PINTEREST",
  "GOOGLE_BUSINESS",
  "LINKEDIN",
  "BLUESKY",
  "THREADS",
  "MANUAL",
]);

export const postTypeEnum = pgEnum("post_type", [
  "FEED",
  "REEL",
  "STORY",
  "CAROUSEL",
  "PIN",
  "VIDEO",
  "ARTICLE",
  "THREAD",
]);
export const postStatusEnum = pgEnum("post_status", [
  "DRAFT",
  "SCHEDULED",
  "PUBLISHING",
  "PUBLISHED",
  "FAILED",
]);
export const orgTierEnum = pgEnum("org_tier", ["FREE", "PRO", "BUSINESS", "ENTERPRISE", "ADMIN"]);
export const memberRoleEnum = pgEnum("member_role", [
  "OWNER",
  "ADMIN",
  "MEMBER",
  "VIEWER",
  "CUSTOM",
]);
export const sebReportTriggerEnum = pgEnum("seb_report_trigger", ["PROACTIVE", "MANUAL", "CHAT"]);
export const sebReportStatusEnum = pgEnum("seb_report_status", [
  "GENERATING",
  "COMPLETED",
  "FAILED",
]);
export const sebRecommendationCategoryEnum = pgEnum("seb_recommendation_category", [
  "CONTENT_STRATEGY",
  "CAPTION",
  "CREATIVE",
  "VIDEO",
  "TIMING",
  "HASHTAG",
  "PLATFORM",
  "COMPETITOR",
  "BRAND",
]);
export const sebRecommendationPriorityEnum = pgEnum("seb_recommendation_priority", [
  "LOW",
  "MEDIUM",
  "HIGH",
]);
export const sebRecommendationStatusEnum = pgEnum("seb_recommendation_status", [
  "NEW",
  "IN_PROGRESS",
  "DONE",
  "DISMISSED",
]);
export const sebChatRoleEnum = pgEnum("seb_chat_role", ["USER", "ASSISTANT", "SYSTEM"]);
export const sebExperimentStatusEnum = pgEnum("seb_experiment_status", [
  "PLANNED",
  "RUNNING",
  "COMPLETED",
  "CANCELLED",
]);
export const draftActionEnum = pgEnum("draft_action", [
  "ACCEPTED",
  "MODIFIED",
  "DISMISSED",
  "EXPIRED",
]);
export const shopSyncStatusEnum = pgEnum("shop_sync_status", [
  "PENDING",
  "SYNCING",
  "SYNCED",
  "FAILED",
]);
export const catalogSourceEnum = pgEnum("catalog_source", ["SHOPIFY", "WOOCOMMERCE", "MANUAL"]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "REFUNDED",
  "CANCELED",
]);
