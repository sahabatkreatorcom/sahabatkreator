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
export { ModalClipperAdapter } from "./clipper";
export {
  type ClipperAdapter,
  ClipperError,
  type ClipperFailure,
  type ClipperIngestRequest,
  type ClipperIngestResponse,
} from "./clipper-types";
export { ModalRenderAdapter } from "./modal";
export {
  type RenderAdapter,
  RenderError,
  type RenderRequest,
  type RenderResponse,
  type SlideshowRequest,
  type SlideshowResponse,
} from "./types";

import { env } from "@sahabatkreator/env/server";
import { ModalCarouselAdapter } from "./carousel";
import type { CarouselRenderAdapter } from "./carousel-types";
import { ModalClipperAdapter } from "./clipper";
import type { ClipperAdapter } from "./clipper-types";
import { ModalRenderAdapter } from "./modal";
import type { RenderAdapter } from "./types";

let cached: ModalRenderAdapter | null | undefined;
let carouselCached: ModalCarouselAdapter | null | undefined;
let clipperCached: ModalClipperAdapter | null | undefined;

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

/**
 * Adapter clipper ingest aktif, atau null bila belum dikonfigurasi.
 *
 * App Modal terpisah `sahabatkreator-clipper` — AKUN KEDUA (RFC auto-clip §4):
 * isolasi quota concurrency Starter 100 container, supaya transkripsi clipper
 * tidak kelaparkan job render slideshow customer. Token pakai
 * MODAL_CLIPPER_TOKEN bila ada, fallback MODAL_TOKEN (bila satu akun cukup).
 * Kosong = fitur auto-clip nonaktif (route 503, worker skip queue).
 */
export function getClipperAdapter(): ClipperAdapter | null {
  if (clipperCached !== undefined) return clipperCached;
  const token = env.MODAL_CLIPPER_TOKEN || env.MODAL_TOKEN;
  if (!token || !env.MODAL_CLIPPER_URL) {
    clipperCached = null;
    return null;
  }
  clipperCached = new ModalClipperAdapter();
  return clipperCached;
}

/** true bila fitur auto-clip aktif (untuk health check + UI gating) */
export function isClipperConfigured(): boolean {
  const token = env.MODAL_CLIPPER_TOKEN || env.MODAL_TOKEN;
  return Boolean(token && env.MODAL_CLIPPER_URL);
}
