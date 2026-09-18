// API Admin API Test Triggers — panggilan API uji untuk verifikasi Permission &
// Features (App Review): insights, Threads advanced, DM, Page Mentions, demografi Page,
// Human Agent. Dipisah dari admin-api-tests.ts (suite platform) agar file tidak
// terlalu panjang. Di-mount pada prefix yang sama: /admin/api-tests (index.ts).
//
// Prinsip keamanan: hasil test TIDAK PERNAH berisi secret/token.

import { db } from "@sahabatkreator/db";
import { socialAccount } from "@sahabatkreator/db/schema";
import {
  deleteThreadsPost,
  GRAPH_FB_URL,
  GRAPH_IG_URL,
  GRAPH_THREADS_URL,
  getThreadsMentions,
  getThreadsProfilePosts,
  lookupThreadsProfile,
  searchThreadsKeywords,
  searchThreadsLocations,
} from "@sahabatkreator/publishing";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { logAdminAction } from "../lib/audit";
import { requirePlatformAdmin } from "../lib/auth-guard";
import { decrypt } from "../lib/crypto";
import { fetchJson, getStoredUserToken } from "./admin-api-test-shared";

export const apiTestTriggersRoute = new Hono();

// ---------------------------------------------------------------------------
// Trigger API calls for pending verification permissions
// ---------------------------------------------------------------------------

/**
 * POST /admin/api-tests/trigger/instagram-insights
 * Trigger 1 API call to instagram_business_manage_insights
 * Gets media list then fetches insights for first media
 */
