// API Posts — CRUD post group multi-platform + schedule

import { db } from "@sahabatkreator/db";
import {
  media as mediaTable,
  post,
  postGroup,
  postMedia,
  socialAccount,
} from "@sahabatkreator/db/schema";
import {
  canDeletePublishedPost,
  claimPostById,
  deletePublishedPost,
  publishPost,
  replizActiveCredentials,
  replizDeleteContent,
  replizListContent,
  replizMassDeleteSchedules,
  replizRetrySchedule,
  replizUpdateSchedule,
} from "@sahabatkreator/publishing";
import {
  cancelPublishJob,
  emitWebhookEvent,
  enqueuePoll,
  enqueuePostReminder,
  enqueuePublish,
} from "@sahabatkreator/queue";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { fireActivity } from "../lib/activity-log";
import { errorResponse, requireOrg } from "../lib/auth-guard";
import { checkFeatureGate } from "../lib/billing";
import { decrypt } from "../lib/crypto";

export const postsBridgeRoute = new Hono();
/** PUT /posts/item/:id/schedule — ubah konten/waktu schedule bridge Repliz.
 * Hanya utk post publishing/failed yg punya scheduleId (platformPostId).
 * Dipakai queue page utk "edit jadwal" tanpa harus hapus + buat ulang. */
postsBridgeRoute.put("/item/:id/schedule", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const [row] = await db
      .select({
        id: post.id,
        platform: post.platform,
        status: post.status,
        platformPostId: post.platformPostId,
        content: post.content,
        socialAccountId: post.socialAccountId,
        groupId: sql<string>`${post.postGroupId}`,
        scheduledAt: postGroup.scheduledAt,
      })
      .from(post)
      .innerJoin(postGroup, eq(post.postGroupId, postGroup.id))
      .where(and(eq(post.id, c.req.param("id")), eq(postGroup.organizationId, ctx.organization.id)))
      .limit(1);
    if (!row) return c.json({ message: "Post tidak ditemukan" }, 404);
    if (row.status !== "publishing" && row.status !== "failed") {
      return c.json({ message: "Hanya post terjadwal/gagal yang bisa diubah schedule-nya" }, 400);
    }
    if (!row.platformPostId) {
      return c.json({ message: "Post ini tidak memiliki schedule bridge" }, 400);
    }

    const input = z
      .object({
        content: z.string().optional(),
        scheduledAt: z.string().datetime().optional(),
      })
      .parse(await c.req.json());

    const [account] = await db
      .select({ metadata: socialAccount.metadata })
      .from(socialAccount)
      .where(eq(socialAccount.id, row.socialAccountId))
      .limit(1);
    const replizAccountId = (account?.metadata as { replizAccountId?: string } | null)
      ?.replizAccountId;
    if (!replizAccountId) {
      return c.json({ message: "Akun platform ini tidak terhubung via bridge Repliz" }, 400);
    }

    const cred = await replizActiveCredentials();
    if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);

    // Ambungkan input: content baru + waktu baru (fallback ke yang ada).
    const newContent = input.content ?? row.content ?? "";
    const newTime =
      input.scheduledAt ?? (row.scheduledAt ? row.scheduledAt.toISOString() : undefined);
    if (!newTime) return c.json({ message: "Waktu jadwal wajib diisi" }, 400);

    // Schedule Repliz berbasis media URL; update hanya caption/waktu — medias
    // tidak bisa diubah lewat endpoint ini (docs: PUT pakai shape create sama,
    // tapi media upload ulang di luar scope ini). Type diset "text" bila tak ada
    // media; Repliz menolak type tanpa medias hanya utk image/video.
    await replizUpdateSchedule(cred, row.platformPostId, {
      description: newContent,
      type: "text",
      medias: [],
      accountId: replizAccountId,
      scheduleAt: newTime,
      topic: row.platform,
    });

    if (input.scheduledAt) {
      await db
        .update(postGroup)
        .set({ scheduledAt: new Date(input.scheduledAt) })
        .where(eq(postGroup.id, row.groupId));
    }
    if (input.content !== undefined) {
      await db.update(post).set({ content: input.content }).where(eq(post.id, row.id));
    }

    void fireActivity({
      orgId: ctx.organization.id,
      action: "post.schedule_updated",
      targetType: "post",
      targetId: row.id,
      metadata: { platform: row.platform, via: "repliz" },
    });

    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /posts/mass-delete — hapus beberapa schedule bridge sekaligus.
 * Body { postIds: string[] } — semua harus milik org & punya scheduleId.
 * Pakai DELETE /public/schedule/mass (scheduleIds[]) — efisien utk bulk cancel. */
