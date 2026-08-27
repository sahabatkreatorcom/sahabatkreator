import { db, schema } from "@sahabat-kreator/db";
import { eq } from "drizzle-orm";
import { withAdmin, json } from "@/lib/api";

export const dynamic = "force-dynamic";

const SETTINGS_ID = "global_integration_settings";

/**
 * GET /api/admin/platforms
 * Ambil pengaturan platform (Repliz OAuth toggle, dll).
 */
export const GET = withAdmin(async () => {
    const settings = await db.query.globalIntegrationSettings.findFirst({
        where: (t, { eq: _eq }) => _eq(t.id, SETTINGS_ID),
        columns: {
            replizOauthEnabled: true,
            updatedAt: true,
        },
    });

    return json({
        replizOauthEnabled: settings?.replizOauthEnabled ?? false,
        updatedAt: settings?.updatedAt?.toISOString() ?? null,
    });
});

/**
 * PUT /api/admin/platforms
 * Simpan pengaturan platform.
 */
export const PUT = withAdmin(async (ctx, req: Request) => {
    const body = (await req.json().catch(() => null)) as {
        replizOauthEnabled?: boolean;
    } | null;

    if (!body) return json({ error: "Body kosong." }, { status: 400 });

    const existing = await db.query.globalIntegrationSettings.findFirst({
        where: (t, { eq: _eq }) => _eq(t.id, SETTINGS_ID),
        columns: { id: true },
    });

    if (existing) {
        await db
            .update(schema.globalIntegrationSettings)
            .set({
                replizOauthEnabled: body.replizOauthEnabled ?? false,
            })
            .where(eq(schema.globalIntegrationSettings.id, SETTINGS_ID));
    } else {
        await db.insert(schema.globalIntegrationSettings).values({
            id: SETTINGS_ID,
            replizOauthEnabled: body.replizOauthEnabled ?? false,
        });
    }

    return json({ success: true });
});
