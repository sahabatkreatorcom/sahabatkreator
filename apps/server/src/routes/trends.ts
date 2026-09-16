// API Tren — Google Trends harian Indonesia + AI generate ide konten dari tren

import { db } from "@sahabatkreator/db";
import { brandVoice } from "@sahabatkreator/db/schema";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { aiCreditCost, chatCompletion, consumeAiCredits, getAiConfig } from "../lib/ai";
import { errorResponse, requireOrg } from "../lib/auth-guard";
import { getOrgLimits } from "../lib/billing";
import { fetchDailyTrendsID } from "../lib/trends";

export const trendsRoute = new Hono();

/** GET /trends?limit=20 — tren pencarian Google Indonesia hari ini */
trendsRoute.get("/", async (c) => {
  try {
    await requireOrg(c); // khusus user login (bukan publik) — data internal dashboard
    const limit = Math.min(Number(c.req.query("limit") ?? 20), 40);
    const trends = await fetchDailyTrendsID(limit);
    return c.json({
      trends,
      fetchedAt: new Date().toISOString(),
      available: trends.length > 0,
    });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------- POST /trends/ideas — AI ide konten dari tren ----------

const ideasSchema = z.object({
  trend: z.string().min(2).max(200),
  platform: z.enum([
    "instagram",
    "facebook",
    "tiktok",
    "youtube",
    "linkedin",
    "pinterest",
    "threads",
    "x",
  ]),
  niche: z.string().max(120).optional(),
});

trendsRoute.post("/ideas", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = ideasSchema.parse(await c.req.json());

    const config = await getAiConfig();
    if (!config) {
      return c.json({ message: "Fitur AI belum dikonfigurasi. Hubungi admin platform." }, 503);
    }

    const limits = await getOrgLimits(ctx.organization.id);
    const action = "trend_ideas";
    const usage = await consumeAiCredits(ctx.organization.id, limits.aiCreditsPerMonth, {
      userId: ctx.user.id,
      action,
      platform: input.platform,
      model: config.model,
      credits: aiCreditCost(action),
    });

    // Brand voice sebagai konteks prompt (konsisten dengan AI suite)
    const [voice] = await db
      .select()
      .from(brandVoice)
      .where(eq(brandVoice.organizationId, ctx.organization.id))
      .limit(1);
    const voicePrompt = voice
      ? `\n\nBRAND VOICE (patuhi): ${voice.description ?? ""} Tone: ${voice.tones.join(", ")}.${voice.avoid.length > 0 ? ` HINDARI: ${voice.avoid.join(", ")}.` : ""}`
      : "";
    const niche = input.niche ? `Bidang usaha: ${input.niche}.` : "";

    const system = `Kamu adalah strategist konten social media Indonesia untuk UMKM.${voicePrompt}\nKembalikan 3 ide konten HANYA dalam format JSON array: [{"title": "judul singkat", "angle": "sudut pandang/hook", "caption": "caption siap pakai", "hashtags": ["tag1","tag2","tag3"]}] — tanpa teks lain, tanpa markdown fence.`;
    const user = `Tren Google Indonesia saat ini: "${input.trend}". ${niche}\nBuat 3 ide konten ${input.platform} yang memanfaatkan tren ini untuk UMKM Indonesia — relevan, mudah dieksekusi, bukan sekadar menumpang tren.`;

    const raw = await chatCompletion(config, system, user, {
      temperature: 0.9,
      maxTokens: 1200,
    });

    // Parse JSON (toleran fence + prefix)
    const cleaned = raw.replace(/```json|```/g, "").trim();
    let ideas: unknown;
    try {
      ideas = JSON.parse(cleaned);
    } catch {
      return c.json(
        { message: "AI mengembalikan format yang tidak bisa dibaca — coba lagi." },
        502,
      );
    }
    if (!Array.isArray(ideas)) {
      return c.json(
        { message: "AI mengembalikan format yang tidak bisa dibaca — coba lagi." },
        502,
      );
    }

    return c.json({ ideas, credits: usage });
  } catch (error) {
    return errorResponse(error);
  }
});
