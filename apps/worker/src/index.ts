// Worker Sahabat Kreator — publisher
//
// Mode operasi:
// 1. REDIS_URL diset → BullMQ processor per platform (retry exponential, rate limiter,
//    delayed job presisi milidetik) + recovery sweep rutin.
// 2. REDIS_URL kosong → DB polling fallback (claim atomik tiap 30s, presisi ±30s).
//
// Endpoint:
// - GET /health — health check (mode aktif: bullmq | fallback)
// - POST /run — trigger manual satu siklus fallback / recovery.
//   Autentikasi: header x-cron-secret (WAJIB) — dibandingkan timing-safe.
//   Query string ?secret= TIDAK lagi didukung (secret di URL bocor ke log akses).
import { createHash, timingSafeEqual } from "node:crypto";
import { sendEmail } from "@sahabatkreator/auth";
import {
  buildReportEmailHtml,
  generateDueSebReports,
  getDueReports,
  getReportData,
  markReportSent,
} from "@sahabatkreator/db";
import {
  checkAllPlatformHealth,
  recoverStalePosts,
  refreshDueTokens,
  runPublishCycle,
  syncDueAccounts,
  syncDueAnalyticsAccounts,
  syncDueDMAccounts,
  syncDueOrganizationsPosts,
} from "@sahabatkreator/publishing";
import {
  closeQueues,
  createPublishWorker,
  createReminderWorker,
  getRedisConnection,
  runReminderCycle,
} from "@sahabatkreator/queue";
import type { Context } from "hono";
import { Hono } from "hono";
import { logger } from "hono/logger";

const app = new Hono();
app.use(logger());

app.get("/health", (c) => c.json({ status: "ok", service: "sahabatkreator-worker" }));

const CRON_SECRET = process.env.CRON_SECRET;

// Peringatan startup bila CRON_SECRET tidak diset — endpoint cron akan menolak
// semua request (fail-closed), jadi operator perlu tahu sejak awal.
if (!CRON_SECRET) {
  console.warn(
    "[worker] CRON_SECRET belum diset — semua endpoint cron (/run, /sync-*) " +
      "menolak request dengan 503. Set CRON_SECRET di environment agar cron eksternal " +
      "bisa memanggil worker.",
  );
}

/**
 * Perbandingan secret timing-safe: kedua nilai di-hash SHA-256 dulu agar
 * panjang buffer selalu sama (timingSafeEqual menolak panjang beda), lalu
 * dibandingkan konstanta-waktu untuk mencegah timing attack.
 */
