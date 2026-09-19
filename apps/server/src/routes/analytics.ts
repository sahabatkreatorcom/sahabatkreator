// API Analytics — ringkasan metrik akun & post untuk dashboard
//
// Data diisi oleh packages/publishing analytics-sync (snapshot harian kumulatif
// lifetime per platform). Karena snapshot kumulatif, agregasi overview & top-posts
// memakai snapshot TERBARU per post (distinct on), bukan sum lintas hari (overcount).

import { db } from "@sahabatkreator/db";
import { postAnalytics, socialAccount, accountAnalytics } from "@sahabatkreator/db/schema";
import {
  computeOptimalTimes,
  GRAPH_FB_URL,
  GRAPH_IG_URL,
  httpRequest,
  nextOccurrence,
  PINTEREST_API_BASE_URL,
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

/**
 * Page Insights Facebook level-akun (views Halaman + engagement) dalam rentang
 * [from, to] (tanggal snapshot). Berbeda dengan post totals: FB New Pages
 * Experience tidak menyediakan insights level post, jadi views/impressions
 * Halaman diambil dari snapshot harian account_analytics (metric
 * `page_views_total`/`page_post_engagements` — satu-satunya yang diterima NPE).
 * Snapshot kumulatif-harian → sum langsung per tanggal dalam rentang.
 */
async function sumFacebookPageInsights(
  orgId: string,
  from: Date,
  to: Date,
): Promise<{ views: number; impressions: number; engagements: number }> {
  const res = await db.execute(
    sql`select coalesce(sum(aa.impressions), 0)::bigint as views,
               coalesce(sum(aa.impressions), 0)::bigint as impressions,
               coalesce(sum(aa.engagement_count), 0)::bigint as engagements
        from account_analytics aa
        join social_account sa on sa.id = aa.social_account_id
        where aa.organization_id = ${orgId}
          and sa.platform = 'facebook'
          and aa.date >= ${from.toISOString().slice(0, 10)}
          and aa.date <= ${to.toISOString().slice(0, 10)}`,
  );
  const row = (res.rows[0] ?? {}) as {
    views?: string | number;
    impressions?: string | number;
    engagements?: string | number;
  };
  return {
    views: Number(row.views ?? 0),
    impressions: Number(row.impressions ?? 0),
    engagements: Number(row.engagements ?? 0),
  };
}

/** Total followers org pada snapshot terakhir per akun dengan date <= batas */
async function followersAt(orgId: string, onOrBefore: Date): Promise<number> {  const res = await db.execute(
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

      const [current, previous, fbNow, fbPrev] = await Promise.all([
        sumPostTotals(ctx.organization.id, from, to),
        sumPostTotals(ctx.organization.id, prevFrom, prevTo),
        // Page Insights Facebook (NPE): views/impressions hanya ada level akun
        sumFacebookPageInsights(ctx.organization.id, from, to),
        sumFacebookPageInsights(ctx.organization.id, prevFrom, prevTo),
      ]);

      const currentTotals = {
        ...current,
        views: current.views + fbNow.views,
        impressions: current.impressions + fbNow.impressions,
      };
      const previousTotals = {
        ...previous,
        views: previous.views + fbPrev.views,
        impressions: previous.impressions + fbPrev.impressions,
      };

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
        totals: { followers: currentFollowers, ...currentTotals },
        accounts: await accountsWithFollowers(ctx.organization.id),
        comparison: {
          previous: { followers: previousFollowers, ...previousTotals },
          deltas: {
            followers: percentDelta(currentFollowers, previousFollowers),
            likes: percentDelta(currentTotals.likes, previousTotals.likes),
            comments: percentDelta(currentTotals.comments, previousTotals.comments),
            shares: percentDelta(currentTotals.shares, previousTotals.shares),
            views: percentDelta(currentTotals.views, previousTotals.views),
            impressions: percentDelta(currentTotals.impressions, previousTotals.impressions),
          },
        },
      });
    }

    // ===== Mode default (kompatibel dulu): ?days=N =====
    const days = Number(c.req.query("days") ?? 30);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [totals, fbInsights] = await Promise.all([
      sumPostTotals(
        ctx.organization.id,
        since,
        new Date(), // sampai sekarang
      ),
      // Page Insights Facebook (NPE): views/impressions hanya ada level akun
      sumFacebookPageInsights(ctx.organization.id, since, new Date()),
    ]);

    const mergedTotals = {
      ...totals,
      views: totals.views + fbInsights.views,
      impressions: totals.impressions + fbInsights.impressions,
    };

    const followersByAccount = await accountsWithFollowers(ctx.organization.id);
    const totalFollowers = followersByAccount.reduce((sum, a) => sum + (a.followers ?? 0), 0);

    return c.json({
      range: { days, since: since.toISOString() },
      totals: { followers: totalFollowers, ...mergedTotals },
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

    const [rows, fbRows] = await Promise.all([
      db
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
        .orderBy(postAnalytics.date),
      // Page Insights Facebook (NPE): views Halaman per hari dari account_analytics
      db
        .select({
          date: accountAnalytics.date,
          views: sql<number>`coalesce(sum(${accountAnalytics.impressions}), 0)::bigint`,
          impressions: sql<number>`coalesce(sum(${accountAnalytics.impressions}), 0)::bigint`,
        })
        .from(accountAnalytics)
        .innerJoin(socialAccount, eq(socialAccount.id, accountAnalytics.socialAccountId))
        .where(
          and(
            eq(accountAnalytics.organizationId, ctx.organization.id),
            eq(socialAccount.platform, "facebook" as never),
            gte(accountAnalytics.date, cutoffDate),
          ),
        )
        .groupBy(accountAnalytics.date),
    ]);

    // Gabungkan Page Insights Facebook ke series berdasarkan tanggal
    const fbByDate = new Map(fbRows.map((r) => [r.date, r]));

    return c.json({
      days,
      series: rows.map((r) => {
        const fb = fbByDate.get(r.date);
        return {
          ...r,
          views: Number(r.views) + Number(fb?.views ?? 0),
          impressions: Number(r.impressions) + Number(fb?.impressions ?? 0),
        };
      }),
    });
  } catch (error) {
    return errorResponse(error);
  }
});

