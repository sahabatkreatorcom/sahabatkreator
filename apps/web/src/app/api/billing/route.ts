import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";
import { withOrgOwnerAdmin, json } from "@/lib/api";
import { sumopodService } from "@sahabat-kreator/payment";
import { PLAN_DISPLAY, PLAN_PRICES, getPlanLimits } from "@sahabat-kreator/payment";

export const dynamic = "force-dynamic";

const PLAN_ORDER = ["FREE", "PRO", "BUSINESS", "ENTERPRISE"];

function planFeatures(tier: string): string[] {
    const l = getPlanLimits(tier);
    const f: string[] = [
        `${l.socialAccounts === Infinity ? "Unlimited" : l.socialAccounts} akun media sosial`,
        `${l.teamMembers === Infinity ? "Unlimited" : l.teamMembers} anggota tim`,
        `${l.scheduledPostsPerMonth === Infinity ? "Unlimited" : l.scheduledPostsPerMonth} post terjadwal/bulan`,
    ];
    if (l.aiGenerationsPerMonth > 0 || l.aiGenerationsPerMonth === Infinity) {
        f.push(`${l.aiGenerationsPerMonth === Infinity ? "Unlimited" : l.aiGenerationsPerMonth} generasi AI/bulan`);
    }
    if (l.competitorTracking > 0 || l.competitorTracking === Infinity) {
        f.push(`Tracking ${l.competitorTracking === Infinity ? "unlimited" : l.competitorTracking} kompetitor`);
    }
    if (l.analyticsExport) f.push("Ekspor analitik");
    if (l.customBranding) f.push("Custom branding");
    if (l.prioritySupport) f.push("Priority support");
    return f;
}

/**
 * GET /api/billing — info subscription workspace + daftar plan (limit nyata).
 * Hanya owner/admin org yang boleh melihat & mengelola billing.
 */
export const GET = withOrgOwnerAdmin(async (authCtx) => {
    const { activeOrganizationId } = authCtx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const org = await db.query.organization.findFirst({
        where: eq(schema.organization.id, activeOrganizationId),
        columns: {
            id: true,
            name: true,
            tier: true,
            maxMembers: true,
            subscriptionStatus: true,
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
        },
    });

    if (!org) return json({ error: "Workspace tidak ditemukan." }, { status: 404 });

    const memberCount = await db.$count(
        schema.member,
        eq(schema.member.organizationId, activeOrganizationId)
    );

    const plans = PLAN_ORDER.map((tier) => {
        const price = PLAN_PRICES[tier];
        return {
            id: tier.toLowerCase(),
            name: PLAN_DISPLAY[tier]?.name ?? tier,
            price: price ?? 0,
            customPrice: price === null,
            features: planFeatures(tier),
            current: org.tier === tier,
        };
    });

    return json({
        organization: org,
        memberCount,
        gatewayConfigured: await sumopodService.isConfigured(),
        plans,
    });
});

/**
 * POST /api/billing — checkout via SumoPod: buat payment → redirect ke payment link.
 * Hanya owner/admin org.
 */
export const POST = withOrgOwnerAdmin(async (authCtx, req: NextRequest) => {
    const { activeOrganizationId, session } = authCtx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as { planId?: string } | null;
    if (!body?.planId) return json({ error: "planId wajib." }, { status: 400 });

    const tier = body.planId.toUpperCase();
    if (!PLAN_ORDER.includes(tier)) return json({ error: "Plan tidak dikenal." }, { status: 400 });

    const price = PLAN_PRICES[tier];
    if (price === null) {
        return json({ error: "Hubungi sales untuk paket ini." }, { status: 400 });
    }
    if (price === 0) {
        return json({ error: "Paket Free tidak memerlukan pembayaran." }, { status: 400 });
    }

    const org = await db.query.organization.findFirst({
        where: eq(schema.organization.id, activeOrganizationId),
        columns: { name: true, tier: true },
    });
    if (!org) return json({ error: "Workspace tidak ditemukan." }, { status: 404 });

    // Anti-downgrade: tolak checkout plan yang lebih rendah dari tier aktif.
    const currentRank = PLAN_ORDER.indexOf(org.tier);
    const targetRank = PLAN_ORDER.indexOf(tier);
    if (targetRank < currentRank) {
        return json({ error: "Tidak bisa downgrade lewat checkout. Hubungi support." }, { status: 400 });
    }

    const result = await sumopodService.createPayment({
        organizationId: activeOrganizationId,
        amount: price,
        description: `Langganan Sahabat Kreator ${PLAN_DISPLAY[tier]?.name} — 1 bulan`,
        customerName: session.user.name || undefined,
        customerEmail: session.user.email,
        metadata: {
            planId: tier,
            successReturnUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?status=success`,
            cancelReturnUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?status=cancelled`,
            paymentMethod: "QRIS",
        },
    });

    if (!result.success || !result.checkoutUrl) {
        return json({ error: result.error || "Gagal membuat pembayaran." }, { status: 502 });
    }

    return json({
        success: true,
        paymentId: result.paymentId,
        checkoutUrl: result.checkoutUrl,
        message: "Redirecting ke halaman pembayaran…",
    });
});
