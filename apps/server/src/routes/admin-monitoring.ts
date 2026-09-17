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
import { count, desc, sql } from "drizzle-orm";
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

async function safeCount(table: { _: unknown }): Promise<number> {
  try {
    const [result] = await db.select({ value: count() }).from(table);
    return result?.value ?? 0;
  } catch {
    return -1;
  }
}

async function safeCountSince(
  table: { _: unknown },
  dateColumn: { _: unknown },
  daysAgo: number,
): Promise<number> {
  try {
    const since = new Date();
    since.setDate(since.getDate() - daysAgo);
    const [result] = await db
      .select({ value: count() })
      .from(table)
      .where(sql`${dateColumn as string} >= ${since}`);
    return result?.value ?? 0;
  } catch {
    return -1;
  }
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
      notificationCount,
    ] = await Promise.all([
      safeCount(user),
      safeCount(session),
      safeCount(postGroup),
      safeCount(post),
      safeCount(media),
      safeCount(socialAccount),
      safeCount(subscription),
      safeCount(payment),
      safeCount(engagementItem),
      safeCount(accountAnalytics),
      safeCount(postAnalytics),
      safeCount(notification),
    ]);

    // 3. Recent activity metrics
    const [
      postsLast24h,
      postsLast7d,
      newUsersLast7d,
      newSubscriptionsLast7d,
      engagementItemsLast24h,
    ] = await Promise.all([
      safeCountSince(post, post.createdAt, 1),
      safeCountSince(post, post.createdAt, 7),
      safeCountSince(user, user.createdAt, 7),
      safeCountSince(subscription, subscription.createdAt, 7),
      safeCountSince(engagementItem, engagementItem.createdAt, 1),
    ]);

    // Failed payments in last 24h
    let failedPaymentsLast24h = 0;
    try {
      const [result] = await db
        .select({ value: count() })
        .from(payment)
        .where(sql`${payment.status} != 'succeeded' AND ${payment.createdAt} >= NOW() - INTERVAL '24 hours'`);
      failedPaymentsLast24h = result?.value ?? 0;
    } catch {
      failedPaymentsLast24h = -1;
    }

    // 4. Platform accounts distribution
    let platformAccounts: Array<{ platform: string; count: number }> = [];
    try {
      const rows = await db
        .select({
          platform: socialAccount.platform,
          value: count(),
        })
        .from(socialAccount)
        .groupBy(socialAccount.platform);
      platformAccounts = rows.map((r) => ({ platform: r.platform ?? "unknown", count: r.value }));
    } catch {
      platformAccounts = [];
    }

    // 5. Auth stats
    let activeSessions = 0;
    try {
      const [result] = await db
        .select({ value: count() })
        .from(session)
        .where(sql`${session.expiresAt} > NOW()`);
      activeSessions = result?.value ?? 0;
    } catch {
      activeSessions = -1;
    }

    // 6. Recent errors (from automation_log where status = 'failed')
    let recentErrors: Array<{ timestamp: string; type: string; message: string }> = [];
    try {
      const rows = await db
        .select({
          timestamp: automationLog.occurredAt,
          type: automationLog.source,
          message: automationLog.error,
        })
        .from(automationLog)
        .where(sql`${automationLog.status} = 'failed'`)
        .orderBy(desc(automationLog.occurredAt))
        .limit(10);
      recentErrors = rows.map((r) => ({
        timestamp: r.timestamp?.toISOString() ?? "",
        type: r.type ?? "unknown",
        message: r.message ?? "",
      }));
    } catch {
      recentErrors = [];
    }

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
      platformAccounts,
      auth: {
        activeSessions,
        totalUsers: userCount,
      },
      recentErrors,
    };

    return c.json(response);
  } catch (error) {
    return errorResponse(error);
  }
});
