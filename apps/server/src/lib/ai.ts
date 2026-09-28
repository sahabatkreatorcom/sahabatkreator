// Layanan AI via OpenRouter — generate caption, hashtag, rewrite, reply

import { consumePoolAiCredits, db, getPoolAiUsage, resolvePoolOrgIds } from "@sahabatkreator/db";
import { platformSettings } from "@sahabatkreator/db/schema";
import { env } from "@sahabatkreator/env/server";
import { eq } from "drizzle-orm";
import { HTTPError } from "./auth-guard";
import { rethrowQuotaAsHttp } from "./billing";
import { decrypt } from "./crypto";

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
  // AI Visual Layout Director — 1 call multimodal batch seluruh carousel
  // (RFC docs/rfc-carousel-render.md §7). Konsumsi di worker (queue package).
  carousel_layout: 2,
  coach_advice: 3,
  trend_ideas: 3,
  // Auto-clip analysis — 1 call text-only per job (queue package, RFC
  // docs/rfc-auto-clip.md §6). Sinkron dengan publishing/ai.ts.
  auto_clip_analysis: 3,
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

/**
 * Cek & konsumsi kredit AI — cek limit terhadap SUM pemakaian pool
 * (seluruh org milik pemilik org aktif), increment di baris org aktif.
 * `limit` sudah berupa limit pool (dari getOrgLimits). Throw 402 bila melebihi.
 */
export async function consumeAiCredits(
  organizationId: string,
  limit: number,
  opts: { userId?: string; action: string; platform?: string; model?: string; credits?: number },
): Promise<{ used: number; limit: number }> {
  const orgIds = await resolvePoolOrgIds(organizationId);
  try {
    return await consumePoolAiCredits(organizationId, orgIds, limit, opts);
  } catch (error) {
    rethrowQuotaAsHttp(error);
  }
}

/** Ambil pemakaian kredit AI pool bulan ini (SUM lintas org milik pemilik) */
export async function getAiUsage(
  organizationId: string,
): Promise<{ used: number; period: string }> {
  return getPoolAiUsage(await resolvePoolOrgIds(organizationId));
}
