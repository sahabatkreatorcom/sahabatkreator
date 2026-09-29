// Schema OpenAPI untuk connect akun lewat API (docs/rfc-oauth-connect.md).
//
// MENGAPA berkas terpisah dari reads.ts/writes.ts: alur connect punya kontrak
// sendiri yang tidak cocok dengan keduanya — responsnya POLIMORFIK (selesai atau
// butuh pemilihan aset), dan itu keputusan desain yang sengaja (§4.3), bukan
// detail tipe.

import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

/** `{ code }` — code yang diterima developer di redirect URI-nya. */
export const ConnectRequestSchema = z
  .object({
    code: z
      .string()
      .min(1)
      .openapi({
        description:
          "Authorization code dari platform, diterima sebagai parameter `code` di redirect URI Anda. " +
          "Sekali pakai — panggil `connect` ATAU `exchange`, jangan keduanya.",
      }),
  })
  .openapi("ConnectRequest");

export const AuthorizeResponseSchema = z
  .object({
    authorizeUrl: z
      .string()
      .openapi({ description: "Arahkan browser pengguna ke URL ini untuk memberi izin." }),
  })
  .openapi("AuthorizeResponse");

/**
 * Aset yang bisa dipilih — SENGAJA tanpa token apa pun.
 *
 * Bentuk ini dipakai DUA tempat (`assets[]` di respons connect dan `assets[]` di
 * `GET /pending/{id}`) supaya developer tidak perlu memetakan dua bentuk untuk
 * data yang sama (RFC §11 #7).
 */
export const PendingAssetSchema = z
  .object({
    id: z.string().openapi({ description: "Kirim kembali sebagai `assetId` ke endpoint select." }),
    name: z.string(),
    username: z.string().nullable(),
    picture: z.string().nullable(),
    hasInstagram: z.boolean().openapi({
      description:
        "Meta saja: Page punya Instagram Business tertaut. Di alur `instagram`, " +
        "aset dengan nilai `false` **tidak bisa dipilih**.",
    }),
    isPersonal: z.boolean().openapi({
      description: "LinkedIn saja: `true` = profil pribadi, `false` = halaman company.",
    }),
  })
  .openapi("PendingAsset");

/** Varian 1: akun langsung terhubung. */
export const ConnectAccountResponseSchema = z
  .object({
    accountId: z.string().openapi({ description: "ID akun yang baru terhubung." }),
  })
  .openapi("ConnectAccountResponse");

/** Varian 2: platform butuh pemilihan aset dulu (Page / board / channel). */
export const ConnectPendingResponseSchema = z
  .object({
    pendingId: z.string(),
    assets: z.array(PendingAssetSchema),
  })
  .openapi("ConnectPendingResponse");

/**
 * Isi `GET /v1/accounts/pending/{id}` — daftar aset + konteks platformnya.
 * Memakai `PendingAssetSchema` yang sama dengan `assets[]` di respons connect.
 */
export const PendingSelectionResponseSchema = z
  .object({
    platform: z.string(),
    assets: z.array(PendingAssetSchema),
  })
  .openapi("PendingSelectionResponse");

export const SelectAssetRequestSchema = z
  .object({
    assetId: z.string().min(1).openapi({ description: "`id` dari `assets[]`." }),
  })
  .openapi("SelectAssetRequest");

export const SelectAssetResponseSchema = z
  .object({
    ok: z.literal(true),
    username: z.string(),
  })
  .openapi("SelectAssetResponse");
