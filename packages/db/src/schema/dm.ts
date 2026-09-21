// Schema domain DM — percakapan direct message (Instagram/Facebook Messenger Platform)
//
// Normalisasi dari reference app: reference pakai conversationId string + groupBy 3 query
// per request list. Di sini conversation jadi tabel terpisah dengan field ter-materialisasi
// (lastMessageAt/Preview/Direction, unreadCount) sehingga list inbox = satu SELECT.
import { relations } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organization } from "./organization";
import { socialAccount } from "./social";

// Percakapan DM — satu baris per pasangan (akun, partner)
export const dmConversation = pgTable(
  "dm_conversation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    socialAccountId: text("social_account_id")
      .notNull()
      .references(() => socialAccount.id, { onDelete: "cascade" }),
    // ID percakapan di platform (IG/FB thread id) — untuk upsert sync
    platformConversationId: text("platform_conversation_id").notNull(),
    // Info partner percakapan (pengirim pesan masuk)
    partnerId: text("partner_id").notNull(),
    partnerUsername: text("partner_username"),
    partnerName: text("partner_name"),
    partnerAvatarUrl: text("partner_avatar_url"),
    // Materialized untuk list inbox cepat (tanpa groupBy)
    lastMessageAt: timestamp("last_message_at").notNull().defaultNow(),
    lastMessagePreview: text("last_message_preview"),
    lastMessageDirection: text("last_message_direction").notNull().default("inbound"),
    unreadCount: integer("unread_count").notNull().default(0),
    // Assignment ke member tim (id user internal)
    assignedMemberId: text("assigned_member_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("dm_conversation_account_platform_uidx").on(
      table.socialAccountId,
      table.platformConversationId,
    ),
    index("dm_conversation_organization_lastMessage_idx").on(
      table.organizationId,
      table.lastMessageAt,
    ),
    index("dm_conversation_unread_idx").on(table.organizationId, table.unreadCount),
    index("dm_conversation_assigned_idx").on(table.assignedMemberId),
  ],
);

// Pesan DM — thread per percakapan
export const dmMessage = pgTable(
  "dm_message",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    socialAccountId: text("social_account_id")
      .notNull()
      .references(() => socialAccount.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => dmConversation.id, { onDelete: "cascade" }),
    // ID pesan di platform — kunci idempotensi sync (webhook + polling aman bentrok)
    platformMessageId: text("platform_message_id").notNull(),
    // inbound = dari partner, outbound = balasan kita
    direction: text("direction").$type<"inbound" | "outbound">().notNull(),
    senderId: text("sender_id"),
    senderUsername: text("sender_username"),
    text: text("text"),
    mediaUrl: text("media_url"),
    // image | video | audio | sticker | file
    mediaType: text("media_type"),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
    syncedAt: timestamp("synced_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("dm_message_account_platform_uidx").on(
      table.socialAccountId,
      table.platformMessageId,
    ),
    index("dm_message_conversation_time_idx").on(table.conversationId, table.occurredAt),
  ],
);

export const dmConversationRelations = relations(dmConversation, ({ one, many }) => ({
  organization: one(organization, {
    fields: [dmConversation.organizationId],
    references: [organization.id],
  }),
  socialAccount: one(socialAccount, {
    fields: [dmConversation.socialAccountId],
    references: [socialAccount.id],
  }),
  messages: many(dmMessage),
}));

export const dmMessageRelations = relations(dmMessage, ({ one }) => ({
  conversation: one(dmConversation, {
    fields: [dmMessage.conversationId],
    references: [dmConversation.id],
  }),
  socialAccount: one(socialAccount, {
    fields: [dmMessage.socialAccountId],
    references: [socialAccount.id],
  }),
}));
