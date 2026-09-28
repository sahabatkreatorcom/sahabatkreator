// API Repliz bridge — endpoint domain yang dijalankan Repliz (bukan platform native):
// automation + template, report eksekusi, research Threads, add-on (musik TikTok,
// link metadata), serta list schedule bridge.
//
// Semua endpoint di-scope per organisasi: akun bridge milik org aktif saja yang
// boleh dipakai (cek metadata.replizAccountId di social_account org).
//
// --- CATATAN KEAMANAN (audit 27 Sep 2026) ---
// Kredensial bridge Repliz adalah SATU workspace global (replizActiveCredentials).
// API Repliz getOne/update/delete TIDAK menerima filter org, jadi satu-satunya
// jangkar ownership adalah `accountId` di dokumen upstream. Semua handler `:id`
// WAJIB fetch dulu lalu verifikasi `accountId` milik org — 404 kalau tidak cocok.
// Semua list endpoint WAJIB di-scope ke sekumpulan akun org (accountIds[]); query
// `?accountId` selalu divalidasi kepemilikannya, 404/400 kalau akun asing.
// Template Repliz adalah satu-satunya pengecualian: upstream TIDAK mengembalikan
// accountId (workspace-global) → belum bisa di-org-scope tanpa tabel ownership
// lokal (lihat catatan di section Template).

import { db } from "@sahabatkreator/db";
import { socialAccount } from "@sahabatkreator/db/schema";
import {
  type ReplizAutomation,
  type ReplizAutomationConfig,
  type ReplizReport,
  type ReplizReportStatus,
  type ReplizReportType,
  type ReplizScheduleStatus,
  type ReplizTiktokMusicDateRange,
  type ReplizTiktokMusicGenre,
  replizActiveCredentials,
  replizCountAccounts,
  replizCreateAutomation,
  replizCreateTemplate,
  replizGetLinkMetadata,
  replizGetOneAutomation,
  replizGetOneReport,
  replizGetOneTemplate,
  replizListAutomations,
  replizListReports,
  replizListSchedules,
  replizListTemplates,
  replizListThreadsUserContent,
  replizListTiktokMusic,
  replizRemoveAutomation,
  replizRemoveTemplate,
  replizRetryReport,
  replizSearchThreadsContent,
  replizSearchThreadsUser,
  replizUpdateAutomation,
  replizUpdateTemplate,
} from "@sahabatkreator/publishing";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { errorResponse, requireOrg } from "../lib/auth-guard";
import { checkFeatureGate } from "../lib/billing";

export const replizRoute = new Hono();

/** Ambil replizAccountId milik org untuk platform account tertentu (org-scoped). */
async function orgBridgeAccount(orgId: string, socialAccountId: string): Promise<string | null> {
  const [row] = await db
    .select({ metadata: socialAccount.metadata })
    .from(socialAccount)
    .where(and(eq(socialAccount.id, socialAccountId), eq(socialAccount.organizationId, orgId)))
    .limit(1);
  const meta = row?.metadata as { replizAccountId?: string } | null;
  return meta?.replizAccountId ?? null;
}

/** Semua replizAccountId milik org (org-scoped) — jangkar ownership list & `:id`. */
async function orgBridgeAccountIds(orgId: string): Promise<string[]> {
  const rows = await db
    .select({ metadata: socialAccount.metadata })
    .from(socialAccount)
    .where(eq(socialAccount.organizationId, orgId));
  const ids = rows
    .map((r) => (r.metadata as { replizAccountId?: string } | null)?.replizAccountId)
    .filter((x): x is string => typeof x === "string" && x.length > 0);
  return [...new Set(ids)];
}

/**
 * Ambil automation dan pastikan dimiliki org. Return null bila tidak ada atau
 * **dimiliki org lain** (handler memancarkan 404 yang sama — sengaja tidak
 * membocorkan keberadaan resource asing).
 */
async function requireOwnedAutomation(
  cred: NonNullable<Awaited<ReturnType<typeof replizActiveCredentials>>>,
  orgId: string,
  automationId: string,
): Promise<ReplizAutomation | null> {
  const data = await replizGetOneAutomation(cred, automationId);
  if (!data) return null;
  if (!data.accountId) return null; // tidak ada jangkar ownership → tolak
  const owned = await orgBridgeAccountIds(orgId);
  if (!owned.includes(data.accountId)) return null;
  return data;
}

