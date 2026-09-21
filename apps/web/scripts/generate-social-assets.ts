// ============================================================
// Generate aset profil social media Sahabat Kreator.
//
// Profile pictures (persegi, bg navy, tahan crop bulat):
//   facebook-profile   512   instagram-profile  320   tiktok-profile   400
//   youtube-profile    800   x-profile          400   linkedin-profile 400
//   threads-profile    320   pinterest-profile  400   bluesky-profile  400
//   google-profile     720
//
// Banners / cover (layout vertikal di tengah kecuali LinkedIn horizontal):
//   facebook-cover     1640x624   (2x dari 820x312)
//   youtube-banner     2560x1440  (safe zone 1235x338 di tengah)
//   x-header           1500x500
//   bluesky-banner     1500x500
//   google-cover       1080x608   (16:9)
//   linkedin-cover     1128x191   (horizontal, safe zone 60% tengah)
//
// Tidak dibuatkan banner: Instagram, TikTok, Threads, Pinterest
// (platform tsb tidak punya banner profil — hanya profile pic + bio).
//
// Jalankan dari root repo:
//   bun apps/web/scripts/generate-social-assets.ts
//
// Palet brand (dari index.css / generate-logo-assets.ts):
//   navy #0C1627, biru #08A5FC, oranye #FD9501, warm #FAF8F6
//
// Catatan layout:
//   - Profile picture: Facebook/X/LinkedIn menempatkan avatar di pojok
//     kiri-bawah banner. Karena layout banner semuanya di tengah, tidak
//     ada tabrakan.
//   - YouTube menampilkan banner penuh di TV tapi hanya safe zone
//     1235x338 di tengah pada perangkat lain → semua teks dikandung
//     di area itu.
//   - LinkedIn cover cuma 191px tinggi (dan di-crop ke ~144px di mobile)
//     → cukup logo + wordmark, tanpa tagline.
// ============================================================

import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "../../server/node_modules/sharp/dist/index.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "public", "logo-sahabat-kreator-baru.png");
const OUT = path.join(ROOT, "..", "..", "docs", "social-platforms", "assets");

const NAVY = "#0C1627";
const BLUE = "#08A5FC";
const ORANGE = "#FD9501";

// Region grafik pada logo sumber (sama dengan generate-logo-assets.ts)
const MARK = { left: 309, top: 128, width: 662, height: 551 };

const TAGLINE = "Kelola semua konten social media Anda dari satu dashboard";
const WORDMARK = "Sahabat Kreator";

// ---------- helper ----------

