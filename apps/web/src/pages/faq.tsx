// Halaman FAQ (publik) — pertanyaan yang sering diajukan + pencarian & kategori
import { HelpCircle, Search, SearchX } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Accordion, type AccordionItem } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSeo } from "@/lib/seo";
import { cn } from "@/lib/utils";

/** Kategori FAQ — urutan sesuai kemunculan di UI */
const FAQ_CATEGORIES = ["Umum", "Fitur & Harga", "Teknis", "Akun & Keamanan", "Dukungan"] as const;

type FaqCategory = (typeof FAQ_CATEGORIES)[number];

type FaqEntry = AccordionItem & { category: FaqCategory };

/** Daftar FAQ — konten marketing informatif, bukan placeholder */
const FAQ_ENTRIES: FaqEntry[] = [
  // ---------- Umum ----------
  {
    value: "apa-itu-sahabat-kreator",
    category: "Umum",
    question: "Apa itu Sahabat Kreator?",
    answer: (
      <>
        Sahabat Kreator adalah platform manajemen social media all-in-one yang dibangun khusus untuk
        kreator dan bisnis Indonesia. Dari satu dashboard Anda bisa menjadwalkan posting, memantau
        analitik, membalas komentar & DM, berkolaborasi dengan tim, hingga menghasilkan ide konten
        bantuan AI — tanpa berpindah aplikasi.
      </>
    ),
  },
  {
    value: "platform-yang-didukung",
    category: "Umum",
    question: "Platform social media apa saja yang didukung?",
    answer: (
      <>
        Kami mendukung 10+ platform: Instagram, Facebook, Threads, TikTok, YouTube, Pinterest,
        LinkedIn, Bluesky, dan Google Business Profile. Anda bisa menghubungkan beberapa akun
        sekaligus dalam satu organisasi, termasuk akun di platform yang sama.
      </>
    ),
  },
  {
    value: "cocok-untuk-siapa",
    category: "Umum",
    question: "Sahabat Kreator cocok untuk siapa?",
    answer: (
      <>
        Untuk kreator konten, UMKM, agensi, hingga tim marketing perusahaan. Paket gratis tersedia
        untuk memulai, sementara paket berbayar membuka fitur kolaborasi tim dan kuota AI yang lebih
        besar.{" "}
        <Link to="/harga" className="text-[var(--accent-gold)] underline">
          Lihat halaman harga
        </Link>{" "}
        untuk perbandingan lengkap.
      </>
    ),
  },
  {
    value: "perlu-instal-aplikasi",
    category: "Umum",
    question: "Apakah perlu menginstal aplikasi?",
    answer: (
      <>
        Tidak wajib. Sahabat Kreator berjalan di browser dan responsif untuk perangkat mobile. Kami
        juga menyediakan Progressive Web App (PWA) yang bisa Anda instal di homescreen untuk
        pengalaman seperti aplikasi native, lengkap dengan notifikasi.
      </>
    ),
  },
  // ---------- Fitur & Harga ----------
  {
    value: "cara-jadwal-post",
    category: "Fitur & Harga",
    question: "Bagaimana cara menjadwalkan posting?",
    answer: (
      <>
        Buka menu Buat Konten, pilih akun tujuan, tulis caption dan lampirkan media, lalu pilih mode
        Jadwalkan. Anda bisa memilih tanggal & waktu manual atau memakai saran waktu terbaik
        berdasarkan data engagement audiens Anda. Konten akan tayang otomatis sesuai jadwal — Anda
        juga bisa melihat semuanya di tampilan kalender.
      </>
    ),
  },
  {
    value: "harga-paket",
    category: "Fitur & Harga",
    question: "Berapa harga paketnya?",
    answer: (
      <>
        Kami menyediakan paket gratis selamanya dan beberapa tingkat paket berbayar dengan batas
        akun, posting, anggota tim, dan kredit AI yang berbeda. Harga terkini selalu bisa dilihat di{" "}
        <Link to="/harga" className="text-[var(--accent-gold)] underline">
          halaman harga
        </Link>
        . Pembayaran didukung via QRIS dan transfer virtual account dari bank-bank besar di
        Indonesia.
      </>
    ),
  },
  {
    value: "ai-kredit",
    category: "Fitur & Harga",
    question: "Apa itu kredit AI dan bagaimana cara kerjanya?",
    answer: (
      <>
        Kredit AI dipakai setiap kali Anda menggunakan fitur bertenaga AI, misalnya generate
        caption, ide konten dari tren, atau analisa performa. Setiap paket mendapat jatah kredit per
        bulan; ketika habis, Anda bisa upgrade paket atau menunggu kuota reset bulan berikutnya.
        Detail alokasi kredit ada di halaman harga dan menu Billing di dashboard.
      </>
    ),
  },
  {
    value: "batas-akun",
    category: "Fitur & Harga",
    question: "Berapa banyak akun social media yang bisa saya hubungkan?",
    answer: (
      <>
        Batas akun tergantung paket — paket gratis sudah cukup untuk memulai, dan paket lebih tinggi
        membuka hingga akun tanpa batas. Untuk detail tiap paket, silakan cek{" "}
        <Link to="/harga" className="text-[var(--accent-gold)] underline">
          halaman harga
        </Link>
        .
      </>
    ),
  },
  {
    value: "bisa-ganti-paket",
    category: "Fitur & Harga",
    question: "Apakah saya bisa upgrade atau downgrade paket kapan saja?",
    answer: (
      <>
        Bisa. Upgrade berlaku langsung dengan biaya prorata sesuai sisa periode, sedangkan downgrade
        berlaku pada periode tagihan berikutnya. Anda tidak akan kehilangan data atau konten
        terjadwal saat berpindah paket.
      </>
    ),
  },
  {
    value: "kebijakan-refund",
    category: "Fitur & Harga",
    question: "Apakah ada kebijakan refund?",
    answer: (
      <>
        Ya. Kami menyediakan masa trial gratis sehingga Anda bisa mencoba sebelum membayar. Untuk
        pembayaran yang sudah dilakukan, syarat dan ketentuan pengembalian dana dijelaskan lengkap
        di dokumen{" "}
        <Link to="/kebijakan-refund" className="text-[var(--accent-gold)] underline">
          Kebijakan Refund
        </Link>
        .
      </>
    ),
  },
  // ---------- Teknis ----------
  {
    value: "format-media",
    category: "Teknis",
    question: "Format file media apa saja yang didukung?",
    answer: (
      <>
        Untuk gambar: JPG, PNG, WebP, dan GIF. Untuk video: MP4, MOV, dan WebM. Kami juga
        menyediakan resize otomatis ke dimensi tiap platform (mis. IG Feed 4:5, TikTok 9:16)
        sehingga Anda tidak perlu mengedit ulang aset untuk tiap kanal.
      </>
    ),
  },
  {
    value: "carousel-multi-gambar",
    category: "Teknis",
    question: "Apakah bisa posting carousel / beberapa gambar sekaligus?",
    answer: (
      <>
        Bisa. Lampirkan beberapa gambar di editor konten dan atur urutannya. Untuk Instagram, kami
        akan mengirimkannya sebagai carousel post sesuai batas maksimal slide yang diizinkan
        platform.
      </>
    ),
  },
  {
    value: "apa-jika-gagal-posting",
    category: "Teknis",
    question: "Apa yang terjadi jika posting terjadwal gagal terkirim?",
    answer: (
      <>
        Anda akan menerima notifikasi gagal kirim beserta alasannya (mis. token kedaluwarsa atau
        konten melanggar kebijakan platform). Konten tetap tersimpan sebagai draft sehingga bisa
        langsung diperbaiki dan dijadwalkan ulang. Sistem kami juga otomatis mencoba ulang untuk
        kegagalan sementara.
      </>
    ),
  },
  {
    value: "batas-karakter",
    category: "Teknis",
    question: "Apakah ada bantuan untuk batas karakter tiap platform?",
    answer: (
      <>
        Ada. Editor konten menampilkan penghitung karakter live per platform terpilih (mis. 280
        untuk X, 2.200 untuk Instagram) dan panel validasi otomatis menandai konten yang melebihi
        batas sebelum dipublikasikan. Anda juga bisa membuat variasi caption khusus per platform
        dari satu konten yang sama.
      </>
    ),
  },
  {
    value: "api-publik",
    category: "Teknis",
    question: "Apakah tersedia API publik untuk integrasi?",
    answer: (
      <>
        API untuk integrasi pihak ketiga sedang dalam pengembangan dan akan dibuka bertahap. Jika
        Anda punya kebutuhan integrasi khusus,{" "}
        <Link to="/kontak" className="text-[var(--accent-gold)] underline">
          hubungi kami
        </Link>{" "}
        untuk mendiskusikan kebutuhan Anda.
      </>
    ),
  },
  // ---------- Akun & Keamanan ----------
  {
    value: "keamanan-token",
    category: "Akun & Keamanan",
    question: "Bagaimana keamanan akun social media saya?",
    answer: (
      <>
        Kami menggunakan autentikasi resmi OAuth dari masing-masing platform — kami tidak pernah
        menyimpan password social media Anda. Token akses disimpan terenkripsi dan tidak pernah
        tampil dalam bentuk plain text. Anda juga bisa mencabut akses kapan saja langsung dari
        dashboard atau pengaturan akun platform.
      </>
    ),
  },
  {
    value: "dua-faktor",
    category: "Akun & Keamanan",
    question: "Apakah mendukung autentikasi dua faktor (2FA)?",
    answer: (
      <>
        Ya. Kami mendukung 2FA via aplikasi authenticator (TOTP). Sangat kami rekomendasikan
        mengaktifkannya di menu Pengaturan Keamanan agar akun Anda tetap aman meski password bocor.
      </>
    ),
  },
  {
    value: "data-privasi",
    category: "Akun & Keamanan",
    question: "Apakah data saya aman dan bagaimana pemakaiannya?",
    answer: (
      <>
        Data Anda dienkripsi saat transit maupun saat tersimpan. Kami tidak menjual atau membagikan
        data pribadi Anda ke pihak ketiga untuk keperluan iklan. Detail lengkap ada di{" "}
        <Link to="/kebijakan-privasi" className="text-[var(--accent-gold)] underline">
          Kebijakan Privasi
        </Link>
        , dan Anda bisa meminta penghapusan data kapan saja melalui halaman{" "}
        <Link to="/penghapusan-data" className="text-[var(--accent-gold)] underline">
          Penghapusan Data
        </Link>
        .
      </>
    ),
  },
  {
    value: "hapus-akun",
    category: "Akun & Keamanan",
    question: "Bagaimana cara menghapus akun saya?",
    answer: (
      <>
        Buka menu Pengaturan → Akun di dashboard, lalu pilih hapus akun. Proses ini menghapus data
        Anda secara permanen sesuai kebijakan retensi kami. Pastikan tidak ada konten terjadwal yang
        masih ingin Anda simpan sebelum melanjutkan.
      </>
    ),
  },
  // ---------- Dukungan ----------
  {
    value: "cara-kontak-support",
    category: "Dukungan",
    question: "Bagaimana cara menghubungi dukungan?",
    answer: (
      <>
        Tim dukungan kami siap membantu Senin–Jumat, 09.00–17.00 WIB melalui halaman{" "}
        <Link to="/kontak" className="text-[var(--accent-gold)] underline">
          Kontak
        </Link>{" "}
        atau email halo@sahabatkreator.com. Pengguna paket berbayar mendapat prioritas respons.
      </>
    ),
  },
  {
    value: "ada-pelatihan",
    category: "Dukungan",
    question: "Apakah ada panduan atau pelatihan untuk pemula?",
    answer: (
      <>
        Ada. Saat pertama masuk, onboarding interaktif akan memandu Anda menghubungkan akun pertama
        hingga menjadwalkan posting. Kami juga rutin menulis tips dan tutorial di{" "}
        <Link to="/blog" className="text-[var(--accent-gold)] underline">
          blog kami
        </Link>
        . Untuk kebutuhan pelatihan tim/agensi, silakan hubungi kami.
      </>
    ),
  },
];

