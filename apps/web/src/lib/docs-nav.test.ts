// Uji peta navigasi dokumentasi.
//
// Yang dijaga di sini: sidebar, sitemap, dan pencarian semuanya diturunkan dari
// DOCS_SECTIONS, jadi kalau ada entri navigasi tanpa file .mdx (atau file .mdx
// yang tidak terdaftar) halaman itu jadi tautan mati tanpa ketahuan. Uji ini
// membuat kelalaian seperti itu gagal di CI, bukan di produksi.
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DOCS_SECTIONS,
  docsHref,
  docsNeighbours,
  docsSearchIndex,
  docsSectionForPath,
  docsSitemapEntries,
  docsSlugForPath,
  searchDocs,
} from "./docs-nav";

const CONTENT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "content");

/** Nama file .mdx yang sebenarnya ada, per section. */
function contentFiles(sectionId: string): string[] {
  const dir = path.join(CONTENT_DIR, sectionId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".mdx"))
    .map((name) => name.replace(/\.mdx$/, ""));
}

describe("docs-nav", () => {
  it("punya tepat dua section: panduan dan developers", () => {
    expect(DOCS_SECTIONS.map((section) => section.id)).toEqual(["panduan", "developers"]);
  });

  it("memetakan setiap entri navigasi ke file .mdx yang ada", () => {
    const missing: string[] = [];
    for (const section of DOCS_SECTIONS) {
      for (const page of section.pages) {
        const file = path.join(CONTENT_DIR, section.id, `${page.slug || "index"}.mdx`);
        if (!existsSync(file)) {
          missing.push(`${section.id}/${page.slug || "index"}.mdx`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("tidak punya file .mdx yang terlewat dari navigasi", () => {
    const orphans: string[] = [];
    for (const section of DOCS_SECTIONS) {
      const registered = new Set(section.pages.map((page) => page.slug || "index"));
      for (const file of contentFiles(section.id)) {
        if (!registered.has(file)) orphans.push(`${section.id}/${file}.mdx`);
      }
    }
    expect(orphans).toEqual([]);
  });

  it("memakai slug yang unik di dalam satu section", () => {
    for (const section of DOCS_SECTIONS) {
      const slugs = section.pages.map((page) => page.slug);
      expect(new Set(slugs).size, `${section.id} punya slug duplikat`).toBe(slugs.length);
    }
  });

  it("membuka setiap section dengan halaman indeks (slug kosong)", () => {
    for (const section of DOCS_SECTIONS) {
      expect(section.pages[0]?.slug, `${section.id} tidak diawali indeks`).toBe("");
    }
  });

  it("selalu mengisi judul dan deskripsi — dipakai <title> dan meta description", () => {
    for (const section of DOCS_SECTIONS) {
      for (const page of section.pages) {
        expect(page.title.trim(), `${section.id}/${page.slug} tanpa judul`).not.toBe("");
        // Deskripsi di bawah 50 karakter akan terpotong tanpa guna di hasil pencarian.
        expect(
          page.description.trim().length,
          `${section.id}/${page.slug} deskripsinya terlalu pendek`,
        ).toBeGreaterThan(50);
      }
    }
  });

  it("membangun URL sesuai base section", () => {
    const panduan = DOCS_SECTIONS[0];
    const developers = DOCS_SECTIONS[1];
    expect(panduan && docsHref(panduan, "")).toBe("/panduan");
    expect(panduan && docsHref(panduan, "memulai")).toBe("/panduan/memulai");
    expect(developers && docsHref(developers, "webhook")).toBe("/developers/webhook");
  });

  it("menghubungkan halaman sebelum dan sesudah sesuai urutan navigasi", () => {
    const panduan = DOCS_SECTIONS[0];
    if (!panduan) throw new Error("section panduan tidak ada");

    // Halaman indeks: tidak ada sebelumnya.
    expect(docsNeighbours(panduan, "").prev).toBeNull();
    expect(docsNeighbours(panduan, "").next?.href).toBe("/panduan/memulai");

    // Halaman terakhir: tidak ada berikutnya.
    const last = panduan.pages.at(-1);
    if (!last) throw new Error("section panduan kosong");
    expect(docsNeighbours(panduan, last.slug).next).toBeNull();

    // Halaman tengah: keduanya ada dan mengarah ke tetangga yang benar.
    const middle = panduan.pages[1];
    const lastIndex = panduan.pages.length - 1;
    if (!middle) throw new Error("section panduan hanya punya satu halaman");
    const neighbours = docsNeighbours(panduan, middle.slug);
    expect(neighbours.prev?.href).toBe("/panduan");
    expect(neighbours.next?.href).toBe(docsHref(panduan, panduan.pages[2]?.slug ?? ""));
    expect(lastIndex).toBeGreaterThan(1);
  });

  it("mengembalikan tetangga kosong untuk slug yang tidak dikenal", () => {
    const panduan = DOCS_SECTIONS[0];
    if (!panduan) throw new Error("section panduan tidak ada");
    expect(docsNeighbours(panduan, "slug-yang-tidak-ada")).toEqual({ prev: null, next: null });
  });

  it("mencocokkan section dari pathname, termasuk sub-path", () => {
    expect(docsSectionForPath("/panduan")?.id).toBe("panduan");
    expect(docsSectionForPath("/panduan/memulai")?.id).toBe("panduan");
    expect(docsSectionForPath("/developers/webhook")?.id).toBe("developers");
    // Path di luar dokumentasi tidak boleh ikut tertangkap.
    expect(docsSectionForPath("/dashboard")).toBeNull();
    expect(docsSectionForPath("/panduans")).toBeNull();
  });

  it("mengambil slug dari pathname", () => {
    const panduan = DOCS_SECTIONS[0];
    const developers = DOCS_SECTIONS[1];
    if (!panduan || !developers) throw new Error("section tidak lengkap");
    expect(docsSlugForPath(panduan, "/panduan")).toBe("");
    expect(docsSlugForPath(panduan, "/panduan/memulai")).toBe("memulai");
    expect(docsSlugForPath(developers, "/developers/resep")).toBe("resep");
  });

  it("membuat entri sitemap tanpa duplikat dan dengan prioritas masuk akal", () => {
    const entries = docsSitemapEntries();
    const totalPages = DOCS_SECTIONS.reduce((sum, section) => sum + section.pages.length, 0);
    expect(entries).toHaveLength(totalPages);
    expect(new Set(entries.map((entry) => entry.path)).size).toBe(entries.length);
    for (const entry of entries) {
      expect(entry.path.startsWith("/panduan") || entry.path.startsWith("/developers")).toBe(true);
      expect(entry.priority).toBeGreaterThan(0);
      expect(entry.priority).toBeLessThanOrEqual(1);
    }
  });

  it("mengindeks seluruh halaman untuk pencarian", () => {
    const index = docsSearchIndex();
    const totalPages = DOCS_SECTIONS.reduce((sum, section) => sum + section.pages.length, 0);
    expect(index).toHaveLength(totalPages);
    // Haystack dipakai pencarian — harus sudah dinormalkan ke huruf kecil.
    for (const entry of index) {
      expect(entry.haystack).toBe(entry.haystack.toLowerCase());
    }
  });

  it("menemukan halaman lewat judul, kata kunci, dan deskripsi", () => {
    // Lewat judul
    expect(searchDocs("webhook").map((entry) => entry.href)).toContain("/developers/webhook");
    // Lewat kata kunci yang tidak ada di judul
    expect(searchDocs("zapier").map((entry) => entry.href)).toContain("/developers/resep");
    expect(searchDocs("qris").map((entry) => entry.href)).toContain("/panduan/langganan");
    // Lewat deskripsi
    expect(searchDocs("kalender").map((entry) => entry.href)).toContain("/panduan/menjadwalkan");
  });

  it("mensyaratkan semua kata pada query cocok (bukan salah satu)", () => {
    expect(searchDocs("webhook retry").map((entry) => entry.href)).toContain("/developers/webhook");
    expect(searchDocs("webhook qris")).toHaveLength(0);
  });

  it("mengabaikan query kosong dan membatasi jumlah hasil", () => {
    expect(searchDocs("")).toHaveLength(0);
    expect(searchDocs("   ")).toHaveLength(0);
    // "a" cocok dengan hampir semua halaman — batasnya harus tetap dihormati.
    expect(searchDocs("a", 3).length).toBeLessThanOrEqual(3);
  });
});
