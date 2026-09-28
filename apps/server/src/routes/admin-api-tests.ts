// Routes suite diagnostik API platform — logika suite ada di
// admin-api-test-core.ts (+ -meta.ts / -platforms.ts). File ini hanya
// HTTP layer: daftar test & jalankan suite per platform.
//
// Prinsip keamanan: hasil test TIDAK PERNAH berisi secret/token —
// hanya status (pass/fail/warn) + pesan + durasi.

import { GRAPH_IG_URL, GRAPH_THREADS_URL } from "@sahabatkreator/publishing";
import { Hono } from "hono";
import { logAdminAction } from "../lib/audit";
import { errorResponse, requirePlatformAdmin } from "../lib/auth-guard";
import { AVAILABLE_PLATFORMS, type PlatformKey, type TestResult } from "./admin-api-test-core";
import { runMetaSuite } from "./admin-api-tests-meta";
import {
  runBlueskySuite,
  runGoogleBusinessSuite,
  runLinkedInOrganizationSuite,
  runLinkedInSuite,
  runPinterestSuite,
  runTikTokSuite,
  runYouTubeSuite,
} from "./admin-api-tests-platforms";

export const apiTestsRoute = new Hono();

/**
 * Cache hasil terakhir per platform (in-memory — cukup untuk diagnostik
 * on-demand; tidak perlu persist, refresh halaman ulang test kapan pun).
 */
const lastResults = new Map<PlatformKey, { ranAt: string; results: TestResult[] }>();

/** GET /admin/api-tests — daftar test tersedia + hasil cache terakhir per platform */
apiTestsRoute.get("/", async (c) => {
  try {
    await requirePlatformAdmin(c);
    return c.json({
      platforms: AVAILABLE_PLATFORMS.map((platform) => ({
        platform,
        lastRun: lastResults.get(platform)?.ranAt ?? null,
        results: lastResults.get(platform)?.results ?? null,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /admin/api-tests/run/:platform — jalankan suite diagnostik */
apiTestsRoute.post("/run/:platform", async (c) => {
  try {
    const ctx = await requirePlatformAdmin(c);
    const platform = c.req.param("platform") as PlatformKey;

    if (!AVAILABLE_PLATFORMS.includes(platform)) {
      return c.json(
        { message: `Platform tidak didukung. Pilihan: ${AVAILABLE_PLATFORMS.join(", ")}` },
        400,
      );
    }

    let results: TestResult[];
    switch (platform) {
      case "tiktok":
        results = await runTikTokSuite();
        break;
      case "youtube":
        results = await runYouTubeSuite();
        break;
      case "google_business":
        results = await runGoogleBusinessSuite();
        break;
      case "pinterest":
        results = await runPinterestSuite();
        break;
      case "linkedin":
        results = await runLinkedInSuite();
        break;
      case "linkedin_org":
        results = await runLinkedInOrganizationSuite();
        break;
      case "bluesky":
        results = await runBlueskySuite();
        break;
      case "threads":
        // Threads — app terpisah (verify token DB kartu Threads / env sendiri)
        results = await runMetaSuite("threads", "threads", GRAPH_THREADS_URL);
        break;
      case "instagram_standalone":
        // Instagram Login — aplikasi terpisah, verify token & secret app sendiri
        results = await runMetaSuite("instagram_standalone", "instagram_standalone", GRAPH_IG_URL);
        break;
      default:
        // Instagram & Facebook — satu aplikasi Meta
        results = await runMetaSuite(
          platform,
          // User token IG business disimpan di platform "instagram"
          "instagram",
        );
    }

    const ranAt = new Date().toISOString();
    lastResults.set(platform, { ranAt, results });

    // Audit: hanya ringkasan status — tidak ada secret/token
    logAdminAction(c, ctx.user.id, {
      action: "api_test.run",
      entityType: "platform",
      entityId: platform,
      metadata: {
        total: results.length,
        pass: results.filter((r) => r.status === "pass").length,
        warn: results.filter((r) => r.status === "warn").length,
        fail: results.filter((r) => r.status === "fail").length,
      },
    });

    return c.json({ platform, ranAt, results });
  } catch (error) {
    return errorResponse(error);
  }
});