postsBridgeRoute.post("/mass-delete", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = z
      .object({ postIds: z.array(z.string().min(1)).min(1).max(100) })
      .parse(await c.req.json());

    const rows = await db
      .select({
        id: post.id,
        platform: post.platform,
        status: post.status,
        platformPostId: post.platformPostId,
      })
      .from(post)
      .innerJoin(postGroup, eq(post.postGroupId, postGroup.id))
      .where(
        and(inArray(post.id, input.postIds), eq(postGroup.organizationId, ctx.organization.id)),
      );
    if (rows.length === 0) return c.json({ message: "Post tidak ditemukan" }, 404);

    const scheduleIds = rows
      .filter((r) => r.platformPostId && (r.status === "publishing" || r.status === "failed"))
      .map((r) => String(r.platformPostId));

    const cred = await replizActiveCredentials();
    if (cred && scheduleIds.length > 0) {
      try {
        await replizMassDeleteSchedules(cred, scheduleIds);
      } catch (err) {
        // Best-effort: jangan gagalkan delete lokal (sama dgn cancel single).
        console.warn("[posts] Mass delete Repliz best-effort gagal:", err);
      }
    }

    // Job lokal dimatikan + baris DB dihapus per item.
    for (const r of rows) {
      await cancelPublishJob(r.id, r.platform);
      await db.delete(post).where(eq(post.id, r.id));
    }

    void fireActivity({
      orgId: ctx.organization.id,
      action: "post.mass_deleted",
      targetType: "post",
      targetId: ctx.organization.id,
      metadata: { count: rows.length, via: "repliz" },
    });

    return c.json({ ok: true, deleted: rows.length, scheduleCancelled: scheduleIds.length });
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /posts/item/:id/published — hapus post yang SUDAH tayang di platform.
 *
 * Dua jalur:
 * 1. Akun bridge Repliz → DELETE /public/content/{id}?accountId=… (Repliz yang
 *    menyimpan token platform).
 * 2. Akun native → `deletePublishedPost()` memakai token kita sendiri, hanya
 *    untuk platform di `DELETABLE_PLATFORMS` (threads/tiktok/bluesky/facebook).
 *    Instagram tidak punya endpoint hapus media di Graph API, jadi ditolak
 *    dengan pesan yang menjelaskan agar dihapus manual dari aplikasi IG. */
postsBridgeRoute.delete("/item/:id/published", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const [row] = await db
      .select({
        id: post.id,
        platform: post.platform,
        status: post.status,
        platformPostId: post.platformPostId,
        socialAccountId: post.socialAccountId,
        accountPlatformAccountId: socialAccount.platformAccountId,
      })
      .from(post)
      .innerJoin(postGroup, eq(post.postGroupId, postGroup.id))
      .innerJoin(socialAccount, eq(post.socialAccountId, socialAccount.id))
      .where(and(eq(post.id, c.req.param("id")), eq(postGroup.organizationId, ctx.organization.id)))
      .limit(1);
    if (!row) return c.json({ message: "Post tidak ditemukan" }, 404);
    if (row.status !== "published" || !row.platformPostId) {
      return c.json({ message: "Hanya post sudah tayang yang bisa dihapus dari platform" }, 400);
    }

    const [account] = await db
      .select({
        metadata: socialAccount.metadata,
        accessTokenEnc: socialAccount.accessTokenEnc,
      })
      .from(socialAccount)
      .where(eq(socialAccount.id, row.socialAccountId))
      .limit(1);
    const replizAccountId = (account?.metadata as { replizAccountId?: string } | null)
      ?.replizAccountId;

    if (replizAccountId) {
      // Jalur bridge Repliz (seperti sebelumnya)
      const cred = await replizActiveCredentials();
      if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);

      // Cek konten ada di Repliz (404 = sudah hilang/belum terbentuk → tetap lanjut).
      const contentId = await resolveReplizContentId(cred, replizAccountId, row.platformPostId);
      if (contentId) {
        await replizDeleteContent(cred, contentId, replizAccountId);
      }
    } else {
      // Jalur native: token kita sendiri.
      if (!canDeletePublishedPost(row.platform)) {
        return c.json(
          {
            message:
              "Platform ini belum mendukung hapus otomatis. Hapus manual di aplikasi platformnya.",
          },
          400,
        );
      }
      if (!account?.accessTokenEnc) {
        return c.json({ message: "Token akun tidak tersedia — hubungkan ulang akun" }, 400);
      }
      await deletePublishedPost({
        platform: row.platform,
        platformPostId: row.platformPostId,
        accessToken: decrypt(account.accessTokenEnc),
        platformAccountId: row.accountPlatformAccountId,
        accountMetadata: account.metadata as Record<string, unknown> | null,
      });
    }

    await db
      .update(post)
      .set({ status: "canceled", platformPostUrl: null })
      .where(eq(post.id, row.id));

    void fireActivity({
      orgId: ctx.organization.id,
      action: "post.deleted_from_platform",
      targetType: "post",
      targetId: row.id,
      metadata: { platform: row.platform, via: replizAccountId ? "repliz" : "native" },
    });

    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/**
 * Cari contentId Repliz untuk post yang sudah tayang. PlatformPostId kita =
 * postId platform (mis. IG media id). ContentId Repliz bisa sama atau berbeda —
 * scan halaman pertama GET /public/content?accountId=… untuk cocokkan id/url.
 * Return null bila tidak ketemu (post mungkin dihapus user di platform langsung).
 */
async function resolveReplizContentId(
  cred: NonNullable<Awaited<ReturnType<typeof replizActiveCredentials>>>,
  replizAccountId: string,
  platformPostId: string,
): Promise<string | null> {
  try {
    let nextToken: string | undefined;
    for (let page = 0; page < 5; page++) {
      const res = await replizListContent(cred, replizAccountId, { type: "media", nextToken });
      const hit = res.docs.find((d) => d.id === platformPostId);
      if (hit) return hit.id;
      if (!res.nextToken) break;
      nextToken = res.nextToken;
    }
    return null;
  } catch (err) {
    console.warn("[posts] Cari contentId Repliz gagal:", err);
    return null;
  }
}

/** POST /posts/:id/reminder — aktifkan pengingat push untuk post manual terjadwal.
 * Post manual (platform "manual") tidak dipublikasi otomatis — pengingat dikirim
 * `minutesBefore` menit sebelum scheduledAt via job queue "post-reminder". */
postsBridgeRoute.post("/:id/reminder", async (c) => {
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
postsBridgeRoute.post("/:id/publish", async (c) => {
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
      void emitWebhookEvent(ctx.organization.id, "post.published", {
        postGroupId: group.id,
        queued: queued.filter(Boolean).length,
      });
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

    void emitWebhookEvent(ctx.organization.id, "post.published", {
      postGroupId: group.id,
      published,
      processing,
      failed,
    });

    return c.json({ ok: true, published, processing, failed });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /posts/:id/retry — antrikan ulang post bridge Repliz yg gagal.
 * Hanya utk post failed yg dipublish via bridge (ada scheduleId Repliz di
 * platformPostId — disimpan pipeline saat adapter return "processing").
 * Memakai PUT /public/schedule/{id}/retry (konten & pengaturan sama). */
postsBridgeRoute.post("/:id/retry", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const [row] = await db
      .select({
        id: post.id,
        platform: post.platform,
        status: post.status,
        platformPostId: post.platformPostId,
        socialAccountId: post.socialAccountId,
        groupId: sql<string>`${post.postGroupId}`,
      })
      .from(post)
      .innerJoin(postGroup, eq(post.postGroupId, postGroup.id))
      .where(and(eq(post.id, c.req.param("id")), eq(postGroup.organizationId, ctx.organization.id)))
      .limit(1);
    if (!row) return c.json({ message: "Post tidak ditemukan" }, 404);
    if (row.status !== "failed") {
      return c.json({ message: "Hanya post gagal yang bisa diulang" }, 400);
    }
    // Handle schedule Repliz (platformPostId saat masih processing/gagal).
    // Post native tidak punya scheduleId Repliz → harus lewat /publish ulang.
    if (!row.platformPostId) {
      return c.json(
        { message: "Post ini tidak memiliki schedule bridge — gunakan Publish Ulang" },
        400,
      );
    }

    const [account] = await db
      .select({ metadata: socialAccount.metadata })
      .from(socialAccount)
      .where(eq(socialAccount.id, row.socialAccountId))
      .limit(1);
    const replizAccountId = (account?.metadata as { replizAccountId?: string } | null)
      ?.replizAccountId;
    if (!replizAccountId) {
      return c.json({ message: "Akun platform ini tidak terhubung via bridge Repliz" }, 400);
    }

    const cred = await replizActiveCredentials();
    if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);

    await replizRetrySchedule(cred, row.platformPostId);

    // Reset ke publishing + jalankan poll chain (sama dgn flow publish normal)
    await db
      .update(post)
      .set({ status: "publishing", errorCode: null, errorMessage: null })
      .where(eq(post.id, row.id));
    await enqueuePoll(row.id, row.platform);

    void fireActivity({
      orgId: ctx.organization.id,
      action: "post.retry",
      targetType: "post",
      targetId: row.id,
      metadata: { platform: row.platform },
    });

    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /posts/:id/landing — data untuk halaman landing push (post-failed / publish-ready).
 * id = postGroupId. Return ringkasan group + posts per platform + media URL. */
postsBridgeRoute.get("/:id/landing", async (c) => {
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
