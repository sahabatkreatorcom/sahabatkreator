// API AI — generate caption, hashtag, rewrite, saran reply via OpenRouter

import { db } from "@sahabatkreator/db";
import { aiUsageLog, brandVoice, media, user as userTable } from "@sahabatkreator/db/schema";
import { and, count, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { chatCompletion, consumeAiCredits, getAiConfig, getAiUsage } from "../lib/ai";
import { errorResponse, HTTPError, requireOrg } from "../lib/auth-guard";
import { getOrgLimits } from "../lib/billing";
import { aiRateLimit } from "../lib/rate-limit";

export const aiRoute = new Hono();

// Rate limit khusus AI: 10 request / 60s per IP+user — panggilan LLM mahal
// dan panjang; mencegah penyalahgunaan (script spam) yang menggerus kuota
// org. Endpoint /usage di-skip (read-only, murah, dipolling UI).
aiRoute.use("/*", aiRateLimit);

/** Muat brand voice org → potongan system prompt. Kosong bila belum diatur. */
async function brandVoicePrompt(organizationId: string): Promise<string> {
  const [voice] = await db
    .select()
    .from(brandVoice)
    .where(eq(brandVoice.organizationId, organizationId))
    .limit(1);
  if (!voice) return "";
  const parts: string[] = [];
  if (voice.description) parts.push(`Deskripsi brand: ${voice.description}`);
  if (voice.tones.length > 0) parts.push(`Tone wajib: ${voice.tones.join(", ")}`);
  if (voice.vocabulary.length > 0)
    parts.push(`Kata/frasa khas brand (gunakan bila cocok): ${voice.vocabulary.join(", ")}`);
  if (voice.avoid.length > 0) parts.push(`HINDARI: ${voice.avoid.join(", ")}`);
  if (voice.guidelines) parts.push(`Pedoman tambahan: ${voice.guidelines}`);
  if (voice.samples.length > 0)
    parts.push(
      `Contoh caption brand (tiru pola gayanya, jangan disalin):\n${voice.samples.slice(0, 3).join("\n---\n")}`,
    );
  if (parts.length === 0) return "";
  return `\n\nBRAND VOICE (patuhi dengan ketat):\n${parts.join("\n")}`;
}

/** Konteks style per platform untuk prompt AI */
const PLATFORM_STYLE: Record<string, string> = {
  instagram:
    "Instagram: hook kuat di 2 baris pertama, emoji secukupnya, hashtags di akhir, maksimal 2200 karakter.",
  facebook: "Facebook: konversasional, ajukan pertanyaan untuk mendorong engagement.",
  tiktok: "TikTok: pendek, punchy, trend-aware, hashtag relevan, maksimal 2200 karakter.",
  youtube: "YouTube: kaya keyword, CTA jelas, SEO-friendly.",
  linkedin: "LinkedIn: profesional tapi personal, storytelling, tanpa emoji berlebihan.",
  pinterest: "Pinterest: kaya keyword, deskriptif, search-optimized.",
  threads: "Threads: maksimal 500 karakter, ringan dan konversasional.",
  x: "X/Twitter: maksimal 280 karakter, tajam dan langsung.",
};

const PLATFORMS = [
  "instagram",
  "facebook",
  "tiktok",
  "youtube",
  "linkedin",
  "pinterest",
  "threads",
  "x",
] as const;

// ---------- GET /ai/usage — sisa kredit bulan ini ----------

aiRoute.get("/usage", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const [limits, usage] = await Promise.all([
      getOrgLimits(ctx.organization.id),
      getAiUsage(ctx.organization.id),
    ]);
    const config = await getAiConfig();
    return c.json({
      configured: !!config,
      used: usage.used,
      limit: limits.aiCreditsPerMonth,
      period: usage.period,
    });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------- GET /ai/usage/history — riwayat pemakaian AI org milik user ----------

/**
 * Log pemakaian AI (caption, hashtag, rewrite, SEB) untuk org aktif user.
 * Scope: organizationId = org aktif session (bukan semua org user) agar
 * konsisten dengan limit kredit yang juga per-org.
 */
aiRoute.get("/usage/history", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const page = Math.max(Number(c.req.query("page") ?? 1), 1);
    const perPage = Math.min(Number(c.req.query("perPage") ?? 50), 200);
    const action = c.req.query("action")?.trim() ?? "";

    const conditions = [eq(aiUsageLog.organizationId, ctx.organization.id)];
    if (action) conditions.push(eq(aiUsageLog.action, action));
    const where = and(...conditions);

    const rows = await db
      .select({
        id: aiUsageLog.id,
        userName: userTable.name,
        action: aiUsageLog.action,
        platform: aiUsageLog.platform,
        model: aiUsageLog.model,
        credits: aiUsageLog.credits,
        createdAt: aiUsageLog.createdAt,
      })
      .from(aiUsageLog)
      .leftJoin(userTable, eq(aiUsageLog.userId, userTable.id))
      .where(where)
      .orderBy(desc(aiUsageLog.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage);

    const [total] = await db.select({ total: count() }).from(aiUsageLog).where(where);

    return c.json({ logs: rows, total: total?.total ?? 0, page, perPage });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------- POST /ai/caption ----------

const captionSchema = z.object({
  prompt: z.string().min(3).max(500),
  platform: z.enum(PLATFORMS),
  tone: z.enum(["santai", "profesional", "lucu", "inspiratif", "promosi"]).default("santai"),
  includeHashtags: z.boolean().default(true),
});

aiRoute.post("/caption", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = captionSchema.parse(await c.req.json());

    const config = await getAiConfig();
    if (!config) {
      return c.json({ message: "Fitur AI belum dikonfigurasi. Hubungi admin platform." }, 503);
    }

    const limits = await getOrgLimits(ctx.organization.id);
    const usage = await consumeAiCredits(ctx.organization.id, limits.aiCreditsPerMonth, {
      userId: ctx.user.id,
      action: "caption",
      platform: input.platform,
      model: config.model,
    });

    const style = PLATFORM_STYLE[input.platform] ?? "";
    const voice = await brandVoicePrompt(ctx.organization.id);
    const system = `Kamu adalah copywriter social media profesional Indonesia. Tulis caption ${input.tone} dalam Bahasa Indonesia untuk konten kreator UMKM.\n${style}${voice}\n${input.includeHashtags ? "Sertakan 3-8 hashtag relevan di akhir caption." : "JANGAN sertakan hashtag."}\nKembalikan HANYA teks caption, tanpa penjelasan tambahan.`;

    const caption = await chatCompletion(config, system, input.prompt, {
      temperature: 0.85,
      maxTokens: 800,
    });

    const hashtags = caption.match(/#\w+/g) ?? [];

    return c.json({
      caption,
      hashtags: hashtags.slice(0, 10),
      credits: usage,
    });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------- POST /ai/hashtag ----------

const hashtagSchema = z.object({
  prompt: z.string().min(3).max(300),
  platform: z.enum(PLATFORMS),
  count: z.number().int().min(3).max(30).default(10),
});

aiRoute.post("/hashtag", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = hashtagSchema.parse(await c.req.json());

    const config = await getAiConfig();
    if (!config) {
      return c.json({ message: "Fitur AI belum dikonfigurasi. Hubungi admin platform." }, 503);
    }

    const limits = await getOrgLimits(ctx.organization.id);
    const usage = await consumeAiCredits(ctx.organization.id, limits.aiCreditsPerMonth, {
      userId: ctx.user.id,
      action: "hashtag",
      platform: input.platform,
      model: config.model,
    });

    const system = `Kamu adalah ahli social media marketing Indonesia. Hasilkan hashtag yang relevan, campuran populer dan niche, dalam Bahasa Indonesia/Inggris sesuai konteks.\nKembalikan HANYA JSON array of string, contoh: ["#hashtag1", "#hashtag2"]. Tanpa teks lain.`;

    const raw = await chatCompletion(config, system, input.prompt, {
      temperature: 0.7,
      maxTokens: 400,
    });

    // Parse JSON dari response (tahan terhadap markdown code fence)
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    let hashtags: string[] = [];
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as unknown[];
        hashtags = parsed.filter((h): h is string => typeof h === "string");
      } catch {
        // fallback: extract manual
        hashtags = raw.match(/#\w+/g) ?? [];
      }
    }

    return c.json({
      hashtags: hashtags.slice(0, input.count),
      credits: usage,
    });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------- POST /ai/rewrite ----------

const rewriteSchema = z.object({
  text: z.string().min(10).max(3000),
  platform: z.enum(PLATFORMS),
  style: z
    .enum(["lebih-santai", "lebih-formal", "lebih-pendek", "lebih-panjang", "hook-kuat", "seo"])
    .default("lebih-santai"),
});

const REWRITE_INSTRUCTIONS: Record<string, string> = {
  "lebih-santai": "Tulis ulang dengan gaya lebih santai dan ramah.",
  "lebih-formal": "Tulis ulang dengan gaya lebih formal dan profesional.",
  "lebih-pendek": "Ringkas menjadi lebih pendek tanpa kehilangan pesan inti.",
  "lebih-panjang": "Kembangkan menjadi lebih panjang dengan detail dan storytelling.",
  "hook-kuat": "Tulis ulang dengan hook 2 baris pertama yang sangat menarik.",
  seo: "Tulis ulang dengan keyword SEO yang lebih kuat.",
};

aiRoute.post("/rewrite", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = rewriteSchema.parse(await c.req.json());

    const config = await getAiConfig();
    if (!config) {
      return c.json({ message: "Fitur AI belum dikonfigurasi. Hubungi admin platform." }, 503);
    }

    const limits = await getOrgLimits(ctx.organization.id);
    const usage = await consumeAiCredits(ctx.organization.id, limits.aiCreditsPerMonth, {
      userId: ctx.user.id,
      action: "rewrite",
      platform: input.platform,
      model: config.model,
    });

    const style = PLATFORM_STYLE[input.platform] ?? "";
    const voice = await brandVoicePrompt(ctx.organization.id);
    const system = `Kamu adalah editor copywriter social media Indonesia. ${REWRITE_INSTRUCTIONS[input.style]}\n${style}${voice}\nPertahankan Bahasa Indonesia. Kembalikan HANYA teks hasil rewrite.`;

    const text = await chatCompletion(config, system, input.text, {
      temperature: 0.7,
      maxTokens: 800,
    });

    return c.json({ text, credits: usage });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------- POST /ai/repurpose — adaptasi konten antar platform ----------

const repurposeSchema = z.object({
  content: z.string().min(10).max(6000),
  targetPlatform: z.enum(["instagram", "tiktok", "youtube", "linkedin", "twitter"]),
  tone: z.string().max(40).optional(),
});

/** Panduan adaptasi gaya per platform target (lebih detail daripada PLATFORM_STYLE) */
const REPURPOSE_GUIDE: Record<string, string> = {
  instagram:
    "Instagram feed: hook kuat 2 baris pertama, paragraf pendek, emoji secukupnya, 5-10 hashtag relevan di akhir, maksimal 2200 karakter.",
  tiktok:
    "TikTok caption: hook sangat pendek (1 kalimat) yang memancing rasa penasaran, bahasa lisan/trend-aware, CTA eksplisit (contoh: 'simpan ini dulu' / 'komen kalau setuju'), 3-5 hashtag, maksimal 150 karakter per bagian teks.",
  youtube:
    "YouTube: hasilkan JUDUL (maksimal 90 karakter, kaya keyword) dan DESKRIPSI (paragraf pembuka hook 2-3 kalimat, poin-poin isi dengan timestamp placeholder bila relevan, CTA subscribe, 3-5 hashtag). Format: 'JUDUL: <judul>' lalu baris kosong lalu 'DESKRIPSI: <deskripsi>'.",
  linkedin:
    "LinkedIn: profesional tapi personal, storytelling 3-5 paragraf pendek, hook reflektif di baris pertama, insight/takeaway konkret, tanpa emoji berlebihan, 3 hashtag profesional di akhir.",
  twitter:
    "X/Twitter: maksimal 280 karakter total, satu pesan tajam, tanpa hashtag berlebihan (maksimal 2), hook di kalimat pertama.",
};

aiRoute.post("/repurpose", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = repurposeSchema.parse(await c.req.json());

    const config = await getAiConfig();
    if (!config) {
      return c.json({ message: "Fitur AI belum dikonfigurasi. Hubungi admin platform." }, 503);
    }

    const limits = await getOrgLimits(ctx.organization.id);
    const usage = await consumeAiCredits(ctx.organization.id, limits.aiCreditsPerMonth, {
      userId: ctx.user.id,
      action: "repurpose",
      platform: input.targetPlatform,
      model: config.model,
    });

    const guide = REPURPOSE_GUIDE[input.targetPlatform];
    const tone = input.tone ? `\nGunakan nada bahasa: ${input.tone}.` : "";
    const voice = await brandVoicePrompt(ctx.organization.id);
    const system = `Kamu adalah strategist konten social media profesional Indonesia. Tugas Anda: mengadaptasi ulang (repurpose) satu konten menjadi format terbaik untuk platform target.\n\nPANDUAN PLATFORM TARGET:\n${guide}${tone}${voice}\n\nAturan umum:\n- Pertahankan pesan inti dan informasi penting dari konten sumber.\n- Sesuaikan struktur, panjang, gaya bahasa, format, dan hashtag dengan platform target.\n- Bahasa Indonesia (kecuali istilah teknis yang umum).\n- Jangan menambahkan informasi faktual baru yang tidak ada di sumber.\n- Kembalikan HANYA teks hasil adaptasi, tanpa penjelasan tambahan.`;

    const text = await chatCompletion(config, system, input.content, {
      temperature: 0.75,
      maxTokens: 1000,
    });

    return c.json({ content: text, credits: usage });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------- POST /ai/carousel — generate outline carousel IG ----------

const carouselSchema = z.object({
  topic: z.string().min(3).max(300),
  slideCount: z.number().int().min(4).max(10),
  style: z.enum(["edukasi", "promosi", "storytelling"]).default("edukasi"),
});

/** Pola narasi per gaya carousel */
const CAROUSESEL_STYLE_GUIDE: Record<string, string> = {
  edukasi:
    "Gaya edukasi: slide 1 = hook pertanyaan/pernyataan mengejutkan, slide tengah = poin-poin materi bertahap (satu ide per slide), slide terakhir = CTA simpan/bagikan.",
  promosi:
    "Gaya promosi: slide 1 = hook masalah yang dirasakan audiens, slide tengah = solusi/fitur/manfaat produk bertahap, slide terakhir = CTA beli/kunjungi link dengan urgensi.",
  storytelling:
    "Gaya storytelling: slide 1 = pembuka cerita yang memancing rasa penasaran, slide tengah = alur konflik-menuju-penyelesaian, slide terakhir = pelajaran/CTA reflektif.",
};

aiRoute.post("/carousel", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = carouselSchema.parse(await c.req.json());

    const config = await getAiConfig();
    if (!config) {
      return c.json({ message: "Fitur AI belum dikonfigurasi. Hubungi admin platform." }, 503);
    }

    const limits = await getOrgLimits(ctx.organization.id);
    const usage = await consumeAiCredits(ctx.organization.id, limits.aiCreditsPerMonth, {
      userId: ctx.user.id,
      action: "carousel",
      platform: "instagram",
      model: config.model,
    });

    const voice = await brandVoicePrompt(ctx.organization.id);
    const system = `Kamu adalah desainer konten carousel Instagram profesional untuk kreator UMKM Indonesia.\n${CAROUSESEL_STYLE_GUIDE[input.style]}${voice}\n\nHasilkan outline carousel dengan TEPAT ${input.slideCount} slide.\n\nKembalikan HANYA JSON valid (tanpa markdown fence) dengan format:\n{\n  "slides": [\n    { "title": "judul slide singkat (maks 8 kata)", "body": "isi slide 1-3 kalimat padat" }\n  ],\n  "caption": "caption Instagram lengkap untuk carousel (hook, ringkasan, CTA, 5-8 hashtag di akhir)",\n  "designTips": "2-3 tips desain singkat dalam satu paragraf (warna, tipografi, komposisi)"\n}\n\nSemua teks dalam Bahasa Indonesia. Jumlah slide di array HARUS tepat ${input.slideCount}.`;

    const raw = await chatCompletion(config, system, input.topic, {
      temperature: 0.8,
      maxTokens: 1600,
    });

    // Parse JSON dari response — tahan terhadap markdown code fence
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new HTTPError(502, "AI mengembalikan format tidak valid. Coba lagi.");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      throw new HTTPError(502, "AI mengembalikan format tidak valid. Coba lagi.");
    }

    const result = parsed as {
      slides?: { title?: unknown; body?: unknown }[];
      caption?: unknown;
      designTips?: unknown;
    };
    const slides = (result.slides ?? [])
      .map((s) => ({
        title: typeof s.title === "string" ? s.title.trim() : "",
        body: typeof s.body === "string" ? s.body.trim() : "",
      }))
      .filter((s) => s.title || s.body);

    if (slides.length === 0) {
      throw new HTTPError(502, "AI tidak menghasilkan slide yang valid. Coba lagi.");
    }

    return c.json({
      slides,
      caption: typeof result.caption === "string" ? result.caption : "",
      designTips: typeof result.designTips === "string" ? result.designTips : "",
      credits: usage,
    });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------- POST /ai/reply — saran balasan komentar/mention ----------

const replySchema = z.object({
  comment: z.string().min(1).max(1000),
  platform: z.enum(PLATFORMS),
  tone: z.enum(["ramah", "profesional", "lucu"]).default("ramah"),
});

aiRoute.post("/reply", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = replySchema.parse(await c.req.json());

    const config = await getAiConfig();
    if (!config) {
      return c.json({ message: "Fitur AI belum dikonfigurasi. Hubungi admin platform." }, 503);
    }

    const limits = await getOrgLimits(ctx.organization.id);
    const usage = await consumeAiCredits(ctx.organization.id, limits.aiCreditsPerMonth, {
      userId: ctx.user.id,
      action: "reply",
      platform: input.platform,
      model: config.model,
    });

    const system = `Kamu adalah admin social media yang menanggapi komentar pelanggan/follower. Balas dengan gaya ${input.tone} dalam Bahasa Indonesia.\nMaksimal 2-3 kalimat. Jika komentar negatif, tunjukkan empati dan tawarkan solusi.\nKembalikan HANYA teks balasan.`;

    const reply = await chatCompletion(config, system, input.comment, {
      temperature: 0.75,
      maxTokens: 300,
    });

    return c.json({ reply, credits: usage });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------- POST /ai/alt-text — generate alt text media untuk aksesibilitas ----------
//
// catat: chatCompletion di lib/ai.ts hanya menerima prompt teks (tidak mendukung
// input gambar/vision), sehingga alt text dibangun dari nama file, tipe, dimensi,
// dan alt text lama bila ada.

const altTextSchema = z.object({
  mediaId: z.string().min(1),
});

aiRoute.post("/alt-text", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = altTextSchema.parse(await c.req.json());

    // Ambil media milik org (org-scoped — tidak boleh lintas org)
    const [item] = await db
      .select({
        name: media.name,
        type: media.type,
        mimeType: media.mimeType,
        width: media.width,
        height: media.height,
        altText: media.altText,
      })
      .from(media)
      .where(and(eq(media.id, input.mediaId), eq(media.organizationId, ctx.organization.id)))
      .limit(1);
    if (!item) {
      throw new HTTPError(404, "Media tidak ditemukan");
    }

    const config = await getAiConfig();
    if (!config) {
      return c.json({ message: "Fitur AI belum dikonfigurasi. Hubungi admin platform." }, 503);
    }

    const limits = await getOrgLimits(ctx.organization.id);
    const usage = await consumeAiCredits(ctx.organization.id, limits.aiCreditsPerMonth, {
      userId: ctx.user.id,
      action: "alt-text",
      model: config.model,
      credits: 1,
    });

    // Konteks media untuk prompt — nama file biasanya paling informatif
    const parts: string[] = [`Nama file: ${item.name}`];
    if (item.mimeType) parts.push(`Tipe file: ${item.mimeType}`);
    if (item.width && item.height) parts.push(`Dimensi: ${item.width}x${item.height} piksel`);
    if (item.altText)
      parts.push(`Alt text lama (perbaiki bila kurang deskriptif): ${item.altText}`);

    const system = `Kamu adalah ahli aksesibilitas web. Tulis alt text deskriptif 1 kalimat untuk aksesibilitas (screen reader).\nAturan:\n- Bahasa Indonesia, satu kalimat, maksimal 125 karakter.\n- Jangan diawali "Gambar" atau "Foto" — langsung deskripsikan isinya.\n- Berdasarkan nama file dan konteks yang tersedia, tebak isi gambar secara wajar.\n- Jangan sertakan tanda kutip atau format markdown apa pun.\nKembalikan HANYA teks alt text.`;

    const altText = await chatCompletion(config, system, parts.join("\n"), {
      temperature: 0.5,
      maxTokens: 120,
    });

    return c.json({ altText, credits: usage });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------- POST /ai/predict-score — prediksi skor engagement (rule-based, gratis) ----------
//
// Dihitung murni server-side rule-based TANPA LLM — tidak mengonsumsi kredit AI.

const predictScoreSchema = z.object({
  content: z.string().max(10000).default(""),
  platforms: z.array(z.string().min(1).max(40)).max(11).default([]),
  hasMedia: z.boolean().default(false),
  /** Jam publish WIB (0-23) */
  scheduledHour: z.number().int().min(0).max(23).default(12),
});

type ScoreFactor = {
  label: string;
  impact: string;
  detail: string;
};

/** Batas karakter optimal per platform (caption tanpa hashtag) */
const OPTIMAL_CHAR_RANGE: Record<string, [number, number]> = {
  instagram: [80, 300],
  facebook: [80, 300],
  tiktok: [80, 300],
  youtube: [80, 300],
  linkedin: [80, 300],
  pinterest: [80, 300],
  threads: [80, 300],
  x: [80, 280],
  twitter: [80, 280],
  manual: [80, 300],
};

/** Fallback rentang default bila platform tidak terdaftar */
const DEFAULT_CHAR_RANGE: [number, number] = [80, 300];

function charRangeOf(platform: string): [number, number] {
  return OPTIMAL_CHAR_RANGE[platform] ?? DEFAULT_CHAR_RANGE;
}

/** Kata CTA yang umum di konten Indonesia */
const CTA_WORDS = ["beli", "cek", "klik", "link", "dm", "pesan", "order", "checkout", "shop"];

function computeScore(input: z.infer<typeof predictScoreSchema>): {
  score: number;
  grade: "Sangat Baik" | "Baik" | "Cukup" | "Perlu Perbaikan";
  factors: ScoreFactor[];
} {
  const factors: ScoreFactor[] = [];
  const content = input.content.trim();
  const plainLength = content.replace(/#[\w\u00C0-\u024F]+/g, "").trim().length;
  const hashtags = content.match(/#[\w\u00C0-\u024F]+/g) ?? [];
  const lower = content.toLowerCase();
  const hasCta = CTA_WORDS.some((w) => new RegExp(`\\b${w}\\b`, "i").test(lower));
  const platforms = input.platforms.length > 0 ? input.platforms : ["instagram"];

  let score = 0;

  // 1. Panjang konten (maks 25) — dihitung dari platform paling ketat terpilih
  const ranges = platforms.map((p) => charRangeOf(p)).sort((a, b) => a[1] - b[1]);
  const [minLen, maxLen] = ranges[0] ?? DEFAULT_CHAR_RANGE;
  if (plainLength === 0) {
    factors.push({
      label: "Panjang konten",
      impact: "+0",
      detail: "Konten masih kosong — tulis caption dulu.",
    });
  } else if (plainLength < minLen) {
    const pts = Math.round((plainLength / minLen) * 15);
    score += pts;
    factors.push({
      label: "Panjang konten",
      impact: `+${pts}`,
      detail: `${plainLength} karakter — terlalu pendek, ideal ${minLen}-${maxLen} karakter.`,
    });
  } else if (plainLength <= maxLen) {
    score += 25;
    factors.push({
      label: "Panjang konten",
      impact: "+25",
      detail: `${plainLength} karakter — optimal (${minLen}-${maxLen}).`,
    });
  } else {
    const over = plainLength - maxLen;
    const pts = Math.max(5, 25 - Math.round((over / maxLen) * 25));
    score += pts;
    factors.push({
      label: "Panjang konten",
      impact: `+${pts}`,
      detail: `${plainLength} karakter — terlalu panjang, ideal maksimal ${maxLen} karakter.`,
    });
  }

  // 2. Hashtag (maks 20) — optimal 3-10
  if (hashtags.length >= 3 && hashtags.length <= 10) {
    score += 20;
    factors.push({
      label: "Hashtag",
      impact: "+20",
      detail: `${hashtags.length} hashtag — optimal (3-10).`,
    });
  } else if (hashtags.length > 10) {
    score += 8;
    factors.push({
      label: "Hashtag",
      impact: "+8",
      detail: `${hashtags.length} hashtag — terlalu banyak, maksimal 10 agar tidak dianggap spam.`,
    });
  } else if (hashtags.length > 0) {
    score += 6;
    factors.push({
      label: "Hashtag",
      impact: "+6",
      detail: `Hanya ${hashtags.length} hashtag — tambahkan hingga 3-10 hashtag relevan.`,
    });
  } else {
    factors.push({
      label: "Hashtag",
      impact: "+0",
      detail: "Belum ada hashtag — gunakan 3-10 hashtag relevan untuk jangkauan.",
    });
  }

  // 3. CTA (maks 15)
  if (hasCta) {
    score += 15;
    factors.push({
      label: "Call to action",
      impact: "+15",
      detail: "Ada ajakan aksi (CTA) yang mendorong engagement.",
    });
  } else {
    factors.push({
      label: "Call to action",
      impact: "+0",
      detail: "Belum ada CTA — coba kata seperti: cek, klik, link, dm, pesan.",
    });
  }

  // 4. Jam posting (maks 15) — jam aktif pengguna Indonesia 9-21 WIB
  if (input.scheduledHour >= 9 && input.scheduledHour <= 21) {
    score += 15;
    factors.push({
      label: "Waktu posting",
      impact: "+15",
      detail: `Jam ${input.scheduledHour}.00 WIB — dalam rentang jam aktif (9-21).`,
    });
  } else if (input.scheduledHour === 8 || input.scheduledHour === 22) {
    score += 8;
    factors.push({
      label: "Waktu posting",
      impact: "+8",
      detail: `Jam ${input.scheduledHour}.00 WIB — batas jam aktif, ideal 9-21 WIB.`,
    });
  } else {
    factors.push({
      label: "Waktu posting",
      impact: "+0",
      detail: `Jam ${input.scheduledHour}.00 WIB — di luar jam aktif pengguna (9-21 WIB).`,
    });
  }

  // 5. Media (maks 15)
  if (input.hasMedia) {
    score += 15;
    factors.push({
      label: "Media",
      impact: "+15",
      detail: "Konten menyertakan media (foto/video) — engagement lebih tinggi.",
    });
  } else {
    factors.push({
      label: "Media",
      impact: "+0",
      detail: "Tanpa media — lampirkan foto/video untuk boost engagement.",
    });
  }

  // 6. Bonus platform video (maks 10) — tiktok/reels unggul di konten video
  const videoPlatforms = platforms.filter((p) => p === "tiktok" || p === "instagram");
  if (videoPlatforms.length > 0 && input.hasMedia) {
    score += 10;
    factors.push({
      label: "Platform video",
      impact: "+10",
      detail: `Konten video di ${videoPlatforms.map((p) => (p === "instagram" ? "Reels" : "TikTok")).join(" & ")} berpotensi jangkauan lebih luas.`,
    });
  }

  // Normalisasi ke 0-100
  score = Math.max(0, Math.min(100, Math.round(score)));

  const grade =
    score >= 80
      ? ("Sangat Baik" as const)
      : score >= 60
        ? ("Baik" as const)
        : score >= 40
          ? ("Cukup" as const)
          : ("Perlu Perbaikan" as const);

  return { score, grade, factors };
}

aiRoute.post("/predict-score", async (c) => {
  try {
    // Wajib login + org (endpoint gratis, tapi tetap terproteksi)
    await requireOrg(c);
    const input = predictScoreSchema.parse(await c.req.json());
    const result = computeScore(input);
    return c.json(result);
  } catch (error) {
    return errorResponse(error);
  }
});
