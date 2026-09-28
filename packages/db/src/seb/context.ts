// SEB — kumpulkan konteks organization (posts, analytics, kompetitor, brand
// knowledge, platform knowledge, rekomendasi sebelumnya) untuk prompt AI.
import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { db } from "../index";
import {
  accountAnalytics,
  brandVoice,
  competitor,
  media,
  organization,
  post,
  postGroup,
  postMedia,
  sebBrandKnowledge,
  sebPlatformKnowledge,
  sebRecommendation,
  socialAccount,
} from "../schema";

/** Normalisasi timezone — fallback UTC bila invalid */
export function normalizeSebTimezone(timezone?: string | null): string {
  if (!timezone) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return "UTC";
  }
}

/** Format tanggal ke representasi lokal org (human-readable) */
export function formatSebLocalDate(
  value: Date | string | null | undefined,
  timezone: string,
): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: normalizeSebTimezone(timezone),
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
  }).format(date);
}

/** Apakah dua waktu jatuh di tanggal lokal yang sama (untuk dedupe report harian) */
export function isSameSebLocalDate(left: Date, right: Date, timezone: string): boolean {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: normalizeSebTimezone(timezone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(left) === formatter.format(right);
}

const PLATFORM_KNOWLEDGE: Record<string, string> = {
  instagram:
    "Prioritise strong first-frame hooks, Reels retention, carousel saves, creator-style captions for feed/Reels, Story-native visual clarity, comment prompts, and consistent visual identity.",
  facebook:
    "Prioritise conversation starters, community relevance, native video, local trust signals, Story-native visual clarity, and share-worthy practical posts.",
  instagram_standalone:
    "Prioritise strong first-frame hooks, Reels retention, creator-style captions, comment prompts, and consistent visual identity.",
  tiktok:
    "Prioritise immediate hooks, fast pacing, native-feeling edits, trend fit, watch-time, comments, and concise captions.",
  youtube:
    "Prioritise title/thumbnail clarity, retention curves, searchable descriptions, Shorts hooks, playlists, and clear viewer payoff.",
  pinterest:
    "Prioritise search keywords, vertical creative, evergreen value, product/use-case clarity, and destination link relevance.",
  google_business:
    "Prioritise local intent, offers, service updates, proof, fresh photos, and clear calls to contact or visit.",
  linkedin:
    "Prioritise expert POV, founder/team stories, practical lessons, credible proof, and conversation-driving questions.",
  bluesky: "Prioritise concise human posts, timely commentary, replies, and community-native tone.",
  threads:
    "Prioritise conversational hooks, quick opinions, reply chains, and lightweight community engagement.",
  manual:
    "Use the account name and past performance to infer format needs, but avoid claiming platform-specific rules without evidence.",
};

export type SebContext = Awaited<ReturnType<typeof collectSebContext>>;

/**
 * Kumpulkan seluruh konteks organization untuk SEB.
 * Jumlah dibatasi agar prompt tetap dalam budget token (~90K char max report).
 */
export async function collectSebContext(organizationId: string) {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const sinceDate = ninetyDaysAgo.toISOString().slice(0, 10);

  const [org] = await db
    .select({ id: organization.id, name: organization.name })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  if (!org) throw new Error("Organisasi tidak ditemukan");

  // Timezone default: pakai timezone post_group terbanyak, fallback Asia/Jakarta
  const [tzRow] = await db
    .select({ timezone: sql<string>`mode() within group (order by ${postGroup.timezone})` })
    .from(postGroup)
    .where(eq(postGroup.organizationId, organizationId));
  const timezone = normalizeSebTimezone(tzRow?.timezone || "Asia/Jakarta");

  const [
    voice,
    knowledge,
    accounts,
    posts,
    analyticsRows,
    competitors,
    platformKnowledgeRows,
    previousRecommendations,
  ] = await Promise.all([
    db.select().from(brandVoice).where(eq(brandVoice.organizationId, organizationId)).limit(1),
    db
      .select()
      .from(sebBrandKnowledge)
      .where(eq(sebBrandKnowledge.organizationId, organizationId))
      .limit(1),
    db
      .select({
        id: socialAccount.id,
        platform: socialAccount.platform,
        username: socialAccount.username,
        displayName: socialAccount.displayName,
      })
      .from(socialAccount)
      .where(
        and(eq(socialAccount.organizationId, organizationId), eq(socialAccount.isConnected, true)),
      )
      .limit(20),
    db
      .select({
        id: post.id,
        status: post.status,
        platform: post.platform,
        socialAccountId: post.socialAccountId,
        content: post.content,
        hashtags: post.hashtags,
        publishedAt: post.publishedAt,
        scheduledAt: postGroup.scheduledAt,
        createdAt: post.createdAt,
      })
      .from(post)
      .innerJoin(postGroup, eq(post.postGroupId, postGroup.id))
      .where(
        and(
          eq(post.organizationId, organizationId),
          or(gte(post.publishedAt, ninetyDaysAgo), inArray(post.status, ["draft", "scheduled"])),
        ),
      )
      .orderBy(desc(post.publishedAt), desc(post.createdAt))
      .limit(80),
    db
      .select({
        platform: accountAnalytics.platform,
        socialAccountId: accountAnalytics.socialAccountId,
        date: accountAnalytics.date,
        followers: accountAnalytics.followers,
        impressions: accountAnalytics.impressions,
        reach: accountAnalytics.reach,
        engagementCount: accountAnalytics.engagementCount,
      })
      .from(accountAnalytics)
      .where(
        and(
          eq(accountAnalytics.organizationId, organizationId),
          gte(accountAnalytics.date, sinceDate),
        ),
      )
      .orderBy(desc(accountAnalytics.date))
      .limit(120),
    db.select().from(competitor).where(eq(competitor.organizationId, organizationId)).limit(20),
    db
      .select()
      .from(sebPlatformKnowledge)
      .where(eq(sebPlatformKnowledge.isActive, true))
      .orderBy(desc(sebPlatformKnowledge.updatedAt))
      .limit(50),
    db
      .select({
        id: sebRecommendation.id,
        title: sebRecommendation.title,
        status: sebRecommendation.status,
        category: sebRecommendation.category,
        priority: sebRecommendation.priority,
        socialAccountId: sebRecommendation.socialAccountId,
        completedAt: sebRecommendation.completedAt,
      })
      .from(sebRecommendation)
      .where(eq(sebRecommendation.organizationId, organizationId))
      .orderBy(desc(sebRecommendation.updatedAt))
      .limit(30),
  ]);

  // Post analytics terbaru per post (kumulatif lifetime)
  const postIds = posts.map((p) => p.id);
  const postAnalyticsRows = postIds.length
    ? await db.execute(sql`
        select distinct on (pa.post_id)
          pa.post_id, pa.likes, pa.comments, pa.shares, pa.saves,
          pa.views, pa.impressions, pa.reach
        from post_analytics pa
        where pa.post_id in (${sql.join(
          postIds.map((id) => sql`${id}`),
          sql`, `,
        )})
        order by pa.post_id, pa.date desc
      `)
    : { rows: [] as unknown[] };

  // Media per post (max 3 per post, untuk info konteks saja tanpa vision)
  const postIdsForMedia = posts.map((p) => p.id);
  const mediaRows = postIdsForMedia.length
    ? await db
        .select({
          postId: postMedia.postId,
          sortOrder: postMedia.sortOrder,
          type: media.type,
          mimeType: media.mimeType,
          width: media.width,
          height: media.height,
          durationSeconds: media.durationSeconds,
        })
        .from(postMedia)
        .innerJoin(media, eq(postMedia.mediaId, media.id))
        .where(inArray(postMedia.postId, postIdsForMedia))
        .limit(240)
    : [];

  const analyticsByPost = new Map(
    (
      postAnalyticsRows.rows as Array<{
        post_id: string;
        likes: number;
        comments: number;
        shares: number;
        saves: number;
        views: string | number;
        impressions: string | number;
        reach: string | number;
      }>
    ).map((r) => [
      r.post_id,
      {
        likes: r.likes,
        comments: r.comments,
        shares: r.shares,
        saves: r.saves,
        views: Number(r.views),
        impressions: Number(r.impressions),
        reach: Number(r.reach),
      },
    ]),
  );

  const mediaByPost = new Map<
    string,
    Array<{ type: string; mimeType: string; durationSeconds: number | null }>
  >();
  for (const row of mediaRows) {
    const list = mediaByPost.get(row.postId) ?? [];
    if (list.length < 3) {
      list.push({
        type: row.type,
        mimeType: row.mimeType,
        durationSeconds: row.durationSeconds,
      });
    }
    mediaByPost.set(row.postId, list);
  }

  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  return {
    organization: { id: org.id, name: org.name },
    timezone,
    currentLocalTime: formatSebLocalDate(new Date(), timezone),
    recommendationScopeInstruction:
      "Recommendations should be scoped per connected business account. Set recommendation.socialAccountId to one of accounts[].id when the evidence or action is account-specific. Use null only for genuinely cross-account recommendations.",
    brandVoice: voice[0] ?? null,
    sebBrandKnowledge: knowledge[0]
      ? {
          audience: knowledge[0].audience,
          positioning: knowledge[0].positioning,
          products: knowledge[0].products,
          offers: knowledge[0].offers,
          voiceRules: knowledge[0].voiceRules,
          bannedTopics: knowledge[0].bannedTopics,
          learnedInsights: knowledge[0].learnedInsights,
        }
      : null,
    accounts: accounts.map((a) => ({
      id: a.id,
      platform: a.platform,
      accountName: a.displayName,
      username: a.username,
      guidance: PLATFORM_KNOWLEDGE[a.platform] || "",
    })),
    posts: posts.map((p) => ({
      id: p.id,
      caption: p.content,
      status: p.status,
      platform: p.platform,
      socialAccountId: p.socialAccountId,
      accountUsername: accountMap.get(p.socialAccountId)?.username ?? null,
      publishedAt: p.publishedAt,
      publishedAtLocal: formatSebLocalDate(p.publishedAt, timezone),
      scheduledAt: p.scheduledAt,
      scheduledAtLocal: formatSebLocalDate(p.scheduledAt, timezone),
      hashtags: p.hashtags,
      analytics: analyticsByPost.get(p.id) ?? null,
      media: mediaByPost.get(p.id) ?? [],
    })),
    platformAnalytics: analyticsRows.map((row) => ({
      platform: row.platform,
      socialAccountId: row.socialAccountId,
      date: row.date,
      followers: row.followers,
      impressions: row.impressions,
      reach: row.reach,
      engagementCount: row.engagementCount,
    })),
    competitors: competitors.map((cp) => ({
      platform: cp.platform,
      username: cp.username,
      displayName: cp.displayName,
      followers: cp.followers,
      avgEngagementRatePercent:
        cp.avgEngagementRateBp != null ? cp.avgEngagementRateBp / 100 : null,
      postsPerWeek: cp.postsPerWeek,
      engagementHistory: cp.engagementHistory,
      notes: cp.notes,
    })),
    platformKnowledge: platformKnowledgeRows.map((item) => ({
      platform: item.platform,
      title: item.title,
      guidance: item.content,
      sourceUrl: item.sourceUrl,
    })),
    previousRecommendations,
  };
}
