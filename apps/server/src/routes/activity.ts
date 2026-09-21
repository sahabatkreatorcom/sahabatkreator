// API Activity — activity feed organisasi aktif (dipakai halaman /activity)

import { db } from "@sahabatkreator/db";
import { activityLog, user as userTable } from "@sahabatkreator/db/schema";
import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { Hono } from "hono";
import { errorResponse, requireOrg } from "../lib/auth-guard";

export const activityRoute = new Hono();

/** Filter kategori aksi berdasarkan prefix action (dot-notation) */
const CATEGORY_PREFIXES: Record<string, string[]> = {
  post: ["post."],
  media: ["media."],
  account: ["account."],
  automation: ["automation."],
  team: ["member.", "invitation.", "team."],
  billing: ["plan.", "payment.", "subscription."],
};

/** GET /activity — feed aktivitas org aktif.
 * Query: page (paginasi 30/halaman), type (filter kategori: post|media|account|automation|team|billing),
 * q (pencarian nama user / action). */
activityRoute.get("/", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const page = Math.max(Number(c.req.query("page") ?? 1), 1);
    const perPage = 30;
    const type = c.req.query("type") ?? "";
    const q = c.req.query("q")?.trim() ?? "";

    const conditions = [eq(activityLog.organizationId, ctx.organization.id)];
    if (type && CATEGORY_PREFIXES[type]) {
      const prefixes = CATEGORY_PREFIXES[type]!;
      const prefixMatches = prefixes.map((p) => ilike(activityLog.action, `${p}%`));
      conditions.push(or(...prefixMatches)!);
    }
    if (q) {
      const like = `%${q}%`;
      conditions.push(or(ilike(userTable.name, like), ilike(activityLog.action, like))!);
    }
    const where = and(...conditions);

    const logs = await db
      .select({
        id: activityLog.id,
        userId: activityLog.userId,
        userName: userTable.name,
        userImage: userTable.image,
        action: activityLog.action,
        targetType: activityLog.targetType,
        targetId: activityLog.targetId,
        metadata: activityLog.metadata,
        createdAt: activityLog.createdAt,
      })
      .from(activityLog)
      .leftJoin(userTable, eq(activityLog.userId, userTable.id))
      .where(where)
      .orderBy(desc(activityLog.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage);

    const [total] = await db
      .select({ total: count() })
      .from(activityLog)
      .leftJoin(userTable, eq(activityLog.userId, userTable.id))
      .where(where);

    return c.json({
      activities: logs,
      total: total?.total ?? 0,
      page,
      perPage,
      hasMore: page * perPage < (total?.total ?? 0),
    });
  } catch (error) {
    return errorResponse(error);
  }
});
