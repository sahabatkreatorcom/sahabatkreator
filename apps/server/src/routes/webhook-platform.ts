// Webhook receiver platform social media — real-time push komentar/mention
// ke unified inbox (saat webhook di-approve platform).
// Sebelum approval: worker polling sync (engagement-sync.ts) menutup gap.
//
// Endpoint per aplikasi (bukan per platform):
// - /webhooks/meta → Instagram (akun bisnis via FB Login) & Facebook — SATU aplikasi Meta
//   GET handshake + POST verify X-Hub-Signature-256 (sha256 HMAC app secret Meta)
// - /webhooks/instagram-standalone → Instagram Login (API with Instagram Login) —
//   aplikasi TERPISAH (INSTAGRAM_APP_SECRET): verify token & app secret sendiri,
//   pola sama seperti Threads. Payload format Meta Graph, host graph.instagram.com.
// - /webhooks/threads → Threads — aplikasi sendiri (developers.threads.net),
//   verify token & app secret TERPISAH dari Meta
// - /webhooks/tiktok  → POST verify X-Signature (sha256(rawBody + client_secret)) + X-Timestamp
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@sahabatkreator/db";
import { platformCredential, socialAccount } from "@sahabatkreator/db/schema";
import { env } from "@sahabatkreator/env/server";
import { type EngagementUpsert, upsertEngagementItems } from "@sahabatkreator/publishing";
import { and, eq, or } from "drizzle-orm";
import { Hono } from "hono";
import { decrypt } from "../lib/crypto";

export const platformWebhookRoute = new Hono();

/** Ambil app secret platform: platform_credential DB → fallback env */
async function getAppSecret(platform: string): Promise<string | null> {
  const [cred] = await db
    .select({ clientSecretEnc: platformCredential.clientSecretEnc })
    .from(platformCredential)
    .where(
      and(
        eq(platformCredential.platform, platform as never),
        eq(platformCredential.isActive, true),
      ),
    )
    .limit(1);
  if (cred) {
    try {
      return decrypt(cred.clientSecretEnc);
    } catch {
      // fallthrough ke env
    }
  }
  const envKeys: Record<string, string | undefined> = {
    instagram: env.META_APP_SECRET,
    // Aplikasi IG Login terpisah — TANPA fallback ke META_APP_SECRET
    instagram_standalone: env.INSTAGRAM_APP_SECRET,
    facebook: env.META_APP_SECRET,
    threads: env.THREADS_APP_SECRET,
    tiktok: env.TIKTOK_CLIENT_SECRET,
  };
  return envKeys[platform] ?? null;
}

/**
 * Ambil webhook verify token platform: platform_credential DB (extraConfigEnc,
 * diisi admin di /admin/credentials) → fallback env.
 */
async function getWebhookVerifyToken(platform: string): Promise<string | null> {
  const [cred] = await db
    .select({ extraConfigEnc: platformCredential.extraConfigEnc })
    .from(platformCredential)
    .where(
      and(
        eq(platformCredential.platform, platform as never),
        eq(platformCredential.isActive, true),
      ),
    )
    .limit(1);
  if (cred?.extraConfigEnc) {
    try {
      const extra = JSON.parse(decrypt(cred.extraConfigEnc)) as Record<string, unknown>;
      if (typeof extra.webhookVerifyToken === "string" && extra.webhookVerifyToken) {
        return extra.webhookVerifyToken;
      }
    } catch {
      // fallthrough ke env
    }
  }
  const envKeys: Record<string, string | undefined> = {
    instagram: env.META_WEBHOOK_VERIFY_TOKEN,
    instagram_standalone: env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ?? env.META_WEBHOOK_VERIFY_TOKEN,
    facebook: env.META_WEBHOOK_VERIFY_TOKEN,
    threads: env.THREADS_WEBHOOK_VERIFY_TOKEN ?? env.META_WEBHOOK_VERIFY_TOKEN,
  };
  return envKeys[platform] ?? null;
}

