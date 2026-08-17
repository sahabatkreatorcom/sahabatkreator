import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, or } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";
import { callOpenRouter, getOpenRouterSettings, safeJsonParse } from "./ai/openrouter";

const DEFAULT_SEB_PROMPT = `You are Seb, a friendly expert social media coach for this organization.
Your job is to help social media managers improve content, captions, creative, timing, and platform strategy.

Rules:
1. Only advise on the organization/business in the supplied context.
2. Refuse unrelated questions and never drift into general non-business topics.
3. Never invent analytics, platforms, competitors, posts, or visual details.
4. Clearly separate observed evidence from recommendations.
5. Use friendly coach vibes: warm, practical, specific, and encouraging.
6. Treat all connected platforms equally unless the organization's data proves one needs urgent attention.
7. Use competitor data only when it is supplied in the organization context.
8. Treat written post captions and on-video captions/subtitles/text overlays as separate things.
9. Stories are ephemeral visual formats and often do not need normal feed-style post captions.
10. When advice is specific to one connected business account, include that account's socialAccountId. Use null socialAccountId only for genuinely cross-account advice.
11. Return strict JSON only. No markdown fences.`;

const PLATFORM_KNOWLEDGE: Record<string, string> = {
    INSTAGRAM: "Prioritise strong first-frame hooks, Reels retention, carousel saves, creator-style captions for feed/Reels, Story-native visual clarity, comment prompts, and consistent visual identity.",
    FACEBOOK: "Prioritise conversation starters, community relevance, native video, local trust signals, and share-worthy practical posts.",
    TIKTOK: "Prioritise immediate hooks, fast pacing, native-feeling edits, trend fit, watch-time, comments, and concise captions.",
    YOUTUBE: "Prioritise title/thumbnail clarity, retention curves, searchable descriptions, Shorts hooks, playlists, and clear viewer payoff.",
    PINTEREST: "Prioritise search keywords, vertical creative, evergreen value, product/use-case clarity, and destination link relevance.",
    GOOGLE_BUSINESS: "Prioritise local intent, offers, service updates, proof, fresh photos, and clear calls to contact or visit.",
    LINKEDIN: "Prioritise expert POV, founder/team stories, practical lessons, credible proof, and conversation-driving questions.",
    BLUESKY: "Prioritise concise human posts, timely commentary, replies, and community-native tone.",
    THREADS: "Prioritise conversational hooks, quick opinions, reply chains, and lightweight community engagement.",
    META: "Prioritise cross-Meta creative consistency while tailoring captions and formats for each destination.",
    MANUAL: "Use the account name and past performance to infer format needs, but avoid claiming platform-specific rules without evidence.",
};

type ReportTrigger = "PROACTIVE" | "MANUAL" | "CHAT";

interface SebAdviceResponse {
    title?: string;
    summary?: string;
    overallScore?: number;
    scoreBreakdown?: Record<string, number>;
    confidence?: number;
    recommendations?: Array<{
        title?: string;
        advice?: string;
        rationale?: string;
        category?: string;
        priority?: string;
        platform?: string | null;
        socialAccountId?: string | null;
        confidence?: number;
        evidence?: unknown;
        citations?: unknown;
        impactBaseline?: unknown;
    }>;
    experiments?: Array<{
        title?: string;
        hypothesis?: string;
        platform?: string | null;
        metric?: string;
        baseline?: unknown;
    }>;
    brandKnowledgeUpdates?: Record<string, unknown> | null;
    progressNotes?: string[];
}

function clamp01(value: unknown, fallback = 0.6): number {
    const num = typeof value === "number" ? value : fallback;
    return Math.min(Math.max(num, 0), 1);
}

function toPlatform(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const normalized = value.toUpperCase();
    return normalized in PLATFORM_KNOWLEDGE ? normalized : null;
}

function normalizeCategory(value: unknown): string {
    const normalized = typeof value === "string" ? value.toUpperCase().replace(/\s+/g, "_") : "";
    const allowed = new Set(["CONTENT_STRATEGY", "CAPTION", "CREATIVE", "VIDEO", "TIMING", "HASHTAG", "PLATFORM", "COMPETITOR", "BRAND"]);
    return allowed.has(normalized) ? normalized : "CONTENT_STRATEGY";
}

function normalizePriority(value: unknown): string {
    const normalized = typeof value === "string" ? value.toUpperCase() : "";
    return ["LOW", "MEDIUM", "HIGH"].includes(normalized) ? normalized : "MEDIUM";
}

