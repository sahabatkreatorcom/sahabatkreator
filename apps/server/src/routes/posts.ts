// API Posts — CRUD post group multi-platform + schedule

import { db } from "@sahabatkreator/db";
import {
  media as mediaTable,
  post,
  postGroup,
  postMedia,
  product,
  productTag,
  socialAccount,
} from "@sahabatkreator/db/schema";
import {
  replizActiveCredentials,
  replizRemoveSchedule,
  syncWorkspaceAnalytics,
  syncWorkspacePosts,
} from "@sahabatkreator/publishing";
import {
  cancelPostReminder,
  cancelPublishJob,
  emitWebhookEvent,
  enqueuePublish,
} from "@sahabatkreator/queue";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { fireActivity } from "../lib/activity-log";
import { assertPermission, errorResponse, requirePermission } from "../lib/auth-guard";
import { checkFeatureGate } from "../lib/billing";
import { generateId } from "../lib/id";

import { postsBridgeRoute } from "./posts-bridge";

export const postsRoute = new Hono();

import { z } from "zod";

const platformSettingsSchema = z.record(z.string(), z.unknown());

export const createPostSchema = z.object({
  // `.nullable()` WAJIB: web app mengirim `null` eksplisit untuk "tidak ada nilai"
  // (audioTrackId: soundTrack?.id ?? null, scheduledAt: null saat mode draft).
  // Tanpa nullable, Zod menolak dengan "expected string, received null" sehingga
  // SEMUA publish/draft gagal di validasi — sebelum platform mana pun dipanggil.
  // Public API (CreatePostSchema) sudah nullable sejak awal; schema ini tertinggal.
  scheduledAt: z.string().nullable().optional(),
  timezone: z.string().optional(),
  audioTrackId: z.string().nullable().optional(),
  content: z.string().optional(),
  productIds: z.array(z.string()).default([]),
  items: z.array(
    // Contract sama dengan CreatePostItemSchema di packages/api (public API):
    // content/hashtags/firstComment — bukan "text". Klien web & API publik
    // keduanya memakai nama ini; schema lama "text" menyebabkan request
    // valid ditolak (strip unknown + "text required").
    z.object({
      socialAccountId: z.string(),
      mediaIds: z.array(z.string()).default([]),
      content: z.string().optional(),
      hashtags: z.array(z.string()).default([]),
      firstComment: z.string().nullable().optional(),
      platformSettings: platformSettingsSchema.optional(),
    }),
  ),
});

/** GET /posts — list post groups org (filter: from, to, status, page/perPage).
 * Pagination di level SQL (pola /dm) — grouping post per group tetap di JS
 * tapi hanya atas data halaman yang diminta. */
