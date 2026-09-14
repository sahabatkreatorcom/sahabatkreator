// ============================================================
// Generate aset logo turunan dari public/logo-sahabat-kreator-baru.png:
//   - og-default.png        1200x630  (OG/Twitter share banner, logo penuh)
//   - favicon-32.png        32x32     (badge notifikasi, fallback)
//   - favicon-16.png        16x16
//   - favicon.ico           16+32+48 multi-size
//   - apple-touch-icon.png  180x180   (iOS home screen, wajib opaque)
//   - pwa-192.png           192x192   (PWA manifest, purpose any)
//   - pwa-512.png           512x512   (PWA manifest, purpose any)
//   - pwa-512-maskable.png  512x512   (safe zone, background navy)
//   - app-icon-1024.png     1024x1024 (Meta App Review, transparan)
//
// Jalankan dari root repo:
//   bun apps/web/scripts/generate-logo-assets.ts
//
// Logo sumber 1254x1254 terdiri dari GRAFIK (bbox x309-970, y128-678)
// + WORDMARK di bawahnya (dipisah gap y679-701). Icon kecil memakai
// grafik saja agar tetap terbaca; OG banner memakai logo penuh.
//
// Palet brand (dari index.css): navy #0C1627, biru #08A5FC,
// oranye #FD9501, background warm #FAF8F6.
//
// Background icon:
//   - favicon & pwa-192/512 → TRANSPARAN (mengikuti tema browser/launcher).
//   - apple-touch-icon → wajib opaque (iOS mengubah alpha menjadi hitam),
//     memakai warm agar grafik navy tetap terlihat.
//   - pwa-512-maskable → navy agar menyatu di launcher Android.
// ============================================================

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "../../server/node_modules/sharp/dist/index.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "public", "logo-sahabat-kreator-baru.png");
const OUT = path.join(ROOT, "public");

const NAVY = "#0C1627";
const WARM = "#FAF8F6";
const BLUE = "#08A5FC";
const ORANGE = "#FD9501";

// Region grafik pada logo sumber (hasil analisa alpha bbox)
const MARK = { left: 309, top: 128, width: 662, height: 551 };

async function main() {
  // Grafik tanpa wordmark, di-fit ke kanvas persegi transparan (contain)
  const markSquare = async (size: number) =>
    sharp(SRC)
      .extract(MARK)
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

  // ---------- Icon persegi dari grafik ----------
  // bg tidak diisi → kanvas transparan (favicon & PWA any-purpose).
  // bg diisi → opaque (apple-touch-icon, maskable).
  const iconFromMark = async (
    size: number,
    opts: { bg?: string; scale?: number } = {},
  ) => {
    const inner = Math.round(size * (opts.scale ?? 0.8));
    const pad = Math.round((size - inner) / 2);
    const mark = await markSquare(inner);
    return sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: opts.bg ?? { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: mark, left: pad, top: pad }])
      .png();
  };

  await (await iconFromMark(32)).toFile(path.join(OUT, "favicon-32.png"));
  await (await iconFromMark(16)).toFile(path.join(OUT, "favicon-16.png"));
  await (await iconFromMark(192)).toFile(path.join(OUT, "pwa-192.png"));
  await (await iconFromMark(512)).toFile(path.join(OUT, "pwa-512.png"));
  console.log("OK: favicon-32/16, pwa-192/512");

  // Maskable: safe zone 80% tengah → grafik 62% + padding, bg navy
  await (await iconFromMark(512, { bg: NAVY, scale: 0.62 })).toFile(
    path.join(OUT, "pwa-512-maskable.png"),
  );
  console.log("OK: pwa-512-maskable");

  // Apple touch icon: iOS menolak alpha → wajib opaque, 180x180 standar
  await (await iconFromMark(180, { bg: WARM })).toFile(path.join(OUT, "apple-touch-icon.png"));
  console.log("OK: apple-touch-icon (bg warm, opaque)");

  // ---------- favicon.ico (multi-size 16/32/48, format PNG-in-ICO) ----------
  const sizes = [16, 32, 48];
  const pngs = await Promise.all(
    sizes.map(async (s) => (await iconFromMark(s)).toBuffer()),
  );
  let offset = 6 + sizes.length * 16;
  const entries: Buffer[] = [];
  for (let i = 0; i < sizes.length; i++) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(sizes[i], 0); // width
    entry.writeUInt8(sizes[i], 1); // height
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(pngs[i].length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += pngs[i].length;
  }
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(sizes.length, 4);
  await writeFile(path.join(OUT, "favicon.ico"), Buffer.concat([header, ...entries, ...pngs]));
  console.log("OK: favicon.ico");

  // ---------- App Icon 1024x1024 (syarat Meta App Review) ----------
  // Transparan — Meta menampilkan icon di atas background dashboard sendiri.
  await (await iconFromMark(1024)).toFile(path.join(OUT, "app-icon-1024.png"));
  console.log("OK: app-icon-1024 (bg transparan — Meta App Review)");

  // ---------- OG banner 1200x630 (logo penuh + wordmark SVG) ----------
  const logoSize = 420;
  const logoLeft = 90;
  const logoTop = Math.round((630 - logoSize) / 2);
  const logoResized = await sharp(SRC).resize(logoSize, logoSize).png().toBuffer();

  const textSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
      <defs>
        <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="${BLUE}"/>
          <stop offset="100%" stop-color="${ORANGE}"/>
        </linearGradient>
      </defs>
      <text x="560" y="300" font-family="Segoe UI, Arial, Helvetica, sans-serif"
            font-size="84" font-weight="700" fill="#FFFFFF">Sahabat Kreator</text>
      <text x="562" y="370" font-family="Segoe UI, Arial, Helvetica, sans-serif"
            font-size="36" fill="#B8C4D6">Kelola semua konten social media</text>
      <text x="562" y="420" font-family="Segoe UI, Arial, Helvetica, sans-serif"
            font-size="36" fill="#B8C4D6">dari satu dashboard.</text>
      <rect x="560" y="460" width="560" height="8" rx="4" fill="url(#accent)"/>
      <text x="560" y="530" font-family="Segoe UI, Arial, Helvetica, sans-serif"
            font-size="30" font-weight="600" fill="${BLUE}">sahabatkreator.com</text>
    </svg>
  `);

  const bgSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
      <defs>
        <radialGradient id="glow1" cx="10%" cy="90%" r="80%">
          <stop offset="0%" stop-color="${BLUE}" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="${NAVY}" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="glow2" cx="95%" cy="5%" r="60%">
          <stop offset="0%" stop-color="${ORANGE}" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="${NAVY}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="1200" height="630" fill="${NAVY}"/>
      <rect width="1200" height="630" fill="url(#glow1)"/>
      <rect width="1200" height="630" fill="url(#glow2)"/>
    </svg>
  `);

  await sharp(bgSvg)
    .composite([
      { input: logoResized, left: logoLeft, top: logoTop },
      { input: textSvg, left: 0, top: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, "og-default.png"));
  console.log("OK: og-default.png (1200x630)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
