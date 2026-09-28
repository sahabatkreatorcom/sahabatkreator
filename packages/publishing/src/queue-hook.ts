// Dependency injection hook untuk enqueue auto-reply.
//
// packages/publishing TIDAK boleh import @sahabatkreator/queue (queue → publishing
// adalah arah dependency satu arah; import balik = cycle). Tapi processAutomation
// (di publishing) perlu mendaftarkan delayed job ai_reply.
//
// Solusi: injectable hook. apps/worker & apps/server saat boot memanggil
// registerAutoReplyEnqueue() dengan implementasi queue asli. Bila belum
// terdaftar (mis. library dipakai tanpa app host), fallback = DB polling
// automation_log.due_at (worker loop) — fitur tetap jalan, hanya presisi ±30s.

type EnqueueFn = (logId: string, dueAt: Date) => Promise<boolean>;

let hook: EnqueueFn | null = null;

/** Daftarkan implementasi enqueue (dipanggil apps/worker & apps/server saat boot) */
export function registerAutoReplyEnqueue(fn: EnqueueFn): void {
  hook = fn;
}

/** Lepas hook (testing) */
export function clearAutoReplyEnqueue(): void {
  hook = null;
}

/**
 * Enqueue delayed auto-reply job. Return true bila ter-queue (Redis),
 * false → caller log menunggu fallback polling DB.
 */
export async function enqueueAutoReply(logId: string, dueAt: Date): Promise<boolean> {
  if (!hook) return false;
  return hook(logId, dueAt);
}
