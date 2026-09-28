// Storage client untuk Cloudflare R2 (S3-compatible)
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@sahabatkreator/env/server";
import { generateId } from "./id";

let client: S3Client | null = null;

export function isStorageConfigured(): boolean {
  return Boolean(
    env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET,
  );
}

function getClient(): S3Client {
  if (!isStorageConfigured()) {
    throw new Error(
      "R2 belum dikonfigurasi. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET di root .env",
    );
  }
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID!,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return client;
}

export function publicUrl(storageKey: string): string {
  if (env.R2_PUBLIC_URL) {
    return `${env.R2_PUBLIC_URL.replace(/\/$/, "")}/${storageKey}`;
  }
  return storageKey;
}

export type UploadResult = {
  storageKey: string;
  url: string;
};

/**
 * Upload file ke R2 di bawah folder per-organization.
 * storageKey format: <orgId>/<yyyy>/<mm>/<id>.<ext>
 */
export async function uploadObject(
  organizationId: string,
  file: { data: Buffer | Uint8Array; mimeType: string; originalName: string },
): Promise<UploadResult> {
  const s3 = getClient();
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = `${now.getMonth() + 1}`.padStart(2, "0");
  const ext = file.originalName.split(".").pop()?.toLowerCase() || "bin";
  const storageKey = `${organizationId}/${yyyy}/${mm}/${generateId("media")}.${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: storageKey,
      Body: file.data,
      ContentType: file.mimeType,
    }),
  );

  return { storageKey, url: publicUrl(storageKey) };
}

export async function deleteObject(storageKey: string): Promise<void> {
  const s3 = getClient();
  await s3.send(
    new DeleteObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: storageKey,
    }),
  );
}

/** Presigned URL upload (untuk file besar, upload langsung dari browser) */
export async function presignUpload(
  storageKey: string,
  mimeType: string,
  expiresIn = 3600,
): Promise<string> {
  const s3 = getClient();
  return getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: storageKey,
      ContentType: mimeType,
    }),
    { expiresIn },
  );
}

/** Presigned URL download (untuk object private) */
export async function presignDownload(storageKey: string, expiresIn = 3600): Promise<string> {
  const s3 = getClient();
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: storageKey }), {
    expiresIn,
  });
}
