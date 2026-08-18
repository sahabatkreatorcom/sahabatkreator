import { randomUUID } from "node:crypto";
import { db, schema } from "@sahabat-kreator/db";
import { eq } from "drizzle-orm";
import { withAdmin, json } from "@/lib/api";
import { encryptToken } from "@/lib/token-encryption";
import {
    credentialPlatform,
    CONNECTABLE_PLATFORMS,
    PLATFORM_LABELS,
    type Platform,
} from "@/lib/platforms/config";

export const dynamic = "force-dynamic";

/** Platform yang bisa dikelola kredensialnya (satu baris per platform enum). */
const MANAGED_PLATFORMS: Platform[] = [
    "INSTAGRAM",
    "META",
    "TIKTOK",
    "YOUTUBE",
    "PINTEREST",
    "GOOGLE_BUSINESS",
    "LINKEDIN",
    "THREADS",
];

function validPlatform(value: string): value is Platform {
    return MANAGED_PLATFORMS.includes(value as Platform);
}

/**
 * GET /api/admin/platform-credentials
 * Daftar kredensial global per platform (secret dimasking — tidak pernah
 * dikembalikan plaintext ke client).
 */
export const GET = withAdmin(async () => {
    const rows = await db.query.globalPlatformCredential.findMany({
        columns: {
            platform: true,
            clientId: true,
            clientSecret: true,
            isConfigured: true,
            webhookVerifyToken: true,
            updatedAt: true,
        },
    });

    const byPlatform = new Map(rows.map((r) => [r.platform, r]));

    const list = MANAGED_PLATFORMS.map((platform) => {
        const row = byPlatform.get(platform);
        return {
            platform,
            label: PLATFORM_LABELS[platform],
            connectable: CONNECTABLE_PLATFORMS.includes(platform),
            clientId: row?.clientId ?? null,
            clientSecretConfigured: !!row?.clientSecret && row.isConfigured,
            webhookVerifyToken: row?.webhookVerifyToken ?? null,
            isConfigured: !!row?.isConfigured,
            updatedAt: row?.updatedAt ?? null,
        };
    });

    return json({ platforms: list });
});

/**
 * PUT /api/admin/platform-credentials
 * Simpan kredensial global per platform. Field kosong diabaikan (tidak
 * menimpa secret lama). Untuk "hapus konfigurasi", kirim `enabled: false`.
 */
export const PUT = withAdmin(async (ctx, req: Request) => {
    let body: {
        platform?: string;
        clientId?: string;
        clientSecret?: string;
        webhookVerifyToken?: string;
        enabled?: boolean;
    };
    try {
        body = await req.json();
    } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const platform = body.platform;
    if (!platform || !validPlatform(platform)) {
        return json({ error: "Platform tidak valid." }, { status: 400 });
    }
    if (typeof body.enabled !== "boolean" && !body.clientId && !body.clientSecret && !body.webhookVerifyToken) {
        return json({ error: "Tidak ada perubahan yang dikirim." }, { status: 400 });
    }

    const enumPlatform = credentialPlatform(platform);
    const now = new Date();

    // Muat baris lama agar field yang tidak dikirim tetap dipertahankan.
    const existing = await db.query.globalPlatformCredential.findFirst({
        where: (t, { eq: _eq }) => _eq(t.platform, enumPlatform),
        columns: { id: true, clientId: true, clientSecret: true, webhookVerifyToken: true, isConfigured: true },
    });

    const clientSecret = body.clientSecret?.trim()
        ? encryptToken(body.clientSecret.trim())
        : (existing?.clientSecret ?? null);

    const enabled = body.enabled ?? existing?.isConfigured ?? true;

    if (existing) {
        await db
            .update(schema.globalPlatformCredential)
            .set({
                clientId: body.clientId?.trim() ?? existing.clientId,
                clientSecret: clientSecret ?? "",
                webhookVerifyToken: body.webhookVerifyToken?.trim() ?? existing.webhookVerifyToken ?? null,
                isConfigured: enabled,
                updatedAt: now,
            })
            .where(eq(schema.globalPlatformCredential.platform, enumPlatform));
    } else {
        await db.insert(schema.globalPlatformCredential).values({
            id: randomUUID(),
            platform: enumPlatform,
            clientId: body.clientId?.trim() ?? "",
            clientSecret: clientSecret ?? "",
            webhookVerifyToken: body.webhookVerifyToken?.trim() ?? null,
            isConfigured: enabled,
            createdAt: now,
            updatedAt: now,
        });
    }

    return json({ ok: true });
});