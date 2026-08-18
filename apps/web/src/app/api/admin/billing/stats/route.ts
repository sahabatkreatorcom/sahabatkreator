import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";
import { withAdmin, json } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = withAdmin(async () => {
    const now = new Date();
    const startThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const completed = "COMPLETED" as const;

    const [totalRev] = await db
        .select({ total: sql<number>`coalesce(sum(${schema.payment.amount}), 0)` })
        .from(schema.payment)
        .where(eq(schema.payment.status, completed));

    const [thisMonth] = await db
        .select({ total: sql<number>`coalesce(sum(${schema.payment.amount}), 0)` })
        .from(schema.payment)
        .where(and(eq(schema.payment.status, completed), gte(schema.payment.completedAt, startThisMonth)));

    const [lastMonth] = await db
        .select({ total: sql<number>`coalesce(sum(${schema.payment.amount}), 0)` })
        .from(schema.payment)
        .where(
            and(
                eq(schema.payment.status, completed),
                gte(schema.payment.completedAt, startLastMonth),
                lt(schema.payment.completedAt, startThisMonth),
            )
        );

    const [activeSubs] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.subscription)
        .where(eq(schema.subscription.status, "active"));

    const [canceledSubs] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.subscription)
        .where(and(eq(schema.subscription.status, "canceled"), gte(schema.subscription.canceledAt, startThisMonth)));

    const [customers] = await db
        .select({ count: sql<number>`count(distinct ${schema.payment.organizationId})::int` })
        .from(schema.payment);

    const activeCount = Number(activeSubs?.count ?? 0);
    const canceledCount = Number(canceledSubs?.count ?? 0);
    const churnRate =
        activeCount + canceledCount > 0 ? Math.round((canceledCount / (activeCount + canceledCount)) * 1000) / 10 : 0;

    return json({
        totalRevenue: Number(totalRev?.total ?? 0),
        monthlyRevenue: Number(thisMonth?.total ?? 0),
        revenueLastMonth: Number(lastMonth?.total ?? 0),
        activeSubscriptions: activeCount,
        totalCustomers: Number(customers?.count ?? 0),
        churnRate,
    });
});
