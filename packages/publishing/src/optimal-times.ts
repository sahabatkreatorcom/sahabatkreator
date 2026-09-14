// Best time to post — slot optimal per platform berbasis data historis post sendiri.
//
// Pendekatan evidence-first (tanpa mock data):
// 1. Ambil semua post published org + snapshot analytics TERBARU per post
//    (likes + comments + shares + saves = engagement).
// 2. Agregasi engagement rata-rata per (platform, hari, jam) — timezone Asia/Jakarta (WIB),
//    mayoritas target pasar UMKM Indonesia.
// 3. Skor slot = engagement rata-rata relatif platform (0–100) + confidence dari jumlah sampel.
// 4. Platform tanpa data historis → fallback heuristik jam aktif sosial Indonesia
//    (confidence "low", ditandai heuristic agar UI bisa menampilkan disclaimer).
//
// Terinspirasi smart-scheduling engine reference (socaliseit) — versi ini tanpa
// Redis cache (query ringan on-demand) dan tanpa sinyal eksternal (competitor/audience)
// yang datanya belum tersedia.

import { db } from "@sahabatkreator/db";
import { sql } from "drizzle-orm";

/** Satu slot waktu dengan skor engagement */
export type OptimalTimeSlot = {
  platform: string;
  /** 0=Minggu … 6=Sabtu (WIB) */
  dayOfWeek: number;
  /** 0–23 (WIB) */
  hour: number;
  /** 0–100 relatif platform */
  score: number;
  /** Rata-rata engagement post pada slot ini */
  avgEngagement: number;
  /** Jumlah post historis pada slot ini */
  sampleCount: number;
  confidence: "low" | "medium" | "high";
  /** true = heuristik fallback (org belum punya data historis platform ini) */
  heuristic: boolean;
};

/** Jam prima per platform (heuristik Indonesia) — urutan = prioritas skor */
const HEURISTIC_HOURS: Record<string, number[]> = {
  instagram: [11, 18, 19, 20, 12, 21],
  instagram_standalone: [11, 18, 19, 20, 12, 21],
  facebook: [8, 12, 19, 20, 9, 13],
  threads: [7, 12, 20, 21, 8, 13],
  tiktok: [11, 16, 20, 21, 17, 22],
  youtube: [12, 17, 20, 18, 13, 19],
  linkedin: [8, 9, 12, 10, 13, 7],
  pinterest: [20, 21, 22, 19, 11, 18],
  bluesky: [8, 20, 21, 9, 19, 7],
  google_business: [9, 10, 11, 8, 12, 13],
};

/** Hari prioritas untuk heuristik (0=Minggu): weekday kerja + weekend sore utk entertainment */
const HEURISTIC_DAYS: Record<string, number[]> = {
  default: [1, 2, 3, 4, 5, 6, 0], // Senin–Jumat lebih dulu
  entertainment: [5, 6, 0, 4, 3, 1, 2], // Jum–Ming lebih dulu
};
const ENTERTAINMENT_PLATFORMS = new Set([
  "tiktok",
  "instagram",
  "instagram_standalone",
  "bluesky",
  "youtube",
]);

const DAYS_ID = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

/** Label slot untuk UI, mis. "Sel 19.00" */
export function slotLabel(slot: Pick<OptimalTimeSlot, "dayOfWeek" | "hour">): string {
  const hh = String(slot.hour).padStart(2, "0");
  return `${DAYS_ID[slot.dayOfWeek] ?? "?"} ${hh}.00`;
}

/** Offset WIB (UTC+7) — untuk konversi slot WIB → Date UTC (nextOccurrence) */
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

// published_at disimpan literal UTC (kolom timestamp tanpa tz, driver menulis ISO UTC).
// Konversi hari/jam ke WIB dilakukan DI SQL agar deterministik — parsing di JS
// tergantung timezone runtime (server), yang membuat hasil bergeser.
type EngagementRow = {
  platform: string;
  dow: string | number;
  hour: string | number;
  engagement: string | number | null;
};

/**
 * Hitung slot waktu optimal org (opsional filter platform).
 * Return SEMUA slot dengan skor, sorted score desc — pemanggil ambil top-N.
 */
