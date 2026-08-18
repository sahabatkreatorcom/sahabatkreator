import { db, schema } from "@sahabat-kreator/db";
import { eq } from "drizzle-orm";
import { withAdmin, json } from "@/lib/api";
import { encryptToken } from "@/lib/token-encryption";

export const dynamic = "force-dynamic";

const SETTINGS_ID = "global_integration_settings";

/**
 * GET /api/admin/sumo-pod
 * Konfigurasi SumoPod Pay dari `global_integration_settings`. Semua secret
 * dimasking — nilai asli tidak pernah dikembalikan ke client.
 */
export const GET = withAdmin(async () => {
    const settings = await db.query.globalIntegrationSettings.findFirst({
        where: (t, { eq: _eq }) => _eq(t.id, SETTINGS_ID),
        columns: {
            sumopodApiKey: true,
            sumopodApiSecret: true,
            sumopodWebhookSecret: true,
            sumopodWebhookToken: true,
            sumopodBase: true,
            sumopodConfigured: true,
            sumopodTrialDays: true,
            updatedAt: true,
        },
    });

    return json({
        sumopodConfigured: !!settings?.sumopodConfigured,
        sumopodApiKeySet: !!settings?.sumopodApiKey,
        sumopodApiSecretSet: !!settings?.sumopodApiSecret,
        sumopodWebhookSecretSet: !!settings?.sumopodWebhookSecret,
        sumopodWebhookTokenSet: !!settings?.sumopodWebhookToken,
        sumopodBase: settings?.sumopodBase ?? "https://api-pay-sandbox.sumopod.com",
        sumopodTrialDays: settings?.sumopodTrialDays ?? 0,
        updatedAt: settings?.updatedAt?.toISOString() ?? null,
    });
});

/**
 * PUT /api/admin/sumo-pod
 * Simpan konfigurasi SumoPod Pay. Field secret kosong dipertahankan (tidak
 * menimpa nilai lama). Kirim `enabled` untuk mengaktifkan/nonaktifkan gateway.
 */
export const PUT = withAdmin(async (ctx, req: Request) => {
    let body: {
        apiKey?: string;
        apiSecret?: string;
        webhookSecret?: string;
        webhookToken?: string;
        base?: string;
        trialDays?: number;
        enabled?: boolean;
    };
    try {
        body = await req.json();
    } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (
        typeof body.enabled !== "boolean" &&
        !body.apiKey &&
        !body.apiSecret &&
        !body.webhookSecret &&
        !body.webhookToken &&
        body.base === undefined &&
        body.trialDays === undefined
    ) {
        return json({ error: "Tidak ada perubahan yang dikirim." }, { status: 400 });
    }

    const existing = await db.query.globalIntegrationSettings.findFirst({
        where: (t, { eq: _eq }) => _eq(t.id, SETTINGS_ID),
        columns: {
            sumopodApiKey: true,
            sumopodApiSecret: true,
            sumopodWebhookSecret: true,
            sumopodWebhookToken: true,
            sumopodBase: true,
            sumopodConfigured: true,
            sumopodTrialDays: true,
        },
    });

    const now = new Date();

    const apiKey = body.apiKey?.trim() ? encryptToken(body.apiKey.trim()) : (existing?.sumopodApiKey ?? null);
    const apiSecret = body.apiSecret?.trim()
        ? encryptToken(body.apiSecret.trim())
        : (existing?.sumopodApiSecret ?? null);
    const webhookSecret = body.webhookSecret?.trim()
        ? encryptToken(body.webhookSecret.trim())
        : (existing?.sumopodWebhookSecret ?? null);
    const webhookToken = body.webhookToken?.trim()
        ? encryptToken(body.webhookToken.trim())
        : (existing?.sumopodWebhookToken ?? null);

    const enabled = body.enabled ?? existing?.sumopodConfigured ?? false;
    const base = body.base?.trim() || existing?.sumopodBase || "https://api-pay-sandbox.sumopod.com";
    const trialDays = Number.isInteger(body.trialDays)
        ? Math.max(0, Math.min(90, body.trialDays!))
        : (existing?.sumopodTrialDays ?? 0);

    if (existing) {
        await db
            .update(schema.globalIntegrationSettings)
            .set({
                sumopodApiKey: apiKey ?? "",
                sumopodApiSecret: apiSecret ?? "",
                sumopodWebhookSecret: webhookSecret ?? "",
                sumopodWebhookToken: webhookToken ?? "",
                sumopodBase: base,
                sumopodConfigured: enabled,
                sumopodTrialDays: trialDays,
                updatedAt: now,
            })
            .where(eq(schema.globalIntegrationSettings.id, SETTINGS_ID));
    } else {
        await db.insert(schema.globalIntegrationSettings).values({
            id: SETTINGS_ID,
            sumopodApiKey: apiKey ?? "",
            sumopodApiSecret: apiSecret ?? "",
            sumopodWebhookSecret: webhookSecret ?? "",
            sumopodWebhookToken: webhookToken ?? "",
            sumopodBase: base,
            sumopodConfigured: enabled,
            sumopodTrialDays: trialDays,
            createdAt: now,
            updatedAt: now,
        });
    }

    return json({ ok: true });
});