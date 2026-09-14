// Helper audit log — merekam aksi admin/sistem ke tabel audit_log
import { db } from "@sahabatkreator/db";
import { auditLog } from "@sahabatkreator/db/schema";
import type { Context } from "hono";
import { generateId } from "./id";

/** Ekstrak IP client dari header proxy (x-forwarded-for / x-real-ip) */
export function getClientIp(c: Context): string | null {
  const fwd = c.req.header("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || null;
  return c.req.header("x-real-ip") ?? null;
}

export type AuditInput = {
  /** Nama aksi, format dot: user.ban, plan.update, platform_credential.delete, dst. */
  action: string;
  /** Entity terdampak: "user", "organization", "plan", "platform_credential", "platform_settings" */
  entityType?: string | null;
  entityId?: string | null;
  /** Data tambahan — JANGAN sertakan secret/plaintext key */
  metadata?: Record<string, unknown> | null;
  organizationId?: string | null;
  /** Override user pelaku (default: null = sistem) */
  userId?: string | null;
};

/**
 * Rekam aksi ke audit log. Non-blocking (fire & forget) — kegagalan
 * pencatatan tidak boleh menggagalkan aksi admin itu sendiri.
 */
export function logAdminAction(c: Context, userId: string | null, input: AuditInput): void {
  const { action, entityType, entityId, metadata, organizationId } = input;
  db.insert(auditLog)
    .values({
      id: generateId("audit"),
      organizationId: organizationId ?? null,
      userId: userId ?? null,
      action,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
      metadata: metadata ?? null,
      ipAddress: getClientIp(c),
    })
    .catch((err) => {
      console.error("[audit] gagal merekam aksi:", action, err);
    });
}
