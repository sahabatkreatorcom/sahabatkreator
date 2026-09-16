// Platform health checker — ping endpoint ringan tiap platform & simpan status.
// Dipanggil worker berkala; hasilnya dibaca route /status (user) dan /api/status-public (publik).

import { db } from "@sahabatkreator/db";
import { platformHealth } from "@sahabatkreator/db/schema";
import { sql } from "drizzle-orm";
import { GRAPH_FB_URL } from "./config";

/** Endpoint health ringan per platform (GET tanpa auth, tidak mengonsumsi kuota API app) */
const PLATFORM_HEALTH_ENDPOINTS: Record<string, string> = {
  instagram: `${GRAPH_FB_URL}/107208775650959`, // Meta status page object
  instagram_standalone: "https://www.instagram.com/robots.txt",
  facebook: `${GRAPH_FB_URL}/107208775650959`,
  threads: "https://www.threads.net/robots.txt",
  tiktok: "https://www.tiktok.com/robots.txt",
  youtube: "https://www.youtube.com/robots.txt",
  pinterest: "https://www.pinterest.com/robots.txt",
  linkedin: "https://www.linkedin.com/robots.txt",
  bluesky: "https://bsky.app/robots.txt",
  google_business: "https://www.google.com/robots.txt",
};

/** Nama tampilan platform (utk halaman status) */
export const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  instagram_standalone: "Instagram (Standalone)",
  facebook: "Facebook",
  threads: "Threads",
  tiktok: "TikTok",
  youtube: "YouTube",
  pinterest: "Pinterest",
  linkedin: "LinkedIn",
  linkedin_org: "LinkedIn (Halaman Company)",
  bluesky: "Bluesky",
  google_business: "Google Business",
  manual: "Manual",
};

export type PlatformHealthStatus = "operational" | "degraded" | "outage" | "unknown";

export type PlatformHealthRow = {
  platform: string;
  status: PlatformHealthStatus;
  message: string | null;
  latencyMs: number | null;
  checkedAt: Date | null;
};

/**
 * Ping satu platform dan klasifikasikan status:
 * - 2xx/3xx dalam < 10s → operational
 * - 2xx/3xx tapi lambat (≥ 10s) → degraded
 * - 5xx / network error → outage
 * - 4xx (termasuk 429) → operational (platform tetap hidup, hanya menolak probe anonim)
 * Latensi dihitung untuk ditampilkan di halaman status.
 */
async function checkPlatform(
  platform: string,
  url: string,
): Promise<Omit<PlatformHealthRow, "checkedAt"> & { checkedAt: Date }> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "SahabatKreator-HealthCheck/1.0" },
    });
    const latencyMs = Date.now() - started;
    if (res.ok || (res.status >= 300 && res.status < 400)) {
      const status: PlatformHealthStatus = latencyMs >= 10_000 ? "degraded" : "operational";
      return {
        platform,
        status,
        message: status === "degraded" ? `Respons lambat (${latencyMs}ms)` : null,
        latencyMs,
        checkedAt: new Date(),
      };
    }
    if (res.status >= 500) {
      return {
        platform,
        status: "outage",
        message: `Error server platform (HTTP ${res.status})`,
        latencyMs,
        checkedAt: new Date(),
      };
    }
    // 4xx (termasuk 429 rate-limit utk probe anonim, mis. robots.txt Threads,
    // dan robots.txt 404) → platform tetap hidup. Probe ini tidak memakai
    // token app, jadi 429 hanya berarti edge platform menolak ping anonim
    // — bukan tanda gangguan layanan platform.
    return {
      platform,
      status: "operational",
      message: null,
      latencyMs,
      checkedAt: new Date(),
    };
  } catch (error) {
    return {
      platform,
      status: "outage",
      message: `Tidak dapat terhubung: ${error instanceof Error ? error.message : "network error"}`,
      latencyMs: Date.now() - started,
      checkedAt: new Date(),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Cek semua platform paralel lalu upsert hasil ke platform_health.
 * Return ringkasan jumlah per status (untuk log worker).
 */
export async function checkAllPlatformHealth(): Promise<{
  checked: number;
  operational: number;
  degraded: number;
  outage: number;
}> {
  const entries = Object.entries(PLATFORM_HEALTH_ENDPOINTS);
  const results = await Promise.all(entries.map(([platform, url]) => checkPlatform(platform, url)));

  for (const row of results) {
    await db
      .insert(platformHealth)
      .values({
        id: `phealth_${row.platform}`,
        platform: row.platform as typeof platformHealth.$inferInsert.platform,
        status: row.status,
        message: row.message,
        checkedAt: row.checkedAt,
      })
      .onConflictDoUpdate({
        target: platformHealth.platform,
        set: {
          status: row.status,
          message: row.message,
          checkedAt: row.checkedAt,
        },
      });
  }

  return {
    checked: results.length,
    operational: results.filter((r) => r.status === "operational").length,
    degraded: results.filter((r) => r.status === "degraded").length,
    outage: results.filter((r) => r.status === "outage").length,
  };
}

/**
 * Baca status platform terakhir dari DB (fallback "unknown" bila belum pernah dicek).
 * Platform tanpa row → status unknown. Latensi tidak disimpan di schema,
 * hanya status + pesan + checkedAt.
 */
export async function getPlatformHealth(): Promise<(PlatformHealthRow & { label: string })[]> {
  const rows = await db.select().from(platformHealth);
  const byPlatform = new Map(rows.map((r) => [r.platform as string, r]));

  return Object.keys(PLATFORM_HEALTH_ENDPOINTS).map((platform) => {
    const row = byPlatform.get(platform);
    return {
      platform,
      label: PLATFORM_LABELS[platform] ?? platform,
      status: (row?.status ?? "unknown") as PlatformHealthStatus,
      message: row?.message ?? null,
      latencyMs: null,
      checkedAt: row?.checkedAt ?? null,
    };
  });
}

/** Hitung status keseluruhan: outage jika ada outage, degraded jika ada degraded */
export function overallStatus(rows: { status: PlatformHealthStatus }[]): PlatformHealthStatus {
  if (rows.some((r) => r.status === "outage")) return "outage";
  if (rows.some((r) => r.status === "degraded")) return "degraded";
  if (rows.length === 0 || rows.every((r) => r.status === "unknown")) return "unknown";
  return "operational";
}

/** Fungsi util ringan untuk mengecek kesehatan DB (dipakai route status) */
export async function checkDbHealth(): Promise<{
  status: "operational" | "outage";
  latencyMs: number;
  message: string | null;
}> {
  const started = Date.now();
  try {
    await db.execute(sql`select 1`);
    return { status: "operational", latencyMs: Date.now() - started, message: null };
  } catch (error) {
    return {
      status: "outage",
      latencyMs: Date.now() - started,
      message: error instanceof Error ? error.message : "DB error",
    };
  }
}
