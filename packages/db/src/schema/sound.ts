// Schema domain SOUND — library audio untuk konten video (TikTok/Reels)
//
// Riset reference app: AudioTrack dengan organizationId nullable (null = featured
// sistem royalty-free), waveformData (tidak pernah diisi reference — di sini diisi
// riil via Web Audio API saat upload), duration (reference hardcoded 30 — di sini
// durasi riil dari decode audio client).
// Normalisasi tambahan: relasi audioTrackId di postGroup (pilihan sound tersimpan
// per compose — reference tidak menyimpan sama sekali).
import { relations } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organization } from "./organization";

/**
 * Track audio — milik org (organizationId) atau featured sistem (null).
 * Waveform: array amplitudo (0-1) ~100 sampel untuk visualisasi player.
 */
export const audioTrack = pgTable(
  "audio_track",
  {
    id: text("id").primaryKey(),
    // null = featured sistem (royalty-free, terlihat semua org)
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    storageKey: text("storage_key"),
    mimeType: text("mime_type").notNull().default("audio/mpeg"),
    sizeBytes: integer("size_bytes"),
    // Durasi riil dalam detik (dari Web Audio API decode saat upload)
    durationSeconds: integer("duration_seconds").notNull().default(0),
    // Array amplitudo 0-1 untuk visualisasi waveform
    waveformData: jsonb("waveform_data").$type<number[]>(),
    isFeatured: boolean("is_featured").notNull().default(false),
    // Kategori bebas: upbeat, chill, dramatic, dll
    category: text("category"),
    uploadedByUserId: text("uploaded_by_user_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("audio_track_organization_idx").on(table.organizationId),
    index("audio_track_featured_idx").on(table.isFeatured),
  ],
);

export const audioTrackRelations = relations(audioTrack, ({ one }) => ({
  organization: one(organization, {
    fields: [audioTrack.organizationId],
    references: [organization.id],
  }),
}));
