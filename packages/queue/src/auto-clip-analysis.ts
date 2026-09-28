// Auto-clip — SRT → prompt transcript + parsing respons AI.
//
// Dari pecahan auto-clip-processor.ts. Murni transformasi data (tidak ada I/O:
// tidak HTTP, tidak DB, tidak R2) supaya seluruh logika seleksi momen bisa
// diuji unit tanpa Modal/Redis. Processor tinggal orchestrasi: claim job →
// fetch SRT → build prompt → call AI → parse → simpan.
//
// RFC docs/rfc-auto-clip.md §6. Port yang dipindah dari opensource-clipping
// v1.12.0 HANYA get_analysis_prompt + skema JSON (viral_score/start_time/
// end_time/hook). _segments_to_srt, _trim_video, _whisper, _build_montage
// SUDAH ADA di sk_render.py / sk_clipper.py — jangan dobel.

import type { AutoClipSettings } from "@sahabatkreator/db/schema";

/**
 * Parse SRT ke format prompt: `[start - end] teks` per baris (format yang
 * dipakai get_analysis_prompt di repo referensi).
 */
export function srtToTranscript(srt: string): string {
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
export function directionWithoutRanges(
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

export function formatClock(sec: number): string {
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
export function buildAnalysisPrompt(opts: {
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
export function parseAnalysisResponse(
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
