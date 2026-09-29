// API key creator — CRUD token Public API (/v1).
//
// Plaintext token HANYA dikembalikan pada POST / (create) dan POST /:id/rotate;
// setelah itu yang tersimpan di DB hanyalah SHA-256-nya, jadi tidak bisa
// dikembalikan lagi. List tidak pernah mengirim tokenHash.
//
// Semua endpoint di sini memakai SESSION (cookie browser), bukan API key —
// mengelola token tidak boleh bisa dilakukan dengan token itu sendiri.

import { db } from "@sahabatkreator/db";
import {
  API_KEY_SCOPES,
  type ApiKeyScope,
  apiKey as apiKeyTable,
  isApiKeyScope,
} from "@sahabatkreator/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { generateApiKey } from "../lib/api-key";
import { errorResponse, requireOrgAdmin } from "../lib/auth-guard";
import { checkPlanFeature } from "../lib/billing";
import { resolveDeveloperApp } from "../lib/developer-app";
import { generateId } from "../lib/id";
import { API_FEATURES } from "../lib/public-api";

export const apiKeyRoute = new Hono();

/** Batas key aktif per org — mencegah spam pembuatan. */
const MAX_ACTIVE_KEYS = 10;

const scopeSchema = z
  .string()
  .refine((value): value is ApiKeyScope => isApiKeyScope(value), "Scope tidak dikenal");

const createKeySchema = z.object({
  name: z.string().trim().min(1, "Nama key wajib diisi").max(100),
  // Minimal satu scope; kosong = tidak bisa memanggil endpoint bermodule
  scopes: z.array(scopeSchema).min(1, "Pilih minimal satu scope").max(API_KEY_SCOPES.length),
  // Opsional: key kedaluwarsa otomatis (disarankan untuk integrasi pihak ketiga)
  expiresInDays: z.number().int().min(1).max(3650).optional(),
  // Opsional: ikat key ke developer app → key ini boleh memakai endpoint connect
  // akun lewat API (`GET /v1/accounts/:platform/authorize`) dan mewarisi allowlist
  // redirect app tersebut. Tanpa app, endpoint itu menjawab 403 — tidak ada tujuan
  // redirect yang bisa dipercaya. Lihat docs/rfc-oauth-connect.md.
  developerAppId: z.string().trim().min(1).optional(),
});

/** Bentuk aman untuk list — tanpa tokenHash. */
const listColumns = {
  id: apiKeyTable.id,
  name: apiKeyTable.name,
  tokenPrefix: apiKeyTable.tokenPrefix,
  scopes: apiKeyTable.scopes,
  developerAppId: apiKeyTable.developerAppId,
  createdAt: apiKeyTable.createdAt,
  lastUsedAt: apiKeyTable.lastUsedAt,
  revokedAt: apiKeyTable.revokedAt,
  expiresAt: apiKeyTable.expiresAt,
};

/** GET /api/api-keys — semua key milik org aktif (terbaru dulu) */
apiKeyRoute.get("/", async (c) => {
  try {
    const ctx = await requireOrgAdmin(c);
    const rows = await db
      .select(listColumns)
      .from(apiKeyTable)
      .where(eq(apiKeyTable.organizationId, ctx.organization.id))
      .orderBy(desc(apiKeyTable.createdAt));
    return c.json({ keys: rows });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /api/api-keys — buat key baru, plaintext dikembalikan SEKALI */
apiKeyRoute.post("/", async (c) => {
  try {
    const ctx = await requireOrgAdmin(c);
    const orgId = ctx.organization.id;
    // Plan tanpa Public API tidak boleh menerbitkan token (402 + upsell)
    await checkPlanFeature(orgId, API_FEATURES.access);

    const input = createKeySchema.parse(await c.req.json());

    const active = await db
      .select({
        id: apiKeyTable.id,
        revokedAt: apiKeyTable.revokedAt,
        expiresAt: apiKeyTable.expiresAt,
      })
      .from(apiKeyTable)
      .where(eq(apiKeyTable.organizationId, orgId));
    const activeCount = active.filter(
      (k) => !k.revokedAt && (!k.expiresAt || k.expiresAt.getTime() > Date.now()),
    ).length;
    if (activeCount >= MAX_ACTIVE_KEYS) {
      return c.json(
        { message: `Maksimal ${MAX_ACTIVE_KEYS} key aktif. Cabut key lama terlebih dahulu.` },
        400,
      );
    }

    // Ikat ke developer app: WAJIB milik org ini & aktif. `resolveDeveloperApp`
    // memakai org sebagai kondisi query (bukan cek setelahnya), jadi app milik
    // org lain tidak bisa dipakai walaupun ID-nya diketahui.
    const app = input.developerAppId
      ? await resolveDeveloperApp(input.developerAppId, orgId)
      : null;
    if (input.developerAppId && !app) {
      return c.json({ message: "Developer app tidak ditemukan atau tidak aktif." }, 400);
    }

    const { plaintext, tokenPrefix, tokenHash } = generateApiKey();
    const [row] = await db
      .insert(apiKeyTable)
      .values({
        id: generateId("apikey"),
        organizationId: orgId,
        createdBy: ctx.user.id,
        name: input.name,
        tokenPrefix,
        tokenHash,
        scopes: [...new Set(input.scopes)],
        developerAppId: app?.id ?? null,
        expiresAt: input.expiresInDays
          ? new Date(Date.now() + input.expiresInDays * 86_400_000)
          : null,
      })
      .returning(listColumns);

    // Satu-satunya kesempatan klien melihat token — tidak disimpan plaintext.
    return c.json(
      {
        key: row,
        plaintext,
        notice: "Simpan token ini sekarang. Token tidak akan ditampilkan lagi.",
      },
      201,
    );
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /api/api-keys/:id — cabut key (irreversible; tidak dihapus fisik agar audit tetap ada) */
apiKeyRoute.delete("/:id", async (c) => {
  try {
    const ctx = await requireOrgAdmin(c);
    const rows = await db
      .update(apiKeyTable)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(apiKeyTable.id, c.req.param("id")),
          eq(apiKeyTable.organizationId, ctx.organization.id),
          isNull(apiKeyTable.revokedAt),
        ),
      )
      .returning({ id: apiKeyTable.id });
    if (rows.length === 0)
      return c.json({ message: "Key tidak ditemukan atau sudah dicabut" }, 404);
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /api/api-keys/:id/rotate — ganti token (nama & scope tetap), plaintext baru sekali */
apiKeyRoute.post("/:id/rotate", async (c) => {
  try {
    const ctx = await requireOrgAdmin(c);
    const orgId = ctx.organization.id;
    await checkPlanFeature(orgId, API_FEATURES.access);

    const { plaintext, tokenPrefix, tokenHash } = generateApiKey();
    const rows = await db
      .update(apiKeyTable)
      .set({ tokenPrefix, tokenHash, lastUsedAt: null, revokedAt: null, updatedAt: new Date() })
      .where(and(eq(apiKeyTable.id, c.req.param("id")), eq(apiKeyTable.organizationId, orgId)))
      .returning(listColumns);
    if (rows.length === 0) return c.json({ message: "Key tidak ditemukan" }, 404);

    return c.json({
      key: rows[0],
      plaintext,
      notice: "Token lama langsung tidak berlaku. Simpan token baru ini sekarang.",
    });
  } catch (error) {
    return errorResponse(error);
  }
});
