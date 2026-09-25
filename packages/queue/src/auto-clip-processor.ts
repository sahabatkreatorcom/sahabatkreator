// Auto-clip processor — inti worker: claim job analisis, kirim source ke Modal
// clipper (ingest + transkrip), baca SRT, seleksi momen via OpenRouter, simpan
// kandidat ke video_job_segment.
//
// Ini job ANALISIS, bukan render. Output-nya daftar kandidat — tidak ada video
// yang di-render di sini. User pilih kandidatnya, baru fanOutSelectedSegments
// enqueue job render mode "single" biasa (invariant 1 job = 1 output tetap).
//
// RFC docs/rfc-auto-clip.md §6 (pipeline). Port yang dipindah dari
// opensource-clipping v1.12.0 HANYA get_analysis_prompt + skema JSON
// (viral_score/start_time/end_time/hook). _segments_to_srt, _trim_video,
// _whisper, _build_montage SUDAH ADA di sk_render.py / sk_clipper.py — jangan
// dobel. Provider Gemini/NVIDIA tidak dipindah: OpenRouter text-only cukup.
//
// Claim atomik: UPDATE video_job SET status='rendering' WHERE id=? AND
// status IN ('queued','rendering') AND mode='auto_clip' RETURNING. Filter mode
// WAJIB — video_job dipakai dua queue (render + auto-clip); tanpa ini fallback
// loop render bisa claim job analisis dan merender-nya sebagai video utuh.
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@sahabatkreator/db";
import {
  type AutoClipSettings,
  media,
  type RenderSettings,
  type UrlSourceTier,
  videoJob,
  videoJobSegment,
} from "@sahabatkreator/db/schema";
import { env } from "@sahabatkreator/env/server";
import { chatCompletion, consumeAiCredits, getAiConfig } from "@sahabatkreator/publishing";
import { ClipperError, getClipperAdapter } from "@sahabatkreator/render";
import type { ConnectionOptions } from "bullmq";
import { and, asc, eq, or, sql } from "drizzle-orm";
import { getRedisConnection } from "./connection";
import { enqueueVideoRender } from "./video-render";

const PRESIGN_EXPIRES = 3600; // 1 jam — ingest clipper maksimal 30 menit

/** TTL cache hasil analisis — transkrip + setting sama = kandidat sama */
const ANALYSIS_CACHE_TTL_S = 30 * 24 * 3600; // 30 hari

/**
 * Biaya kredit untuk 1 call analisis (transkrip panjang + 8 kandidat).
 * Sinkron dengan AI_CREDIT_COST di publishing/ai.ts. Quota per plan DITUNDA
 * ke akhir proyek (RFC §11) → record saja, limit tak terhingga seperti
 * layout-director.
 */
const ANALYSIS_CREDIT_COST = 3;

let s3Client: S3Client | null = null;

function getS3(): S3Client {
  if (!s3Client) {
    if (
      !env.R2_ACCOUNT_ID ||
      !env.R2_ACCESS_KEY_ID ||
      !env.R2_SECRET_ACCESS_KEY ||
      !env.R2_BUCKET
    ) {
      throw new Error("R2 belum dikonfigurasi — auto-clip butuh storage SRT/source");
    }
    s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3Client;
}

function presignGet(storageKey: string): Promise<string> {
  return getSignedUrl(getS3(), new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: storageKey }), {
    expiresIn: PRESIGN_EXPIRES,
  });
}

function presignPut(storageKey: string, mimeType: string): Promise<string> {
  return getSignedUrl(
    getS3(),
    new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: storageKey, ContentType: mimeType }),
    { expiresIn: PRESIGN_EXPIRES },
  );
}

/**
 * Claim satu job analisis secara atomik. Return null bila sudah diclaim runner
 * lain / status bukan queued / bukan mode auto_clip.
 */
async function claimAutoClipJob(
  id: string,
): Promise<{ id: string; organizationId: string; baseVideoMediaId: string } | null> {
  const [row] = await db
    .update(videoJob)
    .set({ status: "rendering", progress: 0, updatedAt: new Date() })
    .where(
      and(
        eq(videoJob.id, id),
        // Accept "queued" (normal) atau "rendering" (retry attempt sebelumnya)
        or(eq(videoJob.status, "queued"), eq(videoJob.status, "rendering")),
        // Guard mode: job analisis tidak boleh dirender sebagai video biasa
        // (dan sebaliknya — render job tidak boleh dianalisis).
        eq(videoJob.mode, "auto_clip"),
      ),
    )
    .returning({
      id: videoJob.id,
      organizationId: videoJob.organizationId,
      baseVideoMediaId: videoJob.baseVideoMediaId,
    });
  return row ?? null;
}

