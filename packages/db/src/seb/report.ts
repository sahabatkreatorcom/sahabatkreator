// SEB — generator report coaching AI (JSON mode + repair + fallback rule-based).
// Dipakai: route POST /seb/report/generate (async 202) & worker proactive harian.
import { createHash } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import { generateId } from "../id";
import { db } from "../index";
import { notifyOrganization } from "../notify";
import {
  organization,
  platformSettings,
  postGroup,
  sebBrandKnowledge,
  sebExperiment,
  sebRecommendation,
  sebReport,
} from "../schema";
import { collectSebContext, isSameSebLocalDate, type SebContext } from "./context";
import {
  callSebModel,
  getSebSettings,
  logSebUsage,
  SEB_CATEGORIES,
  SEB_PLATFORMS,
  SEB_PRIORITIES,
  type SebCategory,
  type SebPlatform,
  type SebPriority,
  type SebSettings,
  safeJsonParse,
} from "./settings";

// ID generator lokal — schema/id.ts generateId sama dipakai di packages lain,
// tapi packages/db tidak punya file id.ts terpisah; pakai pola yang sama.
// (notify.ts punya implementasi generateId-nya sendiri — konsisten sk_)

export type SebAdviceResponse = {
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
    evidence?: Record<string, unknown>;
    citations?: unknown[];
    impactBaseline?: Record<string, unknown>;
  }>;
  experiments?: Array<{
    title?: string;
    hypothesis?: string;
    platform?: string | null;
    metric?: string;
    baseline?: Record<string, unknown>;
  }>;
  brandKnowledgeUpdates?: Record<string, unknown> | null;
  progressNotes?: string[];
};

export type GenerateSebReportOptions = {
  organizationId: string;
  userId?: string;
  trigger?: "proactive" | "manual";
  /** ID report placeholder yang sudah dibuat route (status generating) */
  reportId?: string;
};

function clamp01(value: unknown, fallback = 0.6): number {
  const num = typeof value === "number" ? value : fallback;
  return Math.min(Math.max(num, 0), 1);
}

function clampScore(value: unknown): number | null {
  if (typeof value !== "number") return null;
  return Math.min(Math.max(Math.round(value), 0), 100);
}

function normalizePlatform(value: unknown): SebPlatform | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase();
  return (SEB_PLATFORMS as readonly string[]).includes(normalized)
    ? (normalized as SebPlatform)
    : null;
}

function normalizeCategory(value: unknown): SebCategory {
  const normalized = typeof value === "string" ? value.toLowerCase().replace(/[\s-]+/g, "_") : "";
  return (SEB_CATEGORIES as readonly string[]).includes(normalized)
    ? (normalized as SebCategory)
    : "content_strategy";
}

function normalizePriority(value: unknown): SebPriority {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  return (SEB_PRIORITIES as readonly string[]).includes(normalized)
    ? (normalized as SebPriority)
    : "medium";
}

/** Repair JSON rusak via model kedua */
async function repairSebJson(
  settings: SebSettings,
  raw: string,
): Promise<SebAdviceResponse | null> {
  const repaired = await callSebModel(
    settings,
    [
      {
        role: "system",
        content:
          "You repair malformed AI output into valid JSON only. Do not add markdown or commentary.",
      },
      {
        role: "user",
        content: `Convert this response into valid JSON matching the Seb report schema. If fields are missing, infer conservative values from the text. Return JSON only.\n\n${raw.slice(0, 30000)}`,
      },
    ],
    { maxTokens: 2500, jsonMode: true },
  );
  return safeJsonParse<SebAdviceResponse>(repaired);
}