/** Fallback bila AI mengembalikan JSON yang tidak bisa di-repair. */
function fallbackSebReport(context: unknown): SebAdviceResponse {
    const ctx = context as {
        posts?: Array<{ id: string; status: string; platform?: string | null }>;
        accounts?: Array<{ platform: string }>;
        competitors?: unknown[];
    };
    const platforms = Array.from(new Set((ctx.accounts ?? []).map((a) => a.platform))).filter(Boolean);
    const postCount = ctx.posts?.length || 0;

    return {
        title: "Laporan coaching Seb",
        summary: `Seb meninjau ${postCount} post terbaru${platforms.length ? ` di ${platforms.join(", ")}` : ""}. Respons AI perlu perbaikan format, jadi laporan ini fokus pada langkah aman berbasis data akun yang tersedia.`,
        overallScore: postCount > 0 ? 62 : 40,
        scoreBreakdown: {
            captions: postCount > 0 ? 60 : 35,
            visualHooks: postCount > 0 ? 58 : 35,
            videoQuality: postCount > 0 ? 55 : 35,
            platformFit: platforms.length > 0 ? 65 : 40,
            brandConsistency: 60,
            competitorGap: ctx.competitors?.length ? 60 : 45,
            postingRhythm: postCount > 0 ? 62 : 35,
        },
        confidence: 0.35,
        recommendations: [
            {
                title: "Perkuat kesan pertama di setiap post",
                advice: "Tinjau baris pembuka, frame pertama, atau thumbnail sebelum terbit. Buat manfaat bagi penonton langsung terlihat dan hilangkan pembukaan yang lambat.",
                rationale: "Seb tidak dapat mem-parse respons model, tetapi kejelasan hook adalah peningkatan berdampak tinggi yang aman di semua platform.",
                category: "CREATIVE",
                priority: "HIGH",
                platform: null,
                confidence: 0.45,
                evidence: { basedOn: `${postCount} post tersedia di konteks Seb`, metrics: ["post history", "media context"] },
                citations: [{ type: "post", label: "Post organisasi terbaru", id: "recent-posts" }],
                impactBaseline: { metric: "engagementRate", current: "Gunakan rata-rata 30 hari terakhir sebagai baseline" },
            },
            {
                title: "Lengkapi brand knowledge agar saran lebih tajam",
                advice: "Isi brand knowledge Seb untuk audience, positioning, produk, penawaran, aturan suara, dan topik yang dihindari.",
                rationale: "Konteks brand meningkatkan saran caption, kreatif, dan competitor sambil menjaga Seb fokus pada bisnis ini.",
                category: "BRAND",
                priority: "MEDIUM",
                platform: null,
                confidence: 0.5,
                evidence: { basedOn: "Ketersediaan brand knowledge Seb", metrics: ["brand context completeness"] },
                citations: [{ type: "platform_knowledge", label: "Brand knowledge Seb", id: "seb-brand-knowledge" }],
            },
        ],
        experiments: [
            {
                title: "Uji hook yang lebih jelas selama tujuh hari",
                hypothesis: "Post dengan manfaat langsung di baris pertama akan mengungguli pembukaan yang samar.",
                platform: null,
                metric: "engagementRate",
                baseline: { current: "Rata-rata engagement rate 30 hari terakhir" },
            },
        ],
        progressNotes: ["Laporan fallback dibuat karena respons model bukan JSON valid."],
    };
}

