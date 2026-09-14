// Konfigurasi terpusat package publishing — single source of truth.
// Nilai berasal dari @sahabatkreator/env/server (root .env); fallback default
// identik untuk path yang berjalan tanpa env ter-load (mis. test).
import { env } from "@sahabatkreator/env/server";

/** Versi Graph API Meta (pin di env; riset docs/social-platforms/meta-facebook.md) */
export const META_GRAPH_VERSION = env.META_GRAPH_VERSION || "v26.0";

/** Versi API LinkedIn — sunset bulanan, update rutin via env */
export const LINKEDIN_API_VERSION = env.LINKEDIN_API_VERSION || "202608";

/** Host PDS Bluesky default */
export const BLUESKY_PDS_URL = env.BLUESKY_PDS_URL || "https://bsky.social";

/** Base URL API Pinterest v5 */
export const PINTEREST_API_BASE_URL = env.PINTEREST_API_BASE_URL || "https://api.pinterest.com/v5";
