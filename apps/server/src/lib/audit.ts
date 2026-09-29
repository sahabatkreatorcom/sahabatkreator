// Helper audit log — merekam aksi admin/sistem ke tabel audit_log
import { db } from "@sahabatkreator/db";
import { auditLog } from "@sahabatkreator/db/schema";
import type { Context } from "hono";
import { generateId } from "./id";

/**
 * Ekstrak IP client dari header proxy — HANYA mempercayai header proxy bila
 * request datang dari reverse proxy terpercaya (Cloudflare / NGINX host).
 *
 * Sebelumnya header `x-forwarded-for` dipercaya tanpa syarat: nilai ini
 * sepenuhnya dikontrol client dan bisa diset sembarang (curl -H), sehingga
 * attacker bisa (1) memalsukan IP di audit log dan (2) me-reset bucket rate
 * limit IP-keyed dengan berganti-ganti nilai. Lihat ANALISA-CODEBASE.md §10.
 *
 * Prioritas: CF-Connecting-IP (Cloudflare, satu nilai, tidak bisa diset
 * client karena ditimpa di edge) → x-forwarded-for terpercaya → x-real-ip
 * terpercaya → socket peer (tanpa proxy).
 */

// Subnet proxy yang boleh menyuplai header forwarded. NGINX host + Cloudflare
// (CF-Connecting-IP selalu diisi edge dan nilai client header同名 ditimpa).
const TRUSTED_PROXIES: ReadonlyArray<string> = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];

/** True jika request datang langsung dari reverse proxy terpercaya */
function isTrustedProxy(remoteIp: string | undefined): boolean {
  if (!remoteIp) return false;
  return TRUSTED_PROXIES.some((p) => p === remoteIp);
}

export function getClientIp(c: Context): string | null {
  // Peer address dari Bun fetch context (alamat socket TCP yang connect).
  const remote =
    (c.env as { remoteAddress?: string } | undefined)?.remoteAddress ??
    (c.req.raw as unknown as { remoteAddress?: string }).remoteAddress;

  // Semua header forwarded HANYA dibaca bila request datang dari proxy
  // terpercaya. Topologi prod: Cloudflare → NGINX host (127.0.0.1) → app.
  // NGINX memakai `real_ip_header CF-Connecting-IP` sehingga X-Real-IP yang
  // diteruskan sudah berisi IP client asli hasil resolusi NGINX — itu sumber
  // paling akurat dan tidak bisa diset client.
  if (!isTrustedProxy(remote)) return null;

  const realIp = c.req.header("x-real-ip");
  if (realIp) return realIp.trim() || null;

  const cfIp = c.req.header("cf-connecting-ip");
  if (cfIp) return cfIp.trim() || null;

  // x-forwarded-for: "client, proxy1, proxy2" — entry paling kiri = client.
  const fwd = c.req.header("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }

  return null;
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