async function collectContext(organizationId: string) {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const [organization, brandVoice, sebBrandKnowledge, accounts, posts, platformAnalytics, competitors, platformKnowledge, previousRecommendations] =
        await Promise.all([
            db.query.organization.findFirst({ where: eq(schema.organization.id, organizationId), columns: { id: true, name: true } }),
            db.query.brandVoice.findFirst({ where: eq(schema.brandVoice.organizationId, organizationId) }),
            db.query.sebBrandKnowledge.findFirst({ where: eq(schema.sebBrandKnowledge.organizationId, organizationId) }),
            db.query.socialAccount.findMany({
                where: (t, { and: _and, eq: _eq }) => _and(_eq(t.organizationId, organizationId), _eq(t.isActive, true)),
                columns: { id: true, platform: true, name: true, username: true },
            }),
            db.query.post.findMany({
                where: and(
                    eq(schema.post.organizationId, organizationId),
                    or(
                        gte(schema.post.publishedAt, ninetyDaysAgo),
                        inArray(schema.post.status, ["DRAFT", "SCHEDULED"]),
                    ),
                ),
                with: {
                    socialAccount: { columns: { platform: true, name: true, username: true } },
                },
                orderBy: [desc(schema.post.publishedAt), desc(schema.post.createdAt)],
                limit: 80,
            }),
            db.query.platformAnalytics.findMany({
                where: (t, { and: _and, eq: _eq, gte: _gte }) =>
                    _and(_eq(t.organizationId, organizationId), _gte(t.date, ninetyDaysAgo)),
                with: { socialAccount: { columns: { platform: true, name: true } } },
                orderBy: [desc(schema.platformAnalytics.date)],
                limit: 120,
            }),
            db.query.competitor.findMany({
                where: eq(schema.competitor.organizationId, organizationId),
                with: { posts: { orderBy: [desc(schema.competitorPost.postedAt)], limit: 10 } },
                limit: 20,
            }),
            db.query.sebPlatformKnowledge.findMany({
                where: eq(schema.sebPlatformKnowledge.isActive, true),
                orderBy: [desc(schema.sebPlatformKnowledge.updatedAt)],
                limit: 50,
            }),
            db.query.sebRecommendation.findMany({
                where: eq(schema.sebRecommendation.organizationId, organizationId),
                with: { socialAccount: { columns: { id: true, name: true, username: true } } },
                orderBy: [desc(schema.sebRecommendation.updatedAt)],
                limit: 30,
            }),
        ]);

    const connectedPlatformKnowledge = accounts.map((account) => ({
        platform: account.platform,
        socialAccountId: account.id,
        accountName: account.name,
        username: account.username,
        guidance: PLATFORM_KNOWLEDGE[account.platform] || "",
    }));

    return {
        organization: organization ?? { id: organizationId, name: "Workspace" },
        brandVoice,
        sebBrandKnowledge,
        accounts,
        posts: posts.map((post) => ({
            id: post.id,
            caption: post.caption,
            status: post.status,
            postType: post.postType,
            platform: post.socialAccount?.platform || post.platform,
            socialAccountId: post.socialAccountId,
            accountName: post.socialAccount?.name,
            accountUsername: post.socialAccount?.username,
            publishedAt: post.publishedAt?.toISOString() ?? null,
            scheduledAt: post.scheduledAt?.toISOString() ?? null,
        })),
        platformAnalytics: platformAnalytics.map((item) => ({
            id: item.id,
            socialAccountId: item.socialAccountId,
            accountName: item.socialAccount?.name,
            platform: item.socialAccount?.platform,
            date: item.date.toISOString(),
            followers: item.followers,
            followersChange: item.followersChange,
            following: item.following,
            impressions: item.impressions,
            reach: item.reach,
            engagementRate: item.engagementRate,
            profileViews: item.profileViews,
            websiteClicks: item.websiteClicks,
        })),
        competitors: competitors.map((competitor) => ({
            id: competitor.id,
            platform: competitor.platform,
            username: competitor.username,
            displayName: competitor.displayName,
            followers: competitor.followers,
            followerGrowth: competitor.followerGrowth,
            avgEngagement: competitor.avgEngagement,
            postsPerWeek: competitor.postsPerWeek,
            posts: competitor.posts.map((p) => ({
                id: p.id,
                caption: p.caption,
                mediaType: p.mediaType,
                likes: p.likes,
                comments: p.comments,
                engagement: p.engagement,
                postedAt: p.postedAt.toISOString(),
            })),
        })),
        platformKnowledge: [
            ...connectedPlatformKnowledge,
            ...platformKnowledge.map((item) => ({
                platform: item.platform,
                title: item.title,
                guidance: item.content,
                sourceUrl: item.sourceUrl,
            })),
        ],
        previousRecommendations,
    };
}

export interface GenerateSebReportOptions {
    organizationId: string;
    userId?: string;
    trigger?: ReportTrigger;
    reportId?: string;
}

