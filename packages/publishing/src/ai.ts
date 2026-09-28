// Layanan AI via OpenRouter — salinan apps/server/src/lib/ai.ts
// (package publishing dipakai server & worker; worker butuh chatCompletion untuk
//  auto-reply AI tanpa import cross-app). Beda: throw Error polos, bukan HTTPError
//  (worker tidak ada konteks HTTP — error ditangani & di-log oleh queue).
//
//Penyamaan dengan server:
// - getAiConfig: ambil key dari platformSettings (encrypted) → fallback env
// - chatCompletion: POST OpenRouter, timeout 30s
// - consumeAiCredits: cek limit terhadap SUM pool per-user, atomic increment,
//   throw Error polos bila melebihi limit
import {
  consumePoolAiCredits,
  db,
  getPoolAiUsage,
  QuotaExceededError,
  resolvePoolOrgIds,
} from "@sahabatkreator/db";
import { platformSettings } from "@sahabatkreator/db/schema";
import { env } from "@sahabatkreator/env/server";
import { eq } from "drizzle-orm";
import { decrypt } from "./crypto";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export const DEFAULT_AI_MODEL = "openai/gpt-4o-mini";

export type AiConfig = {
  apiKey: string;
  model: string;
};

/** Biaya kredit per aksi AI — sinkron dengan apps/server/src/lib/ai.ts */
export const AI_CREDIT_COST: Record<string, number> = {
  caption: 1,
  hashtag: 1,
  rewrite: 1,
  reply: 1,
  "alt-text": 1,
  repurpose: 1,
  carousel: 2,
  // AI Visual Layout Director — 1 call multimodal batch seluruh carousel
  // (RFC docs/rfc-carousel-render.md §7). Sama dengan carousel: prompt +
  // array image ≈ token carousel outline.
  carousel_layout: 2,
  coach_advice: 3,
  trend_ideas: 3,
  // Auto-clip analysis — 1 call text-only per job: transkrip panjang (bisa
  // puluhan ribu token) + N kandidat + keep_segments. Lebih berat dari caption,
  // sekelas coach_advice. RFC docs/rfc-auto-clip.md §6.
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
 * Hasil di-cache 60 detik.
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
  // koneksi/concurrency worker selamanya
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
    throw new Error(`OpenRouter error ${res.status}: ${detail.slice(0, 200)}`);
  }

  const result = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = result.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("AI tidak mengembalikan hasil");
  }
  return content;
}

/**
 * Panggil OpenRouter dengan content multimodal (text + image_url).
 *
 * RFC docs/rfc-carousel-render.md §7 — AI Visual Layout Director: kirim SEMUA
 * background carousel dalam 1 call (bukan per-slide). Format image OpenRouter:
 * {"type":"image_url","image_url":{"url":"data:image/jpeg;base64,...","detail":"low"}}
 *
 * content adalah array part OpenAI-compatible. Timeout 45s — batch 10 image
 * butuh lebih lama dari text completion.
 */
export async function chatCompletionMultimodal(
  config: AiConfig,
  systemPrompt: string,
  content: unknown[],
  options?: { temperature?: number; maxTokens?: number },
): Promise<string> {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    signal: AbortSignal.timeout(45_000),
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
        { role: "user", content },
      ],
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 1200,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenRouter error ${res.status}: ${detail.slice(0, 200)}`);
  }

  const result = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = result.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("AI tidak mengembalikan hasil");
  }
  return text;
}

/** Ambil pemakaian kredit AI pool bulan ini (SUM lintas org milik pemilik) */
export async function getAiUsage(
  organizationId: string,
): Promise<{ used: number; period: string }> {
  return getPoolAiUsage(await resolvePoolOrgIds(organizationId));
}

/**
 * Cek & konsumsi kredit AI — limit dicek terhadap SUM pemakaian pool
 * (seluruh org milik pemilik org aktif), increment di baris org aktif.
 * `limit` sudah berupa limit pool. Throw Error polos (bukan HTTPError) bila
 * melebihi limit — auto-reply menangkap ini & menandai log "failed"
 * (bukan menggagalkan worker).
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
    if (error instanceof QuotaExceededError) throw new Error(error.message);
    throw error;
  }
}
