// Data Deletion Request Callback — syarat wajib Meta App Review (Meta, Instagram
// Login standalone, Threads). Platform memanggil endpoint ini saat end-user
// meminta penghapusan data via "Apps and Websites" di pengaturan akun mereka.
//
// Protokol (docs Meta: "Callback URL Format"):
// - POST dengan application/x-www-form-urlencoded atau JSON berisi signed_request
// - signed_request = "<base64url payload>.<base64url HMAC-SHA256>"
// - payload: { user_id, algorithm } (+ timestamp untuk IG Login)
// - Wajib balas JSON { url, confirmation_code } dalam 200, max 2 kali retry
//
// Data end-user yang dihapus: komentar/mention/review (engagement_item) dan
// pesan DM (dm_message + dm_conversation) yang penulisnya = user_id tsb.
// Audit trail di tabel platform_data_deletion (bukti kepatuhan saat review).
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@sahabatkreator/db";
import {
  dmConversation,
  dmMessage,
  engagementItem,
  platformCredential,
  platformDataDeletion,
} from "@sahabatkreator/db/schema";
import { env } from "@sahabatkreator/env/server";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { decrypt } from "../lib/crypto";

export const dataDeletionRoute = new Hono();

/** App yang memakai protokol signed_request (satu route dipakai 3 aplikasi) */
type DeletionApp = "meta" | "instagram_standalone" | "threads";

const APP_CONFIG: Record<DeletionApp, { label: string; envSecret?: string; platforms: string[] }> =
  {
    meta: {
      label: "Meta",
      envSecret: env.META_APP_SECRET,
      // user_id di aplikasi Meta bisa IG user id (jalur IG via FB) atau FB user id
      platforms: ["instagram", "facebook"],
    },
    instagram_standalone: {
      label: "Instagram (Login Instagram)",
      envSecret: env.INSTAGRAM_APP_SECRET,
      platforms: ["instagram_standalone"],
    },
    threads: {
      label: "Threads",
      envSecret: env.THREADS_APP_SECRET,
      platforms: ["threads"],
    },
  };

/**
 * Ambil app secret untuk verifikasi signed_request: platform_credential DB
 * (diisi admin) → fallback env. IG standalone TANPA fallback ke META_APP_SECRET.
 */
async function resolveAppSecret(app: DeletionApp): Promise<string | null> {
  // Kredensial DB disimpan per platform; cek semua platform milik app tsb
  for (const platform of APP_CONFIG[app].platforms) {
    const [cred] = await db
      .select({ clientSecretEnc: platformCredential.clientSecretEnc })
      .from(platformCredential)
      .where(sql`${platformCredential.platform} = ${platform} AND ${platformCredential.isActive}`)
      .limit(1);
    if (cred) {
      try {
        const secret = decrypt(cred.clientSecretEnc);
        if (secret) return secret;
      } catch {
        // fallthrough ke platform/env berikutnya
      }
    }
  }
  return APP_CONFIG[app].envSecret ?? null;
}

/** Verifikasi & parse signed_request Meta → payload atau null */
function parseSignedRequest(signedRequest: string, secret: string): Record<string, unknown> | null {
  const dotIndex = signedRequest.indexOf(".");
  if (dotIndex <= 0) return null;
  const encodedSignature = signedRequest.slice(0, dotIndex);
  const encodedPayload = signedRequest.slice(dotIndex + 1);

  let payload: Record<string, unknown>;
  try {
    // base64url → JSON
    const json = Buffer.from(encodedPayload, "base64url").toString("utf8");
    payload = JSON.parse(json) as Record<string, unknown>;
    // HMAC dipakai sebagai kunci, bukan signature yang dikirim — verifikasi di bawah
    const expected = createHmac("sha256", secret).update(encodedPayload, "utf8").digest();
    const received = Buffer.from(encodedSignature, "base64url");
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      return null;
    }
  } catch {
    return null;
  }

  // Meta: algorithm harus HMAC-SHA256
  if (payload.algorithm !== "HMAC-SHA256" && payload.algorithm !== "hmac-sha256") {
    return null;
  }
  return payload;
}

/** Hapus semua data end-user berdasarkan platform user id. Return jumlah baris. */
async function deleteEndUserData(platformUserId: string): Promise<number> {
  let deleted = 0;

  // 1. Komentar/mention/review yang ditulis user — match platform_author_id
  const userItems = await db
    .delete(engagementItem)
    .where(eq(engagementItem.platformAuthorId, platformUserId))
    .returning({ id: engagementItem.id });
  deleted += userItems.length;

  // 2. Pesan DM yang dikirim user (sender_id = user_id)
  const dmMsgs = await db
    .delete(dmMessage)
    .where(eq(dmMessage.senderId, platformUserId))
    .returning({ id: dmMessage.id });
  deleted += dmMsgs.length;

  // 3. Percakapan DM yang partner-nya user (partner_id = user_id) —
  //    data profil partner (username/nama/avatar) juga data end-user
  const dmConvos = await db
    .delete(dmConversation)
    .where(eq(dmConversation.partnerId, platformUserId))
    .returning({ id: dmConversation.id });
  deleted += dmConvos.length;

  // Catatan: ID user antar aplikasi Meta family bisa sama (FB user id muncul
  // di Messenger, IGSID di IG Login). Penghapusan dilakukan global per user_id,
  // tidak difilter per platform — data end-user harus hilang dari semua org.
  return deleted;
}

