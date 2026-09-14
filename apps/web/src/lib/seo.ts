// SEO helper via @unhead/react

import { env } from "@sahabatkreator/env/web";
import { useHead } from "@unhead/react";

const SITE_NAME = "Sahabat Kreator";
const SITE_URL = env.VITE_WEB_URL;
const DEFAULT_DESCRIPTION =
  "Kelola semua konten social media Anda dari satu tempat — jadwal posting, analitik, dan kolaborasi tim untuk kreator dan bisnis Indonesia.";
// OG image default 1200x630 — digenerate oleh scripts/generate-logo-assets.ts
// (logo + wordmark di atas navy). Jalankan ulang script itu bila logo berubah.
const DEFAULT_OG_IMAGE = "/og-default.png";
const DEFAULT_OG_IMAGE_WIDTH = 1200;
const DEFAULT_OG_IMAGE_HEIGHT = 630;
const DEFAULT_OG_IMAGE_ALT =
  "Logo Sahabat Kreator — platform manajemen social media all-in-one untuk kreator Indonesia";

type SeoInput = {
  title: string;
  description?: string;
  /** Path relatif, mis. /blog/slug-artikel. Bisa juga URL absolut untuk canonical eksternal. */
  path?: string;
  ogImage?: string;
  ogImageAlt?: string;
  ogImageWidth?: number;
  ogImageHeight?: number;
  ogType?: "website" | "article";
  noIndex?: boolean;
  jsonLd?: Record<string, unknown>;
};

// Daftar hostname staging yang HARUS noindex global
const STAGING_HOSTNAMES = new Set([
  "app.sahabatkreator.com",
  "staging.sahabatkreator.com",
  "dev.sahabatkreator.com",
  "preview.sahabatkreator.com",
]);

function isStagingHostname(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return (
    STAGING_HOSTNAMES.has(host) ||
    host.endsWith(".vercel.app") ||
    host.endsWith(".pages.dev") ||
    host === "localhost" ||
    host === "127.0.0.1"
  );
}

/**
 * Ubah path/URL apa pun menjadi URL absolut. Jika input sudah absolut
 * (http/https), kembalikan apa adanya — mencegah dobel URL seperti
 * `https://sahabatkreator.comhttps://r2.../cover.jpg`.
 */
export function toAbsoluteUrl(input: string): string {
  if (/^https?:\/\//i.test(input)) return input;
  return `${SITE_URL.replace(/\/$/, "")}${input.startsWith("/") ? "" : "/"}${input}`;
}

/**
 * Deteksi MIME type gambar dari ekstensi URL (untuk og:image:type).
 * Fallback image/png.
 */
export function detectImageMime(url: string): string {
  const clean = url.split(/[?#]/)[0] ?? url;
  if (/\.jpe?g$/i.test(clean)) return "image/jpeg";
  if (/\.webp$/i.test(clean)) return "image/webp";
  if (/\.gif$/i.test(clean)) return "image/gif";
  if (/\.svg$/i.test(clean)) return "image/svg+xml";
  return "image/png";
}

export function useSeo({
  title,
  description = DEFAULT_DESCRIPTION,
  path = "/",
  ogImage = DEFAULT_OG_IMAGE,
  ogImageAlt = DEFAULT_OG_IMAGE_ALT,
  ogImageWidth = DEFAULT_OG_IMAGE_WIDTH,
  ogImageHeight = DEFAULT_OG_IMAGE_HEIGHT,
  ogType = "website",
  noIndex = false,
  jsonLd,
}: SeoInput) {
  // Canonical bisa absolut (eksternal, mis. canonicalUrl blog) atau relatif
  const url = /^https?:\/\//i.test(path) ? path : `${SITE_URL}${path}`;
  const fullTitle = path === "/" ? title : `${title} — ${SITE_NAME}`;
  const fullOgImage = toAbsoluteUrl(ogImage);
  const ogImageMime = detectImageMime(fullOgImage);
  // Hosting staging (app.sahabatkreator.com, preview, localhost) → paksa noindex
  const forceNoIndex = noIndex || isStagingHostname();
  const robotsContent = forceNoIndex
    ? "noindex, nofollow, noarchive, nosnippet, noimageindex"
    : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";

  // Tipe union eksplisit — unhead Meta menuntut `name` ATAU `property` pasti
  // terisi (bukan keduanya optional) agar tidak jatuh ke HttpEquivMeta.
  const metaBase: Array<{ name: string; content: string }> = [
    { name: "description", content: description },
    { name: "robots", content: robotsContent },
  ];
  if (forceNoIndex) {
    metaBase.push({ name: "googlebot", content: "noindex, nofollow" });
  }

  useHead({
    title: fullTitle,
    meta: [
      ...metaBase,
      // Open Graph
      { property: "og:title", content: fullTitle },
      { property: "og:description", content: description },
      { property: "og:type", content: ogType },
      { property: "og:url", content: url },
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:image", content: fullOgImage },
      { property: "og:image:secure_url", content: fullOgImage },
      { property: "og:image:alt", content: ogImageAlt },
      { property: "og:image:width", content: String(ogImageWidth) },
      { property: "og:image:height", content: String(ogImageHeight) },
      { property: "og:image:type", content: ogImageMime },
      { property: "og:locale", content: "id_ID" },
      // Twitter
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@sahabatkreator" },
      { name: "twitter:title", content: fullTitle },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: fullOgImage },
      { name: "twitter:image:alt", content: ogImageAlt },
    ],
    link: [{ rel: "canonical", href: url }],
    ...(jsonLd
      ? {
          script: [
            {
              type: "application/ld+json",
              innerHTML: JSON.stringify(jsonLd),
            },
          ],
        }
      : {}),
  });
}
