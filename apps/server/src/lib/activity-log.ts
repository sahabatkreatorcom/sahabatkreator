// Helper activity log org — audit trail aktivitas penting user dalam organisasi
// (dipakai admin panel: halaman "Log Aktivitas" per-org).
// Berbeda dari lib/audit.ts yang merekam aksi platform-admin ke audit_log.
import { db } from "@sahabatkreator/db";
import { activityLog } from "@sahabatkreator/db/schema";
import { generateId } from "./id";

export type ActivityInput = {
  /** Org tempat aktivitas terjadi (wajib) */
  orgId: string;
  /** User pelaku aktivitas (null = sistem, mis. webhook billing) */
  userId?: string | null;
  /** Nama aksi format dot: post.created, account.connected, plan.changed, dst. */
  action: string;
  /** Tipe entity terdampak (mis. "post", "social_account", "subscription") */
  targetType?: string | null;
  /** ID entity terdampak */
  targetId?: string | null;
  /** Data tambahan — JANGAN sertakan secret/token plaintext */
  metadata?: Record<string, unknown> | null;
};

/**
 * Rekam aktivitas org ke activity_log. Fire-and-forget:
 * kegagalan pencatatan tidak boleh memblok/menggagalkan aksi utama.
 */
export async function logActivity(input: ActivityInput): Promise<void> {
  try {
    await db.insert(activityLog).values({
      id: generateId("act"),
      organizationId: input.orgId,
      userId: input.userId ?? null,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      metadata: input.metadata ?? null,
    });
  } catch (err) {
    // Log error saja — jangan lempar agar tidak menggagalkan aksi utama
    console.error("[activity-log] gagal merekam aksi:", input.action, err);
  }
}

/** Wrapper non-blocking — panggil tanpa await di route (void promise + catch). */
export function fireActivity(input: ActivityInput): void {
  void logActivity(input);
}
