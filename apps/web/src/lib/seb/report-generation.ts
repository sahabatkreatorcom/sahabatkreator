import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";
import { callOpenRouter, getOpenRouterSettings, safeJsonParse } from "@/lib/ai/openrouter";
import { collectContext } from "./context-collector";
import {
    DEFAULT_SEB_PROMPT,
    type SebAdviceResponse,
    type SebContext,
    type GenerateSebReportOptions,
} from "./types";

// ============================================================================
// Utility helpers
// ============================================================================

function clamp01(value: unknown, fallback = 0.6): number {
    const num = typeof value === "number" ? value : fallback;
    return Math.min(Math.max(num, 0), 1);
}

function toPlatform(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const normalized = value.toUpperCase();
    const known = Object.keys({
        INSTAGRAM: "", FACEBOOK: "", TIKTOK: "", YOUTUBE: "", PINTEREST: "",
        GOOGLE_BUSINESS: "", LINKEDIN: "", BLUESKY: "", THREADS: "", META: "", MANUAL: "",
    });
    return known.includes(normalized) ? normalized : null;
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

// ============================================================================
// Fallback report (used when AI response cannot be parsed)
// ============================================================================

function fallbackSebReport(context: SebContext) {
    const platforms = Array.from(new Set(context.accounts.map((a) => a.platform))).filter(Boolean);
    const postCount = context.posts.length;

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
            competitorGap: context.competitors.length ? 60 : 45,
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
    } satisfies SebAdviceResponse;
}

// ============================================================================
// Format helpers for DB rows → API response
// ============================================================================

function formatReport(
    report: {
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
    },
    full = false,
) {
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
        account: socialAccount
            ? { id: socialAccount.id, name: socialAccount.name, username: socialAccount.username, platform: socialAccount.platform }
            : null,
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

// ============================================================================
// Public API
// ============================================================================

export async function generateSebReport({ organizationId, userId, trigger = "MANUAL", reportId }: GenerateSebReportOptions) {
    const settings = getOpenRouterSettings();
    if (!settings) {
        throw new Error(
            "OpenRouter belum dikonfigurasi. Atur OPENROUTER_API_KEY di environment untuk mengaktifkan Seb.",
        );
    }

    try {
        const context = await collectContext(organizationId);
        const inputHash = await hashObject(context);

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
            link: "/seb",
        });

        const highPriority = recs.some((rec) => normalizePriority(rec.priority) === "HIGH");
        if (highPriority) {
            await db.insert(schema.notification).values({
                id: randomUUID(),
                organizationId,
                title: "Seb menemukan saran prioritas tinggi",
                message: "Laporan Seb baru berisi rekomendasi prioritas tinggi untuk media sosial Anda.",
                type: "warning",
                link: "/seb",
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

// ============================================================================
// Query helpers
// ============================================================================

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
// Internal helpers
// ============================================================================

async function hashObject(obj: unknown): Promise<string> {
    const { createHash } = await import("node:crypto");
    return createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}
