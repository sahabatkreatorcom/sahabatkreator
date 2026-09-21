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
import { claimPostById, publishPost, syncWorkspacePosts } from "@sahabatkreator/publishing";
import {
  cancelPostReminder,
  cancelPublishJob,
  enqueuePostReminder,
  enqueuePublish,
} from "@sahabatkreator/queue";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { fireActivity } from "../lib/activity-log";
import { errorResponse, requireOrg } from "../lib/auth-guard";
import { checkFeatureGate } from "../lib/billing";
import { generateId } from "../lib/id";

export const postsRoute = new Hono();

const platformSettingsSchema = z.record(z.string(), z.unknown());

const createPostSchema = z.object({
  content: z.string().default(""),
  scheduledAt: z.string().datetime().nullable().optional(),
  timezone: z.string().default("Asia/Jakarta"),
  // Sound terpilih untuk konten video (opsional)
  audioTrackId: z.string().nullable().optional(),
  // Produk yang di-tag (id katalog) — snapshot dibuat per post
  productIds: z.array(z.string()).default([]),
  items: z
    .array(
      z.object({
        socialAccountId: z.string().min(1),
        content: z.string().optional(),
        hashtags: z.array(z.string()).default([]),
        firstComment: z.string().nullable().optional(),
        platformSettings: platformSettingsSchema.optional(),
        mediaIds: z.array(z.string()).default([]),
      }),
    )
    .min(1),
});

/** GET /posts — list post groups org (filter: from, to, status, page/perPage).
 * Pagination di level SQL (pola /dm) — grouping post per group tetap di JS
 * tapi hanya atas data halaman yang diminta. */