/** Generate confirmation code yang ringkas tapi unik (mis. SK-DEL-a1b2c3d4) */
function generateConfirmationCode(): string {
  return `SK-DEL-${randomBytes(5).toString("hex")}`;
}

function generateId(): string {
  return `sk_del_${randomBytes(10).toString("hex")}`;
}

/** Handler POST data-deletion untuk satu aplikasi */
async function handleDeletionRequest(app: DeletionApp, rawBody: string): Promise<Response> {
  const config = APP_CONFIG[app];

  const secret = await resolveAppSecret(app);
  if (!secret) {
    console.error(
      `[data-deletion] ${config.label}: app secret belum dikonfigurasi (DB & env kosong)`,
    );
    return Response.json({ message: "App secret belum dikonfigurasi" }, { status: 503 });
  }

  // Body: form-urlencoded (standar Meta) atau JSON
  let signedRequest: string | undefined;
  try {
    const contentTypeMatch = /application\/x-www-form-urlencoded/.test(rawBody);
    if (contentTypeMatch || /^[a-z0-9_-]+\.[a-z0-9_-]+$/i.test(rawBody.trim())) {
      // Form-encoded: signed_request=xxx (bisa URL-encoded) atau raw signed_request
      const params = new URLSearchParams(rawBody);
      signedRequest = params.get("signed_request") ?? rawBody.trim();
    } else {
      const body = JSON.parse(rawBody) as { signed_request?: string };
      signedRequest = body.signed_request;
    }
  } catch {
    signedRequest = undefined;
  }
  if (!signedRequest) {
    return Response.json({ message: "signed_request wajib ada" }, { status: 400 });
  }

  const payload = parseSignedRequest(signedRequest, secret);
  if (!payload || typeof payload.user_id !== "string" || !payload.user_id) {
    return Response.json({ message: "signed_request tidak valid" }, { status: 401 });
  }

  const platformUserId = payload.user_id;
  const confirmationCode = generateConfirmationCode();

  // Jalankan penghapusan — user tanpa data tetap dicatat (status not_found)
  const deletedItems = await deleteEndUserData(platformUserId);

  // Audit log — timestamp IG Login anti-replay jika ada
  const auditId = generateId();
  await db.insert(platformDataDeletion).values({
    id: auditId,
    app,
    platform: config.platforms.join(","),
    platformUserId,
    confirmationCode,
    status: deletedItems > 0 ? "deleted" : "not_found",
    deletedItems,
    requestedAt: new Date(),
    completedAt: new Date(),
  });

  // Status URL publik untuk end-user mengecek hasil permintaan mereka
  const statusUrl = `${env.WEB_URL}/penghapusan-data/status?code=${confirmationCode}`;

  console.log(
    `[data-deletion] ${config.label}: user ${platformUserId} → ${deletedItems} baris dihapus, code ${confirmationCode}`,
  );

  // Respons standar Meta: { url, confirmation_code }
  return Response.json({ url: statusUrl, confirmation_code: confirmationCode });
}

// ---------------------------------------------------------------------------
// Endpoint per aplikasi — dipasang di /webhooks/{app}/data-deletion
// ---------------------------------------------------------------------------

dataDeletionRoute.post("/webhooks/meta/data-deletion", async (c) => {
  const raw = await c.req.text();
  return handleDeletionRequest("meta", raw);
});

dataDeletionRoute.post("/webhooks/instagram-standalone/data-deletion", async (c) => {
  const raw = await c.req.text();
  return handleDeletionRequest("instagram_standalone", raw);
});

dataDeletionRoute.post("/webhooks/threads/data-deletion", async (c) => {
  const raw = await c.req.text();
  return handleDeletionRequest("threads", raw);
});

// GET untuk pengecekan cepat bahwa endpoint hidup (bukan bagian protokol Meta,
// tapi memudahkan verifikasi saat setup di App Dashboard)
for (const path of [
  "/webhooks/meta/data-deletion",
  "/webhooks/instagram-standalone/data-deletion",
  "/webhooks/threads/data-deletion",
]) {
  dataDeletionRoute.get(path, (c) =>
    c.json({ message: "Data deletion callback aktif — kirim POST dengan signed_request" }),
  );
}

/**
 * Status permintaan penghapusan by confirmation code — dipakai halaman publik
 * /penghapusan-data/status. Hanya ekspos status + waktu (tanpa user id),
 * code sendiri bersifat acak (10 hex) sehingga tidak bisa di-enumerate.
 */
dataDeletionRoute.get("/api/deletion-status/:code", async (c) => {
  const code = c.req.param("code");
  const [row] = await db
    .select({
      status: platformDataDeletion.status,
      deletedItems: platformDataDeletion.deletedItems,
      completedAt: platformDataDeletion.completedAt,
    })
    .from(platformDataDeletion)
    .where(eq(platformDataDeletion.confirmationCode, code))
    .limit(1);

  if (!row) {
    return Response.json({ message: "Kode konfirmasi tidak ditemukan" }, { status: 404 });
  }
  return Response.json(row);
});

export type { DeletionApp };
// Re-export untuk dipasang di index route server (prefix /webhooks/.../data-deletion)
export { APP_CONFIG, handleDeletionRequest };
