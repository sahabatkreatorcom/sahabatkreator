import { db, schema } from "@sahabat-kreator/db";
import { desc, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { json, withAuth } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/analytics/overview — ringkasan metrik org (7/30 hari terakhir).
 */
export const GET = withAuth(async (ctx, req: NextRequest) => {
  const { activeOrganizationId } = ctx;
  if (!activeOrganizationId)
    return json({ error: "Pilih workspace dulu." }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const days = Math.min(Math.max(Number(searchParams.get("days")) || 7, 1), 90);

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));

  const [snapshots, accounts, publishedPosts] = await Promise.all([
    db.query.dailyAnalyticsSnapshot.findMany({
      where: (t, { and: _and, eq: _eq, gte: _gte }) =>
        _and(_eq(t.organizationId, activeOrganizationId), _gte(t.date, since)),
      orderBy: [desc(schema.dailyAnalyticsSnapshot.date)],
    }),
    db.query.socialAccount.findMany({
      where: eq(schema.socialAccount.organizationId, activeOrganizationId),
      columns: {
        id: true,
        platform: true,
        name: true,
        avatar: true,
        username: true,
      },
    }),
    db.query.post.findMany({
      where: (t, { and: _and, eq: _eq, gte: _gte }) =>
        _and(
          _eq(t.organizationId, activeOrganizationId),
          _eq(t.status, "PUBLISHED"),
          _gte(t.publishedAt, since),
        ),
      columns: { id: true, platform: true },
    }),
  ]);

  // Aggregate per platform (pakai data snapshot terbaru per platform)
  const platformMap = new Map<string, (typeof snapshots)[number]>();
  for (const s of snapshots) {
    const existing = platformMap.get(s.platform);
    if (!existing || s.date > existing.date) {
      platformMap.set(s.platform, s);
    }
  }

  const perPlatform = [...platformMap.entries()].map(([platform, s]) => ({
    platform,
    followers: s.followers,
    followersChange: s.followersChange,
    impressions: s.impressions,
    reach: s.reach,
    engagementRate: s.engagementRate,
    postsPublished: s.postsPublished,
    accountName: accounts.find((a) => a.platform === platform)?.name ?? null,
    accountAvatar:
      accounts.find((a) => a.platform === platform)?.avatar ?? null,
  }));

  // Total ringkasan
  const totals = snapshots.reduce(
    (acc, s) => {
      acc.followers += s.followers;
      acc.impressions += s.impressions;
      acc.reach += s.reach;
      acc.postsPublished += s.postsPublished;
      return acc;
    },
    { followers: 0, impressions: 0, reach: 0, postsPublished: 0 },
  );

  // Series harian (untuk chart)
  const dateSet = new Set(
    snapshots.map((s) => s.date.toISOString().slice(0, 10)),
  );
  const series = [...dateSet].sort().map((date) => {
    const daySnapshots = snapshots.filter(
      (s) => s.date.toISOString().slice(0, 10) === date,
    );
    return {
      date,
      followers: daySnapshots.reduce((a, s) => a + s.followers, 0),
      impressions: daySnapshots.reduce((a, s) => a + s.impressions, 0),
      reach: daySnapshots.reduce((a, s) => a + s.reach, 0),
      postsPublished: daySnapshots.reduce((a, s) => a + s.postsPublished, 0),
    };
  });

  return json({
    totals,
    perPlatform,
    series,
    connectedAccounts: accounts.length,
    publishedPosts: publishedPosts.length,
    days,
  });
});
