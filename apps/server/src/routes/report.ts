// API Reports — ringkasan performa, export CSV, jadwal laporan email berkala,
// shareable report link (M10b)

import { randomBytes } from "node:crypto";
import { buildReportCsv, db, getReportData } from "@sahabatkreator/db";
import { reportSchedule, reportShare, socialAccount } from "@sahabatkreator/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { errorResponse, HTTPError, requireOrg } from "../lib/auth-guard";
import { generateId } from "../lib/id";

export const reportRoute = new Hono();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD");

function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - 29 * 86400000).toISOString().slice(0, 10);
  return { from, to };
}

/** GET /reports/summary?from=&to= — data ringkasan laporan */
reportRoute.get("/summary", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const query = c.req.query();
    const fallback = defaultRange();
    const from = isoDate.catch(fallback.from).parse(query.from ?? fallback.from);
    const to = isoDate.catch(fallback.to).parse(query.to ?? fallback.to);
    const data = await getReportData(ctx.organization.id, from, to);
    return c.json({ report: data });
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /reports/export?from=&to= — CSV laporan (dipakai client untuk download) */
reportRoute.get("/export", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const query = c.req.query();
    const fallback = defaultRange();
    const from = isoDate.catch(fallback.from).parse(query.from ?? fallback.from);
    const to = isoDate.catch(fallback.to).parse(query.to ?? fallback.to);
    const data = await getReportData(ctx.organization.id, from, to);
    const csv = buildReportCsv(data);
    return c.json({
      csv,
      filename: `laporan-${data.organizationName.toLowerCase().replace(/\s+/g, "-")}-${from}-${to}.csv`,
    });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------------------------------------------------------------------------
// Jadwal laporan email berkala
// ---------------------------------------------------------------------------

const scheduleSchema = z.object({
  email: z.string().email().max(200),
  frequency: z.enum(["weekly", "monthly"]),
  sendDay: z.number().int().min(0).max(31),
  sendHour: z.number().int().min(0).max(23).default(8),
});

/** GET /reports/schedules */
reportRoute.get("/schedules", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const rows = await db
      .select()
      .from(reportSchedule)
      .where(eq(reportSchedule.organizationId, ctx.organization.id))
      .orderBy(desc(reportSchedule.createdAt));
    return c.json({ schedules: rows });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /reports/schedules — buat jadwal (max 5 per org) */
reportRoute.post("/schedules", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = scheduleSchema.parse(await c.req.json());

    // Validasi hari: weekly 0-6, monthly 1-28
    if (input.frequency === "weekly" && input.sendDay > 6) {
      return c.json({ message: "Hari mingguan 0-6 (Minggu=0)" }, 400);
    }
    if (input.frequency === "monthly" && (input.sendDay < 1 || input.sendDay > 28)) {
      return c.json({ message: "Tanggal bulanan 1-28" }, 400);
    }

    const existing = await db
      .select({ id: reportSchedule.id })
      .from(reportSchedule)
      .where(eq(reportSchedule.organizationId, ctx.organization.id));
    if (existing.length >= 5) {
      return c.json({ message: "Maksimal 5 jadwal laporan" }, 400);
    }

    const [row] = await db
      .insert(reportSchedule)
      .values({
        id: generateId("rpt"),
        organizationId: ctx.organization.id,
        email: input.email,
        frequency: input.frequency,
        sendDay: input.sendDay,
        sendHour: input.sendHour,
      })
      .returning();
    return c.json({ schedule: row }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/** PATCH /reports/schedules/:id — toggle aktif */
reportRoute.patch("/schedules/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = z.object({ isActive: z.boolean() }).parse(await c.req.json());
    const [row] = await db
      .update(reportSchedule)
      .set({ isActive: input.isActive })
      .where(
        and(
          eq(reportSchedule.id, c.req.param("id")),
          eq(reportSchedule.organizationId, ctx.organization.id),
        ),
      )
      .returning();
    if (!row) return c.json({ message: "Jadwal tidak ditemukan" }, 404);
    return c.json({ schedule: row });
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /reports/schedules/:id */
reportRoute.delete("/schedules/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const rows = await db
      .delete(reportSchedule)
      .where(
        and(
          eq(reportSchedule.id, c.req.param("id")),
          eq(reportSchedule.organizationId, ctx.organization.id),
        ),
      )
      .returning({ id: reportSchedule.id });
    if (rows.length === 0) return c.json({ message: "Jadwal tidak ditemukan" }, 404);
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------------------------------------------------------------------------
// Shareable report link (M10b) — link publik read-only via token
// ---------------------------------------------------------------------------

const SHARE_TOKEN_TTL_DAYS = 30;

const createShareSchema = z.object({
  title: z.string().trim().min(1).max(120),
  days: z.union([z.literal(7), z.literal(30), z.literal(90)]),
  accountId: z.string().nullable().optional(),
});

/** Token url-safe 32 char (crypto random — tidak bisa ditebak) */
function generateShareToken(): string {
  // 24 random bytes → base64url 32 char (tanpa padding)
  return randomBytes(24).toString("base64url").slice(0, 32);
}

/**
 * POST /reports/share — buat link laporan publik baru.
 * Body: { title, days: 7|30|90, accountId? }
 */
reportRoute.post("/share", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = createShareSchema.parse(await c.req.json());

    // Validasi akun (bila diisi) milik org
    if (input.accountId) {
      const [account] = await db
        .select({ id: socialAccount.id })
        .from(socialAccount)
        .where(
          and(
            eq(socialAccount.id, input.accountId),
            eq(socialAccount.organizationId, ctx.organization.id),
          ),
        )
        .limit(1);
      if (!account) throw new HTTPError(400, "Akun tidak ditemukan di organisasi ini");
    }

    // Maksimal 20 link aktif per org (cegah spam link)
    const active = await db
      .select({ id: reportShare.id })
      .from(reportShare)
      .where(eq(reportShare.organizationId, ctx.organization.id));
    if (active.length >= 20) {
      throw new HTTPError(400, "Maksimal 20 link laporan aktif per organisasi");
    }

    const expiresAt = new Date(Date.now() + SHARE_TOKEN_TTL_DAYS * 86400000);

    // Token unik — retry bila bentrok (probabilitas sangat kecil)
    let token = generateShareToken();
    for (let attempt = 0; attempt < 3; attempt++) {
      const [dup] = await db
        .select({ id: reportShare.id })
        .from(reportShare)
        .where(eq(reportShare.token, token))
        .limit(1);
      if (!dup) break;
      token = generateShareToken();
    }

    const [row] = await db
      .insert(reportShare)
      .values({
        id: generateId("rptshare"),
        organizationId: ctx.organization.id,
        token,
        title: input.title,
        days: input.days,
        accountId: input.accountId ?? null,
        createdByUserId: ctx.user.id,
        expiresAt,
      })
      .returning();

    return c.json({ share: row }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /reports/share — list link share milik org */
reportRoute.get("/share", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const rows = await db
      .select()
      .from(reportShare)
      .where(eq(reportShare.organizationId, ctx.organization.id))
      .orderBy(desc(reportShare.createdAt));
    return c.json({ shares: rows });
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /reports/share/:id — revoke link (org-scoped) */
reportRoute.delete("/share/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const rows = await db
      .delete(reportShare)
      .where(
        and(
          eq(reportShare.id, c.req.param("id")),
          eq(reportShare.organizationId, ctx.organization.id),
        ),
      )
      .returning({ id: reportShare.id });
    if (rows.length === 0) return c.json({ message: "Link tidak ditemukan" }, 404);
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/**
 * GET /reports/share/:token — PUBLIK (tanpa auth).
 * Validasi token + belum expired/revoked → return ringkasan analytics
 * read-only (followers, posts, engagement, reach + username akun).
 * Query mengikuti pola /analytics/overview (snapshot terbaru per post/akun).
 * TANPA data sensitif (token akun, email, dsb — username saja boleh).
 */
reportRoute.get("/share/:token", async (c) => {
  try {
    const token = c.req.param("token");

    const [share] = await db
      .select({
        organizationId: reportShare.organizationId,
        title: reportShare.title,
        days: reportShare.days,
        accountId: reportShare.accountId,
        expiresAt: reportShare.expiresAt,
        revokedAt: reportShare.revokedAt,
      })
      .from(reportShare)
      .where(eq(reportShare.token, token))
      .limit(1);

    if (!share) throw new HTTPError(404, "Laporan tidak ditemukan");
    if (share.revokedAt) throw new HTTPError(410, "Link laporan sudah dicabut");
    if (share.expiresAt < new Date()) {
      throw new HTTPError(410, "Link laporan sudah kedaluwarsa");
    }

    // Rentang data: N hari terakhir (sampai hari ini)
    const to = new Date();
    const from = new Date(to.getTime() - (share.days - 1) * 86400000);
    const orgId = share.organizationId;
    const accountFilter = share.accountId
      ? sql` and pa.social_account_id = ${share.accountId}`
      : sql``;

    // Totals post (pola sumPostTotals /analytics/overview — snapshot terbaru per post)
    const totalsRes = await db.execute(
      sql`select
            coalesce(sum(pa.likes), 0)::int as likes,
            coalesce(sum(pa.comments), 0)::int as comments,
            coalesce(sum(pa.shares), 0)::int as shares,
            coalesce(sum(pa.views), 0)::bigint as views,
            coalesce(sum(pa.impressions), 0)::bigint as impressions,
            count(*)::int as posts
          from (
            select distinct on (pa.post_id) pa.*
            from post_analytics pa
            join post p on p.id = pa.post_id
            where pa.organization_id = ${orgId}
              and p.published_at >= ${from.toISOString()}
              and p.published_at <= ${to.toISOString()}${accountFilter}
            order by pa.post_id, pa.date desc
          ) pa`,
    );
    const totalsRow = (totalsRes.rows[0] ?? {}) as Record<string, string | number>;

    // Followers terbaru per akun (pola followersAt — snapshot terbaru per akun)
    const followersRes = await db.execute(
      sql`select sa.username, sa.platform, latest.followers
          from social_account sa
          join lateral (
            select aa.followers
            from account_analytics aa
            where aa.social_account_id = sa.id
              and aa.organization_id = ${orgId}
            order by aa.date desc
            limit 1
          ) latest on true
          where sa.organization_id = ${orgId}${
            share.accountId ? sql` and sa.id = ${share.accountId}` : sql``
          }`,
    );

    const accounts = (followersRes.rows as Record<string, unknown>[]).map((r) => ({
      username: String(r.username ?? ""),
      platform: String(r.platform ?? ""),
      followers: Number(r.followers ?? 0),
    }));
    const totalFollowers = accounts.reduce((sum, a) => sum + a.followers, 0);

    // Username akun ter-scope bila ada (username boleh ditampilkan — bukan sensitif)
    let accountUsername: string | null = null;
    if (share.accountId) {
      const [account] = await db
        .select({ username: socialAccount.username })
        .from(socialAccount)
        .where(eq(socialAccount.id, share.accountId))
        .limit(1);
      accountUsername = account?.username ?? null;
    }

    return c.json({
      title: share.title,
      days: share.days,
      accountUsername,
      generatedAt: new Date().toISOString(),
      range: {
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
      },
      data: {
        followers: totalFollowers,
        posts: Number(totalsRow.posts ?? 0),
        engagement:
          Number(totalsRow.likes ?? 0) +
          Number(totalsRow.comments ?? 0) +
          Number(totalsRow.shares ?? 0),
        impressions: Number(totalsRow.impressions ?? 0),
        views: Number(totalsRow.views ?? 0),
        accounts,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
