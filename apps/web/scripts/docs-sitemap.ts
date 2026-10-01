/**
 * Menyegarkan blok dokumentasi di public/sitemap.xml dari src/lib/docs-nav.ts.
 *
 * Sitemap utama sengaja tetap dirawat tangan (halaman marketing jarang berubah
 * dan urutannya dipilih dengan sadar). Yang diotomatiskan hanya bagian
 * dokumentasi, karena jumlahnya terus bertambah setiap kali ada halaman baru —
 * dan halaman yang lupa didaftarkan tidak akan pernah terindeks.
 *
 * Blok yang diganti ditandai `<!-- docs:start -->` … `<!-- docs:end -->`.
 *
 * Pakai:
 *   bun run --filter web docs:sitemap          # tulis ulang blok
 *   bun run --filter web docs:sitemap --check  # gagal bila blok tidak sinkron (untuk CI)
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { docsSitemapEntries } from "../src/lib/docs-nav";

const START = "  <!-- docs:start";
const END = "  <!-- docs:end -->";
const BASE = "https://sahabatkreator.com";
const SITEMAP = path.resolve(import.meta.dirname, "..", "public", "sitemap.xml");

function buildBlock(): string {
  const urls = docsSitemapEntries().map((entry) => {
    // Halaman indeks section berubah paling sering → changefreq lebih rapat.
    const isIndex = entry.path === "/panduan" || entry.path === "/developers";
    return [
      "  <url>",
      `    <loc>${BASE}${entry.path}</loc>`,
      `    <changefreq>${isIndex ? "weekly" : "monthly"}</changefreq>`,
      `    <priority>${entry.priority.toFixed(1)}</priority>`,
      "  </url>",
    ].join("\n");
  });
  return `${START} — digenerate oleh \`bun run --filter web docs:sitemap\` dari src/lib/docs-nav.ts -->\n${urls.join("\n")}\n${END}`;
}

function main() {
  const check = process.argv.includes("--check");
  const xml = readFileSync(SITEMAP, "utf8");

  const startIndex = xml.indexOf(START);
  const endIndex = xml.indexOf(END);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    console.error(
      "Penanda `<!-- docs:start -->` / `<!-- docs:end -->` tidak ditemukan di public/sitemap.xml.",
    );
    process.exit(1);
  }

  const current = xml.slice(startIndex, endIndex + END.length);
  const next = buildBlock();

  if (current === next) {
    console.log(
      `sitemap.xml: blok dokumentasi sudah sinkron (${docsSitemapEntries().length} URL).`,
    );
    return;
  }

  if (check) {
    console.error(
      "sitemap.xml: blok dokumentasi tidak sinkron dengan src/lib/docs-nav.ts.\n" +
        "Jalankan `bun run --filter web docs:sitemap` lalu commit hasilnya.",
    );
    process.exit(1);
  }

  writeFileSync(SITEMAP, xml.slice(0, startIndex) + next + xml.slice(endIndex + END.length));
  console.log(`sitemap.xml: blok dokumentasi diperbarui (${docsSitemapEntries().length} URL).`);
}

main();
