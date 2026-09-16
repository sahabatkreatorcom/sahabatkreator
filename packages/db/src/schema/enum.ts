import { pgEnum } from "drizzle-orm/pg-core";

// ---------- Platform social media ----------
export const platformEnum = pgEnum("platform", [
  "instagram",
  "instagram_standalone",
  "facebook",
  "threads",
  "tiktok",
  "youtube",
  "pinterest",
  "linkedin",
  // Halaman company LinkedIn via app terpisah (Community Management API) —
  // app ini tidak punya permission `openid`, jadi profil person tidak tersedia.
  "linkedin_org",
  "bluesky",
  "google_business",
  "manual",
]);

// ---------- Content ----------
export const postStatusEnum = pgEnum("post_status", [
  "draft",
  "scheduled",
  "publishing",
  "published",
  "failed",
  "canceled",
]);

export const mediaTypeEnum = pgEnum("media_type", ["image", "video", "audio"]);

// ---------- Billing ----------
export const planTierEnum = pgEnum("plan_tier", ["free", "pro", "business", "enterprise"]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "inactive",
  "pending",
  "active",
  "failed",
  "expired",
  "canceled",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "completed",
  "failed",
  "expired",
  "refunded",
]);

// ---------- Engagement ----------
export const engagementTypeEnum = pgEnum("engagement_type", ["comment", "mention", "dm", "review"]);

export const engagementStatusEnum = pgEnum("engagement_status", [
  "unread",
  "read",
  "replied",
  "archived",
]);

// ---------- Marketing / Blog ----------
export const blogPostStatusEnum = pgEnum("blog_post_status", [
  "draft",
  "review",
  "scheduled",
  "published",
  "archived",
]);