/** Cari akun by platformAccountId (IG user id / page id / TikTok open_id) */
async function findAccount(platformIds: string[], platform: string) {
  // open_id TikTok sama untuk semua platform; IG id unik
  const [account] = await db
    .select({
      id: socialAccount.id,
      organizationId: socialAccount.organizationId,
      platform: socialAccount.platform,
    })
    .from(socialAccount)
    .where(
      and(
        or(...platformIds.map((id) => eq(socialAccount.platformAccountId, id))),
        or(...platform.split(",").map((p) => eq(socialAccount.platform, p as never))),
      ),
    )
    .limit(1);
  return account ?? null;
}

/** Verifikasi HMAC SHA-256 timing-safe */
function verifySignature(raw: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  const received = signature.replace(/^sha256=/, "");
  if (received.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
  } catch {
    return false;
  }
}

/**
 * Guard secret webhook platform — FAIL-CLOSED.
 * Jika secret tidak dikonfigurasi (DB & env kosong), payload DITOLAK 503.
 * Menerima payload tanpa verifikasi membuka pintu spoofing komentar/mention.
 */
function requireWebhookSecret(
  secret: string | null | undefined,
  platformLabel: string,
): Response | null {
  if (!secret) {
    console.error(
      `[webhook] ${platformLabel}: secret belum dikonfigurasi (DB & env kosong) — ` +
        "payload DITOLAK. Isi kredensial platform di panel admin atau env.",
    );
    return Response.json(
      { message: "Webhook secret platform belum dikonfigurasi" },
      { status: 503 },
    );
  }
  return null;
}

/**
 * Proses payload webhook format Meta Graph (IG/FB/Threads share struktur
 * entry[].changes[]). Platform list membatasi akun mana yang dianggap.
 * Returns jumlah item baru, atau null bila payload invalid.
 */
async function processMetaPayload(raw: string, platformsCsv: string): Promise<number | null> {
  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }

  // entry[].id = IG user id / page id (payload.object hanya nama objek: "instagram"/"page"/"threads")
  const items: EngagementUpsert[] = [];
  for (const entry of payload?.entry ?? []) {
    const entryId = String(entry?.id ?? "");
    if (!entryId) continue;
    const account = await findAccount([entryId], platformsCsv);
    if (!account) continue;

    for (const change of entry?.changes ?? []) {
      const value = change?.value ?? {};
      if (change?.field === "comments" && value?.id) {
        // Komentar IG: { id, text, from: {id, username}, media: {id, media_product_type} }
        items.push({
          socialAccountId: account.id,
          organizationId: account.organizationId,
          type: "comment",
          platformItemId: String(value.id),
          platformAuthorId: value?.from?.id ? String(value.from.id) : null,
          authorUsername: value?.from?.username ? `@${value.from.username}` : null,
          authorName: value?.from?.username ?? null,
          content: value?.text ?? null,
          parentId: value?.media?.id ? String(value.media.id) : null,
          occurredAt: value?.created_time ? new Date(value.created_time * 1000) : null,
        });
      } else if (change?.field === "mentions" && value?.comment_id) {
        items.push({
          socialAccountId: account.id,
          organizationId: account.organizationId,
          type: "mention",
          platformItemId: String(value.comment_id),
          platformAuthorId: value?.from?.id ? String(value.from.id) : null,
          authorUsername: value?.username ? `@${value.username}` : null,
          content: value?.text ?? null,
          mediaUrl: value?.media_url ?? null,
          occurredAt: null,
        });
      } else if (change?.field === "threads" && value?.id) {
        items.push({
          socialAccountId: account.id,
          organizationId: account.organizationId,
          type: "post",
          platformItemId: String(value.id),
          content: value?.text ?? null,
          occurredAt: value?.timestamp ? new Date(value.timestamp) : null,
        });
      }
    }
  }

  const newItems = await upsertEngagementItems(items);
  return newItems;
}

/** GET handshake standar Meta (hub.mode/hub.verify_token/hub.challenge) */
function metaVerification(
  c: { req: { query: (k: string) => string | undefined } },
  verifyToken: string | undefined,
) {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge");
  if (mode === "subscribe" && token && verifyToken && token === verifyToken) {
    return challenge ?? "";
  }
  return null;
}

/**
 * Ambil timestamp payload TikTok (fallback bila header tidak dikirim).
 * Struktur yang ditangani: { event, data: { create_time } } atau
 * { event, create_time } / field timestamp di root (variasi antar versi API).
 * Return nilai mentah (string) atau null bila tidak ada.
 */