export async function computeOptimalTimes(
  organizationId: string,
  platform?: string,
): Promise<OptimalTimeSlot[]> {
  // Snapshot analytics terbaru per post (bukan sum lintas hari — kumulatif lifetime)
  const rows = await db.execute(
    sql`select p.platform,
               extract(dow from (p.published_at at time zone 'UTC' at time zone 'Asia/Jakarta'))::int as dow,
               extract(hour from (p.published_at at time zone 'UTC' at time zone 'Asia/Jakarta'))::int as hour,
               (coalesce(latest.likes,0) + coalesce(latest.comments,0) + coalesce(latest.shares,0) + coalesce(latest.saves,0)) as engagement
        from post p
        join lateral (
          select * from post_analytics pa
          where pa.post_id = p.id
          order by pa.date desc
          limit 1
        ) latest on true
        where p.organization_id = ${organizationId}
          and p.published_at is not null
          ${platform ? sql`and p.platform = ${platform}` : sql``}`,
  );

  const data = (rows.rows as EngagementRow[]).filter((r) => r.engagement !== null);

  // Agregasi per (platform, dow, hour)
  const agg = new Map<
    string,
    { platform: string; dow: number; hour: number; sum: number; count: number }
  >();
  for (const row of data) {
    const dow = Number(row.dow);
    const hour = Number(row.hour);
    if (!Number.isInteger(dow) || !Number.isInteger(hour)) continue;
    const engagement = Number(row.engagement) || 0;
    const key = `${row.platform}:${dow}:${hour}`;
    const cur = agg.get(key) ?? { platform: row.platform, dow, hour, sum: 0, count: 0 };
    cur.sum += engagement;
    cur.count += 1;
    agg.set(key, cur);
  }

  // Platform yang punya data
  const platformsWithData = new Set([...agg.values()].map((a) => a.platform));

  // Skor per platform (relatif max rata-rata platform tsb)
  const slots: OptimalTimeSlot[] = [];
  const byPlatform = new Map<
    string,
    Array<{ platform: string; dow: number; hour: number; sum: number; count: number }>
  >();
  for (const a of agg.values()) {
    const list = byPlatform.get(a.platform) ?? [];
    list.push(a);
    byPlatform.set(a.platform, list);
  }

  for (const [platformKey, entries] of byPlatform) {
    const maxAvg = Math.max(...entries.map((e) => e.sum / e.count), 1);
    for (const e of entries) {
      const avg = e.sum / e.count;
      slots.push({
        platform: platformKey,
        dayOfWeek: e.dow,
        hour: e.hour,
        score: Math.round((avg / maxAvg) * 100),
        avgEngagement: Math.round(avg * 10) / 10,
        sampleCount: e.count,
        confidence: e.count >= 5 ? "high" : e.count >= 2 ? "medium" : "low",
        heuristic: false,
      });
    }
  }

  // Fallback heuristik untuk platform connect tapi belum ada data historis
  const platformsToFill = platform
    ? [platform]
    : [...new Set([...Object.keys(HEURISTIC_HOURS), ...platformsWithData])];
  for (const platformKey of platformsToFill) {
    if (platformsWithData.has(platformKey)) continue;
    const hours = HEURISTIC_HOURS[platformKey];
    if (!hours) continue;
    const dayOrder = ENTERTAINMENT_PLATFORMS.has(platformKey)
      ? HEURISTIC_DAYS.entertainment!
      : HEURISTIC_DAYS.default!;
    // Top-6 kombinasi jam prima × hari prioritas (spread: hari berbeda untuk tiap jam)
    hours.slice(0, 6).forEach((hour, idx) => {
      const dow = dayOrder[idx % dayOrder.length]!;
      slots.push({
        platform: platformKey,
        dayOfWeek: dow,
        hour,
        // skor menurun: jam pertama 70 → 65 → … ; 4 slot pertama share hari beda
        score: Math.max(70 - idx * 5, 45),
        avgEngagement: 0,
        sampleCount: 0,
        confidence: "low",
        heuristic: true,
      });
    });
  }

  return slots.sort((a, b) => b.score - a.score);
}

/** Slot berikutnya setelah `from` (mis. untuk saran jadwal compose) */
export function nextOccurrence(
  slot: Pick<OptimalTimeSlot, "dayOfWeek" | "hour">,
  from = new Date(),
): Date {
  const local = new Date(from.getTime() + WIB_OFFSET_MS);
  const current = local.getUTCDay() * 24 + local.getUTCHours();
  const target = slot.dayOfWeek * 24 + slot.hour;
  let diff = target - current;
  if (diff <= 0) diff += 7 * 24; // minggu depan bila sudah lewat
  const resultLocal = new Date(local.getTime() + diff * 60 * 60 * 1000);
  // Normalisasi menit/detik ke 0, lalu kembalikan sebagai waktu UTC (moment.js-side pakai apa adanya)
  resultLocal.setUTCMinutes(0, 0, 0);
  return new Date(resultLocal.getTime() - WIB_OFFSET_MS);
}