apiTestTriggersRoute.post("/trigger/instagram-insights", requirePlatformAdmin, async (c) => {
  try {
    const userToken = await getStoredUserToken("instagram");
    if (!userToken) {
      return c.json({ error: "No Instagram account connected" }, 400);
    }

    // Step 1: Get user's media list
    const mediaRes = await fetchJson<{
      data?: Array<{ id: string }>;
      error?: { message?: string };
    }>(
      `${GRAPH_FB_URL}/me/media?fields=id,caption,comments_count,like_count&limit=1&access_token=${encodeURIComponent(userToken)}`,
    );

    if (!mediaRes.ok || !mediaRes.data?.data?.length) {
      return c.json(
        {
          error: "Failed to get media list",
          details: mediaRes.data?.error?.message ?? "No media found",
        },
        400,
      );
    }

    const mediaId = mediaRes.data.data[0]?.id;

    // Step 2: Get insights for first media (triggers instagram_business_manage_insights)
    const insightsRes = await fetchJson<{
      data?: Array<{ name: string; values: Array<{ value: number }> }>;
      error?: { message?: string };
    }>(
      `${GRAPH_FB_URL}/${mediaId}/insights?metric=impressions,reach,engagement&access_token=${encodeURIComponent(userToken)}`,
    );

    if (!insightsRes.ok) {
      return c.json(
        {
          error: "Failed to get media insights",
          details: insightsRes.data?.error?.message ?? "Unknown error",
          mediaId,
        },
        400,
      );
    }

    return c.json({
      success: true,
      message: "instagram_business_manage_insights API call completed",
      mediaId,
      insights: insightsRes.data?.data,
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

/**
 * POST /admin/api-tests/trigger/instagram-standalone-insights
 * Trigger API calls untuk `instagram_business_manage_insights` (jalur Instagram Login):
 * - media insights: GET graph.instagram.com/{media-id}/insights
 * - account insights: GET graph.instagram.com/{ig-id}/insights?period=day
 *
 * Beda dengan /trigger/instagram-insights yang memakai graph.facebook.com (jalur FB Login).
 */
apiTestTriggersRoute.post(
  "/trigger/instagram-standalone-insights",
  requirePlatformAdmin,
  async (c) => {
    try {
      const accounts = await db
        .select({
          platformAccountId: socialAccount.platformAccountId,
          accessTokenEnc: socialAccount.accessTokenEnc,
          username: socialAccount.username,
        })
        .from(socialAccount)
        .where(eq(socialAccount.platform, "instagram_standalone" as never))
        .limit(5);

      if (accounts.length === 0) {
        return c.json({ error: "No Instagram standalone account connected" }, 400);
      }

      type InsightData = Array<{ name: string; values?: Array<{ value: number }> }>;
      const results: Array<{
        account: string;
        mediaId: string | null;
        mediaInsights: boolean;
        accountInsights: boolean;
        errors: string[];
      }> = [];

      for (const account of accounts) {
        if (!account.accessTokenEnc) continue;
        let token: string;
        try {
          token = decrypt(account.accessTokenEnc);
        } catch {
          continue;
        }

        const errors: string[] = [];

        // 1. Media terbaru → media insights (memicu instagram_business_manage_insights)
        const mediaRes = await fetchJson<{
          data?: Array<{ id: string }>;
          error?: { message?: string };
        }>(`${GRAPH_IG_URL}/me/media?fields=id&limit=1&access_token=${encodeURIComponent(token)}`);
        const mediaId = mediaRes.data?.data?.[0]?.id ?? null;

        let mediaInsights = false;
        if (mediaId) {
          const insightsRes = await fetchJson<{ data?: InsightData; error?: { message?: string } }>(
            `${GRAPH_IG_URL}/${mediaId}/insights?metric=reach,likes,comments,saves,shares,views&access_token=${encodeURIComponent(token)}`,
          );
          mediaInsights = insightsRes.ok;
          if (!insightsRes.ok) {
            errors.push(
              insightsRes.data?.error?.message ?? `media insights HTTP ${insightsRes.status}`,
            );
          }
        } else {
          errors.push(mediaRes.data?.error?.message ?? "No media found");
        }

        // 2. Account insights (reach, profile_views, website_clicks)
        const accountRes = await fetchJson<{ data?: InsightData; error?: { message?: string } }>(
          `${GRAPH_IG_URL}/${account.platformAccountId}/insights?metric=reach,profile_views,website_clicks&period=day&access_token=${encodeURIComponent(token)}`,
        );
        const accountInsights = accountRes.ok;
        if (!accountRes.ok) {
          errors.push(
            accountRes.data?.error?.message ?? `account insights HTTP ${accountRes.status}`,
          );
        }

        results.push({
          account: account.username ?? account.platformAccountId,
          mediaId,
          mediaInsights,
          accountInsights,
          errors: [...new Set(errors)].slice(0, 3),
        });
      }

      if (results.length === 0) {
        return c.json({ error: "No Instagram standalone account with readable token" }, 400);
      }

      await logAdminAction(c, null, {
        action: "instagram_standalone_insights.trigger",
        entityType: "social_account",
        metadata: { results: results.map((r) => ({ account: r.account, ok: r.mediaInsights })) },
      });

      return c.json({
        success: results.some((r) => r.mediaInsights || r.accountInsights),
        message: "Instagram standalone insights test calls completed",
        results,
        nextSteps: [
          "Buka Meta Developer Console → App Review → Permissions and Features",
          "Pastikan 'API calls' untuk instagram_business_manage_insights bertambah > 0",
          "Jika mediaInsights/accountInsights gagal, cek pesan error (metric/scope) di field errors",
        ],
      });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  },
);

/**
 * POST /admin/api-tests/trigger/facebook-insights
 * Trigger a Page Insights call for pages_manage/read_insights verification.
 */
apiTestTriggersRoute.post("/trigger/facebook-insights", requirePlatformAdmin, async (c) => {
  try {
    const accounts = await db
      .select({
        platformAccountId: socialAccount.platformAccountId,
        accessTokenEnc: socialAccount.accessTokenEnc,
        metadata: socialAccount.metadata,
        username: socialAccount.username,
      })
      .from(socialAccount)
      .where(eq(socialAccount.platform, "facebook" as never))
      .limit(5);

    const results: Array<{ account: string; success: boolean; message: string }> = [];
    for (const account of accounts) {
      if (!account.accessTokenEnc) continue;
      try {
        const token = decrypt(account.accessTokenEnc);
        const pageToken =
          typeof account.metadata === "object" &&
          account.metadata !== null &&
          typeof (account.metadata as Record<string, unknown>).pageAccessToken === "string"
            ? ((account.metadata as Record<string, unknown>).pageAccessToken as string)
            : token;
        const res = await fetchJson<{
          data?: Array<{ name: string; values?: Array<{ value: number }> }>;
          error?: { message?: string };
        }>(
          `${GRAPH_FB_URL}/${account.platformAccountId}/insights?metric=page_impressions&period=day&access_token=${encodeURIComponent(pageToken)}`,
        );
        results.push({
          account: account.username ?? account.platformAccountId,
          success: res.ok,
          message: res.ok
            ? "Facebook Page Insights API call completed"
            : (res.data?.error?.message ?? `HTTP ${res.status}`),
        });
      } catch (error) {
        results.push({
          account: account.username ?? account.platformAccountId,
          success: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (results.length === 0) {
      return c.json({ error: "No Facebook Page account connected" }, 400);
    }
    return c.json({ success: results.every((result) => result.success), results });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

/**
 * POST /admin/api-tests/trigger/threads-advanced
 * Trigger API calls untuk 5 izin Threads advanced access (butuh Threads Tester
 * atau App Review): threads_manage_mentions, threads_keyword_search,
 * threads_location_tagging, threads_profile_discovery, dan threads_delete.
 *
 * Body opsional (JSON): { mediaId?, keyword?, locationQuery?, profileQuery?, accountId? }
 * - mediaId: baru menjalankan DELETE (destruktif) pada post tersebut; tanpa ini tidak ada hapus.
 *
 * Response hanya berisi jumlah hasil + pesan error Graph — tidak pernah token.
 */
apiTestTriggersRoute.post("/trigger/threads-advanced", requirePlatformAdmin, async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as {
      mediaId?: string;
      keyword?: string;
      locationQuery?: string;
      profileQuery?: string;
      accountId?: string;
    };

    const accounts = await db
      .select({
        id: socialAccount.id,
        platformAccountId: socialAccount.platformAccountId,
        accessTokenEnc: socialAccount.accessTokenEnc,
        username: socialAccount.username,
      })
      .from(socialAccount)
      .where(eq(socialAccount.platform, "threads" as never))
      .limit(5);

    const targets = body.accountId ? accounts.filter((a) => a.id === body.accountId) : accounts;
    if (targets.length === 0) {
      return c.json({ error: "No Threads account connected" }, 400);
    }

    type OpResult = { op: string; ok: boolean; count?: number; error?: string };
    const results: Array<{ account: string; ops: OpResult[] }> = [];

    for (const account of targets) {
      if (!account.accessTokenEnc) continue;
      let token: string;
      try {
        token = decrypt(account.accessTokenEnc);
      } catch {
        continue;
      }

      const ops: OpResult[] = [];
      const run = async (op: string, fn: () => Promise<number>) => {
        try {
          ops.push({ op, ok: true, count: await fn() });
        } catch (error) {
          ops.push({
            op,
            ok: false,
            error: error instanceof Error ? error.message.slice(0, 200) : String(error),
          });
        }
      };

      await run(
        "mentions",
        async () =>
          (await getThreadsMentions({ accessToken: token, userId: account.platformAccountId }))
            .length,
      );
      await run(
        "keyword_search",
        async () =>
          (await searchThreadsKeywords({ accessToken: token, query: body.keyword ?? "kopi" }))
            .length,
      );
      await run(
        "location_search",
        async () =>
          (
            await searchThreadsLocations({
              accessToken: token,
              query: body.locationQuery ?? "Jakarta",
            })
          ).length,
      );
      await run("profile_discovery", async () => {
        const username = body.profileQuery ?? "threads";
        const profile = await lookupThreadsProfile({ accessToken: token, username });
        if (!profile) return 0;
        return (await getThreadsProfilePosts({ accessToken: token, username })).length;
      });
      if (body.mediaId) {
        const mediaId = body.mediaId;
        await run("delete", async () => {
          await deleteThreadsPost({ accessToken: token, mediaId });
          return 1;
        });
      }

      results.push({ account: account.username ?? account.platformAccountId, ops });
    }

    if (results.length === 0) {
      return c.json({ error: "No Threads account with readable token" }, 400);
    }

    await logAdminAction(c, null, {
      action: "threads_advanced.trigger",
      entityType: "social_account",
      metadata: {
        results: results.map((r) => ({ account: r.account, ok: r.ops.filter((o) => o.ok).length })),
      },
    });

    return c.json({
      success: results.some((r) => r.ops.some((o) => o.ok)),
      message: "Threads advanced permission test calls completed",
      results,
      nextSteps: [
        "Buka Meta Developer Console → App Review → Permissions and Features",
        "Pastikan counter API calls bertambah: threads_manage_mentions, threads_keyword_search, threads_location_tagging, threads_profile_discovery, threads_delete",
        "profile_discovery memakai path profile_search — bila error 404, cek reference 'Threads Profile Discovery' dan sesuaikan PROFILE_SEARCH_PATH di threads-advanced.ts",
        "Kirim mediaId (post Threads milik akun) untuk menguji threads_delete — aksi ini menghapus post",
      ],
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

/**
 * POST /admin/api-tests/trigger/threads-delete
 * Hasilkan 1 panggilan API `threads_delete` tanpa posting manual: buat post
 * text (auto-publish) lalu hapus segera. Body opsional: { accountId?, text? }.
 * HATI-HATI: mempublikasikan post nyata sesaat di akun Threads target.
 */
apiTestTriggersRoute.post("/trigger/threads-delete", requirePlatformAdmin, async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as { accountId?: string; text?: string };

    const accounts = await db
      .select({
        id: socialAccount.id,
        platformAccountId: socialAccount.platformAccountId,
        accessTokenEnc: socialAccount.accessTokenEnc,
        username: socialAccount.username,
      })
      .from(socialAccount)
      .where(eq(socialAccount.platform, "threads" as never))
      .limit(5);

    const account = body.accountId ? accounts.find((a) => a.id === body.accountId) : accounts[0];
    if (!account?.accessTokenEnc) {
      return c.json({ error: "No Threads account connected" }, 400);
    }

    let token: string;
    try {
      token = decrypt(account.accessTokenEnc);
    } catch {
      return c.json({ error: "Token Threads tidak bisa dibaca" }, 400);
    }

    // 1. Publikasikan post text singkat (menghasilkan panggilan content_publish)
    const text = body.text ?? "Uji hapus otomatis Sahabat Kreator — post ini dihapus segera.";
    const createRes = await fetchJson<{ id?: string; error?: { message?: string } }>(
      `${GRAPH_THREADS_URL}/${account.platformAccountId}/threads`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          media_type: "TEXT",
          text,
          auto_publish_text: "true",
          access_token: token,
        }).toString(),
      },
    );

    if (!createRes.ok || !createRes.data?.id) {
      return c.json(
        {
          success: false,
          error: createRes.data?.error?.message ?? `create HTTP ${createRes.status}`,
          account: account.username,
        },
        502,
      );
    }
    const mediaId = createRes.data.id;

    // 2. Hapus post tersebut (menghasilkan panggilan threads_delete).
    // Beri jeda singkat; retry sekali bila belum ter-propagate.
    let deleted = false;
    let lastError: string | null = null;
    for (let attempt = 0; attempt < 2 && !deleted; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 4000));
      try {
        await deleteThreadsPost({ accessToken: token, mediaId });
        deleted = true;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    await logAdminAction(c, null, {
      action: "threads_delete.trigger",
      entityType: "social_account",
      metadata: { account: account.username, mediaId, deleted },
    });

    return c.json({
      success: deleted,
      message: deleted
        ? "Post uji dibuat lalu dihapus — 1 panggilan threads_delete tercatat"
        : "Post dibuat tetapi gagal dihapus — hapus manual bila perlu",
      account: account.username,
      mediaId,
      deleted,
      error: lastError,
      nextSteps: [
        "Buka Meta Developer Console → App Review → Permissions and Features",
        "Pastikan threads_delete menunjukkan 1/1 panggilan API",
      ],
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

/**
 * POST /admin/api-tests/trigger/page-mentions
 * Uji fitur "Page Mentions" (sebut Halaman Facebook lain saat publish).
 * Body: { mentionedPageId, pageId?, text? }
 *
 * Membuat post TERJADWAL (published=false, tayang +1 jam) berisi `@[mentionedPageId]`,
 * lalu menghapusnya lagi — agar tidak meninggalkan konten. Fitur ini tidak punya
 * scope OAuth sendiri (pakai `pages_manage_posts` + `pages_read_engagement`).
 */
apiTestTriggersRoute.post("/trigger/page-mentions", requirePlatformAdmin, async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as {
      pageId?: string;
      mentionedPageId?: string;
      text?: string;
    };
    if (!body.mentionedPageId) {
      return c.json({ error: "mentionedPageId wajib diisi (id Halaman yang disebut)" }, 400);
    }

    const accounts = await db
      .select({
        platformAccountId: socialAccount.platformAccountId,
        accessTokenEnc: socialAccount.accessTokenEnc,
        metadata: socialAccount.metadata,
        username: socialAccount.username,
      })
      .from(socialAccount)
      .where(eq(socialAccount.platform, "facebook" as never))
      .limit(5);

    const page = accounts.find((a) => a.platformAccountId === body.pageId) ?? accounts[0] ?? null;
    if (!page?.accessTokenEnc) {
      return c.json({ error: "No Facebook Page account connected" }, 400);
    }

    const token =
      typeof page.metadata === "object" &&
      page.metadata !== null &&
      typeof (page.metadata as Record<string, unknown>).pageAccessToken === "string"
        ? ((page.metadata as Record<string, unknown>).pageAccessToken as string)
        : decrypt(page.accessTokenEnc);

    const message = `${body.text?.trim() || "Uji Page Mentions dari Sahabat Kreator"} @[${body.mentionedPageId}]`;
    const scheduledAt = Math.floor(Date.now() / 1000) + 3600;

    // 1. Buat post terjadwal dengan mention (belum tayang → tidak ada notifikasi)
    const createRes = await fetchJson<{ id?: string; error?: { message?: string } }>(
      `${GRAPH_FB_URL}/${page.platformAccountId}/feed`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          published: false,
          scheduled_publish_time: scheduledAt,
          access_token: token,
        }),
      },
    );
    if (!createRes.ok || !createRes.data?.id) {
      return c.json(
        {
          success: false,
          error: createRes.data?.error?.message ?? `HTTP ${createRes.status}`,
          pageId: page.platformAccountId,
          mentionedPageId: body.mentionedPageId,
        },
        502,
      );
    }

    const postId = createRes.data.id;

    // 2. Hapus post uji (best-effort — jangan gagalkan hasil bila gagal hapus)
    const deleteRes = await fetchJson<{ success?: boolean }>(
      `${GRAPH_FB_URL}/${postId}?access_token=${encodeURIComponent(token)}`,
      { method: "DELETE" },
    );

    await logAdminAction(c, null, {
      action: "page_mentions.trigger",
      entityType: "social_account",
      metadata: { pageId: page.platformAccountId, mentionedPageId: body.mentionedPageId },
    });

    return c.json({
      success: true,
      message: "Page Mentions test post created and cleaned up",
      pageId: page.platformAccountId,
      mentionedPageId: body.mentionedPageId,
      postId,
      deleted: deleteRes.ok,
      nextSteps: [
        "Buka Meta Developer Console → App Review → Permissions and Features → Page Mentions",
        "Untuk screencast: publish nyata dari Compose dengan Halaman disebut, lalu tunjukkan post berisi mention",
      ],
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

/**
 * POST /admin/api-tests/trigger/page-demographics
 * Trigger API call untuk `pages_user_gender` — Page Insights demografi audiens
 * (`page_fans_gender_age`, period lifetime) untuk tiap Halaman Facebook terhubung.
 */
apiTestTriggersRoute.post("/trigger/page-demographics", requirePlatformAdmin, async (c) => {
  try {
    const accounts = await db
      .select({
        platformAccountId: socialAccount.platformAccountId,
        accessTokenEnc: socialAccount.accessTokenEnc,
        metadata: socialAccount.metadata,
        username: socialAccount.username,
      })
      .from(socialAccount)
      .where(eq(socialAccount.platform, "facebook" as never))
      .limit(5);

    if (accounts.length === 0) {
      return c.json({ error: "No Facebook Page account connected" }, 400);
    }

    type InsightData = Array<{
      name?: string;
      values?: Array<{ value?: Record<string, number> | number }>;
      total_value?: {
        breakdowns?: Array<{ rows?: Array<{ dimension_values?: string[]; value?: number }> }>;
      };
    }>;

    const results: Array<{
      account: string;
      success: boolean;
      rows: number;
      message: string;
    }> = [];

    for (const account of accounts) {
      if (!account.accessTokenEnc) continue;
      let token: string;
      try {
        token = decrypt(account.accessTokenEnc);
      } catch {
        continue;
      }
      const pageToken =
        typeof account.metadata === "object" &&
        account.metadata !== null &&
        typeof (account.metadata as Record<string, unknown>).pageAccessToken === "string"
          ? ((account.metadata as Record<string, unknown>).pageAccessToken as string)
          : token;

      const res = await fetchJson<{ data?: InsightData; error?: { message?: string } }>(
        `${GRAPH_FB_URL}/${account.platformAccountId}/insights?metric=page_fans_gender_age&period=lifetime&access_token=${encodeURIComponent(pageToken)}`,
      );

      let rows = 0;
      const first = res.data?.data?.[0];
      const breakdown = first?.total_value?.breakdowns?.[0]?.rows;
      if (breakdown?.length) {
        rows = breakdown.length;
      } else {
        const legacy = first?.values?.[0]?.value;
        if (legacy && typeof legacy === "object") rows = Object.keys(legacy).length;
      }

      results.push({
        account: account.username ?? account.platformAccountId,
        success: res.ok,
        rows,
        message: res.ok
          ? `page_fans_gender_age OK (${rows} baris)`
          : (res.data?.error?.message ?? `HTTP ${res.status}`),
      });
    }

    if (results.length === 0) {
      return c.json({ error: "No Facebook Page account with readable token" }, 400);
    }

    await logAdminAction(c, null, {
      action: "page_demographics.trigger",
      entityType: "social_account",
      metadata: {
        results: results.map((r) => ({ account: r.account, ok: r.success, rows: r.rows })),
      },
    });

    return c.json({
      success: results.some((r) => r.success),
      message: "Page demographics test calls completed",
      results,
      nextSteps: [
        "Buka Meta Developer Console → App Review → Permissions and Features",
        "Pastikan counter API calls pages_user_gender bertambah > 0",
        "Bila error 'metric not supported', Page Insights demografi mungkin sudah dibatasi Meta untuk Page tsb",
      ],
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

/**
 * POST /admin/api-tests/trigger/human-agent
 * Trigger Human Agent permission by sending a test message with human_agent flag
 */
apiTestTriggersRoute.post("/trigger/human-agent", requirePlatformAdmin, async (c) => {
  try {
    const userToken = await getStoredUserToken("instagram");
    if (!userToken) {
      return c.json({ error: "No Instagram account connected" }, 400);
    }

    // Get user's IG business account ID
    const profileRes = await fetchJson<{
      id?: string;
      error?: { message?: string };
    }>(`${GRAPH_FB_URL}/me?fields=id,email&access_token=${encodeURIComponent(userToken)}`);

    if (!profileRes.ok || !profileRes.data?.id) {
      return c.json(
        {
          error: "Failed to get Instagram account ID",
          details: profileRes.data?.error?.message,
        },
        400,
      );
    }

    const igUserId = profileRes.data.id;

    // Note: Human Agent requires an actual conversation with a user
    // This endpoint verifies the permission is available by checking scopes
    const debugRes = await fetchJson<{
      data?: {
        scopes?: string[];
        is_valid?: boolean;
      };
      error?: { message?: string };
    }>(
      `https://graph.facebook.com/v19.0/debug_token?input_token=${encodeURIComponent(userToken)}&access_token=${encodeURIComponent(userToken)}`,
    );

    const hasHumanAgent = debugRes.data?.data?.scopes?.includes("human_agent") ?? false;

    return c.json({
      success: true,
      message: "Human Agent permission check completed",
      igUserId,
      hasHumanAgentScope: hasHumanAgent,
      scopes: debugRes.data?.data?.scopes,
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

/**
 * POST /admin/api-tests/trigger/dm-permissions
 * Generate test API calls untuk Instagram (instagram_business_manage_messages)
 * dan Facebook (pages_messaging) DM permissions.
 *
 * Instagram butuh 10 test calls, Facebook butuh test calls ke conversations endpoint.
 */
apiTestTriggersRoute.post("/trigger/dm-permissions", requirePlatformAdmin, async (c) => {
  try {
    const GRAPH_FB = GRAPH_FB_URL;
    const results: Array<{
      platform: string;
      account: string;
      calls: number;
      success: number;
      failed: number;
      errors: string[];
    }> = [];

    // --- Instagram DM test calls ---
    const igAccounts = await db
      .select({
        platformAccountId: socialAccount.platformAccountId,
        accessTokenEnc: socialAccount.accessTokenEnc,
        metadata: socialAccount.metadata,
        username: socialAccount.username,
      })
      .from(socialAccount)
      .where(eq(socialAccount.platform, "instagram" as never))
      .limit(5);

    for (const account of igAccounts) {
      if (!account.accessTokenEnc) continue;

      let token: string;
      try {
        token = decrypt(account.accessTokenEnc);
      } catch {
        continue;
      }

      // Instagram via FB Login uses Page token for DM
      const pageToken =
        typeof account.metadata === "object" &&
        account.metadata !== null &&
        typeof (account.metadata as Record<string, unknown>).pageAccessToken === "string"
          ? ((account.metadata as Record<string, unknown>).pageAccessToken as string)
          : token;

      let success = 0;
      let failed = 0;
      const errors: string[] = [];

      for (let i = 0; i < 10; i++) {
        try {
          const res = await fetchJson<{
            data?: Array<{ id: string }>;
            error?: { message?: string };
          }>(
            `${GRAPH_FB}/${account.platformAccountId}/conversations?platform=instagram&fields=id,updated_time&limit=5&access_token=${encodeURIComponent(pageToken)}`,
          );
          if (res.ok) {
            success++;
          } else {
            failed++;
            if (res.data?.error?.message) {
              errors.push(res.data.error.message.slice(0, 100));
            }
          }
        } catch {
          failed++;
        }
      }

      results.push({
        platform: "instagram",
        account: account.username ?? account.platformAccountId,
        calls: 10,
        success,
        failed,
        errors: [...new Set(errors)].slice(0, 3),
      });
    }

    // --- Facebook DM test calls ---
    const fbAccounts = await db
      .select({
        platformAccountId: socialAccount.platformAccountId,
        accessTokenEnc: socialAccount.accessTokenEnc,
        metadata: socialAccount.metadata,
        username: socialAccount.username,
      })
      .from(socialAccount)
      .where(eq(socialAccount.platform, "facebook" as never))
      .limit(5);

    for (const account of fbAccounts) {
      if (!account.accessTokenEnc) continue;

      let token: string;
      try {
        token = decrypt(account.accessTokenEnc);
      } catch {
        continue;
      }

      // Facebook uses Page token for DM
      const pageToken =
        typeof account.metadata === "object" &&
        account.metadata !== null &&
        typeof (account.metadata as Record<string, unknown>).pageAccessToken === "string"
          ? ((account.metadata as Record<string, unknown>).pageAccessToken as string)
          : token;

      let success = 0;
      let failed = 0;
      const errors: string[] = [];

      for (let i = 0; i < 10; i++) {
        try {
          const res = await fetchJson<{
            data?: Array<{ id: string }>;
            error?: { message?: string };
          }>(
            `${GRAPH_FB}/${account.platformAccountId}/conversations?fields=id,updated_time&limit=5&access_token=${encodeURIComponent(pageToken)}`,
          );
          if (res.ok) {
            success++;
          } else {
            failed++;
            if (res.data?.error?.message) {
              errors.push(res.data.error.message.slice(0, 100));
            }
          }
        } catch {
          failed++;
        }
      }

      results.push({
        platform: "facebook",
        account: account.username ?? account.platformAccountId,
        calls: 10,
        success,
        failed,
        errors: [...new Set(errors)].slice(0, 3),
      });
    }

    await logAdminAction(c, null, {
      action: "dm_permissions.trigger",
      entityType: "social_account",
      metadata: {
        results: results.map((r) => ({
          platform: r.platform,
          success: r.success,
          failed: r.failed,
        })),
      },
    });

    return c.json({
      success: true,
      message: "DM permission test calls completed",
      results,
      nextSteps: [
        "Buka Meta Developer Console → App Review → Permissions and Features",
        "Cek 'panggilan API uji' sudah bertambah untuk instagram_business_manage_messages dan pages_messaging",
        "Jika semua test calls berhasil (success=10), submit untuk review",
      ],
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
