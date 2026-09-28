// Schema domain API ACCESS — tracking pengajian review app & snapshot kuota API per platform
// Mendukung playbook pengajuan akses API (docs/social-platforms/app-review-playbook.md)
import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Status pengajuan review:
 * not_started → preparing → submitted → in_review → approved | rejected | withdrawn
 */
export type AppReviewStatus =
  | "not_started"
  | "preparing"
  | "submitted"
  | "in_review"
  | "approved"
  | "rejected"
  | "withdrawn";

export interface AppReviewStatusEntry {
  status: AppReviewStatus;
  at: string; // ISO datetime
  note?: string;
}

/**
 * Checklist aset pengajuan (dari playbook):
 * privacy_policy, terms_of_service, data_deletion, screencast,
 * business_verification, demo_credentials, legal_docs
 */
export type AppReviewChecklistKey =
  | "privacy_policy"
  | "terms_of_service"
  | "data_deletion"
  | "screencast"
  | "business_verification"
  | "demo_credentials"
  | "legal_docs";

// Tracking pengajuan review API per platform + per permission scope.
// Meta review itu per permission (bukan per app) → permissionScope penting
// agar satu submission tidak mencampur banyak permission (penyebab penolakan umum).
export const appReviewTracking = pgTable(
  "app_review_tracking",
  {
    id: text("id").primaryKey(),
    // Platform tujuan (instagram, facebook, threads, tiktok, youtube, linkedin,
    // pinterest, google_business, bluesky) — text agar fleksibel, validasi di route
    platform: text("platform").notNull(),
    // ID submission di dashboard platform (mis. Meta App Review submission ID)
    submissionId: text("submission_id"),
    // Permission yang diminta (mis. instagram_content_publish, pages_manage_posts).
    // Kosong = submission level-app (TikTok, YouTube audit, dst.)
    permissionScope: text("permission_scope"),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").$type<AppReviewStatus>().notNull().default("not_started"),
    dashboardUrl: text("dashboard_url"),
    submittedAt: timestamp("submitted_at"),
    resolvedAt: timestamp("resolved_at"),
    // Deadline review / follow-up (playbook: buffer 3–6 minggu per pipeline)
    deadlineAt: timestamp("deadline_at"),
    rejectionReason: text("rejection_reason"),
    // Checklist aset: { privacy_policy: true, screencast: false, ... }
    checklist: jsonb("checklist").$type<Partial<Record<AppReviewChecklistKey, boolean>>>(),
    notes: jsonb("notes").$type<Record<string, unknown>>(),
    // Riwayat perpindahan status (audit trail)
    statusHistory: jsonb("status_history").$type<AppReviewStatusEntry[]>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("app_review_platform_idx").on(table.platform),
    index("app_review_status_idx").on(table.status),
    index("app_review_deadline_idx").on(table.deadlineAt),
  ],
);

// Snapshot kuota rate-limit API per entity (app/page/akun) per hari.
// Sumber data riil: response header rate-limit platform saat publish/sync
// (mis. Meta X-Business-Use-Case-Usage) — diisi worker, bukan input manual.
export const apiQuotaSnapshot = pgTable(
  "api_quota_snapshot",
  {
    id: text("id").primaryKey(),
    platform: text("platform").notNull(),
    // Entity yang punya kuota: app ID, page ID, atau social account ID
    entityId: text("entity_id").notNull(),
    // Jenis kuota (mis. meta_buc, instagram_publish, tiktok_content_post)
    quotaType: text("quota_type").notNull(),
    remaining: integer("remaining").notNull().default(0),
    total: integer("total").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    syncedAt: timestamp("synced_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // Unique: re-sync hari yang sama = upsert (idempotent), bukan baris baru
    uniqueIndex("api_quota_entity_type_date_uidx").on(table.entityId, table.quotaType, table.date),
    index("api_quota_platform_date_idx").on(table.platform, table.date),
    index("api_quota_entity_idx").on(table.entityId),
  ],
);

// Audit log permintaan penghapusan data end-user dari platform (Meta/IG/Threads
// data deletion callback — syarat wajib App Review). Satu baris per request
// beserta confirmation code yang dikembalikan ke platform.
export const platformDataDeletion = pgTable(
  "platform_data_deletion",
  {
    id: text("id").primaryKey(),
    // Aplikasi pengirim callback: meta | instagram_standalone | threads
    app: text("app").notNull(),
    // Platform asal user (instagram, facebook, threads, instagram_standalone)
    platform: text("platform").notNull(),
    // user_id dari signed_request payload platform
    platformUserId: text("platform_user_id").notNull(),
    // Confirmation code untuk status URL (dikirim balik ke platform)
    confirmationCode: text("confirmation_code").notNull(),
    // deleted = data sudah dihapus; not_found = user_id tidak punya data di DB
    status: text("status").$type<"deleted" | "not_found">().notNull(),
    // Jumlah baris engagement/DM yang dihapus (bukti kepatuhan)
    deletedItems: integer("deleted_items").notNull().default(0),
    requestedAt: timestamp("requested_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    uniqueIndex("platform_data_deletion_code_uidx").on(table.confirmationCode),
    index("platform_data_deletion_user_idx").on(table.app, table.platformUserId),
  ],
);
