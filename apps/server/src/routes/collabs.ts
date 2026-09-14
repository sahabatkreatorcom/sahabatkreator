// API Collabs Inbox — undangan kolaborasi Instagram (accept/decline)
// Proxy real-time ke Graph API /collab_posts — tidak dipersist (ephemeral, on-demand).
// Riset: developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/collab_posts
// Butuh permission instagram_manage_contents.

import { db } from "@sahabatkreator/db";
import { platformSettings, socialAccount } from "@sahabatkreator/db/schema";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { errorResponse, requireOrg } from "../lib/auth-guard";
import { decrypt } from "../lib/crypto";

export const collabsRoute = new Hono();

type CollabInvite = {
  mediaId: string;
  mediaType: string;
  permalink: string | null;
  caption: string | null;
  timestamp: string | null;
  inviterId: string;
  inviterUsername: string;
};

type GraphCollabItem = {
  id: string;
  media_type?: string;
  permalink?: string;
  caption?: string;
  timestamp?: string;
  owner?: { id?: string; username?: string };
};

type GraphError = { error?: { code?: number; message?: string } };

function graphHost(platform: string): string {
  // graph.facebook.com (jalur FB) atau graph.instagram.com (standalone)
  const version = process.env.META_GRAPH_VERSION || "v26.0";
  return platform === "instagram"
    ? `https://graph.facebook.com/${version}`
    : `https://graph.instagram.com/${version}`;
}

/** Muat akun IG milik org + token decrypt — throw pesan ramah bila tidak siap */
async function loadIgAccount(orgId: string, accountId: string) {
  const [account] = await db
    .select({
      id: socialAccount.id,
      platform: socialAccount.platform,
      platformAccountId: socialAccount.platformAccountId,
      username: socialAccount.username,
      accessTokenEnc: socialAccount.accessTokenEnc,
      isConnected: socialAccount.isConnected,
    })
    .from(socialAccount)
    .where(and(eq(socialAccount.id, accountId), eq(socialAccount.organizationId, orgId)))
    .limit(1);

  if (!account) return { error: "Akun tidak ditemukan", status: 404 as const };
  if (account.platform !== "instagram" && account.platform !== "instagram_standalone") {
    return { error: "Undangan kolaborasi hanya tersedia untuk Instagram", status: 400 as const };
  }
  if (!account.isConnected || !account.accessTokenEnc) {
    return { error: "Akun belum terhubung — hubungkan ulang akun Instagram", status: 400 as const };
  }
  const accessToken = decrypt(account.accessTokenEnc);
  if (!accessToken) {
    return { error: "Token tidak bisa dibaca — hubungkan ulang akun", status: 400 as const };
  }
  return { account, accessToken };
}

/** Cek fitur collab aktif di platform settings (singleton). Default aktif. */
async function isCollabEnabled(): Promise<boolean> {
  const [settings] = await db
    .select({ collabEnabled: platformSettings.collabEnabled })
    .from(platformSettings)
    .where(eq(platformSettings.id, "singleton"))
    .limit(1);
  return settings ? settings.collabEnabled : true;
}

/** GET /accounts/:id/collabs — list pending collab invites */
collabsRoute.get("/:id/collabs", async (c) => {
  try {
    const ctx = await requireOrg(c);
    if (!(await isCollabEnabled())) {
      return c.json({ message: "Fitur kolaborasi dinonaktifkan oleh admin" }, 403);
    }
    const loaded = await loadIgAccount(ctx.organization.id, c.req.param("id"));
    if ("error" in loaded) return c.json({ message: loaded.error }, loaded.status);
    const { account, accessToken } = loaded;

    const res = await fetch(
      `${graphHost(account.platform)}/${account.platformAccountId}/collab_posts?fields=id,media_type,permalink,caption,timestamp,owner{id,username}&access_token=${encodeURIComponent(accessToken)}`,
    );
    const body = (await res.json()) as
      | GraphCollabItem[]
      | GraphError
      | { data?: GraphCollabItem[] };

    if (!res.ok) {
      const err = (body as GraphError).error;
      // Endpoint belum tersedia utk akun ini → anggap kosong (graceful, ikut pola reference)
      if (err?.code === 2500 || err?.message?.includes("/collab_posts")) {
        return c.json({ invites: [] as CollabInvite[] });
      }
      console.error("[collabs] Graph error:", err?.message);
      return c.json({ message: "Gagal mengambil undangan kolaborasi dari Instagram" }, 502);
    }

    const items = Array.isArray(body) ? body : ((body as { data?: GraphCollabItem[] }).data ?? []);
    const invites: CollabInvite[] = items.map((item) => ({
      mediaId: item.id,
      mediaType: item.media_type ?? "IMAGE",
      permalink: item.permalink ?? null,
      caption: item.caption ?? null,
      timestamp: item.timestamp ?? null,
      inviterId: item.owner?.id ?? "",
      inviterUsername: item.owner?.username ?? "unknown",
    }));
    return c.json({ invites });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /accounts/:id/collabs — respond invite (accept/decline) */
collabsRoute.post("/:id/collabs", async (c) => {
  try {
    const ctx = await requireOrg(c);
    if (!(await isCollabEnabled())) {
      return c.json({ message: "Fitur kolaborasi dinonaktifkan oleh admin" }, 403);
    }
    const loaded = await loadIgAccount(ctx.organization.id, c.req.param("id"));
    if ("error" in loaded) return c.json({ message: loaded.error }, loaded.status);
    const { account, accessToken } = loaded;

    const input = z
      .object({
        mediaId: z.string().min(1).max(100),
        action: z.enum(["accept", "decline"]),
      })
      .parse(await c.req.json());

    const res = await fetch(
      `${graphHost(account.platform)}/${input.mediaId}/collab_posts?action=${input.action}&access_token=${encodeURIComponent(accessToken)}`,
      { method: "POST" },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as GraphError;
      console.error("[collabs] Graph respond error:", body.error?.message);
      return c.json(
        { message: `Gagal ${input.action === "accept" ? "menerima" : "menolak"} undangan` },
        502,
      );
    }
    return c.json({ ok: true, action: input.action });
  } catch (error) {
    return errorResponse(error);
  }
});
