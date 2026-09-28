// Carousel render adapter — interface tipis antara worker dan implementasi.
//
// Sama pola dengan ./types.ts (video render): worker tidak tahu detail
// implementasi, ganti infra (Modal → lainnya) tanpa rewrite worker.
// Implementasi: ./carousel.ts (Modal Pillow). Lihat RFC docs/rfc-carousel-render.md.
//
// Berbeda dari video render: output BUKAN satu file, tapi array slide JPEG.
// Background sudah ada di R2 (media library user atau pool stock); adapter
// fetch via presigned URL, render tiap slide, upload balik via presigned URL.

/** Background satu slide — solid gradient atau gambar dari R2 */
export type CarouselSlideBackground =
  | {
      mode: "solid";
      /** Warna atas gradient (hex, mis. "#6B21A8") */
      topColor: string;
      /** Warna bawah gradient (hex) */
      bottomColor: string;
    }
  | {
      mode: "image";
      /** Presigned URL download background dari R2 */
      url: string;
    };

/**
 * Placement teks dari AI Visual Layout Director (RFC §7, fase 2).
 * Opsional — bila null, renderer pakai template center (fallback).
 */
export type CarouselSlideLayout = {
  /** Zona vertikal: "top" = 20% atas, "center", "bottom" = 20% bawah */
  zone: "top" | "center" | "bottom";
  /** Alignment horizontal */
  align: "left" | "center" | "right";
  /** Warna teks: "light" = putih (bg gelap), "dark" = hitam (bg terang) */
  contrast: "light" | "dark";
};

/** Satu slide lengkap dengan background + target upload — self-contained */
export type CarouselRenderSlide = {
  /** Nomor slide, mulai dari 1 (urutan tampil) */
  urutan: number;
  /** Judul slide (wajib; auto-shrink bila terlalu panjang) */
  title: string;
  /** Isi slide (paragraf, dipisah newline; baris kosong = jeda paragraf) */
  body: string;
  /** Background slide ini (solid gradient atau gambar) */
  background: CarouselSlideBackground;
  /** Presigned URL upload JPEG hasil render slide ini */
  uploadUrl: string;
  /** Placement dari vision layout director (opsional — fase 2) */
  layout?: CarouselSlideLayout | null;
};

/**
 * Request render carousel — dipassing worker ke adapter.
 *
 * Setiap slide self-contained: bawa background + upload URL sendiri, jadi
 * tidak ada risiko index mismatch antar array paralel.
 */
export type CarouselRenderRequest = {
  /** ID internal carousel_job (untuk logging, bukan untuk auth) */
  jobId: string;
  /** Format output — tentukan dimensi canvas. RFC §8. */
  format: "portrait" | "portrait4_5" | "square";
  /** Style tipografi — RFC §2 (di-port dari renderer.py referensi). */
  style: "outline" | "box" | "box_title_content" | "plain";
  /** Opacity box untuk style box/box_title_content (0-255) */
  boxOpacity: number;
  /** Nama family font judul (harus ada di bundle font Modal) */
  titleFontFamily: string;
  /** Nama family font isi (harus ada di bundle font Modal) */
  contentFontFamily: string;
  /** Slide lengkap (background + upload URL per slide) */
  slides: CarouselRenderSlide[];
};

/** Metadata satu slide hasil render */
export type CarouselRenderedSlide = {
  urutan: number;
  width: number;
  height: number;
  sizeBytes: number;
};

/** Response render carousel — semua upload sudah dilakukan adapter ke R2 */
export type CarouselRenderResponse = {
  slides: CarouselRenderedSlide[];
  /** Hanya ada saat exportFormat=pdf (RFC §8 fase 3 — LinkedIn document post) */
  pdf?: {
    sizeBytes: number;
    /** Jumlah halaman PDF = jumlah slide */
    pageCount: number;
    width: number;
    height: number;
  };
};

/**
 * Adapter carousel render — implementasi tunggal: Modal (Pillow).
 *
 * Progress dilaporkan via callback agar worker bisa update kolom
 * carousel_job.progress (frontend polling tampilkan ke user).
 */
export interface CarouselRenderAdapter {
  /** Nama adapter untuk logging */
  readonly name: string;

  /**
   * Jalankan render carousel. Throw CarouselRenderError bila gagal
   * (worker akan retry via BullMQ sesuai retryable).
   * onProgress dipanggil adapter dengan nilai 0-100.
   */
  render(
    req: CarouselRenderRequest,
    onProgress?: (percent: number) => void,
  ): Promise<CarouselRenderResponse>;

  /**
   * Render carousel sebagai SATU file PDF (RFC §8 fase 3 — LinkedIn document
   * post). Slide JPEG tetap dirender, lalu disatukan jadi PDF multi-halaman.
   * Kontrak: uploadUrl slide PERTAMA adalah target PDF tunggal.
   *
   * Return null bila app Modal carousel tidak mendukung export PDF —
   * caller fallback ke slide JPEG terpisah.
   */
  renderPdf(req: CarouselRenderRequest): Promise<CarouselRenderResponse>;
}

/** Error carousel render — dipetakan worker ke kode + retry decision */
export class CarouselRenderError extends Error {
  constructor(
    message: string,
    /** Kode error internal (disimpan di carousel_job.error_code) */
    public code: string,
    /**
     * true = error sementara (timeout, network, 5xx) → BullMQ retry.
     * false = error permanen (input invalid, tidak terkonfigurasi) → failed.
     */
    public retryable: boolean,
  ) {
    super(message);
    this.name = "CarouselRenderError";
  }
}
