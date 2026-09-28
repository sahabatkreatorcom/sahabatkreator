// API Status — health platform + infra (dipakai halaman /status user)

import { db } from "@sahabatkreator/db";
import { socialAccount } from "@sahabatkreator/db/schema";
import { checkDbHealth, getPlatformHealth, overallStatus } from "@sahabatkreator/publishing";
import { count, eq } from "drizzle-orm";
import { Hono } from "hono";
import { errorResponse, requireOrg } from "../lib/auth-guard";

export const statusRoute = new Hono();

/** GET /status — status kesehatan platform sosmed + DB + akun terhubung org aktif */
statusRoute.get("/", async (c) => {
  try {
    const ctx = await requireOrg(c);

    const [platforms, dbHealth] = await Promise.all([getPlatformHealth(), checkDbHealth()]);

    // Jumlah akun terhubung org aktif per platform (context org, bukan global)
    const accountRows = await db
      .select({
        platform: socialAccount.platform,
        total: count(),
      })
      .from(socialAccount)
      .where(eq(socialAccount.organizationId, ctx.organization.id))
      .groupBy(socialAccount.platform);
    const accountCount = new Map<string, number>(
      accountRows.map((r) => [String(r.platform), Number(r.total)]),
    );

    return c.json({
      overall: overallStatus(platforms),
      platforms: platforms.map((p) => ({
        ...p,
        connectedAccounts: accountCount.get(p.platform) ?? 0,
      })),
      database: dbHealth,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return errorResponse(error);
  }
});