/** Report konservatif rule-based bila model gagal format */
function fallbackSebReport(context: SebContext): SebAdviceResponse {
  const platforms = Array.from(new Set(context.accounts.map((a) => a.platform))).filter(Boolean);
  const postCount = context.posts.length;

  return {
    title: "Report coaching media sosial dari Seb",
    summary: `Seb telah meninjau ${postCount} konten terbaru${platforms.length ? ` di ${platforms.join(", ")}` : ""}. Respons AI memerlukan perbaikan format, jadi report ini berfokus pada langkah aman berbasis data akun yang tersedia.`,
    overallScore: postCount > 0 ? 62 : 40,
    scoreBreakdown: {
      captions: postCount > 0 ? 60 : 35,
      visualHooks: postCount > 0 ? 58 : 35,
      videoQuality: postCount > 0 ? 55 : 35,
      platformFit: platforms.length > 0 ? 65 : 40,
      brandConsistency: 60,
      competitorGap: context.competitors.length > 0 ? 60 : 45,
      postingRhythm: postCount > 0 ? 62 : 35,
    },
    confidence: 0.35,
    recommendations: [
      {
        title: "Perkuat kesan pertama di setiap konten",
        advice:
          "Tinjau baris pembuka, frame pertama, atau thumbnail sebelum publish. Buat manfaat bagi penonton langsung terasa dan hapus pembukaan bertele-tele yang menunda hook.",
        rationale:
          "Seb tidak dapat mengurai respons model dengan andal, tapi kejelasan hook adalah perbaikan aman berdampak besar di semua platform media sosial.",
        category: "creative",
        priority: "high",
        platform: null,
        confidence: 0.45,
        evidence: {
          basedOn: `${postCount} konten tersedia dalam konteks Seb`,
          metrics: ["riwayat konten"],
        },
        citations: [{ type: "post", label: "Konten organisasi terbaru", id: "recent-posts" }],
        impactBaseline: {
          metric: "engagementRate",
          current: "Gunakan rata-rata 30 hari terakhir sebagai baseline",
        },
      },
      {
        title: "Lengkapi brand knowledge agar saran lebih tajam",
        advice:
          "Isi brand knowledge Seb untuk audiens, positioning, produk, penawaran, aturan tone, dan topik yang harus dihindari. Ini memberi Seb batasan kuat dan rekomendasi lebih spesifik.",
        rationale:
          "Konteks brand meningkatkan kualitas saran caption, kreatif, dan kompetitor sekaligus menjaga Seb tetap fokus pada bisnis ini saja.",
        category: "brand",
        priority: "medium",
        platform: null,
        confidence: 0.5,
        evidence: {
          basedOn: "Ketersediaan brand knowledge Seb",
          metrics: ["kelengkapan konteks brand"],
        },
        citations: [
          { type: "platform_knowledge", label: "Brand knowledge Seb", id: "seb-brand-knowledge" },
        ],
      },
    ],
    experiments: [
      {
        title: "Uji hook yang lebih jelas selama tujuh hari",
        hypothesis:
          "Konten dengan manfaat langsung di baris atau frame pertama akan berkinerja lebih baik daripada pembukaan yang samar.",
        platform: null,
        metric: "engagementRate",
        baseline: { current: "Rata-rata engagement rate 30 hari terakhir" },
      },
    ],
    brandKnowledgeUpdates: null,
    progressNotes: ["Fallback report dibuat karena respons model bukan JSON valid."],
  };
}

const REPORT_PROMPT = `Create a proactive Seb social media coaching report for this organization. Use all supplied data, include competitor opportunities, progress tracking, confidence, citations, impact baselines, and advice for all connected platforms equally. When scoring captions, separate written post captions from on-video captions/subtitles/text overlays. Do not penalize STORY posts for short or missing written captions because Stories often rely on visual text and stickers instead. Write ALL human-readable text (title, summary, advice, rationale, hypothesis, progress notes) in Bahasa Indonesia; keep enum values and field names exactly as the schema specifies. Return strict JSON with this shape: {"title":"string","summary":"string","overallScore":0-100,"scoreBreakdown":{"captions":0-100,"visualHooks":0-100,"videoQuality":0-100,"platformFit":0-100,"brandConsistency":0-100,"competitorGap":0-100,"postingRhythm":0-100},"confidence":0-1,"recommendations":[{"title":"string","advice":"string","rationale":"string","category":"content_strategy|caption|creative|video|timing|hashtag|platform|competitor|brand","priority":"low|medium|high","platform":"instagram|facebook|tiktok|youtube|pinterest|linkedin|bluesky|threads|google_business|null","confidence":0-1,"evidence":{"basedOn":"string","postIds":["id"],"metrics":["string"]},"citations":[{"type":"post|analytics|competitor|platform_knowledge","label":"string","id":"string"}],"impactBaseline":{"metric":"string","current":"string"}}],"experiments":[{"title":"string","hypothesis":"string","platform":"instagram|facebook|tiktok|youtube|pinterest|linkedin|bluesky|threads|google_business|null","metric":"string","baseline":{"current":"string"}}],"brandKnowledgeUpdates":{"learnedInsights":["string"]},"progressNotes":["string"]}.

Context:
`;

