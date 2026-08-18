import { createHmac, timingSafeEqual } from "node:crypto";
import { db, schema } from "@sahabat-kreator/db";
import { eq } from "drizzle-orm";

/**
 * Verifikasi signature HMAC-SHA256 (format `sha256=<hex>`) — dipakai Meta
 * Graph API webhooks (`X-Hub-Signature-256`) & TikTok (`X-TikTok-Signature`
 * memakai format serupa). Harus memakai RAW body.
 */
export function verifyHmacSha256(secret: string, signatureHeader: string | null, rawBody: string): boolean {
    if (!signatureHeader) return false;
    const [scheme, providedHex] = signatureHeader.split("=", 2);
    if (!providedHex || (scheme !== "sha256" && scheme !== "v1")) return false;

    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(providedHex);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
}

export interface WebhookEventRecord {
    eventId: string;
    raw: string;
}

/**
 * Proses event webhook dengan idempotency ATOMIK:
 * - INSERT processed_webhook_event ... ON CONFLICT DO NOTHING dulu.
 * - Hanya bila baris benar-benar ter-insert (race pemenang) → jalankan handler.
 * Ini menghilangkan TOCTOU (check-then-act) — dua delivery konkuren dengan
 * eventId sama hanya satu yang memproses.
 */
export async function processWebhookEvent(
    eventId: string,
    handler: () => Promise<void>,
): Promise<boolean> {
    try {
        const result = await db
            .insert(schema.processedWebhookEvent)
            .values({ eventId, processedAt: new Date() })
            .onConflictDoNothing()
            .returning({ eventId: schema.processedWebhookEvent.eventId });

        if (result.length === 0) return false; // sudah diproses delivery lain

        await handler();
        return true;
    } catch (err) {
        // Bila handler gagal, hapus penanda agar bisa dicoba ulang pada retry berikutnya.
        await db
            .delete(schema.processedWebhookEvent)
            .where(eq(schema.processedWebhookEvent.eventId, eventId))
            .catch(() => {});
        throw err;
    }
}

/** Batas ukuran body webhook (mencegah memory exhaustion dari body raksasa). */
export const WEBHOOK_MAX_BODY_BYTES = 1024 * 1024; // 1 MB

/** Baca raw body dengan batas ukuran. Return null bila melebihi. */
export async function readWebhookBody(req: Request): Promise<string | null> {
    const contentLength = Number(req.headers.get("content-length") ?? 0);
    if (contentLength > WEBHOOK_MAX_BODY_BYTES) return null;
    const raw = await req.text();
    if (raw.length > WEBHOOK_MAX_BODY_BYTES) return null;
    return raw;
}

/** Format dasar respons sukses webhook (2xx, ack cepat). */
export function webhookAck(): Response {
    return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
}

export function webhookError(message: string, status = 400): Response {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}
