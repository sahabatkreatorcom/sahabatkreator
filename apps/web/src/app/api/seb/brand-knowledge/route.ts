import { NextRequest } from "next/server";
import { withAuth, json } from "@/lib/api";
import { getBrandKnowledge, updateBrandKnowledge, scanWebsiteForBrandKnowledge } from "@/lib/seb-advisor";

export const dynamic = "force-dynamic";

/** GET /api/seb/brand-knowledge — brand knowledge org. */
export const GET = withAuth(async (ctx) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const knowledge = await getBrandKnowledge(activeOrganizationId);
    return json({ knowledge });
});

/** PUT /api/seb/brand-knowledge — simpan/edit brand knowledge manual. */
export const PUT = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return json({ error: "Invalid JSON body." }, { status: 400 });

    const result = await updateBrandKnowledge(activeOrganizationId, {
        websiteUrl: typeof body.websiteUrl === "string" ? body.websiteUrl : undefined,
        audience: typeof body.audience === "string" ? body.audience : undefined,
        positioning: typeof body.positioning === "string" ? body.positioning : undefined,
        products: typeof body.products === "string" ? body.products : undefined,
        offers: typeof body.offers === "string" ? body.offers : undefined,
        voiceRules: typeof body.voiceRules === "string" ? body.voiceRules : undefined,
        bannedTopics: typeof body.bannedTopics === "string" ? body.bannedTopics : undefined,
    });
    if (!result.ok) return json({ error: "Gagal menyimpan brand knowledge." }, { status: 400 });

    return json({ success: true });
});

/** POST /api/seb/brand-knowledge — scan website → pendingInsights (belum di-approve). */
export const POST = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as { websiteUrl?: string } | null;
    try {
        const result = await scanWebsiteForBrandKnowledge({
            organizationId: activeOrganizationId,
            websiteUrl: body?.websiteUrl,
        });
        return json(result, { status: 201 });
    } catch (e) {
        const message = e instanceof Error ? e.message : "Gagal memindai website.";
        const isConfigError = /OpenRouter belum dikonfigurasi/.test(message);
        const isProviderError = /OpenRouter request failed/.test(message);
        return json({ error: message }, { status: isConfigError || isProviderError ? 400 : 500 });
    }
});