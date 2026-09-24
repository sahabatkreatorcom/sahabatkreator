// Schema domain CONTENT — post, media, hashtag, content pillar, template caption
import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { carouselJobStatusEnum, mediaTypeEnum, platformEnum, postStatusEnum } from "./enum";
import { organization } from "./organization";
import { socialAccount } from "./social";

// Grup post multi-platform: satu "compose" bisa publish ke beberapa akun sekaligus.
// Post per-akun merujuk ke post_group ini.
export const postGroup = pgTable(
  "post_group",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Konten dasar (bisa dioverride per platform di post)
    content: text("content").notNull().default(""),
    scheduledAt: timestamp("scheduled_at"),
    // Waktu pengingat push untuk post manual (scheduledAt - minutesBefore).
    // Non-null = reminder aktif (dipakai worker fallback polling & status UI).
    reminderAt: timestamp("reminder_at"),
    timezone: text("timezone").notNull().default("Asia/Jakarta"),
    // Sound/musik terpilih (untuk konten video TikTok/Reels)
    audioTrackId: text("audio_track_id"),
    // creator/updater untuk audit
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("post_group_organizationId_idx").on(table.organizationId),
    index("post_group_scheduledAt_idx").on(table.scheduledAt),
    index("post_group_reminderAt_idx").on(table.reminderAt),
  ],
);

