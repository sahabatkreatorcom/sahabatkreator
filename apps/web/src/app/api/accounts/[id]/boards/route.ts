import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";
import { withAuth, json } from "@/lib/api";
import { decryptToken } from "@/lib/token-encryption";
import { PINTEREST_API_BASE } from "@/lib/platforms/pinterest-config";

export const dynamic = "force-dynamic";

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * GET /api/accounts/[id]/boards — list Pinterest boards untuk akun tertentu.
 */
export const GET = withAuth(async (ctx, req: NextRequest, { params }: RouteParams) => {
    const { id } = await params;
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const account = await db.query.socialAccount.findFirst({
        where: eq(schema.socialAccount.id, id),
    });
    if (!account) return json({ error: "Akun tidak ditemukan." }, { status: 404 });
    if (account.organizationId !== activeOrganizationId) return json({ error: "Akses ditolak." }, { status: 403 });
    if (account.platform !== "PINTEREST") return json({ error: "Akun ini bukan Pinterest." }, { status: 400 });

    const accessToken = decryptToken(account.accessToken);

    try {
        const boards: { id: string; name: string; url: string; pinCount: number }[] = [];
        let bookmark: string | undefined;
        let hasMore = true;

        while (hasMore) {
            const url = new URL(`${PINTEREST_API_BASE}/boards`);
            url.searchParams.set("page_size", "100");
            url.searchParams.set("include_secret", "true");
            if (bookmark) url.searchParams.set("bookmark", bookmark);

            const res = await fetch(url.toString(), {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            const data = await res.json();

            if (!res.ok) {
                return json({ error: data.message || "Gagal mengambil boards Pinterest." }, { status: 502 });
            }

            for (const item of data.items ?? []) {
                boards.push({
                    id: item.id,
                    name: item.name,
                    url: item.url,
                    pinCount: item.pin_count ?? 0,
                });
            }

            bookmark = data.bookmark;
            hasMore = !!bookmark && boards.length < 500;
        }

        return json({ boards });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return json({ error: message }, { status: 500 });
    }
});

/**
 * POST /api/accounts/[id]/boards — create Pinterest board.
 */
export const POST = withAuth(async (ctx, req: NextRequest, { params }: RouteParams) => {
    const { id } = await params;
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const account = await db.query.socialAccount.findFirst({
        where: eq(schema.socialAccount.id, id),
    });
    if (!account) return json({ error: "Akun tidak ditemukan." }, { status: 404 });
    if (account.organizationId !== activeOrganizationId) return json({ error: "Akses ditolak." }, { status: 403 });
    if (account.platform !== "PINTEREST") return json({ error: "Akun ini bukan Pinterest." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as { name?: string } | null;
    if (!body?.name?.trim()) return json({ error: "Nama board wajib diisi." }, { status: 400 });

    const accessToken = decryptToken(account.accessToken);

    try {
        const res = await fetch(`${PINTEREST_API_BASE}/boards`, {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ name: body.name.trim() }),
        });
        const data = await res.json();
        if (!res.ok) {
            return json({ error: data.message || "Gagal membuat board." }, { status: 502 });
        }
        return json({
            board: { id: data.id, name: data.name, url: data.url },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return json({ error: message }, { status: 500 });
    }
});
