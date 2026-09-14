// UTM Builder — util generate link tracking + deteksi URL di caption
// Dipakai panel compose & CSV import (client-side, tanpa network call).

export type UtmParams = {
  source: string;
  medium: string;
  campaign: string;
  term?: string;
  content?: string;
};

/** Gabungkan base URL + parameter UTM (encodeURIComponent otomatis) */
export function buildUtmUrl(baseUrl: string, params: UtmParams): string | null {
  let url: URL;
  try {
    url = new URL(baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`);
  } catch {
    return null;
  }

  const pairs: [string, string][] = [
    ["utm_source", params.source],
    ["utm_medium", params.medium],
    ["utm_campaign", params.campaign],
    ["utm_term", params.term ?? ""],
    ["utm_content", params.content ?? ""],
  ];
  for (const [key, value] of pairs) {
    if (value.trim()) url.searchParams.set(key, value.trim());
  }
  return url.toString();
}

const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;

/** Cari semua URL di teks caption */
export function findUrls(text: string): string[] {
  return [...text.matchAll(URL_RE)].map((m) => m[0]);
}

/** Ganti URL lama dengan versi ber-UTM di dalam caption */
export function applyUtmToCaption(caption: string, url: string, utmUrl: string): string {
  return caption.split(url).join(utmUrl);
}
