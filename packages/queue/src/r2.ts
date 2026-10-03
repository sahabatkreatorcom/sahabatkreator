// Akses R2 bersama untuk kebutuhan PEMELIHARAAN storage (daftar objek + hapus).
//
// MENGAPA FILE BARU: sebelumnya setiap processor di paket ini membuat S3Client
// sendiri (`getS3()` lokal di auto-clip/carousel/render/layout-director/stock).
// Itu cukup untuk jalur render yang cuma butuh get/put, tapi rekonsiliasi butuh
// hal yang belum ada di mana pun — **daftar objek per prefix** — jadi lebih baik
// ada satu tempat yang jelas daripada menyalin `getS3()` untuk keenam kalinya.
// Salinan lama sengaja TIDAK diubah: mereka bekerja, dan menyentuhnya memperluas
// risiko tanpa manfaat untuk tugas ini.

import { DeleteObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { env } from "@sahabatkreator/env/server";

let s3Client: S3Client | null = null;

/** R2 dikonfigurasi? Tanpa ini, semua operasi objek harus dilewati (bukan gagal). */
export function isR2Configured(): boolean {
  return Boolean(
    env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET,
  );
}

export function getR2(): S3Client {
  if (!s3Client) {
    if (!isR2Configured()) {
      throw new Error("R2 belum dikonfigurasi — operasi storage tidak bisa dijalankan");
    }
    s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID as string,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY as string,
      },
    });
  }
  return s3Client;
}

export type R2ObjectInfo = {
  key: string;
  size: number;
  /** null bila R2 tidak mengirim LastModified — objek seperti itu TIDAK dihapus. */
  lastModified: Date | null;
};

/**
 * Semua objek di bawah satu prefix, sudah dipaginasi sampai habis.
 *
 * `Delimiter` sengaja TIDAK dipakai: kita memang ingin menelusuri seluruh isi
 * prefix organisasi, bukan hanya satu level.
 */
export async function listObjectsUnderPrefix(prefix: string): Promise<R2ObjectInfo[]> {
  const s3 = getR2();
  const out: R2ObjectInfo[] = [];
  let token: string | undefined;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: env.R2_BUCKET as string,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const item of res.Contents ?? []) {
      if (!item.Key) continue;
      out.push({
        key: item.Key,
        size: item.Size ?? 0,
        lastModified: item.LastModified ?? null,
      });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out;
}

/**
 * Prefix level teratas di bucket (= id organisasi, format `{organizationId}/`).
 *
 * Memakai `Delimiter: "/"` supaya tidak perlu membaca seluruh isi bucket — kita
 * hanya butuh daftar pemiliknya. Termasuk prefix milik organisasi yang sudah
 * dihapus; justru itu yang perlu ikut diperiksa.
 */
export async function listTopLevelPrefixes(): Promise<string[]> {
  const s3 = getR2();
  const out: string[] = [];
  let token: string | undefined;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: env.R2_BUCKET as string,
        Delimiter: "/",
        ContinuationToken: token,
      }),
    );
    for (const cp of res.CommonPrefixes ?? []) {
      if (cp.Prefix) out.push(cp.Prefix);
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out;
}

/** Hapus satu objek. Error dilempar ke pemanggil — jangan ditelan diam-diam. */
export async function deleteObjectByKey(key: string): Promise<void> {
  await getR2().send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET as string, Key: key }));
}
