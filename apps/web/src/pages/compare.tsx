// Halaman Perbandingan (publik) — Sahabat Kreator vs tools manajemen social
// media umum. Data kompetitor bersifat indikatif (harga publik berubah rutin),
// disertai disclaimer agar tidak menyesatkan.
import { Check, Minus, Scale, Sparkles, Zap } from "lucide-react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSeo } from "@/lib/seo";
import { cn } from "@/lib/utils";

/** Kolom perbandingan — Sahabat Kreator selalu pertama (highlight) */
const COMPETITORS = [
  { key: "sk", name: "Sahabat Kreator", highlight: true },
  { key: "buffer", name: "Buffer", highlight: false },
  { key: "hootsuite", name: "Hootsuite", highlight: false },
  { key: "later", name: "Later", highlight: false },
  { key: "metricool", name: "Metricool", highlight: false },
] as const;

type CompetitorKey = (typeof COMPETITORS)[number]["key"];

/**
 * Baris perbandingan. Nilai kompetitor memakai kualifikasi "±" karena
 * fitur & harga kompetitor bisa berubah — pembaca diminta verifikasi ke
 * situs resmi masing-masing.
 */
type CompareRow = {
  /** Label baris di kolom pertama */
  label: string;
  values: Record<CompetitorKey, string>;
};

const COMPARE_ROWS: CompareRow[] = [
  {
    label: "Platform yang didukung",
    values: {
      sk: "10+ (IG, FB, Threads, TikTok, YouTube, Pinterest, LinkedIn, Bluesky, Google Business)",
      buffer: "±5-8 kanal (IG, FB, LinkedIn, X, Pinterest, TikTok, dst.)",
      hootsuite: "±6-8 kanal (IG, FB, TikTok, X, LinkedIn, Pinterest, dst.)",
      later: "±4-6 kanal (IG, TikTok, Facebook, Pinterest, LinkedIn, X)",
      metricool: "±10+ kanal termasuk Google Business",
    },
  },
  {
    label: "Fitur utama",
    values: {
      sk: "Jadwal posting, kalender visual, analitik terpadu, inbox engagement, grid planner, AI konten, tren lokal",
      buffer: "Jadwal posting, kalender, analitik dasar, AI assistant",
      hootsuite: "Jadwal, monitoring, analitik, inbox tim, listening",
      later: "Jadwal visual-first, link in bio, analitik IG/TikTok",
      metricool: "Jadwal, analitik, laporan PDF, monitoring iklan",
    },
  },
  {
    label: "Fitur AI bantuan konten",
    values: {
      sk: "Generate caption, ide dari tren Indonesia, prediksi skor engagement, optimal timing",
      buffer: "±AI assistant caption & ide dasar",
      hootsuite: "±AI untuk caption & balasan (fitur add-on)",
      later: "±AI caption dasar",
      metricool: "±AI caption dasar",
    },
  },
  {
    label: "Harga indikatif",
    values: {
      sk: "Paket gratis selamanya; berbayar mulai puluhan ribu rupiah/bulan (lihat halaman harga)",
      buffer: "±mulai $6/bln per kanal (free plan terbatas)",
      hootsuite: "±mulai $99/bln (professional)",
      later: "±mulai $25/bln",
      metricool: "±mulai €18/bln (free plan tersedia)",
    },
  },
  {
    label: "Dukungan Bahasa Indonesia",
    values: {
      sk: "Penuh — UI, konten bantuan, dan dukungan dalam Bahasa Indonesia",
      buffer: "±UI sebagian; dukungan utamanya Inggris",
      hootsuite: "±UI sebagian; dukungan utamanya Inggris",
      later: "Tidak — UI & dukungan Inggris",
      metricool: "Tidak — UI & dukungan Inggris/Spanyol",
    },
  },
  {
    label: "Fokus pasar",
    values: {
      sk: "Kreator & bisnis Indonesia (pembayaran QRIS/VA, tren lokal, zona WIB)",
      buffer: "Global (US/Eropa)",
      hootsuite: "Global, korporat besar",
      later: "Global, kreator visual/IG-first",
      metricool: "Global, agensi & freelancer",
    },
  },
  {
    label: "Metode pembayaran lokal",
    values: {
      sk: "QRIS + virtual account semua bank besar",
      buffer: "±Kartu kredit (global)",
      hootsuite: "±Kartu kredit/invoice (global)",
      later: "±Kartu kredit (global)",
      metricool: "±Kartu kredit (global)",
    },
  },
];

export function ComparePage() {
  const year = new Date().getFullYear();

  useSeo({
    title: "Perbandingan — Sahabat Kreator vs Buffer, Hootsuite, Later, Metricool",
    description:
      "Bandingkan Sahabat Kreator dengan tools manajemen social media populer: platform yang didukung, fitur AI, harga, dukungan Bahasa Indonesia, dan fokus pasar.",
    path: "/compare",
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
      {/* Hero */}
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--accent-gold-light)] text-[var(--accent-gold)]">
          <Scale className="h-7 w-7" />
        </div>
        <h1 className="font-bold text-4xl md:text-5xl">
          Sahabat Kreator <span className="text-gradient">vs yang lainnya</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-[var(--text-secondary)] text-lg">
          Perbandingan jujur dengan tools manajemen social media populer — agar Anda bisa memilih
          yang paling pas untuk kebutuhan konten di Indonesia.
        </p>
      </div>

      {/* Tabel perbandingan — scroll horizontal di layar kecil */}
      <div className="card mt-12 overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-52 p-4 text-left align-bottom font-semibold text-[var(--text-secondary)]">
                Aspek
              </th>
              {COMPETITORS.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    "min-w-48 p-4 text-left align-bottom",
                    c.highlight &&
                      "border-[var(--accent-gold)] border-b-2 bg-[var(--accent-gold-light)]",
                  )}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">{c.name}</span>
                    {c.highlight && (
                      <Badge variant="primary">
                        <Sparkles className="h-3 w-3" />
                        Kami
                      </Badge>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARE_ROWS.map((row) => (
              <tr key={row.label} className="border-[var(--border-light)] border-t">
                <th
                  scope="row"
                  className="p-4 text-left align-top font-medium text-[var(--text-secondary)]"
                >
                  {row.label}
                </th>
                {COMPETITORS.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "p-4 align-top",
                      c.highlight && "bg-[var(--accent-gold-light)] font-medium",
                    )}
                  >
                    <span className="flex items-start gap-1.5">
                      {c.highlight ? (
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-gold)]" />
                      ) : (
                        <Minus className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                      )}
                      <span>{row.values[c.key]}</span>
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Disclaimer kompetitor */}
      <p className="mt-4 text-center text-[var(--text-muted)] text-xs">
        Informasi kompetitor bersifat indikatif per {year}, dapat berubah kapan saja oleh
        masing-masing penyedia — mohon verifikasi ke situs resmi sebelum mengambil keputusan.
      </p>

      {/* CTA */}
      <div className="card mt-12 bg-gradient p-10 text-center text-white">
        <h2 className="font-bold text-2xl">Coba gratis 14 hari</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-white/80">
          Rasakan sendiri bedanya — tanpa kartu kredit, batalkan kapan saja.
        </p>
        <Link to="/register" className="mt-6 inline-block">
          <Button size="lg" variant="secondary">
            <Zap className="h-4 w-4" />
            Mulai Sekarang
          </Button>
        </Link>
      </div>
    </div>
  );
}
