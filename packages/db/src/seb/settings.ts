// SEB — konfigurasi & klien OpenRouter (JSON mode + repair fallback).
// Dipakai: routes /api/seb/* (server) & worker proactive report.
import { eq } from "drizzle-orm";
import { decrypt } from "../crypto";
import { db } from "../index";
import { platformSettings } from "../schema";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_SEB_MODEL = "openai/gpt-4o-mini";

export const SEB_CATEGORIES = [
  "content_strategy",
  "caption",
  "creative",
  "video",
  "timing",
  "hashtag",
  "platform",
  "competitor",
  "brand",
] as const;
export type SebCategory = (typeof SEB_CATEGORIES)[number];

export const SEB_PRIORITIES = ["low", "medium", "high"] as const;
export type SebPriority = (typeof SEB_PRIORITIES)[number];

export const SEB_RECOMMENDATION_STATUSES = ["new", "in_progress", "done", "dismissed"] as const;
export type SebRecommendationStatus = (typeof SEB_RECOMMENDATION_STATUSES)[number];

export const SEB_EXPERIMENT_STATUSES = ["planned", "running", "completed", "cancelled"] as const;
export type SebExperimentStatus = (typeof SEB_EXPERIMENT_STATUSES)[number];

// Platform valid untuk rekomendasi/experiment (selaras schema enum minus manual duplikat IG)
export const SEB_PLATFORMS = [
  "instagram",
  "instagram_standalone",
  "facebook",
  "threads",
  "tiktok",
  "youtube",
  "pinterest",
  "linkedin",
  "bluesky",
  "google_business",
  "manual",
] as const;
export type SebPlatform = (typeof SEB_PLATFORMS)[number];

export type SebSettings = {
  apiKey: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxChatsPerDay: number;
  maxReportsPerDay: number;
};

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
8. Use platform knowledge only for social media strategy.
9. Treat written post captions, on-video captions/subtitles, and visual text overlays as separate things. Before saying a video needs captions, check whether visible on-screen captions are mentioned in the context.
10. Stories are ephemeral visual formats and often do not need normal feed-style post captions. Do not penalize STORY posts for short or missing written captions unless the supplied data shows that the Story itself is unclear.
11. When advice is specific to one connected business account, include that account's socialAccountId. Use null socialAccountId only for genuinely cross-account advice.
12. Return strict JSON only. No markdown fences.`;

/** Konfigurasi SEB aktif — throw Error bila belum dikonfigurasi/disabled */
export async function getSebSettings(): Promise<SebSettings> {
  const [settings] = await db
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.id, "singleton"))
    .limit(1);

  const apiKey = settings?.aiApiKeyEnc
    ? decrypt(settings.aiApiKeyEnc)
    : process.env.OPENROUTER_API_KEY || null;

  if (!apiKey) {
    throw new Error("AI belum dikonfigurasi. Hubungi admin platform.");
  }
  if (settings && !settings.sebEnabled) {
    throw new Error("SEB sedang dinonaktifkan admin.");
  }

  return {
    apiKey,
    model: settings?.sebModel || settings?.aiModel || DEFAULT_SEB_MODEL,
    systemPrompt: `${DEFAULT_SEB_PROMPT}\n\n${settings?.sebSystemPrompt || ""}`.trim(),
    temperature: settings?.sebTemperature ?? 0.55,
    maxChatsPerDay: settings?.sebMaxChatsPerDay ?? 30,
    maxReportsPerDay: settings?.sebMaxReportsPerDay ?? 3,
  };
}

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string };

/** Panggil OpenRouter untuk SEB — dukung JSON mode */
export async function callSebModel(
  settings: SebSettings,
  messages: ChatMessage[],
  options?: { maxTokens?: number; jsonMode?: boolean; temperature?: number },
): Promise<string> {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.SERVER_URL || "http://localhost:3000",
      "X-Title": "Sahabat Kreator Seb",
    },
    body: JSON.stringify({
      model: settings.model,
      messages,
      temperature: options?.temperature ?? settings.temperature,
      max_tokens: options?.maxTokens ?? 3500,
      ...(options?.jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenRouter SEB error ${res.status}: ${detail.slice(0, 200)}`);
  }

  const result = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = result.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("OpenRouter mengembalikan respons SEB kosong");
  return content;
}

/** Parse JSON toleran — strip markdown fence & ekstrak {...} */
export function safeJsonParse<T>(text: string): T | null {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}
