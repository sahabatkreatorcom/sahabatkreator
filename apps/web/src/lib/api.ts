import { headers } from "next/headers";
import { auth } from "@sahabat-kreator/auth";

/**
 * Mendapatkan session + activeOrganizationId untuk route handler server.
 * Mengembalikan null kalau tidak login.
 */
export async function requireAuth() {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });

    if (!session) return null;

    const activeOrganizationId = session.session.activeOrganizationId;

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

export function json(data: unknown, init?: ResponseInit): Response {
    return new Response(JSON.stringify(data), {
        ...init,
        headers: { "Content-Type": "application/json", ...init?.headers },
    });
}