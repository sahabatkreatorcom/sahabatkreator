// Admin Monitoring — dashboard DB & sistem untuk superadmin
// GET /api/admin/monitoring — satu endpoint ringkas semua metrik penting

import { db } from "@sahabatkreator/db";
import {
  accountAnalytics,
  automationLog,
  engagementItem,
  media,
  notification,
  payment,
  post,
  postAnalytics,
  postGroup,
  session,
  socialAccount,
  subscription,
  user,
} from "@sahabatkreator/db/schema";
import { count, desc, eq, gte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { errorResponse, requirePlatformAdmin } from "../lib/auth-guard";

export const monitoringRoute = new Hono();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MetricRow = { label: string; value: number | string; detail?: string };

type MonitoringResponse = {
  generatedAt: string;
  db: {
    status: "ok" | "error";
    latencyMs: number;
  };
  counts: MetricRow[];
  recentActivity: {
    postsLast24h: number;
    postsLast7d: number;
    newUsersLast7d: number;
    newSubscriptionsLast7d: number;
    failedPaymentsLast24h: number;
    engagementItemsLast24h: number;
  };
  platformAccounts: Array<{
    platform: string;
    count: number;
  }>;
  topOrganizations: Array<{
    id: string;
    name: string;
    postCount: number;
    memberCount: number;
  }>;
  storage: {
    mediaCount: number;
    totalMediaSizeEstimate: string;
  };
  auth: {
    activeSessions: number;
    totalUsers: number;
  };
  recentErrors: Array<{
    timestamp: string;
    type: string;
    message: string;
  }>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function rowCount(table: { _: unknown }): Promise<number> {
  const [result] = await db.select({ value: count() }).from(table);
  return result?.value ?? 0;
}

async function countSince(
  table: { _: unknown },
  dateColumn: { _: unknown },
  daysAgo: number,
): Promise<number> {
  const since = new Date();
  since.setDate(since.getDate() - daysAgo);
  const [result] = await db
    .select({ value: count() })
    .from(table)
    .where(gte(dateColumn as never, since as never));
  return result?.value ?? 0;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

monitoringRoute.get("/", async (c) => {
  try {
    await requirePlatformAdmin(c);

    // 1. DB health check
    const dbStart = Date.now();
    await db.execute(sql`SELECT 1`);
    const dbLatencyMs = Date.now() - dbStart;

    // 2. Table counts (parallel)
    const [
      userCount,
      sessionCount,
      postGroupCount,
      postCount,
      mediaCount,
      socialAccountCount,
      subscriptionCount,
      paymentCount,
      engagementCount,
      analyticsCount,
      postAnalyticsCount,
      automationLogCount,
      notificationCount,
    ] = await Promise.all([
      rowCount(user),
      rowCount(session),
      rowCount(postGroup),
      rowCount(post),
      rowCount(media),
      rowCount(socialAccount),
      rowCount(subscription),
      rowCount(payment),
      rowCount(engagementItem),
      rowCount(accountAnalytics),
      rowCount(postAnalytics),
      rowCount(automationLog),
      rowCount(notification),
    ]);

    // 3. Recent activity metrics
    const [
      postsLast24h,
      postsLast7d,
      newUsersLast7d,
      newSubscriptionsLast7d,
      failedPaymentsLast24h,
      engagementItemsLast24h,
    ] = await Promise.all([
      countSince(post, post.createdAt, 1),
      countSince(post, post.createdAt, 7),
      countSince(user, user.createdAt, 7),
      countSince(subscription, subscription.createdAt, 7),
      // failed payments — approximate by looking for status != 'succeeded' in last 24h
      db
        .select({ value: count() })
        .from(payment)
        .where(
          sql`${payment.status} != 'succeeded' AND ${payment.createdAt} >= NOW() - INTERVAL '24 hours'`,
        )
        .then((r) => r[0]?.value ?? 0),
      countSince(engagementItem, engagementItem.createdAt, 1),
    ]);

    // 4. Platform accounts distribution
    const platformAccounts = await db
      .select({
        platform: socialAccount.platform,
        value: count(),
      })
      .from(socialAccount)
      .groupBy(socialAccount.platform);

    // 5. Top organizations by post count
    const topOrgs = await db
      .select({
        id: postGroup.organizationId,
        value: count(),
      })
      .from(postGroup)
      .groupBy(postGroup.organizationId)
      .orderBy(desc(count()))
      .limit(5);

    // 6. Auth stats
    const activeSessions = await db
      .select({ value: count() })
      .from(session)
      .where(sql`${session.expiresAt} > NOW()`)
      .then((r) => r[0]?.value ?? 0);

    // 7. Recent errors (from automation_log where status = 'failed')
    const recentErrors = await db
      .select({
        timestamp: automationLog.createdAt,
        type: automationLog.platform,
        message: automationLog.error,
      })
      .from(automationLog)
      .where(sql`${automationLog.status} = 'failed'`)
      .orderBy(desc(automationLog.createdAt))
      .limit(10);

    const response: MonitoringResponse = {
      generatedAt: new Date().toISOString(),
      db: {
        status: "ok",
        latencyMs: dbLatencyMs,
      },
      counts: [
        { label: "Users", value: userCount },
        { label: "Sessions", value: sessionCount },
        { label: "Post Groups", value: postGroupCount },
        { label: "Posts", value: postCount },
        { label: "Media", value: mediaCount },
        { label: "Social Accounts", value: socialAccountCount },
        { label: "Subscriptions", value: subscriptionCount },
        { label: "Payments", value: paymentCount },
        { label: "Engagement Items", value: engagementCount },
        { label: "Account Analytics", value: analyticsCount },
        { label: "Post Analytics", value: postAnalyticsCount },
        { label: "Automation Logs", value: automationLogCount },
        { label: "Notifications", value: notificationCount },
      ],
      recentActivity: {
        postsLast24h,
        postsLast7d,
        newUsersLast7d,
        newSubscriptionsLast7d,
        failedPaymentsLast24h,
        engagementItemsLast24h,
      },
      platformAccounts: platformAccounts.map((r) => ({
        platform: r.platform,
        count: r.value,
      })),
      topOrganizations: topOrgs.map((r) => ({
        id: r.id,
        name: r.id, // org name not in postGroup, use ID
        postCount: r.value,
        memberCount: 0,
      })),
      storage: {
        mediaCount,
        totalMediaSizeEstimate: "N/A", // R2 size not easily queryable
      },
      auth: {
        activeSessions,
        totalUsers: userCount,
      },
      recentErrors: recentErrors.map((r) => ({
        timestamp: r.timestamp?.toISOString() ?? "",
        type: r.type ?? "unknown",
        message: r.message ?? "",
      })),
    };

    return c.json(response);
  } catch (error) {
    return errorResponse(error);
  }
});
