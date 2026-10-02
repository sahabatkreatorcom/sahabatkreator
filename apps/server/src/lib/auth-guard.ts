// Middleware & helper autentikasi + resolusi organization aktif untuk API

import { auth } from "@sahabatkreator/auth";
import {
  ALL_PERMISSION_CODES,
  BUILT_IN_ROLE_PERMISSIONS,
  db,
  isPermissionCode,
  type PermissionCode,
} from "@sahabatkreator/db";
import {
  member,
  organization as organizationTable,
  session as sessionTable,
  teamRole,
  teamRoleAssignment,
  user as userTable,
} from "@sahabatkreator/db/schema";
import { and, desc, eq } from "drizzle-orm";
import type { Context } from "hono";
import { ZodError } from "zod";

export class HTTPError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: string | null;
  banned: boolean | null;
  /** Org terakhir dipakai (persisten, diisi server-side). Bisa null. */
  lastActiveOrganizationId: string | null;
};

export type ActiveOrganization = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  /** Role user di org ini: owner | admin | member */
  role: string;
};

export type AuthContext = {
  user: SessionUser;
  sessionId: string;
  /** Org aktif — null jika user belum menjadi member org mana pun */
  organization: ActiveOrganization | null;
};

/**
 * Ambil session + organization aktif.
 * Return null HANYA jika tidak ada session valid / user banned.
 * User tanpa org tetap valid (organization: null) — frontend akan
 * mengarahkan ke /create-organization.
 */
export async function getAuthContext(c: Context): Promise<AuthContext | null> {
  // Konteks dari Public API (/v1): sudah divalidasi oleh verifyApiKey di
  // middleware public-api.ts SEBELUM handler berjalan. Ditaruh paling atas
  // agar request /v1 tidak memicu lookup session cookie yang pasti gagal.
  const apiKeyAuth = c.get("apiKeyAuth");
  if (apiKeyAuth) return apiKeyAuth;

  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return null;

  const user = session.user as unknown as SessionUser;
  if (user.banned) return null;

  let orgId = session.session.activeOrganizationId;

  // Prioritas 2: org terakhir yang dipakai user (persisten di tabel user).
  // WAJIB ada sebelum fallback membership: session row dihapus saat signOut,
  // jadi setelah login baru activeOrganizationId selalu NULL — tanpa kolom
  // ini user terus-terusan kembali ke org terbaru/sepertinya random.
  if (!orgId) {
    orgId = user.lastActiveOrganizationId ?? null;
  }

  // Resolusi org: join member↔organization memvalidasi KEANGGOTAAN sekaligus
  // mengambil data org. Bisa null bila orgId menunjuk org yang sudah tidak
  // dihuni user lagi (dikeluarkan/org dihapus) — di sini kita belum menyerah.
  async function resolveOrg(targetOrgId: string) {
    return db
      .select({
        orgId: organizationTable.id,
        name: organizationTable.name,
        slug: organizationTable.slug,
        logo: organizationTable.logo,
        role: member.role,
      })
      .from(member)
      .innerJoin(organizationTable, eq(member.organizationId, organizationTable.id))
      .where(and(eq(member.userId, user.id), eq(member.organizationId, targetOrgId)))
      .limit(1);
  }

  let row = orgId ? ((await resolveOrg(orgId))[0] ?? null) : null;

  // Prioritas 3 (fallback terakhir): org tempat user menjadi member paling
  // baru di-join/dibuat. WAJIB ORDER BY createdAt DESC — tanpa ini Postgres
  // kembalikan baris dalam urutan heap (≈ urutan insert) sehingga login baru
  // selalu masuk ke org pertama.
  if (!row) {
    const [firstMembership] = await db
      .select({ organizationId: member.organizationId })
      .from(member)
      .where(eq(member.userId, user.id))
      .orderBy(desc(member.createdAt))
      .limit(1);
    row = firstMembership ? ((await resolveOrg(firstMembership.organizationId))[0] ?? null) : null;
  }

  if (!row) {
    return { user, sessionId: session.session.id, organization: null };
  }

  // Persist org aktif ke user.lastActiveOrganizationId (hanya jika berbeda).
  // Ini yang membuat org "diingat" setelah logout → login baru. Fire-and-forget:
  // kegagalan tulis tidak boleh memblokir request (org tetap aktif di session).
  if (row.orgId !== user.lastActiveOrganizationId) {
    void db
      .update(userTable)
      .set({ lastActiveOrganizationId: row.orgId })
      .where(eq(userTable.id, user.id))
      .catch(() => {
        // best-effort; request tetap jalan dengan org yang sudah diresolusi
      });
  }

  // Sinkronkan org aktif ke SESSION juga — bukan hanya ke kolom user di atas.
  //
  // Endpoint milik better-auth (organization.list-members / list-invitations /
  // invite-member / remove-member) TIDAK memakai resolusi di fungsi ini; mereka
  // membaca session.activeOrganizationId langsung. Baris session dibuat ulang
  // setiap login sehingga kolom itu NULL, dan endpoint tersebut membalas
  // 400 "No active organization" — halaman Tim tampak kosong dan undangan
  // gagal tanpa jejak meski /me sudah melaporkan org aktif.
  //
  // Sengaja di-await (bukan fire-and-forget): request BERIKUTNYA dari client
  // bergantung pada nilai ini, jadi menulis "nanti" berisiko balapan.
  if (session.session.activeOrganizationId !== row.orgId) {
    await db
      .update(sessionTable)
      .set({ activeOrganizationId: row.orgId })
      .where(eq(sessionTable.id, session.session.id))
      .catch(() => {
        // best-effort; org aktif tetap benar untuk request ini
      });
  }

  return {
    user,
    sessionId: session.session.id,
    organization: {
      id: row.orgId,
      name: row.name,
      slug: row.slug,
      logo: row.logo,
      role: row.role,
    },
  };
}

