// Halaman Changelog (publik) — riwayat versi & fitur baru Sahabat Kreator
import { History } from "lucide-react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { useSeo } from "@/lib/seo";

type ChangelogEntry = {
  version: string;
  date: string;
  title: string;
  highlights: string[];
};

/** Riwayat versi — terbaru di atas */
const CHANGELOG: ChangelogEntry[] = [
  {
    version: "v1.4",
    date: "8 September 2026",
    title: "Picker Halaman Meta & Onboarding",
    highlights: [
      "Pemilih halaman Facebook & Instagram saat menghubungkan akun Meta — tak perlu lagi repot memilih di pengaturan platform.",
      "Onboarding interaktif baru: panduan langkah demi langkah dari hubungkan akun pertama hingga jadwalkan post pertama.",
      "Notifikasi PWA kini menampilkan badge jumlah belum dibaca di ikon aplikasi.",
    ],
  },
  {
    version: "v1.3",
    date: "12 Agustus 2026",
    title: "Analitik & Laporan PDF",
    highlights: [
      "Ekspor laporan performa ke PDF lengkap dengan grafik engagement, jangkauan, dan pertumbuhan follower.",
      "Laporan berkala otomatis terkirim ke email tiap awal bulan.",
      "Perbandingan performa antar periode (mingguan, bulanan, kuartal) langsung di dashboard analitik.",
    ],
  },
  {
    version: "v1.2",
    date: "15 Juli 2026",
    title: "Unified Inbox & Label",
    highlights: [
      "Kotak masuk terpadu untuk DM & komentar dari semua platform dalam satu tampilan.",
      "Label percakapan kustom — prioritas, lead, selesai — agar tim tidak kelewatan pesan penting.",
      "Balas cepat dengan template jawaban tersimpan per label.",
    ],
  },
  {
    version: "v1.1",
    date: "18 Juni 2026",
    title: "Media Library Bulk Select & Resize Otomatis",
    highlights: [
      "Pilih dan kelola banyak aset sekaligus di media library (hapus, pindah folder).",
      "Resize otomatis ke dimensi tiap platform (IG Feed 4:5, TikTok 9:16, YouTube 16:9) tanpa edit ulang.",
      "Dukungan format HEIC untuk upload langsung dari kamera iPhone.",
    ],
  },
  {
    version: "v1.0",
    date: "20 Mei 2026",
    title: "Rilis Awal",
    highlights: [
      "Penjadwalan & publish multi-platform: Instagram, Facebook, TikTok, YouTube, LinkedIn, dan lainnya.",
      "Kalender konten visual multi-view (bulan/minggu/hari).",
      "Kolaborasi tim dalam organisasi dengan peran & approval.",
      "Bantuan AI untuk caption, ide konten, dan hashtag.",
    ],
  },
];

export function ChangelogPage() {
  useSeo({
    title: "Changelog — Pembaruan & Fitur Baru",
    description:
      "Ikuti perkembangan Sahabat Kreator: riwayat versi, fitur baru, dan perbaikan terbaru dari platform manajemen social media untuk kreator Indonesia.",
    path: "/changelog",
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 md:py-24">
      {/* Hero singkat */}
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--accent-gold-light)] text-[var(--accent-gold)]">
          <History className="h-7 w-7" />
        </div>
        <h1 className="font-bold text-4xl md:text-5xl">
          <span className="text-gradient">Changelog</span> produk
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-[var(--text-secondary)] text-lg">
          Semua pembaruan, fitur baru, dan penyempurnaan Sahabat Kreator — terbaru di atas.
        </p>
      </div>

      {/* Timeline versi */}
      <div className="relative mt-12 space-y-10 border-[var(--border-light)] border-l-2 pl-8">
        {CHANGELOG.map((entry) => (
          <section key={entry.version} className="relative">
            {/* Titik timeline */}
            <span className="absolute top-1.5 -left-[41px] flex h-5 w-5 items-center justify-center rounded-full border-2 border-[var(--accent-gold)] bg-[var(--bg-primary)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-gold)]" />
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="primary">{entry.version}</Badge>
              <time className="text-[var(--text-muted)] text-xs">{entry.date}</time>
            </div>
            <h2 className="mt-2 font-semibold text-lg">{entry.title}</h2>
            <ul className="mt-2 space-y-1.5">
              {entry.highlights.map((item) => (
                <li
                  key={item}
                  className="flex gap-2.5 text-[var(--text-secondary)] text-sm leading-relaxed"
                >
                  <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-gold)]" />
                  {item}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {/* CTA bawah */}
      <div className="mt-12 text-center text-[var(--text-secondary)] text-sm">
        Ada masukan atau ide untuk versi berikutnya?{" "}
        <Link to="/kontak" className="text-[var(--accent-gold)] underline">
          Sampaikan ke tim kami
        </Link>
        .
      </div>
    </div>
  );
}