function secretsMatch(received: string | undefined, expected: string): boolean {
  if (typeof received !== "string" || received.length === 0) return false;
  const a = createHash("sha256").update(received).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Guard autentikasi cron — fail-closed:
 * - CRON_SECRET kosong → 503 (endpoint tidak boleh terbuka).
 * - header x-cron-secret salah/tidak ada → 401.
 * Return Response error, atau null bila lolos.
 */
function requireCronSecret(c: Context): Response | null {
  if (!CRON_SECRET) {
    console.error("[worker] cron trigger ditolak: CRON_SECRET belum dikonfigurasi");
    return c.json({ message: "CRON_SECRET belum dikonfigurasi" }, 503);
  }
  const received = c.req.header("x-cron-secret");
  if (!secretsMatch(received, CRON_SECRET)) {
    return c.json({ message: "Unauthorized" }, 401);
  }
  return null;
}

/** Satu siklus engagement sync (polling komentar/review → inbox) */
async function runEngagementSync(): Promise<void> {
  const result = await syncDueAccounts(15, 10);
  if (result.synced > 0 || result.errors.length > 0) {
    console.log(
      `[engagement-sync] synced=${result.synced} newItems=${result.newItems}` +
        (result.errors.length > 0 ? ` errors=${result.errors.length}` : ""),
    );
    for (const err of result.errors) {
      console.warn(`[engagement-sync] ${err}`);
    }
  }
}

/** Satu siklus analytics sync (followers + metrik post → snapshot harian) */
async function runAnalyticsSync(): Promise<void> {
  const result = await syncDueAnalyticsAccounts(10);
  if (result.synced > 0 || result.errors.length > 0) {
    console.log(
      `[analytics-sync] accounts=${result.synced} posts=${result.postsSynced}` +
        (result.errors.length > 0 ? ` errors=${result.errors.length}` : ""),
    );
    for (const err of result.errors) {
      console.warn(`[analytics-sync] ${err}`);
    }
  }
}

/** Satu siklus DM sync (pesan IG/FB → inbox percakapan) */
async function runDMSync(): Promise<void> {
  const result = await syncDueDMAccounts(15, 10);
  if (result.synced > 0 || result.errors.length > 0) {
    console.log(
      `[dm-sync] accounts=${result.synced} newMessages=${result.newMessages}` +
        (result.errors.length > 0 ? ` errors=${result.errors.length}` : ""),
    );
    for (const err of result.errors) {
      console.warn(`[dm-sync] ${err}`);
    }
  }
}

/** Satu siklus fallback (DB polling) */
async function runCycle(): Promise<string> {
  try {
    const result = await runPublishCycle();
    const line = `claimed=${result.claimed} published=${result.published} processing=${result.processing} failed=${result.failed} polled(p=${result.polled.published},f=${result.polled.failed}) recovered=${result.recovered}`;
    if (result.claimed > 0 || result.polled.published > 0 || result.recovered > 0) {
      console.log(`[worker-fallback] ${line}`);
    }
    return line;
  } catch (error) {
    console.error("[worker-fallback] cycle error:", error);
    throw error;
  }
}

// Trigger manual (cron eksternal / debugging)
app.post("/run", async (c) => {
  const rejected = requireCronSecret(c);
  if (rejected) return rejected;
  if (mode === "bullmq") {
    // Mode BullMQ: jalankan recovery sweep saja (job processing dikerjakan processor)
    const recovered = await recoverStalePosts();
    return c.json({ ok: true, mode, recovered });
  }
  const result = await runCycle();
  return c.json({ ok: true, mode, result });
});

// Trigger manual engagement sync (cron eksternal / debugging)
app.post("/sync-engagement", async (c) => {
  const rejected = requireCronSecret(c);
  if (rejected) return rejected;
  const result = await syncDueAccounts(15, 10);
  return c.json({ ok: true, mode, ...result, errors: result.errors.length });
});

// Trigger manual analytics sync (cron eksternal / debugging)
app.post("/sync-analytics", async (c) => {
  const rejected = requireCronSecret(c);
  if (rejected) return rejected;
  const result = await syncDueAnalyticsAccounts(10);
  return c.json({ ok: true, mode, ...result, errors: result.errors.length });
});

// Trigger manual token refresh (cron eksternal / debugging)
app.post("/refresh-tokens", async (c) => {
  const rejected = requireCronSecret(c);
  if (rejected) return rejected;
  const result = await refreshDueTokens(50);
  return c.json({ ok: true, ...result });
});

const port = Number(process.env.WORKER_PORT ?? 3001);
const POLL_INTERVAL_MS = 30_000;

// ---- Inisialisasi mode ----
const redisConn = getRedisConnection();
const mode: "bullmq" | "fallback" = redisConn ? "bullmq" : "fallback";

const PLATFORMS = [
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
];

if (mode === "bullmq") {
  console.log(
    `[worker] Mode BullMQ (Redis) — processor ${PLATFORMS.length} platform, port ${port}`,
  );
  for (const platform of PLATFORMS) {
    createPublishWorker(platform);
  }
  // Processor job "post-reminder" — pengingat push post manual terjadwal
  createReminderWorker();
  // Recovery sweep tetap jalan (job hilang saat Redis flush / worker crash sebelum enqueue poll)
  setInterval(() => {
    recoverStalePosts()
      .then((n) => n > 0 && console.log(`[worker] Recovery: ${n} post stale ditandai failed`))
      .catch(() => undefined);
  }, 60_000);
} else {
  console.warn(
    `[worker] REDIS_URL tidak diset → mode FALLBACK DB polling (presisi ${POLL_INTERVAL_MS / 1000}s, tanpa retry backoff).`,
  );
  console.log(`[worker] Publisher worker berjalan di port ${port}`);
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await runCycle();
    } catch {
      // sudah di-log runCycle
    } finally {
      running = false;
    }
  }, POLL_INTERVAL_MS);
  setTimeout(() => runCycle().catch(() => {}), 3_000);
}

// ---- Engagement sync loop (kedua mode) ----
// Tiap 5 menit cek akun due (lastSyncedAt > 15 menit lalu) → sync komentar/review.
// syncDueAccounts membatasi 10 akun/siklus dan stagger per-account di dalamnya,
// jadi interval pendek hanya memproses akun yang benar-benar due.
const SYNC_TICK_MS = 5 * 60 * 1000;
let syncing = false;
setInterval(() => {
  if (syncing) return;
  syncing = true;
  runEngagementSync()
    .catch((error) => console.error("[engagement-sync] error:", error))
    .finally(() => {
      syncing = false;
    });
}, SYNC_TICK_MS);
// Sync pertama 45 detik setelah start (beri jeda ke publish startup)
setTimeout(() => runEngagementSync().catch(() => {}), 45_000);

