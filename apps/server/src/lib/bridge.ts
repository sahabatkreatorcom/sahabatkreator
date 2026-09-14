// Helper bridge config (Repliz) — baca/decrypt kredensial + cek routing per platform.
// Bridge = publish sementara via API pihak ketiga selama akses API native belum disetujui.

import { db } from "@sahabatkreator/db";
import { bridgeConfig, type socialAccount } from "@sahabatkreator/db/schema";
import type { ReplizCredentials, ReplizPlatformKey } from "@sahabatkreator/publishing";
import { REPLIZ_PLATFORMS } from "@sahabatkreator/publishing";
import { and, eq } from "drizzle-orm";

type SocialAccount = typeof socialAccount.$inferSelect;

/** Decrypt secret bridge → kredensial Repliz siap pakai (null bila belum dikonfigurasi/nonaktif) */
export async function getReplizCredentials(): Promise<ReplizCredentials | null> {
  const [row] = await db
    .select()
    .from(bridgeConfig)
    .where(and(eq(bridgeConfig.provider, "repliz"), eq(bridgeConfig.isActive, true)))
    .limit(1);
  if (!row) return null;
  const { decrypt } = await import("./crypto");
  try {
    return { accessKey: row.accessKey, secretKey: decrypt(row.secretEnc) };
  } catch {
    return null;
  }
}

/**
 * Cek apakah connect-flow platform harus diarahkan ke Repliz:
 * bridge aktif + platform didukung Repliz + routing[platform] === "repliz".
 * CATATAN: ini hanya mengontrol flow CONNECT BARU. Akun existing tetap di-routing
 * per-account via metadata.replizAccountId (lihat publish pipeline).
 */
export async function isReplizRouted(platform: string): Promise<boolean> {
  if (!(platform in REPLIZ_PLATFORMS)) return false;
  const [row] = await db
    .select({ routing: bridgeConfig.routing })
    .from(bridgeConfig)
    .where(and(eq(bridgeConfig.provider, "repliz"), eq(bridgeConfig.isActive, true)))
    .limit(1);
  if (!row) return false;
  return row.routing?.[platform] === "repliz";
}

/** Platform key Repliz dari platform enum kita (null bila tidak didukung bridge) */
export function toReplizPlatformKey(platform: string): ReplizPlatformKey | null {
  return platform in REPLIZ_PLATFORMS ? (platform as ReplizPlatformKey) : null;
}

/** Apakah akun ini terhubung via bridge Repliz? (routing per-account) */
export function isBridgeAccount(account: Pick<SocialAccount, "metadata">): boolean {
  return Boolean(account.metadata?.replizAccountId);
}
