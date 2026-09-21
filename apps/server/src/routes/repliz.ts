// API Repliz bridge — endpoint domain yang dijalankan Repliz (bukan platform native):
// automation + template, report eksekusi, research Threads, add-on (produk Shopee,
// musik TikTok, link metadata), serta list schedule bridge.
//
// Semua endpoint di-scope per organisasi: akun bridge milik org aktif saja yang
// boleh dipakai (cek metadata.replizAccountId di social_account org).

import { db } from "@sahabatkreator/db";
import { socialAccount } from "@sahabatkreator/db/schema";
import {
  replizActiveCredentials,
  replizCountAccounts,
  replizCreateAutomation,
  replizCreateTemplate,
  replizGetOneAutomation,
  replizGetOneReport,
  replizGetOneTemplate,
  replizGetLinkMetadata,
  replizListAutomations,
  replizListReports,
  replizListShopeeProducts,
  replizListSchedules,
  replizListTemplates,
  replizListTiktokMusic,
  replizRemoveAutomation,
  replizRemoveTemplate,
  replizRetryReport,
  replizSearchThreadsContent,
  replizSearchThreadsUser,
  replizListThreadsUserContent,
  replizUpdateAutomation,
  replizUpdateTemplate,
  type ReplizAutomationConfig,
  type ReplizReportStatus,
  type ReplizReportType,
  type ReplizScheduleStatus,
  type ReplizTiktokMusicDateRange,
  type ReplizTiktokMusicGenre,
} from "@sahabatkreator/publishing";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { errorResponse, requireOrg } from "../lib/auth-guard";
import { checkFeatureGate } from "../lib/billing";

export const replizRoute = new Hono();

/** Ambil replizAccountId milik org untuk platform account tertentu (org-scoped). */
async function orgBridgeAccount(
  orgId: string,
  socialAccountId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ metadata: socialAccount.metadata })
    .from(socialAccount)
    .where(
      and(
        eq(socialAccount.id, socialAccountId),
        eq(socialAccount.organizationId, orgId),
      ),
    )
    .limit(1);
  const meta = row?.metadata as { replizAccountId?: string } | null;
  return meta?.replizAccountId ?? null;
}

/** Ambil replizAccountId akun Threads pertama milik org (untuk research). */
async function orgThreadsAccount(orgId: string): Promise<string | null> {
  const rows = await db
    .select({ metadata: socialAccount.metadata, platform: socialAccount.platform })
    .from(socialAccount)
    .where(eq(socialAccount.organizationId, orgId));
  const threads = rows.find(
    (r) => r.platform === "threads" && (r.metadata as { replizAccountId?: string } | null)?.replizAccountId,
  );
  return threads ? String((threads.metadata as { replizAccountId: string }).replizAccountId) : null;
}

// ---------- Automation (per post) ----------

const automationConfigSchema: z.ZodType<ReplizAutomationConfig> = z.lazy(() =>
  z.object({
    delete: z.object({
      isActive: z.boolean(),
      type: z.enum(["keyword", "ai"]),
      keywords: z.array(z.string()),
      prompt: z.string(),
    }),
    reply: z.object({
      isActive: z.boolean(),
      type: z.enum(["text", "keyword", "ai"]),
      text: z.string(),
      prompt: z.string(),
      isIncludeContentContext: z.boolean(),
      keyword: z.object({
        isExactMatch: z.boolean(),
        values: z.array(z.object({ keyword: z.string(), text: z.string() })),
      }),
      condition: z.object({ isActive: z.boolean(), isExactMatch: z.boolean(), keywords: z.array(z.string()) }),
      exception: z.object({ isActive: z.boolean(), isExactMatch: z.boolean(), keywords: z.array(z.string()) }),
      delay: z.object({ isActive: z.boolean(), value: z.number(), type: z.literal("second") }),
    }),
    like: z.object({ isActive: z.boolean() }),
    message: z.object({
      isActive: z.boolean(),
      type: z.enum(["text", "keyword", "ai", "opening"]),
      text: z.string(),
      prompt: z.string(),
      opening: z.object({}).passthrough().optional(),
      keyword: z.object({
        isExactMatch: z.boolean(),
        values: z.array(z.object({ keyword: z.string(), text: z.string() })),
      }),
      condition: z.object({ isActive: z.boolean(), isExactMatch: z.boolean(), keywords: z.array(z.string()) }),
      delay: z.object({ isActive: z.boolean(), value: z.number(), type: z.literal("second") }),
    }),
    story: z.object({
      isActive: z.boolean(),
      type: z.enum(["text", "keyword", "ai", "opening"]),
      text: z.string(),
      prompt: z.string(),
      opening: z.object({}).passthrough().optional(),
      keyword: z.object({
        isExactMatch: z.boolean(),
        values: z.array(z.object({ keyword: z.string(), text: z.string() })),
      }),
      condition: z.object({ isActive: z.boolean(), isExactMatch: z.boolean(), keywords: z.array(z.string()) }),
      delay: z.object({ isActive: z.boolean(), value: z.number(), type: z.literal("second") }),
    }),
    chat: z.object({
      isActive: z.boolean(),
      type: z.enum(["text", "keyword", "ai"]),
      text: z.string(),
      prompt: z.string(),
      keyword: z.object({
        isExactMatch: z.boolean(),
        values: z.array(z.object({ keyword: z.string(), text: z.string() })),
      }),
      delay: z.object({ isActive: z.boolean(), value: z.number(), type: z.literal("second") }),
    }),
  }),
) as z.ZodType<ReplizAutomationConfig>;