// ============================================================
// SRT → prompt transcript + parsing respons AI
// ============================================================

/**
 * Parse SRT ke format prompt: `[start - end] teks` per baris (format yang
 * dipakai get_analysis_prompt di repo referensi).
 */
function srtToTranscript(srt: string): string {
  const blocks = srt.split(/\r?\n\r?\n/);
  const lines: string[] = [];
  for (const block of blocks) {
    const rows = block
      .split(/\r?\n/)
      .map((r) => r.trim())
      .filter(Boolean);
    let i = 0;
    // Baris pertama = index SRT ("1", "2", ...) — skip bila ada.
    if (rows.length && /^\d+$/.test(rows[0] ?? "")) i = 1;
    const timing = rows[i];
    const text = rows.slice(i + 1).join(" ");
    if (!timing || !text) continue;
    const m = timing.match(
      /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/,
    );
    if (!m) continue;
    const start = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
    const end = Number(m[5]) * 3600 + Number(m[6]) * 60 + Number(m[7]) + Number(m[8]) / 1000;
    lines.push(`[${start.toFixed(1)} - ${end.toFixed(1)}] ${text}`);
  }
  return lines.join("\n");
}

/** Parse "2:00" / "02:00" / "1:02:03" → detik. Null bila bukan clock valid. */
function parseClock(raw: string): number | null {
  const parts = raw
    .trim()
    .split(":")
    .map((p) => Number(p));
  if (parts.some((p) => !Number.isFinite(p))) return null;
  // Default destructuring: parts pendek tidak membuat akses undefined.
  // 2 bagian = MM:SS, 3 bagian = HH:MM:SS.
  const [a = 0, b = 0, c = 0] = parts;
  if (parts.length === 2) return a * 60 + b;
  if (parts.length === 3) return a * 3600 + b * 60 + c;
  return null;
}

const RANGE_RE =
  /(?<start>\d{1,2}:\d{2}(?::\d{2})?)\s*(?:-|–|—|sampai|smp|to|until)\s*(?<end>\d{1,2}:\d{2}(?::\d{2})?)/gi;

/**
 * Parse rentang waktu eksplisit dari userDirection (RFC §1.1, ide dari
 * yt-short-clipper). "potong 2:00-2:50 dan 5:30-6:00" → 2 rentang.
 * Rentang ini dikecualikan dari filter durasi + temperatur diturunkan.
 */
export function parseExplicitRanges(direction?: string | null): { start: number; end: number }[] {
  if (!direction) return [];
  const ranges: { start: number; end: number }[] = [];
  for (const m of direction.matchAll(RANGE_RE)) {
    const start = parseClock(m.groups?.start ?? "");
    const end = parseClock(m.groups?.end ?? "");
    if (start !== null && end !== null && end > start) ranges.push({ start, end });
  }
  return ranges;
}

/** Sisa userDirection setelah rentang eksplisit dipisah (instruksi bebas). */
function directionWithoutRanges(
  direction: string,
  ranges: { start: number; end: number }[],
): string {
  let out = direction;
  for (const r of ranges) {
    const s = formatClock(r.start);
    const e = formatClock(r.end);
    out = out.replace(new RegExp(`${s}\\s*(?:-|–|—|sampai|smp|to|until)\\s*${e}`, "gi"), " ");
  }
  return out.replace(/\s+/g, " ").trim();
}

