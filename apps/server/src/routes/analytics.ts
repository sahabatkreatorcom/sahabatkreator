// API Analytics — ringkasan metrik akun & post untuk dashboard
//
// Data diisi oleh packages/publishing analytics-sync (snapshot harian kumulatif
// lifetime per platform). Karena snapshot kumulatif, agregasi overview & top-posts
// memakai snapshot TERBARU per post (distinct on), bukan sum lintas hari (overcount).

import { db } from "@sahabatkreator/db";
import { postAnalytics, socialAccount } from "@sahabatkreator/db/schema";
import {
  computeOptimalTimes,
  GRAPH_FB_URL,
  GRAPH_IG_URL,
  httpRequest,
  nextOccurrence,
  slotLabel,
} from "@sahabatkreator/publishing";
import { and, eq, gte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { errorResponse, HTTPError, requireOrg } from "../lib/auth-guard";
import { decrypt } from "../lib/crypto";

export const analyticsRoute = new Hono();

// Endpoint Graph API — single source of truth di packages/publishing/src/config.ts
const GRAPH_FB = GRAPH_FB_URL;
const GRAPH_IG = GRAPH_IG_URL;

/** Page token IG jalur FB Login tersimpan di metadata (pola sama dengan analytics-sync) */
function pageTokenOf(metadata: Record<string, unknown> | null): string | null {
  return typeof metadata?.pageAccessToken === "string" ? metadata.pageAccessToken : null;
}

/** Metrik agregasi post yang dipakai overview (kolom post_analytics) */
type PostTotals = {
  likes: number;
  comments: number;
  shares: number;
  views: number;
  impressions: number;
};

/**
 * Agregasi snapshot terbaru per post dalam rentang [from, to] (tanggal publikasi).
 * Snapshot kumulatif → distinct on (post_id) ambil yang terbaru, lalu sum.
 */
async function sumPostTotals(orgId: string, from: Date, to: Date): Promise<PostTotals> {
  const res = await db.execute(
    sql`select
          coalesce(sum(pa.likes), 0)::int as likes,
          coalesce(sum(pa.comments), 0)::int as comments,
          coalesce(sum(pa.shares), 0)::int as shares,
          coalesce(sum(pa.views), 0)::bigint as views,
          coalesce(sum(pa.impressions), 0)::bigint as impressions
        from (
          select distinct on (pa.post_id) pa.*
          from post_analytics pa
          join post p on p.id = pa.post_id
          where pa.organization_id = ${orgId}
            and p.published_at >= ${from.toISOString()}
            and p.published_at <= ${to.toISOString()}
          order by pa.post_id, pa.date desc
        ) pa`,
  );
  const row = (res.rows[0] ?? {}) as {
    likes?: string | number;
    comments?: string | number;
    shares?: string | number;
    views?: string | number;
    impressions?: string | number;
  };
  return {
    likes: Number(row.likes ?? 0),
    comments: Number(row.comments ?? 0),
    shares: Number(row.shares ?? 0),
    views: Number(row.views ?? 0),
    impressions: Number(row.impressions ?? 0),
  };
}

/** Total followers org pada snapshot terakhir per akun dengan date <= batas */
async function followersAt(orgId: string, onOrBefore: Date): Promise<number> {
  const res = await db.execute(
    sql`select coalesce(sum(latest.followers), 0)::int as followers
        from (
          select distinct on (aa.social_account_id) aa.*
          from account_analytics aa
          where aa.organization_id = ${orgId}
            and aa.date <= ${onOrBefore.toISOString().slice(0, 10)}
          order by aa.social_account_id, aa.date desc
        ) latest`,
  );
  const row = (res.rows[0] ?? {}) as { followers?: string | number };
  return Number(row.followers ?? 0);
}

/** Persentase perubahan vs periode sebelumnya (null bila baseline 0) */
function percentDelta(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

/** List akun org + snapshot followers terbaru per akun.
 * Satu query raw dengan DISTINCT ON (pola followersAt / route share report) —
 * menghindari N+1 query followers per akun. */
async function accountsWithFollowers(orgId: string) {
  const rows = await db.execute(
    sql`select sa.id,
               sa.platform,
               sa.username,
               sa.display_name,
               sa.avatar_url,
               latest.followers
          from social_account sa
          left join lateral (
            select aa.followers
            from account_analytics aa
            where aa.social_account_id = sa.id
            order by aa.date desc
            limit 1
          ) latest on true
          where sa.organization_id = ${orgId}
          order by sa.created_at`,
  );
  return (rows.rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    platform: String(r.platform),
    username: String(r.username),
    displayName: (r.display_name as string | null) ?? null,
    avatarUrl: (r.avatar_url as string | null) ?? null,
    followers: r.followers === null || r.followers === undefined ? null : Number(r.followers),
  }));
}