export async function generateSebReport({ organizationId, userId, trigger = "MANUAL", reportId }: GenerateSebReportOptions) {
    const settings = getOpenRouterSettings();
    if (!settings) {
        throw new Error(
            "OpenRouter belum dikonfigurasi. Atur OPENROUTER_API_KEY di environment untuk mengaktifkan Seb.",
        );
    }

    try {
        const context = await collectContext(organizationId);
        const inputHash = createHash("sha256").update(JSON.stringify(context)).digest("hex");

        const content = await callOpenRouter(
            settings,
            [
                { role: "system", content: DEFAULT_SEB_PROMPT },
                {
                    role: "user",
                    content: `Buat laporan coaching media sosial untuk organisasi ini. Gunakan semua data yang tersedia, sertakan peluang competitor, rekomendasi untuk semua platform yang terhubung secara setara, kepercayaan, kutipan, baseline dampak, dan catatan progres. Kembalikan JSON ketat dengan bentuk ini:
{"title":"string","summary":"string","overallScore":0-100,"scoreBreakdown":{"captions":0-100,"visualHooks":0-100,"videoQuality":0-100,"platformFit":0-100,"brandConsistency":0-100,"competitorGap":0-100,"postingRhythm":0-100},"confidence":0-1,"recommendations":[{"title":"string","advice":"string","rationale":"string","category":"CONTENT_STRATEGY|CAPTION|CREATIVE|VIDEO|TIMING|HASHTAG|PLATFORM|COMPETITOR|BRAND","priority":"LOW|MEDIUM|HIGH","platform":"INSTAGRAM|FACEBOOK|TIKTOK|YOUTUBE|PINTEREST|GOOGLE_BUSINESS|LINKEDIN|BLUESKY|THREADS|META|MANUAL|null","socialAccountId":"id|null","confidence":0-1,"evidence":{"basedOn":"string","postIds":["id"],"metrics":["string"]},"citations":[{"type":"post|analytics|competitor|platform_knowledge","label":"string","id":"string"}],"impactBaseline":{"metric":"string","current":"string"}}],"experiments":[{"title":"string","hypothesis":"string","platform":"INSTAGRAM|FACEBOOK|TIKTOK|YOUTUBE|PINTEREST|GOOGLE_BUSINESS|LINKEDIN|BLUESKY|THREADS|META|MANUAL|null","metric":"string","baseline":{"current":"string"}}],"brandKnowledgeUpdates":{"learnedInsights":["string"]},"progressNotes":["string"]}

Konteks:\n${JSON.stringify(context).slice(0, 65000)}`,
                },
            ],
            3500,
            true,
        );

        let parsed = safeJsonParse<SebAdviceResponse>(content);
        if (!parsed) {
            // Coba repair sekali dengan model yang sama.
            try {
                const repaired = await callOpenRouter(
                    settings,
                    [
                        { role: "system", content: "You repair malformed AI output into valid JSON only. Do not add markdown or commentary." },
                        { role: "user", content: `Convert this response into valid JSON matching the Seb report schema. If fields are missing, infer conservative values from the text. Return JSON only.\n\n${content.slice(0, 30000)}` },
                    ],
                    2500,
                    true,
                );
                parsed = safeJsonParse<SebAdviceResponse>(repaired);
            } catch {
                parsed = null;
            }
        }
        if (!parsed) parsed = fallbackSebReport(context);

        const accountIds = new Set(context.accounts.map((a) => a.id));
        const reportData = {
            organizationId,
            trigger,
            status: "COMPLETED" as const,
            title: parsed.title || "Laporan coaching Seb",
            summary: parsed.summary || "Seb meninjau konten dan analitik terbaru Anda.",
            overallScore: typeof parsed.overallScore === "number" ? Math.min(Math.max(parsed.overallScore, 0), 100) : null,
            scoreBreakdown: (parsed.scoreBreakdown ?? {}) as object,
            confidence: clamp01(parsed.confidence),
            model: settings.model,
            inputHash,
            generatedById: userId,
            dataStartDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
            dataEndDate: new Date(),
            metadata: { progressNotes: parsed.progressNotes ?? [] } as object,
        };

        const reportIdFinal = reportId ?? randomUUID();
        await db.insert(schema.sebReport).values({ id: reportIdFinal, ...reportData });

        const recs = (parsed.recommendations ?? []).slice(0, 20);
        const exps = (parsed.experiments ?? []).slice(0, 8);
        if (recs.length > 0) {
            await db.insert(schema.sebRecommendation).values(
                recs.map((rec) => {
                    const socialAccountId =
                        typeof rec.socialAccountId === "string" && accountIds.has(rec.socialAccountId) ? rec.socialAccountId : null;
                    return {
                        id: randomUUID(),
                        organizationId,
                        socialAccountId,
                        reportId: reportIdFinal,
                        platform: toPlatform(rec.platform) as never,
                        category: normalizeCategory(rec.category) as never,
                        priority: normalizePriority(rec.priority) as never,
                        title: rec.title || "Tingkatkan performa konten",
                        advice: rec.advice || "",
                        rationale: rec.rationale || null,
                        evidence: (rec.evidence ?? {}) as object,
                        citations: (rec.citations ?? []) as object,
                        impactBaseline: rec.impactBaseline ? (rec.impactBaseline as object) : null,
                        confidence: Math.round(clamp01(rec.confidence) * 100),
                    };
                }),
            );
        }
        if (exps.length > 0) {
            await db.insert(schema.sebExperiment).values(
                exps.map((exp) => ({
                    id: randomUUID(),
                    organizationId,
                    reportId: reportIdFinal,
                    title: exp.title || "Eksperimen konten Seb",
                    hypothesis: exp.hypothesis || "Menguji ide ini mungkin meningkatkan performa sosial.",
                    platform: toPlatform(exp.platform) as never,
                    metric: exp.metric || "engagementRate",
                    baseline: exp.baseline ? (exp.baseline as object) : null,
                })),
            );
        }

        if (parsed.brandKnowledgeUpdates) {
            const existing = await db.query.sebBrandKnowledge.findFirst({
                where: eq(schema.sebBrandKnowledge.organizationId, organizationId),
                columns: { id: true },
            });
            const updates = parsed.brandKnowledgeUpdates;
            if (existing) {
                await db.update(schema.sebBrandKnowledge)
                    .set({ pendingInsights: updates, updatedBySebAt: new Date() })
                    .where(eq(schema.sebBrandKnowledge.id, existing.id));
            } else {
                await db.insert(schema.sebBrandKnowledge).values({
                    id: randomUUID(),
                    organizationId,
                    pendingInsights: updates,
                    updatedBySebAt: new Date(),
                });
            }
        }

        await db.insert(schema.notification).values({
            id: randomUUID(),
            organizationId,
            title: "Laporan Seb siap",
            message: "Seb telah selesai membuat laporan coaching media sosial terbaru.",
            type: "success",
            link: "/dashboard/seb",
        });

        const highPriority = recs.some((rec) => normalizePriority(rec.priority) === "HIGH");
        if (highPriority) {
            await db.insert(schema.notification).values({
                id: randomUUID(),
                organizationId,
                title: "Seb menemukan saran prioritas tinggi",
                message: "Laporan Seb baru berisi rekomendasi prioritas tinggi untuk media sosial Anda.",
                type: "warning",
                link: "/dashboard/seb",
            });
        }

        return getSebReport(organizationId, reportIdFinal);
    } catch (error) {
        if (reportId) {
            await db.update(schema.sebReport)
                .set({ status: "FAILED", summary: error instanceof Error ? error.message : "Generasi laporan Seb gagal" })
                .where(eq(schema.sebReport.id, reportId));
        }
        throw error;
    }
}

