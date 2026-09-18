// Sentiment detection ringan untuk auto-reply guard.
//
// Tujuan: mencegah AI auto-reply pada komentar/pesan negatif (komplain, marah,
// bullying). Penapis berbasis keyword Indonesia — murah, tanpa kredit AI, dan
// cukup akurat untuk guard (false-positive hanya menunda auto-reply, aman).
//
// Konteks: auto-reply publik ke komentar negatif bisa memperburuk situasi,
// jadi keputusan default untuk negatif = skip + flag human review.

/** Kata/frasa negatif (Indonesia + campuran sosmed) */
const NEGATIVE_PATTERNS = [
  // Kemarahan / kekecewaan
  "kecewa",
  "mengecewakan",
  "marah",
  "kesal",
  "kesel",
  "benci",
  "bodo",
  "bodoh",
  "goblok",
  "goblog",
  "tolol",
  "idiot",
  "sialan",
  "anjing",
  "anjg",
  "bangsat",
  "bajingan",
  "brengsek",
  "monyet",
  "setan",
  // Komplain
  "komplain",
  "keluhan",
  "lapor",
  "tidak puas",
  "kurang puas",
  "jelek",
  "jele",
  "buruk",
  "parah",
  "parah banget",
  "gak bagus",
  "ga bagus",
  "tidak bagus",
  "bermasalah",
  "error",
  "gagal",
  "tidak bisa",
  "gak bisa",
  "ga bisa",
  "nggak bisa",
  "ngak bisa",
  // Ancaman / eskalasi
  "lapor",
  "samsat",
  "pengadilan",
  "polisi",
  "kasih bintang satu",
  "uninstal",
  "unsubscribe",
  "berhenti langganan",
  // Sarkasme negatif umum
  "pdahal",
  "padahal",
  "janji manis",
  "bohong",
  "nipu",
  "niple",
  "scam",
  "penipuan",
];

/** Tanda baca berlebih yang mengindikasikan emosi kuat */
function hasExcessivePunctuation(text: string): boolean {
  const exclamation = (text.match(/[!?]/g) ?? []).length;
  const caps = (text.match(/[A-Z]/g) ?? []).length;
  // >=3 tanda seru ATAU >=40% huruf kapital (teriakan)
  return exclamation >= 3 || (caps > 8 && caps / Math.max(text.replace(/[^A-Za-z]/g, "").length, 1) > 0.4);
}

export type SentimentResult = {
  negative: boolean;
  /** Alasan (untuk log/audit) */
  reason: string;
};

/**
 * Deteksi cepat apakah teks bernada negatif.
 * Case-insensitive, perluasan terhadap "gak/ga/nggak" yang umum di sosmed ID.
 */
export function detectNegative(text: string): SentimentResult {
  const lower = text.toLowerCase();

  const hit = NEGATIVE_PATTERNS.find((p) => lower.includes(p));
  if (hit) {
    return { negative: true, reason: `keyword_negatif:${hit}` };
  }

  if (hasExcessivePunctuation(text)) {
    return { negative: true, reason: "emosi_tanda_baca_kapital" };
  }

  return { negative: false, reason: "netral" };
}
