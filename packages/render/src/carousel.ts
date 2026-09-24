// Carousel adapter — implementasi CarouselRenderAdapter via Modal.com.
//
// App Modal terpisah dari video render (sahabatkreator-carousel, Pillow-only).
// Worker memanggil getCarouselAdapter(); null bila env belum dikonfigurasi →
// route 503, worker skip queue (graceful degradation, sama pola video render).
//
// Alur:
// 1. Worker buat presigned URL R2 untuk background (download) & tiap slide (upload).
// 2. Worker POST request ke Modal function.
// 3. Modal fetch background → render slide (Pillow) → upload JPEG balik ke R2.
// 4. Response berisi metadata tiap slide (dimensi, size).
import { env } from "@sahabatkreator/env/server";
import {
  type CarouselRenderAdapter,
  CarouselRenderError,
  type CarouselRenderRequest,
  type CarouselRenderResponse,
} from "./carousel-types";

/** Response Modal function — sukses */
type ModalSuccess = {
  status: "done";
  slides: { urutan: number; width: number; height: number; sizeBytes: number }[];
  /** Hanya ada saat exportFormat=pdf (RFC §8 fase 3) */
  pdf?: {
    sizeBytes: number;
    pageCount: number;
    width: number;
    height: number;
  };
};

/** Response Modal function — gagal */
type ModalFailure = {
  status: "failed";
  code: string;
  message: string;
  retryable: boolean;
};

type ModalResponse = ModalSuccess | ModalFailure;

export class ModalCarouselAdapter implements CarouselRenderAdapter {
  readonly name = "modal-carousel";

  private get baseUrl(): string {
    if (!env.MODAL_CAROUSEL_URL) {
      throw new CarouselRenderError(
        "MODAL_CAROUSEL_URL belum dikonfigurasi — fitur carousel nonaktif",
        "carousel_not_configured",
        false,
      );
    }
    return env.MODAL_CAROUSEL_URL.replace(/\/$/, "");
  }

  private get token(): string {
    if (!env.MODAL_TOKEN) {
      throw new CarouselRenderError(
        "MODAL_TOKEN belum dikonfigurasi — fitur carousel nonaktif",
        "carousel_not_configured",
        false,
      );
    }
    return env.MODAL_TOKEN;
  }

  async render(
    req: CarouselRenderRequest,
    onProgress?: (percent: number) => void,
  ): Promise<CarouselRenderResponse> {
    onProgress?.(10);

    let current: ModalResponse;
    try {
      current = await this.callFn("/carousel", {
        jobId: req.jobId,
        format: req.format,
        style: req.style,
        boxOpacity: req.boxOpacity,
        titleFontFamily: req.titleFontFamily,
        contentFontFamily: req.contentFontFamily,
        // Slide self-contained: Modal menerima background + uploadUrl per slide.
        slides: req.slides.map((s) => ({
          urutan: s.urutan,
          title: s.title,
          body: s.body,
          backgroundStops:
            s.background.mode === "solid"
              ? [s.background.topColor, s.background.bottomColor]
              : null,
          backgroundUrl: s.background.mode === "image" ? s.background.url : null,
          uploadUrl: s.uploadUrl,
          // AI Visual Layout Director (fase 2) — null/missing = template center
          layout: s.layout ?? null,
        })),
      });
    } catch (error) {
      throw this.toRenderError(error);
    }

    if (current.status === "done") {
      onProgress?.(100);
      return { slides: current.slides };
    }

    throw new CarouselRenderError(current.message, current.code, current.retryable);
  }

  /**
   * Export PDF — RFC §8 fase 3 (LinkedIn document post).
   * request.exportFormat=pdf: renderer satukan semua slide jadi 1 PDF
   * multi-halaman, upload via uploadUrl slide pertama. Metadata pdf di
   * response (pageCount, width, height).
   */
  async renderPdf(req: CarouselRenderRequest): Promise<CarouselRenderResponse> {
    let current: ModalResponse;
    try {
      current = await this.callFn("/carousel", {
        jobId: req.jobId,
        format: req.format,
        style: req.style,
        boxOpacity: req.boxOpacity,
        titleFontFamily: req.titleFontFamily,
        contentFontFamily: req.contentFontFamily,
        exportFormat: "pdf",
        slides: req.slides.map((s) => ({
          urutan: s.urutan,
          title: s.title,
          body: s.body,
          backgroundStops:
            s.background.mode === "solid"
              ? [s.background.topColor, s.background.bottomColor]
              : null,
          backgroundUrl: s.background.mode === "image" ? s.background.url : null,
          // Hanya slide pertama yang butuh uploadUrl (target PDF tunggal);
          // rendererabaikan sisanya saat exportFormat=pdf.
          uploadUrl: s.urutan === 0 ? s.uploadUrl : null,
          layout: s.layout ?? null,
        })),
      });
    } catch (error) {
      throw this.toRenderError(error);
    }

    if (current.status === "done") {
      // PDF response: slides meta tetap ada (dimensi halaman), pageCount di field pdf
      return {
        slides: current.slides,
        pdf: (current as ModalSuccess & { pdf?: CarouselRenderResponse["pdf"] }).pdf,
      };
    }

    throw new CarouselRenderError(current.message, current.code, current.retryable);
  }

  /** Panggil Modal function endpoint */
  private async callFn(path: string, body: unknown): Promise<ModalResponse> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new CarouselRenderError(
        `Modal carousel error HTTP ${res.status}: ${text.slice(0, 200)}`,
        res.status >= 500 ? "modal_server_error" : "modal_client_error",
        res.status >= 500,
      );
    }

    return (await res.json()) as ModalResponse;
  }

  /** Bungkus error jaringan tak terduga jadi CarouselRenderError */
  private toRenderError(error: unknown): CarouselRenderError {
    if (error instanceof CarouselRenderError) return error;
    return new CarouselRenderError(
      `Gagal memanggil Modal carousel function: ${error instanceof Error ? error.message : String(error)}`,
      "modal_unreachable",
      true,
    );
  }
}
