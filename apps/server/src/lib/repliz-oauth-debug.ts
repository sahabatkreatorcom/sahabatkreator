// Helper logging debug untuk investigasi flow OAuth bridge Repliz.
// Sementara — untuk memverifikasi klaim "token dilempar saat redirect".
// Hanya log nilai yang sudah dimasking (bukan secret mentah).

const TAG = "[repliz-oauth]";

/** Masking secret: tampilkan prefix+suffix kecil + panjang, cukup untuk
 *  verifikasi kehadiran & bentuk token tanpa membocorkan isinya. */
export function maskSecret(v: unknown): string {
  if (v === null || v === undefined) return "(null)";
  const s = String(v);
  if (s === "") return "(empty)";
  if (s.length <= 12) return `${s.slice(0, 2)}…(${s.length} chars)`;
  return `${s.slice(0, 6)}…${s.slice(-4)} (${s.length} chars)`;
}

/** Nama param/header yang dianggap sensitif → selalu di-mask */
function isSensitiveKey(key: string): boolean {
  return /code|token|secret|auth|state|key/i.test(key);
}

/** Log pasca-redirect: APA SAJA yang dilihat server saat Repliz melempar
 *  browser kembali ke callback. Mencakup query string + header (token bisa
 *  hadir di query, header, atau — jika di fragment — TIDAK terlihat server). */
export function logRedirectHit(
  platform: string,
  ctx: {
    path: string;
    query: Record<string, string>;
    headers: Record<string, string>;
  },
): void {
  const q = Object.entries(ctx.query).map(
    ([k, v]) => `${k}=${isSensitiveKey(k) ? maskSecret(v) : v}`,
  );
  const h = Object.entries(ctx.headers).map(
    ([k, v]) => `${k}: ${isSensitiveKey(k) ? maskSecret(v) : v}`,
  );
  console.info(
    `${TAG} redirect diterima [${platform}]\n  path    : ${ctx.path}\n  query   : ${q.length ? q.join(" | ") : "(tidak ada)"}\n  headers : ${h.length ? h.join(" | ") : "(tidak ada)"}`,
  );
}

/** Log request keluar ke API Repliz (exchange/connect) — body dimasking */
export function logReplizRequest(
  label: string,
  path: string,
  body: unknown,
): void {
  const maskedBody =
    body && typeof body === "object"
      ? JSON.stringify(
          Object.fromEntries(
            Object.entries(body as Record<string, unknown>).map(([k, v]) => [
              k,
              isSensitiveKey(k) ? maskSecret(v) : v,
            ]),
          ),
        )
      : String(body);
  console.info(`${TAG} → ${label}\n  endpoint: ${path}\n  body    : ${maskedBody}`);
}

/** Log response Repliz untuk exchange/connect */
export function logReplizResponse(label: string, ok: boolean, detail: string): void {
  console.info(`${TAG} ← ${label}\n  ok=${ok} ${detail}`);
}