/** Sama seperti requireOwnedAutomation, untuk report eksekusi. */
async function requireOwnedReport(
  cred: NonNullable<Awaited<ReturnType<typeof replizActiveCredentials>>>,
  orgId: string,
  reportId: string,
): Promise<ReplizReport | null> {
  const data = await replizGetOneReport(cred, reportId);
  if (!data) return null;
  if (!data.accountId) return null;
  const owned = await orgBridgeAccountIds(orgId);
  if (!owned.includes(data.accountId)) return null;
  return data;
}

/** Ambil replizAccountId akun Threads pertama milik org (untuk research). */
async function orgThreadsAccount(orgId: string): Promise<string | null> {
  const rows = await db
    .select({ metadata: socialAccount.metadata, platform: socialAccount.platform })
    .from(socialAccount)
    .where(eq(socialAccount.organizationId, orgId));
  const threads = rows.find(
    (r) =>
      r.platform === "threads" &&
      (r.metadata as { replizAccountId?: string } | null)?.replizAccountId,
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
      condition: z.object({
        isActive: z.boolean(),
        isExactMatch: z.boolean(),
        keywords: z.array(z.string()),
      }),
      exception: z.object({
        isActive: z.boolean(),
        isExactMatch: z.boolean(),
        keywords: z.array(z.string()),
      }),
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
      condition: z.object({
        isActive: z.boolean(),
        isExactMatch: z.boolean(),
        keywords: z.array(z.string()),
      }),
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
      condition: z.object({
        isActive: z.boolean(),
        isExactMatch: z.boolean(),
        keywords: z.array(z.string()),
      }),
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

/** GET /repliz/automation — list automation, di-scope ke akun org */
replizRoute.get("/automation", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const cred = await replizActiveCredentials();
    if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);

    const owned = await orgBridgeAccountIds(ctx.organization.id);
    const requested = c.req.query("accountId");
    if (requested) {
      // Pilih satu akun di dalam org — 404 kalau akun asing (jangan bocorkan).
      const resolved = await orgBridgeAccount(ctx.organization.id, requested);
      if (!resolved) return c.json({ message: "Automation tidak ditemukan" }, 404);
      const result = await replizListAutomations(cred, {
        page: Number(c.req.query("page") ?? 1),
        limit: Number(c.req.query("limit") ?? 20),
        accountId: resolved,
        ...(c.req.query("search") ? { search: c.req.query("search") as string } : {}),
      });
      return c.json(result);
    }
    const result = await replizListAutomations(cred, {
      page: Number(c.req.query("page") ?? 1),
      limit: Number(c.req.query("limit") ?? 20),
      accountIds: owned,
      ...(c.req.query("search") ? { search: c.req.query("search") as string } : {}),
    });
    return c.json(result);
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /repliz/automation/:id — detail satu automation (org-scoped) */
replizRoute.get("/automation/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const cred = await replizActiveCredentials();
    if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);
    const data = await requireOwnedAutomation(cred, ctx.organization.id, c.req.param("id"));
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

/** PUT /repliz/automation/:id — update config automation (org-scoped) */
replizRoute.put("/automation/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    await checkFeatureGate(ctx.organization.id, "scheduled_posts");
    const cred = await replizActiveCredentials();
    if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);
    // Verifikasi ownership SEBELUM mutate — API upstream tidak punya filter org.
    const existing = await requireOwnedAutomation(cred, ctx.organization.id, c.req.param("id"));
    if (!existing) return c.json({ message: "Automation tidak ditemukan" }, 404);
    const input = z.object({ config: automationConfigSchema }).parse(await c.req.json());
    await replizUpdateAutomation(cred, existing._id, input.config);
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /repliz/automation/:id — hapus automation (org-scoped) */
replizRoute.delete("/automation/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const cred = await replizActiveCredentials();
    if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);
    const existing = await requireOwnedAutomation(cred, ctx.organization.id, c.req.param("id"));
    if (!existing) return c.json({ message: "Automation tidak ditemukan" }, 404);
    await replizRemoveAutomation(cred, existing._id);
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------- Automation Template ----------
//
// GAP KEAMANAN DIKETAHUI: template Repliz bersifat workspace-global — upstream
// TIDAK mengembalikan accountId pada getOne/list (hanya userId workspace), jadi
// tidak ada jangkar ownership. Endpoint di bawah belum bisa di-org-scope tanpa
// tabel ownership lokal (repliz_template_id → org_id). Resiko dibatasi: template
// hanya preset config (tidak berisi data customer), dan routing bridge dipilih
// admin per platform. TODO: tambah migrasi + index ownership saat bridge dipakai
// multi-org secara serius.

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

/** GET /repliz/reports — list report, di-scope ke akun org */
replizRoute.get("/reports", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const cred = await replizActiveCredentials();
    if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);

    const owned = await orgBridgeAccountIds(ctx.organization.id);
    const requested = c.req.query("accountId");
    if (requested) {
      const resolved = await orgBridgeAccount(ctx.organization.id, requested);
      if (!resolved) return c.json({ message: "Report tidak ditemukan" }, 404);
      const result = await replizListReports(cred, {
        page: Number(c.req.query("page") ?? 1),
        limit: Number(c.req.query("limit") ?? 20),
        ...(c.req.query("type") ? { type: c.req.query("type") as ReplizReportType } : {}),
        ...(c.req.query("status") ? { status: c.req.query("status") as ReplizReportStatus } : {}),
        accountId: resolved,
        ...(c.req.query("search") ? { search: c.req.query("search") as string } : {}),
      });
      return c.json(result);
    }
    const result = await replizListReports(cred, {
      page: Number(c.req.query("page") ?? 1),
      limit: Number(c.req.query("limit") ?? 20),
      ...(c.req.query("type") ? { type: c.req.query("type") as ReplizReportType } : {}),
      ...(c.req.query("status") ? { status: c.req.query("status") as ReplizReportStatus } : {}),
      accountIds: owned,
      ...(c.req.query("search") ? { search: c.req.query("search") as string } : {}),
    });
    return c.json(result);
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /repliz/reports/:id — detail satu report (org-scoped) */
replizRoute.get("/reports/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const cred = await replizActiveCredentials();
    if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);
    const data = await requireOwnedReport(cred, ctx.organization.id, c.req.param("id"));
    if (!data) return c.json({ message: "Report tidak ditemukan" }, 404);
    return c.json(data);
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /repliz/reports/:id/retry — jalankan ulang report gagal (org-scoped) */
replizRoute.post("/reports/:id/retry", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const cred = await replizActiveCredentials();
    if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);
    const existing = await requireOwnedReport(cred, ctx.organization.id, c.req.param("id"));
    if (!existing) return c.json({ message: "Report tidak ditemukan" }, 404);
    await replizRetryReport(cred, existing._id);
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

/** GET /repliz/schedules — list schedule, di-scope ke akun org */
replizRoute.get("/schedules", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const cred = await replizActiveCredentials();
    if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);

    const owned = await orgBridgeAccountIds(ctx.organization.id);
    const requested = c.req.query("accountId");
    if (requested) {
      const resolved = await orgBridgeAccount(ctx.organization.id, requested);
      if (!resolved) return c.json({ message: "Schedule tidak ditemukan" }, 404);
      const result = await replizListSchedules(cred, {
        page: Number(c.req.query("page") ?? 1),
        limit: Number(c.req.query("limit") ?? 20),
        accountId: resolved,
        ...(c.req.query("status") ? { status: c.req.query("status") as ReplizScheduleStatus } : {}),
        ...(c.req.query("fromDate") ? { fromDate: c.req.query("fromDate") as string } : {}),
        ...(c.req.query("toDate") ? { toDate: c.req.query("toDate") as string } : {}),
      });
      return c.json(result);
    }
    const result = await replizListSchedules(cred, {
      page: Number(c.req.query("page") ?? 1),
      limit: Number(c.req.query("limit") ?? 20),
      accountIds: owned,
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