// ============================================================================
// Query helpers
// ============================================================================

export async function listSebReports(organizationId: string, limit = 50, offset = 0) {
    const reports = await db.query.sebReport.findMany({
        where: eq(schema.sebReport.organizationId, organizationId),
        orderBy: [desc(schema.sebReport.createdAt)],
        limit,
        offset,
        with: {
            recommendations: {
                columns: { id: true, category: true, priority: true, status: true, title: true },
            },
            experiments: { columns: { id: true, status: true, title: true, metric: true } },
        },
    });
    const total = await db.$count(schema.sebReport, eq(schema.sebReport.organizationId, organizationId));
    return { reports: reports.map((r) => formatReport(r)), total };
}

export async function getSebReport(organizationId: string, id: string) {
    const report = await db.query.sebReport.findFirst({
        where: and(eq(schema.sebReport.id, id), eq(schema.sebReport.organizationId, organizationId)),
        with: {
            recommendations: {
                with: { socialAccount: { columns: { id: true, name: true, username: true, platform: true } } },
            },
            experiments: true,
        },
    });
    return report ? formatReport(report, true) : null;
}

function formatReport(report: {
    id: string;
    trigger: string;
    status: string;
    title: string;
    summary: string;
    overallScore: number | null;
    scoreBreakdown: unknown;
    confidence: number;
    model: string | null;
    dataStartDate: Date | null;
    dataEndDate: Date | null;
    generatedById: string | null;
    metadata: unknown;
    createdAt: Date;
    recommendations?: Array<Record<string, unknown>>;
    experiments?: Array<Record<string, unknown>>;
}, full = false) {
    const base = {
        id: report.id,
        trigger: report.trigger,
        status: report.status,
        title: report.title,
        summary: report.summary,
        overallScore: report.overallScore,
        scoreBreakdown: report.scoreBreakdown ?? {},
        confidence: report.confidence,
        model: report.model,
        dataStartDate: report.dataStartDate?.toISOString() ?? null,
        dataEndDate: report.dataEndDate?.toISOString() ?? null,
        generatedById: report.generatedById,
        metadata: report.metadata ?? {},
        createdAt: report.createdAt.toISOString(),
    };
    if (!full) return base;
    return {
        ...base,
        recommendations: report.recommendations?.map(formatRecommendation) ?? [],
        experiments: report.experiments?.map(formatExperiment) ?? [],
    };
}

function formatRecommendation(rec: Record<string, unknown>) {
    const socialAccount = rec.socialAccount as { id: string; name: string; username: string | null; platform: string } | null;
    return {
        id: rec.id,
        category: rec.category,
        priority: rec.priority,
        status: rec.status,
        title: rec.title,
        advice: rec.advice,
        rationale: rec.rationale ?? null,
        platform: rec.platform ?? null,
        socialAccountId: rec.socialAccountId ?? null,
        account: socialAccount ? { id: socialAccount.id, name: socialAccount.name, username: socialAccount.username, platform: socialAccount.platform } : null,
        confidence: rec.confidence ?? 0,
        evidence: rec.evidence ?? {},
        citations: rec.citations ?? [],
        impactBaseline: rec.impactBaseline ?? null,
        impactResult: rec.impactResult ?? null,
        impactCheckedAt: rec.impactCheckedAt ? (rec.impactCheckedAt as Date).toISOString() : null,
        dueAt: rec.dueAt ? (rec.dueAt as Date).toISOString() : null,
        completedAt: rec.completedAt ? (rec.completedAt as Date).toISOString() : null,
        createdAt: (rec.createdAt as Date).toISOString(),
    };
}

function formatExperiment(exp: Record<string, unknown>) {
    return {
        id: exp.id,
        title: exp.title,
        hypothesis: exp.hypothesis,
        platform: exp.platform ?? null,
        metric: exp.metric,
        status: exp.status,
        startAt: exp.startAt ? (exp.startAt as Date).toISOString() : null,
        endAt: exp.endAt ? (exp.endAt as Date).toISOString() : null,
        baseline: exp.baseline ?? null,
        result: exp.result ?? null,
    };
}