postsRoute.get("/", async (c) => {
  try {
    const ctx = await requireOrg(c);
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
    const ctx = await requireOrg(c);
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
        const a = accountPosts[i - 1]!;
        const b = accountPosts[i]!;
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
    const ctx = await requireOrg(c);
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
      const account = accounts.find((a) => a.id === item.socialAccountId)!;
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

    return c.json({ postGroupId }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /posts/sync — trigger manual import post eksternal dari platform.
 * Fetch konten terbit langsung di platform (90 hari default) → upsert ke DB.
 * Worker juga menjalankan siklus yang sama tiap 4 jam; endpoint ini untuk
 * user yang ingin melihat konten terbarunya segera. */
postsRoute.post("/sync", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = z
      .object({ days: z.number().int().min(1).max(180).default(90) })
      .parse((await c.req.json().catch(() => ({}))) ?? {});
    const summary = await syncWorkspacePosts(ctx.organization.id, input.days);
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
      },
    });
    return c.json({ summary });
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /posts/:id — detail post group */
postsRoute.get("/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
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
    const ctx = await requireOrg(c);
    const body = await c.req.json();
    const input = updatePostSchema.parse(body);

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
postsRoute.delete("/item/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const postId = c.req.param("id");

    // Post harus milik org aktif (join group)
    const [row] = await db
      .select({
        id: post.id,
        platform: post.platform,
        groupId: sql<string>`${post.postGroupId}`,
      })
      .from(post)
      .innerJoin(postGroup, eq(post.postGroupId, postGroup.id))
      .where(and(eq(post.id, postId), eq(postGroup.organizationId, ctx.organization.id)))
      .limit(1);
    if (!row?.groupId) return c.json({ message: "Post tidak ditemukan" }, 404);

    await cancelPublishJob(row.id, row.platform);
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
    const ctx = await requireOrg(c);
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
      .select({ id: post.id, platform: post.platform })
      .from(post)
      .where(eq(post.postGroupId, group.id));
    for (const p of groupPosts) {
      await cancelPublishJob(p.id, p.platform);
    }
    // Batalkan juga pengingat manual bila aktif
    await cancelPostReminder(group.id);

    await db.delete(postGroup).where(eq(postGroup.id, group.id));
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /posts/:id/reminder — aktifkan pengingat push untuk post manual terjadwal.
 * Post manual (platform "manual") tidak dipublikasi otomatis — pengingat dikirim
 * `minutesBefore` menit sebelum scheduledAt via job queue "post-reminder". */
postsRoute.post("/:id/reminder", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = z
      .object({ minutesBefore: z.number().int().min(1).max(1440).default(15) })
      .parse((await c.req.json().catch(() => ({}))) ?? {});

    const [group] = await db
      .select()
      .from(postGroup)
      .where(
        and(eq(postGroup.id, c.req.param("id")), eq(postGroup.organizationId, ctx.organization.id)),
      )
      .limit(1);
    if (!group) return c.json({ message: "Post tidak ditemukan" }, 404);
    if (!group.scheduledAt) {
      return c.json({ message: "Post belum dijadwalkan — atur jadwal dulu" }, 400);
    }

    // Hanya post scheduled bertipe manual yang relevan (post manual tidak auto-publish)
    const groupPosts = await db
      .select({ platform: post.platform, status: post.status })
      .from(post)
      .where(eq(post.postGroupId, group.id));
    const hasManual = groupPosts.some((p) => p.platform === "manual");
    const hasScheduled = groupPosts.some((p) => p.status === "scheduled");
    if (!hasManual || !hasScheduled) {
      return c.json({ message: "Pengingat hanya untuk post manual berstatus terjadwal" }, 400);
    }

    const reminderAt = new Date(group.scheduledAt.getTime() - input.minutesBefore * 60_000);
    if (reminderAt.getTime() <= Date.now()) {
      return c.json({ message: "Waktu pengingat sudah lewat — pilih jadwal yang lebih jauh" }, 400);
    }

    // enqueuePostReminder menyimpan reminderAt ke DB (status UI) + job delayed
    // bila Redis tersedia; tanpa Redis → worker fallback polling reminder_at.
    await enqueuePostReminder(
      group.id,
      group.organizationId,
      group.content,
      group.scheduledAt,
      input.minutesBefore,
    );

    fireActivity({
      orgId: ctx.organization.id,
      userId: ctx.user.id,
      action: "post.reminder_set",
      targetType: "post_group",
      targetId: group.id,
      metadata: { minutesBefore: input.minutesBefore },
    });

    return c.json({ ok: true, reminderAt: reminderAt.toISOString() }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /posts/:id/publish — publish manual (publish now) */
postsRoute.post("/:id/publish", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const [group] = await db
      .select()
      .from(postGroup)
      .where(
        and(eq(postGroup.id, c.req.param("id")), eq(postGroup.organizationId, ctx.organization.id)),
      )
      .limit(1);
    if (!group) return c.json({ message: "Post tidak ditemukan" }, 404);

    await checkFeatureGate(ctx.organization.id, "scheduled_posts");

    // Post yang masih bisa dipublish
    const publishable = await db
      .select({ id: post.id, platform: post.platform })
      .from(post)
      .where(
        and(eq(post.postGroupId, group.id), inArray(post.status, ["draft", "scheduled", "failed"])),
      );
    if (publishable.length === 0) {
      return c.json(
        { message: "Tidak ada post yang bisa dipublish (mungkin sudah dipublish)" },
        400,
      );
    }

    await db.update(postGroup).set({ scheduledAt: new Date() }).where(eq(postGroup.id, group.id));

    // Publish segera via queue bila Redis tersedia (claim + retry backoff oleh processor).
    // enqueuePublish return null tanpa Redis → fallback inline paralel.
    const queued = await Promise.all(publishable.map((p) => enqueuePublish(p.id, p.platform)));
    if (queued.some((id) => id !== null)) {
      return c.json({ ok: true, queued: queued.filter(Boolean).length });
    }

    // Fallback inline: claim atomik per post lalu publish via pipeline
    const results: ("published" | "processing" | "failed")[] = [];
    for (const p of publishable) {
      const claimed = await claimPostById(p.id);
      if (!claimed) {
        results.push("failed");
        continue;
      }
      results.push(await publishPost(p.id));
    }

    const published = results.filter((r) => r === "published").length;
    const processing = results.filter((r) => r === "processing").length;
    const failed = results.filter((r) => r === "failed").length;

    return c.json({ ok: true, published, processing, failed });
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /posts/:id/landing — data untuk halaman landing push (post-failed / publish-ready).
 * id = postGroupId. Return ringkasan group + posts per platform + media URL. */
postsRoute.get("/:id/landing", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const [group] = await db
      .select()
      .from(postGroup)
      .where(
        and(eq(postGroup.id, c.req.param("id")), eq(postGroup.organizationId, ctx.organization.id)),
      )
      .limit(1);
    if (!group) return c.json({ message: "Post tidak ditemukan" }, 404);

    const posts = await db
      .select({
        id: post.id,
        platform: post.platform,
        status: post.status,
        content: post.content,
        platformPostUrl: post.platformPostUrl,
        errorCode: post.errorCode,
        errorMessage: post.errorMessage,
        publishedAt: post.publishedAt,
        username: socialAccount.username,
        displayName: socialAccount.displayName,
        avatarUrl: socialAccount.avatarUrl,
      })
      .from(post)
      .innerJoin(socialAccount, eq(post.socialAccountId, socialAccount.id))
      .where(eq(post.postGroupId, group.id));

    const medias = await db
      .selectDistinctOn([mediaTable.id], {
        name: mediaTable.name,
        type: mediaTable.type,
        url: mediaTable.url,
        thumbnailUrl: mediaTable.thumbnailUrl,
        mimeType: mediaTable.mimeType,
      })
      .from(postMedia)
      .innerJoin(post, eq(postMedia.postId, post.id))
      .innerJoin(mediaTable, eq(postMedia.mediaId, mediaTable.id))
      .where(eq(post.postGroupId, group.id));

    return c.json({
      group: {
        id: group.id,
        content: group.content,
        scheduledAt: group.scheduledAt,
        timezone: group.timezone,
      },
      posts,
      media: medias,
    });
  } catch (error) {
    return errorResponse(error);
  }
});
