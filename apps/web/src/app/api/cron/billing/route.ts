import { NextRequest } from "next/server";
import { and, eq, lt, isNotNull } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";
import { json, verifyCronSecret } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/cron/billing — turunkan tier org yang langganannya sudah berakhir.
 *
 * Org dengan `subscriptionStatus = 'active'` dan `currentPeriodEnd < now`
 * diturunkan ke FREE + subscriptionStatus dihapus. Dipanggil oleh cron eksternal
 * (Bearers CRON_SECRET) — mis. setiap jam.
 */
export const POST = async (req: NextRequest) => {
    if (!verifyCronSecret(req)) {
        return json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const expired = await db.query.organization.findMany({
        where: (t, { and: _and, eq: _eq, lt: _lt, isNotNull: _nn }) =>
            _and(_eq(t.subscriptionStatus, "active"), _nn(t.currentPeriodEnd), _lt(t.currentPeriodEnd, now)),
        columns: { id: true, tier: true },
        limit: 200,
    });

    let downgraded = 0;
    for (const org of expired) {
        if (org.tier === "FREE") continue;
        await db
            .update(schema.organization)
            .set({ tier: "FREE", subscriptionStatus: null, maxMembers: 5 })
            .where(eq(schema.organization.id, org.id));
        downgraded++;
    }

    return json({ checked: expired.length, downgraded });
};
