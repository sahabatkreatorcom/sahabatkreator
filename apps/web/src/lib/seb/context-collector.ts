import { and, asc, desc, eq, gte, inArray, or } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";
import { PLATFORM_KNOWLEDGE, type SebContext } from "./types";

/** Collects organizational context for Seb (posts, analytics, competitors, etc.). */
export async function collectContext(organizationId: string): Promise<SebContext> {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const [organization, brandVoice, sebBrandKnowledge, accountsRaw, posts, platformAnalytics, competitors, platformKnowledge, previousRecommendations] =
        await Promise.all([
            db.query.organization.findFirst({ where: eq(schema.organization.id, organizationId), columns: { id: true, name: true } }),
            db.query.brandVoice.findFirst({ where: eq(schema.brandVoice.organizationId, organizationId) }),
            db.query.sebBrandKnowledge.findFirst({ where: eq(schema.sebBrandKnowledge.organizationId, organizationId) }),
            db.query.socialAccount.findMany({
                where: (t, { and: _and, eq: _eq }) => _and(_eq(t.organizationId, organizationId), _eq(t.isActive, true)),
                columns: { id: true, platform: true, name: true, username: true },
            }),
            db.query.post.findMany({
                where: and(
                    eq(schema.post.organizationId, organizationId),
                    or(
                        gte(schema.post.publishedAt, ninetyDaysAgo),
                        inArray(schema.post.status, ["DRAFT", "SCHEDULED"]),
                    ),
                ),
                with: {
                    socialAccount: { columns: { platform: true, name: true, username: true } },
                },
                orderBy: [desc(schema.post.publishedAt), desc(schema.post.createdAt)],
                limit: 80,
            }),
            db.query.platformAnalytics.findMany({
                where: (t, { and: _and, eq: _eq, gte: _gte }) =>
                    _and(_eq(t.organizationId, organizationId), _gte(t.date, ninetyDaysAgo)),
                with: { socialAccount: { columns: { platform: true, name: true } } },
                orderBy: [desc(schema.platformAnalytics.date)],
                limit: 120,
            }),
            db.query.competitor.findMany({
                where: eq(schema.competitor.organizationId, organizationId),
                with: { posts: { orderBy: [desc(schema.competitorPost.postedAt)], limit: 10 } },
                limit: 20,
            }),
            db.query.sebPlatformKnowledge.findMany({
                where: eq(schema.sebPlatformKnowledge.isActive, true),
                orderBy: [desc(schema.sebPlatformKnowledge.updatedAt)],
                limit: 50,
            }),
            db.query.sebRecommendation.findMany({
                where: eq(schema.sebRecommendation.organizationId, organizationId),
                with: { socialAccount: { columns: { id: true, name: true, username: true } } },
                orderBy: [desc(schema.sebRecommendation.updatedAt)],
                limit: 30,
            }),
        ]);

    const accounts = (accountsRaw ?? []).map((a) => ({
        id: a.id,
        platform: a.platform,
        name: a.name,
        username: a.username ?? "",
    }));

    const connectedPlatformKnowledge = accounts.map((account) => ({
        platform: account.platform,
        socialAccountId: account.id,
        accountName: account.name,
        username: account.username,
        guidance: PLATFORM_KNOWLEDGE[account.platform] || "",
    }));

    return {
        organization: organization ?? { id: organizationId, name: "Workspace" },
        brandVoice,
        sebBrandKnowledge,
        accounts,
        posts: posts.map((post) => ({
            id: post.id,
            caption: post.caption,
            status: post.status,
            postType: post.postType,
            platform: post.socialAccount?.platform || post.platform,
            socialAccountId: post.socialAccountId,
            accountName: post.socialAccount?.name ?? null,
            accountUsername: post.socialAccount?.username ?? null,
            publishedAt: post.publishedAt?.toISOString() ?? null,
            scheduledAt: post.scheduledAt?.toISOString() ?? null,
        })),
        platformAnalytics: platformAnalytics.map((item) => ({
            id: item.id,
            socialAccountId: item.socialAccountId,
            accountName: item.socialAccount?.name,
            platform: item.socialAccount?.platform,
            date: item.date.toISOString(),
            followers: item.followers,
            followersChange: item.followersChange,
            following: item.following,
            impressions: item.impressions,
            reach: item.reach,
            engagementRate: item.engagementRate,
            profileViews: item.profileViews,
            websiteClicks: item.websiteClicks,
        })),
        competitors: competitors.map((competitor) => ({
            id: competitor.id,
            platform: competitor.platform,
            username: competitor.username,
            displayName: competitor.displayName,
            followers: competitor.followers,
            followerGrowth: competitor.followerGrowth,
            avgEngagement: competitor.avgEngagement,
            postsPerWeek: competitor.postsPerWeek,
            posts: competitor.posts.map((p) => ({
                id: p.id,
                caption: p.caption,
                mediaType: p.mediaType,
                likes: p.likes,
                comments: p.comments,
                engagement: p.engagement,
                postedAt: p.postedAt.toISOString(),
            })),
        })),
        platformKnowledge: [
            ...connectedPlatformKnowledge,
            ...platformKnowledge.map((item) => ({
                platform: item.platform,
                title: item.title,
                guidance: item.content,
                sourceUrl: item.sourceUrl,
            })),
        ],
        previousRecommendations,
    };
}
