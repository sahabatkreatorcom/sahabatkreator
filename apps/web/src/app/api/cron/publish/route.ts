import { NextRequest } from "next/server";
import { and, lte, eq } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";
import { json, verifyCronSecret } from "@/lib/api";
import { publishPost } from "@/lib/publishing/publish-post";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/cron/publish — worker terjadwal.
 * Publish semua post berstatus SCHEDULED dengan scheduledAt <= sekarang.
 *
 * Dipanggil oleh cron eksternal (Vercel Cron / GitHub Actions / server) dengan
 * header `Authorization: Bearer <CRON_SECRET>`. Idempoten: post yang sudah
 * PUBLISHING di-skip (anti double-publish antar runner).
 *
 * Flow:
 * 1. Ambil batch post SCHEDULED yang jatuh tempo (max 50).
 * 2. Atomik ubah → PUBLISHING (hanya jika masih SCHEDULED) — penguncian via UPDATE.
 * 3. Publish satu per satu, catat publish_error bila gagal.
 */
export const POST = async (req: NextRequest) => {
    if (!verifyCronSecret(req)) {
        return json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();

    // 1. Ambil batch post yang jatuh tempo
    const due = await db.query.post.findMany({
        where: (t, { and: _and, eq: _eq, lte: _lte, isNotNull }) =>
            _and(_eq(t.status, "SCHEDULED"), isNotNull(t.scheduledAt), _lte(t.scheduledAt, now)),
        columns: { id: true, organizationId: true },
        limit: 50,
    });

    let published = 0;
    let failed = 0;
    const failures: { id: string; error: string }[] = [];

    for (const post of due) {
        // 2. Claim atomik: SCHEDULED → PUBLISHING hanya jika masih SCHEDULED
        const claimed = await db
            .update(schema.post)
            .set({ status: "PUBLISHING" })
            .where(and(eq(schema.post.id, post.id), eq(schema.post.status, "SCHEDULED")))
            .returning({ id: schema.post.id });

        if (claimed.length === 0) continue; // sudah diklaim runner lain

        // 3. Publish
        const result = await publishPost(post.organizationId, post.id);
        if (result.ok) published++;
        else {
            failed++;
            failures.push({ id: post.id, error: result.error || "Publish gagal." });
        }
    }

    return json({ checked: due.length, published, failed, failures });
};