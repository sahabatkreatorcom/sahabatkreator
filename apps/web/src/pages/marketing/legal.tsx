// Halaman Legal — Syarat & Ketentuan, Kebijakan Privasi, dll.
import { Link, Navigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useSeo } from "@/lib/seo";

const DOCS: Record<
  string,
  {
    title: string;
    description: string;
    sections: { heading: string; body: string[] }[];
    related?: string[];
  }
> = {
  "syarat-ketentuan": {
    title: "Syarat & Ketentuan",
    description:
      "Syarat dan ketentuan penggunaan layanan Sahabat Kreator. Baca dengan saksama sebelum menggunakan layanan kami.",
    related: ["kebijakan-privasi", "kebijakan-refund"],
    sections: [
      {
        heading: "1. Penerimaan Ketentuan",
        body: [
          "Dengan mendaftar dan menggunakan Sahabat Kreator, Anda menyetujui untuk terikat pada Syarat & Ketentuan ini. Jika Anda tidak menyetujui salah satu bagian, mohon untuk tidak menggunakan layanan kami.",
        ],
      },
      {
        heading: "2. Akun & Tanggung Jawab",
        body: [
          "Anda bertanggung jawab penuh atas kerahasiaan kredensial akun Anda dan seluruh aktivitas yang terjadi di bawah akun Anda. Segera laporkan ke kami jika ada penggunaan yang tidak sah.",
          "Anda wajib memberikan informasi yang akurat dan terbaru saat mendaftar.",
        ],
      },
      {
        heading: "3. Penggunaan yang Dilarang",
        body: [
          "Menggunakan layanan untuk aktivitas yang melanggar hukum, spam, penipuan, atau manipulasi engagement.",
          "Mengakses akun social media pihak lain tanpa izin.",
          "Mencoba merusak, mengganggu, atau menguji keamanan sistem tanpa otorisasi tertulis dari kami.",
        ],
      },
      {
        heading: "4. Langganan & Pembayaran",
        body: [
          "Layanan berbayar ditagih di muka sesuai paket yang dipilih. Pembayaran diproses melalui payment gateway resmi kami.",
          "Anda dapat berhenti berlangganan kapan saja. Akses premium berlaku sampai akhir periode tagihan yang sudah dibayar.",
          "Ketentuan pengembalian dana diatur dalam Kebijakan Refund terpisah.",
        ],
      },
      {
        heading: "5. Batasan Layanan",
        body: [
          "Sahabat Kreator adalah alat bantu manajemen. Kami tidak menjamin pertumbuhan followers, engagement, atau hasil bisnis tertentu.",
          "Ketersediaan fitur tiap platform bergantung pada kebijakan API masing-masing platform social media.",
        ],
      },
      {
        heading: "6. Perubahan Ketentuan",
        body: [
          "Kami dapat memperbarui Syarat & Ketentuan ini dari waktu ke waktu. Perubahan signifikan akan kami informasikan melalui email atau notifikasi dalam aplikasi.",
        ],
      },
    ],
  },
  "kebijakan-privasi": {
    title: "Kebijakan Privasi",
    description:
      "Kebijakan privasi Sahabat Kreator — bagaimana kami mengumpulkan, menggunakan, dan melindungi data Anda.",
    related: ["kebijakan-cookie", "penghapusan-data"],
    sections: [
      {
        heading: "1. Data yang Kami Kumpulkan",
        body: [
          "Data akun: nama, email, foto profil.",
          "Data social media: token akses platform yang Anda hubungkan, dienkripsi dengan AES-256 sebelum disimpan.",
          "Data penggunaan: konten yang Anda buat, jadwal posting, dan statistik performa.",
          "Data konten platform (atas nama pemilik akun yang terhubung): metadata unggahan (ID, caption, jenis media, URL), statistik performa (reach, impressions, engagement), dan profil akun publik (username, nama, avatar, jumlah followers).",
          "Data interaksi audiens (end-user platform): komentar, mention, review, dan pesan langsung yang dikirim ke akun Anda — termasuk ID penulis, username, nama tampilan, avatar, isi pesan/komentar, dan waktu kejadian. Data ini kami simpan agar tim Anda dapat membalas dari satu inbox terpusat.",
          "Data demografis agregat audiens (dari fitur insights platform): rentang usia, gender, dan lokasi negara/kota — hanya tersedia dalam bentuk agregat per platform, bukan data per individu.",
          "Platform social media yang terhubung: Kami mengintegrasikan dengan berbagai platform berikut: (a) Meta (Facebook, Instagram, Threads) melalui Graph API; (b) TikTok melalui Content Posting API; (c) YouTube melalui Data API v3; (d) LinkedIn melalui Posts API; (e) Pinterest melalui API v5; (f) Bluesky melalui AT Protocol; dan (g) Google Business Profile melalui Local Posts API. Data yang dikumpulkan dari setiap platform meliputi token akses, profil akun publik, metadata konten, statistik performa, serta komentar dan pesan langsung yang ditujukan ke akun Anda.",
        ],
      },
      {
        heading: "2. Bagaimana Kami Menggunakan Data",
        body: [
          "Menjalankan layanan inti: penjadwalan posting, pengambilan analitik, dan inbox engagement.",
          "Mengirim email transaksional (verifikasi, reset password, undangan tim).",
          "Meningkatkan kualitas layanan melalui analitik penggunaan agregat (anonim).",
        ],
      },
      {
        heading: "3. Penyimpanan & Keamanan",
        body: [
          "Data disimpan di pusat data yang aman dengan enkripsi in-transit (TLS) dan at-rest.",
          "Token social media dienkripsi menggunakan AES-256-GCM dengan kunci yang tersimpan terpisah.",
          "Kami menerapkan prinsip least-privilege untuk seluruh akses internal.",
        ],
      },
      {
        heading: "4. Berbagi Data dengan Pihak Ketiga",
        body: [
          "Kami tidak menjual data Anda. Data hanya dibagikan kepada pihak ketiga berikut sebatas yang dibutuhkan untuk menjalankan layanan: Cloudflare (penyimpanan file media dan CDN), Resend (pengiriman email transaksional), Sumopod (pemrosesan pembayaran langganan), serta platform social media yang Anda hubungkan — Meta, TikTok, YouTube, LinkedIn, Pinterest, Bluesky, dan Google Business Profile — untuk menjalankan fitur penjadwalan posting, analitik, dan inbox engagement atas nama akun Anda.",
          "Kami dapat mengungkap data jika diwajibkan oleh hukum.",
        ],
      },
      {
        heading: "5. Hak Anda",
        body: [
          "Anda berhak mengakses, memperbaiki, dan menghapus data pribadi Anda. Fitur hapus akun tersedia di halaman pengaturan.",
          "Anda dapat menghubungi kami untuk permintaan ekspor data.",
          "Untuk permintaan penghapusan data secara menyeluruh, lihat halaman Penghapusan Data.",
          "Anda pengguna (end-user) platform social media yang datanya tersimpan karena berinteraksi dengan akun pelanggan kami (misalnya Anda berkomentar atau mengirim pesan langsung): Anda berhak meminta penghapusan data Anda melalui pengaturan akun di platform masing-masing (Instagram: Settings → Apps and Websites; Facebook: Settings → Apps and Websites; Threads: Settings → Account → Apps and Websites). Permintaan Anda diteruskan otomatis ke kami dan diproses seketika. Atau hubungi kami langsung di privasi@sahabatkreator.com.",
          "Kami juga menyediakan callback endpoint untuk penghapusan data end-user sesuai protokol Meta (Facebook, Instagram, Threads). Setelah diproses, Anda akan menerima kode konfirmasi yang dapat digunakan untuk memeriksa status penghapusan di halaman Penghapusan Data.",
        ],
      },
      {
        heading: "6. Retensi Data",
        body: [
          "Data akun disimpan selama akun Anda aktif. Setelah akun dihapus, data pribadi dihapus permanen seketika (lihat halaman Penghapusan Data), kecuali data yang wajib disimpan menurut hukum (misal catatan transaksi keuangan).",
          "Retensi data per platform social media: Meta (Facebook/Instagram/Threads) — token akses disimpan selama akun aktif, data engagement (komentar, pesan) dihapus dalam 30 hari setelah permintaan penghapusan; TikTok — access token berlaku 24 jam, refresh token berlaku 365 hari, metadata konten disimpan selama akun aktif; YouTube — token disimpan selama akun aktif, metadata video upload tidak disimpan secara permanen di server kami karena langsung diunggah ke YouTube; LinkedIn — token berlaku 60 hari, data company page disimpan selama akun aktif; Pinterest — access token berlaku 30 hari, refresh token berlaku 60 hari (rotating), data board dan pin disimpan selama akun aktif; Bluesky — session disimpan selama akun aktif; Google Business Profile — token disimpan selama akun aktif, data local post disimpan selama akun aktif.",
          "Konten yang sudah tayang di platform social media tidak terpengaruh penghapusan akun Sahabat Kreator — pengelolaannya kembali ke platform masing-masing.",
        ],
      },
      {
        heading: "7. Kontak Petugas Perlindungan Data",
        body: [
          "Data Protection Officer (Petugas Perlindungan Data Pribadi): privasi@sahabatkreator.com",
          "Untuk pertanyaan seputar privasi, hak data pribadi, atau permintaan terkait data Anda, kirim email ke privasi@sahabatkreator.com. Kami menanggapi dalam maksimal 7 hari kerja.",
        ],
      },
    ],
  },
  "kebijakan-cookie": {
    title: "Kebijakan Cookie",
    description:
      "Bagaimana Sahabat Kreator menggunakan cookie dan teknologi pelacakan serupa untuk menjalankan layanan.",
    related: ["kebijakan-privasi"],
    sections: [
      {
        heading: "1. Apa itu Cookie",
        body: [
          "Cookie adalah berkas teks kecil yang disimpan di perangkat Anda saat mengunjungi situs. Cookie membantu situs mengingat preferensi dan menjaga sesi Anda tetap aktif.",
        ],
      },
      {
        heading: "2. Cookie yang Kami Gunakan",
        body: [
          "Cookie esensial: menjaga sesi login dan keamanan (misal sesi autentikasi, token CSRF). Tanpa cookie ini, fitur login tidak dapat berfungsi.",
          "Cookie preferensi: mengingat pilihan Anda seperti tema terang/gelap dan organisasi aktif.",
          "Kami tidak menggunakan cookie iklan pihak ketiga untuk melacak Anda di situs lain.",
        ],
      },
      {
        heading: "3. Penyimpanan Lokal (localStorage)",
        body: [
          "Selain cookie, kami menggunakan localStorage untuk menyimpan preferensi tampilan (tema) dan cache data aplikasi agar lebih cepat. Data ini tidak dikirim ke server.",
        ],
      },
      {
        heading: "4. Mengelola Cookie",
        body: [
          "Anda dapat menghapus atau memblokir cookie melalui pengaturan browser Anda. Perlu diketahui, memblokir cookie esensial dapat membuat Anda tidak dapat masuk ke aplikasi.",
        ],
      },
    ],
  },
  "penghapusan-data": {
    title: "Penghapusan Data",
    description:
      "Cara menghapus akun dan data pribadi Anda dari Sahabat Kreator — sesuai hak Anda atas data pribadi.",
    related: ["kebijakan-privasi"],
    sections: [
      {
        heading: "1. Menghapus Akun Mandiri",
        body: [
          "Anda dapat menghapus akun sendiri kapan saja melalui menu Pengaturan → Akun → Hapus Akun. Konfirmasi dengan kata sandi Anda, lalu seluruh data pribadi akan dijadwalkan untuk dihapus permanen.",
        ],
      },
      {
        heading: "2. Apa yang Dihapus",
        body: [
          "Data akun (nama, email, foto profil), jadwal posting yang belum tayang, draf konten, media yang diunggah, token koneksi social media, dan langganan aktif.",
          "Data organisasi yang Anda miliki akan dihapus; jika ada anggota lain, organisasi dialihkan atau dihapus sesuai konfirmasi Anda.",
        ],
      },
      {
        heading: "3. Apa yang Tidak Dihapus",
        body: [
          "Konten yang sudah tayang di platform social media — pengelolaannya kembali ke platform masing-masing.",
          "Catatan transaksi keuangan yang wajib disimpan menurut peraturan perpajakan Indonesia (maksimal 10 tahun).",
          "Log keamanan agregat yang sudah dianonimkan.",
        ],
      },
      {
        heading: "4. Penghapusan Langsung",
        body: [
          "Penghapusan bersifat permanen dan dijalankan seketika setelah Anda menyelesaikan konfirmasi dua langkah (mengetik kata HAPUS). Pastikan Anda sudah mengekspor data terlebih dahulu — setelah akun terhapus, data tidak dapat dikembalikan.",
          "Sebagai pengaman, konfirmasi hanya berlaku dari sesi login aktif Anda sendiri di halaman pengaturan akun.",
        ],
      },
      {
        heading: "5. Permintaan Manual",
        body: [
          'Jika akun Anda tidak dapat diakses, kirim permintaan penghapusan dari email terdaftar ke privasi@sahabatkreator.com dengan subjek "Permintaan Penghapusan Data". Kami memverifikasi kepemilikan sebelum memproses (maksimal 14 hari kerja).',
        ],
      },
      {
        heading: "6. Untuk Pengguna Platform (Bukan Pelanggan Kami)",
        body: [
          "Jika Anda pernah berkomentar, mereview, atau mengirim pesan langsung ke akun milik pelanggan kami, sebagian data Anda (ID akun platform, username, nama tampilan, avatar, isi komentar/pesan, dan waktunya) dapat tersimpan di sistem kami untuk keperluan inbox manajemen pelanggan tersebut.",
          "Cara menghapus data Anda: buka pengaturan akun di platform masing-masing (Instagram/Facebook: Settings → Apps and Websites; Threads: Settings → Account → Apps and Websites), temukan aplikasi Sahabat Kreator, lalu pilih Remove/Hapus Data. Permintaan diteruskan otomatis ke sistem kami dan diproses seketika — semua komentar, pesan, dan percakapan Anda akan dihapus permanen.",
          "Setelah diproses, Anda menerima kode konfirmasi dan tautan status yang dapat Anda simpan sebagai bukti. Anda juga dapat menghubungi privasi@sahabatkreator.com kapan saja.",
          "Catatan: konten yang sudah tayang di platform (komentar yang terlihat publik, dsb.) tetap dikelola oleh platform masing-masing — penghapusan di sini hanya berlaku untuk salinan data di sistem kami.",
        ],
      },
    ],
  },
  "privacy-policy": {
    title: "Privacy Policy",
    description: "Sahabat Kreator Privacy Policy — how we collect, use, and protect your data.",
    sections: [
      {
        heading: "1. Data We Collect",
        body: [
          "Account data: name, email, profile picture.",
          "Social media data: platform access tokens, encrypted with AES-256 before storage.",
          "Usage data: content you create, post schedules, and performance statistics.",
          "Platform content data (on behalf of the connected account owner): upload metadata (ID, caption, media type, URL), performance statistics (reach, impressions, engagement), and public account profile (username, name, avatar, follower count).",
          "Audience interaction data (platform end-users): comments, mentions, reviews, and direct messages sent to your account — including author ID, username, display name, avatar, message/comment content, and timestamp. We store this so your team can reply from a single unified inbox.",
          "Aggregate audience demographics (from platform insights features): age range, gender, and country/city location — available only in aggregate per platform, not per individual.",
          "Connected social media platforms: We integrate with the following platforms: (a) Meta (Facebook, Instagram, Threads) via Graph API; (b) TikTok via Content Posting API; (c) YouTube via Data API v3; (d) LinkedIn via Posts API; (e) Pinterest via API v5; (f) Bluesky via AT Protocol; and (g) Google Business Profile via Local Posts API. Data collected from each platform includes access tokens, public account profile, content metadata, performance statistics, as well as comments and direct messages directed to your account.",
        ],
      },
      {
        heading: "2. How We Use Data",
        body: [
          "To operate core services: post scheduling, analytics retrieval, and engagement inbox.",
          "To send transactional emails (verification, password reset, team invitations).",
          "To improve service quality through aggregate usage analytics (anonymized).",
        ],
      },
      {
        heading: "3. Storage & Security",
        body: [
          "Data is stored in secure data centers with encryption in-transit (TLS) and at-rest.",
          "Social media tokens are encrypted using AES-256-GCM with keys stored separately.",
          "We enforce least-privilege access for all internal operations.",
        ],
      },
      {
        heading: "4. Third-Party Sharing",
        body: [
          "We do not sell your data. Data is shared with the following third parties only as needed to operate the service: Cloudflare (media file storage and CDN), Resend (transactional email delivery), Sumopod (subscription payment processing), and the social media platforms you connect — Meta, TikTok, YouTube, LinkedIn, Pinterest, Bluesky, and Google Business Profile — to operate post scheduling, analytics, and engagement inbox features on behalf of your account.",
          "We may disclose data if required by law.",
        ],
      },
      {
        heading: "5. Your Rights",
        body: [
          "You have the right to access, correct, and delete your personal data. The account deletion feature is available in the Settings page.",
          "You may contact us for a data export request.",
          "For comprehensive data deletion, see the Data Deletion page.",
          "If you are an end-user of a social media platform whose data is stored because you interacted with one of our customer's accounts (e.g., you commented or sent a direct message): you have the right to request deletion of your data through your account settings on the respective platform (Instagram: Settings → Apps and Websites; Facebook: Settings → Apps and Websites; Threads: Settings → Account → Apps and Websites). Your request is forwarded to us automatically and processed immediately. You may also contact us directly at privasi@sahabatkreator.com.",
          "We also provide a callback endpoint for end-user data deletion in accordance with the Meta protocol (Facebook, Instagram, Threads). After processing, you will receive a confirmation code that can be used to check deletion status on the Data Deletion page.",
        ],
      },
      {
        heading: "6. Data Retention",
        body: [
          "Account data is retained while your account is active. After account deletion, personal data is permanently deleted immediately (see the Data Deletion page), except data required to be retained by law (e.g., financial transaction records).",
          "Social media platform data retention: Meta (Facebook/Instagram/Threads) — access tokens stored while account is active, engagement data (comments, messages) deleted within 30 days of deletion request; TikTok — access token valid for 24 hours, refresh token valid for 365 days, content metadata stored while account is active; YouTube — tokens stored while account is active, uploaded video metadata is not permanently stored on our servers as it is uploaded directly to YouTube; LinkedIn — token valid for 60 days, company page data stored while account is active; Pinterest — access token valid for 30 days, refresh token valid for 60 days (rotating), board and pin data stored while account is active; Bluesky — session stored while account is active; Google Business Profile — token stored while account is active, local post data stored while account is active.",
          "Content already published on social media platforms is not affected by Sahabat Kreator account deletion — its management reverts to the respective platform.",
        ],
      },
      {
        heading: "7. Data Protection Officer Contact",
        body: [
          "Data Protection Officer: privasi@sahabatkreator.com",
          "For questions about privacy, personal data rights, or requests related to your data, email privasi@sahabatkreator.com. We respond within 7 business days.",
        ],
      },
    ],
  },
  "terms-of-service": {
    title: "Terms of Service",
    description: "Sahabat Kreator Terms of Service — terms governing your use of our platform.",
    sections: [
      {
        heading: "1. Acceptance of Terms",
        body: [
          "By registering and using Sahabat Kreator, you agree to be bound by these Terms of Service. If you do not agree with any part, please do not use our service.",
        ],
      },
      {
        heading: "2. Accounts & Responsibilities",
        body: [
          "You are responsible for maintaining the confidentiality of your account credentials and all activity under your account. Report any unauthorized use immediately.",
          "You must provide accurate and current information during registration.",
        ],
      },
      {
        heading: "3. Prohibited Use",
        body: [
          "Using the service for illegal activities, spam, fraud, or engagement manipulation.",
          "Accessing other users' social media accounts without permission.",
          "Attempting to damage, disrupt, or test system security without written authorization from us.",
        ],
      },
      {
        heading: "4. Subscriptions & Billing",
        body: [
          "Paid services are billed in advance according to your selected plan. Payments are processed through our official payment gateway.",
          "You may cancel your subscription at any time. Premium access remains until the end of the paid billing period.",
          "Refund terms are governed by the separate Refund Policy.",
        ],
      },
      {
        heading: "5. Service Limitations",
        body: [
          "Sahabat Kreator is a management tool. We do not guarantee follower growth, engagement, or specific business results.",
          "Feature availability per platform depends on each social media platform's API policies.",
        ],
      },
      {
        heading: "6. Changes to Terms",
        body: [
          "We may update these Terms of Service from time to time. Significant changes will be communicated via email or in-app notification.",
        ],
      },
    ],
  },
  "kebijakan-refund": {
    title: "Kebijakan Refund",
    description:
      "Ketentuan pengembalian dana langganan Sahabat Kreator — transparan dan adil untuk kedua pihak.",
    related: ["syarat-ketentuan"],
    sections: [
      {
        heading: "1. Garansi 7 Hari",
        body: [
          "Langganan berbayar pertama dapat direfund penuh dalam 7 hari sejak pembayaran, jika fitur inti (penjadwalan posting) tidak berfungsi normal dan tidak dapat kami perbaiki.",
        ],
      },
      {
        heading: "2. Refund Proporsional",
        body: [
          "Untuk paket tahunan, jika Anda berhenti di tengah periode karena kendala layanan dari pihak kami (downtime lebih dari 72 jam berturut-turut), kami mengembalikan sisa periode secara proporsional.",
        ],
      },
      {
        heading: "3. Yang Tidak Dapat Direfund",
        body: [
          "Penyalahgunaan garansi (refund berulang tanpa kendala nyata).",
          "Pemblokiran akun karena pelanggaran Syarat & Ketentuan.",
          "Keterbatasan fitur yang disebabkan kebijakan pihak ketiga (platform social media menarik akses API), karena berada di luar kendali kami.",
        ],
      },
      {
        heading: "4. Cara Mengajukan",
        body: [
          "Kirim email ke billing@sahabatkreator.com dengan email akun terdaftar, nomor invoice, dan alasan refund. Kami menanggapi dalam 3 hari kerja.",
          "Dana dikembalikan melalui metode pembayaran asal dalam 5–14 hari kerja setelah disetujui, tergantung kebijakan payment gateway.",
        ],
      },
    ],
  },
};

