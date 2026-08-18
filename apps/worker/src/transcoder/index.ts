import { LocalTranscoder } from "./local.js";
import type { Transcoder } from "./types.js";

/**
 * Pilih implementasi transcoder dari env TRANSCODER.
 * Hanya "local" yang tersedia sekarang; nilai lain gagal cepat (fail-fast)
 * supaya tidak diam-diam memakai ffmpeg lokal saat pengguna mengharapkan Modal.
 */
export function resolveTranscoder(): Transcoder {
    const selected = process.env.TRANSCODER || "local";
    switch (selected) {
        case "local":
            return new LocalTranscoder();
        case "modal":
            throw new Error("TRANSCODER=modal belum diimplementasikan. Tambahkan ModalTranscoder di transcoder/modal.ts, lalu daftarkan di sini.");
        default:
            throw new Error(`TRANSCODER tidak dikenal: "${selected}". Gunakan "local" (default) atau "modal".`);
    }
}