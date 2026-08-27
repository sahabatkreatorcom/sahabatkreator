import { db, schema } from "@sahabat-kreator/db";
import { eq } from "drizzle-orm";
import { withAdmin, json } from "@/lib/api";

export const dynamic = "force-dynamic";

const SETTINGS_ID = "global_integration_settings";

/**
 * GET /api/admin/platforms
 * Ambil pengaturan Repliz per-platform.
 */
export const GET = withAdmin(async () => {
    const settings = await db.query.globalIntegrationSettings.findFirst({
        where: (t, { eq: _eq }) => _eq(t.id, SETTINGS_ID),
        columns: {
            replizPlatforms: true,
            updatedAt: true,
        },
    });

    return json({
        replizPlatforms: (settings?.replizPlatforms as string[]) ?? [],
        updatedAt: settings?.updatedAt?.toISOString() ?? null,
    });
});

/**
 * PUT /api/admin/platforms
 * Simpan pengaturan Repliz per-platform.
 * Body: { replizPlatforms: ["FACEBOOK", "YOUTUBE", ...] }
 */
export const PUT = withAdmin(async (ctx, req: Request) => {
    const body = (await req.json().catch(() => null)) as {
        replizPlatforms?: string[];
    } | null;

    if (!body || !Array.isArray(body.replizPlatforms)) {
        return json({ error: "replizPlatforms harus array." }, { status: 400 });
    }

    const existing = await db.query.globalIntegrationSettings.findFirst({
        where: (t, { eq: _eq }) => _eq(t.id, SETTINGS_ID),
        columns: { id: true },
    });

    if (existing) {
        await db
            .update(schema.globalIntegrationSettings)
            .set({ replizPlatforms: body.replizPlatforms })
            .where(eq(schema.globalIntegrationSettings.id, SETTINGS_ID));
    } else {
        await db.insert(schema.globalIntegrationSettings).values({
            id: SETTINGS_ID,
            replizPlatforms: body.replizPlatforms,
        });
    }

    return json({ success: true });
});
