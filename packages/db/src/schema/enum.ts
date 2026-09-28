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

// ---------- Auto-clip (RFC docs/rfc-auto-clip.md) ----------
// Mode job render. Default "single" menjaga job lama apa adanya. "auto_clip"
// = 1 job analisis → N kandidat di video_job_segment → user pilih → fan-out ke
// job render biasa (invariant 1 job = 1 output tetap).
export const videoJobModeEnum = pgEnum("video_job_mode", [
  "single", // 1 base video → 1 output (default, perilaku lama)
  "montage", // base + N clip → 1 output (video_job_clip)
  "auto_clip", // long-form → N kandidat (video_job_segment) → fan-out
]);

// Status kandidat klip (video_job_segment). Job analisis sendiri pakai
// VideoJobStatus (queued→done), baris ini hanya tracking seleksi user.
export const videoJobSegmentStatusEnum = pgEnum("video_job_segment_status", [
  "pending", // baru di-insert dari hasil AI, belum dipilih user
  "selected", // user centang → siap di-fan-out ke render job
  "rendering", // render job anak sudah di-enqueue sedang jalan
  "rendered", // render job anak done, output ada di outputMediaId
  "skipped", // user skip / gagal
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