postsRoute.get("/", async (c) => {
  try {
    const ctx = await requirePermission(c, "posts.view");
    const from = c.req.query("from");
    const to = c.req.query("to");
    // Filter berdasarkan status post per-akun (mis. ?status=scheduled) —
    // dipakai compose untuk deteksi konflik jadwal secara ringan.
    const status = c.req.query("status");
    // Termasuk post eksternal (dipublikasikan langsung di platform) — dipakai
    // kalender agar konten di luar Sahabat Kreator tetap tampil. Queue/compose
    // tidak memakai flag ini sehingga post eksternal tidak tercampur.
    const includeExternal = c.req.query("includeExternal") === "1";
    // Pagination (opsional, kompatibel dengan pemanggil lama tanpa param)
    const page = Math.max(Number(c.req.query("page") ?? 1) || 1, 1);
    const perPage = Math.min(Math.max(Number(c.req.query("perPage") ?? 50) || 50, 1), 100);

    const conditions = [eq(postGroup.organizationId, ctx.organization.id)];
    if (from) conditions.push(gte(postGroup.scheduledAt, new Date(from)));
    if (to) conditions.push(lte(postGroup.scheduledAt, new Date(to)));

    const groups = await db
      .select()
      .from(postGroup)
      .where(and(...conditions))
      .orderBy(desc(postGroup.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage);

    if (groups.length === 0) return c.json({ groups: [], page, perPage });

    const groupIds = groups.map((g) => g.id);
    // Filter status di SQL (bukan in-memory) — hanya ambil post berstatus tsb
    const postConditions = [inArray(post.postGroupId, groupIds)];
    if (status) postConditions.push(eq(post.status, status as "scheduled"));

    const posts = await db
      .select({
        id: post.id,
        postGroupId: post.postGroupId,
        socialAccountId: post.socialAccountId,
        platform: post.platform,
        status: post.status,
        content: post.content,
        platformPostId: post.platformPostId,
        platformPostUrl: post.platformPostUrl,
        publishedAt: post.publishedAt,
        errorCode: post.errorCode,
        errorMessage: post.errorMessage,
        hashtags: post.hashtags,
        firstComment: post.firstComment,
        username: socialAccount.username,
        displayName: socialAccount.displayName,
        avatarUrl: socialAccount.avatarUrl,
        // Flag routing: post ini dipublikasi via bridge Repliz (bukan API native).
        // UI memakainya untuk menampilkan aksi khusus bridge (retry, hapus di platform).
        isBridge: sql<boolean>`(${socialAccount.metadata}->>'replizAccountId') IS NOT NULL`,
      })
      .from(post)
      .innerJoin(socialAccount, eq(post.socialAccountId, socialAccount.id))
      .where(and(...postConditions))
      .orderBy(post.createdAt);

    // Group yang punya post berstatus tsb saja (filter status tetap diterapkan,
    // tapi hanya atas halaman ini — bukan seluruh group org)
    let visibleGroups = groups;
    if (status) {
      const matchedGroupIds = new Set(posts.map((p) => p.postGroupId));
      visibleGroups = groups.filter((g) => matchedGroupIds.has(g.id));
    }

    // Index post per group sekali (O(N)) — tidak filter() per group (O(N×M)).
    // Post tanpa group (postGroupId null, mis. data legacy) dilewati — sama
    // seperti perilaku filter lama yang tidak pernah cocok dengan group apapun.
    const postsByGroup = new Map<string, typeof posts>();
    for (const p of posts) {
      if (p.postGroupId === null) continue;
      const list = postsByGroup.get(p.postGroupId) ?? [];
      list.push(p);
      postsByGroup.set(p.postGroupId, list);
    }

    // Post eksternal → virtual group 1:1 (id = post id, "scheduledAt" = publishedAt
    // agar groupByDate kalender menempatkannya di hari terbit, non-draggable di UI).
    let externalGroups: Array<Record<string, unknown>> = [];
    if (includeExternal) {
      const extConditions = [
        eq(post.organizationId, ctx.organization.id),
        eq(post.isExternal, true),
      ];
      if (from) extConditions.push(gte(post.publishedAt, new Date(from)));
      if (to) extConditions.push(lte(post.publishedAt, new Date(to)));
      const extPosts = await db
        .select({
          id: post.id,
          platform: post.platform,
          content: post.content,
          publishedAt: post.publishedAt,
          externalUrl: post.externalUrl,
          externalThumbnailUrl: post.externalThumbnailUrl,
          platformSettings: post.platformSettings,
          username: socialAccount.username,
        })
        .from(post)
        .innerJoin(socialAccount, eq(post.socialAccountId, socialAccount.id))
        .where(and(...extConditions))
        .orderBy(desc(post.publishedAt))
        .limit(300);
      externalGroups = extPosts.map((p) => ({
        id: p.id,
        content: p.content ?? "",
        scheduledAt: p.publishedAt,
        reminderAt: null,
        timezone: null,
        createdAt: p.publishedAt,
        updatedAt: p.publishedAt,
        isExternal: true,
        posts: [
          {
            id: p.id,
            platform: p.platform,
            status: "published",
            username: p.username,
            externalUrl: p.externalUrl,
            externalThumbnailUrl: p.externalThumbnailUrl,
            mediaType: (p.platformSettings as Record<string, unknown> | null)?.mediaType ?? null,
          },
        ],
      }));
    }

    return c.json({
      groups: [
        ...visibleGroups.map((g) => ({
          ...g,
          posts: postsByGroup.get(g.id) ?? [],
        })),
        ...externalGroups,
      ],
      page,
      perPage,
    });
  } catch (error) {
    return errorResponse(error);
  }
});

/** Batas selisih jadwal (menit) agar dua post di akun yang sama dianggap konflik */
const CONFLICT_WINDOW_MINUTES = 10;

type ScheduleConflictItem = {
  socialAccountId: string;
  platform: string;
  accountUsername: string;
  postA: { id: string; caption: string; scheduledAt: string };
  postB: { id: string; caption: string; scheduledAt: string };
  deltaMinutes: number;
};

/** GET /posts/conflicts — deteksi konflik jadwal: dua post berstatus "scheduled"
 * untuk akun social yang sama dengan selisih scheduledAt < 10 menit (filter from/to).
 * Param opsional (dipakai compose sebelum simpan): candidateAt (ISO waktu jadwal
 * yang akan disimpan) + accountIds (id akun terpilih, comma-separated) — post
 * kandidat virtual ikut dideteksi sehingga bentrok dengan jadwal baru ketahuan.
 * Query dibatasi ke jadwal terdekat (maks 200 baris, hanya >= kemarin) agar tidak
 * memindai seluruh history post. */
postsRoute.get("/conflicts", async (c) => {
  try {
    const ctx = await requirePermission(c, "posts.view");
    const from = c.req.query("from");
    const to = c.req.query("to");
    const candidateAtRaw = c.req.query("candidateAt");
    const accountIdsRaw = c.req.query("accountIds");

    const candidateAt = candidateAtRaw ? new Date(candidateAtRaw) : null;
    const hasCandidate = candidateAt !== null && !Number.isNaN(candidateAt.getTime());

    // Batas bawah jadwal: kemarin (konflik jadwal lampau tidak relevan) —
    // hanya dipakai bila pemanggil tidak mengirim filter from yang lebih baru
    const since = new Date();
    since.setDate(since.getDate() - 1);
    const lowerBound = from ? new Date(from) : since;
    const effectiveFrom = Number.isNaN(lowerBound.getTime()) ? since : lowerBound;

    const conditions = [
      eq(post.organizationId, ctx.organization.id),
      eq(post.status, "scheduled"),
      gte(postGroup.scheduledAt, effectiveFrom),
    ];
    if (from) conditions.push(gte(postGroup.scheduledAt, new Date(from)));
    if (to) conditions.push(lte(postGroup.scheduledAt, new Date(to)));

    const rows = await db
      .select({
        postId: post.id,
        caption: post.content,
        groupContent: postGroup.content,
        scheduledAt: postGroup.scheduledAt,
        socialAccountId: post.socialAccountId,
        platform: socialAccount.platform,
        accountUsername: socialAccount.username,
      })
      .from(post)
      .innerJoin(postGroup, eq(post.postGroupId, postGroup.id))
      .innerJoin(socialAccount, eq(post.socialAccountId, socialAccount.id))
      .where(and(...conditions))
      .orderBy(postGroup.scheduledAt)
      .limit(200);

    // Post kandidat virtual (compose): postId "" menandai sisi kandidat pada pasangan
    if (hasCandidate && accountIdsRaw) {
      const accountIds = accountIdsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (accountIds.length > 0) {
        const accounts = await db
          .select({
            id: socialAccount.id,
            platform: socialAccount.platform,
            username: socialAccount.username,
          })
          .from(socialAccount)
          .where(
            and(
              eq(socialAccount.organizationId, ctx.organization.id),
              inArray(socialAccount.id, accountIds),
            ),
          );
        for (const account of accounts) {
          rows.push({
            postId: "",
            caption: null,
            groupContent: "(post baru yang disusun)",
            scheduledAt: candidateAt,
            socialAccountId: account.id,
            platform: account.platform,
            accountUsername: account.username,
          });
        }
      }
    }

    // Kelompokkan per akun social → pasangan berurutan (setelah sort) dengan
    // selisih < 10 menit adalah konflik
    const byAccount = new Map<string, (typeof rows)[number][]>();
    for (const row of rows) {
      const list = byAccount.get(row.socialAccountId) ?? [];
      list.push(row);
      byAccount.set(row.socialAccountId, list);
    }
    for (const list of byAccount.values()) {
      list.sort((a, b) => (a.scheduledAt?.getTime() ?? 0) - (b.scheduledAt?.getTime() ?? 0));
    }

    const truncateCaption = (text: string | null): string => {
      const t = (text ?? "").trim() || "(tanpa caption)";
      return t.length > 80 ? `${t.slice(0, 80)}…` : t;
    };

    const conflicts: ScheduleConflictItem[] = [];
    for (const [socialAccountId, accountPosts] of byAccount) {
      for (let i = 1; i < accountPosts.length; i++) {
        const a = accountPosts[i - 1];
        const b = accountPosts[i];
        if (!a || !b) continue;
        if (!a.scheduledAt || !b.scheduledAt) continue;
        const deltaMinutes = Math.abs(b.scheduledAt.getTime() - a.scheduledAt.getTime()) / 60_000;
        if (deltaMinutes >= CONFLICT_WINDOW_MINUTES) continue;
        // Mode kandidat: hanya pasangan yang menyertakan post kandidat virtual
        if (hasCandidate && a.postId !== "" && b.postId !== "") continue;

        conflicts.push({
          socialAccountId,
          platform: b.platform,
          accountUsername: b.accountUsername,
          postA: {
            id: a.postId,
            caption: truncateCaption(a.caption ?? a.groupContent),
            scheduledAt: a.scheduledAt.toISOString(),
          },
          postB: {
            id: b.postId,
            caption: truncateCaption(b.caption ?? b.groupContent),
            scheduledAt: b.scheduledAt.toISOString(),
          },
          deltaMinutes: Math.round(deltaMinutes),
        });
      }
    }

    return c.json({ conflicts });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /posts — buat draft/scheduled post multi-platform */
postsRoute.post("/", async (c) => {
  try {
    const ctx = await requirePermission(c, "posts.create");
    const body = await c.req.json();
    const input = createPostSchema.parse(body);

    // Validasi akun milik org
    const accountIds = input.items.map((i) => i.socialAccountId);
    const accounts = await db
      .select()
      .from(socialAccount)
      .where(
        and(
          eq(socialAccount.organizationId, ctx.organization.id),
          inArray(socialAccount.id, accountIds),
        ),
      );
    if (accounts.length !== accountIds.length) {
      return c.json({ message: "Ada akun yang tidak valid" }, 400);
    }

    const isScheduled = Boolean(input.scheduledAt);
    if (isScheduled) {
      // Menjadwalkan = aksi publish → butuh posts.publish, bukan sekadar posts.create
      await assertPermission(ctx, "posts.publish");
      // Feature gate hanya saat scheduling
      await checkFeatureGate(ctx.organization.id, "scheduled_posts");
    }

    const postGroupId = generateId("postgrp");

    // Track post yang dibuat untuk enqueue job publish (bila scheduled)
    const createdPosts: { id: string; platform: string }[] = [];

    // Validasi media semua item sekaligus (satu query, bukan per item)
    const allMediaIds = [...new Set(input.items.flatMap((i) => i.mediaIds))];
    const validMediaIds = new Set(
      allMediaIds.length > 0
        ? (
            await db
              .select({ id: mediaTable.id })
              .from(mediaTable)
              .where(
                and(
                  eq(mediaTable.organizationId, ctx.organization.id),
                  inArray(mediaTable.id, allMediaIds),
                ),
              )
          ).map((m) => m.id)
        : [],
    );

    // Id dibuat di depan agar relasi post → postMedia tetap terjaga saat bulk insert
    const postValues: (typeof post.$inferInsert)[] = [];
    const postMediaValues: (typeof postMedia.$inferInsert)[] = [];

    for (const item of input.items) {
      // Guard nyata (bukan `!`): validasi "Ada akun yang tidak valid" di atas
      // menjamin id-nya ada, tapi kalau logika itu berubah, `account.platform`
      // akan melempar TypeError dan jadi 500 — guard ini mengembalikannya ke 400.
      const account = accounts.find((a) => a.id === item.socialAccountId);
      if (!account) {
        return c.json({ message: "Ada akun yang tidak valid" }, 400);
      }
      const postId = generateId("post");
      postValues.push({
        id: postId,
        organizationId: ctx.organization.id,
        postGroupId,
        socialAccountId: item.socialAccountId,
        platform: account.platform,
        status: isScheduled ? "scheduled" : "draft",
        content: item.content ?? null,
        hashtags: item.hashtags,
        firstComment: item.firstComment ?? null,
        platformSettings: (item.platformSettings as Record<string, unknown>) ?? null,
      });
      createdPosts.push({ id: postId, platform: account.platform });

      // Attach media (sortOrder per post)
      let sortOrder = 0;
      for (const mediaId of item.mediaIds) {
        if (!validMediaIds.has(mediaId)) continue;
        postMediaValues.push({
          id: generateId("pmedia"),
          postId,
          mediaId,
          sortOrder: sortOrder++,
        });
      }
    }

    // Bulk insert dalam satu transaksi (menggantikan insert per baris di loop)
    await db.transaction(async (tx) => {
      await tx.insert(postGroup).values({
        id: postGroupId,
        organizationId: ctx.organization.id,
        content: input.content,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        timezone: input.timezone,
        audioTrackId: input.audioTrackId ?? null,
        createdByUserId: ctx.user.id,
      });
      await tx.insert(post).values(postValues);
      if (postMediaValues.length > 0) {
        await tx.insert(postMedia).values(postMediaValues);
      }
    });

    // Tag produk — snapshot denormalized dibuat untuk tiap post di group
    if (input.productIds.length > 0) {
      const products = await db
        .select()
        .from(product)
        .where(
          and(
            eq(product.organizationId, ctx.organization.id),
            inArray(product.id, input.productIds),
          ),
        );
      if (products.length > 0) {
        const productTagValues: (typeof productTag.$inferInsert)[] = [];
        for (const p of createdPosts) {
          for (const prod of products) {
            productTagValues.push({
              id: generateId("ptag"),
              organizationId: ctx.organization.id,
              postId: p.id,
              productId: prod.id,
              productName: prod.name,
              productPrice: prod.price,
              productCurrency: prod.currency,
              productImageUrl: prod.imageUrl,
            });
          }
        }
        await db
          .insert(productTag)
          .values(productTagValues)
          .onConflictDoNothing({
            target: [productTag.postId, productTag.productId],
          });
      }
    }

    // Enqueue job publish (delayed hingga scheduledAt) bila Redis tersedia.
    // Tanpa Redis → return null → worker fallback DB polling yang menangkapnya.
    if (isScheduled && input.scheduledAt) {
      const scheduledDate = new Date(input.scheduledAt);
      for (const p of createdPosts) {
        await enqueuePublish(p.id, p.platform, scheduledDate);
      }
    }

    // Catat aktivitas org: post group dibuat (draft/scheduled)
    fireActivity({
      orgId: ctx.organization.id,
      userId: ctx.user.id,
      action: isScheduled ? "post.scheduled" : "post.created",
      targetType: "post_group",
      targetId: postGroupId,
      metadata: {
        platforms: createdPosts.map((p) => p.platform),
        postCount: createdPosts.length,
        scheduledAt: input.scheduledAt ?? null,
      },
    });

    // Webhook keluar: post dibuat/dijadwalkan (best-effort, tidak blocking).
    // Catatan: di handler ini post BARU dibuat — belum tayang. Event yang benar
    // untuk kasus tidak-terjadwal adalah "post.scheduled" bila dijadwalkan;
    // tidak ada event "post.created" di contract, jadi untuk draft jangan
    // tembak "post.published" ( akan ditembak LAGI saat publish sungguhan
    // terjadi di POST /:id/publish / worker → subscriber dapat 2 event).
    // Contract WEBHOOK_EVENTS hanya punya post.{published,failed,scheduled},
    // jadi untuk kasus draft kita TIDAK emit (payload tidak berubah setelah
    // commit ini, dan subscriber tetap dapat post.published saat tayang).
    if (isScheduled) {
      void emitWebhookEvent(ctx.organization.id, "post.scheduled", {
        postGroupId,
        scheduledAt: input.scheduledAt ?? null,
        platforms: createdPosts.map((p) => p.platform),
      });
    }

    return c.json({ postGroupId }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/**
 * Batas total waktu satu request `/posts/sync` — dipakai untuk menghitung sisa
 * anggaran penyegaran metrik SETELAH impor konten selesai.
 *
 * MENGAPA: nginx memutus koneksi di 120s dan Cloudflare (free) di ~100s. Impor
 * konten sendiri bisa memakan puluhan detik (5 akun × paginasi platform), jadi
 * anggaran metrik tidak boleh konstanta — kalau tidak, org besar akan menembus
 * batas Cloudflare dan pengguna melihat 502 padahal datanya sudah tersimpan.
 * Sisa waktu habis → sync metrik lanjut di latar belakang; halaman
 * /post-results sudah polling sendiri tiap 60s sehingga angkanya tetap masuk.
 */
const SYNC_TOTAL_DEADLINE_MS = 75_000;

/** Bentuk laporan penyegaran metrik pada respons `/posts/sync`. */
type SyncMetricsPayload = {
  /**
   * done      — selesai
   * throttled — platform membatasi permintaan (kuota API habis); sebagian metrik
   *             belum tersegarkan dan siklus berikutnya pun akan gagal sampai
   *             kuota pulih
   * pending   — anggaran waktu habis, sync lanjut di latar belakang
   * error     — gagal karena sebab lain
   */
  status: "done" | "throttled" | "pending" | "error";
  accounts: number;
  posts: number;
  /** Jumlah akun yang dibatasi platform (hanya saat `throttled`). */
  throttled?: number;
  message?: string;
};

/** POST /posts/sync — trigger manual import post eksternal dari platform.
 * Fetch konten terbit langsung di platform (90 hari default) → upsert ke DB.
 * Worker juga menjalankan siklus yang sama tiap 4 jam; endpoint ini untuk
 * user yang ingin melihat konten terbarunya segera.
 *
 * Setelah konten diimpor, metrik engagement (views/likes/komentar/share)
 * ikut disegarkan untuk org ini. MENGAPA: `syncWorkspacePosts` hanya mengisi
 * KONTEN — angka engagement datang dari jalur analytics terpisah yang di
 * worker berjalan tiap 1 jam dengan antrean global (maks 10 akun/siklus).
 * Tanpa langkah ini pengguna menekan "Sinkron Platform", kontennya masuk,
 * tapi semua angka tetap 0 dan tombolnya terlihat tidak bekerja. */
postsRoute.post("/sync", async (c) => {
  const startedAt = Date.now();
  try {
    const ctx = await requirePermission(c, "posts.create");
    const input = z
      .object({ days: z.number().int().min(1).max(180).default(90) })
      .parse((await c.req.json().catch(() => ({}))) ?? {});
    const summary = await syncWorkspacePosts(ctx.organization.id, input.days);

    // `force: true` → jangan lewati akun yang sudah punya snapshot hari ini;
    // akun yang tersink pagi tadi tetap harus bisa disegarkan setelah post
    // barunya diimpor. Snapshot per-post tetap punya pengaman sendiri
    // (metrik non-nol / snapshot < 45 menit tidak ditembak ulang).
    //
    // Error ditangkap di sini (bukan di race) supaya kegagalan metrik tidak
    // pernah menggagalkan respons padahal kontennya sudah tersimpan — dan
    // supaya frontend bisa membedakan "gagal" dari "masih jalan".
    const metricsPromise: Promise<SyncMetricsPayload> = syncWorkspaceAnalytics(
      ctx.organization.id,
      { force: true },
    )
      .then(
        (r): SyncMetricsPayload => ({
          // Throttle dilaporkan sebagai status tersendiri: angkanya memang belum
          // lengkap, dan pengguna berhak tahu sebabnya (kuota API) alih-alih
          // menyimpulkan aplikasinya rusak.
          status: r.throttled > 0 ? "throttled" : "done",
          accounts: r.synced,
          posts: r.postsSynced,
          throttled: r.throttled,
        }),
      )
      .catch((err): SyncMetricsPayload => {
        console.error("[posts] gagal menyegarkan metrik:", err);
        return {
          status: "error",
          accounts: 0,
          posts: 0,
          message: err instanceof Error ? err.message : String(err),
        };
      });
    const budget = Math.max(0, SYNC_TOTAL_DEADLINE_MS - (Date.now() - startedAt));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const raced = await Promise.race<SyncMetricsPayload | null>([
      metricsPromise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), budget);
      }),
    ]);
    if (timer) clearTimeout(timer);
    // `pending` = anggaran waktu habis, sync lanjut di latar belakang.
    const metrics: SyncMetricsPayload = raced ?? {
      status: "pending",
      accounts: 0,
      posts: 0,
    };

    fireActivity({
      orgId: ctx.organization.id,
      userId: ctx.user.id,
      action: "posts.synced",
      targetType: "organization",
      targetId: ctx.organization.id,
      metadata: {
        imported: summary.totalPostsImported,
        updated: summary.totalPostsUpdated,
        accounts: summary.attemptedAccounts,
        metricsStatus: metrics.status,
        metricsPosts: metrics.posts,
        metricsThrottled: metrics.throttled ?? 0,
      },
    });
    return c.json({ summary, metrics });
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /posts/:id — detail post group */
postsRoute.get("/:id", async (c) => {
  try {
    const ctx = await requirePermission(c, "posts.view");
    const [group] = await db
      .select()
      .from(postGroup)
      .where(
        and(eq(postGroup.id, c.req.param("id")), eq(postGroup.organizationId, ctx.organization.id)),
      )
      .limit(1);
    if (!group) return c.json({ message: "Post tidak ditemukan" }, 404);

    const posts = await db.select().from(post).where(eq(post.postGroupId, group.id));

    return c.json({ group, posts });
  } catch (error) {
    return errorResponse(error);
  }
});

const updatePostSchema = z.object({
  content: z.string().optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  timezone: z.string().optional(),
});

/** PATCH /posts/:id — update post group (reschedule/edit draft) */
postsRoute.patch("/:id", async (c) => {
  try {
    const ctx = await requirePermission(c, "posts.edit");
    const body = await c.req.json();
    const input = updatePostSchema.parse(body);
    // Menjadwalkan (scheduledAt diisi) = aksi publish → butuh posts.publish
    if (input.scheduledAt) await assertPermission(ctx, "posts.publish");

    const [group] = await db
      .select()
      .from(postGroup)
      .where(
        and(eq(postGroup.id, c.req.param("id")), eq(postGroup.organizationId, ctx.organization.id)),
      )
      .limit(1);
    if (!group) return c.json({ message: "Post tidak ditemukan" }, 404);

    await db
      .update(postGroup)
      .set({
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.scheduledAt !== undefined
          ? { scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null }
          : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      })
      .where(eq(postGroup.id, group.id));

    // Sync status scheduled/draft ke posts
    if (input.scheduledAt !== undefined) {
      const affected = await db
        .update(post)
        .set({
          status: input.scheduledAt ? "scheduled" : "draft",
        })
        .where(and(eq(post.postGroupId, group.id), inArray(post.status, ["draft", "scheduled"])))
        .returning({ id: post.id, platform: post.platform });

      // Reschedule: batalkan job lama, enqueue ulang dengan delay baru.
      // Reminder manual ikut dibatalkan — user harus set ulang setelah reschedule.
      if (group.reminderAt) {
        await cancelPostReminder(group.id);
      }
      for (const p of affected) {
        await cancelPublishJob(p.id, p.platform);
        if (input.scheduledAt) {
          await enqueuePublish(p.id, p.platform, new Date(input.scheduledAt));
        }
      }
    }

    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /posts/item/:id — hapus satu jadwal post (satu platform) dari group.
 * Group dihapus otomatis bila ini jadwal terakhir (group kosong tidak berguna).
 */
/**
 * Batalkan schedule di sisi Repliz bila post sudah pernah disubmit ke bridge.
 * cancelPublishJob() hanya menghapus job BullMQ lokal — untuk post yg sudah
 * masuk pipeline Repliz (status publishing/failed dgn scheduleId di
 * platformPostId), schedule-nya TIDAK ter-cancel dan post tetap tayang di
 * waktu terjadwal meski baris DB sudah dihapus. Best-effort: kegagalan tidak
 * menggagalkan delete lokal (post tetap hilang dari DB).
 */
async function cancelReplizScheduleIfAny(platformPostId: string): Promise<void> {
  const cred = await replizActiveCredentials();
  if (!cred) return;
  try {
    await replizRemoveSchedule(cred, platformPostId);
  } catch (error) {
    // 404 = schedule sudah hilang (sudah tayang/dibatalkan) — kondisi normal.
    console.warn(
      `[posts] Batal schedule Repliz ${platformPostId} best-effort gagal:`,
      error instanceof Error ? error.message : error,
    );
  }
}

postsRoute.delete("/item/:id", async (c) => {
  try {
    const ctx = await requirePermission(c, "posts.delete");
    const postId = c.req.param("id");

    // Post harus milik org aktif (join group)
    const [row] = await db
      .select({
        id: post.id,
        platform: post.platform,
        status: post.status,
        platformPostId: post.platformPostId,
        groupId: sql<string>`${post.postGroupId}`,
      })
      .from(post)
      .innerJoin(postGroup, eq(post.postGroupId, postGroup.id))
      .where(and(eq(post.id, postId), eq(postGroup.organizationId, ctx.organization.id)))
      .limit(1);
    if (!row?.groupId) return c.json({ message: "Post tidak ditemukan" }, 404);

    await cancelPublishJob(row.id, row.platform);
    // Sudah masuk pipeline Repliz? cancel schedule-nya juga (bukan hanya job lokal)
    if (row.status === "publishing" || row.status === "failed") {
      if (row.platformPostId) await cancelReplizScheduleIfAny(row.platformPostId);
    }
    await db.delete(post).where(eq(post.id, row.id));

    // Group kosong → hapus (beserta pengingat manualnya bila aktif)
    const [remaining] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(post)
      .where(eq(post.postGroupId, row.groupId));
    const groupDeleted = (remaining?.n ?? 0) === 0;
    if (groupDeleted && row.groupId) {
      await cancelPostReminder(row.groupId);
      await db.delete(postGroup).where(eq(postGroup.id, row.groupId));
    }

    return c.json({ ok: true, groupDeleted });
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /posts/:id — hapus post group */
postsRoute.delete("/:id", async (c) => {
  try {
    const ctx = await requirePermission(c, "posts.delete");
    const [group] = await db
      .select()
      .from(postGroup)
      .where(
        and(eq(postGroup.id, c.req.param("id")), eq(postGroup.organizationId, ctx.organization.id)),
      )
      .limit(1);
    if (!group) return c.json({ message: "Post tidak ditemukan" }, 404);

    // Batalkan job publish tertunda sebelum hapus
    const groupPosts = await db
      .select({
        id: post.id,
        platform: post.platform,
        status: post.status,
        platformPostId: post.platformPostId,
      })
      .from(post)
      .where(eq(post.postGroupId, group.id));
    for (const p of groupPosts) {
      await cancelPublishJob(p.id, p.platform);
      // Sudah masuk pipeline Repliz? cancel schedule-nya juga (bukan hanya job lokal)
      if (p.status === "publishing" || p.status === "failed") {
        if (p.platformPostId) await cancelReplizScheduleIfAny(p.platformPostId);
      }
    }
    // Batalkan juga pengingat manual bila aktif
    await cancelPostReminder(group.id);

    await db.delete(postGroup).where(eq(postGroup.id, group.id));
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

// --- Nested Routes ---
postsRoute.route("/", postsBridgeRoute);