/**
 * GET /analytics/overview?days=30 | ?from=&to= — ringkasan cross-platform.
 * Dengan from/to (YYYY-MM-DD): rentang current = from..to, previous = panjang
 * sama sebelum from; response menambah `comparison` (nilai previous + delta %).
 */
analyticsRoute.get("/overview", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const fromStr = c.req.query("from");
    const toStr = c.req.query("to");

    // ===== Mode rentang kustom: from..to + comparison vs periode sebelumnya =====
    if (fromStr || toStr) {
      const from = new Date(`${fromStr}T00:00:00.000Z`);
      const to = new Date(`${toStr}T23:59:59.999Z`);

      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        throw new HTTPError(400, "Parameter from/to harus format YYYY-MM-DD");
      }
      if (from > to) {
        throw new HTTPError(400, "Parameter from harus lebih kecil atau sama dengan to");
      }

      // Panjang periode (inklusif) — periode previous punya panjang sama sebelum from
      const spanMs = to.getTime() - from.getTime() + 1;
      const prevTo = new Date(from.getTime() - 1);
      const prevFrom = new Date(prevTo.getTime() - spanMs + 1);

      const [current, previous] = await Promise.all([
        sumPostTotals(ctx.organization.id, from, to),
        sumPostTotals(ctx.organization.id, prevFrom, prevTo),
      ]);

      // Followers: snapshot terakhir di dalam/tepat sebelum akhir periode
      const [currentFollowers, previousFollowers] = await Promise.all([
        followersAt(ctx.organization.id, to),
        followersAt(ctx.organization.id, prevTo),
      ]);

      return c.json({
        range: {
          from: from.toISOString().slice(0, 10),
          to: to.toISOString().slice(0, 10),
        },
        totals: { followers: currentFollowers, ...current },
        accounts: await accountsWithFollowers(ctx.organization.id),
        comparison: {
          previous: { followers: previousFollowers, ...previous },
          deltas: {
            followers: percentDelta(currentFollowers, previousFollowers),
            likes: percentDelta(current.likes, previous.likes),
            comments: percentDelta(current.comments, previous.comments),
            shares: percentDelta(current.shares, previous.shares),
            views: percentDelta(current.views, previous.views),
            impressions: percentDelta(current.impressions, previous.impressions),
          },
        },
      });
    }

    // ===== Mode default (kompatibel dulu): ?days=N =====
    const days = Number(c.req.query("days") ?? 30);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const totals = await sumPostTotals(
      ctx.organization.id,
      since,
      new Date(), // sampai sekarang
    );

    const followersByAccount = await accountsWithFollowers(ctx.organization.id);
    const totalFollowers = followersByAccount.reduce((sum, a) => sum + (a.followers ?? 0), 0);

    return c.json({
      range: { days, since: since.toISOString() },
      totals: { followers: totalFollowers, ...totals },
      accounts: followersByAccount,
    });
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /analytics/timeseries?days=30 — snapshot kumulatif per hari (chart pertumbuhan).
 * Filter `days` dibatasi 1-365 (default 30) agar tidak memindai seluruh history. */