export async function listSebRecommendations(organizationId: string, status?: string, limit = 50, offset = 0) {
    const conditions = [eq(schema.sebRecommendation.organizationId, organizationId)];
    if (status && status !== "ALL") conditions.push(eq(schema.sebRecommendation.status, status as never));

    const recs = await db.query.sebRecommendation.findMany({
        where: and(...conditions),
        orderBy: [desc(schema.sebRecommendation.createdAt)],
        limit,
        offset,
        with: { socialAccount: { columns: { id: true, name: true, username: true, platform: true } } },
    });
    const total = await db.$count(schema.sebRecommendation, and(...conditions));
    return { recommendations: recs.map(formatRecommendation), total };
}

export async function updateSebRecommendation(
    organizationId: string,
    id: string,
    updates: { status?: string; dueAt?: string | null },
) {
    const existing = await db.query.sebRecommendation.findFirst({
        where: and(eq(schema.sebRecommendation.id, id), eq(schema.sebRecommendation.organizationId, organizationId)),
        columns: { id: true },
    });
    if (!existing) return { ok: false, error: "Rekomendasi tidak ditemukan." };

    const set: Record<string, unknown> = {};
    if (updates.status) set.status = updates.status;
    if (updates.dueAt !== undefined) set.dueAt = updates.dueAt ? new Date(updates.dueAt) : null;
    if (updates.status === "COMPLETED") set.completedAt = new Date();

    await db.update(schema.sebRecommendation).set(set).where(eq(schema.sebRecommendation.id, id));
    return { ok: true };
}

// ============================================================================
// Chat
// ============================================================================

export async function chatWithSeb({
    organizationId,
    userId,
    sessionId,
    message,
}: {
    organizationId: string;
    userId: string;
    sessionId?: string;
    message: string;
}) {
    const settings = getOpenRouterSettings();
    if (!settings) {
        throw new Error("OpenRouter belum dikonfigurasi. Atur OPENROUTER_API_KEY di environment untuk mengaktifkan Seb.");
    }

    const session = sessionId
        ? await db.query.sebChatSession.findFirst({
            where: and(eq(schema.sebChatSession.id, sessionId), eq(schema.sebChatSession.organizationId, organizationId)),
            columns: { id: true },
        })
        : null;

    const sessionIdFinal = session?.id ?? randomUUID();
    if (!session) {
        await db.insert(schema.sebChatSession).values({
            id: sessionIdFinal,
            organizationId,
            userId,
            title: message.slice(0, 60) || "Chat Seb",
        });
    }

    const [context, history] = await Promise.all([
        collectContext(organizationId),
        db.query.sebChatMessage.findMany({
            where: eq(schema.sebChatMessage.sessionId, sessionIdFinal),
            orderBy: [desc(schema.sebChatMessage.createdAt)],
            limit: 20,
        }),
    ]);

    await db.insert(schema.sebChatMessage).values({
        id: randomUUID(),
        sessionId: sessionIdFinal,
        role: "USER",
        content: message,
    });

    const answer = await callOpenRouter(
        settings,
        [
            {
                role: "system",
                content: `${DEFAULT_SEB_PROMPT}\nYou are in chat mode. Ignore any report-mode JSON-only instruction for this reply. Return clean plain text only, with short paragraphs or simple numbered lists. Do not wrap the answer in JSON, markdown fences, or a response/message/content object. Answer conversationally but stay strictly scoped to this organization's social media. If asked unrelated questions, kindly redirect back to social media advice.`,
            },
            { role: "user", content: `Organization context for Seb chat:\n${JSON.stringify(context).slice(0, 65000)}` },
            ...history.map((item) => ({ role: (item.role === "USER" ? "user" : "assistant") as "user" | "assistant", content: item.content })),
            { role: "user", content: message },
        ],
        4000,
        false,
    );

    const saved = await db.insert(schema.sebChatMessage)
        .values({
            id: randomUUID(),
            sessionId: sessionIdFinal,
            role: "ASSISTANT",
            content: answer,
        })
        .returning({ id: schema.sebChatMessage.id });

    await db.update(schema.sebChatSession)
        .set({ updatedAt: new Date() })
        .where(eq(schema.sebChatSession.id, sessionIdFinal));

    return { sessionId: sessionIdFinal, answer, messageId: saved[0]?.id };
}

export async function listSebSessions(organizationId: string, userId: string) {
    const sessions = await db.query.sebChatSession.findMany({
        where: and(eq(schema.sebChatSession.organizationId, organizationId), eq(schema.sebChatSession.userId, userId)),
        orderBy: [desc(schema.sebChatSession.updatedAt)],
        limit: 50,
    });
    return sessions.map((s) => ({
        id: s.id,
        title: s.title,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
    }));
}

export async function getSebSessionMessages(organizationId: string, sessionId: string) {
    const session = await db.query.sebChatSession.findFirst({
        where: and(eq(schema.sebChatSession.id, sessionId), eq(schema.sebChatSession.organizationId, organizationId)),
        columns: { id: true, title: true },
    });
    if (!session) return null;

    const messages = await db.query.sebChatMessage.findMany({
        where: eq(schema.sebChatMessage.sessionId, sessionId),
        orderBy: [asc(schema.sebChatMessage.createdAt)],
    });
    return {
        id: session.id,
        title: session.title,
        messages: messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.createdAt.toISOString(),
        })),
    };
}

