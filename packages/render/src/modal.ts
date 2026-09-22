// Modal adapter — implementasi RenderAdapter via Modal.com Web Function.
//
// Modal adalah serverless container (per-second billing, scale-to-zero).
// Alasan dipilih: server prod 2c/4g sudah over-allocated (postgres 1g + app 1g
// + worker 1.5g = 3.5g/4g RAM, 3.0/2 cpu). Render ffmpeg 1080p butuh 0.5-1.5GB
// → OOM killer akan bunuh Postgres (oom_score tertinggi). Lihat RFC §11.
//
// Modal function-nya ada di apps/render-modal/ (Python, deploy terpisah via
// `modal deploy`). Worker hanya panggil HTTP ini.
//
// Alur:
// 1. Worker buat presigned URL R2 untuk input & output.
// 2. Worker POST request ke Modal Web Function.
// 3. Modal fetch input dari R2 → ffmpeg pipeline → upload output balik ke R2.
//    (server SahabatKreator tidak pernah download video besar)
// 4. Response berisi metadata output (durasi, dimensi, size).
//
// FASE 1 = SYNC: function Modal menjalankan pipeline sampai selesai dalam satu
// request. Async (submit + poll /status untuk video panjang) adalah fase 2 —
// lihat docs/rfc-video-render.md. BullMQ worker sudah punya retry + backoff
// jadi kegagalan sementara aman.
import { env } from "@sahabatkreator/env/server";
import {
  type RenderAdapter,
  type RenderRequest,
  type RenderResponse,
  RenderError,
} from "./types";

/** Response Modal function — sukses */
type ModalSuccess = {
  status: "done";
  durationSeconds: number;
  width: number;
  height: number;
  sizeBytes: number;
  detectedLanguage?: string;
};

/** Response Modal function — gagal */
type ModalFailure = {
  status: "failed";
  code: string;
  message: string;
  retryable: boolean;
};

type ModalResponse = ModalSuccess | ModalFailure;

export class ModalRenderAdapter implements RenderAdapter {
  readonly name = "modal";

  private get baseUrl(): string {
    if (!env.MODAL_RENDER_URL) {
      throw new RenderError(
        "MODAL_RENDER_URL belum dikonfigurasi — fitur render nonaktif",
        "render_not_configured",
        false,
      );
    }
    return env.MODAL_RENDER_URL.replace(/\/$/, "");
  }

  private get token(): string {
    if (!env.MODAL_TOKEN) {
      throw new RenderError(
        "MODAL_TOKEN belum dikonfigurasi — fitur render nonaktif",
        "render_not_configured",
        false,
      );
    }
    return env.MODAL_TOKEN;
  }

  async render(
    req: RenderRequest,
    onProgress?: (percent: number) => void,
  ): Promise<RenderResponse> {
    // 1. Submit job ke Modal function
    const submitBody = {
      jobId: req.jobId,
      baseVideoUrl: req.baseVideoUrl,
      voiceoverUrl: req.voiceoverUrl,
      bgmUrl: req.bgmUrl,
      settings: req.settings,
      outputUploadUrl: req.outputUploadUrl,
      srtUploadUrl: req.srtUploadUrl,
    };

    let current: ModalResponse;
    try {
      current = await this.callFn("/render", submitBody);
    } catch (error) {
      throw this.toRenderError(error);
    }

    if (current.status === "done") {
      onProgress?.(100);
      return {
        durationSeconds: current.durationSeconds,
        width: current.width,
        height: current.height,
        sizeBytes: current.sizeBytes,
        detectedLanguage: current.detectedLanguage,
      };
    }

    // Fase 1 selalu done/failed di satu request; cabang processing tidak
    // diproduksi function Modal (async = fase 2).
    throw new RenderError(current.message, current.code, current.retryable);
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
      throw new RenderError(
        `Modal function error HTTP ${res.status}: ${text.slice(0, 200)}`,
        res.status >= 500 ? "modal_server_error" : "modal_client_error",
        res.status >= 500,
      );
    }

    return (await res.json()) as ModalResponse;
  }

  /** Bungkus error jaringan tak terduga jadi RenderError */
  private toRenderError(error: unknown): RenderError {
    if (error instanceof RenderError) return error;
    return new RenderError(
      `Gagal memanggil Modal function: ${error instanceof Error ? error.message : String(error)}`,
      "modal_unreachable",
      true,
    );
  }
}
