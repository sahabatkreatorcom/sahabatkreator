import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { loadRootEnv } from "@sahabat-kreator/env/load";
import { db, schema } from "../index";

loadRootEnv();

const SLUG = "jadwal-post-instagram-otomatis";

const TAGS = [
  { name: "Instagram", slug: "instagram", color: "#E4405F" },
  { name: "Social Media", slug: "social-media", color: "#D4A574" },
  { name: "Content Planner", slug: "content-planner", color: "#4285F4" },
  { name: "Digital Marketing", slug: "digital-marketing", color: "#0A66C2" },
];

const TITLE =
  "Cara Menjadwalkan Post Instagram Otomatis: Panduan Lengkap untuk Konten Kreator";

const EXCERPT =
  "Jadwalkan post Instagram otomatis dan kelola semua akun sosial media dari satu dashboard. Simak panduan lengkap tools content planner, best practice jam posting, dan strategi kalender konten agar engagement naik.";

const CONTENT = `Bagi konten kreator dan tim marketing, konsistensi posting adalah setengah dari kemenangan di media sosial. Namun mengisi kalender konten setiap hari sambil harus hadir di Instagram, TikTok, Facebook, Threads, LinkedIn, dan YouTube sekaligus bisa membuat siapa pun kewalahan. Solusinya satu: menjadwalkan post secara otomatis menggunakan content planner yang terpusat.

Artikel ini membahas langkah demi langkah cara menjadwalkan post Instagram otomatis, memilih tools yang tepat, menentukan jam posting terbaik, dan menyusun strategi kalender konten yang realistis. Semua tips di sini bisa langsung diterapkan, baik untuk personal brand, bisnis kecil, maupun agensi yang mengelola banyak akun klien.

Mengapa konsistensi lebih penting daripada kesempurnaan? Algoritma Instagram memberi bobot besar pada interaksi yang terjadi segera setelah konten tayang. Ketika Anda membanjiri feed dengan dua puluh posting dalam satu hari lalu diam seminggu, performa akun cenderung lebih rendah dibandingkan akun yang rutin mengunggah empat sampai lima konten per minggu. Konsistensi membantu algoritma mempelajari audiens Anda dan memprediksi siapa yang paling mungkin merespons.

Langkah pertama yang harus dilakukan adalah membuat kalender konten minimal satu minggu ke depan. Tidak perlu langsung sebulan. Mulailah dengan menentukan tema tiap hari, misalnya Senin untuk edukasi, Rabu untuk proses di balik layar, dan Jumat untuk konten interaktif. Dengan tema yang jelas, ide konten mengalir lebih mudah dan pesan yang ingin disampaikan tetap konsisten.

Setelah tema tersusun, pindahkan kalender itu ke tools content planner. Berbagai platform social media management memungkinkan Anda menulis caption, mengunggah media, memilih akun tujuan, lalu menentukan tanggal dan jam tayang dalam hitungan menit. Kapasitas fitur ini biasanya dibedakan berdasarkan paket: akun gratis untuk jumlah akun dan posting terbatas, sedangkan paket berbayar membuka jadwal tak terbatas, anggota tim, hingga analitik.

Saat memilih tools, perhatikan tiga hal: platform yang didukung, kemudahan drag-and-drop di kalender, dan fitur preview sebelum tayang. Pastikan tools yang dipilih mendukung Instagram feed dan Reels karena keduanya membutuhkan format media berbeda. Jangan lupa cek apakah tools tersebut juga terhubung ke platform lain yang Anda kelola agar tidak perlu membuka banyak aplikasi.

Kapan waktu terbaik untuk posting? Jawaban singkatnya, uji sendiri data Anda. Secara umum, banyak studi menunjukkan pukul sembilan pagi sampai sebelas siang dan pukul tujuh sampai sembilan malam adalah jam-jam puncak untuk brand lifestyle dan edukasi. Namun waktu terbaik sejatinya bergantung pada kapan audiens Anda paling aktif. Manfaatkan fitur insights Instagram untuk melihat pola aktivitas pengikut lalu sesuaikan jadwal Anda.

Perangkap yang paling sering menjatuhkan kreator adalah menyusun jadwal terlalu ambisius lalu menyerah di minggu kedua. Mulailah dengan dua sampai tiga posting per minggu dan naikkan bertahap. Jadwal yang realistis yang bisa Anda pertahankan jauh lebih berharga daripada jadwal ideal yang hanya bertahan seminggu.

Caption berkualitas tetap membutuhkan perhatian manusia. Penjadwalan otomatis menghemat waktu untuk distribusi, bukan menggantikan riset, penulisan, dan interaksi. Alokasikan waktu khusus setiap minggu untuk membalas komentar dan direct message. Interaksi dua arah inilah yang menjaga akun tetap hidup dan mendorong algoritma memberi jangkauan lebih luas.

Menjadwalkan post Instagram otomatis juga membantu Anda memisahkan waktu produksi dari waktu distribusi. Anda bisa menulis semua konten untuk seminggu dalam satu sesi kreatif, meninjau ulang tanpa tergesa, lalu membiarkan sistem mengunggah tepat waktu. Hasilnya, kualitas konten meningkat dan stres harian berkurang.

Terakhir, pantau hasilnya. Perhatikan posting mana yang mendapat jangkauan dan engagement tertinggi, catat polanya, lalu sesuaikan kalender konten bulan berikutnya. Strategi media sosial adalah proses iteratif; apa yang berhasil bulan ini belum tentu berhasil bulan depan. Dengan kombinasi penjadwalan otomatis dan evaluasi rutin, pertumbuhan akun menjadi lebih terukur dan berkelanjutan.`;