// ============================================================================
// Brand knowledge
// ============================================================================

export async function getBrandKnowledge(organizationId: string) {
    const kb = await db.query.sebBrandKnowledge.findFirst({
        where: eq(schema.sebBrandKnowledge.organizationId, organizationId),
    });
    return kb
        ? {
            id: kb.id,
            websiteUrl: kb.websiteUrl,
            audience: kb.audience,
            positioning: kb.positioning,
            products: kb.products,
            offers: kb.offers,
            voiceRules: kb.voiceRules,
            bannedTopics: kb.bannedTopics,
            learnedInsights: kb.learnedInsights,
            pendingInsights: kb.pendingInsights,
            websiteScanSummary: kb.websiteScanSummary,
            websiteScannedAt: kb.websiteScannedAt?.toISOString() ?? null,
            updatedAt: kb.updatedAt.toISOString(),
        }
        : null;
}

export async function updateBrandKnowledge(
    organizationId: string,
    input: Partial<{
        websiteUrl: string;
        audience: string;
        positioning: string;
        products: string;
        offers: string;
        voiceRules: string;
        bannedTopics: string;
    }>,
) {
    const existing = await db.query.sebBrandKnowledge.findFirst({
        where: eq(schema.sebBrandKnowledge.organizationId, organizationId),
        columns: { id: true },
    });

    if (existing) {
        await db.update(schema.sebBrandKnowledge)
            .set({ ...input, updatedAt: new Date() })
            .where(eq(schema.sebBrandKnowledge.id, existing.id));
        return { ok: true };
    }

    await db.insert(schema.sebBrandKnowledge).values({
        id: randomUUID(),
        organizationId,
        websiteUrl: input.websiteUrl ?? null,
        audience: input.audience ?? null,
        positioning: input.positioning ?? null,
        products: input.products ?? null,
        offers: input.offers ?? null,
        voiceRules: input.voiceRules ?? null,
        bannedTopics: input.bannedTopics ?? null,
    });
    return { ok: true };
}

// ============================================================================
// Website scan untuk brand knowledge
// ============================================================================

function isBlockedHostname(hostname: string) {
    const host = hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
    if (host === "0.0.0.0" || host.startsWith("127.") || host === "::1" || host === "[::1]") return true;

    const parts = host.split(".").map((part) => Number(part));
    if (parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
        if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0) return true;
        if (parts[0] === 192 && parts[1] === 168) return true;
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
        if (parts[0] === 169 && parts[1] === 254) return true;
    }
    return false;
}

function normalizeWebsiteUrl(input: string): URL {
    const trimmed = input.trim();
    if (!trimmed) throw new Error("URL website wajib diisi.");

    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProtocol);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("URL website harus menggunakan http atau https");
    if (isBlockedHostname(url.hostname)) throw new Error("URL website tidak diizinkan");
    url.hash = "";
    return url;
}

function stripHtml(html: string) {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();
}

function pageTitle(html: string) {
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return match ? stripHtml(match[1]).slice(0, 140) : null;
}

function discoverInternalLinks(html: string, baseUrl: URL) {
    const links = new Map<string, number>();
    const priorityWords = ["about", "services", "products", "shop", "menu", "pricing", "contact", "story", "brand"];
    const regex = /href=["']([^"'#]+)["']/gi;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(html)) !== null) {
        try {
            const url = new URL(match[1], baseUrl);
            if (url.origin !== baseUrl.origin || isBlockedHostname(url.hostname)) continue;
            if (!["http:", "https:"].includes(url.protocol)) continue;
            url.hash = "";
            const normalized = url.toString();
            const path = `${url.pathname} ${url.search}`.toLowerCase();
            const score = priorityWords.reduce((total, word) => total + (path.includes(word) ? 2 : 0), 0) - path.length / 500;
            links.set(normalized, Math.max(links.get(normalized) ?? -Infinity, score));
        } catch {
            // Abaikan link yang tidak valid.
        }
    }

    return Array.from(links.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([url]) => url)
        .filter((url) => url !== baseUrl.toString())
        .slice(0, 4);
}

async function fetchWebsitePage(url: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: { "User-Agent": "SebBrandCrawler/1.0 (+https://sahabat-kreator.com)" },
        });
        if (!response.ok) throw new Error(`Website mengembalikan status ${response.status}`);

        const finalUrl = normalizeWebsiteUrl(response.url || url).toString();
        const contentType = response.headers.get("content-type") || "";
        if (contentType && !contentType.includes("text/html") && !contentType.includes("text/plain")) {
            throw new Error("Website tidak mengembalikan teks/HTML yang bisa dibaca");
        }

        const html = (await response.text()).slice(0, 500_000);
        return { url: finalUrl, title: pageTitle(html), html, text: stripHtml(html).slice(0, 12000) };
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Scan website org → ekstrak brand knowledge via AI → simpan ke pendingInsights
 * (belum di-approve; user bisa menyalin ke field brand knowledge di halaman Seb).
 */
