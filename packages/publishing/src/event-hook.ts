// Dependency injection hook — emit webhook keluar dari dalam proses automation.
//
// Alasan sama dengan queue-hook.ts: packages/publishing TIDAK boleh import
// @sahabatkreator/queue (queue → publishing satu arah; import balik = cycle).
// Tapi processAutomation (di publishing) perlu memberi tahu endpoint webhook org
// bahwa sebuah aturan automation terpicu.
//
// Solusi: injectable hook. apps/server & apps/worker mendaftarkan
// emitWebhookEvent (dari @sahabatkreator/queue) saat boot. Bila hook belum
// terdaftar — mis. package dipakai tanpa host app, atau di test — emit jadi
// no-op: automation tetap berjalan, hanya notifikasi webhook-nya yang absen.
//
// Tanpa hook ini, event "automation.triggered" tetap muncul di daftar event yang
// bisa dilanggan (UI Settings → Webhook & /v1/webhooks/events) tapi tidak pernah
// dikirim — kontrak publik yang bohong.

import type { WebhookEvent } from "@sahabatkreator/db/schema";

type EmitFn = (organizationId: string, event: WebhookEvent, payload: unknown) => Promise<void>;

let hook: EmitFn | null = null;

/** Daftarkan implementasi emit (dipanggil apps/server & apps/worker saat boot). */
export function registerWebhookEmit(fn: EmitFn): void {
  hook = fn;
}

/** Lepas hook (testing). */
export function clearWebhookEmit(): void {
  hook = null;
}

/**
 * Emit event webhook. No-op bila hook belum terdaftar.
 * Pemanggil bertanggung jawab menelan error (best-effort — notifikasi tidak
 * boleh menggagalkan operasi utama).
 */
export async function emitWebhook(
  organizationId: string,
  event: WebhookEvent,
  payload: unknown,
): Promise<void> {
  if (!hook) return;
  await hook(organizationId, event, payload);
}