// ---- DM sync loop (kedua mode) ----
// Tiap 5 menit cek akun IG/FB due (lastDmSyncedAt > 15 menit lalu) → sync percakapan DM.
// Akun tanpa permission instagram_manage_messages di-skip diam (app dev mode).
const DM_SYNC_TICK_MS = 5 * 60 * 1000;
let dmSyncing = false;
setInterval(() => {
  if (dmSyncing) return;
  dmSyncing = true;
  runDMSync()
    .catch((error) => console.error("[dm-sync] error:", error))
    .finally(() => {
      dmSyncing = false;
    });
}, DM_SYNC_TICK_MS);
// DM sync pertama 90 detik setelah start (stagger dengan engagement sync startup)
setTimeout(() => runDMSync().catch(() => {}), 90_000);

// ---- Analytics sync loop (kedua mode) ----
// Tiap jam cek akun yang belum punya snapshot hari ini (syncDueAnalyticsAccounts
// filter due by snapshot account_analytics, max 10/siklus — metrik berubah lambat,
// interval 1 jam cukup hemat rate limit dan menutup post yang publish baru).
const ANALYTICS_TICK_MS = 60 * 60 * 1000;
let analyticsSyncing = false;
setInterval(() => {
  if (analyticsSyncing) return;
  analyticsSyncing = true;
  runAnalyticsSync()
    .catch((error) => console.error("[analytics-sync] error:", error))
    .finally(() => {
      analyticsSyncing = false;
    });
}, ANALYTICS_TICK_MS);
// Sync pertama 2 menit setelah start (setelah engagement sync startup)
setTimeout(() => runAnalyticsSync().catch(() => {}), 2 * 60 * 1000);

// ---- Token refresh loop (kedua mode) ----
// Tiap jam: refresh proaktif akun yang token-nya expired ≤2 hari lagi.
// Akun expired tanpa refresh token ditandai needs_reconnect → user harus hubungkan ulang.
async function runTokenRefresh(): Promise<void> {
  const result = await refreshDueTokens(20);
  if (result.checked > 0) {
    console.log(
      `[token-refresh] checked=${result.checked} refreshed=${result.refreshed} failed=${result.failed} expired=${result.expired}`,
    );
  }
  for (const err of result.errors) {
    console.warn(`[token-refresh] ${err}`);
  }
}
const TOKEN_REFRESH_TICK_MS = 60 * 60 * 1000;
let tokenRefreshing = false;
setInterval(() => {
  if (tokenRefreshing) return;
  tokenRefreshing = true;
  runTokenRefresh()
    .catch((error) => console.error("[token-refresh] error:", error))
    .finally(() => {
      tokenRefreshing = false;
    });
}, TOKEN_REFRESH_TICK_MS);
// Refresh pertama 4 menit setelah start
setTimeout(() => runTokenRefresh().catch(() => {}), 4 * 60 * 1000);

// ---- Post Reminder loop (kedua mode) ----
// Mode BullMQ: job diproses createReminderWorker — loop ini hanya safety net
// (job hilang saat Redis flush / enqueue gagal). Mode fallback: satu-satunya jalur
// kirim — polling kolom post_group.reminder_at yang sudah due.
const REMINDER_TICK_MS = 30_000;
let reminding = false;
setInterval(() => {
  if (reminding) return;
  reminding = true;
  runReminderCycle()
    .then((r) => {
      if (r.sent > 0) console.log(`[post-reminder] terkirim ${r.sent} pengingat (fallback)`);
    })
    .catch((error) => console.error("[post-reminder] cycle error:", error))
    .finally(() => {
      reminding = false;
    });
}, REMINDER_TICK_MS);
// Cek pertama 10 detik setelah start
setTimeout(() => runReminderCycle().catch(() => {}), 10_000);