export async function scanWebsiteForBrandKnowledge({
    organizationId,
    websiteUrl,
}: {
    organizationId: string;
    websiteUrl?: string;
}) {
    const settings = getOpenRouterSettings();
    if (!settings) {
        throw new Error("OpenRouter belum dikonfigurasi. Atur OPENROUTER_API_KEY di environment untuk mengaktifkan Seb.");
    }

    const existing = await db.query.sebBrandKnowledge.findFirst({
        where: eq(schema.sebBrandKnowledge.organizationId, organizationId),
        columns: { websiteUrl: true },
    });

    const target = normalizeWebsiteUrl(websiteUrl || existing?.websiteUrl || "");
    const homepage = await fetchWebsitePage(target.toString());
    const pages = [homepage];

    for (const link of discoverInternalLinks(homepage.html, new URL(homepage.url))) {
        if (pages.length >= 5) break;
        try {
            pages.push(await fetchWebsitePage(link));
        } catch {
            // Lewati halaman yang gagal di-crawl.
        }
    }

    const sourceText = pages
        .filter((page) => page.text.length > 100)
        .map((page, index) => `Halaman ${index + 1}: ${page.title || page.url}\nURL: ${page.url}\n${page.text}`)
        .join("\n\n---\n\n")
        .slice(0, 50000);

    if (!sourceText) throw new Error("Seb tidak menemukan teks brand yang bisa dibaca di website ini.");

    const raw = await callOpenRouter(
        settings,
        [
            { role: "system", content: "You extract brand knowledge for a social media advisor. Use only supplied website text. Return strict JSON only." },
            {
                role: "user",
                content: `Ekstrak detail bisnis dan brand dari hasil crawl website ini. Kembalikan JSON dengan bentuk persis ini: {"audience":"string|null","positioning":"string|null","products":"string|null","offers":"string|null","voiceRules":"string|null","bannedTopics":"string|null","learnedInsights":["string"],"crawlSummary":"string","confidence":0.0}. Jangan mengarang detail yang tidak didukung teks sumber. Jaga tiap string ringkas tapi spesifik.\n\nWebsite: ${target.toString()}\n\n${sourceText}`,
            },
        ],
        1800,
        true,
    );

    const parsed = safeJsonParse<Record<string, unknown>>(raw) || {};
    const pendingInsights = {
        source: "website_crawl",
        websiteUrl: target.toString(),
        scannedAt: new Date().toISOString(),
        pages: pages.map((page) => ({ url: page.url, title: page.title })),
        audience: typeof parsed.audience === "string" ? parsed.audience : null,
        positioning: typeof parsed.positioning === "string" ? parsed.positioning : null,
        products: typeof parsed.products === "string" ? parsed.products : null,
        offers: typeof parsed.offers === "string" ? parsed.offers : null,
        voiceRules: typeof parsed.voiceRules === "string" ? parsed.voiceRules : null,
        bannedTopics: typeof parsed.bannedTopics === "string" ? parsed.bannedTopics : null,
        learnedInsights: Array.isArray(parsed.learnedInsights) ? parsed.learnedInsights.filter((item) => typeof item === "string").slice(0, 12) : [],
        crawlSummary: typeof parsed.crawlSummary === "string" ? parsed.crawlSummary : "Seb memindai website dan menemukan konteks brand.",
        confidence: typeof parsed.confidence === "number" ? Math.min(Math.max(parsed.confidence, 0), 1) : 0.5,
    };

    const knowledge = await db.query.sebBrandKnowledge.findFirst({
        where: eq(schema.sebBrandKnowledge.organizationId, organizationId),
        columns: { id: true },
    });
    if (knowledge) {
        await db.update(schema.sebBrandKnowledge)
            .set({
                websiteUrl: target.toString(),
                pendingInsights,
                websiteScanSummary: { pages: pendingInsights.pages, crawlSummary: pendingInsights.crawlSummary, confidence: pendingInsights.confidence },
                websiteScannedAt: new Date(),
                updatedBySebAt: new Date(),
            })
            .where(eq(schema.sebBrandKnowledge.id, knowledge.id));
    } else {
        await db.insert(schema.sebBrandKnowledge).values({
            id: randomUUID(),
            organizationId,
            websiteUrl: target.toString(),
            pendingInsights,
            websiteScanSummary: { pages: pendingInsights.pages, crawlSummary: pendingInsights.crawlSummary, confidence: pendingInsights.confidence },
            websiteScannedAt: new Date(),
            updatedBySebAt: new Date(),
        });
    }

    return { pages: pendingInsights.pages, pendingInsights };
}

export function normalizeSebTimezone(timezone?: string | null): string {
    if (!timezone) return "UTC";
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
        return timezone;
    } catch {
        return "UTC";
    }
}