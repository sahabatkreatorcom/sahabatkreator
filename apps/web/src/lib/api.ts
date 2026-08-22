import { timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { auth } from "@sahabat-kreator/auth";
import { env } from "@sahabat-kreator/env/server";
import { db, schema } from "@sahabat-kreator/db";
import { eq } from "drizzle-orm";

/**
 * Mendapatkan session + activeOrganizationId untuk route handler server.
 * Mengembalikan null kalau tidak login.
 *
 * Fallback: kalau sesi belum punya activeOrganizationId (mis. baru login),
 * ambil organisasi pertama user sebagai default — sama seperti
 * dashboard/layout.tsx agar semua API route konsisten.
 */
export async function requireAuth() {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });

    if (!session) return null;

    const activeOrganizationId =
        session.session.activeOrganizationId ??
        (await auth.api.listOrganizations({ headers: h })).at(0)?.id ??
        null;

    return {
        session,
        headers: h,
        activeOrganizationId,
    };
}

/**
 * Membungkus route handler dengan proteksi auth. Kalau tidak login → 401.
 */
export function withAuth<TArgs extends unknown[], TReturn extends Response | Promise<Response>>(
    handler: (ctx: NonNullable<Awaited<ReturnType<typeof requireAuth>>>, ...args: TArgs) => TReturn,
) {
    return async (...args: TArgs): Promise<Response> => {
        const ctx = await requireAuth();
        if (!ctx) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401,
                headers: { "Content-Type": "application/json" },
            });
        }
        return (await handler(ctx, ...args)) as Response;
    };
}

/**
 * Mendapatkan session + activeOrganizationId, DITAMBAH wajib role admin.
 * Mengembalikan null kalau tidak login atau bukan admin.
 */
export async function requireAdmin() {
    const ctx = await requireAuth();
    if (!ctx) return null;
    if (ctx.session.user.role !== "admin") return null;
    return ctx;
}

/**
 * Cek apakah user saat ini berperan OWNER/ADMIN di workspace aktif.
 * Dipakai untuk aksi sensitif (billing, hapus workspace, dsb.).
 */
export async function requireOrgOwnerAdmin() {
    const ctx = await requireAuth();
    if (!ctx) return null;
    const organizationId = ctx.activeOrganizationId;
    if (!organizationId) return null;

    const member = await db.query.member.findFirst({
        where: (t, { and: _and, eq: _eq }) =>
            _and(_eq(t.organizationId, organizationId), _eq(t.userId, ctx.session.user.id)),
        columns: { role: true },
    });
    if (!member) return null;
    if (member.role !== "owner" && member.role !== "admin") return null;
    return ctx;
}

export function json(data: unknown, init?: ResponseInit): Response {
    return new Response(JSON.stringify(data), {
        ...init,
        headers: { "Content-Type": "application/json", ...init?.headers },
    });
}

type AuthCtx = NonNullable<Awaited<ReturnType<typeof requireAuth>>>;

/**
 * Wrapper route handler untuk super-admin (session.user.role === "admin").
 * Tidak login / bukan admin → 401.
 */
export function withAdmin<TArgs extends unknown[]>(
    handler: (ctx: NonNullable<Awaited<ReturnType<typeof requireAdmin>>>, ...args: TArgs) => Promise<Response>,
) {
    return async (...args: TArgs): Promise<Response> => {
        const ctx = await requireAdmin();
        if (!ctx) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
        return handler(ctx, ...args);
    };
}

/**
 * Wrapper route handler untuk OWNER/ADMIN workspace aktif.
 * Tidak login / bukan member owner-admin → 403.
 */
export function withOrgOwnerAdmin<TArgs extends unknown[]>(
    handler: (ctx: AuthCtx, ...args: TArgs) => Promise<Response>,
) {
    return async (...args: TArgs): Promise<Response> => {
        const ctx = await requireOrgOwnerAdmin();
        if (!ctx) return new Response(JSON.stringify({ error: "Hanya owner/admin yang dapat mengakses." }), { status: 403, headers: { "Content-Type": "application/json" } });
        return handler(ctx, ...args);
    };
}

/**
 * Verifikasi header `Authorization: Bearer <CRON_SECRET>` untuk panggilan cron.
 *
 * Fail-closed: bila CRON_SECRET tidak dikonfigurasi di server, semua panggilan
 * cron DITOLAK (401). Perbandingan memakai timingSafeEqual (constant-time).
 */
export function verifyCronSecret(req: Request): boolean {
    const expected = env.CRON_SECRET;
    if (!expected) return false;

    const header = req.headers.get("authorization");
    if (!header) return false;

    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) return false;

    const a = Buffer.from(token);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
}