// @sahabatkreator/render — adapter untuk render video + carousel (Modal.com)
//
// Worker memanggil getRenderAdapter() / getCarouselAdapter() untuk dapat
// instance. Bila env belum dikonfigurasi, return null → route API menolak
// dengan 503 yang jelas, worker skip queue. Ini graceful degradation, sama
// seperti REDIS_URL opsional.

export { ModalCarouselAdapter } from "./carousel";
export {
  type CarouselRenderAdapter,
  CarouselRenderError,
  type CarouselRenderedSlide,
  type CarouselRenderRequest,
  type CarouselRenderResponse,
  type CarouselRenderSlide,
  type CarouselSlideBackground,
} from "./carousel-types";
export { ModalRenderAdapter } from "./modal";
export {
  type RenderAdapter,
  RenderError,
  type RenderRequest,
  type RenderResponse,
} from "./types";

import { env } from "@sahabatkreator/env/server";
import { ModalCarouselAdapter } from "./carousel";
import type { CarouselRenderAdapter } from "./carousel-types";
import { ModalRenderAdapter } from "./modal";
import type { RenderAdapter } from "./types";

let cached: ModalRenderAdapter | null | undefined;
let carouselCached: ModalCarouselAdapter | null | undefined;

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

/**
 * Adapter carousel render aktif, atau null bila belum dikonfigurasi.
 *
 * Carousel pakai app Modal terpisah (MODAL_CAROUSEL_URL) dari video render:
 * image Pillow-only, lebih murah, scale terpisah. Bila hanya video yang
 * dikonfigurasi, carousel tetap 503 — dua fitur independen.
 */
export function getCarouselAdapter(): CarouselRenderAdapter | null {
  if (carouselCached !== undefined) return carouselCached;
  if (!env.MODAL_TOKEN || !env.MODAL_CAROUSEL_URL) {
    carouselCached = null;
    return null;
  }
  carouselCached = new ModalCarouselAdapter();
  return carouselCached;
}

/** true bila fitur carousel render aktif (untuk health check + UI gating) */
export function isCarouselConfigured(): boolean {
  return Boolean(env.MODAL_TOKEN && env.MODAL_CAROUSEL_URL);
}
