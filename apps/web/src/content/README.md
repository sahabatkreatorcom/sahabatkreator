# Dokumentasi publik (`/panduan` dan `/developers`)

Isi folder ini dirender menjadi halaman publik di `sahabatkreator.com/panduan` dan
`sahabatkreator.com/developers`.

## Menambah halaman baru

Halaman dokumentasi **tidak** didaftarkan di router. Yang perlu Anda sentuh hanya dua tempat:

1. Tambahkan entri di `src/lib/docs-nav.ts` — pilih section `panduan` atau `developers`, isi `slug`,
   `title`, dan `description`.
2. Buat file `src/content/<section>/<slug>.mdx` dengan nama yang sama persis.

Sidebar, tautan "sebelumnya/berikutnya", indeks pencarian, dan entri `sitemap.xml` semuanya
diturunkan dari `docs-nav.ts`, jadi tidak ada yang perlu diperbarui manual.

`src/lib/docs-nav.test.ts` akan gagal kalau salah satu dari keduanya lupa — entri tanpa file, atau
file tanpa entri.

<Callout variant="warning" title="sitemap.xml dijalankan terpisah">
  `apps/web/public/sitemap.xml` dirawat tangan, tetapi blok dokumentasinya digenerate dari
  `docs-nav.ts`. Setelah menambah halaman, jalankan
  `bun run --filter web docs:sitemap` — blok di antara `<!-- docs:start -->` dan `<!-- docs:end -->`
  akan ditulis ulang. Mode `--check` gagal bila tidak sinkron, cocok untuk CI.
</Callout>

## Menulis konten

File `.mdx` menerima markdown biasa. Empat komponen berikut tersedia tanpa perlu import apa pun
(lihat `src/components/docs/mdx-components.tsx`):

| Komponen | Kegunaan |
|---|---|
| `<Callout variant="info\|tip\|warning" title="…">` | Kotak sorotan. |
| `<Screenshot src="…" alt="…" caption="…" />` | Tangkapan layar dengan bingkai dan keterangan. |
| `<CardGrid>` + `<CardLink href title>` | Grid kartu, biasanya untuk halaman indeks. |
| `<Steps>` + `<Step title>` | Langkah bernomor. |

Heading `##` dan `###` otomatis mendapat anchor id dan muncul di daftar isi di sisi kanan — tidak
perlu menulis id manual.

## Tangkapan layar

Gambar ada di `public/docs/` dan dihasilkan otomatis, bukan diambil manual:

```bash
DOCS_SHOT_BASE=https://sahabatkreator.com \
DOCS_SHOT_EMAIL=akun-demo@example.com \
DOCS_SHOT_PASSWORD='…' \
bun run --filter web docs:screenshots
```

Script-nya (`scripts/docs-screenshots.ts`) masuk sekali dengan akun demo, lalu menangkap daftar
halaman di variabel `SHOTS`. Pengaturannya:

- **Zoom 130%** (`html { zoom: 1.3 }`) supaya teks tetap terbaca setelah gambar diperkecil di
  halaman dokumentasi.
- **`deviceScaleFactor: 2`** supaya tetap tajam di layar beresolusi tinggi.
- Hasilnya dienkode ulang ke **WebP** kualitas 82 — PNG dari layar 2× bisa 300–500 KB per gambar,
  WebP memangkasnya sekitar 70%.

Filter satu halaman saat menyetel ulang: `DOCS_SHOT_ONLY=kalender`.

<Callout variant="warning" title="Pakai akun demo, bukan akun pelanggan">
  Hasilnya dipublikasikan di situs. Isi akun yang dipakai akan terlihat semua orang — nama
  organisasi, nama pengguna, dan konten yang ada di dalamnya.
</Callout>

## Alamat halaman

| Section | Isi |
|---|---|
| `/panduan` | Panduan penggunaan antarmuka untuk pengguna akhir. |
| `/developers` | Narasi Public API v1 (autentikasi, webhook, error, resep). |

Referensi endpoint **tidak** ditulis di sini. Endpoint interaktif sudah tersedia di `/v1/docs`
(Scalar) yang digenerate dari `packages/api/scripts/public-api.json` — dijaga `bun run openapi:verify`
agar tidak menyimpang dari kode.