/** Wajib login — 401 jika tidak */
export async function requireSession(c: Context): Promise<AuthContext> {
  const ctx = await getAuthContext(c);
  if (!ctx) throw new HTTPError(401, "Autentikasi diperlukan");
  return ctx;
}

/** Context dengan org aktif yang pasti ada (hasil requireOrg/requireOrgAdmin) */
export type AuthContextWithOrg = AuthContext & {
  organization: NonNullable<AuthContext["organization"]>;
};

/** Wajib punya organization aktif (login + member org) */
export async function requireOrg(c: Context): Promise<AuthContextWithOrg> {
  const ctx = await requireSession(c);
  if (!ctx.organization) {
    throw new HTTPError(400, "Belum ada organisasi. Buat organisasi terlebih dahulu.");
  }
  return { ...ctx, organization: ctx.organization };
}

/** Wajib role owner/admin di org aktif — 403 jika tidak */
export async function requireOrgAdmin(c: Context): Promise<AuthContextWithOrg> {
  const ctx = await requireOrg(c);
  if (ctx.organization.role !== "owner" && ctx.organization.role !== "admin") {
    throw new HTTPError(403, "Hanya owner/admin organization yang diizinkan");
  }
  return ctx;
}

/** Wajib admin platform (superadmin) — 403 jika tidak */
export async function requirePlatformAdmin(c: Context): Promise<AuthContext> {
  const ctx = await requireSession(c);
  if (ctx.user.role !== "admin") {
    throw new HTTPError(403, "Hanya admin platform yang diizinkan");
  }
  return ctx;
}

/**
 * Resolusi effective permission user di org aktif.
 *
 * - `owner` → SELALU semua permission; tidak bisa dibatasi (escape hatch agar
 *   organisasi tidak pernah terkunci dari pengelolaannya sendiri).
 * - Custom role yang di-assign → **MENGGANTIKAN** mapping built-in: yang
 *   berlaku hanya daftar permission role itu. Jadi role bisa MEMBATASI, bukan
 *   cuma menambah.
 * - Tanpa custom role → mapping built-in (admin = semua, member = daftar tetap).
 *
 * Konsekuensi yang disengaja: memberi custom role terbatas kepada `admin` ikut
 * memangkas admin tersebut. Kalau salah pasang, owner masih bisa memperbaiki.
 */
export async function getOrgPermissions(ctx: AuthContextWithOrg): Promise<PermissionCode[]> {
  const role = ctx.organization.role;

  // Owner: semua permission, tanpa query custom role
  if (role === "owner") return ALL_PERMISSION_CODES;

  // Custom role member ini (satu member maksimal satu custom role)
  const [custom] = await db
    .select({ permissions: teamRole.permissions })
    .from(teamRoleAssignment)
    .innerJoin(teamRole, eq(teamRoleAssignment.roleId, teamRole.id))
    .where(
      and(
        eq(teamRoleAssignment.organizationId, ctx.organization.id),
        eq(teamRoleAssignment.memberId, await getMemberId(ctx)),
      ),
    )
    .limit(1);

  // Custom role menggantikan built-in — BUKAN union. Union membuat role hanya
  // bisa menambah sehingga batasannya tidak pernah terasa (dulu ini bug).
  if (custom) return custom.permissions.filter(isPermissionCode);

  return role === "admin" ? BUILT_IN_ROLE_PERMISSIONS.admin : BUILT_IN_ROLE_PERMISSIONS.member;
}

/** ID baris member user di org aktif (dipakai join teamRoleAssignment) */
async function getMemberId(ctx: AuthContextWithOrg): Promise<string> {
  const [row] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.userId, ctx.user.id), eq(member.organizationId, ctx.organization.id)))
    .limit(1);
  if (!row) throw new HTTPError(403, "Bukan anggota organisasi ini");
  return row.id;
}

/**
 * Pastikan ctx (yang org-nya sudah ter-resolve) punya permission — 403 jika tidak.
 * Dipakai untuk cek permission BERSYARAT di tengah handler, mis. endpoint create
 * yang butuh `posts.publish` tambahan hanya ketika body-nya menjadwalkan post.
 */
export async function assertPermission(
  ctx: AuthContextWithOrg,
  permission: PermissionCode,
): Promise<void> {
  const permissions = await getOrgPermissions(ctx);
  if (!permissions.includes(permission)) {
    throw new HTTPError(403, "Anda tidak punya izin untuk aksi ini");
  }
}

/** Wajib punya permission tertentu di org aktif — 403 jika tidak */
export async function requirePermission(
  c: Context,
  permission: PermissionCode,
): Promise<AuthContextWithOrg> {
  const ctx = await requireOrg(c);
  await assertPermission(ctx, permission);
  return ctx;
}

/** Error response standar untuk route hono */
export function errorResponse(error: unknown): Response {
  if (error instanceof HTTPError) {
    return Response.json({ message: error.message }, { status: error.status });
  }
  // Zod validation error → 400 dengan pesan field pertama
  if (error instanceof ZodError) {
    const first = error.issues[0];
    return Response.json(
      {
        message: first ? `${first.path.join(".")}: ${first.message}` : "Data tidak valid",
      },
      { status: 400 },
    );
  }
  console.error("[api] unexpected error:", error);
  return Response.json({ message: "Terjadi kesalahan internal" }, { status: 500 });
}