// ---- Scheduled Reports loop (kedua mode) ----
// Tiap jam cek jadwal laporan email due (weekly/monthly, dedupe 20 jam)
// → generate dari data analytics riil → kirim via Resend.
async function runReportCycle(): Promise<void> {
  const due = await getDueReports();
  for (const r of due) {
    try {
      const data = await getReportData(r.organizationId, r.from, r.to);
      await sendEmail({
        to: r.email,
        subject: `[Sahabat Kreator] Laporan Performa ${data.organizationName} — ${r.periodLabel}`,
        html: buildReportEmailHtml(data, r.periodLabel),
      });
      await markReportSent(r.scheduleId);
      console.log(`[report] terkirim ke ${r.email} (${r.periodLabel})`);
    } catch (error) {
      console.error(`[report] gagal kirim ke ${r.email}:`, error);
    }
  }
}
const REPORT_TICK_MS = 60 * 60 * 1000;
let reporting = false;
setInterval(() => {
  if (reporting) return;
  reporting = true;
  runReportCycle()
    .catch((error) => console.error("[report] cycle error:", error))
    .finally(() => {
      reporting = false;
    });
}, REPORT_TICK_MS);
// Cek pertama 3 menit setelah start
setTimeout(() => runReportCycle().catch(() => {}), 3 * 60 * 1000);

// ---- Platform Health loop (kedua mode) ----
// Tiap 5 menit ping endpoint ringan tiap platform → upsert platform_health
// (dibaca halaman /status user dan /api/status-public publik).
async function runPlatformHealth(): Promise<void> {
  const result = await checkAllPlatformHealth();
  if (result.degraded > 0 || result.outage > 0) {
    console.warn(
      `[platform-health] checked=${result.checked} operational=${result.operational} degraded=${result.degraded} outage=${result.outage}`,
    );
  }
}
const HEALTH_TICK_MS = 5 * 60 * 1000;
let healthChecking = false;
setInterval(() => {
  if (healthChecking) return;
  healthChecking = true;
  runPlatformHealth()
    .catch((error) => console.error("[platform-health] error:", error))
    .finally(() => {
      healthChecking = false;
    });
}, HEALTH_TICK_MS);
// Cek pertama 20 detik setelah start
setTimeout(() => runPlatformHealth().catch(() => {}), 20_000);

// ---- Posts Sync loop (kedua mode) ----
// Tiap 4 jam: import konten terbit langsung di platform (bukan via SK) ke DB
// agar kalender menampilkan konten lengkap. Max 10 org/siklus (rate limit platform).
async function runPostsSync(): Promise<void> {
  const result = await syncDueOrganizationsPosts(10, 30);
  if (result.imported > 0 || result.updated > 0 || result.errors.length > 0) {
    console.log(
      `[posts-sync] orgs=${result.organizations} imported=${result.imported} updated=${result.updated}` +
        (result.errors.length > 0 ? ` errors=${result.errors.length}` : ""),
    );
  }
  for (const err of result.errors) {
    console.warn(`[posts-sync] ${err}`);
  }
}
const POSTS_SYNC_TICK_MS = 4 * 60 * 60 * 1000;
let postsSyncing = false;
setInterval(() => {
  if (postsSyncing) return;
  postsSyncing = true;
  runPostsSync()
    .catch((error) => console.error("[posts-sync] error:", error))
    .finally(() => {
      postsSyncing = false;
    });
}, POSTS_SYNC_TICK_MS);
// Sync pertama 6 menit setelah start
setTimeout(() => runPostsSync().catch(() => {}), 6 * 60 * 1000);

// ---- SEB Proactive Reports loop (kedua mode) ----
// Tiap 6 jam sweep org yang mengaktifkan SEB: generate report coaching bila
// belum ada report untuk tanggal lokal org (dedupe timezone-aware ada di lib).
async function runSebReportCycle(): Promise<void> {
  const result = await generateDueSebReports();
  if (result.generated > 0 || result.skipped > 0) {
    console.log(`[seb-report] generated=${result.generated} skipped=${result.skipped}`);
  }
}
const SEB_REPORT_TICK_MS = 6 * 60 * 60 * 1000;
let sebReporting = false;
setInterval(() => {
  if (sebReporting) return;
  sebReporting = true;
  runSebReportCycle()
    .catch((error) => console.error("[seb-report] error:", error))
    .finally(() => {
      sebReporting = false;
    });
}, SEB_REPORT_TICK_MS);
// Cek pertama 5 menit setelah start
setTimeout(() => runSebReportCycle().catch(() => {}), 5 * 60 * 1000);

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("[worker] SIGTERM — shutting down");
  await closeQueues();
  process.exit(0);
});
process.on("SIGINT", async () => {
  await closeQueues();
  process.exit(0);
});

export default {
  port,
  fetch: app.fetch,
};
