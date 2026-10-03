// Pembacaan & deteksi rate limit platform — dua hal yang tinggal di sini:
//
// 1. Parser header kuota Meta (`x-app-usage`, `x-business-use-case-usage`).
//    PENTING: keduanya berisi PERSENTASE pemakaian, bukan jumlah call absolut.
//    Bentuk `x-app-usage` yang diukur langsung di produksi (3 Okt 2026, Graph
//    v26.0) adalah ANGKA DATAR:
//        {"call_count":14,"total_cputime":0,"total_time":0}
//    sedangkan parser lama mengharapkan objek bersarang (`{"total":14}`) dan
//    hanya membaca `x-business-use-case-usage` — akibatnya `call_count.total`
//    selalu `undefined` → terbaca 0 → kuota dilaporkan "200/200 aman" selamanya.
//
// 2. `isThrottleError` — memisahkan "kuota habis" dari "permintaan salah".
//    Sync memakainya untuk berhenti lebih awal (Meta sendiri menyarankan begitu:
//    terus memanggil justru memperpanjang blokir) dan untuk memberi pesan yang
//    jelas, bukan metrik 0 tanpa penjelasan.
//
// Modul ini SENGAJA tanpa import DB supaya bisa diuji sebagai fungsi murni.

/** Pemakaian kuota app-wide dari header `x-app-usage`. Semua nilai persen. */
export type MetaAppUsage = {
  /** % kuota call app pada window 1 jam bergulir. 100 = mentok. */
  callCountPct: number;
  /** % CPU time yang terpakai. */
  cputimePct: number;
  /** % total time yang terpakai. */
  totalTimePct: number;
};

/** Satu entri kuota Business Use Case dari `x-business-use-case-usage`. */
export type MetaBucUsage = {
  /** ID app/business pemilik kuota (kunci objek di header). */
  entityId: string;
  /** Jenis BUC bila disebut header (instagram, pages, messenger, …). */
  type: string | null;
  /** % kuota terpakai pada window BUC. */
  callCountPct: number;
  /** Menit sampai akses pulih — 0 berarti tidak sedang diblokir. */
  regainAccessMinutes: number | null;
};

/** Angka finite, atau null. */
function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * `call_count` BUC bisa berbentuk angka datar (contoh di dokumentasi Meta:
 * `"call_count": 95`) MAUPUN objek `{ "total": 95 }` (bentuk yang diasumsikan
 * parser lama). Keduanya diterima supaya perubahan bentuk header tidak lagi
 * menghasilkan laporan kuota palsu yang selalu "aman".
 */
function readCallCountPct(value: unknown): number | null {
  const direct = readNumber(value);
  if (direct !== null) return direct;
  if (typeof value === "object" && value !== null) {
    return readNumber((value as Record<string, unknown>).total);
  }
  return null;
}

/**
 * Parse `x-app-usage` → pemakaian kuota app-wide.
 * Header ini TIDAK menyebut app mana; pakai `metaAppKeyForUrl` untuk itu.
 */
export function parseMetaAppUsage(headerValue: string | null | undefined): MetaAppUsage | null {
  if (!headerValue) return null;
  try {
    const raw = JSON.parse(headerValue) as Record<string, unknown>;
    if (typeof raw !== "object" || raw === null) return null;
    const callCountPct = readNumber(raw.call_count);
    if (callCountPct === null) return null;
    return {
      callCountPct,
      cputimePct: readNumber(raw.total_cputime) ?? 0,
      totalTimePct: readNumber(raw.total_time) ?? 0,
    };
  } catch {
    // header korup / format berubah — jangan sampai menggagalkan request
    return null;
  }
}

/**
 * Parse `x-business-use-case-usage` → daftar kuota per entitas.
 * Header bisa memuat beberapa entitas (hingga 32) dalam satu respons.
 */
export function parseMetaBucUsage(headerValue: string | null | undefined): MetaBucUsage[] {
  if (!headerValue) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(headerValue);
  } catch {
    return [];
  }
  if (typeof raw !== "object" || raw === null) return [];

  const out: MetaBucUsage[] = [];
  for (const [entityId, value] of Object.entries(raw as Record<string, unknown>)) {
    const entries = Array.isArray(value) ? value : [value];
    for (const entry of entries) {
      if (typeof entry !== "object" || entry === null) continue;
      const e = entry as Record<string, unknown>;
      const callCountPct = readCallCountPct(e.call_count);
      if (callCountPct === null) continue;
      // `estimated_time_to_regain_access` ada di level entri; bentuk lama
      // menaruhnya di dalam call_count — terima keduanya.
      const regain =
        readNumber(e.estimated_time_to_regain_access) ??
        (typeof e.call_count === "object" && e.call_count !== null
          ? readNumber(
              (e.call_count as Record<string, unknown>).estimated_time_to_regain_full_access,
            )
          : null);
      out.push({
        entityId,
        type: typeof e.type === "string" ? e.type : null,
        callCountPct,
        regainAccessMinutes: regain,
      });
    }
  }
  return out;
}

/**
 * Kunci app Meta dari URL endpoint.
 *
 * MENGAPA perlu: `x-app-usage` tidak menyebut app mana yang dipakai, sedangkan
 * setiap app Meta (Facebook, Instagram Login, Threads) punya anggaran sendiri
 * (`200 × daily active user` per jam). Host endpoint adalah satu-satunya penanda
 * yang kita punya, dan tiap jalur di aplikasi ini memang memakai host berbeda.
 */
export function metaAppKeyForUrl(url: string): string {
  try {
    const host = new URL(url).host;
    if (host.endsWith("graph.instagram.com")) return "meta_app_instagram_login";
    if (host.endsWith("graph.threads.net")) return "meta_app_threads";
    if (host.endsWith("graph.facebook.com")) return "meta_app_facebook";
  } catch {
    // URL relatif / tidak valid — pakai kunci umum
  }
  return "meta_app";
}

/**
 * Kode error Meta yang berarti KUOTA HABIS, bukan permintaan salah:
 * 4 (app), 17 (user), 32 (page), 613 (custom rate limit), dan
 * 80001–80014 (Business Use Case: pages, instagram, messenger, leadgen, dst).
 * Format pesan dari `extractErrorMessage` adalah `[<code>] <message>`.
 */
const THROTTLE_CODE_RE = /\[(?:4|17|32|613|8000[1-9]|8001[0-4])\]/;

/** Frasa yang dipakai platform saat membatasi (Meta dan platform lain). */
const THROTTLE_TEXT_RE =
  /(?:rate limit|request limit|limit reached|too many|throttl|application request limit|user request limit)/i;

/**
 * Apakah pesan error berarti "sedang dibatasi platform"?
 *
 * Dipakai sync supaya (a) berhenti lebih awal — meneruskan panggilan hanya
 * memperpanjang blokir — dan (b) melaporkan sebab yang benar ke pengguna.
 */
export function isThrottleError(message: string | null | undefined): boolean {
  if (!message) return false;
  return THROTTLE_CODE_RE.test(message) || THROTTLE_TEXT_RE.test(message);
}
