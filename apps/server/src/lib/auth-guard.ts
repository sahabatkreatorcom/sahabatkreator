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
 * owner → semua permission. admin/member → mapping built-in.
 * Custom role (jika di-assign) menambah permission di atas role built-in (union).
 */
export async function getOrgPermissions(ctx: AuthContextWithOrg): Promise<PermissionCode[]> {
  const role = ctx.organization.role;

  // Owner: semua permission, tanpa query custom role
  if (role === "owner") return ALL_PERMISSION_CODES;

  const builtin =
    role === "admin" ? BUILT_IN_ROLE_PERMISSIONS.admin : BUILT_IN_ROLE_PERMISSIONS.member;

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

  if (!custom) return builtin;

  const merged = new Set<PermissionCode>(builtin);
  for (const p of custom.permissions) {
    if (isPermissionCode(p)) merged.add(p);
  }
  return [...merged];
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

/** Wajib punya permission tertentu di org aktif — 403 jika tidak */
export async function requirePermission(
  c: Context,
  permission: PermissionCode,
): Promise<AuthContextWithOrg> {
  const ctx = await requireOrg(c);
  const permissions = await getOrgPermissions(ctx);
  if (!permissions.includes(permission)) {
    throw new HTTPError(403, "Anda tidak punya izin untuk aksi ini");
  }
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