/** Redirect path legal lama (/legal/:doc, /ketentuan/:doc) → path sederhana baru */
export function LegalRedirect() {
  const { doc } = useParams<{ doc: string }>();
  return <Navigate to={`/${doc ?? ""}`} replace />;
}

type LegalPageProps = {
  /** Key dokumen legal — di-inject dari route (/syarat-ketentuan, /kebijakan-privasi, dsb.) */
  doc?: string;
};

export function LegalPage({ doc: docProp }: LegalPageProps) {
  const params = useParams<{ doc: string }>();
  const doc = docProp ?? params.doc;
  const content = doc ? DOCS[doc] : undefined;

  useSeo({
    title: content?.title ?? "Dokumen Legal",
    description: content?.description,
    path: `/${doc}`,
    noIndex: false,
  });

  if (!content) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24">
        <EmptyState
          title="Dokumen tidak ditemukan"
          description="Dokumen legal yang Anda cari tidak tersedia."
          action={
            <Link to="/">
              <Button variant="outline">Kembali ke Beranda</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 md:py-16">
      <h1 className="font-bold text-3xl md:text-4xl">{content.title}</h1>
      <p className="mt-2 text-[var(--text-muted)] text-sm">
        Terakhir diperbarui: 13 September 2026
      </p>

      <div className="article-content mt-10 space-y-10">
        {content.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="mb-3 font-semibold text-xl">{section.heading}</h2>
            {section.body.map((paragraph, i) => (
              <p key={i} className="mb-3 text-[var(--text-secondary)]">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>

      {content.related && content.related.length > 0 && (
        <div className="mt-10 rounded-[var(--radius-lg)] border border-[var(--border-light)] bg-[var(--bg-tertiary)] p-5">
          <h2 className="mb-2 font-semibold text-sm">Dokumen Terkait</h2>
          <ul className="space-y-1 text-sm">
            {content.related.map((key) => {
              const related = DOCS[key];
              if (!related) return null;
              return (
                <li key={key}>
                  <Link to={`/${key}`} className="text-[var(--accent-gold)] underline">
                    {related.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-12 border-[var(--border-light)] border-t pt-6 text-[var(--text-muted)] text-sm">
        <p>
          Ada pertanyaan tentang dokumen ini?{" "}
          <Link to="/kontak" className="text-[var(--accent-gold)] underline">
            Hubungi kami
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
