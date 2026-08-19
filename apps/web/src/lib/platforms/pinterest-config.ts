import { env } from "@sahabat-kreator/env/server";

/**
 * Base URL Pinterest API v5 — production vs sandbox (Trial access).
 *
 * Sandbox (`api-sandbox.pinterest.com`) dipakai untuk uji coba dengan Trial
 * access: semua Pin/Board yang dibuat menjadi Sandbox entity (visible only to
 * creator), rate limit harian per-app, dan mendukung test token 30 hari yang
 * di-generate di halaman My apps. Catatan: token sandbox TIDAK bisa dipakai di
 * production dan sebaliknya. Video Pin tidak didukung di Sandbox.
 *
 * Dikontrol env `PINTEREST_SANDBOX` (default "false"). Server-only — jangan
 * diimpor dari client component.
 */
export const PINTEREST_IS_SANDBOX = env.PINTEREST_SANDBOX === "true";

export const PINTEREST_API_BASE = PINTEREST_IS_SANDBOX
    ? "https://api-sandbox.pinterest.com/v5"
    : "https://api.pinterest.com/v5";

export const PINTEREST_TOKEN_URL = `${PINTEREST_API_BASE}/oauth/token`;
