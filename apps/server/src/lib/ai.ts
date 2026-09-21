// Layanan AI via OpenRouter — generate caption, hashtag, rewrite, reply

import { db } from "@sahabatkreator/db";
import { aiUsage, aiUsageLog, platformSettings } from "@sahabatkreator/db/schema";
import { env } from "@sahabatkreator/env/server";
import { and, eq, sql } from "drizzle-orm";
import { HTTPError } from "./auth-guard";
import { decrypt } from "./crypto";
import { generateId } from "./id";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export const DEFAULT_AI_MODEL = "openai/gpt-4o-mini";

export type AiConfig = {
  apiKey: string;
  model: string;
};

/**
 * Biaya kredit per aksi AI — tiered berdasarkan kompleksitas prompt & token usage.
 * Caption/hashtag: ~500-800 token → 1 kredit
 * Rewrite/reply/alt-text: ~500-1000 token → 1 kredit
 * Carousel: ~1000-1500 token, multi-step → 2 kredit
 * SebCoach: ~3000-5000 token, context panjang → 3 kredit
 * Trends: ~4000-6000 token, analisis berat → 3 kredit
 */
export const AI_CREDIT_COST: Record<string, number> = {
  caption: 1,
  hashtag: 1,
  rewrite: 1,
  reply: 1,
  "alt-text": 1,
  repurpose: 1,
  carousel: 2,
  coach_advice: 3,
  trend_ideas: 3,
};

/** Ambil biaya kredit untuk action (default 1) */
export function aiCreditCost(action: string): number {
  return AI_CREDIT_COST[action] ?? 1;
}

// Cache in-memory konfigurasi AI — query platformSettings dihindari tiap request
const AI_CONFIG_CACHE_MS = 60_000;
let cachedAiConfig: { config: AiConfig | null; at: number } | null = null;

/** Invalidate cache konfigurasi AI — dipanggil setelah admin menyimpan settings. */
export function invalidateAiConfigCache(): void {
  cachedAiConfig = null;
}

/**
 * Ambil konfigurasi AI aktif.
 * Prioritas: key dari admin settings (encrypted DB) → fallback env OPENROUTER_API_KEY.
 * Return null jika tidak ada satupun (AI belum dikonfigurasi).
 * Hasil di-cache 60 detik (pola sama dengan sumopod.ts).
 */
export async function getAiConfig(): Promise<AiConfig | null> {
  if (cachedAiConfig && Date.now() - cachedAiConfig.at < AI_CONFIG_CACHE_MS) {
    return cachedAiConfig.config;
  }

  const [settings] = await db
    .select({ aiApiKeyEnc: platformSettings.aiApiKeyEnc, aiModel: platformSettings.aiModel })
    .from(platformSettings)
    .where(eq(platformSettings.id, "singleton"))
    .limit(1);

  const apiKey = settings?.aiApiKeyEnc
    ? decrypt(settings.aiApiKeyEnc)
    : env.OPENROUTER_API_KEY || null;

  if (!apiKey) {
    cachedAiConfig = { config: null, at: Date.now() };
    return null;
  }
  const config: AiConfig = { apiKey, model: settings?.aiModel || DEFAULT_AI_MODEL };
  cachedAiConfig = { config, at: Date.now() };
  return config;
}

/** Panggil OpenRouter chat completion */
export async function chatCompletion(
  config: AiConfig,
  systemPrompt: string,
  userPrompt: string,
  options?: { temperature?: number; maxTokens?: number },
): Promise<string> {
  // Timeout 30 detik — jangan biarkan request menggantung dan menghabiskan
  // koneksi/concurrency server selamanya
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    signal: AbortSignal.timeout(30_000),
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": env.SERVER_URL,
      "X-Title": "Sahabat Kreator",
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: options?.temperature ?? 0.8,
      max_tokens: options?.maxTokens ?? 1000,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[ai] OpenRouter error ${res.status}: ${detail.slice(0, 200)}`);
    throw new HTTPError(502, "Layanan AI sedang tidak tersedia. Coba lagi nanti.");
  }

  const result = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = result.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new HTTPError(502, "AI tidak mengembalikan hasil. Coba lagi.");
  }
  return content;
}

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Cek & konsumsi kredit AI organization (atomic increment).
 * Throw 402 jika melebihi limit plan.
 */
export async function consumeAiCredits(
  organizationId: string,
  limit: number,
  opts: { userId?: string; action: string; platform?: string; model?: string; credits?: number },
): Promise<{ used: number; limit: number }> {
  const credits = opts.credits ?? 1;
  const period = currentPeriod();

  // Pastikan baris agregat ada
  const [existing] = await db
    .select({ creditsUsed: aiUsage.creditsUsed })
    .from(aiUsage)
    .where(and(eq(aiUsage.organizationId, organizationId), eq(aiUsage.period, period)))
    .limit(1);

  if ((existing?.creditsUsed ?? 0) + credits > limit) {
    throw new HTTPError(
      402,
      `Kredit AI habis (${limit}/bulan untuk plan Anda). Upgrade untuk kredit tambahan.`,
    );
  }

  // Upsert increment
  await db
    .insert(aiUsage)
    .values({
      id: generateId("aiu"),
      organizationId,
      period,
      creditsUsed: credits,
    })
    .onConflictDoUpdate({
      target: [aiUsage.organizationId, aiUsage.period],
      set: { creditsUsed: sql`${aiUsage.creditsUsed} + ${credits}` },
    });

  // Log individual
  await db.insert(aiUsageLog).values({
    id: generateId("ail"),
    organizationId,
    userId: opts.userId ?? null,
    action: opts.action,
    platform: opts.platform ?? null,
    model: opts.model ?? null,
    credits,
  });

  return { used: (existing?.creditsUsed ?? 0) + credits, limit };
}

/** Ambil pemakaian kredit AI org bulan ini */
export async function getAiUsage(
  organizationId: string,
): Promise<{ used: number; period: string }> {
  const [row] = await db
    .select({ creditsUsed: aiUsage.creditsUsed })
    .from(aiUsage)
    .where(and(eq(aiUsage.organizationId, organizationId), eq(aiUsage.period, currentPeriod())))
    .limit(1);
  return { used: row?.creditsUsed ?? 0, period: currentPeriod() };
}
