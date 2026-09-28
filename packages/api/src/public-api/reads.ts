// Endpoint baca: accounts, posts, analytics, reports, media, renders.

import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { DateRangeQuerySchema, PaginationQuerySchema } from "./common";

extendZodWithOpenApi(z);

// ---------------- accounts ----------------

export const AccountItemSchema = z
  .object({
    id: z.string(),
    platform: z.string(),
    platformAccountId: z.string().nullable(),
    username: z.string().nullable(),
    displayName: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    isConnected: z.boolean(),
    needsReconnect: z.boolean(),
    lastSyncedAt: z.string().datetime().nullable(),
    lastError: z.string().nullable(),
    tokenExpiresAt: z.string().datetime().nullable(),
    hasRefreshToken: z.boolean(),
    createdAt: z.string().datetime(),
    isBridge: z.boolean(),
  })
  .openapi("AccountItem");

export const AccountsResponseSchema = z
  .object({ accounts: z.array(AccountItemSchema) })
  .openapi("AccountsResponse");

export const AccountStatisticResponseSchema = z
  .object({
    statistic: z
      .object({
        followers: z.number().nullable(),
        posts: z.number().nullable(),
        engagement: z.number().nullable(),
      })
      .nullable()
      .openapi({
        description: "Statistik real-time dari bridge Repliz. null bila belum pernah disinkronkan.",
      }),
    unsupported: z.boolean().optional(),
  })
  .openapi("AccountStatisticResponse");

// ---------------- posts ----------------

export const PostItemSchema = z
  .object({
    id: z.string(),
    postGroupId: z.string(),
    socialAccountId: z.string(),
    platform: z.string(),
    status: z.enum(["draft", "scheduled", "publishing", "published", "failed"]),
    content: z.string().nullable(),
    platformPostId: z.string().nullable(),
    platformPostUrl: z.string().nullable(),
    publishedAt: z.string().datetime().nullable(),
    errorCode: z.string().nullable(),
    errorMessage: z.string().nullable(),
    hashtags: z.array(z.string()).nullable(),
    firstComment: z.string().nullable(),
    username: z.string().nullable(),
    displayName: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    isBridge: z.boolean(),
  })
  .openapi("PostItem");

export const PostGroupItemSchema = z
  .object({
    id: z.string(),
    content: z.string().nullable(),
    scheduledAt: z.string().datetime().nullable(),
    reminderAt: z.string().datetime().nullable(),
    timezone: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    isExternal: z.boolean().optional(),
    posts: z.array(PostItemSchema),
  })
  .openapi("PostGroupItem");

export const PostsListResponseSchema = z
  .object({
    groups: z.array(PostGroupItemSchema),
    page: z.number(),
    perPage: z.number(),
  })
  .openapi("PostsListResponse");

export const PostsListQuerySchema = PaginationQuerySchema.extend({
  from: z.string().optional(),
  to: z.string().optional(),
  status: z.string().optional(),
  includeExternal: z.string().optional().openapi({ example: "1" }),
});

export const PostDetailResponseSchema = z
  .object({
    group: PostGroupItemSchema,
    posts: z.array(PostItemSchema),
  })
  .openapi("PostDetailResponse");

// ---------------- analytics ----------------

export const AnalyticsTotalsSchema = z
  .object({
    followers: z.number(),
    likes: z.number(),
    comments: z.number(),
    shares: z.number(),
    views: z.number(),
    impressions: z.number(),
  })
  .openapi("AnalyticsTotals");

export const AnalyticsAccountSchema = z
  .object({
    id: z.string(),
    platform: z.string(),
    username: z.string().nullable(),
    displayName: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    followers: z.number().nullable(),
  })
  .openapi("AnalyticsAccount");

export const AnalyticsOverviewQuerySchema = DateRangeQuerySchema.extend({
  days: z.coerce.number().int().min(1).max(365).optional(),
});

export const AnalyticsOverviewResponseSchema = z
  .object({
    range: z.union([
      z.object({ from: z.string(), to: z.string() }),
      z.object({ days: z.number(), since: z.string() }),
    ]),
    totals: AnalyticsTotalsSchema,
    accounts: z.array(AnalyticsAccountSchema),
    comparison: z
      .object({
        previous: AnalyticsTotalsSchema,
        deltas: AnalyticsTotalsSchema.partial().nullable(),
      })
      .optional(),
  })
  .openapi("AnalyticsOverviewResponse");

export const AnalyticsTimeseriesQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional().openapi({ default: 30 }),
});

export const AnalyticsTimeseriesResponseSchema = z
  .object({
    days: z.number(),
    series: z.array(
      z.object({
        date: z.string(),
        likes: z.number(),
        comments: z.number(),
        shares: z.number(),
        views: z.number(),
        impressions: z.number(),
      }),
    ),
  })
  .openapi("AnalyticsTimeseriesResponse");

export const AnalyticsTopPostsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).optional().openapi({ default: 10 }),
  platform: z.string().optional(),
});

export const AnalyticsTopPostSchema = z
  .object({
    postId: z.string(),
    platform: z.string(),
    content: z.string().nullable(),
    platformPostUrl: z.string().nullable(),
    platformPostId: z.string().nullable(),
    isBridge: z.boolean(),
    publishedAt: z.string().datetime().nullable(),
    username: z.string().nullable(),
    displayName: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    likes: z.number().nullable(),
    comments: z.number().nullable(),
    shares: z.number().nullable(),
    saves: z.number().nullable(),
    views: z.number().nullable(),
    impressions: z.number().nullable(),
    reach: z.number().nullable(),
    engagement: z.number().nullable(),
    engagementRate: z.number().nullable(),
    media: z
      .object({
        url: z.string(),
        type: z.enum(["video", "image"]),
        videoUrl: z.string().nullable(),
      })
      .nullable(),
  })
  .openapi("AnalyticsTopPost");

export const AnalyticsTopPostsResponseSchema = z
  .object({ posts: z.array(AnalyticsTopPostSchema) })
  .openapi("AnalyticsTopPostsResponse");

// ---------------- reports ----------------

export const ReportSummaryQuerySchema = DateRangeQuerySchema;

export const ReportSummaryResponseSchema = z
  .object({
    report: z.object({
      organizationName: z.string(),
      from: z.string(),
      to: z.string(),
      postsPublished: z.number(),
      totalEngagement: z.number(),
      totalImpressions: z.number(),
      totalReach: z.number(),
      accounts: z.array(
        z.object({
          username: z.string(),
          platform: z.string(),
          followersStart: z.number().nullable(),
          followersEnd: z.number().nullable(),
        }),
      ),
      topPosts: z.array(
        z.object({
          content: z.string(),
          platform: z.string(),
          likes: z.number(),
          comments: z.number(),
          shares: z.number(),
          saves: z.number(),
          engagement: z.number(),
        }),
      ),
      goals: z.array(
        z.object({
          name: z.string(),
          metric: z.string(),
          currentValue: z.number(),
          targetValue: z.number(),
          progressPercent: z.number(),
        }),
      ),
    }),
  })
  .openapi("ReportSummaryResponse");

// ---------------- media ----------------

export const MediaItemSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    type: z.enum(["image", "video", "audio"]),
    url: z.string(),
    sizeBytes: z.number().nullable(),
    width: z.number().nullable(),
    height: z.number().nullable(),
    folderId: z.string().nullable(),
    createdAt: z.string().datetime(),
  })
  .openapi("MediaItem");

export const MediaListQuerySchema = z.object({
  folderId: z.string().optional(),
});

export const MediaListResponseSchema = z
  .object({
    items: z.array(MediaItemSchema),
    storageConfigured: z.boolean(),
  })
  .openapi("MediaListResponse");

// ---------------- renders ----------------

export const RenderManifestItemSchema = z
  .object({
    id: z.string(),
    project: z.string(),
    title: z.string(),
    orientation: z.enum(["landscape", "portrait", "square"]),
    videoUrl: z.string(),
    sizeBytes: z.number(),
    durationSeconds: z.number(),
    width: z.number(),
    height: z.number(),
    commitSha: z.string(),
    branch: z.string(),
    renderedAt: z.string().datetime(),
  })
  .openapi("RenderManifestItem");

export const RenderManifestResponseSchema = z
  .object({
    version: z.literal(1),
    generatedAt: z.string().datetime(),
    renders: z.array(RenderManifestItemSchema),
  })
  .openapi("RenderManifestResponse");
