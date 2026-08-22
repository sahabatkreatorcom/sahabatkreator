import { NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";
import { json, verifyCronSecret } from "@/lib/api";
import { logActivity } from "@/lib/activity-log";

export const dynamic = "force-dynamic";

const STALE_MINUTES = 5;

/**
 * POST /api/cron/reset-stale-publishing
 * Reset post yang stuck di PUBLISHING > 5 menit ke DRAFT.
 */
export const POST = async (req: NextRequest) => {
    if (!verifyCronSecret(req)) {
        return json({ error: "Unauthorized" }, { status: 401 });
    }

    const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000);

    // Ambil post PUBLISHING yang update-nya > STALE_MINUTES lalu
    const stuck = await db.query.post.findMany({
        where: and(eq(schema.post.status, "PUBLISHING"), sql`${schema.post.updatedAt} < ${cutoff.toISOString()}`),
        with: { socialAccount: { columns: { platform: true } } },
    });

    if (stuck.length === 0) {
        return json({ reset: 0 });
    }

    for (const p of stuck) {
        await db.update(schema.post)
            .set({ status: "DRAFT", updatedAt: new Date() })
            .where(eq(schema.post.id, p.id));
        await logActivity(
            p.organizationId,
            "post.stale_reset",
            { type: "post", id: p.id, name: (p.caption || "").slice(0, 100) },
            { platform: p.socialAccount?.platform, staleMinutes: STALE_MINUTES },
        );
    }

    return json({ reset: stuck.length });
};
