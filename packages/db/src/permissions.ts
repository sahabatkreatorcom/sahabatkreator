// Katalog permission custom role — shared antara server (guard) & web (UI matrix).
// Adaptasi dari reference src/lib/auth/with-permission.ts, disesuaikan domain SK.
//
// Prinsip:
// - Role built-in better-auth (owner/admin/member) punya mapping statis.
// - Custom role disimpan per-org (tabel teamRole) dengan daftar permission.
// - owner selalu punya semua permission (implisit).

export type PermissionCode =
  // Posts
  | "posts.view"
  | "posts.create"
  | "posts.edit"
  | "posts.delete"
  | "posts.publish"
  // Accounts
  | "accounts.view"
  | "accounts.connect"
  | "accounts.disconnect"
  // Analytics
  | "analytics.view"
  | "analytics.export"
  // Media
  | "media.view"
  | "media.upload"
  | "media.delete"
  // Automation
  | "automation.view"
  | "automation.manage"
  // Engagement / Inbox
  | "engagement.view"
  | "engagement.reply"
  | "engagement.moderate"
  // AI / SEB
  | "ai.use"
  | "ai.configure"
  // Team
  | "team.view"
  | "team.invite"
  | "team.remove"
  | "team.roles"
  // Settings
  | "settings.view"
  | "settings.manage"
  // Billing
  | "billing.view"
  | "billing.manage"
  // Collab
  | "collab.view"
  | "collab.manage";

export const PERMISSIONS: { code: PermissionCode; label: string }[] = [
  { code: "posts.view", label: "Lihat post" },
  { code: "posts.create", label: "Buat post" },
  { code: "posts.edit", label: "Edit post" },
  { code: "posts.delete", label: "Hapus post" },
  { code: "posts.publish", label: "Publish / jadwalkan post" },
  { code: "accounts.view", label: "Lihat akun sosial" },
  { code: "accounts.connect", label: "Hubungkan akun" },
  { code: "accounts.disconnect", label: "Putuskan akun" },
  { code: "analytics.view", label: "Lihat analitik" },
  { code: "analytics.export", label: "Ekspor laporan" },
  { code: "media.view", label: "Lihat media library" },
  { code: "media.upload", label: "Unggah media" },
  { code: "media.delete", label: "Hapus media" },
  { code: "automation.view", label: "Lihat otomasi" },
  { code: "automation.manage", label: "Kelola otomasi" },
  { code: "engagement.view", label: "Lihat inbox / engagement" },
  { code: "engagement.reply", label: "Balas komentar & DM" },
  { code: "engagement.moderate", label: "Moderasi komentar" },
  { code: "ai.use", label: "Gunakan AI (caption, SEB)" },
  { code: "ai.configure", label: "Konfigurasi AI" },
  { code: "team.view", label: "Lihat anggota tim" },
  { code: "team.invite", label: "Undang anggota" },
  { code: "team.remove", label: "Keluarkan anggota" },
  { code: "team.roles", label: "Kelola custom role" },
  { code: "settings.view", label: "Lihat pengaturan org" },
  { code: "settings.manage", label: "Ubah pengaturan org" },
  { code: "billing.view", label: "Lihat billing" },
  { code: "billing.manage", label: "Kelola langganan" },
  { code: "collab.view", label: "Lihat undangan collab" },
  { code: "collab.manage", label: "Kelola undangan collab" },
];

export const PERMISSION_CATEGORIES: {
  key: string;
  label: string;
  permissions: PermissionCode[];
}[] = [
  {
    key: "posts",
    label: "Konten",
    permissions: ["posts.view", "posts.create", "posts.edit", "posts.delete", "posts.publish"],
  },
  {
    key: "accounts",
    label: "Akun Sosial",
    permissions: ["accounts.view", "accounts.connect", "accounts.disconnect"],
  },
  {
    key: "analytics",
    label: "Analitik",
    permissions: ["analytics.view", "analytics.export"],
  },
  {
    key: "media",
    label: "Media",
    permissions: ["media.view", "media.upload", "media.delete"],
  },
  {
    key: "automation",
    label: "Otomasi",
    permissions: ["automation.view", "automation.manage"],
  },
  {
    key: "engagement",
    label: "Engagement",
    permissions: ["engagement.view", "engagement.reply", "engagement.moderate"],
  },
  {
    key: "ai",
    label: "AI & SEB",
    permissions: ["ai.use", "ai.configure"],
  },
  {
    key: "team",
    label: "Tim",
    permissions: ["team.view", "team.invite", "team.remove", "team.roles"],
  },
  {
    key: "settings",
    label: "Pengaturan & Billing",
    permissions: ["settings.view", "settings.manage", "billing.view", "billing.manage"],
  },
  {
    key: "collab",
    label: "Kolaborasi",
    permissions: ["collab.view", "collab.manage"],
  },
];

export const ALL_PERMISSION_CODES: PermissionCode[] = PERMISSIONS.map((p) => p.code);

/** Mapping permission role built-in. Owner = semua (implisit). */
export const BUILT_IN_ROLE_PERMISSIONS: Record<"admin" | "member", PermissionCode[]> = {
  admin: ALL_PERMISSION_CODES,
  member: [
    "posts.view",
    "posts.create",
    "posts.edit",
    "posts.delete",
    "posts.publish",
    "accounts.view",
    "analytics.view",
    "media.view",
    "media.upload",
    "automation.view",
    "engagement.view",
    "engagement.reply",
    "ai.use",
    "team.view",
    "collab.view",
  ],
};

export function isPermissionCode(value: string): value is PermissionCode {
  return PERMISSIONS.some((p) => p.code === value);
}
