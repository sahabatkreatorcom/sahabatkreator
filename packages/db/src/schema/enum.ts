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

// ---------- Carousel render ----------
// RFC docs/rfc-carousel-render.md. Job lifecycle sama pola dengan video_job.
// Style & format (rasio) tidak jadi kolom enum — mereka di dalam settings jsonb
// (CarouselSettings), karena per-request bisa diubah tanpa schema change.
export const carouselJobStatusEnum = pgEnum("carousel_job_status", [
  "queued", // di antrian, belum di-claim worker
  "sourcing", // cari/download background stock ke R2
  "rendering", // sedang di-render di Modal
  "uploading", // output jadi, insert media library
  "done",
  "failed",
  "canceled",
]);

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
