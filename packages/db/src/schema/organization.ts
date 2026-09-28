// Schema domain ORGANIZATION — digenerate dari better-auth CLI (@better-auth/cli generate)
// JANGAN edit manual. Regenerate via: bunx @better-auth/cli generate --config better-auth.config.ts
// Catatan: tabel activity_log di bawah adalah tabel app-domain (bukan hasil generate)
// dan aman tetap ada saat regenerate — better-auth tidak menghapus tabel tambahan.
import { relations } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const organization = pgTable(
  "organization",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    logo: text("logo"),
    createdAt: timestamp("created_at").notNull(),
    metadata: text("metadata"),
  },
  (table) => [uniqueIndex("organization_slug_uidx").on(table.slug)],
);

export const member = pgTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").default("member").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("member_organizationId_idx").on(table.organizationId),
    index("member_userId_idx").on(table.userId),
  ],
);

export const invitation = pgTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    status: text("status").default("pending").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("invitation_organizationId_idx").on(table.organizationId),
    index("invitation_email_idx").on(table.email),
  ],
);

// Activity log org — audit trail aktivitas penting user dalam organisasi
// (post dibuat, akun terhubung, plan berubah, anggota tim, impersonation, dll).
// Dibedakan dari audit_log (domain admin) yang fokus pada aksi platform-admin.
export const activityLog = pgTable(
  "activity_log",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    // Nama aksi format dot: post.created, account.connected, plan.changed, dst.
    action: text("action").notNull(),
    // Tipe entity terdampak (mis. "post", "social_account", "subscription", "member")
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("activity_log_organizationId_idx").on(table.organizationId),
    index("activity_log_createdAt_idx").on(table.createdAt),
    index("activity_log_action_idx").on(table.action),
    index("activity_log_userId_idx").on(table.userId),
  ],
);

// Custom role tim — permission granular per organisasi.
// Tabel app-domain (bukan hasil generate better-auth CLI) — aman saat regenerate.
// Tidak menyentuh tabel member: assignment via teamRoleAssignment.
export const teamRole = pgTable(
  "team_role",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    // Warna badge hex, mis. "#8b5cf6"
    color: text("color").notNull().default("#6366f1"),
    // Daftar kode permission (subset dari katalog di permissions.ts)
    permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("team_role_organizationId_idx").on(table.organizationId),
    uniqueIndex("team_role_org_name_uidx").on(table.organizationId, table.name),
  ],
);

// Assignment custom role ke member org (member tetap role built-in better-auth;
// custom role adalah LAPISAN TAMBAHAN di atasnya — effective permission =
// union permission role built-in + custom role).
export const teamRoleAssignment = pgTable(
  "team_role_assignment",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    roleId: text("role_id")
      .notNull()
      .references(() => teamRole.id, { onDelete: "cascade" }),
    assignedByUserId: text("assigned_by_user_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("team_role_assignment_organizationId_idx").on(table.organizationId),
    index("team_role_assignment_memberId_idx").on(table.memberId),
    index("team_role_assignment_roleId_idx").on(table.roleId),
    // Satu member hanya boleh satu custom role per org
    uniqueIndex("team_role_assignment_member_uidx").on(table.memberId),
  ],
);

export const activityLogRelations = relations(activityLog, ({ one }) => ({
  organization: one(organization, {
    fields: [activityLog.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [activityLog.userId],
    references: [user.id],
  }),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
  members: many(member),
  invitations: many(invitation),
  activityLogs: many(activityLog),
  teamRoles: many(teamRole),
}));

export const teamRoleRelations = relations(teamRole, ({ one, many }) => ({
  organization: one(organization, {
    fields: [teamRole.organizationId],
    references: [organization.id],
  }),
  assignments: many(teamRoleAssignment),
}));

export const teamRoleAssignmentRelations = relations(teamRoleAssignment, ({ one }) => ({
  organization: one(organization, {
    fields: [teamRoleAssignment.organizationId],
    references: [organization.id],
  }),
  member: one(member, {
    fields: [teamRoleAssignment.memberId],
    references: [member.id],
  }),
  role: one(teamRole, {
    fields: [teamRoleAssignment.roleId],
    references: [teamRole.id],
  }),
}));

export const memberRelations = relations(member, ({ one }) => ({
  organization: one(organization, {
    fields: [member.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [member.userId],
    references: [user.id],
  }),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
  organization: one(organization, {
    fields: [invitation.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [invitation.inviterId],
    references: [user.id],
  }),
}));