function extractTikTokTimestamp(raw: string): string | null {
  try {
    const payload = JSON.parse(raw) as Record<string, unknown>;
    const data = (payload.data ?? {}) as Record<string, unknown>;
    for (const candidate of [
      data.create_time,
      payload.create_time,
      payload.timestamp,
      data.timestamp,
    ]) {
      if (typeof candidate === "number" || typeof candidate === "string") {
        return String(candidate);
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Meta webhook — Instagram (akun bisnis via FB Login) & Facebook.
// Satu aplikasi Meta: verify token & app secret sama untuk keduanya.
// ---------------------------------------------------------------------------

platformWebhookRoute.get("/webhooks/meta", async (c) => {
  // Verify token: DB (kredensial admin) → fallback env. Instagram & Facebook
  // satu aplikasi Meta — cek keduanya, instagram lebih dulu.
  const verifyToken = (await getWebhookVerifyToken("instagram")) ?? env.META_WEBHOOK_VERIFY_TOKEN;
  const challenge = metaVerification(c, verifyToken ?? undefined);
  if (challenge === null) return c.text("Forbidden", 403);
  return c.text(challenge);
});

platformWebhookRoute.post("/webhooks/meta", async (c) => {
  const raw = await c.req.text();

  // Signature verification — app secret aplikasi Meta (IG bisnis/FB), fail-closed
  const signature = c.req.header("x-hub-signature-256") ?? "";
  const secret = (await getAppSecret("instagram")) ?? env.META_APP_SECRET;
  const rejected = requireWebhookSecret(secret, "meta");
  if (rejected) return rejected;
  if (!verifySignature(raw, signature, secret!)) {
    return c.json({ message: "Invalid signature" }, 401);
  }

  const newItems = await processMetaPayload(raw, "instagram,facebook");
  if (newItems === null) return c.json({ message: "Invalid JSON" }, 400);
  return c.json({ received: true, newItems });
});

// ---------------------------------------------------------------------------
// Instagram standalone webhook — Instagram Login (API with Instagram Login).
// Aplikasi TERPISAH dari Meta app utama: verify token & app secret sendiri
// (INSTAGRAM_WEBHOOK_VERIFY_TOKEN / INSTAGRAM_APP_SECRET). Payload format
// sama seperti Meta Graph (entry[].changes[]).
// ---------------------------------------------------------------------------

platformWebhookRoute.get("/webhooks/instagram-standalone", async (c) => {
  // Verify token: DB (kredensial admin, aplikasi IG Login terpisah) → fallback env
  const verifyToken =
    (await getWebhookVerifyToken("instagram_standalone")) ??
    env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ??
    env.META_WEBHOOK_VERIFY_TOKEN;
  const challenge = metaVerification(c, verifyToken ?? undefined);
  if (challenge === null) return c.text("Forbidden", 403);
  return c.text(challenge);
});

platformWebhookRoute.post("/webhooks/instagram-standalone", async (c) => {
  const raw = await c.req.text();

  // Signature verification — app secret Instagram standalone, fail-closed.
  // TIDAK fallback ke META_APP_SECRET: payload standalone ditandatangani
  // secret aplikasi IG Login, bukan aplikasi Meta.
  const signature = c.req.header("x-hub-signature-256") ?? "";
  const secret = await getAppSecret("instagram_standalone");
  const rejected = requireWebhookSecret(secret, "instagram-standalone");
  if (rejected) return rejected;
  if (!verifySignature(raw, signature, secret!)) {
    return c.json({ message: "Invalid signature" }, 401);
  }

  const newItems = await processMetaPayload(raw, "instagram_standalone");
  if (newItems === null) return c.json({ message: "Invalid JSON" }, 400);
  return c.json({ received: true, newItems });
});

// ---------------------------------------------------------------------------
// Threads webhook — aplikasi TERPISAH dari Meta (developers.threads.net).
// Verify token & app secret sendiri; format payload sama seperti Meta Graph.
// ---------------------------------------------------------------------------

platformWebhookRoute.get("/webhooks/threads", async (c) => {
  // Verify token: DB (kredensial admin, aplikasi Threads terpisah) → fallback env
  const verifyToken =
    (await getWebhookVerifyToken("threads")) ??
    env.THREADS_WEBHOOK_VERIFY_TOKEN ??
    env.META_WEBHOOK_VERIFY_TOKEN;
  const challenge = metaVerification(c, verifyToken ?? undefined);
  if (challenge === null) return c.text("Forbidden", 403);
  return c.text(challenge);
});

platformWebhookRoute.post("/webhooks/threads", async (c) => {
  const raw = await c.req.text();

  // Signature verification — app secret Threads, fail-closed
  const signature = c.req.header("x-hub-signature-256") ?? "";
  const secret = (await getAppSecret("threads")) ?? env.THREADS_APP_SECRET;
  const rejected = requireWebhookSecret(secret, "threads");
  if (rejected) return rejected;
  if (!verifySignature(raw, signature, secret!)) {
    return c.json({ message: "Invalid signature" }, 401);
  }

  const newItems = await processMetaPayload(raw, "threads");
  if (newItems === null) return c.json({ message: "Invalid JSON" }, 400);
  return c.json({ received: true, newItems });
});

// ---------------------------------------------------------------------------
// TikTok webhook — comment events
// ---------------------------------------------------------------------------

platformWebhookRoute.post("/webhooks/tiktok", async (c) => {
  const raw = await c.req.text();

  // X-Signature = sha256(rawBody + client_secret); header terpisah signature & timestamp.
  // Fail-closed: secret wajib terkonfigurasi — tanpa verifikasi payload ditolak.
  const signature = c.req.header("x-signature") ?? "";
  const secret = await getAppSecret("tiktok");
  const rejected = requireWebhookSecret(secret, "tiktok");
  if (rejected) return rejected;

  // Replay protection: timestamp TikTok wajib segar (selisih ≤ 5 menit).
  // Payload lama yang direplay penyerang (signature valid tapi kadaluarsa)
  // ditolak — signature TikTok mencakup timestamp sehingga tidak bisa dipalsukan.
  const TIKTOK_MAX_AGE_MS = 5 * 60 * 1000;
  const timestampHeader = c.req.header("t-timestamp") ?? c.req.header("timestamp");
  const timestampValue = timestampHeader ?? extractTikTokTimestamp(raw);
  const timestampMs = timestampValue !== null ? Number(timestampValue) : Number.NaN;
  // TikTok mengirim timestamp dalam detik; terima ms juga utk toleransi
  const normalized = timestampMs > 1e12 ? timestampMs : timestampMs * 1000;
  if (
    timestampValue === null ||
    !Number.isFinite(normalized) ||
    Math.abs(Date.now() - normalized) > TIKTOK_MAX_AGE_MS
  ) {
    return c.json({ message: "Timestamp webhook tidak valid atau kedaluwarsa" }, 401);
  }

  if (secret) {
    const composed = createHmac("sha256", secret)
      .update(raw + secret, "utf8")
      .digest("hex");
    if (
      signature.length !== composed.length ||
      !timingSafeEqual(Buffer.from(composed, "hex"), Buffer.from(signature, "hex"))
    ) {
      return c.json({ message: "Invalid signature" }, 401);
    }
  }

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return c.json({ message: "Invalid JSON" }, 400);
  }

  // Event format TikTok: { event: "comment.create", data: { open_id, comment_id, video_id, content, create_time } }
  const data = payload?.data ?? {};
  const openId = String(data?.open_id ?? payload?.open_id ?? "");
  if (!openId) return c.json({ received: true, ignored: true });

  const account = await findAccount([openId], "tiktok");
  if (!account) return c.json({ received: true, ignored: true });

  const items: EngagementUpsert[] = [];
  if (payload?.event === "comment.create" && data?.comment_id) {
    items.push({
      socialAccountId: account.id,
      organizationId: account.organizationId,
      type: "comment",
      platformItemId: String(data.comment_id),
      parentId: data?.video_id ? String(data.video_id) : null,
      content: data?.content ?? null,
      occurredAt: data?.create_time ? new Date(data.create_time * 1000) : null,
    });
  }

  const newItems = await upsertEngagementItems(items);
  return c.json({ received: true, newItems });
});
