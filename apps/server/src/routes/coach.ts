// API Coach — ringkasan performa + saran aksi AI

import { db } from "@sahabatkreator/db";
import { brandVoice } from "@sahabatkreator/db/schema";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { chatCompletion, consumeAiCredits, getAiConfig } from "../lib/ai";
import { errorResponse, requireOrg } from "../lib/auth-guard";
import { getOrgLimits } from "../lib/billing";
import { getCoachSummary } from "../lib/coach";

export const coachRoute = new Hono();

/** GET /coach — ringkasan performa 30 hari (data riil analytics) */
coachRoute.get("/", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const summary = await getCoachSummary(ctx.organization.id);
    return c.json(summary);
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------- POST /coach/advice — saran aksi AI ----------

const adviceSchema = z.object({
  /** Fokus saran opsional: growth, engagement, konsistensi */
  focus: z.enum(["growth", "engagement", "konsistensi"]).optional(),
});

coachRoute.post("/advice", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = adviceSchema.parse(await c.req.json().catch(() => ({})));

    const config = await getAiConfig();
    if (!config) {
      return c.json({ message: "Fitur AI belum dikonfigurasi. Hubungi admin platform." }, 503);
    }

    const limits = await getOrgLimits(ctx.organization.id);
    const usage = await consumeAiCredits(ctx.organization.id, limits.aiCreditsPerMonth, {
      userId: ctx.user.id,
      action: "coach_advice",
      model: config.model,
    });

    const summary = await getCoachSummary(ctx.organization.id);
    if (!summary.hasData) {
      return c.json(
        {
          message:
            "Belum ada data performa — hubungkan akun sosmed dan tunggu analytics terisi (maks 1 jam) agar Coach bisa menganalisis.",
        },
        409,
      );
    }

    // Brand voice sebagai konteks (konsisten dengan AI suite lain)
    const [voice] = await db
      .select()
      .from(brandVoice)
      .where(eq(brandVoice.organizationId, ctx.organization.id))
      .limit(1);
    const voicePrompt = voice?.description ? `\nKonteks brand: ${voice.description}` : "";

    const platformStats = summary.perPlatform
      .map(
        (p) =>
          `${p.platform}: ${p.publishedCount} post, ${p.totalLikes} likes, ${p.totalComments} komentar, engagement rate ${p.engagementRate ?? "?"}%, followers ${p.followersLatest ?? "?"} (delta ${p.followersDelta ?? "?"})`,
      )
      .join("\n");
    const topPost = summary.topPost
      ? `Post terbaik: "${summary.topPost.content}" (${summary.topPost.platform}, ${summary.topPost.likes} likes, ${summary.topPost.comments} komentar)`
      : "Belum ada post dengan data engagement";
    const focus = input.focus ? `Fokus saran: ${input.focus}.` : "";

    const system = `Kamu adalah social media coach berpengalaman untuk UMKM Indonesia. Analisis data performa dan berikan saran yang konkret, bisa dieksekusi, spesifik angka. Bahasa Indonesia santai-profesional.${voicePrompt}\nKembalikan HANYA JSON: {"insight": "1-2 kalimat diagnosis keseluruhan", "actions": [{"title": "aksi singkat", "detail": "langkah konkret", "impact": "low|medium|high"}], "weeklyGoal": "target minggu depan yang realistis"} — tanpa teks lain, tanpa markdown fence.`;
    const user = `Data performa 30 hari terakhir:\nTotal followers: ${summary.followersTotal ?? "?"} (perubahan ${summary.followersDelta ?? "?"})\nTotal post tayang: ${summary.publishedCount} (rata-rata ${summary.postsPerWeek}/minggu)\n${platformStats}\n${topPost}\n${focus}\nBuat saran perbaikan berbasis data di atas.`;

    const raw = await chatCompletion(config, system, user, {
      temperature: 0.7,
      maxTokens: 1500,
    });

    const cleaned = raw.replace(/```json|```/g, "").trim();
    let advice: unknown;
    try {
      advice = JSON.parse(cleaned);
    } catch {
      return c.json(
        { message: "AI mengembalikan format yang tidak bisa dibaca — coba lagi." },
        502,
      );
    }

    return c.json({ advice, credits: usage });
  } catch (error) {
    return errorResponse(error);
  }
});
