// Clipper adapter — interface antara worker dan implementasi Modal.
//
// Sama pola dengan ./types.ts (video render) dan ./carousel-types.ts:
// worker tidak tahu detail infra, ganti Modal → lainnya tanpa rewrite.
// Implementasi: ./clipper.ts (Modal app `sahabatkreator-clipper`).
// Lihat RFC docs/rfc-auto-clip.md §4 (akun Modal kedua) dan §7 (endpoint).
//
// Beda dari video render: adapter ini JALAN DI AWAL pipeline auto-clip —
// download + transkripsi source. Seleksi momen (OpenRouter) ada di worker
// (packages/queue), karena itu adalah orkestrasi DB + cache Redis. Modal
// hanya kerja berat: fetch R2, ffmpeg probe, faster-whisper, upload SRT.

/**
 * Request ingest source — worker → Modal /ingest.
 *
 * Source bisa: (a) media library yang sudah ada di R2 (presigned URL), atau
 * (b) URL langsung tier T1/T2 yang user paste (download oleh Modal, bukan
 * server — RFC §2). T3 tidak ada kodenya.
 */
export type ClipperIngestRequest = {
  /** ID internal video_job mode auto_clip (logging, bukan auth) */
  jobId: string;
  /**
   * Sumber video: presigned URL R2 (media library) atau URL paste-link T1/T2.
   * Modal yang download — server 2c/4g tidak pernah sentuh byte video.
   */
  sourceUrl: string;
  /** Tier source untuk audit log saja (tidak mengubah perilaku). RFC §2. */
  sourceTier: "t1" | "t2";
  /**
   * Presigned URL upload SRT hasil transkripsi ke R2. Worker generate,
   * Modal upload hasilnya ke sini.
   */
  srtUploadUrl: string;
  /**
   * Presigned URL upload SOURCE video ke R2 (hanya untuk input URL T1/T2).
   *
   * Kenapa perlu: fan-out render job anak memakai baseVideoMediaId →
   * presign GET storageKey biasa. Kalau source hanya tinggal URL, render job
   * harus tahu URL (sk_render.py berubah + URL bisa kedaluwarsa). Jadi clipper
   * upload sekali source-nya ke sini; setelah itu jalur upload biasa yang
   * berlaku di mana-mana. Null untuk input media library (sudah ada di R2).
   */
  sourceUploadUrl?: string | null;
  /** Model Whisper: small (default, cepat) atau medium (akurasi). RFC §7. */
  whisperModel: "small" | "medium" | "base";
  /** Bahasa transkripsi (default "id"). Auto-detect kalau "auto". */
  language: "id" | "en" | "auto";
  /**
   * true = minta word timestamps (untuk karaoke caption render anak nanti).
   * false = segment-level saja, lebih cepat. Default true.
   */
  wordTimestamps: boolean;
};

/** Response /ingest — sukses */
export type ClipperIngestResponse = {
  status: "done";
  /** Durasi source video (detik) — worker simpan untuk validasi rentang AI */
  durationSeconds: number;
  /** Lebar/tinggi source (dipakai render anak untuk target orientation) */
  width: number;
  height: number;
  /** Ukuran file source (bytes, audit) */
  sizeBytes: number;
  /** Bahasa terdeteksi Whisper (validasi asumsi user) */
  detectedLanguage?: string;
  /** Jumlah baris transkrip di SRT (sanity check) */
  segmentCount: number;
  /** Estimasi durasi audio yang ditranskripsi (detik, audit) */
  audioDurationSeconds: number;
};

/** Response /ingest — gagal */
export type ClipperFailure = {
  status: "failed";
  code: string;
  message: string;
  retryable: boolean;
};

/**
 * Adapter clipper ingest — implementasi tunggal: Modal (ffmpeg + whisper).
 *
 * RFC §7.1: log retention Starter 1 hari → message error wajib rinci
 * (disimpan worker ke video_job.error_message), jangan andalkan log Modal.
 */
export interface ClipperAdapter {
  /** Nama adapter untuk logging */
  readonly name: string;

  /**
   * Download source (di Modal) + transkrip Whisper + upload SRT ke R2.
   * Throw ClipperError bila gagal (worker retry via BullMQ sesuai retryable).
   */
  ingest(
    req: ClipperIngestRequest,
    onProgress?: (percent: number) => void,
  ): Promise<ClipperIngestResponse>;
}

/** Error clipper — dipetakan worker ke kode + retry decision */
export class ClipperError extends Error {
  constructor(
    message: string,
    /** Kode error internal (disimpan ke video_job.error_code) */
    public code: string,
    /**
     * true = error sementara (timeout, network, 5xx Modal) → BullMQ retry.
     * false = permanen (input invalid, tidak terkonfigurasi) → failed.
     */
    public retryable: boolean,
  ) {
    super(message);
    this.name = "ClipperError";
  }
}