/** GET /repliz/automation — list automation workspace (filter akun org) */
replizRoute.get("/automation", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const cred = await replizActiveCredentials();
    if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);

    const accountId = c.req.query("accountId")
      ? await orgBridgeAccount(ctx.organization.id, c.req.query("accountId") as string)
      : null;
    const result = await replizListAutomations(cred, {
      page: Number(c.req.query("page") ?? 1),
      limit: Number(c.req.query("limit") ?? 20),
      ...(accountId ? { accountId } : {}),
      ...(c.req.query("search") ? { search: c.req.query("search") as string } : {}),
    });
    return c.json(result);
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /repliz/automation/:id — detail satu automation */
replizRoute.get("/automation/:id", async (c) => {
  try {
    await requireOrg(c);
    const cred = await replizActiveCredentials();
    if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);
    const data = await replizGetOneAutomation(cred, c.req.param("id"));
    if (!data) return c.json({ message: "Automation tidak ditemukan" }, 404);
    return c.json(data);
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /repliz/automation — buat automation untuk satu post */
replizRoute.post("/automation", async (c) => {
  try {
    const ctx = await requireOrg(c);
    await checkFeatureGate(ctx.organization.id, "scheduled_posts");
    const cred = await replizActiveCredentials();
    if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);

    const input = z
      .object({
        socialAccountId: z.string().min(1),
        contentId: z.string().min(1),
        config: automationConfigSchema,
      })
      .parse(await c.req.json());
    const accountId = await orgBridgeAccount(ctx.organization.id, input.socialAccountId);
    if (!accountId) return c.json({ message: "Akun ini tidak terhubung via bridge" }, 400);

    const automationId = await replizCreateAutomation(cred, {
      contentId: input.contentId,
      accountId,
      config: input.config,
    });
    return c.json({ automationId }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/** PUT /repliz/automation/:id — update config automation */
replizRoute.put("/automation/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    await checkFeatureGate(ctx.organization.id, "scheduled_posts");
    const cred = await replizActiveCredentials();
    if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);
    const input = z.object({ config: automationConfigSchema }).parse(await c.req.json());
    await replizUpdateAutomation(cred, c.req.param("id"), input.config);
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /repliz/automation/:id — hapus automation */
replizRoute.delete("/automation/:id", async (c) => {
  try {
    await requireOrg(c);
    const cred = await replizActiveCredentials();
    if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);
    await replizRemoveAutomation(cred, c.req.param("id"));
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------- Automation Template ----------

/** GET /repliz/templates — list template reusable */
replizRoute.get("/templates", async (c) => {
  try {
    await requireOrg(c);
    const cred = await replizActiveCredentials();
    if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);
    const result = await replizListTemplates(cred, {
      page: Number(c.req.query("page") ?? 1),
      limit: Number(c.req.query("limit") ?? 20),
      ...(c.req.query("search") ? { search: c.req.query("search") as string } : {}),
    });
    return c.json(result);
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /repliz/templates/:id — detail satu template */
replizRoute.get("/templates/:id", async (c) => {
  try {
    await requireOrg(c);
    const cred = await replizActiveCredentials();
    if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);
    const data = await replizGetOneTemplate(cred, c.req.param("id"));
    if (!data) return c.json({ message: "Template tidak ditemukan" }, 404);
    return c.json(data);
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /repliz/templates — buat template reusable */
replizRoute.post("/templates", async (c) => {
  try {
    const ctx = await requireOrg(c);
    await checkFeatureGate(ctx.organization.id, "scheduled_posts");
    const cred = await replizActiveCredentials();
    if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);
    const input = z
      .object({ name: z.string().min(1).max(200), config: automationConfigSchema })
      .parse(await c.req.json());
    const templateId = await replizCreateTemplate(cred, input);
    return c.json({ templateId }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/** PUT /repliz/templates/:id — update template */
replizRoute.put("/templates/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    await checkFeatureGate(ctx.organization.id, "scheduled_posts");
    const cred = await replizActiveCredentials();
    if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);
    const input = z
      .object({ name: z.string().min(1).max(200), config: automationConfigSchema })
      .parse(await c.req.json());
    await replizUpdateTemplate(cred, c.req.param("id"), input);
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /repliz/templates/:id — hapus template */
replizRoute.delete("/templates/:id", async (c) => {
  try {
    await requireOrg(c);
    const cred = await replizActiveCredentials();
    if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);
    await replizRemoveTemplate(cred, c.req.param("id"));
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------- Report eksekusi automation ----------

/** GET /repliz/reports — list report (filter type/status/akun org) */
replizRoute.get("/reports", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const cred = await replizActiveCredentials();
    if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);

    const accountId = c.req.query("accountId")
      ? await orgBridgeAccount(ctx.organization.id, c.req.query("accountId") as string)
      : null;
    const result = await replizListReports(cred, {
      page: Number(c.req.query("page") ?? 1),
      limit: Number(c.req.query("limit") ?? 20),
      ...(c.req.query("type") ? { type: c.req.query("type") as ReplizReportType } : {}),
      ...(c.req.query("status") ? { status: c.req.query("status") as ReplizReportStatus } : {}),
      ...(accountId ? { accountId } : {}),
      ...(c.req.query("search") ? { search: c.req.query("search") as string } : {}),
    });
    return c.json(result);
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /repliz/reports/:id — detail satu report */
replizRoute.get("/reports/:id", async (c) => {
  try {
    await requireOrg(c);
    const cred = await replizActiveCredentials();
    if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);
    const data = await replizGetOneReport(cred, c.req.param("id"));
    if (!data) return c.json({ message: "Report tidak ditemukan" }, 404);
    return c.json(data);
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /repliz/reports/:id/retry — jalankan ulang report gagal */
replizRoute.post("/reports/:id/retry", async (c) => {
  try {
    await requireOrg(c);
    const cred = await replizActiveCredentials();
    if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);
    await replizRetryReport(cred, c.req.param("id"));
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------- Research Threads ----------

/** GET /repliz/research/threads/user — cari user Threads by username */
replizRoute.get("/research/threads/user", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const cred = await replizActiveCredentials();
    if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);
    const accountId = await orgThreadsAccount(ctx.organization.id);
    if (!accountId) return c.json({ message: "Belum ada akun Threads terhubung via bridge" }, 400);

    const username = c.req.query("username");
    if (!username) return c.json({ message: "Username wajib diisi" }, 400);
    const data = await replizSearchThreadsUser(cred, accountId, username);
    if (!data) return c.json({ message: "User tidak ditemukan" }, 404);
    return c.json(data);
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /repliz/research/threads/content — cari konten Threads by keyword */
replizRoute.get("/research/threads/content", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const cred = await replizActiveCredentials();
    if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);
    const accountId = await orgThreadsAccount(ctx.organization.id);
    if (!accountId) return c.json({ message: "Belum ada akun Threads terhubung via bridge" }, 400);

    const search = c.req.query("search");
    if (!search) return c.json({ message: "Kata kunci wajib diisi" }, 400);
    const result = await replizSearchThreadsContent(cred, accountId, {
      search,
      ...(c.req.query("sort") ? { sort: c.req.query("sort") as "TOP" | "RECENT" } : {}),
      ...(c.req.query("mode") ? { mode: c.req.query("mode") as "KEYWORD" | "TAG" } : {}),
      ...(c.req.query("type") ? { type: c.req.query("type") as "TEXT" | "IMAGE" | "VIDEO" } : {}),
      ...(c.req.query("since") ? { since: Number(c.req.query("since")) } : {}),
      ...(c.req.query("until") ? { until: Number(c.req.query("until")) } : {}),
      ...(c.req.query("username") ? { username: c.req.query("username") as string } : {}),
      ...(c.req.query("nextToken") ? { nextToken: c.req.query("nextToken") as string } : {}),
    });
    return c.json(result);
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /repliz/research/threads/content/user — konten Threads dari satu user */
replizRoute.get("/research/threads/content/user", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const cred = await replizActiveCredentials();
    if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);
    const accountId = await orgThreadsAccount(ctx.organization.id);
    if (!accountId) return c.json({ message: "Belum ada akun Threads terhubung via bridge" }, 400);

    const username = c.req.query("username");
    if (!username) return c.json({ message: "Username wajib diisi" }, 400);
    const result = await replizListThreadsUserContent(
      cred,
      accountId,
      username,
      c.req.query("nextToken") ?? undefined,
    );
    return c.json(result);
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------- Add-on ----------

/** GET /repliz/shopee/products — produk akun Shopee seller (org-scoped) */
replizRoute.get("/shopee/products", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const cred = await replizActiveCredentials();
    if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);
    const accountId = await orgBridgeAccount(ctx.organization.id, c.req.query("accountId") as string);
    if (!accountId) return c.json({ message: "Akun Shopee tidak terhubung via bridge" }, 400);
    const result = await replizListShopeeProducts(
      cred,
      accountId,
      c.req.query("nextToken") ?? undefined,
    );
    return c.json(result);
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /repliz/tiktok/music — musik trending TikTok */
replizRoute.get("/tiktok/music", async (c) => {
  try {
    await requireOrg(c);
    const cred = await replizActiveCredentials();
    if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);
    const data = await replizListTiktokMusic(cred, {
      genre: (c.req.query("genre") ?? "ALL") as ReplizTiktokMusicGenre,
      countryCode: (c.req.query("countryCode") ?? "ID") as string,
      dateRange: (c.req.query("dateRange") ?? "7DAY") as ReplizTiktokMusicDateRange,
    });
    return c.json({ docs: data });
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /repliz/link-metadata — preview Open Graph sebuah URL */
replizRoute.get("/link-metadata", async (c) => {
  try {
    await requireOrg(c);
    const cred = await replizActiveCredentials();
    if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);
    const url = c.req.query("url");
    if (!url) return c.json({ message: "URL wajib diisi" }, 400);
    const data = await replizGetLinkMetadata(cred, url);
    return c.json(data ?? { url });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------- Schedule list (bridge) ----------

/** GET /repliz/schedules — list schedule di workspace Repliz (filter status/tanggal) */
replizRoute.get("/schedules", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const cred = await replizActiveCredentials();
    if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);
    const accountId = c.req.query("accountId")
      ? await orgBridgeAccount(ctx.organization.id, c.req.query("accountId") as string)
      : null;
    const result = await replizListSchedules(cred, {
      page: Number(c.req.query("page") ?? 1),
      limit: Number(c.req.query("limit") ?? 20),
      ...(accountId ? { accountId } : {}),
      ...(c.req.query("status") ? { status: c.req.query("status") as ReplizScheduleStatus } : {}),
      ...(c.req.query("fromDate") ? { fromDate: c.req.query("fromDate") as string } : {}),
      ...(c.req.query("toDate") ? { toDate: c.req.query("toDate") as string } : {}),
    });
    return c.json(result);
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /repliz/quota — jumlah akun per platform + batas paket workspace */
replizRoute.get("/quota", async (c) => {
  try {
    await requireOrg(c);
    const cred = await replizActiveCredentials();
    if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);
    return c.json(await replizCountAccounts(cred));
  } catch (error) {
    return errorResponse(error);
  }
});
