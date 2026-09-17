// POST /oauth/bluesky/connect — Bluesky via app password (input manual, bukan OAuth redirect).

import { db } from "@sahabatkreator/db";
import { socialAccount } from "@sahabatkreator/db/schema";
import { env } from "@sahabatkreator/env/server";
import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import { z } from "zod";
import { fireActivity } from "../../lib/activity-log";
import { errorResponse, requireOrg } from "../../lib/auth-guard";
import { checkFeatureGate } from "../../lib/billing";
import { encrypt } from "../../lib/crypto";
import { generateId } from "../../lib/id";

/**
 * POST /oauth/bluesky/connect — Bluesky via app password (input manual, bukan OAuth redirect).
 * Body: { handle, appPassword }
 */
export async function handleBlueskyConnect(c: Context): Promise<Response> {
  try {
    const ctx = await requireOrg(c);
    await checkFeatureGate(ctx.organization.id, "social_accounts");

    const input = z
      .object({
        handle: z.string().min(3).max(200),
        appPassword: z.string().min(8).max(200),
      })
      .parse(await c.req.json());

    // Validasi kredensial: createSession di PDS
    const pds = env.BLUESKY_PDS_URL || "https://bsky.social";
    const res = await fetch(`${pds}/xrpc/com.atproto.server.createSession`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: input.handle,
        password: input.appPassword,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return c.json({ message: `Login Bluesky gagal: ${text.slice(0, 200) || res.status}` }, 400);
    }
    const session = (await res.json()) as {
      did?: string;
      handle?: string;
      email?: string;
      accessJwt?: string;
    };
    if (!session.did) {
      return c.json({ message: "Bluesky tidak mengembalikan DID" }, 400);
    }

    // Avatar profil — getProfile pakai accessJwt dari session (best effort)
    let avatarUrl: string | null = null;
    if (session.accessJwt) {
      try {
        const profRes = await fetch(
          `${pds}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(session.did)}`,
          { headers: { Authorization: `Bearer ${session.accessJwt}` } },
        );
        if (profRes.ok) {
          const prof = (await profRes.json()) as { avatar?: string };
          avatarUrl = prof.avatar ?? null;
        }
      } catch {
        // best effort — akun tetap tersambung tanpa avatar
      }
    }

    // Upsert akun — app password disimpan sebagai "accessToken" (dipakai adapter createSession)
    const [existing] = await db
      .select({ id: socialAccount.id, organizationId: socialAccount.organizationId })
      .from(socialAccount)
      .where(
        and(
          eq(socialAccount.platform, "bluesky"),
          eq(socialAccount.platformAccountId, session.did),
        ),
      )
      .limit(1);

    if (existing && existing.organizationId !== ctx.organization.id) {
      return c.json({ message: "Akun ini sudah terhubung di organisasi lain." }, 409);
    }

    if (existing) {
      await db
        .update(socialAccount)
        .set({
          username: session.handle ?? input.handle,
          avatarUrl,
          accessTokenEnc: encrypt(input.appPassword),
          isConnected: true,
          lastError: null,
          lastSyncedAt: new Date(),
        })
        .where(eq(socialAccount.id, existing.id));

      // Catat aktivitas org: Bluesky di-reconnect
      fireActivity({
        orgId: ctx.organization.id,
        userId: ctx.user.id,
        action: "account.reconnected",
        targetType: "social_account",
        targetId: existing.id,
        metadata: { platform: "bluesky", username: session.handle ?? input.handle },
      });
    } else {
      const blueskyId = generateId("socacc");
      await db.insert(socialAccount).values({
        id: blueskyId,
        organizationId: ctx.organization.id,
        platform: "bluesky",
        platformAccountId: session.did,
        username: session.handle ?? input.handle,
        avatarUrl,
        accessTokenEnc: encrypt(input.appPassword),
        scopes: ["app_password"],
        isConnected: true,
        lastSyncedAt: new Date(),
      });

      // Catat aktivitas org: Bluesky terhubung
      fireActivity({
        orgId: ctx.organization.id,
        userId: ctx.user.id,
        action: "account.connected",
        targetType: "social_account",
        targetId: blueskyId,
        metadata: { platform: "bluesky", username: session.handle ?? input.handle },
      });
    }

    return c.json({ ok: true, handle: session.handle ?? input.handle }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