// Post per akun social (anak dari post_group)
export const post = pgTable(
  "post",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    postGroupId: text("post_group_id").references(() => postGroup.id, { onDelete: "cascade" }),
    socialAccountId: text("social_account_id")
      .notNull()
      .references(() => socialAccount.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    status: postStatusEnum("status").notNull().default("draft"),
    // Post eksternal = dipublikasikan langsung di platform (bukan via Sahabat Kreator),
    // diimpor oleh posts-sync agar kalender menampilkan konten lengkap.
    isExternal: boolean("is_external").notNull().default(false),
    externalId: text("external_id"),
    externalUrl: text("external_url"),
    externalThumbnailUrl: text("external_thumbnail_url"),
    syncedAt: timestamp("synced_at"),
    // Konten final untuk platform ini (bisa beda dari post_group)
    content: text("content"),
    // ID konten di platform setelah published (untuk analytics/sync)
    platformPostId: text("platform_post_id"),
    platformPostUrl: text("platform_post_url"),
    publishedAt: timestamp("published_at"),
    // Error publish
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    // Settings khusus per platform (tiktok privacy, youtube category, dll)
    platformSettings: jsonb("platform_settings").$type<Record<string, unknown>>(),
    // Hashtag dan first comment
    hashtags: jsonb("hashtags").$type<string[]>().notNull().default([]),
    firstComment: text("first_comment"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("post_organizationId_idx").on(table.organizationId),
    index("post_postGroupId_idx").on(table.postGroupId),
    index("post_socialAccountId_idx").on(table.socialAccountId),
    index("post_status_idx").on(table.status),
    index("post_publishedAt_idx").on(table.publishedAt),
    // Dedupe post eksternal per org (NULL externalId diabaikan Postgres → post native aman)
    uniqueIndex("post_org_external_uidx").on(table.organizationId, table.externalId),
  ],
);

// Media (file di R2)
export const media = pgTable(
  "media",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: mediaTypeEnum("type").notNull(),
    // Key object di R2
    storageKey: text("storage_key").notNull(),
    url: text("url").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    durationSeconds: integer("duration_seconds"),
    // Hash untuk deteksi duplikat
    contentHash: text("content_hash"),
    altText: text("alt_text"),
    folderId: text("folder_id"),
    // Lineage stock (RFC carousel §4) — attribution untuk caption + filter pool.
    // 'upload' = milik org sendiri; 'stock_pixabay'/'stock_pexels' = dari adapter.
    source: text("source"),
    // Attribution string ("Photo by X on Pixabay") → mengalir ke caption.
    credit: text("credit"),
    uploadedByUserId: text("uploaded_by_user_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("media_organizationId_idx").on(table.organizationId),
    index("media_contentHash_idx").on(table.contentHash),
    index("media_folderId_idx").on(table.folderId),
  ],
);

// Folder media
export const mediaFolder = pgTable(
  "media_folder",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    parentId: text("parent_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("media_folder_organizationId_idx").on(table.organizationId)],
);

// Attachment media ke post
export const postMedia = pgTable(
  "post_media",
  {
    id: text("id").primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
    mediaId: text("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [index("post_media_postId_idx").on(table.postId)],
);

// Content pillar (pilar konten untuk strategi)
export const contentPillar = pgTable(
  "content_pillar",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    color: text("color"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("content_pillar_organizationId_idx").on(table.organizationId)],
);

// Template caption
export const captionTemplate = pgTable(
  "caption_template",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    content: text("content").notNull(),
    // Hashtag bawaan template
    hashtags: text("hashtags").array().notNull().default([]),
    // Kategori template (hook, cta, promo, dll)
    category: text("category"),
    // Jumlah pemakaian (naik saat dipakai di compose)
    usageCount: integer("usage_count").notNull().default(0),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("caption_template_organizationId_idx").on(table.organizationId)],
);

// Catatan kalender (calendar note) — ide/reminder berwarna di grid kalender
export const calendarNote = pgTable(
  "calendar_note",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    date: timestamp("date").notNull(),
    title: text("title").notNull(),
    content: text("content"),
    // Warna hex pilihan user (default pink accent dari UI bila null)
    color: text("color"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("calendar_note_organizationId_date_idx").on(table.organizationId, table.date)],
);

// ---------- Carousel render (RFC docs/rfc-carousel-render.md) ----------
// Layer visual untuk /ai/carousel: outline teks di-render jadi slide gambar.
// Pola yang sama dengan video_job: queue worker + claim atomik + Modal render.

/**
 * Konfigurasi render carousel — poros dari config.py repo referensi, dibuat
 * per-request (bukan konstanta global). Lihat RFC §4.
 */
export type CarouselSettings = {
  style: "outline" | "box" | "box_title_content" | "plain";
  format: "portrait" | "portrait4_5" | "square";
  /** Jumlah slide konten (tidak termasuk cover) — 3-10 */
  slideCount: number;
  /** Opasitas box 0-255, hanya untuk style box & box_title_content */
  boxOpacity: number;
  /** Key font bundle Modal (mis. "Fredoka", "Cinzel") */
  titleFontFamily: string;
  contentFontFamily: string;
  /**
   * Mode background:
   * - library: pilih dari media library sendiri (DEFAULT — konsistensi brand)
   * - stock:   auto-source via StockImageSource (Pixabay/Pexels, fase 1 Pixabay)
   * - solid:   gradient warna solid, tanpa foto
   */
  backgroundMode: "library" | "stock" | "solid";
  /** Keyword pencarian stock (backgroundMode=stock) */
  backgroundQuery: string;
  /**
   * AI Visual Layout Director (fase 2) — opt-in karena berbiaya.
   * Model dipilih worker dari platformSettings (admin config), user hanya
   * toggle enabled. Lihat packages/queue/src/layout-director.ts.
   */
  aiLayout?: { enabled: boolean; model?: string };
};

export const DEFAULT_CAROUSEL_SETTINGS: CarouselSettings = {
  style: "box",
  format: "portrait4_5",
  slideCount: 5,
  boxOpacity: 235,
  titleFontFamily: "Fredoka",
  contentFontFamily: "Fredoka",
  backgroundMode: "library",
  backgroundQuery: "",
};

export const carouselJob = pgTable(
  "carousel_job",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id"),
    topic: text("topic").notNull(),
    caption: text("caption"),
    settings: jsonb("settings").$type<CarouselSettings>().notNull(),
    // Export target — fase 1: instagram saja (RFC §8)
    targetPlatform: platformEnum("target_platform").notNull().default("instagram"),
    status: carouselJobStatusEnum("status").notNull().default("queued"),
    progress: integer("progress").notNull().default(0),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("carousel_job_organizationId_idx").on(table.organizationId)],
);

export const carouselJobSlide = pgTable(
  "carousel_job_slide",
  {
    id: text("id").primaryKey(),
    carouselJobId: text("carousel_job_id")
      .notNull()
      .references(() => carouselJob.id, { onDelete: "cascade" }),
    // 0 = cover/judul utama
    urutan: integer("urutan").notNull(),
    title: text("title").notNull(),
    // null untuk cover (cover hanya judul)
    body: text("body"),
    // media row background (mode library/stock); null = solid/generated
    backgroundMediaId: text("background_media_id"),
    // slide hasil render (media type=image)
    outputMediaId: text("output_media_id"),
    // Attribution stock → mengalir ke caption ("Photo by X on Pixabay")
    stockCredit: text("stock_credit"),
    // Layout AI (fase 2) — cache-nya di Redis, ini simpanan terakhir
    layout: jsonb("layout"),
  },
  (table) => [
    index("carousel_job_slide_carouselJobId_idx").on(table.carouselJobId),
    uniqueIndex("carousel_job_slide_job_urutan_udx").on(table.carouselJobId, table.urutan),
  ],
);

export const postGroupRelations = relations(postGroup, ({ one, many }) => ({
  organization: one(organization, {
    fields: [postGroup.organizationId],
    references: [organization.id],
  }),
  posts: many(post),
}));

export const postRelations = relations(post, ({ one, many }) => ({
  postGroup: one(postGroup, {
    fields: [post.postGroupId],
    references: [postGroup.id],
  }),
  socialAccount: one(socialAccount, {
    fields: [post.socialAccountId],
    references: [socialAccount.id],
  }),
  mediaAttachments: many(postMedia),
}));

export const mediaRelations = relations(media, ({ one, many }) => ({
  organization: one(organization, {
    fields: [media.organizationId],
    references: [organization.id],
  }),
  attachments: many(postMedia),
}));

export const postMediaRelations = relations(postMedia, ({ one }) => ({
  post: one(post, {
    fields: [postMedia.postId],
    references: [post.id],
  }),
  media: one(media, {
    fields: [postMedia.mediaId],
    references: [media.id],
  }),
}));

export const carouselJobRelations = relations(carouselJob, ({ one, many }) => ({
  organization: one(organization, {
    fields: [carouselJob.organizationId],
    references: [organization.id],
  }),
  slides: many(carouselJobSlide),
}));

export const carouselJobSlideRelations = relations(carouselJobSlide, ({ one }) => ({
  carouselJob: one(carouselJob, {
    fields: [carouselJobSlide.carouselJobId],
    references: [carouselJob.id],
  }),
  backgroundMedia: one(media, {
    fields: [carouselJobSlide.backgroundMediaId],
    references: [media.id],
  }),
  outputMedia: one(media, {
    fields: [carouselJobSlide.outputMediaId],
    references: [media.id],
  }),
}));
