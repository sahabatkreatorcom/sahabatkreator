import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";
import { withAuth, json } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/billing — info subscription workspace.
 */
export const GET = withAuth(async (ctx) => {
    const { activeOrganizationId, session } = ctx;
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
            stripeCustomerId: true,
        },
    });

    if (!org) return json({ error: "Workspace tidak ditemukan." }, { status: 404 });

    const memberCount = await db.$count(
        schema.member,
        eq(schema.member.organizationId, activeOrganizationId)
    );

    return json({
        organization: org,
        memberCount,
        plans: [
            {
                id: "free",
                name: "Free",
                price: 0,
                maxMembers: 5,
                features: [
                    "5 anggota tim",
                    "3 akun media sosial",
                    "100 post/bulan",
                    "Analytics dasar",
                ],
                current: org.tier === "FREE",
            },
            {
                id: "pro",
                name: "Pro",
                price: 99000,
                maxMembers: 20,
                features: [
                    "20 anggota tim",
                    "10 akun media sosial",
                    "Post unlimited",
                    "Analytics lengkap",
                    "Seb AI assistant",
                    "Priority support",
                ],
                current: org.tier === "PRO",
            },
            {
                id: "business",
                name: "Business",
                price: 249000,
                maxMembers: 50,
                features: [
                    "50 anggota tim",
                    "Unlimited akun",
                    "Post unlimited",
                    "Analytics lengkap",
                    "Seb AI advanced",
                    "White-label",
                    "Dedicated support",
                ],
                current: org.tier === "BUSINESS",
            },
        ],
    });
});

/**
 * POST /api/billing/checkout — buat checkout session Stripe (placeholder).
 */
export const POST = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as { planId?: string } | null;
    if (!body?.planId) return json({ error: "planId wajib." }, { status: 400 });

    // TODO: integrasi Stripe checkout
    return json({
        message: "Checkout belum tersedia. Hubungi admin untuk upgrade.",
        planId: body.planId,
    });
});
