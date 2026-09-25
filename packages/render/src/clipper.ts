// Modal clipper adapter — implementasi ClipperAdapter via Modal.com Web Function.
//
// App Modal TERPISAH: `sahabatkreator-clipper` (RFC auto-clip §4). Alasannya
// bukan biaya tapi ISOLASI KAPASITAS: quota concurrency Modal per workspace
// (Starter = 100 container, RFC §7.1). Spike clipper (transkripsi 30 menit)
// tidak boleh kelaparan job render slideshow yang customer publish tunggu.
// Itu sebabnya akun Modal kedua dipakai di sini.
//
// Worker hanya orkestrasi: presign R2 → POST HTTP → simpan SRT key.
// Server tidak pernah download video besar (sama pola modal.ts).
import { env } from "@sahabatkreator/env/server";
import {
  type ClipperAdapter,
  ClipperError,
  type ClipperFailure,
  type ClipperIngestRequest,
  type ClipperIngestResponse,
} from "./clipper-types";

type ModalIngestResponse = ClipperIngestResponse | ClipperFailure;

export class ModalClipperAdapter implements ClipperAdapter {
  readonly name = "modal-clipper";

  private get baseUrl(): string {
    if (!env.MODAL_CLIPPER_URL) {
      throw new ClipperError(
        "MODAL_CLIPPER_URL belum dikonfigurasi — fitur auto-clip nonaktif",
        "clipper_not_configured",
        false,
      );
    }
    return env.MODAL_CLIPPER_URL.replace(/\/$/, "");
  }

  /**
   * Token clipper: MODAL_CLIPPER_TOKEN bila ada (akun kedua, RFC §4),
   * fallback MODAL_TOKEN (akun yang sama dgn render).
   */
  private get token(): string {
    const token = env.MODAL_CLIPPER_TOKEN || env.MODAL_TOKEN;
    if (!token) {
      throw new ClipperError(
        "Token Modal clipper belum dikonfigurasi — fitur auto-clip nonaktif",
        "clipper_not_configured",
        false,
      );
    }
    return token;
  }

  async ingest(
    req: ClipperIngestRequest,
    onProgress?: (percent: number) => void,
  ): Promise<ClipperIngestResponse> {
    onProgress?.(10);
    const body = {
      jobId: req.jobId,
      sourceUrl: req.sourceUrl,
      sourceTier: req.sourceTier,
      srtUploadUrl: req.srtUploadUrl,
      whisperModel: req.whisperModel,
      language: req.language,
      wordTimestamps: req.wordTimestamps,
    };

    let res: ModalIngestResponse;
    try {
      res = await this.callFn("/ingest", body);
    } catch (error) {
      throw this.toClipperError(error);
    }

    if (res.status === "done") {
      onProgress?.(100);
      return res;
    }
    // RFC §7.1: log Modal cuma 1 hari — message wajib self-contained.
    throw new ClipperError(res.message, res.code, res.retryable);
  }

  /** Panggil Modal function endpoint */
  private async callFn(path: string, body: unknown): Promise<ModalIngestResponse> {
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
      throw new ClipperError(
        `Modal clipper error HTTP ${res.status}: ${text.slice(0, 200)}`,
        res.status >= 500 ? "clipper_server_error" : "clipper_client_error",
        res.status >= 500,
      );
    }

    return (await res.json()) as ModalIngestResponse;
  }

  /** Bungkus error jaringan tak terduga jadi ClipperError */
  private toClipperError(error: unknown): ClipperError {
    if (error instanceof ClipperError) return error;
    return new ClipperError(
      `Gagal memanggil Modal clipper: ${error instanceof Error ? error.message : String(error)}`,
      "clipper_unreachable",
      true,
    );
  }
}