/** Generate report SEB untuk satu org — simpan + notifikasi */
export async function generateSebReport({
  organizationId,
  userId,
  trigger = "manual",
  reportId,
}: GenerateSebReportOptions) {
  const settings = await getSebSettings();

  try {
    const context = await collectSebContext(organizationId);
    const inputHash = createHash("sha256").update(JSON.stringify(context)).digest("hex");

    const content = await callSebModel(
      settings,
      [
        { role: "system", content: settings.systemPrompt },
        {
          role: "system",
          content:
            "Treat all posting times, scheduled times, and timing recommendations in the organization timezone from context.timezone. Use local date/time fields when present instead of inferring wall-clock times from UTC timestamps.",
        },
        { role: "user", content: REPORT_PROMPT + JSON.stringify(context).slice(0, 90000) },
      ],
      { maxTokens: 3500, jsonMode: true },
    );

    let parsed = safeJsonParse<SebAdviceResponse>(content);
    if (!parsed) {
      console.warn("[seb] respons invalid JSON, mencoba repair");
      try {
        parsed = await repairSebJson(settings, content);
      } catch (error) {
        console.warn("[seb] repair gagal:", error);
      }
    }
    if (!parsed) {
      console.warn("[seb] repair gagal, pakai fallback report");
      parsed = fallbackSebReport(context);
    }

    // Normalisasi socialAccountId — infer dari evidence postIds bila eksplisit invalid
    const accountIds = new Set(context.accounts.map((a) => a.id));
    const postAccountIds = new Map(
      context.posts
        .map((p) => [p.id, p.socialAccountId] as const)
        .filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
    );
    const inferSocialAccountId = (
      rec: NonNullable<SebAdviceResponse["recommendations"]>[number],
    ) => {
      const explicit =
        typeof rec.socialAccountId === "string" && accountIds.has(rec.socialAccountId)
          ? rec.socialAccountId
          : null;
      if (explicit) return explicit;

      const evidence =
        rec.evidence && typeof rec.evidence === "object"
          ? (rec.evidence as { postIds?: unknown })
          : null;
      const postIds = Array.isArray(evidence?.postIds)
        ? evidence.postIds.filter((id): id is string => typeof id === "string")
        : [];
      const citationPostIds = Array.isArray(rec.citations)
        ? rec.citations
            .filter(
              (citation): citation is { type?: unknown; id?: unknown } =>
                Boolean(citation) && typeof citation === "object",
            )
            .flatMap((citation) =>
              citation.type === "post" && typeof citation.id === "string" ? [citation.id] : [],
            )
        : [];
      const matchedAccountIds = new Set(
        [...postIds, ...citationPostIds]
          .map((postId) => postAccountIds.get(postId))
          .filter((id): id is string => Boolean(id)),
      );
      return matchedAccountIds.size === 1 ? [...matchedAccountIds][0] : null;
    };

    const recommendationValues = (parsed.recommendations ?? []).slice(0, 20).map((rec) => {
      const socialAccountId = inferSocialAccountId(rec);
      return {
        id: generateId("sebrec"),
        organizationId,
        socialAccountId,
        reportId: reportId ?? "",
        platform: normalizePlatform(rec.platform),
        category: normalizeCategory(rec.category),
        priority: normalizePriority(rec.priority),
        status: "new" as const,
        title: rec.title || "Tingkatkan performa konten",
        advice: rec.advice || "",
        rationale: rec.rationale ?? null,
        evidence: rec.evidence ?? {},
        citations: rec.citations ?? [],
        impactBaseline: rec.impactBaseline ?? null,
        confidence: clamp01(rec.confidence),
      };
    });

    const experimentValues = (parsed.experiments ?? []).slice(0, 8).map((experiment) => ({
      id: generateId("sebexp"),
      organizationId,
      reportId: reportId ?? "",
      title: experiment.title || "Eksperimen konten dari Seb",
      hypothesis:
        experiment.hypothesis ||
        "Menguji ide ini kemungkinan dapat meningkatkan performa media sosial.",
      platform: normalizePlatform(experiment.platform),
      metric: experiment.metric || "engagement_rate",
      status: "planned" as const,
      baseline: experiment.baseline ?? {},
    }));

    const reportValues = {
      organizationId,
      trigger,
      status: "completed" as const,
      title: parsed.title || "Report coaching media sosial harian dari Seb",
      summary: parsed.summary || "Seb telah meninjau konten & analitik Anda terbaru.",
      overallScore: clampScore(parsed.overallScore),
      scoreBreakdown: parsed.scoreBreakdown ?? {},
      confidence: clamp01(parsed.confidence),
      model: settings.model,
      inputHash,
      generatedByUserId: userId ?? null,
      dataStartDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      dataEndDate: new Date(),
      metadata: { progressNotes: parsed.progressNotes ?? [] },
    };

    let savedReport: typeof sebReport.$inferSelect | undefined;
    if (reportId) {
      // Placeholder dari route (status generating) — isi sekarang
      [savedReport] = await db
        .update(sebReport)
        .set(reportValues)
        .where(eq(sebReport.id, reportId))
        .returning();
      // Hapus children placeholder lama (jika regenerasi) lalu insert baru
      await db.delete(sebRecommendation).where(eq(sebRecommendation.reportId, reportId));
      await db.delete(sebExperiment).where(eq(sebExperiment.reportId, reportId));
      if (recommendationValues.length > 0) {
        await db.insert(sebRecommendation).values(recommendationValues);
      }
      if (experimentValues.length > 0) {
        await db.insert(sebExperiment).values(experimentValues);
      }
    } else {
      [savedReport] = await db
        .insert(sebReport)
        .values({ id: generateId("sebrpt"), ...reportValues })
        .returning();
      if (!savedReport) throw new Error("Gagal menyimpan SEB report");
      const insertedReport = savedReport;
      if (recommendationValues.length > 0) {
        await db
          .insert(sebRecommendation)
          .values(recommendationValues.map((r) => ({ ...r, reportId: insertedReport.id })));
      }
      if (experimentValues.length > 0) {
        await db
          .insert(sebExperiment)
          .values(experimentValues.map((e) => ({ ...e, reportId: insertedReport.id })));
      }
    }

    // Update brand knowledge pending insights (hasil report — menunggu approval user)
    if (parsed.brandKnowledgeUpdates) {
      const existing = await db
        .select({ id: sebBrandKnowledge.id })
        .from(sebBrandKnowledge)
        .where(eq(sebBrandKnowledge.organizationId, organizationId))
        .limit(1);
      const pendingData = {
        source: "seb_report",
        ...parsed.brandKnowledgeUpdates,
        generatedAt: new Date().toISOString(),
      };
      if (existing.length > 0) {
        await db
          .update(sebBrandKnowledge)
          .set({ pendingInsights: pendingData, updatedBySebAt: new Date() })
          .where(eq(sebBrandKnowledge.organizationId, organizationId));
      } else {
        await db.insert(sebBrandKnowledge).values({
          id: generateId("sebbk"),
          organizationId,
          pendingInsights: pendingData,
          updatedBySebAt: new Date(),
        });
      }
    }

    // Notifikasi report siap
    await notifyOrganization({
      organizationId,
      type: "system",
      title: "Report Seb sudah siap",
      body: "Seb telah menyelesaikan report coaching media sosial terbaru Anda.",
      linkUrl: "/dashboard/seb",
    });
    await logSebUsage({ organizationId, userId, action: "seb_report", model: settings.model });

    if (recommendationValues.some((r) => r.priority === "high")) {
      await notifyOrganization({
        organizationId,
        type: "warning",
        title: "Seb menemukan saran prioritas tinggi",
        body: "Report Seb terbaru memuat rekomendasi media sosial berprioritas tinggi.",
        linkUrl: "/dashboard/seb",
      });
    }

    return savedReport;
  } catch (error) {
    if (reportId) {
      await db
        .update(sebReport)
        .set({
          status: "failed",
          summary: error instanceof Error ? error.message : "Seb report generation failed",
        })
        .where(eq(sebReport.id, reportId))
        .catch(() => undefined);
    }
    throw error;
  }
}