analyticsRoute.get("/timeseries", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const days = Math.min(Math.max(Number(c.req.query("days") ?? 30) || 30, 1), 365);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffDate = cutoff.toISOString().slice(0, 10);

    const rows = await db
      .select({
        date: postAnalytics.date,
        likes: sql<number>`coalesce(sum(${postAnalytics.likes}), 0)::int`,
        comments: sql<number>`coalesce(sum(${postAnalytics.comments}), 0)::int`,
        shares: sql<number>`coalesce(sum(${postAnalytics.shares}), 0)::int`,
        views: sql<number>`coalesce(sum(${postAnalytics.views}), 0)::bigint`,
        impressions: sql<number>`coalesce(sum(${postAnalytics.impressions}), 0)::bigint`,
      })
      .from(postAnalytics)
      .where(
        and(
          eq(postAnalytics.organizationId, ctx.organization.id),
          gte(postAnalytics.date, cutoffDate),
        ),
      )
      .groupBy(postAnalytics.date)
      .orderBy(postAnalytics.date);

    return c.json({
      days,
      series: rows.map((r) => ({
        ...r,
        views: Number(r.views),
        impressions: Number(r.impressions),
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /analytics/top-posts?limit=10 — post berperforma terbaik (snapshot terbaru) */
analyticsRoute.get("/top-posts", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const limit = Math.min(Number(c.req.query("limit") ?? 10), 50);

    const rows = await db.execute(
      sql`select p.id as post_id,
             p.platform,
             p.content,
             p.platform_post_url,
             p.published_at,
             sa.username,
             latest.likes,
             latest.comments,
             latest.shares,
             latest.views
          from post p
          join social_account sa on sa.id = p.social_account_id
          join lateral (
            select * from post_analytics pa
            where pa.post_id = p.id
            order by pa.date desc
            limit 1
          ) latest on true
          where p.organization_id = ${ctx.organization.id}
            and p.status = 'published'
          order by latest.views desc, latest.likes desc
          limit ${limit}`,
    );

    return c.json({
      posts: (rows.rows as Record<string, unknown>[]).map((r) => ({
        postId: r.post_id,
        platform: r.platform,
        content: r.content,
        platformPostUrl: r.platform_post_url,
        publishedAt: r.published_at,
        username: r.username,
        likes: Number(r.likes ?? 0),
        comments: Number(r.comments ?? 0),
        shares: Number(r.shares ?? 0),
        views: Number(r.views ?? 0),
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /analytics/optimal-times?platform=&limit=6 — slot waktu terbaik berdasarkan data historis */
analyticsRoute.get("/optimal-times", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const platform = c.req.query("platform") || undefined;
    const limit = Math.min(Number(c.req.query("limit") ?? 6), 24);

    const slots = await computeOptimalTimes(ctx.organization.id, platform);
    const top = slots.slice(0, limit);
    return c.json({
      slots: top.map((s) => ({
        platform: s.platform,
        dayOfWeek: s.dayOfWeek,
        hour: s.hour,
        label: slotLabel(s),
        score: s.score,
        avgEngagement: s.avgEngagement,
        sampleCount: s.sampleCount,
        confidence: s.confidence,
        heuristic: s.heuristic,
        nextDate: nextOccurrence(s).toISOString(),
      })),
      /** true bila org belum punya data historis untuk platform ini (semua slot heuristik) */
      allHeuristic: top.length > 0 && top.every((s) => s.heuristic),
    });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------------------------------------------------------------------------
// Demografi audiens (M7) — IG Graph API audience_gender_age
// ---------------------------------------------------------------------------

/** Baris breakdown demografi dari Graph API: { key: "F.18-24", value: 123 } */
type GenderAgeRow = { key: string; value: number };

type IgInsightsResponse = {
  data?: Array<{
    name?: string;
    total_value?: {
      breakdowns?: Array<{
        dimension_keys?: string[];
        rows?: Array<{
          dimension_values?: string[];
          value?: number;
        }>;
      }>;
    };
    values?: Array<{ value?: { [key: string]: number } | number }>;
  }>;
};

/**
 * Parse response insights audience_gender_age → daftar { key: "F.18-24", value }.
 * Format modern: data[0].total_value.breakdowns[0].rows dengan dimension_values
 * ["F", "18-24"] digabung jadi key "F.18-24". Format legacy pakai values map.
 */
function parseGenderAge(data: IgInsightsResponse): GenderAgeRow[] {
  const breakdown = data.data?.[0]?.total_value?.breakdowns?.[0];
  if (breakdown?.rows) {
    const rows = breakdown.rows
      .map((r) => {
        const dims = r.dimension_values ?? [];
        return {
          key: dims.join("."),
          value: Number(r.value ?? 0),
        };
      })
      .filter((r) => r.key.includes("."));
    if (rows.length > 0) return rows;
  }
  // Legacy format: values[0].value = { "F.18-24": 123, ... }
  const legacy = data.data?.[0]?.values?.[0]?.value;
  if (legacy && typeof legacy === "object") {
    return Object.entries(legacy).map(([key, value]) => ({
      key,
      value: Number(value ?? 0),
    }));
  }
  return [];
}

// Cache in-memory response demografi per (orgId, accountId) — TTL 1 jam.
// Data insights audience_gender_age bersifat lifetime & lambat berubah, jadi
// tidak perlu hit Graph API setiap request. Hanya response sukses yang di-cache.
const DEMOGRAPHICS_CACHE_MS = 60 * 60_000;
const demographicsCache = new Map<
  string,
  {
    at: number;
    username: string | null;
    payload: { genderAge: GenderAgeRow[]; byGender: { gender: "F" | "M"; value: number }[] };
  }
>();

/** Bersihkan entri kedaluwarsa agar cache tidak tumbuh tanpa batas */
function pruneDemographicsCache(): void {
  const now = Date.now();
  for (const [key, entry] of demographicsCache) {
    if (now - entry.at >= DEMOGRAPHICS_CACHE_MS) demographicsCache.delete(key);
  }
}

/** GET /analytics/demographics?accountId= — demografi audiens (gender × usia) */
analyticsRoute.get("/demographics", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const accountId = c.req.query("accountId");
    if (!accountId) {
      throw new HTTPError(400, "Parameter accountId wajib diisi");
    }

    // Cache hit (belum lewat TTL) → langsung kembalikan tanpa hit Graph API
    const cacheKey = `${ctx.organization.id}:${accountId}`;
    const cached = demographicsCache.get(cacheKey);
    if (cached && Date.now() - cached.at < DEMOGRAPHICS_CACHE_MS) {
      return c.json({
        ...cached.payload,
        source: "instagram",
        username: cached.username,
        cached: true,
      });
    }
    pruneDemographicsCache();

    // Akun milik org (org-scoped)
    const [account] = await db
      .select({
        id: socialAccount.id,
        platform: socialAccount.platform,
        platformAccountId: socialAccount.platformAccountId,
        username: socialAccount.username,
        accessTokenEnc: socialAccount.accessTokenEnc,
        metadata: socialAccount.metadata,
        isConnected: socialAccount.isConnected,
      })
      .from(socialAccount)
      .where(
        and(eq(socialAccount.id, accountId), eq(socialAccount.organizationId, ctx.organization.id)),
      )
      .limit(1);
    if (!account) throw new HTTPError(404, "Akun tidak ditemukan");

    // Hanya Instagram (kedua jalur) yang didukung — platform lain belum
    if (account.platform !== "instagram" && account.platform !== "instagram_standalone") {
      return c.json({ message: "Demografi audiens belum didukung untuk platform ini" }, 501);
    }

    if (!account.isConnected || !account.accessTokenEnc) {
      throw new HTTPError(400, "Akun belum terhubung — hubungkan ulang akun Instagram");
    }

    // Decrypt token (gagal → minta hubungkan ulang, bukan 500)
    let accessToken: string;
    try {
      accessToken = decrypt(account.accessTokenEnc);
    } catch {
      throw new HTTPError(400, "Token akun tidak bisa dibaca — hubungkan ulang akun");
    }

    // IG jalur FB Login pakai page token; standalone pakai user token langsung
    const base = account.platform === "instagram" ? GRAPH_FB : GRAPH_IG;
    const token = pageTokenOf(account.metadata) ?? accessToken;

    const res = await httpRequest<IgInsightsResponse>(
      `${base}/${account.platformAccountId}/insights`,
      {
        query: {
          metric: "audience_gender_age",
          period: "lifetime",
          access_token: token,
        },
        retries: 1,
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(
        `[analytics] demographics upstream error (${res.status}) for ${account.username}: ${text.slice(0, 300)}`,
      );
      throw new HTTPError(
        502,
        `Gagal mengambil data demografi dari Instagram: ${text.slice(0, 150)}`,
      );
    }

    const genderAge = parseGenderAge(await res.json());

    // Agregasi per gender (F/M) — abaikan kunci lain (mis. U unknown)
    const byGender: { gender: "F" | "M"; value: number }[] = [];
    const fTotal = genderAge
      .filter((r) => r.key.startsWith("F."))
      .reduce((sum, r) => sum + r.value, 0);
    const mTotal = genderAge
      .filter((r) => r.key.startsWith("M."))
      .reduce((sum, r) => sum + r.value, 0);
    if (fTotal > 0) byGender.push({ gender: "F", value: fTotal });
    if (mTotal > 0) byGender.push({ gender: "M", value: mTotal });

    const genderAgeSorted = genderAge.sort((a, b) => b.value - a.value);
    const payload = { genderAge: genderAgeSorted, byGender };

    // Simpan ke cache hanya untuk response sukses (di atas sudah lolos semua
    // validasi + Graph API ok)
    demographicsCache.set(cacheKey, {
      at: Date.now(),
      username: account.username,
      payload,
    });

    return c.json({
      ...payload,
      source: "instagram",
      username: account.username,
    });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------------------------------------------------------------------------
// Performa hashtag (M8) — agregasi dari post + postAnalytics lokal
// ---------------------------------------------------------------------------

/**
 * GET /analytics/hashtags?days=30 — top hashtag berdasarkan total engagement.
 * Hashtag di-parse dari caption post (regex dukung karakter Indonesia
 * seperti é, ñ, dll) + kolom hashtags. Engagement = likes+comments+shares
 * dari snapshot metrik TERBARU per post (snapshot kumulatif, bukan sum).
 * Lookback dikunci maksimal 90 hari agar tidak meng-aggregate seluruh history.
 */
analyticsRoute.get("/hashtags", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const days = Math.min(Math.max(Number(c.req.query("days") ?? 30) || 30, 1), 90);
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Post published + snapshot metrik terbaru per post (bukan sum lintas hari)
    const rows = await db.execute(
      sql`select p.content,
             p.hashtags,
             latest.likes,
             latest.comments,
             latest.shares
          from post p
          join lateral (
            select * from post_analytics pa
            where pa.post_id = p.id
            order by pa.date desc
            limit 1
          ) latest on true
          where p.organization_id = ${ctx.organization.id}
            and p.status = 'published'
            and p.published_at >= ${since.toISOString()}`,
    );

    // Regex hashtag: dukung karakter unicode Latin termasuk karakter Indonesia
    const HASHTAG_RE = /#[\w\u00C0-\u024F]+/g;

    type Agg = { posts: number; engagement: number };
    const agg = new Map<string, Agg>();

    for (const r of rows.rows as Record<string, unknown>[]) {
      const content = typeof r.content === "string" ? r.content : "";
      const stored = Array.isArray(r.hashtags) ? (r.hashtags as unknown[]) : [];
      const engagement = Number(r.likes ?? 0) + Number(r.comments ?? 0) + Number(r.shares ?? 0);

      // Hashtag dari caption + kolom hashtags (normalisasi lowercase, tanpa duplikat per post)
      const inCaption = content.match(HASHTAG_RE) ?? [];
      const inColumn = stored
        .filter((t): t is string => typeof t === "string")
        .map((t) => (t.startsWith("#") ? t : `#${t}`));
      const tags = new Set([...inCaption, ...inColumn].map((t) => t.toLowerCase()));

      for (const tag of tags) {
        const current = agg.get(tag) ?? { posts: 0, engagement: 0 };
        current.posts += 1;
        current.engagement += engagement;
        agg.set(tag, current);
      }
    }

    // Top 20 berdasarkan total engagement
    const hashtags = [...agg.entries()]
      .map(([hashtag, v]) => ({
        hashtag,
        posts: v.posts,
        totalEngagement: v.engagement,
        avgEngagement: Math.round(v.engagement / v.posts),
      }))
      .sort((a, b) => b.totalEngagement - a.totalEngagement)
      .slice(0, 20);

    return c.json({ days, hashtags });
  } catch (error) {
    return errorResponse(error);
  }
});