function formatClock(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Bangun prompt analisis (port get_analysis_prompt, dipangkas ke yang
 * dipakai: seleksi + hook + keep_segments. Typography/b-roll/metadata lintas
 * platform = fase 3, tidak di-port).
 */
function buildAnalysisPrompt(opts: {
  transcript: string;
  settings: AutoClipSettings;
  durationSeconds: number;
  ranges: { start: number; end: number }[];
}): { system: string; user: string; temperature: number } {
  const { settings: s, ranges } = opts;
  const system = [
    "Kamu adalah Art Director dan Editor Video short-form untuk TikTok, Reels, dan YouTube Shorts.",
    "",
    "Baca transkrip video berikut. Format transkrip: [detik_mulai - detik_selesai] teks",
    "",
    "TUGAS UTAMA:",
    `- Carikan ${s.targetClipCount} momen paling menarik, paling kuat, dan paling berpotensi viral untuk dijadikan klip pendek.`,
    "- Urutkan klip berdasarkan viral_score tertinggi (paling berpotensi viral) ke terendah.",
    `- Durasi total video source: ${Math.round(opts.durationSeconds)} detik.`,
    "",
    "ATURAN PEMILIHAN KLIP:",
    opts.durationSeconds < s.minDurationSec
      ? `- Video source hanya ${Math.round(opts.durationSeconds)} detik (lebih pendek dari durasi minimum ${s.minDurationSec} detik) — buat klip SEKELUARnya dari seluruh video atau momen terpanjang yang ada, jangan paksa durasi minimum.`
      : `- Durasi klip ${s.minDurationSec}-${s.maxDurationSec} detik (rentang eksplisit dari user dikecualikan — lihat di bawah).`,
    "- Pilih bagian yang punya emosi, konflik, kejutan, insight, opini kuat, pelajaran praktis, atau punchline jelas.",
    "- Utamakan bagian yang tetap menarik walau ditonton tanpa konteks video penuh.",
    "- Hindari klip yang isinya terlalu mirip satu sama lain.",
    "- Jangan pilih klip yang terasa datar, bertele-tele, atau tidak punya payoff yang jelas.",
    "",
    "ATURAN RETENTION & STRUKTUR:",
    "- 3 detik pertama klip wajib punya daya tarik kuat: hook, konflik, rasa penasaran, statement tajam, atau emosi.",
    "- Struktur ideal: hook -> context singkat -> tension/insight -> payoff.",
    "- Jangan masukkan intro, basa-basi, jeda panjang, atau transisi yang tidak menambah daya tarik.",
    "",
    "ATURAN PEMOTONGAN TIMING:",
    "- start_time sedekat mungkin dengan momen kuat pertama, bukan sekadar awal topik.",
    "- end_time berhenti setelah payoff / punchline / emotional beat selesai.",
    "- Jangan potong terlalu awal jika kalimat masih menggantung; jangan perpanjang setelah inti pesan selesai.",
    "- Klip harus bisa dipahami tanpa menonton bagian sebelum/sesudahnya.",
    "",
    "VIRAL_SCORE (1-100):",
    "- 90-100: sangat berpotensi fyp/viral, emosi/konflik kuat, hook sangat nendang.",
    "- 80-89: menarik, berpotensi performa baik.",
    "- 70-79: standar, informatif tapi mungkin kurang greget.",
    "- Jangan pilih klip dengan viral_score di bawah 70 kecuali momen bagus di transkrip sangat terbatas.",
    "",
    "HOOK_TEXT:",
    "- 1 kalimat paling punchy yang ADA DI DALAM klip (bukan clickbait palsu).",
    "- Cocok sebagai teks pembuka on-screen untuk menahan penonton di 3 detik pertama.",
    "",
    "KEEP_SEGMENTS (SEGMENT TRIMMING):",
    '- Untuk tiap klip, buang bagian kurang menarik / filler / jeda di tengah. Pecah jadi "keep_segments" array {start, end}.',
    "- Segment harus berurutan kronologis dan tidak overlap. Bila klip sudah padat, 1 segment = klip utuh.",
    "",
    `BAHASA OUTPUT: semua title + hook_text dalam bahasa ${s.outputLanguage}.`,
    "",
    "ATURAN OUTPUT:",
    "- Output HARUS berupa JSON array valid. Jangan beri penjelasan apa pun di luar JSON.",
    "- Field wajib: start_time, end_time, title, viral_score. hook_text dan keep_segments opsional tapi diusahakan ada.",
    "",
    'STRUKTUR JSON: [{"start_time":30.5,"end_time":90.0,"title":"...","viral_score":92,"hook_text":"...","keep_segments":[{"start":30.5,"end":55.0}]}]',
  ].join("\n");

  const directionText = opts.ranges.length
    ? [
        "",
        "RENTANG EKSPLISIT DARI USER (WAJIB sertakan apa adanya, TIDAK terikat aturan durasi):",
        ...ranges.map((r) => `- ${formatClock(r.start)}-${formatClock(r.end)}`),
        "- Untuk rentang di atas, start_time/end_time = tepat rentang itu; viral_score + title tetap dievaluasi.",
        "",
      ].join("\n")
    : "";

  const user = [
    directionText,
    ...(opts.settings.userDirection
      ? ["ARAHAN USER (IKUTI DENGAN PRIORITAS TINGGI):", opts.settings.userDirection, ""]
      : []),
    "Transkrip:",
    opts.transcript,
  ]
    .filter(Boolean)
    .join("\n");

  // Rentang eksplisit / arahan user = instruksi keras → temperatur rendah biar
  // diikuti, tidak dihalusinasi jadi hal lain (RFC §1.1).
  const temperature = ranges.length ? 0.3 : opts.settings.userDirection ? 0.5 : 0.8;

  return { system, user, temperature };
}

/** Kandidat hasil parsing AI (sebelum filter + validasi) */
type RawCandidate = {
  start: number;
  end: number;
  title: string;
  viralScore: number;
  hookText: string | null;
  keepSegments: { start: number; end: number }[] | null;
};

/** Kandidat lolos filter, siap insert ke video_job_segment */
export type ClipCandidate = RawCandidate & { explicitRange: boolean };

/**
 * Parse respons AI (JSON array) → kandidat tervalidasi.
 *
 * Pertahanan berlapis: model bisa halusinasi tipe (number jadi string, field
 * hilang, start > end). Semua nilai dibaca defensif: Number(x) / String(x),
 * fallback default aman. Bila JSON sama sekali tidak terparse → null (caller
 * mark failed dengan kode jelas — log Modal cuma 1 hari, RFC §7.1).
 */
function parseAnalysisResponse(
  raw: string,
  settings: AutoClipSettings,
  durationSeconds: number,
  ranges: { start: number; end: number }[],
): ClipCandidate[] | null {
  // Top-level JSON array — ambil bracket terluar (bukan seperti layout-director
  // yang ambil object pertama).
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || !parsed.length) return null;

  // Panjang source valid? Probe Modal bisa gagal → NaN/0; clamp kandidat di
  // bawah wajib pakai nilai finite supaya tidak tercemar NaN.
  const sourceDur =
    Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : null;

  const candidates: ClipCandidate[] = [];
  for (const item of parsed) {
    const c = item as Record<string, unknown>;
    const start = Number(c.start_time ?? c.start);
    const end = Number(c.end_time ?? c.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;

    const title = String(c.title ?? c.title_indonesia ?? "").trim();
    const viralScore = Math.max(1, Math.min(100, Math.round(Number(c.viral_score ?? 70) || 70)));

    const hookRaw = c.hook_text ?? c.hook;
    const hookText = hookRaw === null || hookRaw === undefined ? null : String(hookRaw).trim();

    let keepSegments: { start: number; end: number }[] | null = null;
    const ksRaw = c.keep_segments;
    if (Array.isArray(ksRaw)) {
      const ks = ksRaw
        .map((k) => {
          const r = k as Record<string, unknown>;
          const s = Number(r.start ?? r.start_time);
          const e = Number(r.end ?? r.end_time);
          return Number.isFinite(s) && Number.isFinite(e) && e > s ? { start: s, end: e } : null;
        })
        .filter((k): k is { start: number; end: number } => k !== null);
      if (ks.length) keepSegments = ks;
    }

    candidates.push({
      start: Math.max(0, start),
      end: sourceDur !== null ? Math.min(sourceDur, end) : end,
      title: title || "Klip tanpa judul",
      viralScore,
      hookText: hookText || null,
      keepSegments,
      explicitRange: false,
    });
  }

  if (!candidates.length) return null;

  // Tandai kandidat yang cocok rentang eksplisit user (overlap ≥ 80% durasi
  // kandidat). Kandidat ini dikecualikan dari filter durasi di bawah.
  for (const cand of candidates) {
    const dur = cand.end - cand.start;
    for (const r of ranges) {
      const overlap = Math.min(cand.end, r.end) - Math.max(cand.start, r.start);
      if (overlap > 0 && overlap / dur >= 0.8) {
        cand.explicitRange = true;
        break;
      }
    }
  }

  // Filter durasi (kecuali explicitRange) + validasi batas source.
  //
  // Source lebih pendek dari minDurationSec user (mis. video 30s vs min 58s):
  // syarat durasi MUSTAHIL terpenuhi (dur kandidat selalu ≤ panjang source),
  // jadi jangan bunuh semua kandidat → lewati syarat min, cap max ke source.
  const sourceTooShort = sourceDur !== null && sourceDur < settings.minDurationSec;
  const effMinDuration = sourceTooShort ? 1 : settings.minDurationSec;
  const effMaxDuration =
    sourceDur !== null ? Math.min(settings.maxDurationSec, sourceDur) : settings.maxDurationSec;
  let filtered = candidates.filter((c) => {
    const dur = c.end - c.start;
    if (dur < 1) return false;
    if (c.explicitRange) return true; // rentang user, apa adanya
    return dur >= effMinDuration && dur <= effMaxDuration;
  });

  // Safety net terakhir: filter durasi mengosongkan SEMUA kandidat padahal
  // parse berhasil (mis. source == min tapi model memecah jadi segmen lebih
  // pendek) → pakai hasil parse apa adanya. Kegagalan durasi bukan kegagalan
  // AI; job harus tetap sukses dengan catatan di log.
  if (!filtered.length) {
    const usable = candidates.filter((c) => c.end - c.start >= 1);
    if (usable.length) {
      console.warn(
        `[auto-clip] filter durasi mengosongkan ${candidates.length} kandidat ` +
          `(min ${settings.minDurationSec}s/max ${settings.maxDurationSec}s, source ` +
          `${sourceDur ?? "?"}s) — fallback tanpa filter durasi`,
      );
      filtered = usable;
    }
  }

  // Rentang eksplisit yang TIDAK dikembalikan model → sintesis sendiri
  // (jaminan: arahan user selalu muncul di daftar kandidat, walau model
  // memutuskan tak memasukkannya).
  for (const r of ranges) {
    const covered = filtered.some(
      (c) => c.explicitRange && Math.abs(c.start - r.start) < 1 && Math.abs(c.end - r.end) < 1,
    );
    if (!covered) {
      filtered.push({
        start: Math.max(0, sourceDur !== null ? Math.min(r.start, sourceDur) : r.start),
        end: Math.max(0, sourceDur !== null ? Math.min(r.end, sourceDur) : r.end),
        title: `Rentang ${formatClock(r.start)}-${formatClock(r.end)}`,
        viralScore: 80, // netral: user yang minta, bukan skor AI
        hookText: null,
        keepSegments: null,
        explicitRange: true,
      });
    }
  }

  // Urut viral_score desc, ambil sejumlah target. Lalu anti-overlap: kandidat
  // yang overlap >70% dengan kandidat yang sudah dipilih dibuang (model sering
  // ulang momen sama dengan shift beberapa detik). Rentang eksplisit selalu
  // diizinkan (itu memang arahan user).
  filtered.sort((a, b) => b.viralScore - a.viralScore);
  const kept: ClipCandidate[] = [];
  for (const cand of filtered) {
    const dur = cand.end - cand.start;
    const dupes = kept.some(
      (k) => Math.min(k.end, cand.end) - Math.max(k.start, cand.start) > 0.7 * dur,
    );
    if (dupes && !cand.explicitRange) continue;
    kept.push(cand);
    if (kept.length >= settings.targetClipCount + ranges.length) break;
  }

  // Urutan tampil: rentang eksplisit user di atas (itu yang dia minta), lalu
  // viral_score desc. Jumlah akhir = target + semua rentang eksplisit.
  return kept
    .sort(
      (a, b) =>
        (b.explicitRange ? 1 : 0) - (a.explicitRange ? 1 : 0) || b.viralScore - a.viralScore,
    )
    .slice(0, settings.targetClipCount + ranges.length);
}

// ============================================================
// Cache Redis (pola sk:carousel-layout:* — RFC §6 langkah 3)
// ============================================================

function redisClientFromConn(conn: ConnectionOptions): import("ioredis").Redis {
  const { default: IORedis } = require("ioredis") as typeof import("ioredis");
  const url = (conn as { url?: string }).url ?? (typeof conn === "string" ? conn : "");
  return new IORedis(url);
}

async function readAnalysisCache(key: string): Promise<ClipCandidate[] | null> {
  const conn = getRedisConnection();
  if (!conn) return null;
  try {
    const client = redisClientFromConn(conn);
    try {
      const raw = await client.get(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as ClipCandidate[];
      return Array.isArray(parsed) ? parsed : null;
    } finally {
      await client.quit().catch(() => undefined);
    }
  } catch {
    return null;
  }
}

async function writeAnalysisCache(key: string, candidates: ClipCandidate[]): Promise<void> {
  const conn = getRedisConnection();
  if (!conn) return;
  try {
    const client = redisClientFromConn(conn);
    try {
      await client.set(key, JSON.stringify(candidates), "EX", ANALYSIS_CACHE_TTL_S);
    } finally {
      await client.quit().catch(() => undefined);
    }
  } catch {
    // cache gagal tulis bukan fatal — analisis tetap jalan, next job call ulang
  }
}

// ============================================================
// Inti processor
// ============================================================

/** Proses satu job analisis auto-clip (dipanggil BullMQ worker). */
export async function processAutoClipJob(
  videoJobId: string,
  onProgress?: (percent: number) => void,
): Promise<{ ok: boolean; candidateCount?: number }> {
  const adapter = getClipperAdapter();
  if (!adapter) {
    await markAutoClipFailed(
      videoJobId,
      "clipper_not_configured",
      "MODAL_CLIPPER_URL/MODAL_CLIPPER_TOKEN belum dikonfigurasi di worker",
    );
    return { ok: false };
  }

  const claimed = await claimAutoClipJob(videoJobId);
  if (!claimed) return { ok: false }; // sudah diclaim / bukan queued / bukan auto_clip

  try {
    const [job] = await db.select().from(videoJob).where(eq(videoJob.id, videoJobId)).limit(1);
    if (!job) throw new ClipperError("video_job tidak ditemukan", "job_not_found", false);
    if (job.mode !== "auto_clip") {
      throw new ClipperError("Job ini bukan mode auto_clip", "wrong_mode", false);
    }

    const clipSettings = (job.clipSettings as AutoClipSettings | null) ?? null;
    if (!clipSettings) {
      throw new ClipperError(
        "clipSettings kosong — job auto_clip tanpa konfigurasi",
        "bad_settings",
        false,
      );
    }

    // Progress ke DB (frontend polling) + job event BullMQ. Fire-and-forget
    // write — pola yang sama dengan render-processor (throttled oleh caller).
    const reportProgress = (percent: number): void => {
      onProgress?.(percent);
      db.update(videoJob)
        .set({ progress: Math.round(percent), updatedAt: new Date() })
        .where(eq(videoJob.id, videoJobId))
        .execute()
        .catch(() => undefined);
    };

    // --- muat source media (verify ownership via org job) ---
    const [baseVideo] = await db
      .select()
      .from(media)
      .where(and(eq(media.id, job.baseVideoMediaId), eq(media.organizationId, job.organizationId)))
      .limit(1);
    if (!baseVideo)
      throw new ClipperError("Source video tidak ditemukan", "media_not_found", false);
    if (!baseVideo.storageKey) {
      throw new ClipperError("Source video tidak punya storageKey", "media_not_found", false);
    }

    // --- resolve source: URL T1/T2 (materialkan ke R2) atau media library ---
    const datePrefix = `${job.organizationId}/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    const srtStorageKey = `${datePrefix}/clipper_${videoJobId}.srt`;

    let sourceUrl: string;
    let sourceTier: UrlSourceTier = "t1";
    // Hanya untuk input URL: clipper upload source ke R2 setelah probe.
    // Input media library: storageKey sudah ada, presign GET biasa.
    const sourceUploadUrl = job.urlSource
      ? await presignPut(baseVideo.storageKey, "video/mp4")
      : null;

    if (job.urlSource) {
      sourceUrl = job.urlSource;
      sourceTier = job.urlSourceTier === "t2" ? "t2" : "t1";
    } else {
      sourceUrl = await presignGet(baseVideo.storageKey);
    }

    const srtUploadUrl = await presignPut(srtStorageKey, "application/x-subrip");

    // --- panggil clipper (Modal): download + probe + upload source + SRT ---
    reportProgress(5);
    const ingest = await adapter.ingest(
      {
        jobId: videoJobId,
        sourceUrl,
        sourceTier,
        srtUploadUrl,
        sourceUploadUrl,
        // Model transkripsi untuk analisis: small (default). Medium opsi
        // akurasi — sementara ikut setting caption render job (tiny/base
        // kurang untuk seleksi; small sweet spot CPU vs akurasi).
        whisperModel: "small",
        language: "auto", // deteksi; user lihat detectedLanguage di respons
        wordTimestamps: false, // seleksi butuh level segment saja — lebih cepat
      },
      (percent) => reportProgress(Math.min(60, percent * 0.6)),
    );

    // --- backfill metadata source (URL input: row media dibuat route dengan
    // placeholder; upload biasa: data ini sudah ada, update idempoten) ---
    await db
      .update(media)
      .set({
        sizeBytes: ingest.sizeBytes || baseVideo.sizeBytes,
        width: ingest.width || baseVideo.width || null,
        height: ingest.height || baseVideo.height || null,
        durationSeconds: Math.round(ingest.durationSeconds) || baseVideo.durationSeconds || null,
      })
      .where(eq(media.id, baseVideo.id));

    await db
      .update(videoJob)
      .set({ srtStorageKey, progress: 65, updatedAt: new Date() })
      .where(eq(videoJob.id, videoJobId));

    // --- baca SRT dari R2 (single source of truth: file yang sama dipakai
    // audit/captions; tidak ada response transcript duplikat) ---
    const srtText = await fetchSrtText(srtStorageKey);
    const transcript = srtToTranscript(srtText);
    if (!transcript.trim()) {
      throw new ClipperError(
        "Transkrip kosong setelah parse SRT (mungkin audio non-bicara)",
        "empty_transcript",
        false,
      );
    }

    // --- seleksi momen via OpenRouter ---
    const ranges = parseExplicitRanges(clipSettings.userDirection);
    const cleanDirection = clipSettings.userDirection
      ? directionWithoutRanges(clipSettings.userDirection, ranges)
      : undefined;
    const settings: AutoClipSettings = {
      ...clipSettings,
      // direction sudah dipisah rentangnya — prompt pakai instruksi bebas saja
      // (rentang disuntik sebagai aturan eksplisit di system/user prompt).
      userDirection: cleanDirection || undefined,
    };

    const config = await getAiConfig();
    if (!config) {
      throw new ClipperError(
        "OPENROUTER_API_KEY belum dikonfigurasi — analisis butuh AI",
        "ai_not_configured",
        false,
      );
    }

    // Cache key wajib mencakup userDirection: transkrip + setting sama tapi
    // direction beda = output beda (RFC §6 langkah 3).
    const cacheKey = analysisCacheKey({
      srt: srtText,
      settings: clipSettings,
      model: config.model,
    });

    let candidates = await readAnalysisCache(cacheKey);
    if (candidates?.length) {
      console.log(`[auto-clip] cache hit (${candidates.length} kandidat)`);
    } else {
      // Record pemakaian kredit (limit tak terhingga — quota per plan ditunda,
      // RFC §11; sama pola layout-director).
      try {
        await consumeAiCredits(job.organizationId, Number.MAX_SAFE_INTEGER, {
          userId: job.createdByUserId ?? undefined,
          action: "auto_clip_analysis",
          model: config.model,
          credits: ANALYSIS_CREDIT_COST,
        });
      } catch {
        console.warn("[auto-clip] kredit AI habis — analisis tetap dijalankan (quota ditunda)");
      }

      const { system, user, temperature } = buildAnalysisPrompt({
        transcript,
        settings,
        durationSeconds: ingest.durationSeconds,
        ranges,
      });

      reportProgress(75);
      const raw = await chatCompletion(config, system, user, {
        temperature,
        // Transkrip panjang + N kandidat + keep_segments → output JSON besar.
        // 2500 sering terpotong tengah JSON (finish_reason=length) → parse
        // gagal → ai_bad_response. Naikkan agar struktur JSON lengkap.
        maxTokens: 4096,
      });

      candidates = parseAnalysisResponse(raw, clipSettings, ingest.durationSeconds, ranges);
      if (!candidates?.length) {
        // Log raw response untuk debugging — Modal log cuma 1 hari (RFC §7.1),
        // tidak ada cara lain lihat output model saat ini.
        console.error(`[auto-clip] ai_bad_response raw (job ${videoJobId}):`, raw.slice(0, 2000));
        throw new ClipperError(
          "AI tidak mengembalikan kandidat valid (JSON tidak terparse / kosong)",
          "ai_bad_response",
          false,
        );
      }
      await writeAnalysisCache(cacheKey, candidates);
      console.log(`[auto-clip] analisis done: ${candidates.length} kandidat (1 call AI)`);
    }

    // --- bulk insert kandidat (replace row lama bila retry) ---
    await db.delete(videoJobSegment).where(eq(videoJobSegment.videoJobId, videoJobId));
    await db.insert(videoJobSegment).values(
      candidates.map((c, order) => ({
        id: `sk_vseg_${crypto.randomUUID().replace(/-/g, "")}`,
        videoJobId,
        order,
        startSec: c.start,
        endSec: c.end,
        title: c.title.slice(0, 200),
        viralScore: c.viralScore,
        hookText: c.hookText?.slice(0, 300) ?? null,
        keepSegments: c.keepSegments,
        explicitRange: c.explicitRange,
        status: "pending" as const,
      })),
    );

    await db
      .update(videoJob)
      .set({
        status: "done",
        progress: 100,
        errorCode: null,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(videoJob.id, videoJobId));

    return { ok: true, candidateCount: candidates.length };
  } catch (error) {
    const clipErr =
      error instanceof ClipperError
        ? error
        : new ClipperError(
            error instanceof Error ? error.message : String(error),
            "auto_clip_unknown",
            true,
          );
    // throw retryable agar BullMQ retry; permanen → mark failed sekarang.
    if (clipErr.retryable) throw error;
    await markAutoClipFailed(videoJobId, clipErr.code, clipErr.message);
    return { ok: false };
  }
}

/** Baca file SRT dari R2 (buffer kecil — paling besar ~1-2 MB untuk 3 jam) */
async function fetchSrtText(storageKey: string): Promise<string> {
  try {
    const res = await getS3().send(
      new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: storageKey }),
    );
    const stream = res.Body;
    if (!stream) throw new Error("SRT body kosong");
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf-8");
  } catch (error) {
    throw new ClipperError(
      `Gagal baca SRT dari R2 (${storageKey}): ${error instanceof Error ? error.message : String(error)}`,
      "srt_read_failed",
      true, // R2 transient error → retry
    );
  }
}

/** Key cache: hash transcript + setting (termasuk userDirection) + model */
function analysisCacheKey(opts: {
  srt: string;
  settings: AutoClipSettings;
  model: string;
}): string {
  const srtHash = Buffer.from(opts.srt).toString("base64");
  const settingsHash = Buffer.from(JSON.stringify(opts.settings)).toString("base64");
  return `sk:auto-clip-analysis:${Buffer.from(`${srtHash}::${settingsHash}::${opts.model}`).toString("base64")}`;
}

// ============================================================
// Fan-out — kandidat terpilih → job render mode single (RFC §6 langkah 6)
// ============================================================

/**
 * Fan-out kandidat status "selected" → job render biasa (mode single).
 *
 * Dipanggil route setelah user pilih kandidat (POST select). Setiap segmen
 * dapat job render sendiri: baseVideoMediaId = source, settings render dengan
 * trimStart/trimEnd = rentang segmen. Link balik via renderVideoJobId.
 *
 * Invariant 1 job = 1 output tetap utuh → queue, progress, polling, galeri
 * opt-in semuanya terpakai apa adanya, tanpa kode render baru.
 *
 * Idempoten: segmen yang sudah punya renderVideoJobId tidak di-enqueue ulang.
 */
export async function fanOutSelectedSegments(videoJobId: string): Promise<{ enqueued: string[] }> {
  const [job] = await db.select().from(videoJob).where(eq(videoJob.id, videoJobId)).limit(1);
  if (!job) return { enqueued: [] };
  if (job.mode !== "auto_clip") return { enqueued: [] };

  const clipSettings = (job.clipSettings as AutoClipSettings | null) ?? null;
  const baseSettings = (job.settings as RenderSettings | null) ?? null;
  if (!clipSettings || !baseSettings) return { enqueued: [] };

  const segments = await db
    .select()
    .from(videoJobSegment)
    .where(and(eq(videoJobSegment.videoJobId, videoJobId), eq(videoJobSegment.status, "selected")))
    .orderBy(asc(videoJobSegment.order));

  const enqueued: string[] = [];
  for (const seg of segments) {
    if (seg.renderVideoJobId) continue; // sudah pernah di-fan-out (idempotent)

    const childId = `sk_video_job_${crypto.randomUUID().replace(/-/g, "")}`;
    const childSettings: RenderSettings = {
      ...baseSettings,
      // Orientasi output dari clipSettings (bisa beda dari source 16:9)
      orientation: clipSettings.orientation,
      // Potong segmen ini dari source — sk_render.py sudah dukung trim.
      videoProcessing: {
        ...(baseSettings.videoProcessing ?? {}),
        trimStart: seg.startSec,
        trimEnd: seg.endSec,
      },
      caption: {
        ...baseSettings.caption,
        enabled: clipSettings.captionEnabled,
      },
    };

    await db.transaction(async (tx) => {
      await tx.insert(videoJob).values({
        id: childId,
        organizationId: job.organizationId,
        baseVideoMediaId: job.baseVideoMediaId,
        mode: "single",
        settings: childSettings,
        status: "queued",
        createdByUserId: job.createdByUserId ?? null,
      });
      // Segmen → rendering; selesai → "rendered" di update oleh render
      // processor (hook renderVideoJobId di akhir job render sukses).
      await tx
        .update(videoJobSegment)
        .set({ status: "rendering", renderVideoJobId: childId })
        .where(eq(videoJobSegment.id, seg.id));
    });

    const jobId = await enqueueVideoRender(childId);
    if (!jobId) {
      console.warn(`[auto-clip] Redis tidak ada — child job ${childId} menunggu fallback polling`);
    }
    enqueued.push(childId);
  }

  return { enqueued };
}

// ============================================================
// Status helpers
// ============================================================

/** Tandai job analisis failed permanen */
export async function markAutoClipFailed(
  videoJobId: string,
  code: string,
  message: string,
): Promise<void> {
  await db
    .update(videoJob)
    .set({ status: "failed", errorCode: code, errorMessage: message, updatedAt: new Date() })
    .where(and(eq(videoJob.id, videoJobId), sql`status NOT IN ('done')`));
}

/**
 * Fallback polling: claim job auto_clip queued, proses berurutan (Redis kosong).
 * Filter mode WAJIB — tanpa ini loop ini akan mengambil job render biasa.
 */
export async function processAutoClipDueJobs(): Promise<{
  claimed: number;
  done: number;
  failed: number;
}> {
  const rows = await db
    .select({ id: videoJob.id })
    .from(videoJob)
    .where(and(eq(videoJob.status, "queued"), eq(videoJob.mode, "auto_clip")))
    .limit(5);

  let done = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const result = await processAutoClipJob(row.id);
      if (result.ok) done++;
      else failed++;
    } catch {
      failed++;
    }
  }
  return { claimed: rows.length, done, failed };
}