/** Sweep semua org — generate report proactive untuk yang belum ada hari ini (waktu lokal org) */
export async function generateDueSebReports(): Promise<{ generated: number; skipped: number }> {
  const [settings] = await db
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.id, "singleton"))
    .limit(1);

  if (!settings?.sebEnabled || !settings.sebProactiveEnabled) {
    return { generated: 0, skipped: 0 };
  }

  const orgs = await db.select({ id: organization.id }).from(organization);
  let generated = 0;
  let skipped = 0;
  const now = new Date();

  for (const org of orgs) {
    // Dedupe: skip bila sudah ada report dibuat pada tanggal lokal yang sama
    const [latest] = await db
      .select({ createdAt: sebReport.createdAt })
      .from(sebReport)
      .where(eq(sebReport.organizationId, org.id))
      .orderBy(desc(sebReport.createdAt))
      .limit(1);

    // Timezone org (post_group dominan — fallback Asia/Jakarta)
    const tzRows = await db
      .select({ timezone: sql<string>`mode() within group (order by ${postGroup.timezone})` })
      .from(postGroup)
      .where(eq(postGroup.organizationId, org.id));
    const timezone = tzRows[0]?.timezone || "Asia/Jakarta";

    if (latest && isSameSebLocalDate(latest.createdAt, now, timezone)) {
      skipped += 1;
      continue;
    }

    try {
      await generateSebReport({ organizationId: org.id, trigger: "proactive" });
      generated += 1;
    } catch (error) {
      skipped += 1;
      console.error(`[seb] proactive report gagal untuk org ${org.id}:`, error);
    }
  }

  return { generated, skipped };
}