/** Grafik logo (tanpa wordmark) di-fit ke kanvas persegi transparan */
async function markSquare(size: number) {
  return sharp(SRC)
    .extract(MARK)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

/** Profile picture persegi: bg navy + grafik 65% (aman untuk crop bulat) */
async function profilePic(size: number, name: string) {
  const inner = Math.round(size * 0.65);
  const pad = Math.round((size - inner) / 2);
  const mark = await markSquare(inner);
  await sharp({
    create: { width: size, height: size, channels: 4, background: NAVY },
  })
    .composite([{ input: mark, left: pad, top: pad }])
    .png()
    .toFile(path.join(OUT, name));
  console.log(`OK: ${name} ${size}x${size}`);
}

/** Background navy + dua radial glow (biru kiri-bawah, oranye kanan-atas) */
function bgSvg(w: number, h: number) {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <defs>
        <radialGradient id="glow1" cx="12%" cy="92%" r="75%">
          <stop offset="0%" stop-color="${BLUE}" stop-opacity="0.28"/>
          <stop offset="100%" stop-color="${NAVY}" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="glow2" cx="92%" cy="8%" r="55%">
          <stop offset="0%" stop-color="${ORANGE}" stop-opacity="0.20"/>
          <stop offset="100%" stop-color="${NAVY}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${w}" height="${h}" fill="${NAVY}"/>
      <rect width="${w}" height="${h}" fill="url(#glow1)"/>
      <rect width="${w}" height="${h}" fill="url(#glow2)"/>
    </svg>
  `);
}

/**
 * Banner layout vertikal terpusat: logo → wordmark → accent bar → tagline.
 * Semua elemen di-stack di tengah horizontal & vertikal.
 */
async function stackedBanner(
  w: number,
  h: number,
  name: string,
  opts: { logo: number; word: number; tag: number },
) {
  const { logo, word, tag } = opts;
  const barW = Math.round(word * 5.0);
  const barH = Math.max(8, Math.round(word * 0.14));

  // tinggi total konten untuk padding vertikal seimbang
  const totalH = logo + Math.round(word * 0.22) + word + Math.round(word * 0.16) + barH + Math.round(tag * 0.5) + tag;
  const logoTop = Math.max(0, Math.round((h - totalH) / 2));
  const logoLeft = Math.round((w - logo) / 2);

  const wordBase = logoTop + logo + Math.round(word * 0.22) + word;
  const barTop = wordBase + Math.round(word * 0.16);
  const tagBase = barTop + barH + Math.round(tag * 0.5);

  const mark = await markSquare(logo);
  const textSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <defs>
        <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="${BLUE}"/>
          <stop offset="100%" stop-color="${ORANGE}"/>
        </linearGradient>
      </defs>
      <text x="${w / 2}" y="${wordBase}" text-anchor="middle"
            font-family="Segoe UI, Arial, Helvetica, sans-serif"
            font-size="${word}" font-weight="700" fill="#FFFFFF">${WORDMARK}</text>
      <rect x="${(w - barW) / 2}" y="${barTop}" width="${barW}" height="${barH}" rx="${barH / 2}" fill="url(#accent)"/>
      <text x="${w / 2}" y="${tagBase}" text-anchor="middle"
            font-family="Segoe UI, Arial, Helvetica, sans-serif"
            font-size="${tag}" fill="#B8C4D6">${TAGLINE}</text>
    </svg>
  `);

  await sharp(bgSvg(w, h))
    .composite([
      { input: mark, left: logoLeft, top: logoTop },
      { input: textSvg, left: 0, top: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, name));
  console.log(`OK: ${name} ${w}x${h}`);
}

async function main() {
  // ---------------- Profile pictures ----------------
  await profilePic(512, "facebook-profile.png");
  await profilePic(320, "instagram-profile.png");
  await profilePic(400, "tiktok-profile.png");
  await profilePic(800, "youtube-profile.png");
  await profilePic(400, "x-profile.png");
  await profilePic(400, "linkedin-profile.png");
  await profilePic(320, "threads-profile.png");
  await profilePic(400, "pinterest-profile.png");
  await profilePic(400, "bluesky-profile.png");
  await profilePic(720, "google-profile.png");

  // ---------------- Banners / cover ----------------
  // Facebook: 2x dari 820x312
  await stackedBanner(1640, 624, "facebook-cover.png", { logo: 176, word: 88, tag: 44 });

  // YouTube: konten harus muat di safe zone 1235x338 (di tengah canvas 2560x1440)
  await stackedBanner(2560, 1440, "youtube-banner.png", { logo: 150, word: 76, tag: 36 });

  // X & Bluesky: 1500x500
  await stackedBanner(1500, 500, "x-header.png", { logo: 120, word: 62, tag: 30 });
  await stackedBanner(1500, 500, "bluesky-banner.png", { logo: 120, word: 62, tag: 30 });

  // Google Business: 1080x608 (16:9)
  await stackedBanner(1080, 608, "google-cover.png", { logo: 130, word: 64, tag: 32 });

  // LinkedIn: horizontal (logo kiri + wordmark kanan), tinggi cuma 191px
  await linkedinCover();
}

/** LinkedIn company cover 1128x191 — horizontal, tanpa tagline (space terlalu tipis) */
async function linkedinCover() {
  const W = 1128;
  const H = 191;
  const logoSize = 96;
  const word = 52;

  const mark = await markSquare(logoSize);
  // grup logo+teks di-tengah, lebar total ~ logo + gap + wordmark
  const wordW = Math.round(word * 8.2);
  const gap = 28;
  const groupW = logoSize + gap + wordW;
  const logoLeft = Math.round((W - groupW) / 2);
  const logoTop = Math.round((H - logoSize) / 2);
  const wordLeft = logoLeft + logoSize + gap;
  const wordBase = Math.round(H / 2 + word * 0.35);

  const textSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <defs>
        <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="${BLUE}"/>
          <stop offset="100%" stop-color="${ORANGE}"/>
        </linearGradient>
      </defs>
      <text x="${wordLeft}" y="${wordBase}" font-family="Segoe UI, Arial, Helvetica, sans-serif"
            font-size="${word}" font-weight="700" fill="#FFFFFF">${WORDMARK}</text>
      <rect x="${wordLeft}" y="${wordBase + 16}" width="180" height="8" rx="4" fill="url(#accent)"/>
    </svg>
  `);

  await sharp(bgSvg(W, H))
    .composite([
      { input: mark, left: logoLeft, top: logoTop },
      { input: textSvg, left: 0, top: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, "linkedin-cover.png"));
  console.log(`OK: linkedin-cover.png ${W}x${H}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