/**
 * GET /analytics/top-posts?limit=10&platform= — post berperforma terbaik
 * (snapshot terbaru per post). Filter platform opsional (mis. ?platform=instagram).
 * Mengembalikan semua metric yang tersimpan: likes, comments, shares, saves,
 * views, impressions, reach + engagement rate turunan.
 */
analyticsRoute.get("/top-posts", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const limit = Math.min(Number(c.req.query("limit") ?? 10), 50);
    const platform = c.req.query("platform");
    const platformFilter = platform
      ? sql` and p.platform = ${platform}`
      : sql``;

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
             latest.saves,
             latest.views,
             latest.impressions,
             latest.reach
          from post p
          join social_account sa on sa.id = p.social_account_id
          join lateral (
            select * from post_analytics pa
            where pa.post_id = p.id
            order by pa.date desc
            limit 1
          ) latest on true
          where p.organization_id = ${ctx.organization.id}
            and p.status = 'published'${platformFilter}
          order by latest.views desc nulls last, latest.likes desc nulls last
          limit ${limit}`,
    );

    return c.json({
      posts: (rows.rows as Record<string, unknown>[]).map((r) => {
        const likes = Number(r.likes ?? 0);
        const comments = Number(r.comments ?? 0);
        const shares = Number(r.shares ?? 0);
        const saves = Number(r.saves ?? 0);
        const views = Number(r.views ?? 0);
        const impressions = Number(r.impressions ?? 0);
        const reach = Number(r.reach ?? 0);
        // Engagement rate = interaksi / impressions (atau reach bila impressions 0).
        // Untuk platform tanpa impressions (mis. FB NPE), fallback ke views.
        const denom = impressions || reach || views;
        const engagement = likes + comments + shares + saves;
        return {
          postId: r.post_id,
          platform: r.platform,
          content: r.content,
          platformPostUrl: r.platform_post_url,
          publishedAt: r.published_at,
          username: r.username,
          likes,
          comments,
          shares,
          saves,
          views,
          impressions,
          reach,
          engagement,
          engagementRate: denom > 0 ? Number(((engagement / denom) * 100).toFixed(2)) : null,
        };
      }),
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
// Demografi audiens (M7) — IG `audience_gender_age` + FB Page `page_fans_gender_age`
// (FB butuh scope pages_user_gender)
// ---------------------------------------------------------------------------

/** Baris breakdown demografi dari Graph API: { key: "18-24", value: 123 } */
type GenderAgeRow = { key: string; value: number };

type IgBreakdown = {
  dimension_keys?: string[];
  /** API lama memakai `rows`; `follower_demographics` memakai `results` */
  rows?: Array<{ dimension_values?: string[]; value?: number }>;
  results?: Array<{ dimension_values?: string[]; value?: number }>;
};

type IgInsightsResponse = {
  data?: Array<{
    name?: string;
    total_value?: { breakdowns?: IgBreakdown[] };
    values?: Array<{ value?: { [key: string]: number } | number }>;
  }>;
};

/** Ambil baris breakdown (dukung `results` baru & `rows` lama) → { key, value } */
function parseBreakdown(breakdown: IgBreakdown | undefined): GenderAgeRow[] {
  const rows = breakdown?.results ?? breakdown?.rows ?? [];
  return rows.map((r) => ({
    key: (r.dimension_values ?? []).join("."),
    value: Number(r.value ?? 0),
  }));
}

/**
 * Demografi pengikut IG — pengganti `audience_gender_age` yang sudah dihapus Meta.
 * `metric=follower_demographics&breakdown=gender|age&metric_type=total_value`.
 * Satu breakdown per request (gender & usia tidak bisa di-cross-tab lagi).
 */
async function fetchFollowerDemographics(
  base: string,
  igUserId: string,
  token: string,
  breakdown: "gender" | "age",
): Promise<{ rows: GenderAgeRow[]; error?: { status: number; text: string } }> {
  const res = await httpRequest<IgInsightsResponse>(`${base}/${igUserId}/insights`, {
    query: {
      metric: "follower_demographics",
      period: "lifetime",
      breakdown,
      metric_type: "total_value",
      access_token: token,
    },
    retries: 1,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { rows: [], error: { status: res.status, text } };
  }
  const data = await res.json();
  return { rows: parseBreakdown(data.data?.[0]?.total_value?.breakdowns?.[0]) };
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
    source: string;
    payload: {
      genderAge: GenderAgeRow[];
      byGender: { gender: "F" | "M"; value: number }[];
      byAge: GenderAgeRow[];
    };
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
        source: cached.source,
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

    // Instagram (kedua jalur) didukung. Facebook: Meta sudah menghapus metrik
    // demografi Page (`page_fans_gender_age` → "not a valid insights metric").
    const isInstagram =
      account.platform === "instagram" || account.platform === "instagram_standalone";
    const isFacebook = account.platform === "facebook";
    if (!isInstagram && !isFacebook) {
      return c.json({ message: "Demografi audiens belum didukung untuk platform ini" }, 501);
    }

    if (!account.isConnected || !account.accessTokenEnc) {
      throw new HTTPError(400, "Akun belum terhubung — hubungkan ulang akun");
    }

    // Decrypt token (gagal → minta hubungkan ulang, bukan 500)
    let accessToken: string;
    try {
      accessToken = decrypt(account.accessTokenEnc);
    } catch {
      throw new HTTPError(400, "Token akun tidak bisa dibaca — hubungkan ulang akun");
    }

    // Facebook: metrik demografi gender/usia tidak lagi tersedia di Graph API.
    if (isFacebook) {
      return c.json({
        genderAge: [],
        byGender: [],
        byAge: [],
        source: account.platform,
        username: account.username,
        notice:
          "Meta tidak lagi menyediakan metrik demografi gender/usia untuk Halaman Facebook (page_fans_gender_age sudah tidak valid).",
      });
    }

    // Instagram — pakai `follower_demographics` (pengganti audience_gender_age).
    // IG Standalone: user token di graph.instagram.com; IG (FB Login): page token di
    // graph.facebook.com. Breakdown gender & age dipanggil terpisah.
    const base = account.platform === "instagram_standalone" ? GRAPH_IG : GRAPH_FB;
    const token = pageTokenOf(account.metadata) ?? accessToken;

    const [genderRes, ageRes] = await Promise.all([
      fetchFollowerDemographics(base, account.platformAccountId, token, "gender"),
      fetchFollowerDemographics(base, account.platformAccountId, token, "age"),
    ]);

    const errors = [genderRes.error, ageRes.error].filter(
      (e): e is { status: number; text: string } => Boolean(e),
    );
    const firstError = errors[0];
    if (genderRes.rows.length === 0 && ageRes.rows.length === 0 && firstError) {
      console.warn(
        `[analytics] demographics upstream error (${firstError.status}) for ${account.username}: ${firstError.text.slice(0, 300)}`,
      );
      // 4xx = data tak tersedia (izin/audiens kurang) → kosong + catatan; 5xx tetap 502.
      if (firstError.status < 500) {
        return c.json({
          genderAge: [],
          byGender: [],
          byAge: [],
          source: account.platform,
          username: account.username,
          notice: `Platform menolak permintaan demografi (${firstError.status}): ${firstError.text.slice(0, 200)}`,
        });
      }
      throw new HTTPError(
        502,
        `Gagal mengambil data demografi dari ${account.platform}: ${firstError.text.slice(0, 150)}`,
      );
    }

    // Agregasi gender (F/M) + usia terpisah — tidak ada cross-tab lagi.
    const byGender: { gender: "F" | "M"; value: number }[] = [];
    for (const row of genderRes.rows) {
      const g = row.key.charAt(0).toUpperCase();
      if (g === "F") byGender.push({ gender: "F", value: row.value });
      else if (g === "M") byGender.push({ gender: "M", value: row.value });
    }
    const byAge = ageRes.rows.filter((r) => r.key !== "").sort((a, b) => b.value - a.value);
    const payload = { genderAge: [] as GenderAgeRow[], byGender, byAge };

    // Cache hanya untuk response sukses (ada data)
    demographicsCache.set(cacheKey, {
      at: Date.now(),
      username: account.username,
      source: account.platform,
      payload,
    });

    return c.json({
      ...payload,
      source: account.platform,
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

// ---------------------------------------------------------------------------
// Pinterest Analytics — On-demand fetch (Developer Guidelines compliance)
// Pinterest melarang penyimpanan data analytics. Endpoint ini fetch langsung
// dari API setiap kali diminta, dengan in-memory cache 5 menit untuk
// mencegah rate limit.
// ---------------------------------------------------------------------------

type PinterestCache = {
  data: unknown;
  expiresAt: number;
};
const pinterestCache = new Map<string, PinterestCache>();
const PINTEREST_CACHE_TTL_MS = 5 * 60 * 1000; // 5 menit

analyticsRoute.get("/pinterest", async (c) => {
  try {
    const ctx = await requireOrg(c);

    // Cari akun Pinterest yang terhubung
    const accounts = await db
      .select()
      .from(socialAccount)
      .where(
        and(
          eq(socialAccount.organizationId, ctx.organization.id),
          eq(socialAccount.platform, "pinterest"),
          eq(socialAccount.isConnected, true),
        ),
      );

    if (accounts.length === 0) {
      return c.json({ account: null, pins: [] });
    }

    const account = accounts[0];
    if (!account?.accessTokenEnc) {
      return c.json({ account: null, pins: [], error: "Token tidak tersedia" });
    }

    // Check cache
    const cacheKey = `pinterest_${account.id}`;
    const cached = pinterestCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return c.json(cached.data);
    }

    // Decrypt token
    let token: string;
    try {
      token = decrypt(account.accessTokenEnc);
    } catch {
      return c.json({ account: null, pins: [], error: "Gagal decrypt token" });
    }

    // Fetch account info
    const accountRes = await httpRequest<{
      follower_count?: number;
      pin_count?: number;
      board_count?: number;
      username?: string;
    }>(`${PINTEREST_API_BASE_URL}/user_account`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!accountRes.ok) {
      const text = await accountRes.text().catch(() => "");
      console.warn(`[pinterest-analytics] Account fetch failed: ${text.slice(0, 150)}`);
      return c.json({
        account: null,
        pins: [],
        error: `Pinterest API error: ${accountRes.status}`,
      });
    }

    const accountData = await accountRes.json();

    // Fetch recent pins (top 10 by engagement)
    const pinsRes = await httpRequest<{
      items?: Array<{
        id: string;
        title?: string;
        link?: string;
        created_at?: string;
        media?: { images?: Record<string, { url?: string }> };
        board?: { name?: string };
      }>;
    }>(`${PINTEREST_API_BASE_URL}/pins`, {
      query: { page_size: "10", sort: "MOST_RECENT" },
      headers: { Authorization: `Bearer ${token}` },
    });

    let pins: Array<{
      id: string;
      title: string;
      thumbnail: string | null;
      createdAt: string;
    }> = [];

    if (pinsRes.ok) {
      const pinsData = await pinsRes.json();
      pins = (pinsData.items ?? []).map((pin) => ({
        id: pin.id,
        title: pin.title ?? "",
        thumbnail: pin.media?.images?.["236x"]?.url ?? null,
        createdAt: pin.created_at ?? "",
      }));
    }

    const result = {
      account: {
        username: accountData.username ?? account.username,
        followerCount: accountData.follower_count ?? null,
        pinCount: accountData.pin_count ?? null,
        boardCount: accountData.board_count ?? null,
      },
      pins,
    };

    // Cache result
    pinterestCache.set(cacheKey, { data: result, expiresAt: Date.now() + PINTEREST_CACHE_TTL_MS });

    return c.json(result);
  } catch (error) {
    return errorResponse(error);
  }
});