/** JSON-LD FAQPage untuk rich result Google (SEO) */
function buildFaqJsonLd(entries: FaqEntry[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map((e) => {
      // Ambil teks polos dari ReactNode answer untuk data terstruktur
      const text = typeof e.answer === "string" ? e.answer : extractText(e.answer);
      return {
        "@type": "Question",
        name: e.question,
        acceptedAnswer: { "@type": "Answer", text },
      };
    }),
  };
}

/** Ekstrak teks dari ReactNode secara rekursif (untuk JSON-LD) */
function extractText(node: React.ReactNode): string {
  if (node === null || node === undefined || node === false || node === true) {
    return "";
  }
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(extractText).join("");
  }
  // ReactElement — ambil children dari props (props bertipe unknown di React 19)
  if (typeof node === "object" && "props" in node) {
    const props = (node as React.ReactElement).props as { children?: React.ReactNode } | undefined;
    return extractText(props?.children);
  }
  return "";
}

export function FaqPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<FaqCategory | "Semua">("Semua");

  // Filter berdasarkan kategori + kata kunci (judul maupun isi)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FAQ_ENTRIES.filter((e) => {
      if (category !== "Semua" && e.category !== category) return false;
      if (!q) return true;
      return (
        e.question.toLowerCase().includes(q) || extractText(e.answer).toLowerCase().includes(q)
      );
    });
  }, [query, category]);

  useSeo({
    title: "FAQ — Pertanyaan yang Sering Diajukan",
    description:
      "Temukan jawaban atas pertanyaan umum seputar Sahabat Kreator: platform yang didukung, harga paket, cara menjadwalkan posting, kredit AI, keamanan data, dan dukungan.",
    path: "/faq",
    jsonLd: buildFaqJsonLd(FAQ_ENTRIES),
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 md:py-24">
      {/* Hero singkat */}
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--accent-gold-light)] text-[var(--accent-gold)]">
          <HelpCircle className="h-7 w-7" />
        </div>
        <h1 className="font-bold text-4xl md:text-5xl">
          Pertanyaan yang <span className="text-gradient">sering diajukan</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-[var(--text-secondary)] text-lg">
          Cari jawaban cepat seputar fitur, harga, teknis, dan keamanan Sahabat Kreator.
        </p>
      </div>

      {/* Pencarian */}
      <div className="relative mt-10">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari pertanyaan... mis. jadwal, harga, 2FA"
          className="h-12 pl-10 text-base"
          aria-label="Cari pertanyaan"
        />
      </div>

      {/* Filter kategori */}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {(["Semua", ...FAQ_CATEGORIES] as const).map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              category === cat
                ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium"
                : "border-[var(--border)] hover:border-[var(--accent-gold)]",
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Daftar FAQ */}
      {filtered.length === 0 ? (
        <div className="card mt-10 flex flex-col items-center p-10 text-center">
          <SearchX className="h-8 w-8 text-[var(--text-muted)]" />
          <p className="mt-3 font-semibold">Tidak ditemukan</p>
          <p className="mt-1 text-[var(--text-secondary)] text-sm">
            Coba kata kunci lain atau hubungi kami langsung — kami dengan senang hati membantu.
          </p>
          <Link to="/kontak" className="mt-4">
            <Button variant="outline">Hubungi Dukungan</Button>
          </Link>
        </div>
      ) : (
        <div className="card mt-10 px-6">
          <Accordion
            items={filtered.map(({ category: _cat, ...item }) => item)}
            defaultOpen={filtered[0]?.value ?? null}
          />
        </div>
      )}

      {/* CTA bawah */}
      <div className="mt-12 text-center text-[var(--text-secondary)] text-sm">
        Masih ada pertanyaan lain?{" "}
        <Link to="/kontak" className="text-[var(--accent-gold)] underline">
          Kirim pesan ke tim kami
        </Link>{" "}
        — dibalas dalam 1-2 hari kerja.
      </div>
    </div>
  );
}
