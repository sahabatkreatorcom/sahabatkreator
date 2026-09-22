// @sahabatkreator/render — adapter untuk render video (Modal.com)
//
// Worker memanggil getRenderAdapter() untuk dapat instance. Bila env belum
// dikonfigurasi, return null → route API menolak dengan 503 yang jelas,
// worker skip queue. Ini graceful degradation, sama seperti REDIS_URL opsional.
export {
  ModalRenderAdapter,
} from "./modal";
export {
  type RenderAdapter,
  RenderError,
  type RenderRequest,
  type RenderResponse,
} from "./types";
import { env } from "@sahabatkreator/env/server";
import { ModalRenderAdapter } from "./modal";
import type { RenderAdapter } from "./types";

let cached: ModalRenderAdapter | null | undefined;

/**
 * Adapter render aktif, atau null bila belum dikonfigurasi.
 * Return null (bukan throw) agar server tetap boot tanpa Modal —
 * fitur render hanya nonaktif sampai admin set env.
 */
export function getRenderAdapter(): RenderAdapter | null {
  if (cached !== undefined) return cached;
  if (!env.MODAL_TOKEN || !env.MODAL_RENDER_URL) {
    cached = null;
    return null;
  }
  cached = new ModalRenderAdapter();
  return cached;
}

/** true bila fitur render aktif (untuk health check + UI gating) */
export function isRenderConfigured(): boolean {
  return Boolean(env.MODAL_TOKEN && env.MODAL_RENDER_URL);
}
