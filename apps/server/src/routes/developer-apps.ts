// CRUD developer app — pemilik allowlist redirect untuk connect akun lewat API
// (docs/rfc-oauth-connect.md fase 4).
//
// MENGAPA session-only, sama seperti api-keys.ts: yang mengelola app tidak boleh
// bisa dilakukan dengan token yang justru dibatasi oleh allowlist app itu.
// Kalau bisa, sebuah key yang bocor cukup mendaftarkan `redirect` miliknya
// sendiri lalu mencuri `code` — open redirect yang menutup dirinya sendiri.

import { db } from "@sahabatkreator/db";
import { apiKey as apiKeyTable, developerApp } from "@sahabatkreator/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { errorResponse, requireOrgAdmin } from "../lib/auth-guard";
import { checkPlanFeature } from "../lib/billing";
import { validateRedirectUri } from "../lib/developer-app";
import { generateId } from "../lib/id";
import { API_FEATURES } from "../lib/public-api";

export const developerAppRoute = new Hono();

/**
 * Batas app per organisasi — menjawab RFC §11 #2.
 * Asumsi yang dipakai: satu app cukup untuk hampir semua kasus (satu produk
 * developer = satu callback), dan 5 memberi ruang untuk staging/produksi
 * terpisah tanpa membuka permukaan allowlist selebar-lebarnya. Kalau kebutuhan
 * nyata berbeda, angkanya cukup diubah di sini.
 */
const MAX_APPS_PER_ORG = 5;

/** Batas URI per app — allowlist panjang = permukaan open-redirect yang lebih luas. */
const MAX_URIS_PER_APP = 10;

const listColumns = {
  id: developerApp.id,
  name: developerApp.name,
  allowedRedirectUris: developerApp.allowedRedirectUris,
  isActive: developerApp.isActive,
  createdAt: developerApp.createdAt,
  updatedAt: developerApp.updatedAt,
};

/**
 * Periksa bentuk tiap URI dengan validator yang SAMA dengan yang dipakai
 * `assertAllowedRedirect`, lalu dedupe.
 *
 * MENGAPA validator yang sama: kalau pendaftaran memakai aturan sendiri,
 * allowlist bisa berisi URI yang selalu ditolak saat dipakai — developer
 * mendaftar dengan sukses, lalu setiap `authorize` gagal tanpa sebab yang jelas.
 */
function normalizeRedirectUris(uris: string[]): string[] {
  for (const uri of uris) validateRedirectUri(uri);
  return [...new Set(uris)];
}

const urisSchema = z
  .array(z.string().trim().min(1))
  .min(1, "Minimal satu redirect URI")
  .max(MAX_URIS_PER_APP, `Maksimal ${MAX_URIS_PER_APP} redirect URI`);

const createSchema = z.object({
  name: z.string().trim().min(1, "Nama app wajib diisi").max(100),
  allowedRedirectUris: urisSchema,
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  allowedRedirectUris: urisSchema.optional(),
  isActive: z.boolean().optional(),
});

/**
 * GET /api/developer-apps — app milik org + jumlah key aktif yang menempel.
 * `keyCount` dipakai UI untuk memperingatkan sebelum app dinonaktifkan.
 */
developerAppRoute.get("/", async (c) => {
  try {
    const ctx = await requireOrgAdmin(c);
    const orgId = ctx.organization.id;

    const apps = await db
      .select(listColumns)
      .from(developerApp)
      .where(eq(developerApp.organizationId, orgId))
      .orderBy(asc(developerApp.createdAt));

    // Hitung di JS (bukan SQL GROUP BY) supaya jumlahnya jelas: key dicabut tidak
    // dihitung, karena ia tidak akan pernah memakai allowlist ini lagi.
    const keys = await db
      .select({ developerAppId: apiKeyTable.developerAppId, revokedAt: apiKeyTable.revokedAt })
      .from(apiKeyTable)
      .where(eq(apiKeyTable.organizationId, orgId));
    const keyCount = new Map<string, number>();
    for (const k of keys) {
      if (!k.developerAppId || k.revokedAt) continue;
      keyCount.set(k.developerAppId, (keyCount.get(k.developerAppId) ?? 0) + 1);
    }

    return c.json({ apps: apps.map((a) => ({ ...a, keyCount: keyCount.get(a.id) ?? 0 })) });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /api/developer-apps — daftarkan app + allowlist redirect-nya. */
developerAppRoute.post("/", async (c) => {
  try {
    const ctx = await requireOrgAdmin(c);
    const orgId = ctx.organization.id;
    // Sama seperti pembuatan API key: butuh akses Public API sama sekali.
    await checkPlanFeature(orgId, API_FEATURES.access);

    const input = createSchema.parse(await c.req.json());

    const existing = await db
      .select({ id: developerApp.id })
      .from(developerApp)
      .where(eq(developerApp.organizationId, orgId));
    if (existing.length >= MAX_APPS_PER_ORG) {
      return c.json({ message: `Maksimal ${MAX_APPS_PER_ORG} app per organisasi.` }, 400);
    }

    const [row] = await db
      .insert(developerApp)
      .values({
        id: generateId("devapp"),
        organizationId: orgId,
        name: input.name,
        allowedRedirectUris: normalizeRedirectUris(input.allowedRedirectUris),
      })
      .returning(listColumns);

    return c.json({ app: { ...row, keyCount: 0 } }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/** PATCH /api/developer-apps/:id — ubah nama / allowlist / status aktif. */
developerAppRoute.patch("/:id", async (c) => {
  try {
    const ctx = await requireOrgAdmin(c);
    const input = updateSchema.parse(await c.req.json());

    const [row] = await db
      .update(developerApp)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.allowedRedirectUris
          ? { allowedRedirectUris: normalizeRedirectUris(input.allowedRedirectUris) }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(developerApp.id, c.req.param("id")),
          eq(developerApp.organizationId, ctx.organization.id),
        ),
      )
      .returning(listColumns);

    if (!row) return c.json({ message: "App tidak ditemukan" }, 404);
    return c.json({ app: row });
  } catch (error) {
    return errorResponse(error);
  }
});

/**
 * DELETE /api/developer-apps/:id — MENONAKTIFKAN app, bukan menghapus barisnya.
 *
 * MENGAPA bukan hard delete: `api_key.developer_app_id` ber-FK `onDelete: cascade`
 * (lihat schema/api-key.ts), jadi menghapus app akan IKUT MENGHAPUS semua key-nya
 * — termasuk key yang scopenya tidak ada hubungannya dengan connect (mis.
 * `posts:write`). Itu kerusakan senyap: integrasi developer mati karena admin
 * menutup satu app.
 *
 * Efek keamanannya identik: `resolveDeveloperApp` menyaring `isActive = true`,
 * jadi setelah ini setiap `GET /authorize` dengan key itu langsung 403.
 * Cascade tetap ada sebagai jaring pengaman saat ORG dihapus.
 */
developerAppRoute.delete("/:id", async (c) => {
  try {
    const ctx = await requireOrgAdmin(c);
    const [row] = await db
      .update(developerApp)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(developerApp.id, c.req.param("id")),
          eq(developerApp.organizationId, ctx.organization.id),
        ),
      )
      .returning(listColumns);

    if (!row) return c.json({ message: "App tidak ditemukan" }, 404);
    return c.json({ ok: true, app: row });
  } catch (error) {
    return errorResponse(error);
  }
});
