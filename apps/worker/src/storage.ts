import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env } from "@sahabat-kreator/env/server";

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}

/**
 * R2 client khusus worker. Hanya beroperasi bila semua env R2 tersedia —
 * kalau belum dikonfigurasi, lempar StorageError agar worker tidak diam-diam
 * gagal di tengah proses.
 */
export function requireR2(): {
  client: S3Client;
  bucket: string;
} {
  if (
    !env.R2_ACCOUNT_ID ||
    !env.R2_ACCESS_KEY_ID ||
    !env.R2_SECRET_ACCESS_KEY ||
    !env.R2_BUCKET_NAME
  ) {
    throw new StorageError("R2 belum dikonfigurasi. Isi R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME.");
  }

  return {
    client: new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    }),
    bucket: env.R2_BUCKET_NAME,
  };
}

/** Download objek R2 sebagai Buffer. Mengembalikan null bila tidak ada. */
export async function downloadObjectBuffer(key: string): Promise<Buffer | null> {
  const { client, bucket } = requireR2();
  try {
    const response = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    if (!response.Body) return null;
    const bytes = await response.Body.transformToByteArray();
    return Buffer.from(bytes);
  } catch {
    return null;
  }
}

/** Upload objek ke R2 (public-read). */
export async function uploadObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const { client, bucket } = requireR2();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: {
        "worker-managed": "true",
      },
    }),
  );
}

export async function deleteObject(key: string): Promise<void> {
  const { client, bucket } = requireR2();
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch {
    // Abaikan bila sudah tidak ada.
  }
}

/** Kunci R2 untuk media: orgs/<org>/media/<name>. */
export function mediaObjectKey(organizationId: string, filename: string): string {
  return `orgs/${organizationId}/media/${filename}`;
}

/** Prefix frame hasil ekstrak: orgs/<org>/media-frames/<mediaId>/. */
export function framePrefix(organizationId: string, mediaId: string): string {
  return `orgs/${organizationId}/media-frames/${mediaId}/`;
}

export function frameObjectKey(
  organizationId: string,
  mediaId: string,
  index: number,
  ext = "jpg",
): string {
  return `${framePrefix(organizationId, mediaId)}frame-${index}.${ext}`;
}

/** URL publik untuk key (butuh public bucket atau custom domain). */
export function publicUrlForKey(key: string): string {
  if (env.R2_CUSTOM_DOMAIN) return `https://${env.R2_CUSTOM_DOMAIN}/${key}`;
  return `https://${env.R2_BUCKET_NAME}.${env.R2_ACCOUNT_ID}.r2.dev/${key}`;
}