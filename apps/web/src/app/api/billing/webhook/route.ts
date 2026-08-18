import { NextRequest } from "next/server";
import { sumopodService } from "@sahabat-kreator/payment";
import { json } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/billing/webhook — endpoint webhook SumoPod Pay.
 *
 * SumoPod mengirim event (payment.completed / failed / expired) dengan header
 * `svix-id`, `svix-timestamp`, `svix-signature` ATAU `x-webhook-token`.
 * Verifikasi memakai raw body — jangan ubah whitespace.
 *
 * Response harus 2xx dalam 10 detik; selain itu SumoPod menandai gagal & resend.
 */
export async function POST(req: NextRequest) {
    const rawBody = await req.text();
    if (!rawBody) return json({ error: "Empty body" }, { status: 400 });

    const verified = await sumopodService.verifyWebhook(
        {
            "svix-id": req.headers.get("svix-id") || undefined,
            "svix-timestamp": req.headers.get("svix-timestamp") || undefined,
            "svix-signature": req.headers.get("svix-signature") || undefined,
            "x-webhook-token": req.headers.get("x-webhook-token") || undefined,
        },
        rawBody,
    );

    if (!verified) {
        return json({ error: "Invalid signature" }, { status: 401 });
    }

    let event: { event_type?: string };
    try {
        event = JSON.parse(rawBody);
    } catch {
        return json({ error: "Invalid JSON" }, { status: 400 });
    }

    // Ack test event langsung (dikirim dari halaman Settings SumoPod).
    if (event.event_type === "payment.test") {
        return json({ ok: true, received: "test" });
    }

    try {
        await sumopodService.handleWebhook(event as never);
    } catch (err) {
        console.error("[billing-webhook] gagal proses event:", err);
        return json({ error: "Failed to process" }, { status: 500 });
    }

    return json({ ok: true });
}