async function main() {
  // Cari author: prefer admin terbaru, fallback user terbaru.
  const author = await db.query.user.findFirst({
    where: (t, { eq: _eq }) => _eq(t.role, "admin"),
    orderBy: (t, { desc: _desc }) => [_desc(t.createdAt)],
    columns: { id: true, name: true, email: true },
  }).catch(() => null);

  const fallbackAuthor = await db.query.user.findFirst({
    orderBy: (t, { desc: _desc }) => [_desc(t.createdAt)],
    columns: { id: true, name: true, email: true },
  }).catch(() => null);

  const usedAuthor = author ?? fallbackAuthor;
  if (!usedAuthor) {
    console.error("Tidak ada user di database. Buat user admin dulu sebelum menjalankan seed blog.");
    process.exit(1);
  }

  const existing = await db.query.blogPost.findFirst({
    where: (t, { eq: _eq }) => _eq(t.slug, SLUG),
    columns: { id: true },
  }).catch(() => null);

  const now = new Date();
  let postId: string;

  if (existing) {
    await db
      .update(schema.blogPost)
      .set({
        title: TITLE,
        excerpt: EXCERPT,
        content: CONTENT,
        status: "PUBLISHED",
        publishedAt: now,
        updatedAt: now,
      })
      .where(eq(schema.blogPost.id, existing.id));
    postId = existing.id;
    console.log(`Update post yang sudah ada: ${existing.id}`);
  } else {
    postId = randomUUID();
    await db.insert(schema.blogPost).values({
      id: postId,
      slug: SLUG,
      title: TITLE,
      excerpt: EXCERPT,
      content: CONTENT,
      status: "PUBLISHED",
      authorId: usedAuthor.id,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    console.log(`Insert post baru: ${postId}`);
  }

  // Tags + relasi.
  for (const tag of TAGS) {
    const existingTag = await db.query.blogTag.findFirst({
      where: (t, { eq: _eq }) => _eq(t.slug, tag.slug),
      columns: { id: true },
    }).catch(() => null);

    let tagId = existingTag?.id;
    if (!tagId) {
      tagId = randomUUID();
      await db.insert(schema.blogTag).values({ id: tagId, ...tag, createdAt: now });
      console.log(`Insert tag: ${tag.name}`);
    }

    await db.insert(schema.blogPostTag).values({ postId, tagId }).onConflictDoNothing();
  }

  const count = await db
    .select({ id: schema.blogPostTag.postId })
    .from(schema.blogPostTag)
    .where(eq(schema.blogPostTag.postId, postId));

  console.log(`Selesai. Post ${postId} (${TAGS.length} tags, ${count.length} relasi).`);
  console.log(`URL: /blog/${SLUG}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed blog gagal:", err);
  process.exit(1);
});