import { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { Shield, Trash2, Clock, AlertTriangle } from "lucide-react";

export const metadata: Metadata = {
  title: "Penghapusan Data | Sahabat Kreator",
  description: "Kebijakan penghapusan data pribadi pengguna dari platform Sahabat Kreator",
  robots: {
    index: true,
    follow: true,
  },
};

export default function DataDeletionPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <Logo size={28} />
            <span className="text-lg font-semibold">Sahabat Kreator</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login"><Button variant="ghost" size="sm">Masuk</Button></Link>
            <Link href="/register"><Button size="sm">Coba Gratis</Button></Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto max-w-4xl px-4 py-12">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20">
            <Trash2 className="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Penghapusan Data</h1>
            <p className="text-sm text-muted-foreground">Kebijakan penghapusan data pribadi</p>
          </div>
        </div>

        <p className="mb-6 text-sm text-muted-foreground">
          Terakhir diperbarui: {new Date().toLocaleDateString("id-ID", { year: "numeric", month: "long", day: "numeric" })}
        </p>

        <div className="prose prose-lg dark:prose-invert max-w-none">
          {/* Introduction */}
          <section className="mb-8 rounded-lg border border-border bg-muted/30 p-6">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-muted-foreground">
                  Sahabat Kreator berkomitmen untuk melindungi data pribadi Anda. Kebijakan ini menjelaskan bagaimana kami mengelola penghapusan data sesuai dengan peraturan perlindungan data yang berlaku.
                </p>
              </div>
            </div>
          </section>

          {/* 1. Jenis Data */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-primary" />
              1. Jenis Data yang Dapat Dihapus
            </h2>
            <p className="text-muted-foreground">
              Anda dapat meminta penghapusan jenis data berikut:
            </p>
            <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
              <li><strong>Data Identitas</strong> — nama, alamat email, nomor telepon</li>
              <li><strong>Data Akun</strong> — preferensi, pengaturan profil</li>
              <li><strong>Konten Pengguna</strong> — draft, template, dan konten yang disimpan</li>
              <li><strong>Data Analitik</strong> — riwayat penggunaan platform</li>
              <li><strong>Data Komunikasi</strong> — pesan, notifikasi, dan log dukungan</li>
            </ul>
          </section>

          {/* 2. Hak Penghapusan */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold">2. Hak Penghapusan Anda</h2>
            <p className="text-muted-foreground">
              Anda memiliki hak untuk meminta penghapusan data pribadi Anda kapan saja. Hak ini juga dikenal sebagai "hak untuk dilupakan" (right to be forgotten).
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-border p-4">
                <h3 className="font-medium">Penghapusan Sebagian</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Anda dapat meminta penghapusan data tertentu tanpa menghapus seluruh akun.
                </p>
              </div>
              <div className="rounded-lg border border-border p-4">
                <h3 className="font-medium">Penghapusan Total</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Anda dapat meminta penghapusan seluruh data pribadi dan penutupan akun secara permanen.
                </p>
              </div>
            </div>
          </section>

          {/* 3. Cara Meminta */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold">3. Cara Meminta Penghapusan Data</h2>
            <p className="text-muted-foreground">
              Anda dapat meminta penghapusan data melalui beberapa cara:
            </p>
            <ol className="list-decimal space-y-2 pl-6 text-muted-foreground">
              <li><strong>Panel Pengaturan Akun</strong> — Buka <code>Settings → Account → Delete Data</code></li>
              <li><strong>Email</strong> — Kirim permintaan ke <a href="mailto:privacy@sahabatkreator.id" className="text-primary hover:underline">privacy@sahabatkreator.id</a></li>
              <li><strong>Live Chat</strong> — Hubungi tim dukungan melalui chat di platform</li>
              <li><strong>Formulir Online</strong> — Isi formulir penghapusan data di halaman support</li>
            </ol>
          </section>

          {/* 4. Proses Penghapusan */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              4. Proses dan Waktu Penghapusan
            </h2>
            <p className="text-muted-foreground">
              Setelah menerima permintaan penghapusan data, kami akan:
            </p>
            <div className="mt-4 space-y-3">
              <div className="flex items-start gap-3 rounded-lg border border-border p-4">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">1</span>
                <div>
                  <p className="font-medium">Verifikasi Identitas (1-2 hari kerja)</p>
                  <p className="text-sm text-muted-foreground">Kami akan memverifikasi identitas Anda untuk keamanan.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-border p-4">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">2</span>
                <div>
                  <p className="font-medium">Proses Penghapusan (7-30 hari kerja)</p>
                  <p className="text-sm text-muted-foreground">Data akan dihapus dari sistem aktif dan sistem backup.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-border p-4">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">3</span>
                <div>
                  <p className="font-medium">Konfirmasi Penghapusan</p>
                  <p className="text-sm text-muted-foreground">Anda akan menerima email konfirmasi setelah penghapusan selesai.</p>
                </div>
              </div>
            </div>
          </section>

          {/* 5. Data yang Tidak Dihapus */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              5. Data yang Tidak Dapat Dihapus
            </h2>
            <p className="text-muted-foreground">
              Beberapa data mungkin tidak dapat dihapus sepenuhnya karena persyaratan hukum atau operasional:
            </p>
            <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
              <li><strong>Data Transaksi</strong> — Rekam jejak pembayaran yang wajib disimpan sesuai ketentuan perpajakan (maksimal 5 tahun)</li>
              <li><strong>Data Keamanan</strong> — Log keamanan dan audit trail untuk investigasi penyalahgunaan</li>
              <li><strong>Data Hukum</strong> — Informasi yang diperlukan untuk penyelesaian sengketa atau kepatuhan hukum</li>
              <li><strong>Data Anonim</strong> — Data yang telah dianonimkan dan tidak dapat dikaitkan kembali</li>
            </ul>
          </section>

          {/* 6. Dampak Penghapusan */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold">6. Dampak Penghapusan Data</h2>
            <p className="text-muted-foreground">
              Harap diperhatikan bahwa penghapusan data akan mengakibatkan:
            </p>
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-900/20 p-4">
              <ul className="list-disc space-y-1 pl-6 text-sm text-red-700 dark:text-red-300">
                <li>Akun Anda akan dinonaktifkan dan tidak dapat dipulihkan</li>
                <li>Semua konten, draft, dan template akan dihapus permanen</li>
                <li>Histori penggunaan dan analisis akan hilang</li>
                <li>Akses ke fitur berbayar akan berakhir</li>
              </ul>
            </div>
          </section>

          {/* 7. Retensi Data */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold">7. Kebijakan Retensi Data</h2>
            <p className="text-muted-foreground">
              Kami menyimpan data sesuai dengan kebutuhan operasional dan kewajiban hukum:
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-2 text-left">Jenis Data</th>
                    <th className="px-4 py-2 text-left">Periode Retensi</th>
                    <th className="px-4 py-2 text-left">Dasar Hukum</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border">
                    <td className="px-4 py-2">Data Akun</td>
                    <td className="px-4 py-2">Sesuai permintaan pengguna</td>
                    <td className="px-4 py-2">Konsen pengguna</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="px-4 py-2">Data Transaksi</td>
                    <td className="px-4 py-2">5 tahun</td>
                    <td className="px-4 py-2">Kewajiban perpajakan</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="px-4 py-2">Log Keamanan</td>
                    <td className="px-4 py-2">2 tahun</td>
                    <td className="px-4 py-2">Keamanan sistem</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2">Data Analitik</td>
                    <td className="px-4 py-2">12 bulan</td>
                    <td className="px-4 py-2">Peningkatan layanan</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 8. Hak Hukum */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold">8. Hak Hukum Anda</h2>
            <p className="text-muted-foreground">
              Selain hak penghapusan, Anda juga memiliki hak-hak berikut sesuai dengan peraturan perlindungan data:
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-border p-4">
                <h3 className="font-medium">Hak Akses</h3>
                <p className="mt-1 text-sm text-muted-foreground">Meminta salinan data pribadi yang kami simpan</p>
              </div>
              <div className="rounded-lg border border-border p-4">
                <h3 className="font-medium">Hak Koreksi</h3>
                <p className="mt-1 text-sm text-muted-foreground">Memperbaiki data yang tidak akurat</p>
              </div>
              <div className="rounded-lg border border-border p-4">
                <h3 className="font-medium">Hak Portabilitas</h3>
                <p className="mt-1 text-sm text-muted-foreground">Menerima data dalam format yang dapat dipindahkan</p>
              </div>
              <div className="rounded-lg border border-border p-4">
                <h3 className="font-medium">Hak Keberatan</h3>
                <p className="mt-1 text-sm text-muted-foreground">Menolak pemrosesan data untuk tujuan tertentu</p>
              </div>
            </div>
          </section>

          {/* 9. Kontak */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold">9. Kontak Data Protection</h2>
            <p className="text-muted-foreground">
              Jika Anda memiliki pertanyaan mengenai penghapusan data atau ingin mengajukan permintaan, silakan hubungi Data Protection Officer kami:
            </p>
            <div className="mt-4 space-y-2">
              <p className="text-muted-foreground">📧 Email: <a href="mailto:privacy@sahabatkreator.id" className="text-primary hover:underline">privacy@sahabatkreator.id</a></p>
              <p className="text-muted-foreground">📞 Telepon: +62 812-3456-7890</p>
              <p className="text-muted-foreground">📍 Alamat: Jl. Sudirman No. 123, Jakarta, Indonesia</p>
            </div>
          </section>

          {/* 10. Perubahan Kebijakan */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold">10. Perubahan Kebijakan</h2>
            <p className="text-muted-foreground">
              Kami dapat memperbarui kebijakan penghapusan data ini sewaktu-waktu. Perubahan material akan diinformasikan melalui email atau notifikasi di platform minimal 30 hari sebelum berlaku.
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-12">
        <div className="container mx-auto px-4">
          <div className="text-center text-sm text-muted-foreground">
            <p>© {new Date().getFullYear()} Sahabat Kreator. All rights reserved.</p>
            <div className="mt-2 flex justify-center gap-4">
              <Link href="/syarat-ketentuan" className="hover:text-foreground">Syarat & Ketentuan</Link>
              <Link href="/kebijakan-privasi" className="hover:text-foreground">Kebijakan Privasi</Link>
              <Link href="/penghapusan-data" className="hover:text-foreground">Penghapusan Data</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
